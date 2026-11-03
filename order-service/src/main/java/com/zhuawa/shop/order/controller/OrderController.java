package com.zhuawa.shop.order.controller;

import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.TestVO;
import com.zhuawa.shop.order.access.AccessLimit;
import com.zhuawa.shop.order.model.Orders;
import com.zhuawa.shop.order.service.OrderService;
import com.zhuawa.shop.order.vo.OrderVO;
import com.zhuawa.shop.order.vo.OrdersParam;
import com.zhuawa.shop.order.vo.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/order")
public class OrderController {

    @Autowired
    OrderService orderService;

    @GetMapping("/get/{id}")
    public Result<TestVO> testGet(@PathVariable(name = "id")Long id) {
        if (id > 10) {
            throw new GlobalException(CodeMsg.SERVER_ERROR);
        }
        return Result.success(new TestVO());
    }

    @PostMapping("/genOrder")
    @AccessLimit
    public Result<Orders> genOrder(User user, @RequestBody OrdersParam ordersParam) {
        return Result.success(orderService.genOrder(user.getId(), ordersParam));
    }

    @GetMapping("/getOrder/{orderId}")
    @AccessLimit
    public Result<OrderVO> getOrderById(User user, @PathVariable Long orderId) {
        return Result.success(orderService.getOrderById(orderId));
    }

}
