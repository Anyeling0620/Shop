package com.zhuawa.shop.order.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.order.service.CartService;
import com.zhuawa.shop.order.vo.CartItemVO;
import io.swagger.annotations.Api;
import springfox.documentation.annotations.ApiIgnore;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Api(tags = "购物车模块")
@RestController
@RequestMapping("/cart")
public class CartController {

    private static final Logger logger = LoggerFactory.getLogger(CartController.class);

    @Autowired
    CartService cartService;

    @ApiOperation(value = "购物车商品数量加一")
    @GetMapping("/incr")
    @AccessLimit
    public Result<String> incr(@ApiIgnore LoginUser user,
                               @RequestParam Long goodsId) {
        int userId = user.getId();
        cartService.incr(userId, goodsId);
        return Result.success("success");
    }

    @ApiOperation(value = "购物车商品数量减一")
    @GetMapping("/decr")
    @AccessLimit
    public Result<String> decr(@RequestParam Long goodsId,
                               @ApiIgnore LoginUser user) {
        int userId = user.getId();
        cartService.decr(userId, goodsId);
        return Result.success("success");
    }

    @ApiOperation(value = "设置购物车中某商品的数量")
    @GetMapping("/set")
    @AccessLimit
    public Result<String> set(@RequestParam Long goodsId,
                              @RequestParam Integer count,
                              @ApiIgnore LoginUser user) {
        cartService.setCount(user.getId(), goodsId, count);
        return Result.success("success");
    }

    @ApiOperation(value = "查询当前用户的购物车列表")
    @GetMapping("/list")
    @AccessLimit
    public Result<List<CartItemVO>> list(@ApiIgnore LoginUser user) {
        return Result.success(cartService.list(user.getId()));
    }
}
