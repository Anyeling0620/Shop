--[[
  秒杀原子预扣库存脚本（Redis 单线程执行，整体原子，不存在中间态）

  入参：
    KEYS[1] = 库存 key            seckill:stock:{goodsId}:{sessionId}（场次级，由 Java 侧拼装）
    KEYS[2] = 一人一单判重 key     seckill:orderMark:{userId}:{goodsId}:{sessionId}
    ARGV[1] = 判重 key 的过期秒数（普通数字字符串，如 "3600"）

  返回（数字字符串，Java 侧以 Long 接收）：
     1 = 抢购成功：判重 key 已写入，库存已 -1
     0 = 库存不足：库存 key 存在但 <= 0，未扣任何库存
    -1 = 重复抢购：判重 key 已存在，未扣任何库存
    -2 = 库存未初始化：库存 key 不存在，未扣任何库存（交由上层决定是否预热后重试）

  为什么要这样写：
    原实现是 decr 与 setnx 两次独立调用，中间存在竞态窗口。重复抢购的请求会被
    "先扣库存、后判重"的顺序坑到 —— 库存扣了 1 却被 setnx 拦下且不回补，
    造成 redis 库存与 DB 库存永久漂移。合并为单脚本后，任何一步不满足都在
    写操作之前 return，天然不存在"扣了库存但没成功"的中间态。
]]

-- 1. 先判重（比先扣库存更重要：重复请求绝不能碰库存）
if redis.call('EXISTS', KEYS[2]) == 1 then
    return -1
end

-- 2. 读库存。key 不存在时 tonumber(nil) 得到 nil，
--    绝不能让它走到 DECR（DECR 会把不存在的 key 当 0 再减成 -1，凭空多扣）。
--    这里单独区分 -2：库存 key 不存在 ≠ 售罄，交给上层决定「回源预热」还是「报售罄」
local stock = redis.call('GET', KEYS[1])
if stock == false then
    return -2
end

-- 3. 库存不足直接返回，不做任何写操作
stock = tonumber(stock)
if stock == nil or stock <= 0 then
    return 0
end

-- 4. 走到这里才真正消耗库存
redis.call('DECR', KEYS[1])

-- 5. 写判重标记（带 TTL）。TTL 放在这里而不是外面单独 EXPIRE，
--    否则仍是两次调用，判重 key 可能残留成永久 key
redis.call('SETEX', KEYS[2], tonumber(ARGV[1]), '1')

return 1
