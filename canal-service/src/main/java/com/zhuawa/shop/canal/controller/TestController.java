package com.zhuawa.shop.canal.controller;

import com.zhuawa.shop.canal.rabbitmq.MQSender;
import com.zhuawa.shop.common.result.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/test")
public class TestController {
    @Autowired
    MQSender sender;

    @GetMapping("/mq/direct")
    public Result<String> mq() {
        sender.send("direct exchange");
        return Result.success("success");
    }

    @GetMapping("/mq/header")
    public Result<String> header() {
        sender.sendHeader("header exchange");
        return Result.success("success");
    }

    @GetMapping("/mq/fanout")
    public Result<String> fanout() {
        sender.sendFanout("fanout exchange");
        return Result.success("success");
    }

    @GetMapping("/mq/topic")
    public Result<String> topic() {
        sender.sendTopic("topic exchange");
        return Result.success("success");
    }
}
