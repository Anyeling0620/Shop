package com.zhuawa.shop.seckill.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.seckill.model.SeckillGoods;
import com.zhuawa.shop.seckill.rabbitmq.MQSender;
import com.zhuawa.shop.seckill.rabbitmq.SeckillMessage;
import com.zhuawa.shop.seckill.redis.RedisKeys;
import com.zhuawa.shop.seckill.redis.RedisService;
import com.zhuawa.shop.seckill.service.SeckillGoodsService;
import com.zhuawa.shop.seckill.service.SeckillService;
import com.zhuawa.shop.seckill.vo.SeckillDetailVo;
import io.swagger.annotations.Api;
import springfox.documentation.annotations.ApiIgnore;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.PostConstruct;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Api(tags = "秒杀模块")
@RestController
@RequestMapping("/seckill")
public class SeckillController {

    private static final Logger logger = LoggerFactory.getLogger(SeckillController.class);

    /** 一人一单判重 key 的存活时间（秒），与原实现保持一致 */
    private static final long ORDER_MARK_EXPIRE_SECONDS = 3600L;

    @Autowired
    SeckillGoodsService seckillGoodsService;

    @Autowired
    SeckillService seckillService;

    @Autowired
    RedisService redisService;

    @Autowired
    MQSender mqSender;

    /** 内存标记：商品是否已无货，减少 redis 访问 */
    private ConcurrentHashMap<Long, Boolean> seckillOverMap = new ConcurrentHashMap<>();

    /**
     * 启动时把秒杀库存预热进 redis
     */
    @PostConstruct
    public void init() {
        List<SeckillGoods> goodsList = seckillGoodsService.listSeckillGoods();
        for (SeckillGoods goods : goodsList) {
            redisService.set(RedisKeys.SECKILL_STOCK + goods.getGoodsId(),
                    String.valueOf(goods.getStockSeckill()));
            seckillOverMap.put(goods.getGoodsId(), false);
        }
        logger.info("seckill stock init finish, goods count: {}", goodsList.size());
    }

    /**
     * 库存 key 缺失时的兜底预热：从 DB 回源该商品的秒杀库存，并以 SET NX 写回 redis。
     * <p>
     * 为什么必须是 NX（只在 key 不存在时写）而不是无条件 SET：
     * 多个请求同时收到 -2 时，它们会各自回源查 DB（都读到同一个初始值），
     * 若直接 SET，先到的请求预热并扣减后，后到的请求会把库存覆盖回初始值。
     * 时间线（DB 库存 = 10，redis key 丢失，请求 A、B 并发）：
     * <pre>
     *   A: Lua -&gt; -2 ；B: Lua -&gt; -2
     *   A: 预热 SET stock=10
     *   A: 再扣 -&gt; stock=9，成功
     *   B: 预热 SET stock=10   &lt;-- 覆盖掉 9，A 的那一单凭空"复活"
     *   B: 再扣 -&gt; stock=9，成功
     * </pre>
     * 两个请求都成功、库存只减 1，最终 DB 扣减的库存对不上 -> 超卖。
     * 改成 SET NX 后：只有第一个请求能写入，后来者写入失败说明 key 已经被别人预热好了，
     * 此时 key 一定存在，直接返回 true 让调用方重试扣减即可 —— 重试时读到的就是别人扣减后的值。
     *
     * @return true 表示库存 key 现在已经存在（本次写入成功，或别人刚好已写入），调用方可以重试扣减；
     *         false 表示商品不存在，不该参与秒杀
     */
    private boolean warmUpStock(long goodsId) {
        SeckillGoods goods;
        try {
            goods = seckillGoodsService.getByGoodsId(goodsId);
        } catch (GlobalException e) {
            logger.error("warm up seckill stock failed, goods not exist. goodsId: {}", goodsId);
            return false;
        }
        int stock = goods.getStockSeckill() == null ? 0 : goods.getStockSeckill();
        String stockKey = RedisKeys.SECKILL_STOCK + goodsId;
        // 注意：返回 false 不是失败，只表示"别人先写了"。此时 key 已存在，重试扣减能正常读到值。
        boolean written = redisService.setIfAbsent(stockKey, String.valueOf(stock));
        if (written) {
            logger.warn("seckill stock key missing, warm up from db. goodsId: {}, stock: {}", goodsId, stock);
        } else {
            logger.info("seckill stock already warmed up by concurrent request, goodsId: {}", goodsId);
        }
        // 无论是否由本次写入，只要 key 现在存在就应该重试扣减：
        // 库存为 0 时重试会读到 0 并返回"库存不足"，语义依然正确。
        return true;
    }

    @ApiOperation(value = "查询秒杀商品列表")
    @GetMapping("/list")
    public Result<List<SeckillGoods>> list() {
        return Result.success(seckillGoodsService.listSeckillGoods());
    }

    @ApiOperation(value = "查询秒杀商品详情（含秒杀状态与倒计时）")
    @GetMapping("/detail/{goodsId}")
    public Result<SeckillDetailVo> detail(@PathVariable("goodsId") long goodsId) {
        SeckillGoods goods = seckillGoodsService.getByGoodsId(goodsId);
        // Feign 校验商品在 goods-service 中存在且上架
        seckillGoodsService.checkGoodsOnSale(goodsId);

        SeckillDetailVo vo = new SeckillDetailVo();
        vo.setGoods(goods);
        int[] status = seckillStatus(goods);
        vo.setSeckillStatus(status[0]);
        vo.setRemainSeconds(status[1]);
        return Result.success(vo);
    }

    /**
     * 获取混淆后的秒杀 path（防脚本刷接口），60s 有效
     */
    @ApiOperation(value = "获取秒杀隐藏地址（60秒内有效）")
    @AccessLimit(needLogin = true)
    @GetMapping("/path/{goodsId}")
    public Result<String> getSeckillPath(@ApiIgnore LoginUser user, @PathVariable("goodsId") long goodsId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        seckillGoodsService.getByGoodsId(goodsId);
        return Result.success(seckillService.createSeckillPath(user.getId(), goodsId));
    }

    /**
     * 执行秒杀：
     * 1. 校验 path
     * 2. 内存标记判无货
     * 3. Lua 脚本原子完成「判重 + 校验库存 + 预扣库存 + 写判重标记」
     * 4. 发 MQ 异步下单，返回排队中
     */
    @ApiOperation(value = "执行秒杀（异步下单，返回0表示排队中）")
    @AccessLimit(needLogin = true)
    @PostMapping("/{path}/do/{goodsId}")
    public Result<Long> doSeckill(@ApiIgnore LoginUser user,
                                  @PathVariable("path") String path,
                                  @PathVariable("goodsId") long goodsId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        // 1. 验证 path
        if (!seckillService.checkSeckillPath(user.getId(), goodsId, path)) {
            return Result.error(CodeMsg.REQUEST_ILLEGAL);
        }
        // 2. 内存标记，减少 redis 访问
        if (Boolean.TRUE.equals(seckillOverMap.get(goodsId))) {
            return Result.error(CodeMsg.SECKILL_OVER);
        }
        // 3. Lua 脚本原子预扣库存 + 判重。
        //    原来这里是 decr 与 setIfAbsent 两次独立调用，重复抢购会把库存扣掉却不回补；
        //    现在合并在一个脚本里，返回 0 / -1 时库存一个字节都没动，不存在泄漏。
        long result = redisService.seckillDeductStock(
                RedisKeys.SECKILL_STOCK + goodsId,
                RedisKeys.SECKILL_ORDER_MARK + user.getId() + ":" + goodsId,
                ORDER_MARK_EXPIRE_SECONDS);
        if (result == RedisService.SECKILL_STOCK_REPEAT) {
            // 重复抢购：库存未扣，无需回补
            return Result.error(CodeMsg.SECKILL_REPEAT);
        }
        if (result == RedisService.SECKILL_STOCK_NOT_INIT) {
            // 库存 key 不存在 ≠ 售罄：可能是服务重启后 @PostConstruct 预热失败、
            // 或 redis 数据丢失/被清理。这里按秒杀商品回源预热一次再重试，
            // 避免把「有货但没预热」误判成「售罄」并打上永久无货标记。
            if (!warmUpStock(goodsId)) {
                // 回源也查不到商品：是真的不该卖，标记无货
                seckillOverMap.put(goodsId, true);
                redisService.set(RedisKeys.SECKILL_GOODS_OVER + goodsId, "true");
                return Result.error(CodeMsg.SECKILL_OVER);
            }
            result = redisService.seckillDeductStock(
                    RedisKeys.SECKILL_STOCK + goodsId,
                    RedisKeys.SECKILL_ORDER_MARK + user.getId() + ":" + goodsId,
                    ORDER_MARK_EXPIRE_SECONDS);
            if (result == RedisService.SECKILL_STOCK_REPEAT) {
                return Result.error(CodeMsg.SECKILL_REPEAT);
            }
        }
        if (result != RedisService.SECKILL_STOCK_SUCCESS) {
            // 库存不足：置内存标记 + 置无货标记，后续请求直接短路
            seckillOverMap.put(goodsId, true);
            redisService.set(RedisKeys.SECKILL_GOODS_OVER + goodsId, "true");
            return Result.error(CodeMsg.SECKILL_OVER);
        }
        // 4. 发消息，异步落单
        SeckillMessage sm = new SeckillMessage();
        sm.setUserId(user.getId());
        sm.setGoodsId(goodsId);
        mqSender.sendSeckillMessage(sm);
        return Result.success(0L); // 排队中
    }

    /**
     * 前端轮询秒杀结果：orderId 成功；-1 失败；0 排队中
     */
    @ApiOperation(value = "轮询查询秒杀结果（订单ID成功，-1失败，0排队中）")
    @GetMapping("/result/{goodsId}")
    public Result<Long> seckillResult(@ApiIgnore LoginUser user, @PathVariable("goodsId") long goodsId) {
        if (user == null) {
            return Result.error(CodeMsg.SESSION_ERROR);
        }
        return Result.success(seckillService.getSeckillResult(user.getId(), goodsId));
    }

    /**
     * 供其他服务 Feign 调用的结果查询接口（不校验登录态）
     */
    @ApiOperation(value = "查询秒杀结果（供服务间Feign调用）")
    @GetMapping("/result/query")
    public Result<Long> seckillResultQuery(@RequestParam("userId") long userId,
                                           @RequestParam("goodsId") long goodsId) {
        return Result.success(seckillService.getSeckillResult(userId, goodsId));
    }

    private int[] seckillStatus(SeckillGoods goods) {
        int seckillStatus;
        int remainSeconds;
        if (goods.getStartTime() == null || goods.getEndTime() == null) {
            return new int[]{1, 0};
        }
        long startAt = goods.getStartTime().getTime();
        long endAt = goods.getEndTime().getTime();
        long now = System.currentTimeMillis();
        if (now < startAt) { // 秒杀还没开始，倒计时
            seckillStatus = 0;
            remainSeconds = (int) ((startAt - now) / 1000);
        } else if (now > endAt) { // 秒杀已经结束
            seckillStatus = 2;
            remainSeconds = -1;
        } else { // 秒杀进行中
            seckillStatus = 1;
            remainSeconds = 0;
        }
        return new int[]{seckillStatus, remainSeconds};
    }
}
