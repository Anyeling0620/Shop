package com.zhuawa.shop.goods.controller;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Goods;
import com.zhuawa.shop.goods.service.GoodsService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    /**
     * 批量获得商品详情。
     *
     * <p><b>前端契约</b>：返回的 Map 只含真实存在的商品，缺失的 id 不会出现在 Map 里，
     * 由调用方自行决定缺失项如何展示（占位、过滤、提示）。</p>
     *
     * <p><b>注意</b>：JSON 序列化后对象的 key 一律是字符串（JSON 规范要求 object 的 key 为 string），
     * 雪花 id 这种 Long 会变成 {@code "1234567890123"} 形式。前端取值请按字符串 id 取，
     * 或先 {@code String(id)} 再匹配；服务端 Feign 解码时 Jackson 会自动把 String key 转回 Long。</p>
     *
     * <p>用 {@code Map<Long, Goods>} 而不是 {@code List<Goods>}：批量查询的典型用法是
     * "拿到一堆 id 后按 id 回填列表"，Map 让调用方 O(1) 取用、且天然表达"哪些 id 缺失"；
     * List 则需要调用方自己按 goods.getId() 重新建索引，还容易在乱序/缺项时错配。</p>
     */
    @ApiOperation(value = "批量根据ID获得商品详情")
    @PostMapping("/getByIds")
    public Result<Map<Long, Goods>> getByIds(@RequestBody List<Long> ids) {
        return Result.success(goodsService.getGoodsByIds(ids));
    }

    @ApiOperation(value = "扣减商品库存")
    @GetMapping("/decrStock")
    Result<String> decrStock(@RequestParam Long goodsId, @RequestParam Integer count) {
        goodsService.decrStock(goodsId, count);
        return Result.success("success");
    }
}
