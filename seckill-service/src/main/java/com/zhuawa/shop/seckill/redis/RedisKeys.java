package com.zhuawa.shop.seckill.redis;

/**
 * 秒杀相关 redis key 前缀
 */
public class RedisKeys {

    /** 秒杀接口随机 path： + userId_goodsId，60s 过期 */
    public static final String SECKILL_PATH = "seckill:path:";

    /** redis 预减库存： + goodsId */
    public static final String SECKILL_STOCK = "seckill:stock:";

    /** setnx 判重标记： + userId:goodsId */
    public static final String SECKILL_ORDER_MARK = "seckill:orderMark:";

    /** 秒杀结果 orderId 缓存： + userId:goodsId */
    public static final String SECKILL_ORDER_ID = "seckill:orderId:";

    /** 商品无货标记： + goodsId */
    public static final String SECKILL_GOODS_OVER = "seckill:goodsOver:";

    private RedisKeys() {
    }
}
