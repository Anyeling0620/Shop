package com.zhuawa.shop.goods.cache.heavykeeper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.Random;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongUnaryOperator;

/**
 * HeavyKeeper 单机 TopK 热点 key 检测。
 *
 * <p>迁移自 yu-like 的 {@code com.yuyuan.thumb.manager.cache.HeavyKeeper}，并修正了参考实现中的若干缺陷：</p>
 * <ol>
 *   <li><b>分层哈希</b>：参考实现在 d 层循环里都使用
 *       {@code Math.abs(hash(keyBytes)) % width}，所有层落到同一列，退化成 1 层 Count-Min Sketch。
 *       本实现对第 i 层使用带种子的 MurmurHash3 得到不同的 bucketNumber；
 *       而 fingerprint 始终使用 {@code hash(keyBytes, 0)} 这一个值，保证同一 key 在 d 层的指纹一致、可比较。</li>
 *   <li><b>expelled 计数</b>：参考实现向 expelledQueue 塞的是当前 key 的 maxCount，
 *       本实现记录的是<b>被挤出那个 key 自身的 count</b>。</li>
 *   <li><b>expelled 队列有界</b>：{@link #expelled()} 返回的是<b>有界观测队列</b>
 *       （默认容量 {@value #DEFAULT_EXPELLED_QUEUE_CAPACITY}，可由构造器参数覆盖）。
 *       <b>队列满时静默丢弃</b>，不阻塞、不抛异常、不影响 TopK 主流程。
 *       <b>不可把它当作事件总线使用</b>——主流程没有消费者时必须依赖有界性保证内存有上界
 *       （缺陷 HK-EXPELLED-1：原无界队列会被持续挤出但永不回收，内存随挤出次数线性增长）。</li>
 *   <li><b>可见性</b>：对 bucket 的读写一律 {@code synchronized (bucket)}，不改成无锁。</li>
 *   <li><b>lookupTable 下标</b>：bucket.count 可能为负或 &gt;= LOOKUP_TABLE_SIZE，统一走
 *       {@link #lookup(double[], int)} 做上下界兜底，不会抛 ArrayIndexOutOfBounds。</li>
 *   <li><b>fading 重建堆</b>：先收集再 clear 后 addAll，比较器与原堆保持完全一致。</li>
 * </ol>
 *
 * <p>算法参数（k / width / depth / decay / minCount）全部由外部构造器传入，本类不硬编码。
 * 参考用法：{@code new HeavyKeeper(100, 100000, 5, 0.92, 10)}。</p>
 *
 * <p>Java 8 环境：不使用 record / var / switch 表达式。</p>
 *
 * @author algo-dev
 */
public class HeavyKeeper implements TopK {

    /** 衰减查表大小。 */
    private static final int LOOKUP_TABLE_SIZE = 256;

    /**
     * expelled 观测队列的默认容量。
     *
     * <p>该队列只用于观测被挤出 TopK 的 key，<b>必须有界</b>：主流程里没有任何消费者，
     * 若使用无界队列，长时间运行会随挤出次数线性增长且永不回收（缺陷 HK-EXPELLED-1，
     * 实测喂 20 万个不同 key 后滞留 173,394 条）。</p>
     */
    public static final int DEFAULT_EXPELLED_QUEUE_CAPACITY = 1000;

    /** TopK 的 K。 */
    private final int k;

    /** 每层的桶数量。 */
    private final int width;

    /** 层数（哈希个数）。 */
    private final int depth;

    /** 衰减查表：lookupTable[i] = decay ^ i。 */
    private final double[] lookupTable;

    /** 桶矩阵，buckets[层][列]。 */
    private final Bucket[][] buckets;

    /** 维护 TopK 的小顶堆。 */
    private final PriorityQueue<Node> minHeap;

    /**
     * 被挤出 TopK 的 key 的观测队列。
     *
     * <p><b>有界队列，满则丢弃。</b>它不是事件总线：{@code add()} 在队列满时
     * {@code offer} 返回 false 并静默丢弃，绝不阻塞、不抛异常、不影响 TopK 主流程。
     * 若需要可靠消费每一次挤出，请自行提供消费者，或改用更大的容量。</p>
     */
    private final BlockingQueue<Item> expelledQueue;

    /** 衰减概率用的随机源。 */
    private final Random random;

    /** 进入 TopK 的阈值。 */
    private final int minCount;

    /**
     * 累计访问量，fading 时同步衰减。
     *
     * <p>必须用原子类型与原子操作（缺陷 HK-TOTAL-1）：原先的 {@code total += increment}
     * 对 {@code volatile long} 是 read-modify-write，并发 add 下会丢失更新
     * （实测 8 线程 x 1000 次掉到 7708/7916，期望 8000）；
     * {@code total = total >> 1} 与并发 add 交错时同样会丢。
     * 现统一为 {@link AtomicLong}：累加用 {@code addAndGet}，衰减用 {@code updateAndGet}。</p>
     */
    private final AtomicLong total = new AtomicLong(0L);

    /**
     * 使用默认的 expelled 队列容量（{@value #DEFAULT_EXPELLED_QUEUE_CAPACITY}）构造。
     *
     * @param k        TopK 的 K
     * @param width    每层的桶数量
     * @param depth    层数（哈希个数）
     * @param decay    衰减系数，取值 (0, 1]
     * @param minCount 进入 TopK 的阈值
     */
    public HeavyKeeper(int k, int width, int depth, double decay, int minCount) {
        this(k, width, depth, decay, minCount, DEFAULT_EXPELLED_QUEUE_CAPACITY);
    }

    /**
     * 完整构造器，可覆盖 expelled 观测队列的容量。
     *
     * @param k             TopK 的 K
     * @param width         每层的桶数量
     * @param depth         层数（哈希个数）
     * @param decay         衰减系数，取值 (0, 1]
     * @param minCount      进入 TopK 的阈值
     * @param queueCapacity expelled 观测队列容量，必须为正数；满则丢弃
     */
    public HeavyKeeper(int k, int width, int depth, double decay, int minCount, int queueCapacity) {
        if (k <= 0) {
            throw new IllegalArgumentException("k must be positive: " + k);
        }
        if (width <= 0) {
            throw new IllegalArgumentException("width must be positive: " + width);
        }
        if (depth <= 0) {
            throw new IllegalArgumentException("depth must be positive: " + depth);
        }
        if (decay <= 0.0D || decay > 1.0D) {
            throw new IllegalArgumentException("decay must be in (0, 1]: " + decay);
        }
        if (queueCapacity <= 0) {
            throw new IllegalArgumentException("queueCapacity must be positive: " + queueCapacity);
        }
        this.k = k;
        this.width = width;
        this.depth = depth;
        this.minCount = minCount;

        this.lookupTable = new double[LOOKUP_TABLE_SIZE];
        for (int i = 0; i < LOOKUP_TABLE_SIZE; i++) {
            lookupTable[i] = Math.pow(decay, i);
        }

        this.buckets = new Bucket[depth][width];
        for (int i = 0; i < depth; i++) {
            for (int j = 0; j < width; j++) {
                buckets[i][j] = new Bucket();
            }
        }

        this.minHeap = new PriorityQueue<Node>(Math.max(1, k), HEAP_COMPARATOR);
        // 修正点 6（HK-EXPELLED-1）：有界队列，主流程无消费者时内存有上界。
        this.expelledQueue = new LinkedBlockingQueue<Item>(queueCapacity);
        this.random = new Random();
    }

    /** 堆比较器：按 count 升序，count 相同再按 key 升序，保证确定性排布。 */
    private static final Comparator<Node> HEAP_COMPARATOR = new Comparator<Node>() {
        @Override
        public int compare(Node o1, Node o2) {
            int byCount = Integer.compare(o1.count, o2.count);
            if (byCount != 0) {
                return byCount;
            }
            String left = o1.key == null ? "" : o1.key;
            String right = o2.key == null ? "" : o2.key;
            return left.compareTo(right);
        }
    };

    @Override
    public AddResult add(String key, int increment) {
        if (key == null || key.isEmpty()) {
            return AddResult.notHot(key);
        }
        if (increment <= 0) {
            throw new IllegalArgumentException("increment must be positive: " + increment);
        }

        byte[] keyBytes = key.getBytes();
        // fingerprint 只取同一个哈希值，保证同一 key 在 d 层之间指纹相同、可比较。
        long itemFingerprint = hash(keyBytes, 0);

        int maxCount = 0;
        for (int i = 0; i < depth; i++) {
            // 修正点 1：每层用不同种子算出不同的列，避免退化成单层。
            int bucketNumber = bucketIndex(keyBytes, i, width);
            Bucket bucket = buckets[i][bucketNumber];

            synchronized (bucket) {
                if (bucket.count == 0) {
                    bucket.fingerprint = itemFingerprint;
                    bucket.count = increment;
                    if (bucket.count > maxCount) {
                        maxCount = bucket.count;
                    }
                } else if (bucket.fingerprint == itemFingerprint) {
                    bucket.count += increment;
                    if (bucket.count > maxCount) {
                        maxCount = bucket.count;
                    }
                } else {
                    // 不同 key 冲突：按 decay^count 的概率把旧桶“衰减”掉。
                    for (int j = 0; j < increment; j++) {
                        // 修正点 4：lookup 做了上下界兜底，count 溢出/负值都不会越界。
                        double decay = lookup(lookupTable, bucket.count);
                        if (random.nextDouble() < decay) {
                            bucket.count--;
                            if (bucket.count <= 0) {
                                bucket.fingerprint = itemFingerprint;
                                bucket.count = increment - j;
                                if (bucket.count > maxCount) {
                                    maxCount = bucket.count;
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }

        total.addAndGet(increment);

        if (maxCount < minCount) {
            return AddResult.notHot(key);
        }

        synchronized (minHeap) {
            Node existing = findNode(minHeap, key);
            if (existing != null) {
                minHeap.remove(existing);
                minHeap.add(new Node(key, Math.max(maxCount, existing.count)));
                return new AddResult(null, true, key);
            }

            if (minHeap.size() < k) {
                minHeap.add(new Node(key, maxCount));
                return new AddResult(null, true, key);
            }

            Node peek = minHeap.peek();
            if (peek == null || maxCount < peek.count) {
                return AddResult.notHot(key);
            }

            // 修正点 2：挤出的 Item 用的是被挤出 key 自身的 count，而不是当前 key 的 maxCount。
            Node expelledNode = minHeap.poll();
            String expelledKey = expelledNode == null ? null : expelledNode.key;
            if (expelledNode != null) {
                // 修正点 6（HK-EXPELLED-1）：用非阻塞的 offer；有界队列满时返回 false 并静默丢弃。
                // 绝不能改成 put()，那会在无消费者的生产环境下把 add() 卡死。
                expelledQueue.offer(new Item(expelledNode.key, expelledNode.count));
            }
            minHeap.add(new Node(key, maxCount));
            return new AddResult(expelledKey, true, key);
        }
    }

    @Override
    public List<Item> list() {
        synchronized (minHeap) {
            List<Item> result = new ArrayList<Item>(minHeap.size());
            for (Node node : minHeap) {
                result.add(new Item(node.key, node.count));
            }
            result.sort(new Comparator<Item>() {
                @Override
                public int compare(Item a, Item b) {
                    int byCount = Integer.compare(b.count(), a.count());
                    if (byCount != 0) {
                        return byCount;
                    }
                    String left = a.key() == null ? "" : a.key();
                    String right = b.key() == null ? "" : b.key();
                    return left.compareTo(right);
                }
            });
            return result;
        }
    }

    @Override
    public BlockingQueue<Item> expelled() {
        return expelledQueue;
    }

    @Override
    public void fading() {
        for (Bucket[] row : buckets) {
            for (Bucket bucket : row) {
                synchronized (bucket) {
                    bucket.count = bucket.count >> 1;
                }
            }
        }

        synchronized (minHeap) {
            // 修正点 5：先收集快照，再 clear + addAll，且新堆沿用与原堆完全一致的比较器。
            List<Node> snapshot = new ArrayList<Node>(minHeap.size());
            for (Node node : minHeap) {
                snapshot.add(node);
            }
            minHeap.clear();
            for (Node node : snapshot) {
                minHeap.add(new Node(node.key, node.count >> 1));
            }
        }

        // total 的衰减必须是原子的：set(get() >> 1) 仍是读-再写，与并发 add 交错会丢。
        total.updateAndGet(new LongUnaryOperator() {
            @Override
            public long applyAsLong(long value) {
                return value >> 1;
            }
        });
    }

    @Override
    public long total() {
        return total.get();
    }

    /**
     * 在堆中按 key 查找节点，找不到返回 null。调用方需持有 minHeap 的锁。
     */
    private static Node findNode(PriorityQueue<Node> heap, String key) {
        // 调用方持有 minHeap 的锁，迭代期间堆不会被并发修改（不会抛 ConcurrentModificationException）。
        Iterator<Node> iterator = heap.iterator();
        while (iterator.hasNext()) {
            Node node = iterator.next();
            if (Objects.equals(node.key, key)) {
                return node;
            }
        }
        return null;
    }

    /**
     * 计算第 depthIndex 层的桶下标，保证非负且 &lt; width。
     */
    private static int bucketIndex(byte[] keyBytes, int depthIndex, int width) {
        int h = hash(keyBytes, depthIndex);
        // 处理 Integer.MIN_VALUE：Math.abs 对它无效，先用 & 0x7FFFFFFF 去掉符号位。
        return (h & 0x7FFFFFFF) % width;
    }

    /**
     * 取衰减概率，对下标做上下界兜底，杜绝 ArrayIndexOutOfBounds。
     */
    private static double lookup(double[] table, int count) {
        if (table == null || table.length == 0) {
            return 0.0D;
        }
        int index = count;
        if (index < 0) {
            index = 0;
        } else if (index >= table.length) {
            index = table.length - 1;
        }
        return table[index];
    }

    /**
     * MurmurHash3 (x86, 32bit)，带种子，返回 int。
     *
     * <p>参考实现用的是 hutool 的 {@code HashUtil.murmur32(data)}，本模块没有 hutool 依赖，
     * 因此在这里内联一份等价实现，并扩展出 seed 参数以支持按层不同哈希。</p>
     */
    static int hash(byte[] data, int seed) {
        if (data == null) {
            data = new byte[0];
        }
        int length = data.length;
        int h1 = seed;
        final int c1 = 0xcc9e2d51;
        final int c2 = 0x1b873593;

        int roundedEnd = length & 0xfffffffc; // length 向下取整到 4 的倍数
        for (int i = 0; i < roundedEnd; i += 4) {
            int k1 = (data[i] & 0xff)
                    | ((data[i + 1] & 0xff) << 8)
                    | ((data[i + 2] & 0xff) << 16)
                    | ((data[i + 3] & 0xff) << 24);
            k1 *= c1;
            k1 = Integer.rotateLeft(k1, 15);
            k1 *= c2;
            h1 ^= k1;
            h1 = Integer.rotateLeft(h1, 13);
            h1 = h1 * 5 + 0xe6546b64;
        }

        // 尾部不足 4 字节的部分（用 if 而非 switch，避免与 Java 11+ 的 switch 表达式混淆）
        int k1 = 0;
        int tail = length & 0x03;
        if (tail >= 3) {
            k1 = (data[roundedEnd + 2] & 0xff) << 16;
        }
        if (tail >= 2) {
            k1 |= (data[roundedEnd + 1] & 0xff) << 8;
        }
        if (tail >= 1) {
            k1 |= data[roundedEnd] & 0xff;
            k1 *= c1;
            k1 = Integer.rotateLeft(k1, 15);
            k1 *= c2;
            h1 ^= k1;
        }

        h1 ^= length;
        h1 ^= h1 >>> 16;
        h1 *= 0x85ebca6b;
        h1 ^= h1 >>> 13;
        h1 *= 0xc2b2ae35;
        h1 ^= h1 >>> 16;
        return h1;
    }

    /** 桶：指纹 + 计数，读写均在 synchronized(bucket) 内。 */
    private static final class Bucket {
        long fingerprint;
        int count;
    }

    /** 堆节点：不可变。 */
    private static final class Node {
        final String key;
        final int count;

        Node(String key, int count) {
            this.key = key;
            this.count = count;
        }
    }
}
