package com.zhuawa.shop.seckill.model;

import java.util.Date;

/**
 * 秒杀订单关系表，user_id + goods_id + session_id 有联合唯一索引防重复下单。
 * <p>
 * 场次粒度：同一用户在同一商品的同一场次内只能一单，跨场次可以再抢。
 * 改造前唯一索引是 (user_id, goods_id)，意味着同一用户同一商品**永远**只能抢一次，
 * 商品开第二场时该用户会被数据库的唯一索引直接挡掉 —— 所以唯一索引必须扩到含 session_id。
 */
public class OrderSeckill {

    private Long id;
    private Long orderId;
    private Long userId;
    private Long goodsId;
    /**
     * 场次编号，与 goods_seckill.session_id 对应。
     * <p>
     * 下单时必须把"当时那一刻的场次"固化到订单行上，而不是事后按时间回算：
     * 场次窗口会被人为调整，一旦回算就会把历史订单算到另一场去，导致一人一单的判据漂移。
     */
    private Integer sessionId;
    private Date createTime;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public Long getGoodsId() {
        return goodsId;
    }

    public void setGoodsId(Long goodsId) {
        this.goodsId = goodsId;
    }

    public Integer getSessionId() {
        return sessionId;
    }

    public void setSessionId(Integer sessionId) {
        this.sessionId = sessionId;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }
}
