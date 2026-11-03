package com.zhuawa.shop.seckill.api;

import com.zhuawa.shop.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 秒杀服务对外 Feign 接口
 */
@FeignClient(value = "seckill")
@RequestMapping("/seckill")
public interface SeckillApi {

    /**
     * 查询秒杀结果
     *
     * @param userId  用户id
     * @param goodsId 商品id
     * @return orderId：秒杀成功；-1：秒杀失败（无库存）；0：排队中
     */
    @GetMapping("/result/query")
    Result<Long> seckillResult(@RequestParam("userId") long userId, @RequestParam("goodsId") long goodsId);
}
