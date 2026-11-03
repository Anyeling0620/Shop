package com.zhuawa.shop.common.result;

public class CodeMsg {
    private int code;
    private String msg;

    //通用的错误码
    public static CodeMsg SUCCESS = new CodeMsg(0, "success");
    public static CodeMsg SERVER_ERROR = new CodeMsg(500100, "服务端异常");
    public static CodeMsg BIND_ERROR = new CodeMsg(500101, "参数校验异常：%s");
    public static CodeMsg SESSION_ERROR = new CodeMsg(500102, "Session不存在或者已经失效");

    //商品错误码
    public static CodeMsg GOODS_ADD_BRAND_ERROR = new CodeMsg(500200, "添加品牌失败");

    //用户错误码
    public static CodeMsg MOBILE_NOT_EXIST = new CodeMsg(500300, "手机号不存在");
    public static CodeMsg PASSWORD_ERROR = new CodeMsg(500301, "密码错误");
    public static CodeMsg JWT_PARSE_ERROR = new CodeMsg(500302, "jwt token解析错误");

    //order error code
    public static CodeMsg GOODS_NOT_EXIST = new CodeMsg(500400, "goods not exist");
    public static CodeMsg GOODS_STOCK_LIMIT = new CodeMsg(500401, "goods sell out");

    //秒杀错误码
    public static CodeMsg SECKILL_OVER = new CodeMsg(500500, "秒杀已经结束");
    public static CodeMsg SECKILL_REPEAT = new CodeMsg(500501, "不能重复秒杀");
    public static CodeMsg REQUEST_ILLEGAL = new CodeMsg(500502, "请求非法");
    public static CodeMsg SECKILL_FAIL = new CodeMsg(500503, "秒杀失败");
    public static CodeMsg SECKILL_GOODS_NOT_EXIST = new CodeMsg(500504, "秒杀商品不存在");
    public static CodeMsg SECKILL_GOODS_OFF_SHELF = new CodeMsg(500505, "商品已下架");
    public static CodeMsg SECKILL_NOT_START = new CodeMsg(500506, "秒杀尚未开始");
    public static CodeMsg SECKILL_END = new CodeMsg(500507, "秒杀已经结束");


    private CodeMsg() {
    }

    private CodeMsg(int code, String msg) {
        this.code = code;
        this.msg = msg;
    }

    public CodeMsg fillArgs(Object... args) {
        int code = this.code;
        String message = String.format(this.msg, args);
        return new CodeMsg(code, message);
    }

    public int getCode() {
        return code;
    }

    public String getMsg() {
        return msg;
    }
}
