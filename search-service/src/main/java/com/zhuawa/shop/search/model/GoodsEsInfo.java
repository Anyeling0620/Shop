package com.zhuawa.shop.search.model;

import com.alibaba.fastjson.JSON;
import com.zhuawa.shop.goods.model.Goods;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Mapping;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Document(indexName = "goods_es_info")
@Mapping(mappingPath = "mapping/goods_es_info.json")
public class GoodsEsInfo {
    @Id
    private Long id;

    // @Field 字段的映射 , 注解无效，需要json
    // analyzer 指定索引的是用的分词分词器   searchAnalyzer :搜索的时候使用的分词器
    // type 指定数据类型
    @Field(type = FieldType.Text, analyzer = "ik_smart", searchAnalyzer = "ik_smart")
    private String name;

    private String fullName; // 为了把类似 华为手机 这种搜索结果排在最前面（既包含华为也包含手机）

    private Long price;

    private Long stock;

    // 不用分词， 且不用建立索引
    private String image;

    private Long categoryId;

    private Long brandId;

    // FieldType.Keyword 是一个关键字 (keyword) 表示不分词.
    private String brandName;

    // 用 ik_max_word, 在搜索 电视 时也能匹配到 平板电视， ik_smart 则不行
    private String categoryName;

    private String specsJson;

    private String paramJson;

    private Date createTime;
    private Date updateTime;

    private int status;

    private Map<String, Object> specsMap = new HashMap<>();

    public GoodsEsInfo() {
    }

    public GoodsEsInfo(Goods goods) {
        this.id = goods.getId();
        this.name = goods.getName();
        this.fullName = goods.getName() + " " + goods.getCategoryName() + " " + goods.getBrandName();
        this.price = goods.getPrice();
        this.stock = goods.getStock();
        this.image = goods.getImage();
        this.categoryId = goods.getCategoryId();
        this.brandId = goods.getBrandId();
        this.categoryName = goods.getCategoryName();
        this.brandName = goods.getBrandName();
        this.specsJson = goods.getSpecsJson();
        this.paramJson = goods.getParamJson();
        this.createTime = goods.getCreateTime();
        this.updateTime = goods.getUpdateTime();
        this.status = goods.getStatus();
        this.specsMap = JSON.parseObject(goods.getSpecsJson(), Map.class);
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public Long getPrice() {
        return price;
    }

    public void setPrice(Long price) {
        this.price = price;
    }

    public Long getStock() {
        return stock;
    }

    public void setStock(Long stock) {
        this.stock = stock;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public Long getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Long categoryId) {
        this.categoryId = categoryId;
    }

    public Long getBrandId() {
        return brandId;
    }

    public void setBrandId(Long brandId) {
        this.brandId = brandId;
    }

    public String getBrandName() {
        return brandName;
    }

    public void setBrandName(String brandName) {
        this.brandName = brandName;
    }

    public String getCategoryName() {
        return categoryName;
    }

    public void setCategoryName(String categoryName) {
        this.categoryName = categoryName;
    }

    public String getSpecsJson() {
        return specsJson;
    }

    public void setSpecsJson(String specsJson) {
        this.specsJson = specsJson;
    }

    public String getParamJson() {
        return paramJson;
    }

    public void setParamJson(String paramJson) {
        this.paramJson = paramJson;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }

    public Date getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(Date updateTime) {
        this.updateTime = updateTime;
    }

    public int getStatus() {
        return status;
    }

    public void setStatus(int status) {
        this.status = status;
    }

    public Map<String, Object> getSpecsMap() {
        return specsMap;
    }

    public void setSpecsMap(Map<String, Object> specsMap) {
        this.specsMap = specsMap;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }
}
