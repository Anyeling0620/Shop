package com.zhuawa.shop.order.controller;

import com.zhuawa.shop.common.access.AccessLimit;
import com.zhuawa.shop.common.access.LoginUser;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.goods.model.TestVO;
import com.zhuawa.shop.order.model.Orders;
import com.zhuawa.shop.order.service.OrderService;
import com.zhuawa.shop.order.vo.OrderVO;
import com.zhuawa.shop.order.vo.OrdersParam;
import io.swagger.annotations.Api;
import springfox.documentation.annotations.ApiIgnore;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@Api(tags = "订单模块")
@RestController
@RequestMapping("/order")
public class OrderController {

    @Autowired
    OrderService orderService;

    @ApiOperation(value = "测试接口（ID大于10时返回服务端异常）")
    @GetMapping("/get/{id}")
    public Result<TestVO> testGet(@PathVariable(name = "id")Long id) {
        if (id > 10) {
            throw new GlobalException(CodeMsg.SERVER_ERROR);
        }
        return Result.success(new TestVO());
    }

    @ApiOperation(value = "提交订单")
    @PostMapping("/genOrder")
    @AccessLimit
    public Result<Orders> genOrder(@ApiIgnore LoginUser user, @RequestBody OrdersParam ordersParam) {
        return Result.success(orderService.genOrder(user.getId(), ordersParam));
    }

    @ApiOperation(value = "根据订单ID查询订单详情")
    @GetMapping("/getOrder/{orderId}")
    @AccessLimit
    public Result<OrderVO> getOrderById(@ApiIgnore LoginUser user, @PathVariable Long orderId) {
        return Result.success(orderService.getOrderById(orderId));
    }

}
