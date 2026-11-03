package com.zhuawa.shop.gateway.filter;

import com.zhuawa.shop.gateway.utils.JwtUtil;
import io.jsonwebtoken.Claims;
import org.apache.commons.lang.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpCookie;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.Arrays;

@Component
public class AuthFilter implements GlobalFilter, Ordered {

    private static final Logger logger = LoggerFactory.getLogger(AuthFilter.class);

    private static final String loginURL = "http://localhost:8081/login.html";

    @Value("${auth.skip.urls}")
    private String[] skipAuthUrls;

    public static final String COOKIE_NAME_TOKEN = "zhuawa-shop-token";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        //1.获取请求对象
        ServerHttpRequest request = exchange.getRequest();
        //2.获取响应对象
        ServerHttpResponse response = exchange.getResponse();

        //3.判断 是否需要直接放行
        logger.info("uri: {}", request.getURI());
        if (Arrays.asList(skipAuthUrls).contains(request.getURI().toString())) {
            return chain.filter(exchange);
        }

        //4 校验
        //4.1 从头header中获取令牌数据
        String token = request.getHeaders().getFirst(COOKIE_NAME_TOKEN);

        if (StringUtils.isEmpty(token)) {
            //4.2 从cookie中中获取令牌数据
            HttpCookie first = request.getCookies().getFirst(COOKIE_NAME_TOKEN);
            if (first != null) {
                token = first.getValue();//就是令牌的数据
            }
        }

        if (StringUtils.isEmpty(token)) {
            //4.3 从请求参数中获取令牌数据
            token = request.getQueryParams().getFirst(COOKIE_NAME_TOKEN);
        }

        if (StringUtils.isEmpty(token)) {
            //4.4. 如果没有数据    没有登录,要重定向到登录到页面
            response.setStatusCode(HttpStatus.FORBIDDEN);//403
            //location 指定的就是路径
            response.getHeaders().set("Location", loginURL + "?From=" + request.getURI().toString());
            return response.setComplete();
        }


        //5 解析令牌数据 ( 判断解析是否正确,正确 就放行 ,否则 结束)

        try {
            Claims claims = JwtUtil.parseJWT(token);
            logger.info("authed user info: {}", claims);
        } catch (Exception e) {
            logger.error("parse token error:", e);
            //解析失败
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return response.setComplete();
        }

        //添加头信息 传递给 各个微服务()
        request.mutate().header(COOKIE_NAME_TOKEN,  token);
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return 0;
    }
}
