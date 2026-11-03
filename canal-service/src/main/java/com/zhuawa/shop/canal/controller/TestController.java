package com.zhuawa.shop.canal.controller;

import com.zhuawa.shop.canal.rabbitmq.MQSender;
import com.zhuawa.shop.common.result.Result;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Api(tags = "消息队列测试模块")
@RestController
@RequestMapping("/test")
public class TestController {
    @Autowired
    MQSender sender;

    @ApiOperation(value = "发送Direct交换机测试消息")
    @GetMapping("/mq/direct")
    public Result<String> mq() {
        sender.send("direct exchange");
        return Result.success("success");
    }

    @ApiOperation(value = "发送Header交换机测试消息")
    @GetMapping("/mq/header")
    public Result<String> header() {
        sender.sendHeader("header exchange");
        return Result.success("success");
    }

    @ApiOperation(value = "发送Fanout交换机测试消息")
    @GetMapping("/mq/fanout")
    public Result<String> fanout() {
        sender.sendFanout("fanout exchange");
        return Result.success("success");
    }

    @ApiOperation(value = "发送Topic交换机测试消息")
    @GetMapping("/mq/topic")
    public Result<String> topic() {
        sender.sendTopic("topic exchange");
        return Result.success("success");
    }
}
