package com.zhuawa.shop.order.vo;

import com.zhuawa.shop.order.model.CartItem;

import java.io.Serializable;

public class CartItemVO implements Serializable {
    private long itemId;
    private String image;
    private String title;
    private long priceOrigin;
    private long priceNow;
    private int count;
    private long totalPriceOrigin;
    private long totalPriceNow;

    public CartItemVO() {
    }

    public CartItemVO(CartItem cartItem) {
        this.itemId = cartItem.getId();
        this.count = cartItem.getCount();
        this.priceOrigin = cartItem.getPrice();
        this.totalPriceOrigin = cartItem.getPrice() * cartItem.getCount();
    }

    public long getItemId() {
        return itemId;
    }

    public void setItemId(long itemId) {
        this.itemId = itemId;
    }

    public long getPriceNow() {
        return priceNow;
    }

    public void setPriceNow(long priceNow) {
        this.priceNow = priceNow;
    }

    public long getTotalPriceNow() {
        return totalPriceNow;
    }

    public void setTotalPriceNow(long totalPriceNow) {
        this.totalPriceNow = totalPriceNow;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public long getPriceOrigin() {
        return priceOrigin;
    }

    public void setPriceOrigin(long priceOrigin) {
        this.priceOrigin = priceOrigin;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }

    public long getTotalPriceOrigin() {
        return totalPriceOrigin;
    }

    public void setTotalPriceOrigin(long totalPriceOrigin) {
        this.totalPriceOrigin = totalPriceOrigin;
    }
}
