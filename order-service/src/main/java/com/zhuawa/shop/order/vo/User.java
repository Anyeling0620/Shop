package com.zhuawa.shop.order.vo;

import com.alibaba.fastjson.JSONObject;
import io.swagger.models.auth.In;

public class User {
    private int id;
    private String mobile;
    private String avatar;
    private String nickname;

    public User() {

    }

    public User(JSONObject userInfo) {
        this.id = (Integer) userInfo.get("id");
        this.nickname = userInfo.getString("nickname");
        this.avatar = userInfo.getString("avatar");
        this.mobile = userInfo.getString("mobile");
    }

    public int getId() {
        return id;
    }

    public void setId(int id) {
        this.id = id;
    }

    public String getMobile() {
        return mobile;
    }

    public void setMobile(String mobile) {
        this.mobile = mobile;
    }

    public String getAvatar() {
        return avatar;
    }

    public void setAvatar(String avatar) {
        this.avatar = avatar;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }
}
