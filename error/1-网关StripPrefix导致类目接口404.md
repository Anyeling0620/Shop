# 网关 StripPrefix 后类目接口 404

## 错误信息

```
GET http://localhost:8081/goods/category/getCategoriesByParentId?parentId=0 404 (Not Found)
```

浏览器控制台报 `Failed to load resource: the server responded with a status of 404`，首页分类轨道 `#catRail` 为空。

## 原因

`gateway/src/main/resources/application.yml` 中 `/goods/**` 路由配了 `StripPrefix=1`，网关会把第一段路径 `/goods` 剥掉再转发。

- 商品接口：`/goods/goods/get/1` → 剥掉第一段 → `/goods/get/1`，正好命中 goods-service 的 `/goods/get/{id}`。
- 类目接口原来的请求是 `/goods/category/getCategoriesByParentId`，剥掉第一段后变成 `/category/getCategoriesByParentId`，goods-service 里没有这个路径，于是 404。

也就是说，前端必须写「路由前缀 `/goods` + 服务内路径」两段形式的完整路径，不能只写服务内路径。

## 修复

`web/src/assets/api.js` 的 `getCategories` 补上路由前缀：

```js
function getCategories(parentId) {
  return request('goods', '/goods/category/getCategoriesByParentId?parentId=' + encodeURIComponent(parentId));
}
```

同类接口一律按此规则：浏览器请求 `/goods/<服务内路径>`。
