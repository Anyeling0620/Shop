-- ============================================================
-- 秒杀服务建表脚本
--
-- 对应代码：
--   seckill-service/.../dao/SeckillGoodsDao.java
--   seckill-service/.../dao/OrderDao.java
--   seckill-service/.../model/{SeckillGoods,OrderSeckill,Order}.java
--
-- 本脚本已包含「场次（session）」改造后的结构。改造要点：
--   1. goods_seckill 增加 session_id，同一商品可配置多场秒杀
--   2. order_seckill 增加 session_id，唯一索引扩展为
--      (user_id, goods_id, session_id)，否则用户抢第二场会被第一场的
--      旧索引误挡
--   3. order 增加 session_id（当前代码未写入，保留为将来按场次统计用）
--
-- 缺表或缺列的后果（实测过，不是理论风险）：
--   - goods_seckill 缺 session_id → seckill-service 启动预热直接抛
--     Unknown column 'gs.session_id'
--   - order_seckill 缺 session_id → MQ 消费落库全部失败，表现为
--     「Redis 库存扣光但订单 0 条、DB 库存没动」
--   - 唯一索引没扩到 session_id → 第二场秒杀被唯一键挡掉
--
-- 用法：全新环境直接执行本文件；已有环境请跳到文末「从旧版本升级」。
-- ============================================================

CREATE DATABASE IF NOT EXISTS `seckill` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE `seckill`;


-- ------------------------------------------------------------
-- 1. 商品表（seckill 库里的副本）
--
-- SeckillGoodsDao 的查询是：
--   from goods_seckill gs left join goods g on gs.goods_id = g.id
-- 没有库名前缀，所以 seckill 库里必须也有一张 goods 表。
-- 这类「教学项目把商品表复制一份到秒杀库」的做法在生产上不建议，
-- 但改动它涉及跨库查询/服务拆分，不在本次范围内。
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `goods`;
CREATE TABLE `goods` (
  `id`          bigint unsigned NOT NULL AUTO_INCREMENT,
  `name`        varchar(63)  NOT NULL DEFAULT '' COMMENT '商品名',
  `title`       varchar(127) NOT NULL DEFAULT '' COMMENT '标题',
  `img`         varchar(255) NOT NULL DEFAULT '' COMMENT '图片路径',
  `detail`      longtext COMMENT '详情',
  `price`       decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '原价',
  `stock`       int unsigned NOT NULL DEFAULT '0' COMMENT '普通库存',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品表（seckill 库副本）';


-- ------------------------------------------------------------
-- 2. 秒杀商品/场次配置
--
-- 一个商品可以配多场：用 (goods_id, session_id) 共同定位。
-- session_id 是编排上的单调递增编号，0 号为历史默认场次。
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `goods_seckill`;
CREATE TABLE `goods_seckill` (
  `id`            bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `goods_id`      bigint unsigned NOT NULL DEFAULT '0' COMMENT '商品id，对应 seckill.goods.id',
  `session_id`    int NOT NULL DEFAULT '0' COMMENT '场次编号，单调递增；0=历史默认场',
  `price_seckill` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '秒杀价',
  `stock_seckill` int NOT NULL DEFAULT '0' COMMENT '秒杀库存；扣减条件 stock_seckill > 0 防超卖',
  `start_time`    datetime DEFAULT NULL COMMENT '秒杀开始时间',
  `end_time`      datetime DEFAULT NULL COMMENT '秒杀结束时间',
  `create_time`   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  -- 热路径索引：reduceStock 的条件就是 (goods_id, session_id)。
  -- 没有它，扣库存会全表扫并锁住所有行，秒杀高并发下会被放大成锁竞争。
  KEY `idx_goods_session` (`goods_id`, `session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀商品/场次配置';


-- ------------------------------------------------------------
-- 3. 秒杀订单主体（OrderDao.insertOrder）
--
-- 注意：当前 Order 模型没有 sessionId 字段，insertOrder 也不写 session_id，
-- 该列靠 DEFAULT 0 兜底。保留它是为了将来按场次做订单统计/对账；
-- 若确认不需要，可以 ALTER TABLE `order` DROP COLUMN session_id。
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `order`;
CREATE TABLE `order` (
  `id`               bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '订单id，insert 后由 select last_insert_id() 回填',
  `user_id`          bigint unsigned NOT NULL DEFAULT '0' COMMENT '用户id',
  `goods_id`         bigint unsigned NOT NULL DEFAULT '0' COMMENT '商品id',
  `session_id`       int NOT NULL DEFAULT '0' COMMENT '场次编号（当前代码未写入，预留）',
  `delivery_address` varchar(255) DEFAULT NULL COMMENT '收货地址',
  `goods_name`       varchar(15)  DEFAULT NULL COMMENT '商品名称快照（下单时冗余，便于订单列表展示）',
  `goods_count`      int unsigned NOT NULL DEFAULT '1' COMMENT '购买数量',
  `goods_price`      decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '成交价（下单时快照）',
  `create_from`      tinyint NOT NULL DEFAULT '0' COMMENT '来源：0=PC 1=Android 2=iOS',
  `status`           tinyint NOT NULL DEFAULT '0' COMMENT '0待支付 1已支付 2已发货 3已收货 4申请退款 5已退款 6已完成',
  `create_time`      datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间',
  -- pay_time 必须是 NULL：未支付时不应有值。
  -- （之前线上库是 NOT NULL DEFAULT CURRENT_TIMESTAMP，会在创建订单时就把
  --   pay_time 填成下单时间，语义是错的；见文末升级章节的修正语句）
  `pay_time`         datetime DEFAULT NULL COMMENT '支付时间，未支付为 NULL',
  `update_time`      datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user`  (`user_id`),
  KEY `idx_goods` (`goods_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀订单主体';


-- ------------------------------------------------------------
-- 4. 秒杀订单关系表（一人一单 + 防重复消费）
--
-- 唯一索引必须包含 session_id：
--   - 判重语义是「同一用户在同一场次内只能下一单」
--   - 若仍是 (user_id, goods_id)，用户抢第二场会被第一场那行挡掉
--
-- 这张表是「一人一单」的最后一道防线：应用层的 setnx 判重在
-- 售罄等分支下可能被短路，最终兜底靠这里的唯一索引。
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `order_seckill`;
CREATE TABLE `order_seckill` (
  `id`          bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `order_id`    bigint unsigned NOT NULL DEFAULT '0' COMMENT '订单id，对应 `order`.id',
  `user_id`     bigint unsigned NOT NULL DEFAULT '0' COMMENT '用户id',
  `goods_id`    bigint unsigned NOT NULL DEFAULT '0' COMMENT '商品id',
  `session_id`  int NOT NULL DEFAULT '0' COMMENT '场次编号',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_goods_session` (`user_id`, `goods_id`, `session_id`),
  KEY `idx_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀订单关系（一人一场一单）';


-- ============================================================
-- 5. 从旧版本升级（已有数据的环境用这一节，不要 DROP）
--
-- 适用对象：本次 session 改造之前建好的库。
-- 执行前请先备份：mysqldump -h127.0.0.1 -P13306 -uroot -p seckill > seckill_bak.sql
-- ============================================================

-- 5.1 补 session_id 列（幂等写法在这里不适用，先看下面 5.0 的判断）
-- 5.0 先确认是否已加过，避免重复执行报 Duplicate column：
--   SELECT COLUMN_NAME FROM information_schema.COLUMNS
--    WHERE TABLE_SCHEMA='seckill' AND TABLE_NAME='goods_seckill' AND COLUMN_NAME='session_id';
-- 返回空表示需要执行下面三条：

-- ALTER TABLE `goods_seckill` ADD COLUMN `session_id` int NOT NULL DEFAULT 0 COMMENT '场次编号，单调递增' AFTER `goods_id`;
-- ALTER TABLE `order_seckill` ADD COLUMN `session_id` int NOT NULL DEFAULT 0 COMMENT '场次编号' AFTER `goods_id`;
-- ALTER TABLE `order`         ADD COLUMN `session_id` int NOT NULL DEFAULT 0 COMMENT '场次编号' AFTER `goods_id`;

-- 5.2 改唯一索引：(user_id, goods_id) -> (user_id, goods_id, session_id)
-- 旧索引名在不同环境可能不一致（`uk_user_goods` / `user_goods`），
-- 先用下面这条查出真实索引名，再替换 5.2 里的名字：
--   SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
--     FROM information_schema.STATISTICS
--    WHERE TABLE_SCHEMA='seckill' AND TABLE_NAME='order_seckill' AND NON_UNIQUE=0
--    GROUP BY INDEX_NAME;

-- ALTER TABLE `order_seckill` DROP INDEX `user_goods`;
-- ALTER TABLE `order_seckill` ADD UNIQUE KEY `uk_user_goods_session` (`user_id`, `goods_id`, `session_id`);

-- 5.3 补热路径索引（上面 5.2 之前也可以先做，不冲突）
-- ALTER TABLE `goods_seckill` ADD KEY `idx_goods_session` (`goods_id`, `session_id`);
-- ALTER TABLE `order_seckill` ADD KEY `idx_order` (`order_id`);

-- 5.4 修正 pay_time 语义（可选；只影响新订单，历史数据需单独评估）
-- ALTER TABLE `order` MODIFY COLUMN `pay_time` datetime DEFAULT NULL COMMENT '支付时间，未支付为 NULL';

-- 5.5 升级后务必重启 seckill-service
-- 因为 SeckillController 的 @PostConstruct 会在启动时把 DB 库存预热进 Redis，
-- 且库存 key 的格式已变成 seckill:stock:{goodsId}:{sessionId}。
-- 重启前建议清掉旧格式 key（结尾没有 :{sessionId} 的那些）：
--   redis-cli -a 12345678 --no-auth-warning --scan --pattern 'seckill:stock:*'


-- ============================================================
-- 6. 建库后的自检
-- ============================================================
-- 6.1 三张表的 session_id 是否都在
-- SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA='seckill'
--    AND COLUMN_NAME='session_id'
--  ORDER BY TABLE_NAME;
-- 期望 3 行：goods_seckill / order / order_seckill

-- 6.2 唯一索引是否为三段
-- SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
--   FROM information_schema.STATISTICS
--  WHERE TABLE_SCHEMA='seckill' AND TABLE_NAME='order_seckill' AND NON_UNIQUE=0
--  GROUP BY INDEX_NAME;
-- 期望 uk_user_goods_session -> user_id,goods_id,session_id

-- 6.3 goods 副本是否存在（SeckillGoodsDao 的 left join 依赖它）
-- SELECT COUNT(*) FROM seckill.goods;
