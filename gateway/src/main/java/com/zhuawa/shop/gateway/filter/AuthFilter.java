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
import org.springframework.http.HttpMethod;
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

    /**
     * 公开只读接口前缀：商品、类目、品牌、搜索与秒杀的浏览类请求不需要登录。
     * 只放行 GET，以及搜索的 POST 查询；写操作与用户态接口仍然鉴权。
     */
    @Value("${auth.skip.path-prefixes:/goods/get,/goods/getAllValidGoods,/category/getCategoriesByParentId,/brand/listByCategoryId,/search/goods/search,/seckill/list,/seckill/detail}")
    private String[] skipAuthPathPrefixes;

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

        //3.1 商品浏览类只读接口放行（无 token 也可访问）
        if (isPublicReadRequest(request)) {
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

    /**
     * 判断是否属于「商品浏览」类公开只读接口。
     *
     * 注意：本类是 GlobalFilter，执行时机早于路由级 StripPrefix，
     * 因此拿到的 path 仍带路由前缀，且路由前缀是否与服务名同层并不统一：
     *   - /goods/goods/get/1          归一化后是 /goods/get/1  （与配置一致）
     *   - /search/goods/search/1/6    归一化后是 /goods/search/1/6（与配置不一致）
     * 所以这里用两种形态共同匹配：归一化路径 + 原始路径的「以配置值结尾」判断。
     *
     * 只有 GET，以及搜索的 POST 查询，才可能放行；其余写操作与用户态接口继续鉴权。
     */
    private boolean isPublicReadRequest(ServerHttpRequest request) {
        String path = request.getURI().getPath();
        if (path == null || path.isEmpty() || skipAuthPathPrefixes == null) {
            return false;
        }

        HttpMethod method = request.getMethod();
        boolean isGet = HttpMethod.GET.equals(method);
        boolean isSearchPost = HttpMethod.POST.equals(method);

        String normalized = stripRoutePrefix(path);

        for (String prefix : skipAuthPathPrefixes) {
            if (prefix == null || prefix.isEmpty()) {
                continue;
            }
            String p = prefix.trim();
            // 搜索是 POST 查询语义，其余只允许 GET
            boolean methodAllowed = p.startsWith("/search/") ? isSearchPost : isGet;
            if (!methodAllowed) {
                continue;
            }
            if (matchesPrefix(normalized, p) || matchesPathSegment(path, p)) {
                logger.debug("skip auth for public path: {} (normalized {})", path, normalized);
                return true;
            }
        }
        return false;
    }

    /** 去掉第一段路由前缀（gateway 各路由都配置了 StripPrefix=1） */
    private String stripRoutePrefix(String path) {
        if (path.charAt(0) != '/') {
            return path;
        }
        int idx = path.indexOf('/', 1);
        return idx < 0 ? "/" : path.substring(idx);
    }

    /** 前缀匹配，且要求边界是 / 或结束，避免 /goods/getxxx 误命中 /goods/get */
    private boolean matchesPrefix(String path, String prefix) {
        if (!path.startsWith(prefix)) {
            return false;
        }
        return path.length() == prefix.length() || path.charAt(prefix.length()) == '/';
    }

    /**
     * 原始路径中包含该配置值，且边界完整。
     * 例：path=/search/goods/search/1/6，prefix=/search/goods/search 命中；
     *     path=/search/goods/exportData2ES，prefix=/search/goods/search 不命中。
     */
    private boolean matchesPathSegment(String path, String prefix) {
        int idx = path.indexOf(prefix);
        if (idx < 0) {
            return false;
        }
        int end = idx + prefix.length();
        return end == path.length() || path.charAt(end) == '/';
    }

    @Override
    public int getOrder() {
        return 0;
    }
}
