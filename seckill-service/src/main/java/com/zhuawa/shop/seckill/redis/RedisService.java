package com.zhuawa.shop.seckill.redis;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 基于 StringRedisTemplate 的简化版 redis 操作封装
 */
@Service
public class RedisService {

    /** 秒杀预扣库存结果：抢购成功 */
    public static final long SECKILL_STOCK_SUCCESS = 1L;
    /** 秒杀预扣库存结果：库存不足 */
    public static final long SECKILL_STOCK_NOT_ENOUGH = 0L;
    /** 秒杀预扣库存结果：重复抢购 */
    public static final long SECKILL_STOCK_REPEAT = -1L;
    /** 秒杀预扣库存结果：库存 key 不存在（尚未预热） */
    public static final long SECKILL_STOCK_NOT_INIT = -2L;

    @Autowired
    StringRedisTemplate redisTemplate;

    /**
     * 秒杀原子预扣库存脚本。
     * <p>
     * 用 RedisScript&lt;Long&gt; + StringRedisTemplate：脚本的 keys/args 会按 String 序列化，
     * 与项目现有 key（如 seckill:stock:1）完全一致。若换成默认 RedisTemplate，
     * 序列化器是 JDK 序列化，拼出来的 key 在 redis 里是 \\xAC\\xED... 开头的一串乱码，
     * 和 @PostConstruct 里 StringRedisTemplate 写入的库存 key 对不上。
     */
    private RedisScript<Long> seckillStockScript;

    /**
     * 启动时把脚本读进内存，避免每次秒杀都读一遍 classpath 文件
     */
    @PostConstruct
    public void initSeckillStockScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("lua/seckill_stock.lua"));
        script.setResultType(Long.class);
        this.seckillStockScript = script;
    }

    public String get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    public void set(String key, String value) {
        redisTemplate.opsForValue().set(key, value);
    }

    public void set(String key, String value, long expireSeconds) {
        redisTemplate.opsForValue().set(key, value, expireSeconds, TimeUnit.SECONDS);
    }

    /**
     * setnx，用于秒杀判重
     */
    public boolean setIfAbsent(String key, String value, long expireSeconds) {
        Boolean ok = redisTemplate.opsForValue()
                .setIfAbsent(key, value, expireSeconds, TimeUnit.SECONDS);
        return Boolean.TRUE.equals(ok);
    }

    /**
     * setnx（{@code SET key value NX}，不带 TTL）。
     * <p>
     * 与上面的带 TTL 重载是两回事：库存 key 是"长期状态"，绝不能带过期时间。
     * 一旦给库存 key 加了 TTL，它会周期性地消失、下一批请求又集体命中 -2 去预热，
     * 等于把预热竞态窗口定期重新打开一次。
     * <p>
     * 之所以需要它：库存 key 缺失时的回源预热必须"只在 key 不存在时写入"。
     * 若用无条件 {@code SET}，并发场景下后到的请求会把它之前别人已经扣减过的库存
     * 原样覆盖回初始值（见 warmUpStock 的竞态时间线），直接导致超卖。
     *
     * @return true 表示本次真的写入了（key 原本不存在）；false 表示 key 已存在、未做任何修改
     */
    public boolean setIfAbsent(String key, String value) {
        Boolean ok = redisTemplate.opsForValue().setIfAbsent(key, value);
        return Boolean.TRUE.equals(ok);
    }

    /**
     * 预减库存
     */
    public long decr(String key) {
        Long v = redisTemplate.opsForValue().decrement(key);
        return v == null ? 0L : v;
    }

    /**
     * 库存回补
     */
    public long incr(String key) {
        Long v = redisTemplate.opsForValue().increment(key);
        return v == null ? 0L : v;
    }

    /**
     * 秒杀原子预扣库存：判重 + 校验库存 + 扣减 + 写判重标记，一次 Lua 调用完成。
     * <p>
     * 依赖 redis 单线程执行脚本的特性保证原子性，杜绝原来 decr 与 setnx 两次调用之间
     * 的竞态：重复请求被拦下时库存绝不会被扣走。
     *
     * @param stockKey       库存 key（seckill:stock:{goodsId}）
     * @param orderMarkKey   一人一单判重 key（seckill:orderMark:{userId}:{goodsId}）
     * @param expireSeconds  判重 key 的过期秒数
     * @return {@link #SECKILL_STOCK_SUCCESS} 抢购成功；
     *         {@link #SECKILL_STOCK_NOT_ENOUGH} 库存不足；
     *         {@link #SECKILL_STOCK_REPEAT} 重复抢购；
     *         {@link #SECKILL_STOCK_NOT_INIT} 库存 key 不存在（未预热）
     */
    public long seckillDeductStock(String stockKey, String orderMarkKey, long expireSeconds) {
        List<String> keys = new ArrayList<>(2);
        keys.add(stockKey);
        keys.add(orderMarkKey);
        // 必须传 String：StringRedisTemplate 的脚本参数序列化器是 StringRedisSerializer，
        // 传 Long 会被当成 String 写入 Lua 的 ARGV，这里显式转字符串保持类型确定
        String[] args = new String[]{String.valueOf(expireSeconds)};
        Long result = redisTemplate.execute(seckillStockScript, keys, (Object[]) args);
        return result == null ? SECKILL_STOCK_NOT_ENOUGH : result.longValue();
    }

    public boolean hasKey(String key) {
        Boolean has = redisTemplate.hasKey(key);
        return Boolean.TRUE.equals(has);
    }

    public void delete(String key) {
        redisTemplate.delete(key);
    }
}
