# 秒杀订单落库后 session_id 恒为 0

## 错误信息

下单成功，但查库发现所有秒杀订单：

```
select id, goods_id, session_id from `order`;
+---------------------+----------+------------+
| id                  | goods_id | session_id |
+---------------------+----------+------------+
| 2122665363693862912 |      999 |          0 |
```

按场次统计销量、扣库存对账全对不上。

## 原因

`SeckillOrderService` 从 Redis / 请求上下文里拿到了 `sessionId` 并用于 Lua 扣减，但组装 `Order` 对象时没有 `setSessionId`；`OrderDao.insertOrder` 的 `@Insert` 语句也没有写 `session_id` 列。所以字段一直是数据库默认值 0。

秒杀表按 `(goods_id, session_id)` 唯一约束，场次信息是核心数据，缺失会导致后续场次无法区分。

## 修复

三处对齐：

1. `seckill-service/.../model/Order.java` 增加字段
   ```java
   private Integer sessionId;
   ```
2. `seckill-service/.../dao/OrderDao.java` 的 insert 补列
   ```java
   @Insert("insert into `order`(user_id, goods_id, session_id, goods_name, goods_count, goods_price, " +
           "create_from, status, create_time) values(" +
           "#{userId}, #{goodsId}, #{sessionId}, #{goodsName}, #{goodsCount}, #{goodsPrice}, " +
           "#{createFrom}, #{status}, #{createTime})")
   ```
3. `SeckillOrderService` 创建订单时
   ```java
   order.setSessionId(sessionId);
   ```

注意：`sessionId` 必须来自扣库存时使用的同一个值，不能用请求参数重新解析，否则异步消息处理路径会丢失。
