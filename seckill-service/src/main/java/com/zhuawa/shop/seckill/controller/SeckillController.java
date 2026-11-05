package com.zhuawa.shop.seckill.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import com.zhuawa.shop.seckill.rabbitmq.MQSender;
import com.zhuawa.shop.seckill.rabbitmq.SeckillMessage;
import com.zhuawa.shop.seckill.rabbitmq.SeckillStockCompensator;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.service.SeckillGoodsService;
import com.zhuawa.shop.seckill.service.SeckillService;
import com.zhuawa.shop.seckill.vo.SeckillDetailVo;
import io.swagger.annotations.Api;
import springfox.documentation.annotations.ApiIgnore;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.PostConstruct;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Api(tags = "秒杀模块")
@RestController
@RequestMapping("/seckill")
public class SeckillController {

    private static final Logger logger = LoggerFactory.getLogger(SeckillController.class);

    /**
     * 一人一单判重 key 的存活时间（秒），默认 1 小时。
     * <p>
     * 这个值必须与"业务周期"对齐，不能拍脑袋：
     * <ul>
     *   <li><b>不能短于订单超时时间</b>：秒杀订单超时未支付会关闭，但在关闭之前用户仍算占着名额；
     *       若标记比订单超时先失效，用户可以在订单还活着时再抢一次，一个人占两单。</li>
     *   <li><b>不能短于一场秒杀的持续时长</b>：标记提前失效 = 同一用户可以在同一场里重复下单，
     *       而这正是它要防的事。</li>
     *   <li><b>也不宜远长于业务周期</b>：标记只是"这个人这次已经买过了"的证据，
     *       留太久会让"订单关闭后应当可以重新参与"的场景变得不可行。</li>
     * </ul>
     * 因此做成可配置项 {@code zhuawa.seckill.order-mark-ttl-seconds}，默认沿用历史值 3600。
     * ⚠️ 具体该配多少取决于秒杀场次时长与订单超时策略，属于业务规则，本类只负责把它变成可调，
     * 不擅自给出新的默认语义。
     */
    @Value("${zhuawa.seckill.order-mark-ttl-seconds:3600}")
    private long orderMarkExpireSeconds = 3600L;

    @Autowired
    SeckillGoodsService seckillGoodsService;

    @Autowired
    SeckillService seckillService;

    @Autowired
    RedisService redisService;

    @Autowired
    MQSender mqSender;

    @Autowired
    SeckillStockCompensator stockCompensator;

    /**
     * 内存标记：某一商品的<b>某一场</b>是否已无货，用于减少 redis 访问。
     * <p>
     * key 从 {@code goodsId} 改成 {@code goodsId + ":" + sessionId}：
     * 改造前只按商品维度记，第一场卖空后这个 true 会一直挡着第二场 ——
     * 用户进第二场直接被内存短路，连 redis 都不会查，第二场的货等于卖不出去。
     * 这与 redis 侧 {@link RedisKeys#goodsOverKey} 的场次化必须同步，
     * 两处只要有一处粒度不对，短路结果就会跨场次串味。
     * <p>
     * 用 String 而不是自定义对象做 key：这个 map 只是"最近一次观察结果"的缓存，
     * 值永远是 Boolean，用字符串拼 key 最省事且便于从日志/堆栈里直接读出场次。
     */
    private ConcurrentHashMap<String, Boolean> seckillOverMap = new ConcurrentHashMap<>();

    /**
     * 启动时把秒杀库存预热进 redis。
     * <p>
     * <b>为什么这里也必须用 SET NX，而不是无条件 SET（这是本方法的全部要点）：</b>
     * 预扣发生在 Redis（Lua 扣减立即生效），而 DB 扣减发生在 MQ 消费端、是异步且滞后的。
     * 因此任意时刻都存在一个"Redis 已经扣了、DB 还没扣"的窗口。滚动发布/重启恰好落在这个窗口里时：
     * <pre>
     *   T1 用户抢购：Redis stock 100 -&gt; 99，MQ 消息入队（DB 仍 100）
     *   T2 服务重启，init() 无条件 SET 把 Redis 写回 DB 当前值 100   &lt;-- 那 1 个名额凭空复活
     *   T3 队列里的消息被消费，DB 扣到 99
     *   T4 结果：Redis=100（还要再卖 1 个），DB=99 -&gt; 卖出 100+ 件，超卖
     * </pre>
     * 改成 SET NX 后：只要 Redis 里已有这个 key，就一律保留 Redis 的值 ——
     * key 存在本身就说明"Redis 侧的库存没有丢"，此时它才是比 DB 更权威的那份数据
     * （DB 只是 sluggishly 追平 Redis）。这也正是 {@link #warmUpStock} 里那条
     * 竞态时间线的同一个道理，两条路径必须保持同一套语义，否则重启就会成为后门。
     * <p>
     * 反方向的情形同样要覆盖：Redis 是空的（首次部署、被清空/淘汰、换机）时，
     * SET NX 会正常写入成功，预热照常完成；若商品秒杀库存为 0，写进去的就是 0，
     * 后续扣减会正确返回"库存不足"。因此"必须能正常预热"与"重启不覆盖"并不冲突，
     * SET NX 同时满足两者。
     * <p>
     * 无货标记只在"确实没货"时置位，不能因为"key 已存在"就误判。
     * 另外 init 失败（DB 不可用）只应影响预热，不应让整个服务起不来 ——
     * 库存 key 缺失还有 Lua 的 -2 兜底路径可以回源，见 doSeckill 对 -2 的处理。
     * <p>
     * <b>【上线注意】这里顺带说明旧格式 key 的清理，但本方法<b>不</b>做清理：</b>
     * 本次改造把 key 从 {@code seckill:stock:{goodsId}} / {@code seckill:goodsOver:{goodsId}}
     * 升级为 {@code seckill:stock:{goodsId}:{sessionId}} / {@code seckill:goodsOver:{goodsId}:{sessionId}}。
     * 升级后 redis 里可能残留旧格式的 key，新代码不会读它们，属于垃圾数据。
     * 之所以不在启动时顺手删：清理是"删 key"这种不可逆操作，一旦匹配规则写宽了
     * （比如误用 {@code seckill:stock:*}）会把刚预热好的新 key 一起删掉，秒杀当场回源、甚至短暂误判售罄。
     * 因此把它留给发布时的人工步骤：用 {@code SCAN} 拉出旧格式 key 逐个 {@code DEL}；
     * 或者不处理 —— 它们没有 TTL，会长期占一点内存但不再影响任何逻辑。详见 {@link RedisKeys} 类注释。
     */
    @PostConstruct
    public void init() {
        List<SeckillGoods> goodsList;
        try {
            goodsList = seckillGoodsService.listSeckillGoods();
        } catch (Exception e) {
            // 启动预热是"优化"，不是"依赖"：DB 抖动不应该让整个服务起不来。
            // 预热失败时，秒杀请求会走 Lua 的 -2 分支回源预热（warmUpStock），链路依然可用。
            logger.error("seckill stock init skipped due to db error, will warm up lazily on demand", e);
            return;
        }
        int warmed = 0;
        int kept = 0;
        for (SeckillGoods goods : goodsList) {
            // 联查用的是 left join goods：goods_seckill 有配置、但 goods 已被删掉的孤儿行，
            // goods_id 投影出来就是 null。这种记录永远卖不出去，预热没有意义。
            // 必须在这里显式跳过 —— stockKey / overMapKey 的入参都是 long，
            // 把 null 直接拆箱会抛 NPE，而本方法在 @PostConstruct 里，异常会让整个服务起不来；
            // 这跟本方法"预热只是优化、不能影响启动"的口径直接冲突。
            // （改造前拼的是字符串，null 会被拼成字面量 "null" 而不报错，所以这是本次改造新引入的风险。）
            if (goods.getGoodsId() == null) {
                logger.warn("skip warming up orphan goods_seckill row, goods_id is null. sessionId: {}",
                        goods.getSessionId());
                continue;
            }
            int stock = goods.getStockSeckill() == null ? 0 : goods.getStockSeckill();
            // 一条 goods_seckill 记录 == 一个场次，所以这里必须按"这条记录自己的场次"预热。
            // 若沿用商品级 key，多个场次的记录会轮流往同一个 key 上 SET NX：
            // 第一条写进去之后，后面的场次全部 written=false，即第二场及以后根本没有自己的库存 key，
            // 它们只能一直复用第一场那份已经被扣过的数 —— 这正是本次要修的缺口。
            int sid = sessionIdOf(goods);
            // 关键：只在 key 不存在时写入。key 已存在说明 Redis 侧数据还在，
            // 重启不该用（可能更旧的）DB 值把它覆盖掉。
            boolean written = redisService.setIfAbsent(RedisKeys.stockKey(goods.getGoodsId(), sid),
                    String.valueOf(stock));
            if (written) {
                warmed++;
            } else {
                kept++;
            }
            // 内存无货标记按"Redis 里实际可售"来判断：
            // 没抢到写权限说明 Redis 已有值，此时以 DB 为准判无货会误封还有货的商品，
            // 所以这里只在"本次写入的值为 0"时直接标记无货，其余情况交给 Lua 命中 0 时再标记。
            seckillOverMap.put(overMapKey(goods.getGoodsId(), sid), written && stock <= 0);
        }
        logger.info("seckill stock init finish, session count: {}, warmed from db: {}, kept existing redis value: {}",
                goodsList.size(), warmed, kept);
    }

    /**
     * 库存 key 缺失时的兜底预热：从 DB 回源该商品的秒杀库存，并以 SET NX 写回 redis。
     * <p>
     * 为什么必须是 NX（只在 key 不存在时写）而不是无条件 SET：
     * 多个请求同时收到 -2 时，它们会各自回源查 DB（都读到同一个初始值），
     * 若直接 SET，先到的请求预热并扣减后，后到的请求会把库存覆盖回初始值。
     * 时间线（DB 库存 = 10，redis key 丢失，请求 A、B 并发）：
     * <pre>
     *   A: Lua -&gt; -2 ；B: Lua -&gt; -2
     *   A: 预热 SET stock=10
     *   A: 再扣 -&gt; stock=9，成功
     *   B: 预热 SET stock=10   &lt;-- 覆盖掉 9，A 的那一单凭空"复活"
     *   B: 再扣 -&gt; stock=9，成功
     * </pre>
     * 两个请求都成功、库存只减 1，最终 DB 扣减的库存对不上 -> 超卖。
     * 改成 SET NX 后：只有第一个请求能写入，后来者写入失败说明 key 已经被别人预热好了，
     * 此时 key 一定存在，直接返回 true 让调用方重试扣减即可 —— 重试时读到的就是别人扣减后的值。
     * <p>
     * <b>为什么必须按 (goodsId, sessionId) 回源</b>：库存是场次级的，DB 里的秒杀库存也分场次存。
     * 若这里只按 goodsId 回源（{@code getByGoodsId} 取的是 session_id 最大的那一场），
     * 那么 0 号场丢 key 时会把 1 号场的库存预热到 0 号场的 key 上，两边一起错。
     * 因此入参带上 sessionId，并用 {@code getByGoodsIdAndSession} 精确取那一场。
     *
     * @param goodsId   商品 id
     * @param sessionId 场次编号；调用方要保证它能兜底为 0（旧消息无该字段时），不能是 null
     * @return true 表示库存 key 现在已经存在（本次写入成功，或别人刚好已写入），调用方可以重试扣减；
     *         false 表示商品（该场次）不存在，不该参与秒杀
     */
    private boolean warmUpStock(long goodsId, int sessionId) {
        SeckillGoods goods;
        try {
            // 精确到这一场：查不到就等同于"商品不存在"，绝不能退化成随便取一场 ——
            // 那样会把别的场次的库存预热点到本场的 key 上，两个场次的数都错。
            goods = seckillGoodsService.getByGoodsIdAndSession(goodsId, sessionId);
        } catch (GlobalException e) {
            logger.error("warm up seckill stock failed, goods not exist. goodsId: {}, sessionId: {}",
                    goodsId, sessionId);
            return false;
        }
        int stock = goods.getStockSeckill() == null ? 0 : goods.getStockSeckill();
        String stockKey = RedisKeys.stockKey(goodsId, sessionId);
        // 注意：返回 false 不是失败，只表示"别人先写了"。此时 key 已存在，重试扣减能正常读到值。
        boolean written = redisService.setIfAbsent(stockKey, String.valueOf(stock));
        if (written) {
            logger.warn("seckill stock key missing, warm up from db. goodsId: {}, sessionId: {}, stock: {}",
                    goodsId, sessionId, stock);
        } else {
            logger.info("seckill stock already warmed up by concurrent request, goodsId: {}, sessionId: {}",
                    goodsId, sessionId);
        }
        // 无论是否由本次写入，只要 key 现在存在就应该重试扣减：
        // 库存为 0 时重试会读到 0 并返回"库存不足"，语义依然正确。
        return true;
    }

    /**
     * 取一个 {@link SeckillGoods} 的场次编号，缺失时降级为 0 号场。
     * <p>
     * 为什么允许降级而不是抛异常：{@code sessionId} 是联查投影出来的 Integer，
     * 理论上 SQL 漏了字段才会是 null；但启动预热属于"优化"路径，不能因为一条数据脏
     * 就让整个服务起不来（同 {@link #init()} 对 DB 异常的处理口径）。
     * 降级到 0 与改造前的行为一致（历史数据只有 0 号场），不会比现状更差。
     */
    private int sessionIdOf(SeckillGoods goods) {
        return goods.getSessionId() == null ? 0 : goods.getSessionId();
    }

    /**
     * 内存无货标记的 key：{@code goodsId:sessionId}。
     * <p>
     * 读写两侧都走这个方法，避免"写用 String.valueOf(goodsId)"、读还用 Long key 这种
     * 编译期查不出、运行期永远读不到的错配。
     */
    private String overMapKey(long goodsId, int sessionId) {
        return goodsId + ":" + sessionId;
    }

    @ApiOperation(value = "查询秒杀商品列表")
    @GetMapping("/list")
    public Result<List<SeckillGoods>> list() {
        return Result.success(seckillGoodsService.listSeckillGoods());
    }

    @ApiOperation(value = "查询秒杀商品详情（含秒杀状态与倒计时）")
    @GetMapping("/detail/{goodsId}")
    public Result<SeckillDetailVo> detail(@PathVariable("goodsId") long goodsId,
                                         @RequestParam(value = "sessionId", required = false) Integer sessionId) {
        SeckillGoods goods = sessionId == null
                ? seckillGoodsService.getByGoodsId(goodsId)
                : seckillGoodsService.getByGoodsIdAndSession(goodsId, sessionId);
        // Feign 校验商品在 goods-service 中存在且上架
        seckillGoodsService.checkGoodsOnSale(goodsId);

        SeckillDetailVo vo = new SeckillDetailVo();
        vo.setGoods(goods);
        // 状态仍按时间判断：拿到的就是「某一场」那一行，start/end 天然是该场次的时间窗，
        // 因此不需要额外的场次状态字段。
        int[] status = seckillStatus(goods);
        vo.setSeckillStatus(status[0]);
        vo.setRemainSeconds(status[1]);
        return Result.success(vo);
    }

    /**
     * 获取混淆后的秒杀 path（防脚本刷接口），60s 有效
     */
    @ApiOperation(value = "获取秒杀隐藏地址（60秒内有效）")
    @AccessLimit(needLogin = true)
    @GetMapping("/path/{goodsId}")
    public Result<String> getSeckillPath(@ApiIgnore LoginUser user, @PathVariable("goodsId") long goodsId,
                                         @RequestParam(value = "sessionId", required = false) Integer sessionId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        // path 是"某一场"的入场券，必须先确定场次再签发
        int sid = resolveSessionId(goodsId, sessionId);
        return Result.success(seckillService.createSeckillPath(user.getId(), goodsId, sid));
    }

    /**
     * 解析本次请求要操作的场次。
     * <p>
     * 为什么允许 sessionId 缺省：前端现有调用（/seckill/list、/detail、/path、/do、/result）
     * 都不带场次，若强制必填会立刻打断线上链路。缺省时退化为「该商品的当前场次」
     * （session_id 最大的一场），对只有 0 号场的历史数据而言与改造前完全等价。
     * <p>
     * 显式传入时会做存在性校验：场次传错必须报错，不能悄悄回落到当前场，
     * 否则用户以为在抢第二场、实际扣的是第一场的库存。
     */
    private int resolveSessionId(long goodsId, Integer sessionId) {
        if (sessionId == null) {
            SeckillGoods goods = seckillGoodsService.getByGoodsId(goodsId);
            return goods.getSessionId() == null ? 0 : goods.getSessionId();
        }
        SeckillGoods goods = seckillGoodsService.getByGoodsIdAndSession(goodsId, sessionId);
        return goods.getSessionId() == null ? sessionId : goods.getSessionId();
    }

    /**
     * 执行秒杀：
     * 1. 校验 path
     * 2. 内存标记判无货
     * 3. Lua 脚本原子完成「判重 + 校验库存 + 预扣库存 + 写判重标记」
     * 4. 发 MQ 异步下单，返回排队中
     */
    @ApiOperation(value = "执行秒杀（异步下单，返回0表示排队中）")
    @AccessLimit(needLogin = true)
    @PostMapping("/{path}/do/{goodsId}")
    public Result<Long> doSeckill(@ApiIgnore LoginUser user,
                                  @PathVariable("path") String path,
                                  @PathVariable("goodsId") long goodsId,
                                  @RequestParam(value = "sessionId", required = false) Integer sessionId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        // 0. 先定场次：后面 path 校验、判重 key、MQ 消息全都要用它
        int sid = resolveSessionId(goodsId, sessionId);
        // 1. 验证 path
        if (!seckillService.checkSeckillPath(user.getId(), goodsId, sid, path)) {
            return Result.error(CodeMsg.REQUEST_ILLEGAL);
        }
        // 2. 内存标记，减少 redis 访问。key 必须带场次，否则第一场售罄会挡死第二场。
        if (Boolean.TRUE.equals(seckillOverMap.get(overMapKey(goodsId, sid)))) {
            return Result.error(CodeMsg.SECKILL_OVER);
        }
        // 3. Lua 脚本原子预扣库存 + 判重。
        //    原来这里是 decr 与 setIfAbsent 两次独立调用，重复抢购会把库存扣掉却不回补；
        //    现在合并在一个脚本里，返回 0 / -1 时库存一个字节都没动，不存在泄漏。
        //    库存 key 带场次：DB 的 reduceStock 已按 (goodsId, sessionId) 扣减，
        //    redis 侧若还按商品存一份，第二场会直接复用第一场扣剩的数，无法按场重置。
        long result = redisService.seckillDeductStock(
                RedisKeys.stockKey(goodsId, sid),
                RedisKeys.SECKILL_ORDER_MARK + user.getId() + ":" + goodsId + ":" + sid,
                orderMarkExpireSeconds);
        if (result == RedisService.SECKILL_STOCK_REPEAT) {
            // 重复抢购：库存未扣，无需回补
            return Result.error(CodeMsg.SECKILL_REPEAT);
        }
        if (result == RedisService.SECKILL_STOCK_NOT_INIT) {
            // 库存 key 不存在 ≠ 售罄：可能是服务重启后 @PostConstruct 预热失败、
            // 或 redis 数据丢失/被清理。这里按「商品+场次」回源预热一次再重试，
            // 避免把「有货但没预热」误判成「售罄」并打上永久无货标记。
            if (!warmUpStock(goodsId, sid)) {
                // 回源也查不到该场次：是真的不该卖，标记无货（同样带场次）
                seckillOverMap.put(overMapKey(goodsId, sid), true);
                redisService.set(RedisKeys.goodsOverKey(goodsId, sid), "true");
                return Result.error(CodeMsg.SECKILL_OVER);
            }
            result = redisService.seckillDeductStock(
                    RedisKeys.stockKey(goodsId, sid),
                    RedisKeys.SECKILL_ORDER_MARK + user.getId() + ":" + goodsId + ":" + sid,
                    orderMarkExpireSeconds);
            if (result == RedisService.SECKILL_STOCK_REPEAT) {
                return Result.error(CodeMsg.SECKILL_REPEAT);
            }
        }
        if (result != RedisService.SECKILL_STOCK_SUCCESS) {
            // 库存不足：置内存标记 + 置无货标记，后续请求直接短路。
            // 两处都按场次置：本场卖空不应该影响同一商品的其他场次。
            seckillOverMap.put(overMapKey(goodsId, sid), true);
            redisService.set(RedisKeys.goodsOverKey(goodsId, sid), "true");
            return Result.error(CodeMsg.SECKILL_OVER);
        }
        // 4. 发消息，异步落单。场次必须随消息带过去，否则消费端只能猜"当前场"
        SeckillMessage sm = new SeckillMessage();
        sm.setUserId(user.getId());
        sm.setGoodsId(goodsId);
        sm.setSessionId(sid);
        // requestId 必须在发送之前生成并写进消息体：它是消费端补偿的幂等闸门。
        // 若放到发送之后再生成，发送失败时我们就没有"这次预扣"的标识了。
        sm.setRequestId(stockCompensator.newRequestId(user.getId(), goodsId, sid));
        try {
            mqSender.sendSeckillMessage(sm);
        } catch (Exception e) {
            // 【缺陷修复】MQ 不可用 / Broker 宕机 / 网络断开：此时 Redis 库存已经扣掉、
            // 判重标记也已经写上，但消息根本没进队列 —— 如果不处理，这 1 个名额永久丢失（少卖），
            // 且 Redis 与 DB 的库存从此对不上，这个用户也再也抢不了这件商品。
            // 因此必须把预扣的那次扣减原路退回：库存 +1、判重标记删除，均带幂等保护。
            logger.error("秒杀消息发送失败，回补预扣名额. userId={}, goodsId={}, sessionId={}, requestId={}",
                    user.getId(), goodsId, sid, sm.getRequestId(), e);
            boolean rolledBack = stockCompensator.rollback(user.getId(), goodsId, sid,
                    sm.getRequestId(), "mq send failed");
            if (!rolledBack) {
                // 回补都失败了：名额已流失且无法自动修复，必须打出可被告警系统抓到的日志。
                logger.error("⚠️ 预扣名额回补失败，库存将与 DB 漂移，需人工核对. userId={}, goodsId={}, sessionId={}",
                        user.getId(), goodsId, sid);
            }
            // 对用户而言这次秒杀确实没成功（消息没发出去），要如实返回失败，
            // 不能返回"排队中"—— 前端会一直轮询等待一个永远不会到来的订单。
            return Result.error(CodeMsg.SECKILL_FAIL);
        }
        return Result.success(0L); // 排队中
    }

    /**
     * 前端轮询秒杀结果：orderId 成功；-1 失败；0 排队中
     */
    @ApiOperation(value = "轮询查询秒杀结果（订单ID成功，-1失败，0排队中）")
    @GetMapping("/result/{goodsId}")
    public Result<Long> seckillResult(@ApiIgnore LoginUser user, @PathVariable("goodsId") long goodsId,
                                      @RequestParam(value = "sessionId", required = false) Integer sessionId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        return Result.success(seckillService.getSeckillResult(user.getId(), goodsId,
                resolveSessionId(goodsId, sessionId)));
    }

    /**
     * 供其他服务 Feign 调用的结果查询接口（不校验登录态）
     */
    @ApiOperation(value = "查询秒杀结果（供服务间Feign调用）")
    @GetMapping("/result/query")
    public Result<Long> seckillResultQuery(@RequestParam("userId") long userId,
                                           @RequestParam("goodsId") long goodsId,
                                           @RequestParam(value = "sessionId", required = false) Integer sessionId) {
        return Result.success(seckillService.getSeckillResult(userId, goodsId,
                resolveSessionId(goodsId, sessionId)));
    }

    private int[] seckillStatus(SeckillGoods goods) {
        int seckillStatus;
        int remainSeconds;
        if (goods.getStartTime() == null || goods.getEndTime() == null) {
            return new int[]{1, 0};
        }
        long startAt = goods.getStartTime().getTime();
        long endAt = goods.getEndTime().getTime();
        long now = System.currentTimeMillis();
        if (now < startAt) { // 秒杀还没开始，倒计时
            seckillStatus = 0;
            remainSeconds = (int) ((startAt - now) / 1000);
        } else if (now > endAt) { // 秒杀已经结束
            seckillStatus = 2;
            remainSeconds = -1;
        } else { // 秒杀进行中
            seckillStatus = 1;
            remainSeconds = 0;
        }
        return new int[]{seckillStatus, remainSeconds};
    }
}
