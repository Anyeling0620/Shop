package com.zhuawa.shop.user.api;

import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.user.model.User;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

@FeignClient(value = "user")
@RequestMapping("/user")
public interface UserApi {
    @GetMapping("/addPoint")
    @ResponseBody
    Result<User> addPoint(@RequestParam Long userId, @RequestParam Integer point);
}
