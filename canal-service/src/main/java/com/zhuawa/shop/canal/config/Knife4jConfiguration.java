package com.zhuawa.shop.canal.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import springfox.documentation.builders.ApiInfoBuilder;
import springfox.documentation.builders.PathSelectors;
import springfox.documentation.builders.RequestHandlerSelectors;
import springfox.documentation.spi.DocumentationType;
import springfox.documentation.spring.web.plugins.Docket;
import springfox.documentation.swagger2.annotations.EnableSwagger2WebMvc;

/**
 * knife4j 接口文档配置，文档地址 http://localhost:18005/doc.html
 */
@Configuration
@EnableSwagger2WebMvc
public class Knife4jConfiguration {

    @Bean
    public Docket canalApi() {
        return new Docket(DocumentationType.SWAGGER_2)
                .apiInfo(new ApiInfoBuilder()
                        .title("Canal 服务 API")
                        .description("canal-service 对外接口（MQ 测试用）")
                        .version("1.0")
                        .build())
                .groupName("Canal服务")
                .select()
                // 只扫描本服务的 controller 包
                .apis(RequestHandlerSelectors.basePackage("com.zhuawa.shop.canal.controller"))
                .paths(PathSelectors.any())
                .build();
    }
}
