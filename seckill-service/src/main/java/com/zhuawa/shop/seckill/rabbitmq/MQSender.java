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

    public void sendSeckillMessage(SeckillMessage sm) {
        String msg = JSON.toJSONString(sm);
        logger.info("send seckill message: {}", msg);
        amqpTemplate.convertAndSend(MQConfig.SECKILL_QUEUE, msg);
    }
}
