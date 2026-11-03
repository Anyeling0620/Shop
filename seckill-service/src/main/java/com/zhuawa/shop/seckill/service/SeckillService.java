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
     * 生成 MD5 随机秒杀 path，redis 保存 60s
     */
    public String createSeckillPath(long userId, long goodsId) {
        String path = SeckillUtil.md5(SeckillUtil.uuid() + "abcdef");
        redisService.set(RedisKeys.SECKILL_PATH + userId + "_" + goodsId, path, 60);
        return path;
    }

    public boolean checkSeckillPath(long userId, long goodsId, String path) {
        if (path == null) {
            return false;
        }
        String pathOld = redisService.get(RedisKeys.SECKILL_PATH + userId + "_" + goodsId);
        return path.equals(pathOld);
    }

    /**
     * 秒杀结果：orderId 成功；-1 失败（无货）；0 排队中
     */
    public long getSeckillResult(long userId, long goodsId) {
        // 1. redis 结果缓存命中直接返回
        String orderIdCache = redisService.get(RedisKeys.SECKILL_ORDER_ID + userId + ":" + goodsId);
        if (orderIdCache != null) {
            return Long.parseLong(orderIdCache);
        }
        // 2. 查库（缓存未命中兜底）
        OrderSeckill orderSeckill = seckillOrderService.getOrderSeckill(userId, goodsId);
        if (orderSeckill != null) {
            redisService.set(RedisKeys.SECKILL_ORDER_ID + userId + ":" + goodsId,
                    String.valueOf(orderSeckill.getOrderId()));
            return orderSeckill.getOrderId();
        }
        // 3. 无单且商品已无货 → 秒杀失败
        if (redisService.hasKey(RedisKeys.SECKILL_GOODS_OVER + goodsId)) {
            return -1;
        }
        // 4. 无单且还有货 → 排队中（MQ 尚未消费完）
        return 0;
    }
}
