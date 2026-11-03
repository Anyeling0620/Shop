package com.zhuawa.shop.seckill.utils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

public class SeckillUtil {

    public static String uuid() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    public static String md5(String src) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(src.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("md5 error", e);
        }
    }

    private SeckillUtil() {
    }
}
