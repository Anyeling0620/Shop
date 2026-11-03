package com.zhuawa.shop.canal;

import com.xpand.starter.canal.annotation.EnableCanalClient;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.EnableEurekaClient;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@EnableEurekaClient
@EnableCanalClient
@ComponentScan(basePackages = {"com.zhuawa.shop.common", "com.zhuawa.shop.canal"})
public class CanalApp {
    public static void main(String[] args) {
        SpringApplication.run(CanalApp.class, args);
    }
}
