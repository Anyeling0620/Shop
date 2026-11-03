package com.zhuawa.shop.search.model;

import java.util.*;

public class SearchGoodsRes {
    private List<GoodsEsInfo> goodsEsInfoList = new ArrayList<>();
    private List<String> categoryList = new ArrayList<>();
    private List<String> brandList = new ArrayList<>();
    private Map<String, Set<String>> specsList = new HashMap<>();
    private String category;
    private String brand;
    private Map<String, String> specsValueMap;
    private long total;
    private long page;
    private long totalPages;

    public List<GoodsEsInfo> getGoodsEsInfoList() {
        return goodsEsInfoList;
    }

    public void setGoodsEsInfoList(List<GoodsEsInfo> goodsEsInfoList) {
        this.goodsEsInfoList = goodsEsInfoList;
    }

    public List<String> getCategoryList() {
        return categoryList;
    }

    public void setCategoryList(List<String> categoryList) {
        this.categoryList = categoryList;
    }

    public List<String> getBrandList() {
        return brandList;
    }

    public void setBrandList(List<String> brandList) {
        this.brandList = brandList;
    }

    public Map<String, Set<String>> getSpecsList() {
        return specsList;
    }

    public void setSpecsList(Map<String, Set<String>> specsList) {
        this.specsList = specsList;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public long getPage() {
        return page;
    }

    public void setPage(long page) {
        this.page = page;
    }

    public long getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(long totalPages) {
        this.totalPages = totalPages;
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
}
