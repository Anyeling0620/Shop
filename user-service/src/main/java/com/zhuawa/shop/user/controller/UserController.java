package com.zhuawa.shop.user.controller;

import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.user.model.User;
import com.zhuawa.shop.user.service.UserService;
import com.zhuawa.shop.user.vo.LoginVo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.validation.Valid;

@RestController
@RequestMapping("/user")
public class UserController {

    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    @Autowired
    UserService userService;

    @RequestMapping("/login/do_login")
    @ResponseBody
    public Result<String> doLogin(HttpServletResponse response, @Valid LoginVo loginVo) {
        logger.info(loginVo.toString());
        //登录
        String token = userService.login(response, loginVo);
        return Result.success(token);
    }

    @RequestMapping("/info")
    @ResponseBody
    public Result<User> getUserInfo(HttpServletRequest request) {
        String token = request.getHeader(UserService.COOKIE_NAME_TOKEN);
        logger.info("header info:{}", token);
        return Result.success(userService.getUserByJwt(token));
    }

    @GetMapping("/addPoint")
    @ResponseBody
    public Result<User> addPoint(@RequestParam Long userId, @RequestParam Integer point) {
        return Result.success(userService.addPoint(userId, point));
    }

    @GetMapping("/testTx")
    @ResponseBody
    public Result<String> testTx(){
        if (userService.transaction()) {
            return Result.success("success");
        }
        return Result.error(CodeMsg.SERVER_ERROR);
    }
}
