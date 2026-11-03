package com.zhuawa.shop.search.controller;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.search.model.SearchGoodsParam;
import com.zhuawa.shop.search.model.SearchGoodsRes;
import com.zhuawa.shop.search.service.GoodsService;
import io.swagger.annotations.Api;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@Api(tags = "搜索商品模块")
@RestController
@CrossOrigin
@RequestMapping("/search/goods")
public class GoodsController {

    private static Logger logger = LoggerFactory.getLogger(GoodsController.class);

    @Autowired
    GoodsService goodsService;

    @GetMapping("/exportData2ES")
    public Result<String> exportData2ES() {
        goodsService.exportData2ES();
        return Result.success("导出到ES成功");
    }

    @PostMapping("/search/{page}/{size}")
    public Result<SearchGoodsRes> searchForPage(@PathVariable Integer page,
                                                @PathVariable Integer size,
                                                @RequestBody(required = false) SearchGoodsParam params) {
        if (params == null) {
            params = new SearchGoodsParam();
        }
        logger.info("search params: {}", params.toString());
        return Result.success(goodsService.search(params, page, size));
    }
}
