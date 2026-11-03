package com.zhuawa.shop.user.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.zhuawa.shop.common.exception.GlobalException;
import com.zhuawa.shop.common.result.CodeMsg;
import com.zhuawa.shop.user.dao.UserDao;
import com.zhuawa.shop.user.model.User;
import com.zhuawa.shop.user.utils.JwtUtil;
import com.zhuawa.shop.user.utils.MD5Util;
import com.zhuawa.shop.user.utils.UUIDUtil;
import com.zhuawa.shop.user.vo.LoginVo;
import io.jsonwebtoken.Claims;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletResponse;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Service
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    @Autowired
    UserDao userDao;

    public String login(HttpServletResponse response, LoginVo loginVo) {
        if (loginVo == null) {
            throw new GlobalException(CodeMsg.SERVER_ERROR);
        }
        String mobile = loginVo.getMobile();
        String formPass = loginVo.getPassword();
        //判断手机号是否存在
        User user = getByMobile(mobile);
        if (user == null) {
            throw new GlobalException(CodeMsg.MOBILE_NOT_EXIST);
        }
        //验证密码
        String dbPass = user.getPassword();
        String saltDB = user.getSalt();
        String calcPass = MD5Util.formPassToDBPass(formPass, saltDB);
        if (!calcPass.equals(dbPass)) {
            throw new GlobalException(CodeMsg.PASSWORD_ERROR);
        }
        //生成cookie
        String token = UUIDUtil.uuid();
        addCookie(response, user);
        return token;
    }

    public User getByMobile(String mobile) {
        User user = new User();
        user.setMobile(mobile);
        return userDao.selectOne(user);
    }

    public User getUserByJwt(String token) {
        Claims claims = null;
        try {
            claims = JwtUtil.parseJWT(token);
            logger.info("parse result: {}, subject: {}", claims, claims.getSubject());
            JSONObject userInfo = (JSONObject) JSONObject.parse(claims.getSubject());
            return userDao.selectByPrimaryKey(userInfo.get("id"));
        } catch (Exception e) {
            logger.error("parse jwt token {} error:", token, e);
        }
        return new User();
    }

    public User addPoint(long userId, int point) {
        User user = userDao.selectByPrimaryKey(userId);
        user.setPoint(user.getPoint() + point);
        user.setUpdateTime(new Date());
        userDao.updateByPrimaryKeySelective(user);
        return user;
    }

    @Transactional
    public boolean transaction() {
        User u1 = new User();
        u1.setId(3L);
        u1.setNickname("sailuo");
        u1.setMobile("12345678901");
        userDao.insertSelective(u1);

        User u2 = new User();
        u2.setId(3L);
        u2.setNickname("leiou");
        u1.setMobile("12345678901");
        userDao.insertSelective(u2);

        return true;
    }

    public static final String COOKIE_NAME_TOKEN = "zhuawa-shop-token";

    /**
     * jwt 鉴权
     *
     * @param response
     * @param user
     */
    private void addCookie(HttpServletResponse response, User user) {
        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("mobile", user.getMobile());
        userInfo.put("id", user.getId());
        userInfo.put("nickname", user.getNickname());
        userInfo.put("avatar", user.getAvatar());
        String token = JwtUtil.createJWT(UUIDUtil.uuid(), JSON.toJSONString(userInfo), 3600000L);
        Cookie cookie = new Cookie(COOKIE_NAME_TOKEN, token);
        cookie.setMaxAge(3600);
        cookie.setPath("/");
        response.addCookie(cookie);
        response.setHeader(COOKIE_NAME_TOKEN, token);
    }
}
