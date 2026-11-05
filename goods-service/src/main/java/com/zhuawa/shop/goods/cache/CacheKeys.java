package com.zhuawa.shop.goods.cache;

/**
 * 商品缓存 key 常量。
 *
 * <p>命名风格与 seckill-service 的 {@code seckill:path:} / {@code seckill:stock:}
 * 保持"模块:业务:标识"的一致格式，但前缀改用 {@code goods:detail:}，
 * 避免与秒杀侧的 key 混在一起（同一套 redis，靠前缀区分归属）。</p>
 *
 * <p>Redis 侧使用 Hash 结构：hashKey = {@link #GOODS_DETAIL_PREFIX} + goodsId，
 * fieldKey 目前固定为 {@link #DETAIL_FIELD}，为后续扩展（如加销量、加版本号字段）
 * 留出同一商品多字段共存的空间。</p>
 *
 * @author cache-dev
 */
public final class CacheKeys {

    /** 商品详情缓存 hashKey 前缀，完整形态：goods:detail:{goodsId} */
    public static final String GOODS_DETAIL_PREFIX = "goods:detail:";

    /** 商品详情在 hash 中的默认 field */
    public static final String DETAIL_FIELD = "detail";

    private CacheKeys() {
    }

    /**
     * 拼接 hashKey：goods:detail:{goodsId}
     *
     * @param goodsId 商品 id，允许为 null（返回前缀，调用方不应传 null）
     * @return hashKey
     */
    public static String goodsDetailHashKey(Object goodsId) {
        return GOODS_DETAIL_PREFIX + goodsId;
    }

    /**
     * 拼接本地缓存的复合 key：hashKey:fieldKey
     *
     * <p>Caffeine 只有一层 key 空间，因此把 hashKey 与 fieldKey 拼成一个字符串，
     * 保证同一 hashKey 下不同 field 不会互相覆盖。</p>
     *
     * @param hashKey  redis hash key
     * @param fieldKey redis hash field
     * @return 本地缓存 key
     */
    public static String localKey(String hashKey, String fieldKey) {
        return hashKey + ":" + fieldKey;
    }
}
