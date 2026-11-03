package com.zhuawa.shop.order.model;


import javax.persistence.Column;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import java.util.Date;

public class OrderItem {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id")
  private Long id;

  private Date createTime;
  private Date updateTime;
  private Long cartItemId;
  private Long goodsId;
  private String goodsName;
  private String goodsImage;
  private Long userId;
  private Long orderId;
  private Long price; // total price = unit price * count
  private Long discountPrice;
  private Long actualPrice;
  private Integer count;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
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

  public Long getCartItemId() {
    return cartItemId;
  }

  public void setCartItemId(Long cartItemId) {
    this.cartItemId = cartItemId;
  }

  public Long getGoodsId() {
    return goodsId;
  }

  public void setGoodsId(Long goodsId) {
    this.goodsId = goodsId;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public Long getOrderId() {
    return orderId;
  }

  public void setOrderId(Long orderId) {
    this.orderId = orderId;
  }

  public Long getPrice() {
    return price;
  }

  public void setPrice(Long price) {
    this.price = price;
  }

  public Long getDiscountPrice() {
    return discountPrice;
  }

  public void setDiscountPrice(Long discountPrice) {
    this.discountPrice = discountPrice;
  }

  public Long getActualPrice() {
    return actualPrice;
  }

  public void setActualPrice(Long actualPrice) {
    this.actualPrice = actualPrice;
  }

  public Integer getCount() {
    return count;
  }

  public void setCount(Integer count) {
    this.count = count;
  }

  public String getGoodsName() {
    return goodsName;
  }

  public void setGoodsName(String goodsName) {
    this.goodsName = goodsName;
  }

  public String getGoodsImage() {
    return goodsImage;
  }

  public void setGoodsImage(String goodsImage) {
    this.goodsImage = goodsImage;
  }
}
