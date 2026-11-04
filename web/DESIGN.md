# 朱瓦商城前端 · 设计说明

## 1. 目标与约束

- **形态**：完整商城前台，参照联想商城（Lenovo 商城）的布局语言。
- **渲染**：Next.js App Router **SSR**（服务端直出 HTML），保证搜索引擎能抓到商品、分类等页面内容。
- **范围**：**只做后端已实现的接口**对应的页面。没有接口的能力不做、不造假数据。

## 2. 后端接口事实（已实测）

服务直连端口（BFF 直连，绕开网关的强制鉴权）：

| 服务 | 端口 | 校验 |
| --- | --- | --- |
| goods | 18001 | 无鉴权 |
| order | 18002 | `@AccessLimit` 方法才需要登录 |
| search | 18003 | 无鉴权 |
| user | 18006 | 无鉴权（登录接口） |
| seckill | 18007 | `@AccessLimit` 方法才需要登录 |

> 网关 8081 对**所有**请求强制鉴权（无 token 直接 403），因此 BFF 直连服务端口；浏览器侧永远只同源访问 Next，避免 CORS 与网关 403。

### 已实现接口清单

**goods (18001)**
- `GET /goods/getAllValidGoods` → 全量上架商品（**约 8MB**，只在首页取极小分片/不直接全量渲染）
- `GET /goods/get/{id}` → 商品详情
- `GET /category/getCategoriesByParentId?parentId=` → 类目（`0` 为顶级，可三级联动）
- `GET /brand/listByCategoryId?categoryId=` → 按类目查品牌

**search (18003)**
- `POST /search/goods/search/{page}/{size}` → 分页搜索，body `SearchGoodsParam`
  - ⚠️ `key` 必须为 `null` 或不传；传空串 `""` 会 500（`multiMatchQuery("")`）
  - ⚠️ 必须用合法 JSON body 且 `Content-Type: application/json`
  - 返回：`goodsEsInfoList`、`categoryList`、`brandList`、`specsList`、`total`、`page`、`totalPages`
  - 高亮标签是 `<font color='red'>…</font>`（前端按白名单处理）
- `GET /search/goods/exportData2ES` → 不在前台暴露

**user (18006)**
- `POST /user/login/do_login`（form：`mobile`、`password`=**已 MD5 的 32 位**）→ 返回 UUID（**不是 token**）
  - 真正的 JWT 在响应头 `zhuawa-shop-token` 和 Set-Cookie 里
- `GET /user/info`（需 token）→ 当前用户

**order (18002)**
- `GET /cart/list`、`/cart/incr`、`/cart/decr`、`/cart/set`（**都需登录**）
- `POST /order/genOrder`（需登录，body `OrdersParam`）
- `GET /order/getOrder/{orderId}`（需登录）

**seckill (18007)**
- `GET /seckill/list` → 秒杀商品（免登录）
- `GET /seckill/detail/{goodsId}` → 详情 + `seckillStatus` / `remainSeconds`
- `GET /seckill/path/{goodsId}`（需登录）→ 秒杀 path，60s 有效
- `POST /seckill/{path}/do/{goodsId}`（需登录）→ 返回 0 表示排队中
- `GET /seckill/result/{goodsId}`（需登录）→ `0` 排队 / `>0` 订单号 / `-1` 失败

### 结果封装
所有接口统一 `{ code, msg, data }`，`code === 0` 为成功。

## 3. 页面（只映射已实现接口）

| 页面 | 路由 | 数据来源 |
| --- | --- | --- |
| 首页 | `/` | 类目树 + 秒杀列表 + 搜索首屏商品 |
| 全部商品/类目 | `/goods` | `/search/goods/search/1/24` |
| 商品详情 | `/goods/[id]` | `/goods/get/{id}` |
| 搜索/筛选 | `/search?key=&category=&brand=&minPrice=&maxPrice=&orderField=&orderType=&page=` | `/search/goods/search/...` |
| 秒杀列表 | `/seckill` | `/seckill/list` |
| 秒杀详情 | `/seckill/[goodsId]` | `/seckill/detail/{id}` + 下单链路 |
| 登录 | `/login` | `/user/login/do_login` |
| 购物车 | `/cart` | `/cart/list` 等（登录门槛） |
| 订单详情 | `/orders/[orderId]` | `/order/getOrder/{id}` |
| 我的 | `/account` | `/user/info` |

**明确不做**（后端无接口）：注册、收藏、评价、地址簿、支付回调、优惠券、退款。

## 4. 模块划分

```
web/src/
├─ app/                     # 路由层（只负责组装与 SEO 元数据）
│  ├─ layout.tsx
│  ├─ page.tsx              # 首页
│  ├─ goods/[id]/page.tsx
│  ├─ search/page.tsx
│  ├─ seckill/…
│  ├─ cart/page.tsx
│  ├─ login/page.tsx
│  ├─ orders/[orderId]/page.tsx
│  └─ account/page.tsx
├─ modules/                 # 业务模块（每个模块自带 api / 组件）
│  ├─ catalog/              # 类目、商品
│  ├─ search/
│  ├─ seckill/
│  ├─ cart/
│  ├─ order/
│  └─ user/
├─ features/                # 跨模块 UI 能力（待用即建）
├─ lib/
│  ├─ backend/              # 服务端 BFF：服务地址、Result 解包、超时、错误
│  ├─ auth/                 # token 读写、cookie 透传
│  └─ format/               # 价格（分）、日期、高亮清洗
├─ components/              # 通用 UI（Header/Footer/Price/Empty/Skeleton）
└─ styles/
```

**纪律**：`lib/backend/*` 一律 `import 'server-only'`，token 永不出现在浏览器代码里。

## 5. SEO 要点

- 每页 `generateMetadata`：`title`、`description`、`openGraph`。
- 商品详情输出 JSON-LD `Product`（含 `offers`）。
- 服务端直出真实商品名、价格、类目，**不出骨架屏占位**。
- 品类/搜索页输出可被爬虫读取的分页链接。
