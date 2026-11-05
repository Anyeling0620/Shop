--[[
  秒杀预扣名额的归还脚本（一次 Lua 完成，原子 + 幂等）

  使用场景：预扣（seckill_stock.lua 返回 1）已经成功，但后续链路没能走到"订单落库"：
    1. MQ 发送失败（Broker 不可用 / 连接断开 / 队列满）
    2. 消费端发现商品不存在、DB 已无货
    3. 消费端落单抛异常（事务已回滚，订单确实没创建）
  这些情况下如果不把预扣走的 1 个名额还回去，会造成两种永久性损伤：
    - Redis 库存比 DB 少 1：名额凭空蒸发（少卖），且两边库存永久漂移
    - 该用户的判重标记还在：他再也抢不了这件商品

  入参：
    KEYS[1] = 库存 key                  seckill:stock:{goodsId}:{sessionId}（场次级，由 Java 侧拼装）
    KEYS[2] = 一人一单判重 key           seckill:orderMark:{userId}:{goodsId}:{sessionId}
    KEYS[3] = 本次预扣的"归还标记" key   seckill:stockRollback:{requestId}
    ARGV[1] = 归还标记的过期秒数

  返回：
     1 = 本次真的归还了（库存 +1，判重标记已删）
     0 = 幂等命中：同一个 requestId 之前已经归还过，本次什么都没做
     2 = 判重标记已经不在（TTL 到期或已被删除），不敢再 +1，否则凭空多卖
     3 = 库存 key 不存在（Redis 库存整体丢失），不 +1，交给人工对账

  为什么要幂等（三个 key 放在一次 Lua 里，而不是 incr + del 两次调用）：
    归还的触发点在链路上不止一个（发送端、消费端多个分支），而 MQ 是"至少一次"投递，
    同一条消息完全可能被消费两次；若 incr 与 del 分两次执行，中间崩溃会留下
    "库存还了、标记没删"或"重复归还"的中间态。
    这里用 KEYS[3] 做闸门：SET NX 成功才允许继续，失败说明这次预扣已经归还过，直接返回 0。
    闸门 key 按 requestId（每次预扣的唯一标识）而不是 userId:goodsId 命名，是为了让
    "上一次失败尝试的迟到归还"无法误删"用户重新抢购后新写的判重标记"。
]]

-- 1. 幂等闸：只有第一次归还能把闸门置上
local gate = redis.call('SET', KEYS[3], '1', 'NX', 'EX', tonumber(ARGV[1]))
if not gate then
    return 0
end

-- 2. 两个前置检查必须在任何写操作之前完成：
--    否则可能出现"标记删了、库存没加回去"的半成品状态，比不补偿更糟。
--    (a) 库存 key 必须存在：key 不存在时 INCR 会凭空造出一个 stock=1 的 key，
--        而真实库存很可能远大于 1，这种"补偿"只会制造新的不一致
if redis.call('EXISTS', KEYS[1]) == 0 then
    return 3
end
--    (b) 判重标记还在，才说明这次预扣仍然"持有着"一个名额
if redis.call('EXISTS', KEYS[2]) == 0 then
    return 2
end

-- 3. 到这里才真正改动数据：先清判重标记（让用户可以重新参与），再把名额加回库存
redis.call('DEL', KEYS[2])
redis.call('INCR', KEYS[1])

return 1
