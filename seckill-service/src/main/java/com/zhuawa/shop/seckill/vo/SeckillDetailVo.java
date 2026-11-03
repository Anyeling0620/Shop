package com.zhuawa.shop.seckill.vo;

import com.zhuawa.shop.seckill.model.SeckillGoods;

/**
 * 秒杀商品详情 VO
 */
public class SeckillDetailVo {

    private SeckillGoods goods;
    /** 0 未开始 1 进行中 2 已结束 */
    private int seckillStatus;
    /** 距秒杀开始剩余秒数，-1 表示已结束 */
    private int remainSeconds;

    public SeckillGoods getGoods() {
        return goods;
    }

    public void setGoods(SeckillGoods goods) {
        this.goods = goods;
    }

    public int getSeckillStatus() {
        return seckillStatus;
    }

    public void setSeckillStatus(int seckillStatus) {
        this.seckillStatus = seckillStatus;
    }

    public int getRemainSeconds() {
        return remainSeconds;
    }

    public void setRemainSeconds(int remainSeconds) {
        this.remainSeconds = remainSeconds;
    }
}
