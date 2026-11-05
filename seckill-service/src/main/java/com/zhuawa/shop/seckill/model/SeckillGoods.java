package com.zhuawa.shop.seckill.model;

import java.math.BigDecimal;
import java.util.Date;

/**
 * 秒杀商品视图：goods 与 goods_seckill 联查结果
 */
public class SeckillGoods {

    private Long goodsId;
    /**
     * 场次编号：同一商品可以开多场秒杀，靠 (goodsId, sessionId) 唯一定位一场。
     * <p>
     * 为什么用 Integer 而不是 long：这是一次联查结果的投影字段，缺失时保持 null
     * 能立刻暴露"某条 SQL 忘了带 session_id"，而不是被 0 悄悄掩盖。
     */
    private Integer sessionId;
    private String name;
    private String title;
    private String img;
    private String detail;
    private BigDecimal price;
    private Integer stock;
    private BigDecimal priceSeckill;
    private Integer stockSeckill;
    private Date startTime;
    private Date endTime;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getImg() {
        return img;
    }

    public void setImg(String img) {
        this.img = img;
    }

    public String getDetail() {
        return detail;
    }

    public void setDetail(String detail) {
        this.detail = detail;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public Integer getStock() {
        return stock;
    }

    public void setStock(Integer stock) {
        this.stock = stock;
    }

    public BigDecimal getPriceSeckill() {
        return priceSeckill;
    }

    public void setPriceSeckill(BigDecimal priceSeckill) {
        this.priceSeckill = priceSeckill;
    }

    public Integer getStockSeckill() {
        return stockSeckill;
    }

    public void setStockSeckill(Integer stockSeckill) {
        this.stockSeckill = stockSeckill;
    }

    public Date getStartTime() {
        return startTime;
    }

    public void setStartTime(Date startTime) {
        this.startTime = startTime;
    }

    public Date getEndTime() {
        return endTime;
    }

    public void setEndTime(Date endTime) {
        this.endTime = endTime;
    }
}
