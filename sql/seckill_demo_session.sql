-- =============================================================================
-- 秒杀演示场次（本地联调用）
-- -----------------------------------------------------------------------------
-- 用途：原库 4 场秒杀全部已过期（2021 年 / 2026-11-06），前端只能看到
--       「已结束」，无法演示抢购链路。本脚本在 seckill 库现有商品上
--       补一场「进行中」和一场「即将开始」，时间相对 NOW() 计算，可反复执行。
--
-- 执行：
--   wsl -e docker exec -i shop-mysql mysql -uroot -p12345678 \
--     --default-character-set=utf8mb4 < sql/seckill_demo_session.sql
--
-- 幂等：脚本先删掉 999/1000 的旧场次再插入，重复执行结果一致。
--
-- 注意：seckill 库有自己独立的 goods 表，id 体系与 goods 库不同
--       （999 / 1000 是本库已有的商品行）。列表接口是
--       goods_seckill LEFT JOIN seckill.goods，因此演示场次必须挂在本库商品上，
--       挂 goods 库的雪花 id 会联查出 null，前端显示空白。
-- =============================================================================

-- 清掉历史演示数据（含早期误挂到 goods 库雪花 id 上的两行）
DELETE FROM seckill.goods_seckill WHERE session_id > 0 AND goods_id IN (999, 1000);
DELETE FROM seckill.goods_seckill WHERE goods_id IN (1432247757988474880, 1432247758777004032);

-- 把 999 / 1000 从「测试商品」换成真实商品信息，并给足库存
UPDATE seckill.goods
SET name   = '华为Mate40Pro 骁龙855plus;后置双摄;16GB;联通4G;5寸;绿',
    title  = '华为 HUAWEI Mate40 Pro 4G 全网通',
    img    = '/img/HuaweiMate40Pro.jpeg',
    detail = '华为 HUAWEI Mate40 Pro 4G 全网通 麒麟9000旗舰芯片 超感知徕卡电影影像 66W有线超级快充',
    price  = 4804.67,
    stock  = 1189
WHERE id = 999;

UPDATE seckill.goods
SET name   = '华为Mate40Pro 骁龙855plus;后置双摄;16GB;联通4G;5寸;紫',
    title  = '华为 HUAWEI Mate40 Pro 4G 全网通（紫）',
    img    = '/img/HuaweiMateX2.jpeg',
    detail = '华为 HUAWEI Mate40 Pro 4G 全网通 麒麟9000旗舰芯片 超感知徕卡电影影像 66W有线超级快充',
    price  = 4839.60,
    stock  = 1200
WHERE id = 1000;

-- 场次 1：进行中（1 小时前开始，23 小时后结束）
-- 场次 2：即将开始（明天开始，用于验证倒计时与「未开始」分支）
INSERT INTO seckill.goods_seckill (goods_id, session_id, price_seckill, stock_seckill, start_time, end_time)
VALUES
  (999,  1, 3999.00, 50, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 23 HOUR)),
  (1000, 1, 4199.00, 30, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 23 HOUR)),
  (999,  2, 3799.00, 40, DATE_ADD(NOW(), INTERVAL 1 DAY),      DATE_ADD(NOW(), INTERVAL 2 DAY));
