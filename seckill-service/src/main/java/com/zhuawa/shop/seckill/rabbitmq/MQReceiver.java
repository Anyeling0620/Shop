package com.zhuawa.shop.seckill.rabbitmq;

import com.alibaba.fastjson.JSON;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.seckill.model.OrderSeckill;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.service.SeckillGoodsService;
import com.zhuawa.shop.seckill.service.SeckillOrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 秒杀下单消息消费者。
 * <p>
 * <b>本类最重要的一条纪律：只有"预扣成功但订单最终没建成"才回补库存。</b>
 * 必须在每个 return 分支上先判断这属于哪一类语义，因为两类分支的 return 长得很像、后果却相反：
 * <ul>
 *   <li><b>幂等命中</b>（订单已存在 / 名额早就归还过）：这单"已经成交"或"已经处理完毕"，
 *       属于成功语义。<b>绝不能回补</b> —— 订单在，再把库存加回去就是白送一件，直接超卖。</li>
 *   <li><b>真正失败</b>（商品不存在 / DB 无货 / 落单抛异常且事务已回滚）：订单确实没建成，
 *       预扣走的那 1 个名额必须还回去，否则名额永久蒸发（少卖），且 redis 与 DB 库存永久漂移。</li>
 * </ul>
 * 回补统一走 {@link SeckillStockCompensator}，它用一个 requestId 闸门保证"一次预扣最多归还一次"，
 * 所以即便本方法被 MQ 重投重复调用，也不会把库存加两次。
 */
@Service
public class MQReceiver {

    private static final Logger logger = LoggerFactory.getLogger(MQReceiver.class);

    @Autowired
    SeckillGoodsService seckillGoodsService;

    @Autowired
    SeckillOrderService seckillOrderService;

    @Autowired
    RedisService redisService;

    @Autowired
    SeckillStockCompensator stockCompensator;

    @RabbitListener(queues = MQConfig.SECKILL_QUEUE)
    public void receive(String message) {
        logger.info("receive seckill message: {}", message);
        SeckillMessage sm = JSON.parseObject(message, SeckillMessage.class);
        long userId = sm.getUserId();
        long goodsId = sm.getGoodsId();
        // 向后兼容：升级前入队的旧消息体里没有 sessionId 字段，fastjson 反序列化时
        // 这个 int 字段保持默认值 0 —— 正好就是历史数据的 0 号场，因此 key 会落在
        // seckill:stock:{goodsId}:0 / seckill:goodsOver:{goodsId}:0 上，
        // 与改造前"只有 0 号场"的语义完全一致。这里不需要（也不应该）做 null 判断：
        // 字段是原始类型，永远拿不到 null，不会 NPE；真正需要防的是"取错场次"，而 0 号场正是旧消息的场次。
        int sessionId = sm.getSessionId();
        String requestId = sm.getRequestId();

        // 先做一次"这条消息的名额是不是已经归还过"的幂等预检。
        // 场景：消费端上次处理到一半失败并已回补，但消息因为 ack 失败被重投；
        // 若不拦住，这次会拿一个已归还的名额再下一次单 —— 多卖。
        // 闸门 key 只在"确实归还过"时存在，正常路径下这里恒为 false，不影响性能以外的任何语义。
        if (stockCompensator.isRolledBack(userId, goodsId, sessionId, requestId)) {
            logger.warn("秒杀消息对应的名额已归还，丢弃该重投消息. userId={}, goodsId={}, sessionId={}, requestId={}",
                    userId, goodsId, sessionId, requestId);
            return;
        }

        SeckillGoods goods;
        try {
            // 场次取自消息本身，不取"当前场"：消息在队列里排队期间可能已经跨场次，
            // 按当前场去落单会把上一场扣的库存记到下一场头上。
            goods = seckillGoodsService.getByGoodsIdAndSession(goodsId, sessionId);
        } catch (GlobalException e) {
            // 【真正失败】商品（或该场次）不存在，订单不可能建成。打点 + 归还名额后直接 ack，
            // 避免无限重试；不归还就等于把这个名额吞掉了。
            logger.error("seckill goods not exist, goodsId: {}, sessionId: {}", goodsId, sessionId);
            stockCompensator.rollback(userId, goodsId, sessionId, requestId, "goods not exist on consume");
            return;
        }

        // 幂等检查必须排在"DB 无货"之前：如果订单已经存在，说明这单早就成功了，
        // 此时哪怕 DB 库存刚好扣到 0，也绝不能走后面的回补分支。
        OrderSeckill exists = seckillOrderService.getOrderSeckill(userId, goodsId, sessionId);
        if (exists != null) {
            // 【成功语义 / 幂等命中】订单已存在 —— 重复消费（MQ 至少一次投递）的典型情况。
            // 库存该扣的已经扣过，名额也已经消耗掉，<b>绝对不能回补</b>，否则直接超卖。
            logger.info("秒杀订单已存在，幂等忽略（不回补库存）. userId={}, goodsId={}, sessionId={}, orderId={}",
                    userId, goodsId, sessionId, exists.getOrderId());
            return;
        }

        // 数据库层面无货，标记无货并 ack
        if (goods.getStockSeckill() == null || goods.getStockSeckill() <= 0) {
            // 【真正失败】DB 真的没货了（redis 预扣与 DB 之间存在时间差，可能超额预扣到这一步）。
            // 订单没建成，把预扣的名额还回 redis，让后面的人还能用这个位置尝试真实的下单机会。
            // 无货标记按 (goodsId, sessionId) 写：消息里的 sessionId 就是这一单所属的场次，
            // 按商品粒度写会把本场售罄扩散成"整个商品售罄"，下一场直接卖不出去。
            // 旧消息没有 sessionId 字段时反序列化为 0，落在 0 号场的 key 上，
            // 与改造前只有 0 号场的语义一致，不会 NPE，也不会写错场次。
            redisService.set(RedisKeys.goodsOverKey(goodsId, sessionId), "true");
            logger.info("seckill stock is empty, goodsId: {}, sessionId: {}", goodsId, sessionId);
            stockCompensator.rollback(userId, goodsId, sessionId, requestId, "db stock empty on consume");
            return;
        }

        try {
            // 减库存 + 落单（事务内，库存扣不动抛异常回滚）
            seckillOrderService.createOrder(userId, goods);
        } catch (Exception e) {
            // 【关键：异常之后必须再判一次"订单到底建成没有"，不能见异常就回补】
            // createOrder 是 @Transactional：抛异常时事务已回滚，正常情况下订单确实没建成。
            // 但有一类异常恰恰意味着"订单其实已经在了"——同一 (user_id, goods_id, session_id)
            // 的并发重复消费，后到的那条会在插入 order_seckill 时撞唯一索引抛异常，
            // 而那条订单是前一条消息建成的、并且它已经消耗了同一个预扣名额。
            // 此时若回补，就等于把一个已经卖出去的名额又加回库存 —— 直接超卖。
            // 所以这里复查一次：订单确实存在 -> 成功语义，不回补；查不到 -> 真失败，回补。
            OrderSeckill afterFailure = null;
            try {
                afterFailure = seckillOrderService.getOrderSeckill(userId, goodsId, sessionId);
            } catch (Exception queryError) {
                // 复查本身失败：无法确认订单是否建成。此时宁可少卖也不多卖 ——
                // 不回补，保证不会凭空增长库存，并打出可告警的日志由人工核对。
                logger.error("落单异常后复查订单失败，为避免超卖不回补库存，需人工核对. userId={}, goodsId={}, sessionId={}",
                        userId, goodsId, sessionId, queryError);
                return;
            }
            if (afterFailure != null) {
                logger.warn("落单抛异常但订单已存在（并发重复消费撞唯一索引），按成功处理，不回补. " +
                                "userId={}, goodsId={}, sessionId={}, orderId={}",
                        userId, goodsId, sessionId, afterFailure.getOrderId());
                return;
            }
            // 【真正失败】事务已回滚，DB 库存和订单都没有变化，预扣名额必须归还，
            // 否则名额永久丢失（少卖），且 redis 与 DB 库存永久漂移。
            // 注意：不能只 catch GlobalException，DB 连接异常等同样意味着没建成订单。
            logger.error("秒杀落单失败，事务已回滚，归还预扣名额. userId={}, goodsId={}, sessionId={}, requestId={}",
                    userId, goodsId, sessionId, requestId, e);
            stockCompensator.rollback(userId, goodsId, sessionId, requestId, "create order failed on consume");
        }
    }
}
