package com.zhuawa.shop.goods.cache.heavykeeper;

import java.util.List;
import java.util.concurrent.BlockingQueue;

/**
 * 单机热点 key 检测（TopK）抽象。
 *
 * <p>返回值类型 {@link AddResult} 与本接口放在同一个包
 * {@code com.zhuawa.shop.goods.cache.heavykeeper} 下。</p>
 *
 * @author algo-dev
 */
public interface TopK {

    /**
     * 记录一次访问。
     *
     * @param key       被访问的 key
     * @param increment 本次累加的量，必须为正数
     * @return 本次操作的结果，不会返回 null
     */
    AddResult add(String key, int increment);

    /**
     * 返回当前 TopK 列表，按 count 从大到小排列。
     *
     * @return 快照列表，不会返回 null
     */
    List<Item> list();

    /**
     * 返回被挤出 TopK 的 key 队列。消费方自行 poll。
     *
     * @return 被挤出队列，不会返回 null
     */
    BlockingQueue<Item> expelled();

    /**
     * 衰减：所有桶计数、堆内计数与总量统一右移一位（减半）。
     */
    void fading();

    /**
     * 当前累计的访问总量（已按 fading 衰减）。
     *
     * @return 总量
     */
    long total();

    /**
     * 一次 {@link #add(String, int)} 的结果。
     *
     * <p>与 {@link TopK} 同包；Java 8 语法，字段 final，只提供 getter。</p>
     */
    final class AddResult {

        /** 被挤出的 key；没有挤出时为 null。 */
        private final String expelledKey;

        /** 当前 key 是否进入了 TopK。 */
        private final boolean hotKey;

        /** 本次操作的 key。 */
        private final String currentKey;

        public AddResult(String expelledKey, boolean hotKey, String currentKey) {
            this.expelledKey = expelledKey;
            this.hotKey = hotKey;
            this.currentKey = currentKey;
        }

        /** 当前 key 未达到热点阈值时的结果。 */
        public static AddResult notHot(String currentKey) {
            return new AddResult(null, false, currentKey);
        }

        public String expelledKey() {
            return expelledKey;
        }

        public boolean hotKey() {
            return hotKey;
        }

        public String currentKey() {
            return currentKey;
        }

        @Override
        public String toString() {
            return "AddResult{expelledKey='" + expelledKey
                    + "', hotKey=" + hotKey
                    + ", currentKey='" + currentKey + '\'' + '}';
        }
    }
}
