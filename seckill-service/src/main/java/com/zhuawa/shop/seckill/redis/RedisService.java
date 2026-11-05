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

    /**
     * 预扣名额归还（补偿）的结果码。
     * <p>
     * 之所以把"没归还"的两种情况也各给一个码，而不是统一返回 boolean：
     * 补偿失败是线上最需要知道的事（要么少卖、要么即将超卖），日志里必须能区分
     * "这单确实还回去了" 和 "想还但不敢还"。调用方据此决定日志级别与是否告警。
     */
    /** 本次确实归还了：库存 +1，并清掉了该用户的判重标记 */
    public static final long COMPENSATE_ROLLED_BACK = 1L;
    /** 幂等命中：同一个 requestId 之前已经归还过，本次什么都没做 */
    public static final long COMPENSATE_DUPLICATE = 0L;
    /** 判重标记已不存在（TTL 到期或已被删）：不能再 +1，否则凭空多卖 */
    public static final long COMPENSATE_MARK_GONE = 2L;
    /** 库存 key 不存在（Redis 库存整体丢失）：不 +1，只清理判重标记 */
    public static final long COMPENSATE_STOCK_KEY_MISSING = 3L;

    @Autowired
    StringRedisTemplate redisTemplate;

    /**
     * 秒杀原子预扣库存脚本。
     * <p>
     * 用 RedisScript&lt;Long&gt; + StringRedisTemplate：脚本的 keys/args 会按 String 序列化，
     * 与项目现有 key（如 seckill:stock:1:0）完全一致。若换成默认 RedisTemplate，
     * 序列化器是 JDK 序列化，拼出来的 key 在 redis 里是 \\xAC\\xED... 开头的一串乱码，
     * 和 @PostConstruct 里 StringRedisTemplate 写入的库存 key 对不上。
     */
    private RedisScript<Long> seckillStockScript;

    /**
     * 预扣名额归还脚本（见 lua/seckill_compensate.lua）。
     * <p>
     * 归还必须也是一个脚本：它要同时做「幂等闸 + 删判重标记 + 库存 +1」三件事，
     * 拆成多次调用就会在两次调用之间留下"还了库存但标记还在"（用户被永久拦住）
     * 或"重复归还"（多卖）的中间态 —— 这跟预扣本身必须原子是同一个道理。
     */
    private RedisScript<Long> seckillCompensateScript;

    /**
     * 启动时把脚本读进内存，避免每次秒杀都读一遍 classpath 文件
     */
    @PostConstruct
    public void initSeckillStockScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("lua/seckill_stock.lua"));
        script.setResultType(Long.class);
        this.seckillStockScript = script;

        DefaultRedisScript<Long> compensateScript = new DefaultRedisScript<>();
        compensateScript.setLocation(new ClassPathResource("lua/seckill_compensate.lua"));
        compensateScript.setResultType(Long.class);
        this.seckillCompensateScript = compensateScript;
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
     * 库存回补（单纯 INCR，不做任何判断）。
     * <p>
     * 注意：秒杀链路的补偿<b>不要</b>直接用这个裸方法，请用
     * {@link #seckillCompensateStock} —— 裸 INCR 既不幂等、也不清判重标记，
     * 还可能在库存 key 丢失时凭空造出一个"stock=1"的 key。
     * 这里保留它只是为了不破坏既有调用方。
     */
    public long incr(String key) {
        Long v = redisTemplate.opsForValue().increment(key);
        return v == null ? 0L : v;
    }

    /**
     * 归还一次预扣的秒杀名额：幂等 + 清判重标记 + 库存 +1，一次 Lua 完成。
     * <p>
     * 幂等性怎么保证（这是本方法最关键的契约）：
     * 每个预扣请求在发送 MQ 之前都会生成一个 requestId，归还时把它带进来当闸门 key。
     * 脚本里先 {@code SET gate 1 NX EX}，只有第一次调用能成功置闸，后续同一个 requestId
     * 的归还一律返回 {@link #COMPENSATE_DUPLICATE} 且不做任何写操作。
     * 这样无论归还是被发送端 catch 触发、还是被消费端某条分支触发，甚至 MQ 重投导致
     * 同一条消息被消费两次，都不会出现"同一个名额还两次"。
     * <p>
     * 为什么闸门 key 用 requestId 而不是 userId:goodsId：
     * 如果按用户维度加闸，用户"抢一次失败 → 立刻再抢"时，第二次预扣恰好落在第一次
     * 闸门 key 的 TTL 内，就会以"幂等命中"为由拒绝归还，第二个名额再次蒸发。
     * 用 requestId 则一次预扣对应一个闸门，语义清晰且互不干扰。
     *
     * @param stockKey   库存 key
     * @param orderMarkKey 判重 key
     * @param gateKey    本次预扣专属的归还闸门 key
     * @param expireSeconds 闸门 key 的过期秒数（覆盖"迟到归还"的最长可能时间即可）
     * @return {@link #COMPENSATE_ROLLED_BACK} 已归还；
     *         {@link #COMPENSATE_DUPLICATE} 幂等命中，未做任何事；
     *         {@link #COMPENSATE_MARK_GONE} 判重标记已不在，不敢 +1；
     *         {@link #COMPENSATE_STOCK_KEY_MISSING} 库存 key 缺失，不敢 +1
     */
    public long seckillCompensateStock(String stockKey, String orderMarkKey,
                                       String gateKey, long expireSeconds) {
        List<String> keys = new ArrayList<>(3);
        keys.add(stockKey);
        keys.add(orderMarkKey);
        keys.add(gateKey);
        String[] args = new String[]{String.valueOf(expireSeconds)};
        Long result = redisTemplate.execute(seckillCompensateScript, keys, (Object[]) args);
        return result == null ? COMPENSATE_DUPLICATE : result.longValue();
    }

    /**
     * 秒杀原子预扣库存：判重 + 校验库存 + 扣减 + 写判重标记，一次 Lua 调用完成。
     * <p>
     * 依赖 redis 单线程执行脚本的特性保证原子性，杜绝原来 decr 与 setnx 两次调用之间
     * 的竞态：重复请求被拦下时库存绝不会被扣走。
     *
     * @param stockKey       库存 key（seckill:stock:{goodsId}:{sessionId}，场次由调用方拼进 key；
     *                       脚本本身不感知场次，只认"一个 key 就是一份库存"）
     * @param orderMarkKey   一人一单判重 key（seckill:orderMark:{userId}:{goodsId}:{sessionId}，
     *                       场次由调用方拼进 key，脚本本身不感知场次，仍是"一个 key 判一次重"）
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
