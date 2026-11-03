package com.zhuawa.shop.common.access;

public class UserContext {

    private static ThreadLocal<LoginUser> userHolder = new ThreadLocal<>();

    public static void setUser(LoginUser user) {
        userHolder.set(user);
    }

    public static LoginUser getUser() {
        return userHolder.get();
    }

    public static void clear() {
        userHolder.remove();
    }

}
