package com.zhuawa.shop.seckill.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
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
     * 3. redis decr 预减库存（<0 置内存标记并回补）
     * 4. redis setnx 判重
     * 5. 发 MQ 异步下单，返回排队中
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
        // 3. redis 预减库存
        long stock = redisService.decr(RedisKeys.SECKILL_STOCK + goodsId);
        if (stock < 0) {
            seckillOverMap.put(goodsId, true);
            redisService.set(RedisKeys.SECKILL_GOODS_OVER + goodsId, "true");
            redisService.incr(RedisKeys.SECKILL_STOCK + goodsId); // 回补，避免多实例下库存被多扣
            return Result.error(CodeMsg.SECKILL_OVER);
        }
        // 4. setnx 判重，一人一单
        boolean first = redisService.setIfAbsent(
                RedisKeys.SECKILL_ORDER_MARK + user.getId() + ":" + goodsId, "1", 3600);
        if (!first) {
            return Result.error(CodeMsg.SECKILL_REPEAT);
        }
        // 5. 发消息，异步落单
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
