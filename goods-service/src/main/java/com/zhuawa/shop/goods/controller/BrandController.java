package com.zhuawa.shop.goods.controller;

import com.github.pagehelper.PageInfo;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.Brand;
import com.zhuawa.shop.goods.service.BrandService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Api(tags = "品牌模块")
@RestController
@RequestMapping("/brand")
public class BrandController {

    @Autowired
    BrandService brandService;

    @ApiOperation(value = "根据ID查询品牌详情")
    @GetMapping("/{id}")
    public Result<Brand> getById(@PathVariable("id") long id) {
        return Result.success(brandService.getById(id));
    }

    @ApiOperation(value = "新增品牌")
    @PostMapping("/add")
    public Result<Long> add(@RequestBody Brand brand) {
        return Result.success(brandService.add(brand));
    }

    @ApiOperation(value = "修改品牌")
    @PostMapping("/update")
    public Result<String> update(@RequestBody Brand brand) {
        brandService.update(brand);
        return Result.success("success");
    }

    @ApiOperation(value = "根据ID删除品牌")
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable("id")long id) {
        brandService.deleteById(id);
        return Result.success("success");
    }

    @ApiOperation(value = "按条件查询品牌列表")
    @PostMapping("/search")
    public Result<List<Brand>> search(@RequestBody Brand brand) {
        return Result.success(brandService.searchList(brand));
    }

    @ApiOperation(value = "分页查询品牌列表")
    @GetMapping("/list/{page}/{size}")
    public Result<PageInfo<Brand>> listWithPage(@PathVariable int page, @PathVariable int size) {
        return Result.success(brandService.listWithPage(page, size));
    }

    @ApiOperation(value = "按条件分页查询品牌")
    @PostMapping("/search/{page}/{size}")
    public Result<PageInfo<Brand>> searchWithPage(@RequestBody Brand brand, @PathVariable int page, @PathVariable int size) {
        return Result.success(brandService.searchWithPage(brand, page, size));
    }

    @ApiOperation(value = "根据类目ID查询品牌列表")
    @GetMapping("/listByCategoryId")
    public Result<List<Brand>> listByCategoryId(@RequestParam long categoryId) {
        return Result.success(brandService.listByCategoryId(categoryId));
    }
}
