package com.zhuawa.shop.goods.cache.heavykeeper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * HeavyKeeper 纯算法单元测试（不启动 Spring、不连 MySQL/Redis）。
 *
 * <p>覆盖：TopK 准确性、fading 衰减、expelled 挤出计数、分层哈希分布、参数边界与非法参数。</p>
 *
 * <p>参数选择说明：需要"计数精确"的用例统一用 width=100000（与参考用法一致），
 * 使 key 之间的桶冲突概率低到可以断言精确计数；需要"看冲突行为"的用例才刻意用 width=1。</p>
 */
class HeavyKeeperAlgorithmTest {

    /** 与参考用法一致的宽参数，用于需要精确计数的用例。 */
    private static final int WIDE = 100000;

    /** 参考衰减系数。 */
    private static final double DECAY = 0.92D;

    /**
     * 按实现约定计算第 layer 层桶下标：{@code (hash(keyBytes, layer) & 0x7FFFFFFF) % width}。
     *
     * <p>被测类的 {@code hash(byte[], int)} 是包级可见的静态方法，测试同包可直接调用。
     * 本方法只是把实现里的<b>列计算公式</b>复刻出来，用于观察"每层是否落到不同列"，
     * 不重复实现任何计数逻辑。</p>
     */
    private static int bucketIndex(String key, int layer, int width) {
        int h = HeavyKeeper.hash(key.getBytes(), layer);
        return (h & 0x7FFFFFFF) % width;
    }

    /** 连续 add 同一个 key 若干次（每次 increment=1）。 */
    private static void addRepeatedly(TopK topK, String key, int times) {
        for (int i = 0; i < times; i++) {
            topK.add(key, 1);
        }
    }

    @Nested
    @DisplayName("TopK 准确性")
    class TopKAccuracy {

        @Test
        @DisplayName("构造热点序列后 list() 的 top1 就是预期热点 key")
        void topOneIsExpectedHotKey() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            // 热点 key 访问 500 次
            addRepeatedly(topK, "goods:detail:hot", 500);
            // 100 个冷 key 各访问 1 次，制造干扰候选
            for (int i = 0; i < 100; i++) {
                topK.add("goods:detail:cold-" + i, 1);
            }

            List<Item> top = topK.list();
            assertEquals(10, top.size(), "k=10 时应恰好维护 10 个候选，实际: " + top);
            assertEquals("goods:detail:hot", top.get(0).key(), "top1 应为热点 key，实际 top 列表: " + top);
            assertEquals(500, top.get(0).count(), "热点 key 的计数应精确等于 500（width 足够大无冲突）");
        }

        @Test
        @DisplayName("多个热点按计数降序排列，list() 返回降序快照")
        void listIsSortedByCountDesc() {
            TopK topK = new HeavyKeeper(5, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 50);
            addRepeatedly(topK, "b", 300);
            addRepeatedly(topK, "c", 10);

            List<Item> top = topK.list();
            assertEquals(3, top.size(), "只有 3 个候选，实际: " + top);
            assertEquals("b", top.get(0).key());
            assertEquals("a", top.get(1).key());
            assertEquals("c", top.get(2).key());
            for (int i = 1; i < top.size(); i++) {
                assertTrue(top.get(i - 1).count() >= top.get(i).count(),
                        "列表必须按 count 降序，实际: " + top);
            }
        }

        @Test
        @DisplayName("累计到 minCount 之前不判热，达到 minCount 立即判热")
        void minCountGatesHotDecision() {
            int minCount = 10;
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, minCount);
            for (int i = 1; i < minCount; i++) {
                TopK.AddResult result = topK.add("k", 1);
                assertFalse(result.hotKey(), "第 " + i + " 次访问（< minCount）不应判热: " + result);
            }
            assertTrue(topK.list().isEmpty(), "未达阈值的 key 不应进入 TopK，实际: " + topK.list());

            TopK.AddResult atThreshold = topK.add("k", 1);
            assertTrue(atThreshold.hotKey(), "第 " + minCount + " 次访问应判热: " + atThreshold);
            assertEquals(1, topK.list().size());
            assertEquals(minCount, topK.list().get(0).count());
        }

        @Test
        @DisplayName("total() 累加所有 increment")
        void totalAccumulates() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            topK.add("a", 3);
            topK.add("b", 7);
            assertEquals(10L, topK.total());
        }

        @Test
        @DisplayName("list() 返回快照，外部修改不影响内部状态")
        void listReturnsSnapshot() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 20);
            List<Item> first = topK.list();
            first.clear();
            assertEquals(1, topK.list().size(), "外部 clear 不应清空内部堆");
        }
    }

    @Nested
    @DisplayName("fading 衰减")
    class Fading {

        @Test
        @DisplayName("fading() 后计数右移一位，total 同步右移")
        void fadingHalvesCountsAndTotal() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 100);
            addRepeatedly(topK, "b", 8);
            assertEquals(108L, topK.total());

            topK.fading();

            assertEquals(54L, topK.total(), "total 应从 108 衰减为 54");
            List<Item> top = topK.list();
            assertEquals(2, top.size(), "衰减不应丢失候选，实际: " + top);
            Map<String, Integer> counts = new HashMap<String, Integer>();
            for (Item item : top) {
                counts.put(item.key(), item.count());
            }
            assertEquals(Integer.valueOf(50), counts.get("a"), "100 >> 1 = 50，实际: " + top);
            assertEquals(Integer.valueOf(4), counts.get("b"), "8 >> 1 = 4，实际: " + top);
        }

        @Test
        @DisplayName("fading() 同时衰减桶计数：衰减后再 add 从衰减后的值继续累加")
        void fadingAlsoHalvesBuckets() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 100);
            topK.fading();
            topK.add("a", 1);

            // 若桶计数未衰减，这里会得到 101；正确衰减后应为 51。
            assertEquals(51, topK.list().get(0).count(),
                    "桶计数应已衰减为 50，再 +1 得 51；若为 101 说明桶未衰减");
            assertEquals(51L, topK.total(), "total 应为 100>>1=50 再 +1 = 51");
        }

        @Test
        @DisplayName("空实例 fading() 不抛异常，计数保持 0")
        void fadingOnEmptyKeeperIsSafe() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            assertDoesNotThrow(topK::fading);
            assertEquals(0L, topK.total());
            assertTrue(topK.list().isEmpty());
        }

        @Test
        @DisplayName("连续多次 fading() 逐步归零且不抛异常")
        void repeatedFadingConvergesToZero() {
            TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 5);
            for (int i = 0; i < 6; i++) {
                assertDoesNotThrow(topK::fading);
            }
            assertEquals(0L, topK.total(), "5 右移 6 次应为 0");
            assertEquals(0, topK.list().get(0).count(), "堆内计数应归零，实际: " + topK.list());
        }
    }

    @Nested
    @DisplayName("expelled 挤出")
    class Expelled {

        @Test
        @DisplayName("超过 k 个候选时挤出的 Item 记录被挤出 key 自身的 count（缺陷修正点 2）")
        void expelledItemRecordsExpelledKeyOwnCount() {
            // k=3：先塞满 a=5、b=10、c=15
            TopK topK = new HeavyKeeper(3, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 5);
            addRepeatedly(topK, "b", 10);
            addRepeatedly(topK, "c", 15);
            assertEquals(3, topK.list().size());
            assertTrue(topK.expelled().isEmpty(), "未超容量时不应有挤出记录");

            // 新 key d 计数 20，大于当前最小者 a 的 5，应把 a 挤出
            TopK.AddResult result = topK.add("d", 20);

            assertTrue(result.hotKey(), "d 应进入 TopK: " + result);
            assertEquals("d", result.currentKey());
            assertEquals("a", result.expelledKey(), "被挤出者应为 a，实际: " + result);

            Item expelled = topK.expelled().poll();
            assertNotNull(expelled, "挤出队列应有 1 条记录");
            assertEquals("a", expelled.key(), "挤出记录 key 应为 a");
            assertEquals(5, expelled.count(),
                    "挤出记录必须是被挤出 key 自身的 count=5；若为 20 说明记录的仍是当前 key 的计数（缺陷未修正）");

            List<Item> top = topK.list();
            assertEquals(3, top.size(), "挤出后容量仍为 k，实际: " + top);
            assertEquals("d", top.get(0).key());
            assertEquals(20, top.get(0).count());
            for (Item item : top) {
                assertFalse("a".equals(item.key()), "a 已被挤出，不应仍在 TopK: " + top);
            }
        }

        @Test
        @DisplayName("新 key 计数不足最小者时不挤出，expelled 队列保持为空")
        void smallerCandidateDoesNotExpel() {
            TopK topK = new HeavyKeeper(2, WIDE, 5, DECAY, 1);
            addRepeatedly(topK, "a", 50);
            addRepeatedly(topK, "b", 60);

            TopK.AddResult result = topK.add("c", 10);

            assertFalse(result.hotKey(), "计数 10 < 当前最小 50，不应判热: " + result);
            assertEquals(null, result.expelledKey(), "不应挤出任何 key: " + result);
            assertTrue(topK.expelled().isEmpty());
            assertEquals(2, topK.list().size());
        }

        @Test
        @DisplayName("一批 key 依次挤入时，挤出记录与容量上限保持一致")
        void expelledRecordsMatchEvictions() {
            int k = 3;
            TopK topK = new HeavyKeeper(k, WIDE, 5, DECAY, 1);
            // 15 个 key，计数 1..15 递增，最终 TopK 应留下计数最大的 3 个
            for (int i = 1; i <= 15; i++) {
                addRepeatedly(topK, "key-" + i, i);
            }

            List<Item> top = topK.list();
            assertEquals(k, top.size(), "容量应恒为 k，实际: " + top);
            assertEquals("key-15", top.get(0).key(), "计数最大的 key-15 应在 top1，实际: " + top);
            assertEquals("key-14", top.get(1).key(), "实际: " + top);
            assertEquals("key-13", top.get(2).key(), "实际: " + top);

            // 被挤出的 key 数量 = 曾进入过的 key 数 - k = 15 - 3
            List<Item> expelledAll = new ArrayList<Item>(topK.expelled());
            assertEquals(15 - k, expelledAll.size(),
                    "挤出记录数应等于 evictions 次数，实际: " + expelledAll);
            for (Item item : expelledAll) {
                assertNotNull(item.key(), "挤出记录不应有 null key");
                assertTrue(item.count() > 0, "挤出记录计数应为正: " + item);
            }
            // 被挤出者不应出现在最终 TopK 中
            Set<String> remaining = new HashSet<String>();
            for (Item item : top) {
                remaining.add(item.key());
            }
            for (Item item : expelledAll) {
                assertFalse(remaining.contains(item.key()),
                        item.key() + " 已挤出却仍在 TopK 中");
            }
        }
    }

    @Nested
    @DisplayName("分层哈希分布（缺陷修正点 1）")
    class HashDistribution {

        @Test
        @DisplayName("同一 key 在不同层映射到不同 bucket，不退化单列")
        void differentLayersMapToDifferentBuckets() {
            int width = 1000;
            int depth = 5;
            int keyCount = 256;

            int fullyDegenerate = 0;   // 所有层都同一列（参考实现缺陷的表现）
            int layer0EqualsLayer1 = 0; // 第 0 层与第 1 层同列的数量
            for (int i = 0; i < keyCount; i++) {
                String key = "goods:detail:" + i;
                Set<Integer> distinct = new HashSet<Integer>();
                for (int layer = 0; layer < depth; layer++) {
                    int index = bucketIndex(key, layer, width);
                    assertTrue(index >= 0 && index < width, "桶下标必须落在 [0, width): " + index);
                    distinct.add(index);
                }
                if (distinct.size() == 1) {
                    fullyDegenerate++;
                }
                if (bucketIndex(key, 0, width) == bucketIndex(key, 1, width)) {
                    layer0EqualsLayer1++;
                }
                assertTrue(distinct.size() >= 2,
                        key + " 在 " + depth + " 层全都落到同一列 " + distinct
                                + "，说明分层哈希退化为单层（缺陷未修正）");
            }

            assertEquals(0, fullyDegenerate, "不应有任何 key 在 5 层中全部同列");
            // 独立哈希下两点碰撞概率约 1/1000，256 个 key 期望 0.256 次；这里给足余量仍能识别退化（退化时=256）
            assertTrue(layer0EqualsLayer1 <= 5,
                    "第 0/1 层同列数量应远小于 key 总数（退化实现会等于 " + keyCount
                            + "），实际: " + layer0EqualsLayer1);
        }

        @Test
        @DisplayName("width 很小时同一 key 仍不会总落在同一列（统计口径）")
        void smallWidthStillSpreadsAcrossLayers() {
            int width = 8;
            int depth = 5;
            int keyCount = 200;

            int allSame = 0;
            double distinctSum = 0;
            for (int i = 0; i < keyCount; i++) {
                String key = "k-" + i;
                Set<Integer> distinct = new HashSet<Integer>();
                for (int layer = 0; layer < depth; layer++) {
                    distinct.add(bucketIndex(key, layer, width));
                }
                if (distinct.size() == 1) {
                    allSame++;
                }
                distinctSum += distinct.size();
            }

            double avgDistinct = distinctSum / keyCount;
            // 理论期望（5 层独立均匀投 8 列）：E[不同列数] = 8 * (1 - (7/8)^5) ≈ 3.905。
            // 退化实现（所有层同一列）时该值恒为 1.0，所以下界取 3.5 已能可靠区分，且不受哈希抖动影响。
            double theoretical = width * (1.0D - Math.pow((width - 1.0D) / width, depth));
            assertEquals(0, allSame,
                    "width=" + width + " 时也不应有 key 在 5 层全同列；出现 " + allSame + " 个说明分层哈希无效");
            assertTrue(avgDistinct >= 3.5D,
                    "5 层平均不同列数应接近理论值 " + theoretical + "（退化实现恒为 1.0），实际平均: " + avgDistinct);
        }

        @Test
        @DisplayName("每一层各自的桶分布都是均匀的（各层独立且都覆盖全宽度）")
        void eachLayerDistributesAcrossAllBuckets() {
            int width = 1000;
            int depth = 5;
            int keyCount = 2000;

            for (int layer = 0; layer < depth; layer++) {
                int[] hits = new int[width];
                for (int i = 0; i < keyCount; i++) {
                    hits[bucketIndex("key-" + i, layer, width)]++;
                }
                int usedBuckets = 0;
                for (int hit : hits) {
                    if (hit > 0) {
                        usedBuckets++;
                    }
                }
                // 2000 次投 1000 桶，期望覆盖约 1000*(1-e^-2)=864 个桶
                assertTrue(usedBuckets >= 800,
                        "第 " + layer + " 层只用到 " + usedBuckets + "/" + width + " 个桶，分布异常");
            }
        }

        @Test
        @DisplayName("fingerprint 仍只用 seed=0 的哈希：同一 key 各层指纹一致可比较")
        void fingerprintIsStableAcrossLayers() {
            // 直接验证：同一 key 用 seed=0 哈希具有确定性，且不同层桶下标来自不同 seed
            byte[] keyBytes = "goods:detail:9527".getBytes();
            int fingerprint1 = HeavyKeeper.hash(keyBytes, 0);
            int fingerprint2 = HeavyKeeper.hash("goods:detail:9527".getBytes(), 0);
            assertEquals(fingerprint1, fingerprint2, "同一 key 的 seed=0 哈希必须确定");

            Set<Integer> layerHashes = new HashSet<Integer>();
            for (int layer = 0; layer < 5; layer++) {
                layerHashes.add(HeavyKeeper.hash(keyBytes, layer));
            }
            assertEquals(5, layerHashes.size(), "5 层应产生 5 个不同哈希值，实际: " + layerHashes);
        }
    }

    @Nested
    @DisplayName("参数边界与非法参数")
    class Parameters {

        @Test
        @DisplayName("k 非正数抛 IllegalArgumentException")
        void invalidKThrows() {
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(0, 100, 5, DECAY, 10));
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(-1, 100, 5, DECAY, 10));
        }

        @Test
        @DisplayName("width 非正数抛 IllegalArgumentException")
        void invalidWidthThrows() {
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 0, 5, DECAY, 10));
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, -100, 5, DECAY, 10));
        }

        @Test
        @DisplayName("depth 非正数抛 IllegalArgumentException")
        void invalidDepthThrows() {
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 100, 0, DECAY, 10));
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 100, -5, DECAY, 10));
        }

        @Test
        @DisplayName("decay 超出 (0,1] 抛 IllegalArgumentException；decay=1.0 合法")
        void invalidDecayThrows() {
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 100, 5, 0.0D, 10));
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 100, 5, -0.5D, 10));
            assertThrows(IllegalArgumentException.class, () -> new HeavyKeeper(10, 100, 5, 1.0001D, 10));

            TopK topK = assertDoesNotThrow(() -> new HeavyKeeper(2, 100, 2, 1.0D, 1),
                    "decay=1.0 表示不衰减，应合法");
            addRepeatedly(topK, "a", 3);
            assertEquals(3, topK.list().get(0).count(), "decay=1.0 时计数应正常累加");
        }

        @Test
        @DisplayName("increment 非正数抛 IllegalArgumentException，null/空 key 不抛异常")
        void invalidIncrementAndKey() {
            TopK topK = new HeavyKeeper(10, 100, 5, DECAY, 1);
            assertThrows(IllegalArgumentException.class, () -> topK.add("k", 0));
            assertThrows(IllegalArgumentException.class, () -> topK.add("k", -3));

            assertFalse(topK.add(null, 1).hotKey(), "null key 应返回 notHot，不得抛 NPE");
            assertFalse(topK.add("", 1).hotKey(), "空 key 应返回 notHot");
            assertEquals(0L, topK.total(), "非法 key 不应累加 total");
        }

        @Test
        @DisplayName("极小参数 width=1/depth=1/k=1 可运行且不死循环")
        void minimalParametersTerminate() {
            int[] params = new int[] {1, 1, 1};
            assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
                TopK topK = new HeavyKeeper(params[0], params[1], params[2], DECAY, 1);
                for (int i = 0; i < 500; i++) {
                    topK.add("k-" + i, 1);
                }
                assertTrue(topK.list().size() <= 1, "k=1 时 TopK 最多 1 个元素");
            }, "width=1/depth=1/k=1 下 add 必须在 10s 内结束，不得静默死循环");
        }

        @Test
        @DisplayName("桶计数超过 lookUpTable 上界时按上界兜底，不抛 ArrayIndexOutOfBounds")
        void hugeCountIsClampedByLookup() {
            // width=1 时所有 key 共用一个桶，先把计数堆到 300（远超 LOOKUP_TABLE_SIZE=256）
            TopK topK = new HeavyKeeper(1, 1, 1, DECAY, 1);
            addRepeatedly(topK, "A", 300);
            assertEquals(300, topK.list().get(0).count(), "同一 key 在单桶内应精确累加到 300");

            // 此时来一个不同的 key，需要按 decay^300 取概率；若不兜底会下标越界
            assertDoesNotThrow(() -> topK.add("B", 5),
                    "lookup 必须对 count>=256 做上界兜底，否则抛 ArrayIndexOutOfBounds");
        }

        @Test
        @DisplayName("minCount 极小/负数时所有访问都判热，且不死循环")
        void tinyMinCountMarksEverythingHot() {
            int[] minCounts = new int[] {0, -5};
            for (int minCount : minCounts) {
                TopK topK = new HeavyKeeper(1, 100, 2, DECAY, minCount);
                assertTrue(topK.add("x", 1).hotKey(), "minCount=" + minCount + " 时首次访问即判热");
            }
        }

        @Test
        @DisplayName("minCount 极大时永不判热，TopK 保持空")
        void hugeMinCountNeverMarksHot() {
            TopK topK = new HeavyKeeper(10, 100, 2, DECAY, 100000);
            for (int i = 0; i < 1000; i++) {
                assertFalse(topK.add("x", 1).hotKey(), "远低于 minCount 不应判热");
            }
            assertTrue(topK.list().isEmpty(), "未达阈值的 key 不应进入 TopK");
            assertEquals(1000L, topK.total(), "total 仍应累计访问量");
        }

        @Test
        @DisplayName("参数组合大压力下 add 不抛异常（极窄 width + 大 depth）")
        void narrowWidthDeepStackIsSafe() {
            assertTimeoutPreemptively(Duration.ofSeconds(20), () -> {
                TopK topK = new HeavyKeeper(5, 2, 16, DECAY, 1);
                for (int i = 0; i < 2000; i++) {
                    topK.add("key-" + (i % 50), 1);
                }
                assertTrue(topK.list().size() <= 5, "TopK 元素数不得超过 k");
            }, "width=2/depth=16 下 2000 次 add 必须在 20s 内结束");
        }
    }
}
