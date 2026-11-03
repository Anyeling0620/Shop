package com.zhuawa.shop.search.rabbitmq;

import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MQConfig {
    public static final String CANAL_QUEUE = "canal.queue";
    @Bean
    public Queue canalQueue() {
        return new Queue(CANAL_QUEUE, true);
    }
}
