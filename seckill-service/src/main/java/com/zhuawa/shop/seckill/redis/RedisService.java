package com.zhuawa.shop.seckill.redis;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

/**
 * 基于 StringRedisTemplate 的简化版 redis 操作封装
 */
@Service
public class RedisService {

    @Autowired
    StringRedisTemplate redisTemplate;

    public String get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    public void set(String key, String value) {
        redisTemplate.opsForValue().set(key, value);
    }

    public void set(String key, String value, long expireSeconds) {
        redisTemplate.opsForValue().set(key, value, expireSeconds, TimeUnit.SECONDS);
    }

    /**
     * setnx，用于秒杀判重
     */
    public boolean setIfAbsent(String key, String value, long expireSeconds) {
        Boolean ok = redisTemplate.opsForValue()
                .setIfAbsent(key, value, expireSeconds, TimeUnit.SECONDS);
        return Boolean.TRUE.equals(ok);
    }

    /**
     * 预减库存
     */
    public long decr(String key) {
        Long v = redisTemplate.opsForValue().decrement(key);
        return v == null ? 0L : v;
    }

    /**
     * 库存回补
     */
    public long incr(String key) {
        Long v = redisTemplate.opsForValue().increment(key);
        return v == null ? 0L : v;
    }

    public boolean hasKey(String key) {
        Boolean has = redisTemplate.hasKey(key);
        return Boolean.TRUE.equals(has);
    }

    public void delete(String key) {
        redisTemplate.delete(key);
    }
}
