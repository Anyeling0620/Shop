package com.zhuawa.shop.goods.dao;

import com.zhuawa.shop.goods.model.Brand;
import tk.mybatis.mapper.common.Mapper;

public interface BrandDao extends Mapper<Brand> {
//    @Select("select * from brand where id=#{id}")
//    Brand selectById(@Param("id") long id);
//
//    @Insert("insert into brand (name, begin_letter, create_time, update_time) values (#{name}, #{beginLetter}, now(), now())")
//    @SelectKey(keyColumn = "id", keyProperty = "id", resultType = long.class, before = false, statement = "select last_insert_id()")
//    long insert(Brand brand);
//
//    @Update("update brand set name=#{name}, begin_letter=#{beginLetter}, update_time=now() where id=#{id}")
//    void update(Brand brand);
//
//    @Delete("delete from brand where id=#{id}")
//    void deleteById(@Param("id")long id);
}
