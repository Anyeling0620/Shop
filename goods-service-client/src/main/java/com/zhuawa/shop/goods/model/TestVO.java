package com.zhuawa.shop.goods.model;

public class TestVO {
    private long id;
    private String name;

    public TestVO() {
    }

    public TestVO(long id, String name) {
        this.id = id;
        this.name = name;
    }

    public long getId() {
        return id;
    }

    public void setId(long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
