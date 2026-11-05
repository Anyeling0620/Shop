package com.zhuawa.shop.seckill.redis;

/**
 * 秒杀相关 redis key 前缀
 * <p>
 * <b>库存与无货标记的 key 拼装统一收在 {@link #stockKey} / {@link #goodsOverKey} 两个方法里，
 * 调用方不要再手写字符串。</b>原因：场次（sessionId）是后加的一个维度，一旦散落在各处手写，
 * 漏掉 sessionId 的地方会静默退化成"所有场次共享同一份库存"，既不报错也不易察觉，
 * 排查成本极高。这跟 {@code SeckillService} 把 path / orderId 的拼装收在一处是同一个理由。
 * <p>
 * <b>【上线前必读】旧 key 需要人工清理一次。</b>
 * 本次改造把库存与无货标记从「商品级」升级为「场次级」，key 格式变了：
 * <pre>
 *   库存      seckill:stock:{goodsId}          -&gt; seckill:stock:{goodsId}:{sessionId}
 *   无货标记  seckill:goodsOver:{goodsId}      -&gt; seckill:goodsOver:{goodsId}:{sessionId}
 * </pre>
 * 新代码只读新格式，旧格式的 key 不会被读取、也不会被自动删除，属于纯垃圾数据。
 * 这里<b>刻意不写自动清理逻辑</b>：清理必须删 key，而"按前缀批量删"与"误删新 key"
 * 只隔着一个通配符，由部署脚本在发布时人工做一次、可回看、可复核，比藏在启动代码里安全得多。
 * <p>
 * 清理时请注意区分格式（旧格式冒号分段更少，新格式末尾一定多一段场次），
 * <b>不要</b>直接 {@code DEL seckill:stock:*} / {@code DEL seckill:goodsOver:*}——
 * 那样会把刚预热好的新 key 一并删掉，导致秒杀集体回源、甚至短暂售罄误判。可行做法：
 * <ol>
 *   <li>{@code SCAN 0 MATCH seckill:stock:* COUNT 1000} 拉出候选，人工筛掉末尾带场次的新 key 后再 DEL；</li>
 *   <li>或者干脆什么都不做 —— 旧 key 都是没有 TTL 的长期 key（{@link RedisService#setIfAbsent(String, String)}），
 *       它们不会自然过期，会长期占一点内存但不再影响任何业务逻辑。</li>
 * </ol>
 * 见 {@code SeckillController#init()} 中同一处说明。
 */
public class RedisKeys {

    /** 秒杀接口随机 path： + userId_goodsId_sessionId，60s 过期（path 是某一场的入场券，必须带场次） */
    public static final String SECKILL_PATH = "seckill:path:";

    /**
     * redis 预减库存前缀： + goodsId:sessionId
     * <p>
     * 必须带场次：DB 侧 {@code reduceStock} 已按 (goodsId, sessionId) 扣减，
     * 而初始化预热写的是「每条 goods_seckill 记录（即每个场次）」各自的库存。
     * 若 key 仍是商品级，多场次上线后所有场次会共享同一份计数：
     * 第二场直接复用第一场扣剩的数字，既不按场重置，也会把 A 场的销量算到 B 场的账上。
     * <p>
     * 拼 key 请用 {@link #stockKey(long, int)}。
     */
    public static final String SECKILL_STOCK = "seckill:stock:";

    /** setnx 判重标记： + userId:goodsId:sessionId（场次必须参与，否则跨场次会被同一个标记挡住） */
    public static final String SECKILL_ORDER_MARK = "seckill:orderMark:";

    /** 秒杀结果 orderId 缓存： + userId:goodsId:sessionId（不带场次会让用户看到上一场的历史订单） */
    public static final String SECKILL_ORDER_ID = "seckill:orderId:";

    /**
     * 商品无货标记前缀： + goodsId:sessionId
     * <p>
     * 必须带场次：这个标记的语义是「本场没货了，后续请求直接短路」。
     * 若仍是商品级，"第一场售罄"会把"第二场"也一起判成售罄 —— 用户进第二场看到的
     * 是无货提示，而那边其实还有货。注意它不是永久状态：下一场是另一个 key，天然不受影响。
     * <p>
     * 拼 key 请用 {@link #goodsOverKey(long, int)}。
     */
    public static final String SECKILL_GOODS_OVER = "seckill:goodsOver:";

    /**
     * 预扣名额归还的幂等闸门： + {requestId}（一次预扣一个 key）
     * <p>
     * 存在即代表"这次预扣的库存已经归还过了"。之所以必须按 requestId 而不是用户维度，
     * 是因为归还可能被重复触发（MQ 重投、多分支都走补偿），用户维度会把
     * "失败后立刻重新抢购"的第二次预扣误判成重复归还。
     * 详见 {@link RedisService#seckillCompensateStock}。
     */
    public static final String SECKILL_STOCK_ROLLBACK = "seckill:stockRollback:";

    private RedisKeys() {
    }

    /**
     * 拼某一商品<b>某一场</b>的 redis 库存 key。
     * <p>
     * 所有读写库存的地方（预热、预扣、补偿）都必须走这里，保证三者指的是同一个 key ——
     * 只要有一处漏了 sessionId，补偿就会把名额还到另一个 key 上：
     * 该场库存少卖、另一个 key 凭空多出一个名额，且两边都不会报错。
     *
     * @param goodsId   商品 id
     * @param sessionId 场次编号；无法确定时调用方应显式降级为 0（见 SeckillController 的说明）
     */
    public static String stockKey(long goodsId, int sessionId) {
        return SECKILL_STOCK + goodsId + ":" + sessionId;
    }

    /**
     * 拼某一商品<b>某一场</b>的无货标记 key。
     * <p>
     * 写入方（Controller / MQReceiver）与读取方（SeckillService）必须用同一套拼法，
     * 否则会出现"置了标记但永远读不到"或"读到的永远是别的场次的标记"。
     */
    public static String goodsOverKey(long goodsId, int sessionId) {
        return SECKILL_GOODS_OVER + goodsId + ":" + sessionId;
    }
}
