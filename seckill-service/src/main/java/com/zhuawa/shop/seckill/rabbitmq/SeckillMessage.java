package com.zhuawa.shop.seckill.rabbitmq;

/**
 * 秒杀 MQ 消息体
 */
public class SeckillMessage {

    private long userId;
    private long goodsId;
    /**
     * 场次编号。
     * <p>
     * 为什么必须随消息下传、而不是消费时再查"当前场次"：
     * MQ 是异步的，消息投递到消费之间存在延迟，若消费时再取当前场，
     * 刚好跨场次的那条消息会被记到下一场的库存和订单上 —— 扣错了场次的库存，
     * 而且一人一单的判据也会跟着错位。
     */
    private int sessionId;

    /**
     * 本次预扣的唯一标识（一次 Lua 预扣生成一个）。
     * <p>
     * 为什么必须随消息下传：MQ 是「至少一次」投递，同一条消息可能被消费两次，
     * 而补偿（归还名额）是<b>有副作用</b>的写操作 —— 没有这个标识，就无法区分
     * "第一次处理的失败补偿" 与 "重投后对已归还名额的重复补偿"，
     * 后者会让库存凭空 +1，直接超卖。
     * 消费端拿它作为归还闸门 key，天然幂等；同时它也用来识别"这条消息的名额早已被归还"，
     * 从而丢弃重投消息，避免对已归还的名额再下一次单。
     * <p>
     * 兼容性：改造前入队的旧消息不带该字段，反序列化后为 null，
     * 消费端会退化到用 "userId:goodsId:sessionId" 拼闸门 key，不会 NPE，也不会失去补偿能力。
     */
    private String requestId;

    public long getUserId() {
        return userId;
    }

    public void setUserId(long userId) {
        this.userId = userId;
    }

    public long getGoodsId() {
        return goodsId;
    }

    public void setGoodsId(long goodsId) {
        this.goodsId = goodsId;
    }

    public int getSessionId() {
        return sessionId;
    }

    public void setSessionId(int sessionId) {
        this.sessionId = sessionId;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }
}
