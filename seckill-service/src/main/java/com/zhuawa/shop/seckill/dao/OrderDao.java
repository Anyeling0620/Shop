package com.zhuawa.shop.seckill.dao;

import com.zhuawa.shop.seckill.model.Order;
import com.zhuawa.shop.seckill.model.OrderSeckill;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectKey;

public interface OrderDao {

    @Select("select * from order_seckill where user_id = #{userId} and goods_id = #{goodsId}")
    OrderSeckill getOrderSeckill(@Param("userId") long userId, @Param("goodsId") long goodsId);

    @Insert("insert into `order`(user_id, goods_id, goods_name, goods_count, goods_price, " +
            "create_from, status, create_time) values(" +
            "#{userId}, #{goodsId}, #{goodsName}, #{goodsCount}, #{goodsPrice}, " +
            "#{createFrom}, #{status}, #{createTime})")
    @SelectKey(keyColumn = "id", keyProperty = "id", resultType = long.class,
            before = false, statement = "select last_insert_id()")
    long insertOrder(Order order);

    @Insert("insert into order_seckill(user_id, goods_id, order_id) values(#{userId}, #{goodsId}, #{orderId})")
    int insertOrderSeckill(OrderSeckill orderSeckill);
}
