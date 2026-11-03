package com.zhuawa.shop.seckill;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@EnableEurekaClient
@EnableFeignClients(basePackages = {"com.zhuawa.shop.goods.api"})
@MapperScan(basePackages = {"com.zhuawa.shop.seckill.dao"})
@ComponentScan(basePackages = {"com.zhuawa.shop.common", "com.zhuawa.shop.seckill"})
public class SeckillApp {
    public static void main(String[] args) {
        SpringApplication.run(SeckillApp.class, args);
    }
}
