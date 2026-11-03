package com.zhuawa.shop.goods;

import com.zhuawa.shop.common.utils.IdWorker;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import tk.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@EnableEurekaClient
@MapperScan(basePackages = {"com.zhuawa.shop.goods.dao"})
@ComponentScan(basePackages = {"com.zhuawa.shop.common", "com.zhuawa.shop.goods"})
public class GoodsApp {
    public static void main(String[] args) {
        SpringApplication.run(GoodsApp.class, args);
    }

    @Bean
    public IdWorker idWorker() {
        return new IdWorker();
    }
}
