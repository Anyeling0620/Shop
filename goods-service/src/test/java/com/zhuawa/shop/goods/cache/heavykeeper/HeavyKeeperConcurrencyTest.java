package com.zhuawa.shop.goods.cache.heavykeeper;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/**
 * HeavyKeeper 并发安全测试：多线程并发 add，断言不抛异常、top1 仍为预期热点、容量不越界。
 *
 * <p>不启动 Spring、不连 MySQL/Redis，只测纯算法。</p>
 */
class HeavyKeeperConcurrencyTest {

    /** 与参考用法一致的宽参数。 */
    private static final int WIDE = 100000;

    /** 参考衰减系数。 */
    private static final double DECAY = 0.92D;

    /** 线程数与每线程 add 次数：8 x 1000。 */
    private static final int THREADS = 8;

    private static final int ADDS_PER_THREAD = 1000;

    /**
     * 8 线程 x 1000 次并发 add，其中绝大多数打在同一个热点 key 上。
     *
     * <p>断言：无异常、top1 是该热点 key、其计数精确等于所有线程对它的累加总和（桶级 synchronized 保证不丢计数）。</p>
     */
    @Test
    @DisplayName("8 线程 x 1000 次并发 add 无异常，top1 仍为预期热点且计数不丢")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentAddKeepsHotKeyOnTop() throws Exception {
        final String hotKey = "goods:detail:concurrent-hot";
        final int hotAddsPerThread = 900;
        final TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);

        final CountDownLatch startGate = new CountDownLatch(1);
        final AtomicInteger addCalls = new AtomicInteger(0);
        final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        List<Future<?>> futures = new ArrayList<Future<?>>();

        try {
            for (int t = 0; t < THREADS; t++) {
                final int threadIndex = t;
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            // 同时起跑，最大化并发冲突
                            startGate.await();
                            for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                if (i < hotAddsPerThread) {
                                    topK.add(hotKey, 1);
                                } else {
                                    // 每个线程的冷 key 各不相同，避免相互干扰
                                    topK.add("cold-" + threadIndex + "-" + i, 1);
                                }
                                addCalls.incrementAndGet();
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));
            }

            startGate.countDown();
            for (Future<?> future : futures) {
                // get() 会把线程内的异常原样抛出，确保"不抛异常"是被真正断言的
                future.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals(null, workerFailure.get(),
                "并发 add 期间不得抛异常，实际抛出: " + workerFailure.get());
        assertEquals(THREADS * ADDS_PER_THREAD, addCalls.get(), "所有 add 调用都应完成");

        List<Item> top = topK.list();
        assertNotNull(top);
        assertEquals(10, top.size(), "k=10 且候选充足，TopK 应满额，实际: " + top);
        assertEquals(hotKey, top.get(0).key(), "并发后 top1 仍应为热点 key，实际 top: " + top);

        int expectedHotCount = THREADS * hotAddsPerThread;
        assertEquals(expectedHotCount, top.get(0).count(),
                "热点 key 计数必须精确等于并发累加总和 " + expectedHotCount + "，实际: " + top.get(0));

        // 注意：并发下 total() 的精确性由 concurrentTotalIsNotLost 单独覆盖，
        // 该用例的并发精确断言由 concurrentTotalIsNotLost 单独覆盖（HK-TOTAL-1 回归）。

        // TopK 恒有序
        for (int i = 1; i < top.size(); i++) {
            assertTrue(top.get(i - 1).count() >= top.get(i).count(), "并发后 TopK 仍需降序: " + top);
        }
    }

    /**
     * 8 线程 x 1000 次并发 add 打到<b>各自不同</b>的 key 上，assert 全程不抛异常、容量始终不越界。
     */
    @Test
    @DisplayName("8 线程 x 1000 次并发 add 到不同 key，容量恒不超过 k 且无异常")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentAddOnDistinctKeysKeepsCapacityBounded() throws Exception {
        final int k = 20;
        final TopK topK = new HeavyKeeper(k, 4096, 3, DECAY, 1);
        final CountDownLatch startGate = new CountDownLatch(1);
        final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
        final AtomicInteger oversizeObserved = new AtomicInteger(0);
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        List<Future<?>> futures = new ArrayList<Future<?>>();

        try {
            for (int t = 0; t < THREADS; t++) {
                final int threadIndex = t;
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startGate.await();
                            for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                topK.add("k-" + threadIndex + "-" + i, 1);
                                if (i % 200 == 0) {
                                    // 边写边读快照，验证读路径不会抛 ConcurrentModificationException
                                    if (topK.list().size() > k) {
                                        oversizeObserved.incrementAndGet();
                                    }
                                }
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));
            }

            startGate.countDown();
            for (Future<?> future : futures) {
                future.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals(null, workerFailure.get(), "并发 add/list 期间不得抛异常，实际: " + workerFailure.get());
        assertEquals(0, oversizeObserved.get(), "并发读到的 TopK 快照不得超过 k=" + k);
        assertTrue(topK.list().size() <= k, "最终 TopK 元素数不得超过 k");
        // total() 的并发精确性见 concurrentTotalIsNotLost()（HK-TOTAL-1 回归）。
        assertTrue(topK.total() > 0L, "并发后 total 应为正数，实际: " + topK.total());
    }

    /**
     * 并发下 total() 必须精确等于所有 increment 之和。
     *
     * <p><b>回归用例，保护已修复缺陷 HK-TOTAL-1：</b>原实现 {@code HeavyKeeper.add()} 用
     * {@code total += increment} 对 {@code volatile long total} 做非原子读-改-写，并发下丢失更新
     * （实测 8 线程 x 1000 次得到 7708/7916，期望 8000）；{@code fading()} 的 {@code total = total >> 1}
     * 同样非原子。algo-dev 已改为 {@link java.util.concurrent.atomic.AtomicLong}
     * （累加 {@code addAndGet}、衰减 {@code updateAndGet}），本用例从此为常开的严格断言，
     * 若有人回退成非原子写法会立刻失败。</p>
     *
     * <p>历史观察：缺陷只影响 total() 指标，同一轮中 top1 热点 key 的 count 断言一直精确通过，
     * 桶级 synchronized 未丢计数。</p>
     */
    @Test
    @DisplayName("并发下 total() 不得丢失更新（HK-TOTAL-1 回归）")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentTotalIsNotLost() throws Exception {
        final TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
        final CountDownLatch startGate = new CountDownLatch(1);
        final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        List<Future<?>> futures = new ArrayList<Future<?>>();

        try {
            for (int t = 0; t < THREADS; t++) {
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startGate.await();
                            for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                topK.add("key-" + (i % 100), 1);
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));
            }
            startGate.countDown();
            for (Future<?> future : futures) {
                future.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals(null, workerFailure.get(), "并发 add 不得抛异常，实际: " + workerFailure.get());
        assertEquals(THREADS * ADDS_PER_THREAD, topK.total(),
                "total() 必须精确等于全部 add 次数之和，不得丢失更新");
    }

    /**
     * 并发 add 结束后执行 fading()，total 必须精确等于衰减后的值。
     *
     * <p><b>回归用例，保护已修复缺陷 HK-TOTAL-1 的第二处：</b>{@code fading()} 原为
     * {@code total = total >> 1}（读-改-写），与并发 add 交错会丢更新。algo-dev 已改为
     * {@code AtomicLong.updateAndGet(...)}，本条在严格断言下常开，用于锁定该修复。</p>
     *
     * <p>对比参考：单线程下 fading 的衰减语义由 {@link #fadingHalvesTotalDeterministically()}
     * 独立覆盖（1000 -> 500 -> 250），两条互不依赖。</p>
     */
    @Test
    @DisplayName("并发 add 后 fading，total 精确等于衰减值（HK-TOTAL-1 回归）")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentAddThenFadingKeepsTotalExact() throws Exception {
        final TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
        final CountDownLatch startGate = new CountDownLatch(1);
        final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        List<Future<?>> futures = new ArrayList<Future<?>>();

        try {
            for (int t = 0; t < THREADS; t++) {
                final int threadIndex = t;
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startGate.await();
                            for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                topK.add("key-" + threadIndex + "-" + (i % 50), 1);
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));
            }
            startGate.countDown();
            for (Future<?> future : futures) {
                future.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals(null, workerFailure.get(), "并发 add 不得抛异常，实际: " + workerFailure.get());

        long totalBeforeFading = topK.total();
        assertEquals(THREADS * ADDS_PER_THREAD, totalBeforeFading,
                "fading 前 total 必须精确等于 8000，实际: " + totalBeforeFading);

        topK.fading();
        assertEquals(totalBeforeFading >> 1, topK.total(),
                "fading 后 total 必须精确等于 " + (totalBeforeFading >> 1) + "，实际: " + topK.total());

        topK.fading();
        assertEquals(totalBeforeFading >> 2, topK.total(),
                "二次 fading 后 total 必须精确等于 " + (totalBeforeFading >> 2) + "，实际: " + topK.total());
    }

    /**
     * fading 对 total 的衰减语义（单线程，缺陷 HK-TOTAL-1 下也应通过）。
     */
    @Test
    @DisplayName("单线程下 fading 使 total 精确右移：1000 -> 500 -> 250")
    void fadingHalvesTotalDeterministically() {
        TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
        for (int i = 0; i < 1000; i++) {
            topK.add("k", 1);
        }
        assertEquals(1000L, topK.total());
        topK.fading();
        assertEquals(500L, topK.total(), "fading 一次后 total 应为 500");
        topK.fading();
        assertEquals(250L, topK.total(), "fading 两次后 total 应为 250");
    }

    /**
     * 读写混合 + 并发 fading：验证桶与堆的可见性处理不会抛异常、不会死锁。
     */
    @Test
    @DisplayName("并发 add 与 fading 混合执行不抛异常、不死锁")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentAddWithFadingIsSafe() {
        assertDoesNotThrow(() -> {
            final TopK topK = new HeavyKeeper(10, WIDE, 5, DECAY, 1);
            final int writerThreads = 8;
            final CountDownLatch startGate = new CountDownLatch(1);
            final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
            ExecutorService pool = Executors.newFixedThreadPool(writerThreads + 1);
            List<Future<?>> futures = new ArrayList<Future<?>>();

            try {
                for (int t = 0; t < writerThreads; t++) {
                    final int threadIndex = t;
                    futures.add(pool.submit(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                startGate.await();
                                for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                    topK.add("key-" + threadIndex + "-" + (i % 20), 1);
                                }
                            } catch (Throwable e) {
                                workerFailure.compareAndSet(null, e);
                            }
                        }
                    }));
                }
                // 一个线程专门持续 fading，制造与 add 的交错
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startGate.await();
                            for (int i = 0; i < 200; i++) {
                                topK.fading();
                                Thread.sleep(1L);
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));

                startGate.countDown();
                for (Future<?> future : futures) {
                    future.get(55, TimeUnit.SECONDS);
                }
            } finally {
                pool.shutdownNow();
                pool.awaitTermination(10, TimeUnit.SECONDS);
            }

            assertEquals(null, workerFailure.get(),
                    "add 与 fading 并发执行不得抛异常（含 ArrayIndexOutOfBounds/ConcurrentModification），实际: "
                            + workerFailure.get());
            assertTrue(topK.list().size() <= 10, "并发 fading 后 TopK 元素数仍不得超过 k");
        }, "并发 add + fading 不得死锁");
    }

    /**
     * 8 线程 x 1000 次并发 add，每次 add 的返回值都必须非 null 且 key 正确（防止并发下返回脏对象）。
     */
    @Test
    @DisplayName("并发下 add 返回值始终非 null 且 currentKey 正确")
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void concurrentAddResultsAreConsistent() throws Exception {
        final TopK topK = new HeavyKeeper(50, 8192, 3, DECAY, 1);
        final CountDownLatch startGate = new CountDownLatch(1);
        final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
        final Set<String> badResults = ConcurrentHashMap.newKeySet();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        List<Future<?>> futures = new ArrayList<Future<?>>();

        try {
            for (int t = 0; t < THREADS; t++) {
                final int threadIndex = t;
                futures.add(pool.submit(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startGate.await();
                            for (int i = 0; i < ADDS_PER_THREAD; i++) {
                                String key = "key-" + threadIndex + "-" + (i % 5);
                                TopK.AddResult result = topK.add(key, 1);
                                if (result == null) {
                                    badResults.add("null-result-for-" + key);
                                } else if (!key.equals(result.currentKey())) {
                                    badResults.add("wrong-currentKey " + result.currentKey() + " for " + key);
                                }
                            }
                        } catch (Throwable e) {
                            workerFailure.compareAndSet(null, e);
                        }
                    }
                }));
            }

            startGate.countDown();
            for (Future<?> future : futures) {
                future.get(60, TimeUnit.SECONDS);
            }
        } finally {
            pool.shutdownNow();
            pool.awaitTermination(10, TimeUnit.SECONDS);
        }

        assertEquals(null, workerFailure.get(), "并发 add 不得抛异常，实际: " + workerFailure.get());
        assertTrue(badResults.isEmpty(), "add 返回值不得为 null 且 currentKey 必须正确，异常项: " + badResults);
    }
}
