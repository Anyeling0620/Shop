package com.zhuawa.shop.order.vo;

import com.zhuawa.shop.order.model.CartItem;

import java.io.Serializable;

public class CartItemVO implements Serializable {
    private long itemId;
    /** 购物车行对应的商品 ID：/cart/incr、/cart/decr、/cart/set 都以它为键 */
    private long goodsId;
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
        this.goodsId = cartItem.getGoodsId() == null ? 0L : cartItem.getGoodsId();
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

    public long getGoodsId() {
        return goodsId;
    }

    public void setGoodsId(long goodsId) {
        this.goodsId = goodsId;
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
