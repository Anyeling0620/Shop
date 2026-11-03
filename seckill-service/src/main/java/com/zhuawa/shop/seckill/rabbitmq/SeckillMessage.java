package com.zhuawa.shop.seckill.rabbitmq;

/**
 * 秒杀 MQ 消息体
 */
public class SeckillMessage {

    private long userId;
    private long goodsId;

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
    }

    public long getGoodsId() {
        return goodsId;
    }

    public void setGoodsId(long goodsId) {
        this.goodsId = goodsId;
    }
}
