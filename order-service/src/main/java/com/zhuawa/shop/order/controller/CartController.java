package com.zhuawa.shop.order.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.order.service.CartService;
import com.zhuawa.shop.order.vo.CartItemVO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/cart")
public class CartController {

    private static final Logger logger = LoggerFactory.getLogger(CartController.class);

    @Autowired
    CartService cartService;

    @GetMapping("/incr")
    @AccessLimit
    public Result<String> incr(LoginUser user,
                               @RequestParam Long goodsId) {
        int userId = user.getId();
        cartService.incr(userId, goodsId);
        return Result.success("success");
    }

    @GetMapping("/decr")
    @AccessLimit
    public Result<String> decr(@RequestParam Long goodsId,
                               LoginUser user) {
        int userId = user.getId();
        cartService.decr(userId, goodsId);
        return Result.success("success");
    }

    @GetMapping("/set")
    @AccessLimit
    public Result<String> set(@RequestParam Long goodsId,
                              @RequestParam Integer count,
                              LoginUser user) {
        cartService.setCount(user.getId(), goodsId, count);
        return Result.success("success");
    }

    @GetMapping("/list")
    @AccessLimit
    public Result<List<CartItemVO>> list(LoginUser user) {
        return Result.success(cartService.list(user.getId()));
    }
}
