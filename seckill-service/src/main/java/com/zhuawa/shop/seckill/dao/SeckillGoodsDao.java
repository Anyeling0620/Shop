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

    /**
     * 校验秒杀商品在本地库是否上架。
     * <p>
     * 秒杀商品是独立于 goods 表的一批数据（两套 id 体系），因此校验必须查本库 goods_seckill，
     * 不能再去 Feign 调 goods-service。判据：存在 goods_seckill 配置，且 goods 表有对应商品记录。
     *
     * @return 命中条数，0 表示商品不存在或已下架
     */
    @Select("select count(*) from goods_seckill gs " +
            "inner join goods g on gs.goods_id = g.id " +
            "where gs.goods_id = #{goodsId}")
    int countOnSale(@Param("goodsId") long goodsId);
}
