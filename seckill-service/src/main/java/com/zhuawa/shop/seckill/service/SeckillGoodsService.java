package com.zhuawa.shop.seckill.service;

import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.api.GoodsApi;
import com.zhuawa.shop.goods.model.Goods;
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

    /** goods-service 中商品状态：0 上架 */
    private static final int GOODS_STATUS_ON_SALE = 0;

    @Autowired
    SeckillGoodsDao seckillGoodsDao;

    @Autowired
    GoodsApi goodsApi;

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
     * 通过 Feign 调 goods-service，校验商品存在且处于上架状态
     */
    public void checkGoodsOnSale(long goodsId) {
        Result<Goods> result = goodsApi.get(goodsId);
        if (result == null || result.getCode() != 0 || result.getData() == null) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
        if (result.getData().getStatus() != GOODS_STATUS_ON_SALE) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_OFF_SHELF);
        }
    }

    public int reduceStock(long goodsId) {
        return seckillGoodsDao.reduceStock(goodsId);
    }
}
