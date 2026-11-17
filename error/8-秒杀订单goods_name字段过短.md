# 秒杀下单失败：Data too long for column 'goods_name'

## 错误信息

```
### Error updating database.  Cause: com.mysql.cj.jdbc.exceptions.MysqlDataTruncation: Data truncation: Data too long for column 'goods_name' at row 1
```

结果是秒杀下单回滚，用户看到「秒杀失败」。

## 原因

`seckill` 库的 `order.goods_name` 定义为 `varchar(15)`（见 `docs/秒杀建表.sql`）。秒杀商品名是「品牌 + 规格;规格…」的完整串，例如 `华为Mate40Pro 骁龙855plus;后置双摄;16GB;联通4G;5寸;绿`，远超 15 个字符。

商品库里的 `goods.name` 本身是 varchar(255)，秒杀下单时把整串拷进订单表，被截断报错。

同一张表还有 `pay_time` 定义为 `NOT NULL DEFAULT CURRENT_TIMESTAMP`，待支付订单没有支付时间也会插入失败。

## 修复

建表语句调整：

```sql
`goods_name` varchar(255) NOT NULL COMMENT '商品名称',
`pay_time` datetime DEFAULT NULL COMMENT '支付时间',
```

已建库的实例用 `ALTER TABLE` 同步：

```sql
ALTER TABLE `order` MODIFY COLUMN `goods_name` varchar(255) NOT NULL;
ALTER TABLE `order` MODIFY COLUMN `pay_time` datetime NULL DEFAULT NULL;
```
