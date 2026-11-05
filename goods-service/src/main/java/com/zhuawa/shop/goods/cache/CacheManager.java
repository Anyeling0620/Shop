package com.zhuawa.shop.goods.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.zhuawa.shop.goods.cache.heavykeeper.TopK;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * 多级缓存统一入口：Caffeine 本地缓存（L1） + Redis（L2） + MySQL（L3，由业务层兜底）。
 *
 * <p>热点判定复用 yu-like 的 HeavyKeeper：每次访问计数 +1，只有被判为热 key 的条目
 * 才会进入本地缓存；本地缓存因此天然带有上限，不会被长尾 key 撑爆。</p>
 *
 * <h3>为什么用 JSON 字符串而不是 JDK 序列化</h3>
 * <ul>
 *   <li>JDK 序列化要求被缓存对象实现 {@link java.io.Serializable}，且序列化结果与类的
 *       全限定名、serialVersionUID 强绑定——商品模型加个字段就可能反序列化失败；</li>
 *   <li>JDK 序列化产出是二进制，redis-cli 里不可读，排障时看不到值；</li>
 *   <li>JSON 跨语言、可读、字段增减兼容性好，配合 StringRedisTemplate 还能避免
 *       默认 JdkSerializationRedisSerializer 在 key 上插入的二进制前缀问题。</li>
 * </ul>
 *
 * <p>因此这里统一使用 {@link StringRedisTemplate} + Jackson 将对象序列化为 JSON 字符串存取。</p>
 *
 * <p>两种存取形态（t4 商品详情走单键形态）：</p>
 * <ul>
 *   <li><b>单键</b>：{@code goods:detail:{goodsId}} → JSON 字符串，见
 *       {@link #get(String)} / {@link #put(String, Object)} / {@link #evict(String)}；</li>
 *   <li><b>Hash</b>：hashKey + fieldKey 二级结构，见
 *       {@link #get(String, String)} / {@link #putIfPresent(String, String, Object)} /
 *       {@link #evictLocal(String, String)}。</li>
 * </ul>
 *
 * @author cache-dev
 */
@Component
public class CacheManager {

    private static final Logger log = LoggerFactory.getLogger(CacheManager.class);

    private final TopK hotKeyDetector;

    private final Cache<String, Object> localCache;

    private final StringRedisTemplate redisTemplate;

    private final ObjectMapper objectMapper;

    private final CacheConfig.CacheProperties properties;

    public CacheManager(TopK hotKeyDetector,
                        Cache<String, Object> localCache,
                        StringRedisTemplate redisTemplate,
                        ObjectMapper objectMapper,
                        CacheConfig.CacheProperties properties) {
        this.hotKeyDetector = hotKeyDetector;
        this.localCache = localCache;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    // ------------------------------------------------------------------
    // 单键形态：goods:detail:{goodsId} -> JSON 字符串（t4 使用）
    // ------------------------------------------------------------------

    /**
     * 读取单键缓存：L1 → L2，未命中返回 null（由调用方回源 MySQL）。
     *
     * @param key 完整 redis key，如 {@code CacheKeys.goodsDetailHashKey(id)}
     * @return JSON 字符串，未命中返回 null
     */
    public String get(String key) {
        // 1. 先查本地缓存
        Object local = localCache.getIfPresent(key);
        if (local != null) {
            hotKeyDetector.add(key, 1);
            return local instanceof String ? (String) local : String.valueOf(local);
        }

        // 2. 本地未命中，查 Redis
        String redisValue = redisTemplate.opsForValue().get(key);
        if (redisValue == null) {
            return null;
        }

        // 3. 记录一次访问；是热 key 才回填本地缓存
        TopK.AddResult addResult = hotKeyDetector.add(key, 1);
        if (addResult != null && addResult.hotKey()) {
            localCache.put(key, redisValue);
        }
        return redisValue;
    }

    /**
     * 读取单键缓存并反序列化为指定类型。
     *
     * @param key  完整 redis key
     * @param type 目标类型
     * @param <T>  泛型
     * @return 反序列化后的对象；未命中返回 null
     */
    public <T> T get(String key, Class<T> type) {
        String json = get(key);
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            log.warn("缓存反序列化失败，按未命中处理 key={}", key, e);
            return null;
        }
    }

    /**
     * 读取单键缓存并反序列化为泛型类型。
     *
     * @param key           完整 redis key
     * @param typeReference 泛型类型
     * @param <T>           泛型
     * @return 反序列化后的对象；未命中返回 null
     */
    public <T> T get(String key, TypeReference<T> typeReference) {
        String json = get(key);
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, typeReference);
        } catch (Exception e) {
            log.warn("缓存反序列化失败，按未命中处理 key={}", key, e);
            return null;
        }
    }

    /**
     * 写入单键缓存：对象序列化为 JSON 后写 Redis（带 TTL）。<b>只写 L2，不回填 L1。</b>
     *
     * <p>写路径由业务层在回源 MySQL 之后调用，属于"缓存填充"；
     * 主动失效请用 {@link #evict(String)}。</p>
     *
     * <h3>为什么回源结果不直接进 L1（严格热点策略）</h3>
     * <ul>
     *   <li><b>防污染</b>：回源是"未命中"触发的，而未命中既可能是真热点冷启动，也可能是
     *       长尾 key、爬虫/扫描型流量。若回源即写 L1，这些一次性 key 会挤掉
     *       Caffeine 里的真热点，把本地缓存变成"谁最后被访问谁留下"。</li>
     *   <li><b>准入唯一</b>：L1 的准入完全交给 HeavyKeeper。{@link #put(String, Object)}
     *       只负责把数据放进 L2，是否升级到 L1 一律由 {@link #get(String)} 里的
     *       {@code hotKeyDetector.add()} 判定，规则单一、可解释、可调参。</li>
     *   <li><b>冷启动成本可接受</b>：一个 key 需要被访问约 {@code minCount} 次
     *       （默认 10，见 {@code zhuawa.cache.min-count}）才会被判为热点并进入 L1。
     *       这期间的读请求落在 Redis 上，Redis 作为 L2 单次读在亚毫秒级，足以承接；
     *       换来的是 L1 里始终只有真热点。</li>
     *   <li><b>将来若确实需要"回源即预热"</b>（例如已知的运营大促会场商品），
     *       应当通过显式配置开关打开，而不是把它做成默认行为——默认值要照顾
     *       最普通的流量形态。</li>
     * </ul>
     *
     * @param key   完整 redis key
     * @param value 待缓存对象
     */
    public void put(String key, Object value) {
        if (key == null || value == null) {
            return;
        }
        try {
            String json = value instanceof String ? (String) value : objectMapper.writeValueAsString(value);
            // 只写 L2：L1 的准入由 get() 中的 HeavyKeeper 热点判定决定，此处不得回填本地缓存
            redisTemplate.opsForValue().set(key, json, properties.getRedisExpireSeconds(), TimeUnit.SECONDS);
        } catch (Exception e) {
            log.warn("写入缓存失败 key={}", key, e);
        }
    }

    /**
     * 失效单键缓存：同时删本地与 Redis。写操作（改价、下架、改库存）后调用。
     *
     * @param key 完整 redis key
     */
    public void evict(String key) {
        if (key == null) {
            return;
        }
        localCache.invalidate(key);
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.warn("删除 redis key 失败 key={}", key, e);
        }
    }

    // ------------------------------------------------------------------
    // Hash 形态（与 yu-like 教程一致的 hashKey + fieldKey 结构）
    // ------------------------------------------------------------------

    /**
     * Hash 形态读取：L1 → L2。
     *
     * @param hashKey  redis hash key
     * @param fieldKey redis hash field
     * @return 值，未命中返回 null
     */
    public Object get(String hashKey, String fieldKey) {
        String localKey = CacheKeys.localKey(hashKey, fieldKey);

        // 1. 本地缓存
        Object value = localCache.getIfPresent(localKey);
        if (value != null) {
            hotKeyDetector.add(fieldKey, 1);
            return value;
        }

        // 2. Redis
        Object redisValue = redisTemplate.opsForHash().get(hashKey, fieldKey);
        if (redisValue == null) {
            return null;
        }

        // 3. 计数 + 热点回填
        TopK.AddResult addResult = hotKeyDetector.add(fieldKey, 1);
        if (addResult != null && addResult.hotKey()) {
            localCache.put(localKey, redisValue);
        }
        return redisValue;
    }

    /**
     * 仅在本地缓存已存在该条目时更新它（不写 Redis）。
     *
     * <p>对应 yu-like 的做法：本地有才更新，避免把长尾 key 顶进 L1。</p>
     *
     * @param hashKey  redis hash key
     * @param fieldKey redis hash field
     * @param value    新值
     */
    public void putIfPresent(String hashKey, String fieldKey, Object value) {
        String localKey = CacheKeys.localKey(hashKey, fieldKey);
        if (localCache.getIfPresent(localKey) == null) {
            return;
        }
        localCache.put(localKey, value);
    }

    /**
     * 只清本地缓存中的对应条目，保留 Redis。Redis 侧由其他节点/其它路径维护。
     *
     * @param hashKey  redis hash key
     * @param fieldKey redis hash field
     */
    public void evictLocal(String hashKey, String fieldKey) {
        localCache.invalidate(CacheKeys.localKey(hashKey, fieldKey));
    }

    /**
     * 同时清理本地与 Redis 的 Hash 条目。
     *
     * @param hashKey  redis hash key
     * @param fieldKey redis hash field
     */
    public void evict(String hashKey, String fieldKey) {
        evictLocal(hashKey, fieldKey);
        try {
            redisTemplate.opsForHash().delete(hashKey, fieldKey);
        } catch (Exception e) {
            log.warn("删除 redis hash field 失败 hashKey={}, fieldKey={}", hashKey, fieldKey, e);
        }
    }

    // ------------------------------------------------------------------
    // 定时衰减
    // ------------------------------------------------------------------

    /**
     * 周期性衰减热点计数，让"曾经热、现在冷"的 key 掉出 TopK。
     *
     * <p>周期默认 20 秒（20000ms），可用 {@code zhuawa.cache.fading-interval-ms} 覆盖。
     * 注意 spring-boot 2.5.4 依赖的 Spring 5.3 尚不支持 {@code @Scheduled(timeUnit = ...)}，
     * 因此这里统一用毫秒。
     * {@code @EnableScheduling} 在 {@link CacheConfig} 上开启。</p>
     */
    @Scheduled(fixedRateString = "${zhuawa.cache.fading-interval-ms:20000}")
    public void fading() {
        try {
            hotKeyDetector.fading();
        } catch (Exception e) {
            // 定时任务抛异常会终止后续调度，这里必须吞掉并记录
            log.warn("热点衰减执行失败", e);
        }
    }

    /** 暴露底层检测器，便于测试与运维端点观测。 */
    public TopK getHotKeyDetector() {
        return hotKeyDetector;
    }

    /** 暴露本地缓存，便于测试验证 L1 命中情况。 */
    public Cache<String, Object> getLocalCache() {
        return localCache;
    }
}
