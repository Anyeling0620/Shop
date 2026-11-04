-- ============================================================
-- 秒杀服务建表脚本（按代码字段反推，请按需核对）
-- 对应 seckill-service 的 SeckillGoodsDao / OrderDao
-- 说明：sql/ 目录原本缺少这三张表，缺表会导致 seckill-service
--      在 @PostConstruct 预热库存时启动失败。
-- ============================================================

CREATE DATABASE IF NOT EXISTS `seckill` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE `seckill`;

-- 秒杀商品（与商品表关联）
DROP TABLE IF EXISTS `goods_seckill`;
CREATE TABLE `goods_seckill` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `goods_id` bigint NOT NULL COMMENT '商品id，对应 goods.goods.id',
  `price_seckill` decimal(10,2) NOT NULL COMMENT '秒杀价',
  `stock_seckill` int NOT NULL DEFAULT 0 COMMENT '秒杀库存，扣减条件 stock_seckill > 0 防超卖',
  `start_time` datetime DEFAULT NULL COMMENT '秒杀开始时间',
  `end_time` datetime DEFAULT NULL COMMENT '秒杀结束时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_goods` (`goods_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀商品';

-- 秒杀订单主体（OrderDao.insertOrder）
DROP TABLE IF EXISTS `order`;
CREATE TABLE `order` (
  `id` bigint NOT NULL COMMENT '订单id，由 select last_insert_id() 回填',
  `user_id` bigint NOT NULL COMMENT '用户id',
  `goods_id` bigint NOT NULL COMMENT '商品id',
  `goods_name` varchar(255) DEFAULT NULL COMMENT '商品名称快照',
  `goods_count` int DEFAULT 1 COMMENT '购买数量',
  `goods_price` decimal(10,2) DEFAULT NULL COMMENT '成交价',
  `create_from` int DEFAULT 0 COMMENT '来源 0=秒杀',
  `status` int DEFAULT 0 COMMENT '0=待支付',
  `create_time` datetime DEFAULT NULL COMMENT '下单时间',
  `delivery_address` varchar(512) DEFAULT NULL COMMENT '收货地址',
  `pay_time` datetime DEFAULT NULL COMMENT '支付时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_goods` (`goods_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀订单';

-- 秒杀订单索引表（OrderDao.insertOrderSeckill / getOrderSeckill）
-- uk_user_goods 是「一人一单」的数据库层兜底
DROP TABLE IF EXISTS `order_seckill`;
CREATE TABLE `order_seckill` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_id` bigint NOT NULL COMMENT '订单id',
  `user_id` bigint NOT NULL COMMENT '用户id',
  `goods_id` bigint NOT NULL COMMENT '商品id',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_goods` (`user_id`,`goods_id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀订单索引（一人一单）';


-- ------------------------------------------------------------
-- 注意：SeckillGoodsDao 的查询语句是
--   from goods_seckill gs left join goods g on gs.goods_id = g.id
-- 没有库名前缀，因此要求当前库（seckill）里也能访问到 goods 表。
-- 二选一：
--   A. 把 goods 表也建到 seckill 库（教学项目最省事）
--      CREATE TABLE seckill.goods LIKE goods.goods;  然后同步数据
--   B. 改 DAO 的 SQL，增加库名前缀：
--      from goods_seckill gs left join goods.goods g on gs.goods_id = g.id
-- ------------------------------------------------------------
