package com.zhuawa.shop.common.rabbitmq;

public enum OperationType {
    ADD(1,"ADD"),
    DELETE(2, "DELETE"),
    UPDATE(3, "UPDATE");

    private int index;
    private String name;

    OperationType(int index, String name) {
        this.index = index;
        this.name = name;
    }

    public int getIndex() {
        return index;
    }

    public void setIndex(int index) {
        this.index = index;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
