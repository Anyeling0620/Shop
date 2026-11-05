package com.zhuawa.shop.goods.service;

import com.alibaba.fastjson.JSONObject;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.utils.IdWorker;
import com.zhuawa.shop.goods.cache.CacheKeys;
import com.zhuawa.shop.goods.cache.CacheManager;
import com.zhuawa.shop.goods.dao.BrandDao;
import com.zhuawa.shop.goods.dao.CategoryDao;
import com.zhuawa.shop.goods.dao.GoodsDao;
import com.zhuawa.shop.goods.dao.SpecsDao;
import com.zhuawa.shop.goods.model.Brand;
import com.zhuawa.shop.goods.model.Category;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.goods.model.Specs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tk.mybatis.mapper.entity.Example;

import javax.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class GoodsService {

    private static final Logger log = LoggerFactory.getLogger(GoodsService.class);

    /**
     * 负缓存（空值标记）。
     *
     * <p>商品 id 是雪花号，一旦查不到就基本可以断定是"脏 id / 爬虫探测"，
     * 但若每次都不缓存，每次请求都会打到 MySQL（缓存穿透）。
     * 因此把"查不到"这个结论也写进缓存，值为 {@link #NULL_MARKER}。</p>
     *
     * <p>安全性：雪花 id 不会被复用，所以这个标记不可能在"后来真的插入了一条同 id 商品"时变成脏数据；
     * 过期时间与正常商品一致，到期自然消失。</p>
     */
    private static final String NULL_MARKER = "__NULL__";

    /**
     * 批量查询时单次 IN 查询的 id 条数上限。
     *
     * <p>不能把几千个 id 一次性塞进 {@code IN (...)}：SQL 文本会超长（受
     * {@code max_allowed_packet} 限制）、MySQL 优化器对超大 IN 列表也可能放弃索引。
     * 500 是经验值——单条 SQL 长度可控，同时批次数不会太多。</p>
     */
    private static final int DB_BATCH_SIZE = 500;

    @Autowired
    GoodsDao goodsDao;

    @Autowired
    CategoryDao categoryDao;

    @Autowired
    BrandDao brandDao;

    @Autowired
    SpecsDao specsDao;

    @Autowired
    IdWorker idWorker;

    /**
     * 多级缓存入口。
     *
     * <p>刻意使用 {@code required = false}：缓存是"加速器"而不是"依赖"，
     * 即使缓存 Bean 因配置缺失（例如没配 redis）装配失败，商品服务也必须能正常启动并直连 MySQL，
     * 而不是让整个商品模块起不来。</p>
     */
    @Autowired(required = false)
    CacheManager cacheManager;

    /**
     * 与 CacheManager 内部同一套 Jackson 配置，用于把缓存里的 JSON 串还原成 Goods。
     *
     * <p>这里没有直接用 {@code cacheManager.get(key, Goods.class)}，
     * 是因为需要区分"缓存未命中"与"命中了空值标记/反序列化失败"：
     * typed get 会把两者都折叠成 null，那样负缓存就失效了。
     * 所以先取原始 JSON 做一次判定，只对真实数据做反序列化。
     * 每次读只调用一次 {@code cacheManager.get}，HeavyKeeper 计数不会被重复累加。</p>
     */
    @Autowired(required = false)
    ObjectMapper objectMapper;

    /**
     * 延迟双删的延迟毫秒数（可配置，缺省 500ms）。
     *
     * <p>用 {@code ${...:500}} 带默认值，即使 application.yml 里没有这一项也能正常启动。</p>
     */
    @Value("${zhuawa.cache.delayed-evict-ms:500}")
    long delayedEvictMs = 500L;

    /**
     * 延迟删除专用调度器（延迟双删）。
     *
     * <h3>为什么要延迟再删一次</h3>
     * <p>decrStock 的顺序是「先 UPDATE 数据库 → 再 evict 缓存」，而读路径是
     * 「先查数据库 → 再回写缓存」。两者交错时存在如下窗口：</p>
     * <pre>
     *   T1 读线程: SELECT 拿到旧值 stock=100
     *   T2 写线程: UPDATE stock=99 提交
     *   T3 写线程: evict（此时缓存里其实还没有旧值，删了个空）
     *   T4 读线程: 把 stock=100 写回 Redis（TTL 1800s）  ← 脏值最长存活 30 分钟
     * </pre>
     * <p>延迟一段时间后再删一次，就能把这个"迟到的回写"一并清掉。延迟需覆盖
     * 「一次读请求从 SELECT 到回写缓存」的最长耗时，500ms 对本地库足够宽裕。</p>
     *
     * <h3>为什么自己建 ScheduledThreadPoolExecutor 而不用 Spring 的 TaskScheduler</h3>
     * <ul>
     *   <li><b>不占用 @Scheduled 的调度线程</b>：CacheConfig 上的 {@code @EnableScheduling}
     *       默认只有一个线程，HeavyKeeper 的 fading 也在用它。若把延迟删除塞进同一个
     *       TaskScheduler，扣减高峰时排队会拖慢热点衰减。</li>
     *   <li><b>隔离故障</b>：即使本调度器被延迟任务占满，只影响"第二次删除"这一兜底动作，
     *       不会波及 fading 与主链路。</li>
     *   <li><b>有明确上界而不是无限排队</b>：核心线程=1，并用待执行计数做背压
     *       （上界 {@code DELAYED_EVICT_QUEUE_CAPACITY}）——延迟删除本来就是兜底，
     *       超限时放弃最坏退回"单次删除"，比把内存堆爆安全。</li>
     *   <li><b>线程是 daemon</b>：不阻止 JVM 退出，并由 {@link #shutdownDelayedEvict()} 在容器关闭时显式 shutdown。</li>
     * </ul>
     */
    private volatile ScheduledThreadPoolExecutor delayedEvictExecutor;

    private static final AtomicInteger DELAYED_EVICT_THREAD_SEQ = new AtomicInteger();

    /**
     * 待执行的延迟删除任务数。
     *
     * <p>用作背压阀：{@link ScheduledThreadPoolExecutor} 的队列是无界的，
     * 拒绝策略不会触发，必须自己数。超过 {@link #DELAYED_EVICT_QUEUE_CAPACITY}
     * 就放弃本次第二次删除。</p>
     */
    private final AtomicInteger pendingDelayedEvicts = new AtomicInteger();

    /** 延迟删除待执行任务数上限（背压阀值）。 */
    private static final int DELAYED_EVICT_QUEUE_CAPACITY = 10000;

    public List<Goods> genMockGoodsByName(String baseName, Long categoryId, Long brandId, Long stock, Long minPrice, Long maxPrice) {
        Category category = categoryDao.selectByPrimaryKey(categoryId);
        Brand brand = brandDao.selectByPrimaryKey(brandId);
        String img = "/img/HuaweiMateX2.jpeg"; // 临时就用一张图片， 在真正的项目里会用到云存储工具，比如 阿里云的OSS等，直接看文档调用api就可以了
        Example example = new Example(Specs.class);
        Example.Criteria criteria = example.createCriteria();
        criteria.andEqualTo("templateId", category.getTemplateId());
        List<Specs> specsList = specsDao.selectByExample(example); // 获取类目对应模板的规格列表
        List<String> fullNames = genGoodsFullName(0, specsList);
        List<Goods> res = new ArrayList<>();
        for (String fullName : fullNames) {
            Goods goods = new Goods();
            goods.setId(idWorker.nextId()); // 使用雪花算法生成分库分表唯一id
            goods.setName(baseName + " " + fullName);
            goods.setPrice(minPrice + (long) (Math.random()*(maxPrice - minPrice)));
            goods.setStock(stock);
            goods.setImage(img);
            goods.setBrandId(brandId);
            goods.setBrandName(brand.getName());
            goods.setCategoryId(categoryId);
            goods.setCategoryName(category.getName());
            goods.setParamJson("");
            JSONObject specsJson = new JSONObject();
            String[] fullNameSplits = fullName.split(";");
            for (int i = 0; i < specsList.size(); i++) {
                specsJson.put(specsList.get(i).getName(), fullNameSplits[i]);
            }
            goods.setSpecsJson(specsJson.toJSONString());
            res.add(goods);
            goodsDao.insertSelective(goods);

            // 这里不做任何缓存失效：id 由雪花算法现场生成，此前不可能被读取过，
            // 缓存里不存在对应条目；盲目 evict/清空反而会误伤其他热点商品。
        }
        return res;
    }

    private List<String> genGoodsFullName(int startLineNum, List<Specs> specsList) {
        List<String> res = new ArrayList<>();
        if (startLineNum == specsList.size() - 1) {
            res.addAll(Arrays.asList(specsList.get(startLineNum).getOptions().split(",")));
            return res;
        }
        String[] specOptions = specsList.get(startLineNum).getOptions().split(",");
        List<String> subRes = genGoodsFullName(startLineNum + 1, specsList);
        for (String option : specOptions) {
            for (String subName : subRes) {
                res.add(option + ";" + subName);
            }
        }
        return res;
    }

    public List<Goods> getGoodsByStatus(int status) {
        Goods goods = new Goods();
        goods.setStatus(status);
        return goodsDao.select(goods); // 查找 状态正常的 商品列表
    }

    /**
     * 商品详情：L1(Caffeine) → L2(Redis) → L3(MySQL)，回源后回写 Redis。
     *
     * <p>热点计数由 {@link CacheManager#get(String)} 内部完成（命中即计数），
     * 本方法不再重复 add，避免把访问量放大成两倍、让冷 key 误判成热点。</p>
     *
     * <p>返回值语义：商品确实不存在时返回 null（不抛异常），由 Controller 的 Result 包装成空 data，
     * 与改造前的行为保持一致——前端契约不变。</p>
     *
     * @param id 商品 id
     * @return 商品；不存在返回 null
     */
    public Goods getGoodsById(long id) {
        String key = CacheKeys.goodsDetailHashKey(id);

        // 1 + 2：L1 → L2（CacheManager 内部完成，并在命中热 key 时回填 L1）
        String cachedJson = readCache(key);
        if (cachedJson != null) {
            if (NULL_MARKER.equals(cachedJson)) {
                // 负缓存命中：确认过不存在，直接返回，不再打 MySQL
                return null;
            }
            Goods cached = deserialize(key, cachedJson);
            if (cached != null) {
                return cached;
            }
            // 反序列化失败按未命中处理，继续回源，避免脏缓存把请求卡死
        }

        // 3：L3 MySQL 回源
        Goods goods = goodsDao.selectByPrimaryKey(id);
        if (goods == null) {
            writeCache(key, NULL_MARKER); // 防止同一个不存在的 id 被反复穿透到数据库
            return null;
        }
        // 回写 Redis（带 TTL）。注意 CacheManager.put 采用严格热点策略：
        // 只写 L2，不回填 L1；是否升级到 L1 由下一次 get() 里的 HeavyKeeper 判定。
        writeCache(key, goods);
        return goods;
    }

    // TODO: 个人认为这里可能不需要去重
    /**
     * 批量查询商品详情：L1(getAllPresent) → L2(mget) → L3(单次 IN 查询)，回填用 pipeline。
     *
     * <p>与逐个调用 {@link #getGoodsById(long)} 的区别：缓存与数据库都按"批"处理，
     * N 个 id 只需要 1 次 mget + ⌈N/500⌉ 次 IN 查询，而不是 N 次 Redis 往返 + N 次 SELECT。
     * 这也是本方法不复用 {@link #getGoodsById(long)} 的原因——循环调用会退化成 N+1。</p>
     *
     * <h3>三层的行为</h3>
     * <ul>
     *   <li>L1：{@code CacheManager.multiGet} 内部的 getAllPresent，命中即返回并计入热点；</li>
     *   <li>L2：未命中的 key 合并成一次 mget；命中的条目仍按 HeavyKeeper 判定是否回填 L1
     *       （严格热点策略，与单键读一致）；</li>
     *   <li>L3：剩下的 id 按 {@link #DB_BATCH_SIZE} 分批做 {@code IN} 查询。</li>
     * </ul>
     *
     * <h3>负缓存</h3>
     * <p>命中 {@link #NULL_MARKER} 的 id 视为"已确认不存在"，直接跳过、不再打数据库；
     * 本轮数据库查询里查无此 id 的，同样回写 {@link #NULL_MARKER}，防止脏 id 反复穿透。
     * 回写统一收集后一次 {@code putAll}（pipeline），且只写 L2 不回填 L1。</p>
     *
     * <h3>降级</h3>
     * <p>缓存 Bean 缺失（{@code @Autowired(required = false)}）或缓存读写抛异常时，
     * 直接退化为"只用数据库批量查"，缓存不可用不影响主流程。</p>
     *
     * @param ids 商品 id 集合，允许为 null/empty（返回空 Map）
     * @return goodsId -> Goods，<b>只含真实存在的商品</b>（缺失的 id 不出现在 Map 里）；
     *         顺序与入参去重后的顺序一致
     */
    public Map<Long, Goods> getGoodsByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Collections.emptyMap();
        }

        // 去重 + 保序：调用方可能传入重复 id，重复会让 mget 的下标配对失去意义
        Set<Long> orderedIds = new LinkedHashSet<>(ids.size());
        for (Long id : ids) {
            if (id != null) {
                orderedIds.add(id);
            }
        }
        if (orderedIds.isEmpty()) {
            return Collections.emptyMap();
        }

        Map<Long, Goods> result = new LinkedHashMap<>(orderedIds.size());
        // 待回源 L3 的 id
        Set<Long> toLoad = new LinkedHashSet<>();

        // 缓存不可用时整批回源，省掉 key 拼接与 multiGet
        if (cacheManager == null || objectMapper == null) {
            toLoad.addAll(orderedIds);
        } else {
            Map<String, Long> keyToId = new LinkedHashMap<>(orderedIds.size());
            for (Long id : orderedIds) {
                keyToId.put(CacheKeys.goodsDetailHashKey(id), id);
            }

            Map<String, String> cached = Collections.emptyMap();
            try {
                Map<String, String> got = cacheManager.multiGet(keyToId.keySet());
                if (got != null) {
                    cached = got;
                }
            } catch (Exception e) {
                // 缓存读失败 → 全部按未命中回源；返回值仍是完整正确的
                log.warn("批量读取商品缓存失败，降级回源 MySQL ids 数量={}", orderedIds.size(), e);
                cached = Collections.emptyMap();
            }

            for (Map.Entry<String, Long> entry : keyToId.entrySet()) {
                String key = entry.getKey();
                Long id = entry.getValue();
                String json = cached.get(key);
                if (json == null) {
                    // 三级都没命中，回源
                    toLoad.add(id);
                    continue;
                }
                if (NULL_MARKER.equals(json)) {
                    // 负缓存命中：确认过不存在，不再打 MySQL，也不放进结果
                    continue;
                }
                Goods goods = deserialize(key, json);
                if (goods == null) {
                    // 反序列化失败按未命中处理，避免脏缓存把请求卡死
                    toLoad.add(id);
                    continue;
                }
                result.put(id, goods);
            }
        }

        // 待回写 L2 的条目：查到的写商品，查不到的写空值标记（负缓存）
        Map<String, Object> toWriteCache = new LinkedHashMap<>();

        List<Long> pending = new ArrayList<>(toLoad);
        for (int from = 0; from < pending.size(); from += DB_BATCH_SIZE) {
            List<Long> batchIds = pending.subList(from, Math.min(from + DB_BATCH_SIZE, pending.size()));

            Example example = new Example(Goods.class);
            example.createCriteria().andIn("id", batchIds);
            List<Goods> found = goodsDao.selectByExample(example);

            Set<Long> foundIds = new HashSet<>(batchIds.size());
            if (found != null) {
                for (Goods goods : found) {
                    if (goods == null || goods.getId() == null) {
                        continue;
                    }
                    foundIds.add(goods.getId());
                    result.put(goods.getId(), goods);
                    toWriteCache.put(CacheKeys.goodsDetailHashKey(goods.getId()), goods);
                }
            }
            for (Long id : batchIds) {
                if (!foundIds.contains(id)) {
                    toWriteCache.put(CacheKeys.goodsDetailHashKey(id), NULL_MARKER);
                }
            }
        }

        // 统一回填：pipeline 一次写完，只写 L2（严格热点策略由 CacheManager 保证）。
        // cacheManager 为 null（缓存 Bean 未装配）时必须跳过，否则每请求一次 NPE 被 catch 成 warn 噪音。
        if (cacheManager != null && !toWriteCache.isEmpty()) {
            try {
                cacheManager.putAll(toWriteCache);
            } catch (Exception e) {
                log.warn("批量回写商品缓存失败，不影响返回结果 数量={}", toWriteCache.size(), e);
            }
        }

        // 按入参去重后的顺序重排，让调用方拿到的 Map 顺序可预期
        Map<Long, Goods> ordered = new LinkedHashMap<>(result.size());
        for (Long id : orderedIds) {
            Goods goods = result.get(id);
            if (goods != null) {
                ordered.put(id, goods);
            }
        }
        return ordered;
    }

    /**
     * 扣减库存。扣减成功说明数据已变，必须主动失效该商品的 L1 与 L2，避免读到旧库存；
     * 扣减失败（库存不足）时数据未变，不做任何失效。
     *
     * <p>失效采用<b>延迟双删</b>：立即删一次，再延迟 {@code zhuawa.cache.delayed-evict-ms}
     * （默认 500ms）删第二次。第二次删除用于清理「读线程在 UPDATE 提交前已 SELECT 到旧值、
     * 却在本次 evict 之后才回写缓存」这个交错窗口里的脏值，避免它一直留到 TTL 过期。</p>
     *
     * <p>注意：这里不会超卖——下单扣减走的是数据库行级更新 {@code stock=stock-#{num}}
     * 且带 {@code stock>=#{num}} 条件，真正的并发安全由数据库保证。
     * 缓存侧要解决的是"展示层读到旧库存"，所以用延迟双删把窗口从"最长 30 分钟"
     * 压到"毫秒级"。</p>
     *
     * @param id    商品 id
     * @param count 扣减数量
     */
    public void decrStock(long id, int count) {
        if (goodsDao.decrStock(count, id) <= 0) {
            // 扣减失败 = 数据没变，此时绝不能删缓存（否则只是白白放一次请求去回源）
            throw new GlobalException(CodeMsg.GOODS_STOCK_LIMIT);
        }

        // 第一次删除：立即失效 L1 + L2
        evictGoodsCache(id);

        // 第二次删除：延迟执行，清掉并发读线程"迟到的回写"
        scheduleDelayedEvict(id);
    }

    /**
     * 提交一次延迟缓存失效任务。
     *
     * <p>任务内部自行 try/catch：延迟任务在独立线程里跑，异常没人接，若不吞掉会
     * 污染线程池的 afterExecute 并刷日志；而且它本来就是兜底动作，失败也不该影响主链路。</p>
     *
     * <p><b>背压</b>：{@link ScheduledThreadPoolExecutor} 的 DelayedWorkQueue 是无界的，
     * 拒绝策略永远不触发，光靠线程池无法限制积压。所以这里用
     * {@link #pendingDelayedEvicts} 自行计数：超过 {@link #DELAYED_EVICT_QUEUE_CAPACITY}
     * 就直接放弃本次第二次删除（主链路的第一次删除已经生效），并在任务结束时把计数还回去。
     * 宁可在极陡尖峰下退化成"单次删除"，也不能让延迟任务把内存堆爆。</p>
     *
     * <p>延迟 <= 0 时降级为"不安排第二次删除"，等价于旧行为，便于线上出问题时临时关掉。</p>
     *
     * @param id 商品 id
     */
    private void scheduleDelayedEvict(final long id) {
        final long delayMs = delayedEvictMs;
        if (delayMs <= 0L) {
            return;
        }
        if (pendingDelayedEvicts.incrementAndGet() > DELAYED_EVICT_QUEUE_CAPACITY) {
            pendingDelayedEvicts.decrementAndGet();
            log.warn("延迟失效任务积压已达上限 {}，跳过本次第二次删除 id={}（第一次删除已生效）",
                    DELAYED_EVICT_QUEUE_CAPACITY, id);
            return;
        }
        try {
            getDelayedEvictExecutor().schedule(new Runnable() {
                @Override
                public void run() {
                    try {
                        evictGoodsCache(id);
                    } catch (Throwable t) {
                        // 兜底吞掉一切：缓存删除失败绝不能反向影响业务
                        log.warn("延迟失效商品缓存失败 id={}", id, t);
                    } finally {
                        // 无论成功失败都要释放配额，否则计数只增不减会永久堵死第二次删除
                        pendingDelayedEvicts.decrementAndGet();
                    }
                }
            }, delayMs, TimeUnit.MILLISECONDS);
        } catch (Throwable t) {
            // 调度器已关闭或提交失败：把配额还回去
            pendingDelayedEvicts.decrementAndGet();
            log.warn("提交延迟失效任务失败，已跳过第二次删除 id={}", id, t);
        }
    }

    /**
     * 懒初始化延迟删除调度器。
     *
     * <p>核心线程固定为 1、线程 daemon 化。注意 {@link ScheduledThreadPoolExecutor}
     * 内部固定使用无界的 DelayedWorkQueue，既不支持传入队列，队列无界也意味着拒绝策略
     * 永远不会触发——所以"防积压"不靠线程池，而靠 {@link #scheduleDelayedEvict} 里的
     * 待执行计数（上界 {@link #DELAYED_EVICT_QUEUE_CAPACITY}）：超限时直接放弃第二次删除，
     * 让那次操作退回"单次删除"，不会放大成内存问题。</p>
     *
     * @return 调度器
     */
    private ScheduledThreadPoolExecutor getDelayedEvictExecutor() {
        ScheduledThreadPoolExecutor executor = this.delayedEvictExecutor;
        if (executor != null) {
            return executor;
        }
        synchronized (this) {
            if (this.delayedEvictExecutor == null) {
                ThreadFactory threadFactory = new ThreadFactory() {
                    @Override
                    public Thread newThread(Runnable r) {
                        Thread t = new Thread(r,
                                "goods-delayed-evict-" + DELAYED_EVICT_THREAD_SEQ.incrementAndGet());
                        t.setDaemon(true);
                        return t;
                    }
                };
                // 注意：ScheduledThreadPoolExecutor 内部固定使用无界的 DelayedWorkQueue，
                // 既没有可传队列的构造器，也没有公开的 setQueue，且队列无界意味着
                // 拒绝策略永远不会被触发（offer 恒成功）。所以"有界"不能靠构造器参数实现，
                // 改由 scheduleDelayedEvict 里的待执行计数做上界（见 DELAYED_EVICT_QUEUE_CAPACITY）。
                ScheduledThreadPoolExecutor created =
                        new ScheduledThreadPoolExecutor(1, threadFactory);
                // 允许核心线程超时回收，长时间无扣减时不占着线程
                created.setKeepAliveTime(60L, TimeUnit.SECONDS);
                created.allowCoreThreadTimeOut(true);
                this.delayedEvictExecutor = created;
                log.info("初始化延迟删除调度器: delayedEvictMs={}, pendingCap={}",
                        delayedEvictMs, DELAYED_EVICT_QUEUE_CAPACITY);
            }
            return this.delayedEvictExecutor;
        }
    }

    /**
     * 容器关闭时停掉延迟删除线程池，避免残留线程。
     *
     * <p>用 {@code shutdownNow()} 并忽略返回值：残留的未执行任务在关停时已没有意义
     * （应用都要退出了），重要的是别让线程成为关停阻塞点。</p>
     */
    @PreDestroy
    public void shutdownDelayedEvict() {
        ScheduledThreadPoolExecutor executor = this.delayedEvictExecutor;
        if (executor == null) {
            return;
        }
        this.delayedEvictExecutor = null;
        try {
            executor.shutdownNow();
        } catch (Throwable t) {
            log.warn("关闭延迟删除调度器失败", t);
        }
    }

    // ------------------------------------------------------------------
    // 缓存读写内部方法：缓存异常一律降级为"未命中"，不影响主流程
    // ------------------------------------------------------------------

    private String readCache(String key) {
        if (cacheManager == null) {
            return null;
        }
        try {
            return cacheManager.get(key);
        } catch (Exception e) {
            log.warn("读取缓存失败，降级回源 MySQL key={}", key, e);
            return null;
        }
    }

    private Goods deserialize(String key, String json) {
        if (objectMapper == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, Goods.class);
        } catch (Exception e) {
            log.warn("缓存反序列化失败，按未命中处理 key={}", key, e);
            return null;
        }
    }

    private void writeCache(String key, Object value) {
        if (cacheManager == null) {
            return;
        }
        try {
            cacheManager.put(key, value);
        } catch (Exception e) {
            log.warn("写入缓存失败 key={}", key, e);
        }
    }

    /**
     * 主动失效商品详情缓存（L1 + L2）。写操作后调用，失败只记录日志，
     * 不能让缓存不可用反过来阻断下单扣减。
     */
    private void evictGoodsCache(long id) {
        if (cacheManager == null) {
            return;
        }
        String key = CacheKeys.goodsDetailHashKey(id);
        try {
            cacheManager.evict(key);
        } catch (Exception e) {
            log.warn("失效商品缓存失败 key={}", key, e);
        }
    }
}
