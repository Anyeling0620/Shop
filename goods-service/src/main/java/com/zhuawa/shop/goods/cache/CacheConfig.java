package com.zhuawa.shop.goods.cache;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.zhuawa.shop.goods.cache.heavykeeper.HeavyKeeper;
import com.zhuawa.shop.goods.cache.heavykeeper.TopK;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.concurrent.TimeUnit;

/**
 * 多级缓存基础设施装配。
 *
 * <p>这里承载 {@code @EnableScheduling}，而不是加在 {@code GoodsApp} 上，
 * 目的是把缓存相关的改动收敛在 cache 包内，避免与业务侧同时改启动类产生冲突。</p>
 *
 * <p>两个 {@code @Bean} 都在这个配置类里声明（而不是放在 CacheManager 的方法上），
 * 这样 CacheManager 可以用构造器注入拿到它们，单测里也可以直接 new 出替身对象。</p>
 *
 * @author cache-dev
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(CacheConfig.CacheProperties.class)
public class CacheConfig {

    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    /**
     * 热点 key 检测器（HeavyKeeper，迁移自 yu-like）。
     *
     * @param properties 缓存参数
     * @return TopK 实例，单机维度，进程内共享
     */
    @Bean
    public TopK hotKeyDetector(CacheProperties properties) {
        log.info("初始化 HeavyKeeper 热点检测器: k={}, width={}, depth={}, decay={}, minCount={}, fadingIntervalMs={}",
                properties.getTopk(), properties.getWidth(), properties.getDepth(),
                properties.getDecay(), properties.getMinCount(), properties.getFadingIntervalMs());
        return new HeavyKeeper(
                properties.getTopk(),
                properties.getWidth(),
                properties.getDepth(),
                properties.getDecay(),
                properties.getMinCount());
    }

    /**
     * Caffeine 本地缓存（L1）。
     *
     * <p>maximumSize 限制单机内存占用；expireAfterWrite 保证即使热点判定过期，
     * 本地也不会无限期持有旧值。</p>
     *
     * @param properties 缓存参数
     * @return 本地缓存
     */
    @Bean
    public Cache<String, Object> localCache(CacheProperties properties) {
        return Caffeine.newBuilder()
                .maximumSize(properties.getLocalMaximumSize())
                .expireAfterWrite(properties.getLocalExpireSeconds(), TimeUnit.SECONDS)
                .build();
    }

    /**
     * {@code zhuawa.cache.*} 配置项。
     *
     * <p>Java 8 环境，不使用 Lombok，getter/setter 手写；kebab-case 与 yml 一一对应。</p>
     */
    @ConfigurationProperties(prefix = "zhuawa.cache")
    public static class CacheProperties {

        /** 只保留最热的 k 个 key。 */
        private int topk = 100;

        /** 哈希桶宽度。 */
        private int width = 100000;

        /** 哈希表深度。 */
        private int depth = 5;

        /** 衰减系数。 */
        private double decay = 0.92D;

        /** 计数低于该值不进入 TopK。 */
        private int minCount = 10;

        /** 本地缓存最大条目数。 */
        private long localMaximumSize = 1000L;

        /** 本地缓存写入后过期秒数。 */
        private long localExpireSeconds = 300L;

        /** Redis 中商品详情的过期秒数。 */
        private long redisExpireSeconds = 1800L;

        /** 热点衰减周期（毫秒），与 @Scheduled fixedRate 对应，默认 20 秒。 */
        private long fadingIntervalMs = 20000L;

        public int getTopk() {
            return topk;
        }

        public void setTopk(int topk) {
            this.topk = topk;
        }

        public int getWidth() {
            return width;
        }

        public void setWidth(int width) {
            this.width = width;
        }

        public int getDepth() {
            return depth;
        }

        public void setDepth(int depth) {
            this.depth = depth;
        }

        public double getDecay() {
            return decay;
        }

        public void setDecay(double decay) {
            this.decay = decay;
        }

        public int getMinCount() {
            return minCount;
        }

        public void setMinCount(int minCount) {
            this.minCount = minCount;
        }

        public long getLocalMaximumSize() {
            return localMaximumSize;
        }

        public void setLocalMaximumSize(long localMaximumSize) {
            this.localMaximumSize = localMaximumSize;
        }

        public long getLocalExpireSeconds() {
            return localExpireSeconds;
        }

        public void setLocalExpireSeconds(long localExpireSeconds) {
            this.localExpireSeconds = localExpireSeconds;
        }

        public long getRedisExpireSeconds() {
            return redisExpireSeconds;
        }

        public void setRedisExpireSeconds(long redisExpireSeconds) {
            this.redisExpireSeconds = redisExpireSeconds;
        }

        public long getFadingIntervalMs() {
            return fadingIntervalMs;
        }

        public void setFadingIntervalMs(long fadingIntervalMs) {
            this.fadingIntervalMs = fadingIntervalMs;
        }
    }
}
