package com.zhuawa.shop.seckill.dao;

import com.zhuawa.shop.seckill.model.Order;
import com.zhuawa.shop.seckill.model.OrderSeckill;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectKey;

public interface OrderDao {

    /**
     * 幂等查询，粒度为「用户 + 商品 + 场次」。
     * <p>
     * 必须带 session_id：MQ 消息可能重复投递，若只按 user+goods 查，
     * 用户第二场抢购时会被第一场的订单误判成"已下单"而直接 return，导致第二场白抢。
     */
    @Select("select * from order_seckill where user_id = #{userId} and goods_id = #{goodsId} " +
            "and session_id = #{sessionId}")
    OrderSeckill getOrderSeckill(@Param("userId") long userId,
                                 @Param("goodsId") long goodsId,
                                 @Param("sessionId") int sessionId);

    @Insert("insert into `order`(user_id, goods_id, goods_name, goods_count, goods_price, " +
            "create_from, status, create_time) values(" +
            "#{userId}, #{goodsId}, #{goodsName}, #{goodsCount}, #{goodsPrice}, " +
            "#{createFrom}, #{status}, #{createTime})")
    @SelectKey(keyColumn = "id", keyProperty = "id", resultType = long.class,
            before = false, statement = "select last_insert_id()")
    long insertOrder(Order order);

    /**
     * 插入秒杀订单索引。session_id 与唯一索引 (user_id, goods_id, session_id) 配合，
     * 由数据库兜住"同一场次内重复下单"这个并发场景（应用层判重会有窗口）。
     */
    @Insert("insert into order_seckill(user_id, goods_id, session_id, order_id) " +
            "values(#{userId}, #{goodsId}, #{sessionId}, #{orderId})")
    int insertOrderSeckill(OrderSeckill orderSeckill);
}
