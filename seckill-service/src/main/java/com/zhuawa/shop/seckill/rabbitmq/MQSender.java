package com.zhuawa.shop.seckill.rabbitmq;

import com.alibaba.fastjson.JSON;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.core.AmqpTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class MQSender {

    private static final Logger logger = LoggerFactory.getLogger(MQSender.class);

    @Autowired
    AmqpTemplate amqpTemplate;

    /**
     * 发送秒杀下单消息。
     * <p>
     * 这里<b>故意不吞异常</b>，直接向上抛：
     * 调用方 {@code SeckillController.doSeckill} 在调用前已经完成了 Redis 预扣（库存 -1 + 判重标记），
     * 如果这里把 Broker 宕机/连接断开的异常静默掉、返回"排队中"，用户会接到一个永远不会有结果的号，
     * 而那份库存已经扣掉且无人知晓 —— 名额永久丢失，Redis 与 DB 库存永久漂移。
     * 因此失败语义必须原样传给调用方，由它执行补偿（归还名额 + 清判重标记）。
     */
    public void sendSeckillMessage(SeckillMessage sm) {
        String msg = JSON.toJSONString(sm);
        logger.info("send seckill message: {}", msg);
        amqpTemplate.convertAndSend(MQConfig.SECKILL_QUEUE, msg);
    }
}
