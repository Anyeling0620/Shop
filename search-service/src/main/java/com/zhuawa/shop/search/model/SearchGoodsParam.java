package com.zhuawa.shop.search.model;

import java.util.Map;

public class SearchGoodsParam {
    private String key;
    private String category;
    private String brand;
    private Map<String, String> specsValueMap;
    private long minPrice;
    private long maxPrice;
    private String orderField;
    private String orderType;

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getBrand() {
        return brand;
    }

    public void setBrand(String brand) {
        this.brand = brand;
    }

    public Map<String, String> getSpecsValueMap() {
        return specsValueMap;
    }

    public void setSpecsValueMap(Map<String, String> specsValueMap) {
        this.specsValueMap = specsValueMap;
    }

    public long getMinPrice() {
        return minPrice;
    }

    public void setMinPrice(long minPrice) {
        this.minPrice = minPrice;
    }

    public long getMaxPrice() {
        return maxPrice;
    }

    public void setMaxPrice(long maxPrice) {
        this.maxPrice = maxPrice;
    }

    public String getOrderField() {
        return orderField;
    }

    public void setOrderField(String orderField) {
        this.orderField = orderField;
    }

    public String getOrderType() {
        return orderType;
    }

    public void setOrderType(String orderType) {
        this.orderType = orderType;
    }

    @Override
    public String toString() {
        return "SearchGoodsParam{" +
                "key='" + key + '\'' +
                ", category='" + category + '\'' +
                ", brand='" + brand + '\'' +
                ", specsValueMap=" + specsValueMap +
                ", minPrice=" + minPrice +
                ", maxPrice=" + maxPrice +
                ", orderField='" + orderField + '\'' +
                ", orderType='" + orderType + '\'' +
                '}';
    }
}
