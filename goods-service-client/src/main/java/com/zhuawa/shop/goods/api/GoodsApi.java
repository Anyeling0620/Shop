package com.zhuawa.shop.goods.api;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Goods;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(value = "goods")
@RequestMapping("/goods")
public interface GoodsApi {
    @GetMapping("/getAllValidGoods")
    Result<List<Goods>> getAllValidGoods();

    @GetMapping("/get/{id}")
    Result<Goods> get(@PathVariable(name = "id") Long id);

    @GetMapping("/decrStock")
    Result<String> decrStock(@RequestParam Long goodsId, @RequestParam Integer count);
}
