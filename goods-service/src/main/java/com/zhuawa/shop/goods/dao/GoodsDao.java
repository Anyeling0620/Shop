package com.zhuawa.shop.goods.dao;

import com.zhuawa.shop.goods.model.Goods;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
import tk.mybatis.mapper.common.Mapper;

public interface GoodsDao extends Mapper<Goods> {

    @Update("update goods set stock=stock-#{num} where id=#{goodsId} and stock>=#{num}")
    int decrStock(@Param("num")int num, @Param("goodsId")long goodsId);
}
