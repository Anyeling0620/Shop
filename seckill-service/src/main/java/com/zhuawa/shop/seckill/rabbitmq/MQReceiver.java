package com.zhuawa.shop.seckill.rabbitmq;

import com.alibaba.fastjson.JSON;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.seckill.model.OrderSeckill;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.service.SeckillGoodsService;
import com.zhuawa.shop.seckill.service.SeckillOrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MQReceiver {

    private static final Logger logger = LoggerFactory.getLogger(MQReceiver.class);

    @Autowired
    SeckillGoodsService seckillGoodsService;

    @Autowired
    SeckillOrderService seckillOrderService;

    @Autowired
    RedisService redisService;

    @RabbitListener(queues = MQConfig.SECKILL_QUEUE)
    public void receive(String message) {
        logger.info("receive seckill message: {}", message);
        SeckillMessage sm = JSON.parseObject(message, SeckillMessage.class);
        long userId = sm.getUserId();
        long goodsId = sm.getGoodsId();

        SeckillGoods goods;
        try {
            goods = seckillGoodsService.getByGoodsId(goodsId);
        } catch (GlobalException e) {
            // 商品不存在，打点后直接 ack，避免无限重试
            logger.error("seckill goods not exist, goodsId: {}", goodsId);
            return;
        }
        // 数据库层面无货，标记无货并 ack
        if (goods.getStockSeckill() == null || goods.getStockSeckill() <= 0) {
            redisService.set(RedisKeys.SECKILL_GOODS_OVER + goodsId, "true");
            logger.info("seckill stock is empty, goodsId: {}", goodsId);
            return;
        }
        // 重复消息幂等处理
        OrderSeckill exists = seckillOrderService.getOrderSeckill(userId, goodsId);
        if (exists != null) {
            return;
        }
        // 减库存 + 落单（事务内，库存扣不动抛异常回滚，消息重新入队）
        seckillOrderService.createOrder(userId, goods);
    }
}
