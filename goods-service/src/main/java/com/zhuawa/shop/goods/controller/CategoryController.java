package com.zhuawa.shop.goods.controller;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Category;
import com.zhuawa.shop.goods.service.CategoryService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Api(tags="类目模块")
@RestController
@RequestMapping("/category")
public class CategoryController {

    @Autowired
    CategoryService categoryService;

    @ApiOperation(value = "根据父类目ID查询子类目列表")
    @GetMapping("/getCategoriesByParentId")
    public Result<List<Category>> getCategoriesByParentId(@RequestParam long parentId) {
        return Result.success(categoryService.getCategoriesByParentId(parentId));
    }
}
