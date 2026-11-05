package com.zhuawa.shop.seckill.rabbitmq;

import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.utils.SeckillUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 秒杀「预扣名额」的补偿器：把 Lua 预扣走的那 1 个库存名额安全地还回去。
 * <p>
 * 为什么要抽出独立组件，而不是在 Controller / MQReceiver 里各写一遍：
 * 1. 补偿点不止一处（MQ 发送失败、消费端商品不存在、消费端 DB 无货、消费端落单异常），
 *    每处都要做"库存 +1 + 清判重标记 + 幂等"三件事，复制粘贴必然漏；
 * 2. 补偿失败必须能被统一识别并告警 —— 它意味着 Redis 与 DB 的库存开始漂移，
 *    这是比"少卖一单"严重得多的事。
 */
@Component
public class SeckillStockCompensator {

    private static final Logger logger = LoggerFactory.getLogger(SeckillStockCompensator.class);

    @Autowired
    RedisService redisService;

    /**
     * 归还闸门 key 的存活秒数。
     * <p>
     * 它只需要覆盖"一次预扣从发出到最终被确认失败/成功"的最长时间窗口，不需要等于订单超时时间。
     * 取值与 order-mark TTL 解耦：闸门过短会导致迟到的重投消息重复归还（超卖），
     * 过长只是多占一点 redis 内存，因此这里给一个足够宽裕的独立配置项。
     */
    @Value("${zhuawa.seckill.rollback-gate-ttl-seconds:86400}")
    long rollbackGateTtlSeconds = 86400L;

    /**
     * 生成一次预扣的唯一标识。发送 MQ 之前生成，随消息一起持久化，
     * 消费端与发送端共用它作为幂等闸门，保证一次预扣最多被归还一次。
     */
    public String newRequestId(long userId, long goodsId, int sessionId) {
        return userId + ":" + goodsId + ":" + sessionId + ":" + SeckillUtil.uuid();
    }

    /**
     * 归还一次预扣名额。
     * <p>
     * <b>幂等保证</b>：闸门 key 由 requestId 唯一确定。Lua 脚本里先做
     * {@code SET gate 1 NX EX}，只有第一次调用能置闸成功，后续同样的 requestId
     * 一律返回 {@link RedisService#COMPENSATE_DUPLICATE} 且不做任何写操作。
     * 因此即便 MQ 重投导致同一条消息被处理两次，或发送端 catch 与消费端失败分支
     * 先后对同一次预扣发起补偿，库存也只会被 +1 一次。
     * <p>
     * <b>不做无条件 INCR 的原因</b>：如果判重标记已经不在了（说明这次预扣早已归还、
     * 或标记 TTL 已过期），再 +1 就是凭空造库存；如果库存 key 整体丢失，+1 只会造出一个
     * 错误的小值。这两种情况脚本都会拒绝 +1 并返回专门的结果码，交给这里记日志告警。
     * <p>
     * 补偿本身抛出的异常一律吞掉：它是在异常处理路径上被调用的，
     * 再抛只会把原始失败原因盖掉；且补偿失败不能反过来影响主流程的响应
     * （此时这单本来就已经失败了）。失败通过日志暴露，由人工/对账兜底。
     *
     * @param userId    用户 id
     * @param goodsId   商品 id
     * @param sessionId 场次，用于拼判重 key
     * @param requestId 本次预扣的幂等标识；为空时退化为按用户维度拼一个，
     *                  保证旧消息（不带 requestId）也能补偿，只是幂等粒度变粗
     * @param reason    触发补偿的原因，仅用于日志定位
     * @return true 表示本次调用后"名额已经归还到位"（含幂等命中，即之前就已归还）；
     *         false 表示没有归还成功，redis 与 DB 的库存可能已漂移，需要人工介入
     */
    public boolean rollback(long userId, long goodsId, int sessionId, String requestId, String reason) {
        // 库存 key 必须带场次，且必须与预扣时（SeckillController.doSeckill）完全同构：
        // 预扣扣的是 seckill:stock:{goodsId}:{sessionId}，归还却只 +1 到 seckill:stock:{goodsId} 的话，
        // 结果不是"还错地方"，而是"两个都错"——本该回补的场次少卖，另一个 key 上凭空多出名额。
        // 注意这里只改 key 拼装，补偿的业务语义（幂等闸门、失败分支判断）一概不动。
        String stockKey = RedisKeys.stockKey(goodsId, sessionId);
        String orderMarkKey = RedisKeys.SECKILL_ORDER_MARK + userId + ":" + goodsId + ":" + sessionId;
        String gateKey = RedisKeys.SECKILL_STOCK_ROLLBACK + buildGateSuffix(userId, goodsId, sessionId, requestId);
        try {
            long code = redisService.seckillCompensateStock(stockKey, orderMarkKey, gateKey, rollbackGateTtlSeconds);
            if (code == RedisService.COMPENSATE_ROLLED_BACK) {
                logger.warn("秒杀名额已归还. userId={}, goodsId={}, sessionId={}, requestId={}, reason={}",
                        userId, goodsId, sessionId, requestId, reason);
                return true;
            }
            if (code == RedisService.COMPENSATE_DUPLICATE) {
                // 幂等命中：这次预扣的名额之前就已经还过了。对调用方而言"已归还"这个结果成立，
                // 但必须记日志 —— 若这里频繁出现，说明链路上有重复触发补偿的地方，值得排查。
                logger.info("秒杀名额重复归还请求，已幂等忽略. userId={}, goodsId={}, sessionId={}, requestId={}, reason={}",
                        userId, goodsId, sessionId, requestId, reason);
                return true;
            }
            if (code == RedisService.COMPENSATE_MARK_GONE) {
                // 判重标记没了：可能 TTL 到期，也可能被别的路径删掉了。此时不确定这个名额
                // 是否还"被持有"，加回去就有超卖风险，因此宁可少卖也不多卖，转人工对账。
                logger.error("秒杀名额归还未执行：判重标记已不存在，需人工核对库存. userId={}, goodsId={}, sessionId={}, requestId={}, reason={}",
                        userId, goodsId, sessionId, requestId, reason);
                return false;
            }
            if (code == RedisService.COMPENSATE_STOCK_KEY_MISSING) {
                // 库存 key 整体丢失（redis 被清空/淘汰）。此时无法确定 +1 后的基准值，
                // 不做补偿，等下次预热/人工校准。
                logger.error("秒杀名额归还未执行：库存 key 不存在，需人工核对库存. userId={}, goodsId={}, sessionId={}, requestId={}, reason={}",
                        userId, goodsId, sessionId, requestId, reason);
                return false;
            }
            logger.error("秒杀名额归还返回未知结果码 {}，需人工核对库存. userId={}, goodsId={}, sessionId={}, requestId={}",
                    code, userId, goodsId, sessionId, requestId);
            return false;
        } catch (Exception e) {
            // 补偿是在失败路径上调用的，绝不能让这里的异常覆盖掉原始失败原因
            logger.error("秒杀名额归还异常，库存可能已漂移，需人工核对. userId={}, goodsId={}, sessionId={}, requestId={}, reason={}",
                    userId, goodsId, sessionId, requestId, reason, e);
            return false;
        }
    }

    /**
     * 判断"这次预扣的名额是否已经归还过"。
     * <p>
     * 消费端用它挡住一个很隐蔽的重复消费场景：上次消费失败并已成功回补，但 ack 没发出去，
     * Broker 重投同一条消息。若不拦住，就会拿着一个<b>已经还回去</b>的名额再下一次单 ——
     * 相当于凭空多卖一件。正常路径下闸门 key 不存在，本方法恒返回 false。
     * <p>
     * 读 redis 失败时返回 false（即"当作没归还过，继续正常流程"）：宁可让流程往前走
     * （最坏是重复消费时被后面的订单幂等检查拦住），也不要因为读失败把正常订单丢掉。
     */
    public boolean isRolledBack(long userId, long goodsId, int sessionId, String requestId) {
        String gateKey = RedisKeys.SECKILL_STOCK_ROLLBACK + buildGateSuffix(userId, goodsId, sessionId, requestId);
        try {
            return redisService.hasKey(gateKey);
        } catch (Exception e) {
            logger.warn("查询归还闸门失败，按未归还处理. userId={}, goodsId={}, sessionId={}, requestId={}",
                    userId, goodsId, sessionId, requestId, e);
            return false;
        }
    }

    /**
     * 旧消息没有 requestId 时的退化方案：用业务维度拼一个稳定后缀。
     * <p>
     * 代价是幂等粒度变粗（同一用户在标记存活期内只能补偿一次），但这恰好与
     * "判重标记本身也是一人一单"的语义对齐，不会造成重复加库存。
     */
    private String buildGateSuffix(long userId, long goodsId, int sessionId, String requestId) {
        if (requestId == null || requestId.trim().isEmpty()) {
            return userId + ":" + goodsId + ":" + sessionId + ":legacy";
        }
        return requestId;
    }
}
