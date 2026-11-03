package com.zhuawa.shop.order.model;

import com.fasterxml.jackson.annotation.JsonFormat;

import javax.persistence.Column;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import java.util.Date;

public class Orders {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  @Column(name = "id")
  @JsonFormat(shape = JsonFormat.Shape.STRING)
  private Long id;

  private Long userId;
  private String receiveAddress;
  private Integer payType;
  private String consumerMsg;
  private Long totalPrice;
  private Long discountPrice;
  private Long actualPrice;
  private Integer status;
  private Date createTime;
  private Date updateTime;

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public Long getUserId() {
    return userId;
  }

  public void setUserId(Long userId) {
    this.userId = userId;
  }

  public String getReceiveAddress() {
    return receiveAddress;
  }

  public void setReceiveAddress(String receiveAddress) {
    this.receiveAddress = receiveAddress;
  }

  public Integer getPayType() {
    return payType;
  }

  public void setPayType(Integer payType) {
    this.payType = payType;
  }

  public String getConsumerMsg() {
    return consumerMsg;
  }

  public void setConsumerMsg(String consumerMsg) {
    this.consumerMsg = consumerMsg;
  }

  public Long getTotalPrice() {
    return totalPrice;
  }

  public void setTotalPrice(Long totalPrice) {
    this.totalPrice = totalPrice;
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

  public Integer getStatus() {
    return status;
  }

  public void setStatus(Integer status) {
    this.status = status;
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
}
