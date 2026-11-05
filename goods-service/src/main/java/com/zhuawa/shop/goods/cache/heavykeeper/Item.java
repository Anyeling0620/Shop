package com.zhuawa.shop.goods.cache.heavykeeper;

/**
 * TopK 列表中的一项：热的 key 以及它的计数值。
 *
 * <p>Java 8 环境，不使用 record；字段 final，通过构造器注入，只提供 getter。</p>
 *
 * @author algo-dev
 */
public final class Item {

    /** 热 key。 */
    private final String key;

    /** 该 key 在算法内部的计数值。 */
    private final int count;

    public Item(String key, int count) {
        this.key = key;
        this.count = count;
    }

    public String key() {
        return key;
    }

    public int count() {
        return count;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Item)) {
            return false;
        }
        Item item = (Item) o;
        if (count != item.count) {
            return false;
        }
        return key == null ? item.key == null : key.equals(item.key);
    }

    @Override
    public int hashCode() {
        int result = key == null ? 0 : key.hashCode();
        result = 31 * result + count;
        return result;
    }

    @Override
    public String toString() {
        return "Item{key='" + key + "', count=" + count + '}';
    }
}
