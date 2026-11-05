package com.zhuawa.shop.seckill.dao;

import com.zhuawa.shop.seckill.model.SeckillGoods;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

public interface SeckillGoodsDao {

    /**
     * 秒杀商品列表（联查 goods 拿商品信息）。
     * <p>
     * ⚠️ 引入场次后语义变化：同一商品配了多场就是多条记录，本方法**不按场次过滤**，
     * 保持「把配置如实列出来」的老行为。是否要收敛成「每个商品只出当前场」属于产品决策，
     * 需要调用方拍板，这里不擅自改语义。
     */
    @Select("select g.id as goods_id, gs.session_id, g.name, g.title, g.img, g.detail, g.price, g.stock, " +
            "gs.price_seckill, gs.stock_seckill, gs.start_time, gs.end_time " +
            "from goods_seckill gs left join goods g on gs.goods_id = g.id " +
            "order by gs.goods_id, gs.session_id")
    List<SeckillGoods> listSeckillGoods();

    /**
     * 取某商品的「当前场次」——为了不改动既有调用方（详情页、库存预热、MQ 消费）的签名而保留。
     * <p>
     * 为什么定义为 session_id 最大的那一场：场次编号是单调递增的编排方式，
     * 编号最大的即最近启用的一场。老数据只有 0 号场，退化成一个商品一条记录，与改造前等价。
     * <p>
     * ⚠️ 这只是"取一个默认场次"的便利方法。需要精确到某一场时（如 MQ 消费、扣库存），
     * 必须用 {@link #getByGoodsIdAndSession(long, int)}，不能依赖这里的取值。
     */
    @Select("select g.id as goods_id, gs.session_id, g.name, g.title, g.img, g.detail, g.price, g.stock, " +
            "gs.price_seckill, gs.stock_seckill, gs.start_time, gs.end_time " +
            "from goods_seckill gs left join goods g on gs.goods_id = g.id " +
            "where g.id = #{goodsId} order by gs.session_id desc limit 1")
    SeckillGoods getByGoodsId(@Param("goodsId") long goodsId);

    /**
     * 精确取「某商品的某一场次」。场次一旦确定就不该再用「当前场」代替，
     * 否则跨场次切换的瞬间会把 Q2 的库存扣到 Q3 的行上。
     */
    @Select("select g.id as goods_id, gs.session_id, g.name, g.title, g.img, g.detail, g.price, g.stock, " +
            "gs.price_seckill, gs.stock_seckill, gs.start_time, gs.end_time " +
            "from goods_seckill gs left join goods g on gs.goods_id = g.id " +
            "where g.id = #{goodsId} and gs.session_id = #{sessionId}")
    SeckillGoods getByGoodsIdAndSession(@Param("goodsId") long goodsId,
                                        @Param("sessionId") int sessionId);

    /**
     * 数据库扣减秒杀库存，stock_seckill > 0 条件防止超卖；影响行数为 0 表示无货。
     * <p>
     * 必须带上 session_id：库存是按场次配置的，只按 goods_id 扣会把不同场次的库存混在一起，
     * 第二场开卖时甚至可能扣到第一场那行上（goods_id 没有唯一索引，可能命中任意一行）。
     */
    @Update("update goods_seckill set stock_seckill = stock_seckill - 1 " +
            "where goods_id = #{goodsId} and session_id = #{sessionId} and stock_seckill > 0")
    int reduceStock(@Param("goodsId") long goodsId, @Param("sessionId") int sessionId);

    /**
     * 校验秒杀商品在本地库是否上架（不区分场次：只要该商品还配着任何一场就算在架）。
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

    /**
     * 校验「某商品的某一场次」是否上架，供已经确定场次的场景使用。
     */
    @Select("select count(*) from goods_seckill gs " +
            "inner join goods g on gs.goods_id = g.id " +
            "where gs.goods_id = #{goodsId} and gs.session_id = #{sessionId}")
    int countOnSaleBySession(@Param("goodsId") long goodsId, @Param("sessionId") int sessionId);
}
