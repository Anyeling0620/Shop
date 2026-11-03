package com.zhuawa.shop.goods.controller;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.goods.service.GoodsService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Api(tags = "商品模块")
@RestController
@RequestMapping("/goods")
public class GoodsController {

    @Autowired
    GoodsService goodsService;

    @ApiOperation(value = "按名称/类目/品牌批量生成模拟商品数据")
    @GetMapping("/genMockGoods")
    public Result<List<Goods>> genMockGoods(@RequestParam String baseName,
                                            @RequestParam long categoryId,
                                            @RequestParam long brandId,
                                            @RequestParam long minPrice,
                                            @RequestParam long maxPrice,
                                            @RequestParam long stock) {
        return Result.success(goodsService.genMockGoodsByName(baseName, categoryId, brandId, stock, minPrice, maxPrice));
    }

    @ApiOperation(value = "查询所有上架商品")
    @GetMapping("/getAllValidGoods")
    public Result<List<Goods>> getAllValidGoods() {
        return Result.success(goodsService.getGoodsByStatus(0));
    }

    @ApiOperation(value = "根据ID获得商品详情")
    @GetMapping("/get/{id}")
    public Result<Goods> get(@PathVariable(name = "id") Long id) {
        return Result.success(goodsService.getGoodsById(id));
    }

    @ApiOperation(value = "扣减商品库存")
    @GetMapping("/decrStock")
    Result<String> decrStock(@RequestParam Long goodsId, @RequestParam Integer count) {
        goodsService.decrStock(goodsId, count);
        return Result.success("success");
    }
}
