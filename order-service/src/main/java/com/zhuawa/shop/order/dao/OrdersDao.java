package com.zhuawa.shop.order.dao;

import com.zhuawa.shop.order.model.Orders;
import com.zhuawa.shop.order.vo.OrderVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import tk.mybatis.mapper.common.Mapper;

public interface OrdersDao extends Mapper<Orders> {

    @Select("select * from orders where id=#{id}")
    OrderVO selectVOById(@Param("id")long id);
}
