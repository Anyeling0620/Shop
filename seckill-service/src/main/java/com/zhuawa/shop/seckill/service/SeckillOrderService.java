package com.zhuawa.shop.seckill.service;

import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.seckill.dao.OrderDao;
import com.zhuawa.shop.seckill.dao.SeckillGoodsDao;
import com.zhuawa.shop.seckill.model.Order;
import com.zhuawa.shop.seckill.model.OrderSeckill;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;

@Service
public class SeckillOrderService {

    @Autowired
    OrderDao orderDao;

    @Autowired
    SeckillGoodsDao seckillGoodsDao;

    @Autowired
    RedisService redisService;

    public OrderSeckill getOrderSeckill(long userId, long goodsId, int sessionId) {
        return orderDao.getOrderSeckill(userId, goodsId, sessionId);
    }

    /**
     * 秒杀落库：减秒杀库存 + 插入订单 + 插入秒杀订单（事务内，库存扣不动则抛异常回滚）
     */
    @Transactional
    public Order createOrder(long userId, SeckillGoods goods) {
        if (goods == null || goods.getGoodsId() == null) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
        // 场次必须已经确定：没带场次就落库等于把「一人一单」的判据退回商品级，
        // 那样第二场会永远写不进去。宁可直接失败重试，也不写一条归属不明的订单。
        if (goods.getSessionId() == null) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
        int sessionId = goods.getSessionId();
        // 1. 减库存，stock_seckill > 0 条件防超卖；影响行数为 0 说明无货，抛异常回滚事务。
        //    按 (goods_id, session_id) 扣，避免多场次时扣错行。
        int updated = seckillGoodsDao.reduceStock(goods.getGoodsId(), sessionId);
        if (updated == 0) {
            throw new GlobalException(CodeMsg.SECKILL_OVER);
        }
        // 2. 插入订单
        Order order = new Order();
        order.setUserId(userId);
        order.setGoodsId(goods.getGoodsId());
        order.setGoodsName(goods.getName());
        order.setGoodsCount(1);
        order.setGoodsPrice(goods.getPriceSeckill());
        order.setCreateFrom(0);
        order.setStatus(0);
        order.setCreateTime(new Date());
        long orderId = orderDao.insertOrder(order);
        order.setId(orderId);
        // 3. 插入秒杀订单（user_id+goods_id+session_id 唯一索引兜底防重复）
        OrderSeckill orderSeckill = new OrderSeckill();
        orderSeckill.setUserId(userId);
        orderSeckill.setGoodsId(goods.getGoodsId());
        orderSeckill.setSessionId(sessionId);
        orderSeckill.setOrderId(orderId);
        orderSeckill.setCreateTime(new Date());
        orderDao.insertOrderSeckill(orderSeckill);
        // 4. 缓存秒杀结果（场次级，与 getSeckillResult 的读取 key 必须一致）
        redisService.set(RedisKeys.SECKILL_ORDER_ID + userId + ":" + goods.getGoodsId() + ":" + sessionId,
                String.valueOf(orderId));
        return order;
    }
}
