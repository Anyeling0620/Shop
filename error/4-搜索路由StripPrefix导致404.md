# 搜索路由 StripPrefix 导致搜索接口 404

## 错误信息

```
POST http://localhost:8081/search/goods/search/1/3 404 (Not Found)
```

## 原因

`gateway/src/main/resources/application.yml` 的搜索路由沿用了其它路由的写法：

```yaml
        - id: zhuawa_shop_search_route
          uri: http://localhost:18003
          predicates:
            - Path=/search/**
          filters:
            - StripPrefix=1
```

但 search-service 的 `GoodsController` 类级注解就是 `@RequestMapping("/search/goods")`，方法级是 `@PostMapping("/search/{page}/{size}")`，服务内完整路径为 `/search/goods/search/{page}/{size}`。

`StripPrefix=1` 把第一段 `/search` 剥掉，转发成 `/goods/search/1/3`，与服务的映射不符，404。

其余服务（goods/user/order/seckill）的控制器类级路径都不含路由前缀，所以剥一层正好；search 是例外。

## 修复

去掉搜索路由的 `StripPrefix` 过滤器：

```yaml
        - id: zhuawa_shop_search_route
          uri: http://localhost:18003
          # 不加 StripPrefix：search-service 的类级 @RequestMapping 是 /search/goods，
          # 前端本来就请求 /search/goods/search/{page}/{size}，前缀必须原样保留。
          predicates:
            - Path=/search/**
```
