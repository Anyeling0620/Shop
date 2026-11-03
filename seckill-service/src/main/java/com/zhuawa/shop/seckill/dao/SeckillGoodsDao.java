package com.zhuawa.shop.seckill.dao;

import com.zhuawa.shop.seckill.model.SeckillGoods;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface SeckillGoodsDao {

    @Select("select g.id as goods_id, g.name, g.title, g.img, g.detail, g.price, g.stock, " +
            "gs.price_seckill, gs.stock_seckill, gs.start_time, gs.end_time " +
            "from goods_seckill gs left join goods g on gs.goods_id = g.id")
    List<SeckillGoods> listSeckillGoods();

    @Select("select g.id as goods_id, g.name, g.title, g.img, g.detail, g.price, g.stock, " +
            "gs.price_seckill, gs.stock_seckill, gs.start_time, gs.end_time " +
            "from goods_seckill gs left join goods g on gs.goods_id = g.id where g.id = #{goodsId}")
    SeckillGoods getByGoodsId(@Param("goodsId") long goodsId);

    /**
     * 数据库扣减秒杀库存，stock_seckill > 0 条件防止超卖；影响行数为 0 表示无货
     */
    @Update("update goods_seckill set stock_seckill = stock_seckill - 1 " +
            "where goods_id = #{goodsId} and stock_seckill > 0")
    int reduceStock(@Param("goodsId") long goodsId);
}
