package com.zhuawa.shop.seckill.service;

import com.zhuawa.shop.seckill.model.OrderSeckill;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.utils.SeckillUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SeckillService {

    @Autowired
    RedisService redisService;

    @Autowired
    SeckillOrderService seckillOrderService;

    /**
     * 生成 MD5 随机秒杀 path，redis 保存 60s。
     * <p>
     * path 带上场次：path 是"玩家手里这张一次性门票"，它必须对应某一具体场次。
     * 若不带场次，第一场取到的 path 在 60s 内仍能用来打第二场，
     * 等于绕过了"重新取票"这道节流，与 orderMark 的场次化不同步。
     */
    public String createSeckillPath(long userId, long goodsId, int sessionId) {
        String path = SeckillUtil.md5(SeckillUtil.uuid() + "abcdef");
        redisService.set(seckillPathKey(userId, goodsId, sessionId), path, 60);
        return path;
    }

    public boolean checkSeckillPath(long userId, long goodsId, int sessionId, String path) {
        if (path == null) {
            return false;
        }
        String pathOld = redisService.get(seckillPathKey(userId, goodsId, sessionId));
        return path.equals(pathOld);
    }

    /**
     * 秒杀结果：orderId 成功；-1 失败（无货）；0 排队中。
     * <p>
     * ⚠️ 结果缓存已改为**场次级**：改造前 key 是 userId:goodsId，是整个商品的唯一结果；
     * 现在同一个用户在第一场抢到单、第二场再查，应当查到的是第二场的结果（0 排队中），
     * 而不是第一场的旧 orderId —— 不带场次会让用户看到"上一场的历史订单"，误以为自己本场已抢到。
     */
    public long getSeckillResult(long userId, long goodsId, int sessionId) {
        // 1. redis 结果缓存命中直接返回
        String orderIdCache = redisService.get(seckillOrderIdKey(userId, goodsId, sessionId));
        if (orderIdCache != null) {
            return Long.parseLong(orderIdCache);
        }
        // 2. 查库（缓存未命中兜底）
        OrderSeckill orderSeckill = seckillOrderService.getOrderSeckill(userId, goodsId, sessionId);
        if (orderSeckill != null) {
            redisService.set(seckillOrderIdKey(userId, goodsId, sessionId),
                    String.valueOf(orderSeckill.getOrderId()));
            return orderSeckill.getOrderId();
        }
        // 3. 无单且本场已无货 → 秒杀失败。
        //    无货标记已按 (goodsId, sessionId) 场次化，与 SeckillController / MQReceiver 的写入粒度一致。
        //    改造前它是商品级的，会把"第一场售罄"读成"整个商品售罄"：用户在第二场轮询时
        //    明明还有货、只是 MQ 还没消费完，却会立刻收到 -1（失败），误以为自己没抢到。
        //    注意入参 sessionId 由调用方解析并保证非空（缺省时退化为该商品当前场次 / 旧消息为 0）。
        if (redisService.hasKey(RedisKeys.goodsOverKey(goodsId, sessionId))) {
            return -1;
        }
        // 4. 无单且还有货 → 排队中（MQ 尚未消费完）
        return 0;
    }

    /**
     * 把 key 的拼装收在一处：场次是一个新维度，一旦散落在各处手写，
     * 漏掉 sessionId 的地方会静默退化成"跨场次共享"，排查成本极高。
     */
    private String seckillPathKey(long userId, long goodsId, int sessionId) {
        return RedisKeys.SECKILL_PATH + userId + "_" + goodsId + "_" + sessionId;
    }

    private String seckillOrderIdKey(long userId, long goodsId, int sessionId) {
        return RedisKeys.SECKILL_ORDER_ID + userId + ":" + goodsId + ":" + sessionId;
    }
}
