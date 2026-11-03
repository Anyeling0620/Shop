package com.zhuawa.shop.order.vo;

import com.zhuawa.shop.order.model.OrderItem;
import com.zhuawa.shop.order.model.Orders;

import java.util.List;

public class OrderVO extends Orders {
    private List<OrderItem> orderItems;

    public List<OrderItem> getOrderItems() {
        return orderItems;
    }

    public void setOrderItems(List<OrderItem> orderItems) {
        this.orderItems = orderItems;
    }
}
