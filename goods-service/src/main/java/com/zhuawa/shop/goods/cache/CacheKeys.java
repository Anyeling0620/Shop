package com.zhuawa.shop.goods.cache;

/**
 * 商品缓存 key 常量。
 *
 * <p>命名风格与 seckill-service 的 {@code seckill:path:} / {@code seckill:stock:}
 * 保持"模块:业务:标识"的一致格式，但前缀改用 {@code goods:detail:}，
 * 避免与秒杀侧的 key 混在一起（同一套 redis，靠前缀区分归属）。</p>
 *
 * <p><b>实际使用的结构是单键 String</b>：{@code goods:detail:{goodsId}} → JSON 字符串，
 * 由 {@code CacheManager} 的单键形态方法（{@code get/put/evict/multiGet/putAll}）读写。
 * 批量也是同一批 key 的 String 形态（mget / pipeline set），不存在 Hash 字段。</p>
 *
 * <p>下面的 {@link #DETAIL_FIELD} 与 {@link #localKey(String, String)} 属于 <b>Hash 形态的预留</b>：
 * {@code CacheManager} 里确实实现了 hashKey + fieldKey 的存取方法，但商品详情当前<b>没有</b>
 * 业务调用方使用它们。保留是为了兼容已存在的代码与将来可能的多字段扩展
 * （例如在同一个商品 hash 下再存销量、版本号），<b>不要删除</b>；但也不要误以为
 * 商品详情缓存走的是 Hash——排障时请以 {@code goods:detail:{goodsId}} 这个单键为准。</p>
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
