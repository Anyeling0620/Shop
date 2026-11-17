# 网关与 @CrossOrigin 重复加头导致 CORS 失败

## 错误信息

浏览器请求搜索接口时报：

```
Access to fetch at 'http://localhost:8081/search/goods/search/1/3' from origin 'http://localhost:18004' has been blocked by CORS policy:
The 'Access-Control-Allow-Origin' header contains multiple values 'http://localhost:18004, *', but only one is allowed.
```

curl 直接请求同一接口一切正常。

## 原因

CORS 由两处同时处理：

1. `gateway` 的 `spring.cloud.gateway.globalcors`，按请求 `Origin` 回写具体来源，如 `http://localhost:18004`。
2. `search-service` 的 `GoodsController` 上有 `@CrossOrigin`，回写 `*`。

两个 `Access-Control-Allow-Origin` 头都被透传，浏览器看到多个值直接判定 CORS 失败。

## 修复

删掉 service 层的 `@CrossOrigin`，CORS 只由网关统一处理：

```java
@RestController
// 不要在这里加 @CrossOrigin：CORS 由网关的 globalcors 统一处理。
@RequestMapping("/search/goods")
public class GoodsController {
```

验证方式：`curl -sI -H "Origin: http://localhost:18004" http://localhost:8081/search/goods/search/1/3` 只应出现一行 `Access-Control-Allow-Origin`。
