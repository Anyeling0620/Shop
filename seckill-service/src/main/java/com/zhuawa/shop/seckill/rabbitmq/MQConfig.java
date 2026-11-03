package com.zhuawa.shop.seckill.rabbitmq;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Direct 模式：秒杀下单异步化
 */
@Configuration
public class MQConfig {

    public static final String SECKILL_QUEUE = "seckill.queue";

    @Bean
    public Queue seckillQueue() {
        // durable 队列，防止 MQ 重启丢消息
        return new Queue(SECKILL_QUEUE, true);
    }
}
