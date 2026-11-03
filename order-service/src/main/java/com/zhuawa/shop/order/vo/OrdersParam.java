package com.zhuawa.shop.order.vo;

import java.util.List;

public class OrdersParam {
    private List<Long> cartItemIds;
    private String receiveAddress;
    private int payType;
    private String consumerMsg;

    public List<Long> getCartItemIds() {
        return cartItemIds;
    }

    public void setCartItemIds(List<Long> cartItemIds) {
        this.cartItemIds = cartItemIds;
    }

    public String getReceiveAddress() {
        return receiveAddress;
    }

    public void setReceiveAddress(String receiveAddress) {
        this.receiveAddress = receiveAddress;
    }

    public int getPayType() {
        return payType;
    }

    public void setPayType(int payType) {
        this.payType = payType;
    }

    public String getConsumerMsg() {
        return consumerMsg;
    }

    public void setConsumerMsg(String consumerMsg) {
        this.consumerMsg = consumerMsg;
    }
}
