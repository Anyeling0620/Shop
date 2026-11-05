-- =============================================================================
-- 秒杀「显式场次（session/round）」模型迁移脚本
-- -----------------------------------------------------------------------------
-- 目标库：seckill
-- 涉及表：seckill.goods_seckill（秒杀活动配置）
--         seckill.order_seckill（一人一单兜底表）
--
-- 背景（改造前的两个硬伤）：
--   1. goods_seckill 没有任何场次字段，goods_id 也没有唯一索引 —— 无法表达
--      「同一商品的多场秒杀」，同一商品的多次活动只能靠不同的自增 id 区分。
--   2. order_seckill 的唯一索引是 (user_id, goods_id)，含义是「同一用户同一商品
--      永远只能下一单」。商品开第二场时，老用户会被数据库直接挡掉，秒杀永远抢不了。
--
-- 本脚本做两件事：
--   A. 给 goods_seckill 增加 session_id，并加联合唯一索引 UNIQUE(goods_id, session_id)
--   B. 给 order_seckill 增加 session_id，把唯一索引改成 UNIQUE(user_id, goods_id, session_id)
--
-- 幂等性说明：MySQL 的 ALTER TABLE ADD COLUMN / ADD INDEX 不支持 IF NOT EXISTS，
--   重复执行会报「Duplicate column name / Duplicate key name」。执行前请先跑第 0 步
--   的前置检查，确认当前状态；若已迁移过，直接跳到文件末尾的「回滚」说明。
--
-- ⚠️ 执行前必读：
--   本脚本包含 DROP INDEX，属于破坏性结构变更。请在低峰期执行，
--   并先做一次全库备份：mysqldump -u root -p seckill > seckill_backup.sql
-- =============================================================================


-- ============================================================================
-- 第 0 步：前置检查（只读，不改数据。请逐条执行并确认结果）
-- ============================================================================

-- 0.1 确认 goods_seckill 当前结构与数据量（预期 2 行）
SELECT COUNT(*) AS goods_seckill_rows FROM seckill.goods_seckill;

-- 0.2 【关键】确认 goods_id 是否有重复。
--     加 UNIQUE(goods_id, session_id) 时，若同一 goods_id 已经存在多行，
--     回填 session_id=0 后会立刻撞唯一键，ALTER 会失败。
--     本仓库文档记载当前只有 2 行（goods_id = 1 和 2），预期无重复；
--     但若你的库不是这份 dump，务必先看这条查询的结果。
SELECT goods_id, COUNT(*) AS cnt
FROM seckill.goods_seckill
GROUP BY goods_id
HAVING COUNT(*) > 1;

-- 0.3 【关键】确认 order_seckill 现有唯一索引的真实名字。
--     文档记录为 user_goods，但索引名属于「文档与实际情况可能不一致」的信息，
--     第 2.4 步的 DROP INDEX 必须使用这里查出来的名字（未确认时不要盲改）。
SHOW INDEX FROM seckill.order_seckill;
-- 预期能看到两行 Key_name = PRIMARY 与 Key_name = user_goods，
-- 且 user_goods 的 Non_unique = 0、覆盖列 Seq_in_index 1=user_id、2=goods_id。

-- 0.4 确认 order_seckill 现有数据量（预期 199 行，用于回填后的核对）
SELECT COUNT(*) AS order_seckill_rows FROM seckill.order_seckill;

-- 0.5 【重要，迁移前记录】order_seckill 里存在的 goods_id 是否都在 goods_seckill 中。
--     当前实测是「199 条订单 vs 2 行配置」，说明历史配置被重置过。
--     这直接决定了第 2.2 步的回填策略，请先看清这个结果再继续（见该步注释）。
SELECT os.goods_id, COUNT(*) AS order_cnt,
       (SELECT COUNT(*) FROM seckill.goods_seckill gs WHERE gs.goods_id = os.goods_id) AS config_cnt
FROM seckill.order_seckill os
GROUP BY os.goods_id;


-- ============================================================================
-- 第 1 步：goods_seckill 增加场次字段
-- ============================================================================

-- 1.1 加字段。
--     为什么是 session_id 且 NOT NULL DEFAULT 0：
--       - 语义上它就是「第几场」，用 0 而不是 NULL 作默认值，是为了让
--         UNIQUE(goods_id, session_id) 能直接生效（MySQL 唯一索引对 NULL 不去重，
--         多行 NULL 会被视为互不相同，等于唯一约束失效）。
--       - 现有 2 行数据自动获得 0 号场，应用启动时的库存预热 SQL 无需改动即可命中。
--     为什么用 int unsigned：场次编号是单调递增的编排序号，不存在负数语义；
--       上限 42 亿场足够，且与 stock_seckill 的整型风格一致。
--     为什么不需要「重新排序/批量调整」的回收逻辑：session_id 只要求
--       「同一商品内唯一」，不要求全局连续，允许各商品各排各的。
ALTER TABLE seckill.goods_seckill
    ADD COLUMN session_id INT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '场次编号：同一商品可开多场，(goods_id, session_id) 唯一定位一场'
        AFTER goods_id;

-- 1.2 回填。ADD COLUMN 的 DEFAULT 0 已经把现有行填成 0，
--     这条显式 UPDATE 是为了「脚本本身可读、可审计」，同时覆盖这样一种情况：
--     如果你的 MySQL 版本/参数让 ADD COLUMN 时历史行为不一致，靠它兜底。
UPDATE seckill.goods_seckill SET session_id = 0 WHERE session_id IS NULL;

-- 1.3 加联合唯一索引，把「某商品的某一场」变成数据库层面的唯一事实。
--     为什么一定要加：没有它，同一个 (goods_id, session_id) 可以插两行，
--     reduceStock 的 update ... where goods_id = ? and session_id = ? 会命中多行、
--     扣两行库存；而 getByGoodsIdAndSession 返回哪一行则取决于执行计划 —— 不可控。
--     加上之后，配置重复会在写入口就被拒绝。
ALTER TABLE seckill.goods_seckill
    ADD UNIQUE KEY uk_goods_session (goods_id, session_id);

-- 1.4 核对：每行都应拿到 0 号场（预期 2 行）
SELECT id, goods_id, session_id, stock_seckill, start_time, end_time
FROM seckill.goods_seckill ORDER BY goods_id, session_id;


-- ============================================================================
-- 第 2 步：order_seckill 把「一人一单」的粒度降到场次级
-- ============================================================================

-- 2.1 加场次字段。默认 0 与 goods_seckill 的回填口径保持一致，
--     这样「升级前那批订单」天然对应「升级前的 0 号场」。
ALTER TABLE seckill.order_seckill
    ADD COLUMN session_id INT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '场次编号：与 goods_seckill.session_id 对应，一人一场一单'
        AFTER goods_id;

-- 2.2 回填历史订单的场次。
--     策略：统一填 0（即 ADD COLUMN 的默认值），不做「按 goods_id 反查 goods_seckill」
--     的智能回填。理由：
--       - 历史订单下在什么场次，数据库里没有任何记录可以还原。按当前配置反查是
--         「用今天的配置去解释昨天的订单」，会把历史订单张冠李戴到别的场上。
--       - 数据显示 order_seckill 有 199 行、goods_seckill 只有 2 行，说明历史配置
--         早被重置/清理过，反查多数会落空，回填结果不可信。
--       - 统一填 0 的副作用是「这 199 个用户无法再抢 0 号场」，等价于保留了他们
--         原有的「一人一单」判定结果，属于最保守、最不容易被告状的选择。
--     ⚠️ 业务上若希望「升级后所有人可以重新抢一轮」，应把本步改成给历史订单填一个
--        不与任何在架场次相同的编号（例如 4294967295），并同步给 goods_seckill 的
--        存量行换一个新场次编号。这属于产品决策，默认不这么做。
UPDATE seckill.order_seckill SET session_id = 0 WHERE session_id IS NULL;

-- 2.3 先建新索引、后删旧索引（顺序很重要）：
--     先删后建会出现一个「没有任何唯一约束保护」的时间窗，
--     正常流量下并发下单可能插入重复行，之后再建唯一索引会直接失败。
--     先建后删则全程至少有一个唯一约束在生效。
ALTER TABLE seckill.order_seckill
    ADD UNIQUE KEY uk_user_goods_session (user_id, goods_id, session_id);

-- 2.4 删除旧的 (user_id, goods_id) 唯一索引。
--     索引名务必以第 0.3 步 SHOW INDEX 的实际结果为准（文档记录为 user_goods）。
--
--     为什么必须删、而不是保留它做「历史兼容」：
--       - 只要它还活着，「同一个用户同一商品只能下一单」这条老语义就仍然生效，
--         第二场秒杀会被这个索引挡死 —— 本次改造直接失效。
--       - 唯一索引无法「部分保留」：它是强约束，不存在「只在第一场生效」的写法。
--       - 它并不能提供我们想要的兼容能力：真正需要的是「历史订单仍然可查」，
--         而这由数据本身保证（行还在），不依赖这个索引。
--     ⚠️ 唯一需要保留它的情况：如果有本仓库之外的系统（报表/对账）依赖
--        「user+goods 最多一条」这个假设，那要先跟对方确认。本仓库内已确认
--        只有 OrderDao.getOrderSeckill 使用，且已改为带 session_id。
ALTER TABLE seckill.order_seckill DROP INDEX user_goods;

-- 2.5 建一个普通联合索引承接原唯一索引的「查询加速」职责。
--     原索引虽然语义不对，但客观上给 user_id + goods_id 的查询提供了前缀支持。
--     删掉它之后，OrderDao.getOrderSeckill 的 where user_id+goods_id+session_id
--     仍能走 uk_user_goods_session（最左前缀 user_id, goods_id 完全匹配），
--     所以这条普通索引在功能上并非必需；只有当你需要按 user_id 单独批量查
--     （如「我的秒杀订单」这类不在本仓库的查询）时才有价值。
--     默认不建，避免无谓的写入放大。确有需要再取消下一行注释：
-- ALTER TABLE seckill.order_seckill ADD KEY idx_user_id (user_id);

-- 2.6 核对：索引应只剩 PRIMARY + uk_user_goods_session
SHOW INDEX FROM seckill.order_seckill;

-- 2.7 核对：历史订单行数不变（应仍是 199），且 session_id 全为 0
SELECT COUNT(*) AS total, SUM(session_id = 0) AS session_zero FROM seckill.order_seckill;


-- ============================================================================
-- 第 3 步：验收查询（迁移后自检）
-- ============================================================================

-- 3.1 确认 goods_seckill 的 (goods_id, session_id) 唯一索引存在
SHOW INDEX FROM seckill.goods_seckill;

-- 3.2 模拟「同一用户同一商品、两个不同场次」是否能各落一单。
--     以下语句在事务中执行并回滚，不会留下数据，用来验证唯一索引的粒度是对的：
--       同一 (user, goods, session=0) 会撞唯一键；
--       同一 (user, goods, session=1) 可以插入成功。
--     ⚠️ 请替换成一个真实的 user_id / goods_id 后再执行。
--
-- START TRANSACTION;
-- INSERT INTO seckill.order_seckill(user_id, goods_id, session_id, order_id)
--     VALUES (1, 1, 0, 999999001);
-- -- 下面这条应当报 Duplicate entry（说明同场次确实被挡住）：
-- INSERT INTO seckill.order_seckill(user_id, goods_id, session_id, order_id)
--     VALUES (1, 1, 0, 999999002);
-- -- 下面这条应当成功（说明跨场次放行）：
-- INSERT INTO seckill.order_seckill(user_id, goods_id, session_id, order_id)
--     VALUES (1, 1, 1, 999999003);
-- ROLLBACK;


-- ============================================================================
-- 回滚脚本（仅在需要撤回本次迁移时手工执行，本文件不会自动执行）
-- -----------------------------------------------------------------------------
-- 注意：回滚会丢失「多余场次」的配置行与订单行的场次信息。
--       若已产生跨场次订单，回滚时需要先决定保留哪一场的数据，否则
--       CREATE UNIQUE(user_id, goods_id) 会因重复而失败。
-- ============================================================================
--
-- -- 3.R1 先恢复旧唯一索引（若存在跨场次重复，这里会报 Duplicate entry，属预期，
-- --      需要人工先清理重复行再继续）
-- ALTER TABLE seckill.order_seckill ADD UNIQUE KEY user_goods (user_id, goods_id);
-- ALTER TABLE seckill.order_seckill DROP INDEX uk_user_goods_session;
-- ALTER TABLE seckill.order_seckill DROP COLUMN session_id;
--
-- -- 3.R2 还原 goods_seckill
-- ALTER TABLE seckill.goods_seckill DROP INDEX uk_goods_session;
-- ALTER TABLE seckill.goods_seckill DROP COLUMN session_id;
