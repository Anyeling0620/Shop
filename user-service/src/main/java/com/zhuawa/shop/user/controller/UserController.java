package com.zhuawa.shop.user.controller;

import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.common.result.Result;
import com.zhuawa.shop.user.model.User;
import com.zhuawa.shop.user.service.UserService;
import com.zhuawa.shop.user.vo.LoginVo;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.validation.Valid;

@Api(tags = "用户模块")
@RestController
@RequestMapping("/user")
public class UserController {

    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    @Autowired
    UserService userService;

    @ApiOperation(value = "用户登录，返回JWT令牌")
    @PostMapping("/login/do_login")
    @ResponseBody
    public Result<String> doLogin(HttpServletResponse response, @Valid LoginVo loginVo) {
        logger.info(loginVo.toString());
        //登录
        String token = userService.login(response, loginVo);
        return Result.success(token);
    }

    @ApiOperation(value = "查询当前登录用户信息")
    @GetMapping("/info")
    @ResponseBody
    public Result<User> getUserInfo(HttpServletRequest request) {
        String token = request.getHeader(UserService.COOKIE_NAME_TOKEN);
        logger.info("header info:{}", token);
        return Result.success(userService.getUserByJwt(token));
    }

    @ApiOperation(value = "增加用户积分")
    @GetMapping("/addPoint")
    @ResponseBody
    public Result<User> addPoint(@RequestParam Long userId, @RequestParam Integer point) {
        return Result.success(userService.addPoint(userId, point));
    }

    @ApiOperation(value = "测试事务回滚")
    @GetMapping("/testTx")
    @ResponseBody
    public Result<String> testTx(){
        if (userService.transaction()) {
            return Result.success("success");
        }
        return Result.error(CodeMsg.SERVER_ERROR);
    }
}
