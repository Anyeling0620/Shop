package com.zhuawa.shop.order;

import com.zhuawa.shop.common.utils.IdWorker;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import tk.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@EnableEurekaClient
@EnableFeignClients(basePackages = {"com.zhuawa.shop.goods.api", "com.zhuawa.shop.user.api"})
@MapperScan(basePackages = {"com.zhuawa.shop.order.dao"})
@ComponentScan(basePackages = {"com.zhuawa.shop.common", "com.zhuawa.shop.order"})
public class OrderApp {
    public static void main(String[] args) {
        SpringApplication.run(OrderApp.class, args);
    }

    @Bean
    public IdWorker idWorker() {
        return new IdWorker();
    }
}
