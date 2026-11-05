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

    /**
     * 取某商品的「当前场次」（session_id 最大的一场），为兼容既有调用方而保留。
     * <p>
     * 需要精确到某一场的地方请用 {@link #getByGoodsIdAndSession(long, int)}。
     */
    public SeckillGoods getByGoodsId(long goodsId) {
        SeckillGoods goods = seckillGoodsDao.getByGoodsId(goodsId);
        if (goods == null) {
            throw new GlobalException(CodeMsg.SECKILL_GOODS_NOT_EXIST);
        }
        return goods;
    }

    /**
     * 精确取「某商品的某一场次」。场次是判重与扣库存的必需维度，
     * 查不到时等同于商品不存在 —— 不能退化成"随便取一场"。
     */
    public SeckillGoods getByGoodsIdAndSession(long goodsId, int sessionId) {
        SeckillGoods goods = seckillGoodsDao.getByGoodsIdAndSession(goodsId, sessionId);
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

    public int reduceStock(long goodsId, int sessionId) {
        return seckillGoodsDao.reduceStock(goodsId, sessionId);
    }
}
