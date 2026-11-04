package com.zhuawa.shop.seckill.service;

import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.seckill.dao.SeckillGoodsDao;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SeckillGoodsService {

    private static final Logger logger = LoggerFactory.getLogger(SeckillGoodsService.class);

    @Autowired
    SeckillGoodsDao seckillGoodsDao;

    public List<SeckillGoods> listSeckillGoods() {
        return seckillGoodsDao.listSeckillGoods();
    }

    public SeckillGoods getByGoodsId(long goodsId) {
        SeckillGoods goods = seckillGoodsDao.getByGoodsId(goodsId);
        if (goods == null) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
        return goods;
    }

    /**
     * 校验秒杀商品是否可秒杀。
     * <p>
     * 秒杀商品的数据源是本库（seckill.goods + seckill.goods_seckill），与 goods-service 的
     * goods.goods 是两套完全独立的数据（两套 id 体系，字段结构也不同），因此这里做本地校验，
     * 不再 Feign 调用 goods-service —— 否则必然查不到、秒杀详情页全部报 500504。
     */
    public void checkGoodsOnSale(long goodsId) {
        if (seckillGoodsDao.countOnSale(goodsId) <= 0) {
            logger.warn("seckill goods not on sale, goodsId: {}", goodsId);
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
    }

    public int reduceStock(long goodsId) {
        return seckillGoodsDao.reduceStock(goodsId);
    }
}
