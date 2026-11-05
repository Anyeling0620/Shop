# 商品详情多级缓存与 HeavyKeeper 热点检测

> 本文对应分支 `feature/goods-hotkey-multilevel-cache`，覆盖 `goods-service` 中 `/goods/get/{id}` 从「直查 MySQL」改造为
> **Caffeine（L1）+ Redis（L2）+ MySQL（L3）** 三级缓存的全过程，以及从参考实现 `yu-like` 迁移
> HeavyKeeper 单机热点 key 检测时修正的两处算法缺陷。
> 文中每个类名、参数、路径均可在本仓库对应文件里查到，参数取值以 `goods-service/src/main/resources/application.yml` 为准。

---

## 1. 背景：为什么直查 MySQL 会被打穿

改造前 `GoodsController.get()` 一路直落 `GoodsService.getGoodsById()`，再到 `goodsDao.selectByPrimaryKey(id)`。
业务本身没错，问题出在**流量形态**上：

- 商品详情是典型的「**少数 key 承担绝大多数请求**」分布。秒杀/大促会场上，一个爆款商品的详情页 QPS
  可以比其他商品高出 3~4 个数量级。
- 每次请求都走一次 MySQL 主键查询，热点商品的那一行在**同一时刻被成百上千个连接反复读**，
  行缓存/页缓存被打满，数据库连接池先于 CPU 饱和——表现为 P99 抖动、连接等待、甚至雪崩式排队。
- 加机器没有意义：请求是**同构**的，N 台机器只是把同一个 `SELECT` 放大成 N 份。

所以要做两级分摊：**Redis 扛住全集群的重复读**，**Caffeine 扛住单机内的极致重复读**
（本地内存命中是纳秒级，连网络都不走）。但本地缓存不能无脑加——见下一节的准入策略。

改造后的读路径实现在 `GoodsService.getGoodsById(long)`，缓存统一入口是 `CacheManager`。

---

## 2. 架构：三级缓存与请求流转

### 2.1 分层职责

| 层 | 实现 | 位置 | 命中耗时 | 作用域 | 淘汰策略 |
|---|---|---|---|---|---|
| **L1** | Caffeine `Cache<String,Object>` | 进程内堆内存 | 纳秒级 | 单实例 | `maximumSize` + `expireAfterWrite` |
| **L2** | Redis `StringRedisTemplate` | 独立进程 | 亚毫秒级 | 全集群共享 | TTL（`redis-expire-seconds`） |
| **L3** | MySQL（`goods.goods`） | 独立进程 | 毫秒级 | 全集群共享 | 无（权威数据源） |

### 2.2 读路径流程图

```
                        GET /goods/get/{id}
                                │
                                ▼
                ┌───────────────────────────────┐
                │ GoodsService.getGoodsById(id) │
                │ key = goods:detail:{id}       │
                └───────────────┬───────────────┘
                                │  readCache(key)
                                ▼
        ╔═══════════════════════════════════════════════════╗
        ║  L1  Caffeine.getIfPresent(key)                   ║
        ║  CacheManager.get(String) 第 1 步                 ║
        ╚═══════════════┬═══════════════════════════════════╝
            命中 │                          │ 未命中
                 ▼                          ▼
     ┌────────────────────┐   ╔═══════════════════════════════════════╗
     │ hotKeyDetector     │   ║  L2  redisTemplate.opsForValue().get  ║
     │   .add(key, 1)     │   ║  CacheManager.get(String) 第 2 步     ║
     │ 返回 JSON 直出     │   ╚═══════════════┬═══════════════════════╝
     └────────────────────┘       命中 │                │ 未命中
                                       ▼                ▼
                        ┌──────────────────────┐   ╔══════════════════════╗
                        │ add(key,1) 判热点    │   ║  L3  MySQL           ║
                        │ hotKey() == true ?   │   ║  selectByPrimaryKey  ║
                        │   回填 L1            │   ╚══════┬═══════════════╝
                        │ 返回 JSON            │          │
                        └──────────────────────┘   查不到 │      查到
                                                         ▼          ▼
                                          ┌──────────────────┐  ┌───────────────────────┐
                                          │ 写负缓存         │  │ writeCache(key, goods)│
                                          │ "__NULL__"       │  │ → CacheManager.put()  │
                                          │ 直接返回 null    │  │ 只写 L2，不回填 L1    │
                                          └──────────────────┘  └───────────────────────┘
```

一句话概括：**命中 L1 直接返回；L2 命中时按热点判定决定是否升到 L1；两级都未命中才回源 L3，
回源结果只写 L2，由下一次读请求的 HeavyKeeper 判定是否值得进 L1。**

### 2.3 关键设计点

**（1）L1 准入唯一交给 HeavyKeeper，回源不预热 L1。**
`CacheManager.put(String, Object)` 只写 Redis（见该方法的 Javadoc 与实现注释），
L1 的写入**只发生在** `CacheManager.get(String)` 里 `addResult.hotKey() == true` 的时候。
理由写在 `CacheManager#put` 的 Javadoc 里：未命中既可能是真热点冷启动，也可能是长尾 key、
爬虫扫描流量；若回源即写 L1，这些一次性 key 会挤掉 Caffeine 里的真热点，
本地缓存退化成「谁最后被访问谁留下」。代价是一个 key 需要被访问约 `min-count`（默认 10）次才进 L1，
这期间的读落在 Redis 上，亚毫秒级足以承接。

**（2）缓存用 StringRedisTemplate + Jackson，而不是 JDK 序列化。**
见 `CacheManager` 类头 Javadoc：JDK 序列化要求对象实现 `Serializable`、与类全限定名和
`serialVersionUID` 强绑定（商品模型加个字段就可能反序列化失败），产出是二进制、`redis-cli` 里看不见；
JSON 跨语言、可读、字段增减兼容，还能避开默认 `JdkSerializationRedisSerializer` 在 key 上插二进制前缀的问题。

**（3）负缓存防穿透。**
`GoodsService.NULL_MARKER = "__NULL__"`。id 是雪花号，查不到基本可断定是脏 id / 爬虫探测；
若不缓存「查不到」这个结论，同一个不存在的 id 会**每次都打到 MySQL**。雪花 id 不复用，
所以这个标记不会在「后来真的插入了同 id 商品」时变成脏数据，过期时间与正常商品一致。

**（4）缓存故障一律降级为「未命中」。**
`CacheManager` 字段用 `@Autowired(required = false)` 注入，`readCache`/`writeCache` 内部 try/catch，
Redis 挂了也只是回源 MySQL，不会让商品详情页 500。设计上缓存是「加速器」不是「依赖」。

---

## 3. 热点检测：HeavyKeeper 原理与参数

实现类：`com.zhuawa.shop.goods.cache.heavykeeper.HeavyKeeper`（接口 `TopK`，元素类型 `Item`）。
装配在 `CacheConfig#hotKeyDetector`，以**单例 Bean** 的形式在进程内共享。

### 3.1 为什么不用「精确计数」

给每个 key 维护一个计数器就能精确统计 TopK，但 key 空间是**全量商品 id**，
精确方案的内存与 key 数量成正比，长尾商品会把内存吃光。HeavyKeeper 属于
**sketch 类算法**：用固定大小的二维桶矩阵，把任意多的 key 压进 `depth × width` 个格子，
用指纹（fingerprint）区分「同一个 key」和「不同 key 撞到同一格」。

### 3.2 三条主线：二维桶 + 概率衰减 + 最小堆

**（1）二维桶矩阵 `buckets[depth][width]`。**
每个桶是 `{ fingerprint, count }`。key 进来时，对第 `i` 层用**带种子 `i` 的 MurmurHash3** 算出列号：

```java
// HeavyKeeper.bucketIndex(byte[], int, int)
int h = hash(keyBytes, depthIndex);
return (h & 0x7FFFFFFF) % width;   // & 0x7FFFFFFF 是为了处理 Integer.MIN_VALUE
```

每层落到**不同的列**，这是 HeavyKeeper 相对 Count-Min Sketch 的关键改动（见 3.4 的缺陷一）。

**（2）概率衰减（decay）：用「指数衰减」把旧 key 的计数挤出去。**
若某桶已被别的 key 占据（指纹不同），HeavyKeeper **不直接加法**，而是以
`decay^count` 的概率把旧计数减一，减到 0 就「换人」：

```java
// HeavyKeeper.add() 的冲突分支（简化）
double decay = lookup(lookupTable, bucket.count);   // lookupTable[i] = decay^i
if (random.nextDouble() < decay) {
    bucket.count--;
    if (bucket.count <= 0) {
        bucket.fingerprint = itemFingerprint;       // 旧 key 被挤走，新 key 占位
        bucket.count = increment - j;
        break;
    }
}
```

`lookupTable[i] = Math.pow(decay, i)`（`LOOKUP_TABLE_SIZE = 256`），所以**旧计数越大越难被挤掉**，
而刚进来的低频 key 很容易被后续流量冲走。这就是「Heavy Keeper」（重锤）名字的来源：
真正重的 key 扛得住锤，轻的 key 被锤走。`lookup()` 做了 `[0, 255]` 的上下界兜底，
计数溢出/为负都不会越界。

**（3）最小堆维护 TopK。**
`minHeap` 是容量为 `k` 的小顶堆（比较器 `HEAP_COMPARATOR`：先按 `count` 升序，相同再按 `key` 升序保证确定性）。
新 key 的 `maxCount`（各层计数的最大值）超过堆顶才挤进去，被挤出的 key 进 `expelledQueue` 观测队列。

**（4）fading：让「曾经热、现在冷」的 key 掉出去。**
`CacheManager#fading` 上带 `@Scheduled(fixedRateString = "${zhuawa.cache.fading-interval-ms:20000}")`，
每分钟 3 次把**所有桶计数、堆内计数、`total` 统一右移一位**（减半）。因为衰减是周期性整体缩放的，
所以某个 key 今天的热度不会永久霸占 TopK 位置。

> 注意：`total` 用的是 `AtomicLong`，累加 `addAndGet`、衰减 `updateAndGet`。
> 若写成 `total += increment` 或 `total = total >> 1`，在并发下会丢更新（这是迁移时修掉的缺陷 HK-TOTAL-1）。

**（5）并发安全：桶上有锁，不是无锁。**
对 `bucket` 的读写一律 `synchronized (bucket)`，堆操作一律 `synchronized (minHeap)`，
两类锁**不嵌套**（持有 `bucket` 锁时不会去拿 `minHeap` 锁），不存在锁序环。

### 3.3 参数含义与调参建议

参数定义在 `CacheConfig.CacheProperties`（前缀 `zhuawa.cache`），当前值见 `goods-service/src/main/resources/application.yml`：

| 配置项 | 代码字段 | 当前值 | 含义 | 调大 / 调小的影响 |
|---|---|---|---|---|
| `zhuawa.cache.topk` | `topk` → `k` | `100` | 只保留最热的 k 个 key，即 L1 的**准入名额** | 调大：更多商品能进 L1，L1 命中率↑、内存↑；调小：L1 更"精"，命中率↓ |
| `zhuawa.cache.width` | `width` | `100000` | 每层的桶数，决定**冲突率** | 调大：冲突少、计数准，内存线性增长（`depth×width` 个桶）；调小：省内存但高频 key 会被低频 key 的噪声压低 |
| `zhuawa.cache.depth` | `depth` | `5` | 层数（独立哈希个数），决定**抗噪能力** | 调大：单 key 被误判的概率指数下降，内存与单次 add 的 CPU 线性增长；代价是 `add()` 里多几轮哈希+锁 |
| `zhuawa.cache.decay` | `decay` | `0.92` | 衰减系数，取值 (0,1]，冲突时 `decay^count` 是把旧计数减一的概率 | 调大（趋近 1）：衰减慢，老 key 更难被挤掉，适合**稳定热点**；调小：衰减快，热点切换灵敏，适合**脉冲式流量** |
| `zhuawa.cache.min-count` | `minCount` | `10` | 计数低于该值**不参与 TopK 竞争**，也不会被判为热 key | 调大：把「刚进来几次」的冷 key 挡在 L1 外，冷启动更慢；调小：长尾 key 更容易污染 L1 |
| `zhuawa.cache.fading-interval-ms` | `fadingIntervalMs` | `20000` | 衰减周期（毫秒） | 调小：TopK 换血快，能快速反映突发热点；调大：热点判定更稳定，但「过气热点」滞留更久 |
| `zhuawa.cache.local-maximum-size` | `localMaximumSize` | `1000` | Caffeine 最大条目数 | 见下方容量估算 |
| `zhuawa.cache.local-expire-seconds` | `localExpireSeconds` | `300` | L1 写入后过期秒数 | 见第 7 节：这是跨实例脏数据的兜底窗口 |
| `zhuawa.cache.redis-expire-seconds` | `redisExpireSeconds` | `1800` | L2 TTL | 调小：数据新鲜度↑、回源压力↑；调大：Redis 内存↑、脏数据窗口↑ |
| `zhuawa.cache.delayed-evict-ms` | `delayedEvictMs` | 默认 `500`（**yml 中未配置**，走 `@Value` 默认值） | 延迟双删的延迟时长 | 需要覆盖「一次读请求从 SELECT 到回写缓存」的最长耗时；调小可能漏掉迟到的回写，调大让脏窗口变长 |

**怎么按 QPS 定 k 与本地缓存容量？**

`k` 和 `local-maximum-size` 是**两件事**，不要混为一个：

1. **`k`（准入名额）按「需要多少商品被本地缓存」定。**
   经验上，商品详情流量的头部集中度很高——先看监控里 TopN 商品的请求占比。
   若 Top 100 已覆盖 90%+ 的详情请求，`k = 100` 就够；若是大促会场式分布（Top 1000 才够覆盖），
   应把 `k` 提到 500~2000。**但 `k` 不应超过 `local-maximum-size`**，
   否则一部分被判热的 key 进 L1 后又立刻被 Caffeine 按 size 淘汰掉，白算一次热点判定。

2. **`local-maximum-size` 按「单机可用的堆内存」定。**
   估算公式：`条目数 × 单条 JSON 大小 × 安全系数`。
   商品详情的 JSON（`Goods` 含 name/price/stock/image/brandName/categoryName/specsJson 等字段）
   按 2~4 KB 估，`1000` 条大约 2~4 MB——相对一个 JVM 完全可以忽略。
   **这个参数的真实目的不是省内存，而是给 L1 一个硬上界**，防止热点判定失效时无限增长。

3. **QPS 与它们的关系。**
   - 若单机 QPS 很高（万级），L1 命中率每提升 1%（即减少 1% 打 Redis 的请求）都很值钱，此时应优先
     把 `k × local-maximum-size` 铺满，让 Top 商品尽量都留在本地。
   - 若单机 QPS 不高（千级以下），Redis 完全扛得住，没必要把 `k` 调大——L1 收益有限，
     反而放大「多实例不一致」的影响面。
   - `width` 与 `depth` 的选取看**全量商品数**：key 空间越大，同样的 `width` 冲突越多，
     应同步调大 `width`，或提高 `depth` 用「多层取最大」来抗噪。

> ⚠️ 改动注意：`HeavyKeeper` 在构造时就按 `width/depth` 分配好二维数组，
> **这三个参数（k/width/depth）改完必须重启生效**；`decay`/`minCount` 同样是构造期传入。

### 3.4 迁移自 yu-like 时修正的两处缺陷

参考实现是 `yu-like` 的 `com.yuyuan.thumb.manager.cache.HeavyKeeper`。
迁移不是复制粘贴，下面两处是**算法层面的真实缺陷**，修正记录也写在 `HeavyKeeper` 类头 Javadoc 的
「修正点 1」「修正点 2」里，并由测试 `differentLayersMapToDifferentBuckets` /
`expelledItemRecordsExpelledKeyOwnCount` 固化。

#### 缺陷一：d 层使用同一哈希 → 所有层退化成同一列

**原实现**在 `for (int i = 0; i < depth; i++)` 循环里，每一层都用（`HeavyKeeper` 类头「修正点 1」记录了这一行为，下面按该描述还原其等价写法）：

```java
Math.abs(hash(keyBytes)) % width
```

——**`hash` 不依赖层号 `i`**。于是同一个 key 在 depth 层算出**完全相同的列下标**，
`buckets[0][c]`、`buckets[1][c]` … `buckets[d-1][c]` 永远是同一列的垂直堆叠。

后果非常严重：**多层结构退化成 1 层**。HeavyKeeper 抗噪的核心是「一个 key 落在 d 个不同位置，
取 d 个计数里的最大值」，这样即使某一层被冲突严重污染，其他层仍是干净的。
所有层同列后，一次冲突会同时污染这个 key 的**全部** d 个副本，
`maxCount` 直接等于那个被污染的值——等于完全没有冗余。
表现出来就是：**高频 key 的计数被低频 key 的噪声压住，进不了 TopK，
而本该被淘汰的低频 key 反而留在 L1 里**（TopK 变成「谁撞得好谁上」）。

**修正**：`bucketIndex(keyBytes, depthIndex, width)` 用 `hash(keyBytes, depthIndex)`
——同一份数据、**不同种子**，得到不同列。而 fingerprint 统一用 `hash(keyBytes, 0)` 这一个值
（见 `add()` 中 `long itemFingerprint = hash(keyBytes, 0)`），保证「同一个 key 在各层的指纹一致、可比较」，
否则会把同一个 key 误判成不同 key。

> 为什么指纹不能也按层变化？指纹的作用是回答「这格的计数属于哪个 key」。
> 若每层指纹不同，同一个 key 在 A 层和 B 层的指纹互不相等，
> 算法就永远无法判断「这两格是同一个 key 的副本」，第 3 节的 `maxCount` 取最大值也就失去意义。

#### 缺陷二：expelled 队列记录的是「当前 key 的 count」而不是「被挤出 key 的 count」

**原实现**在挤出分支里传给 `Item` 的是**当前 key** 的 `maxCount`（`HeavyKeeper` 类头「修正点 2」记录了这一行为，下面按该描述还原其等价写法）：

```java
expelledQueue.add(new Item(key, maxCount));    // ❌ key 是被挤出的那个，count 却是新 key 的
```

但 `expelledQueue` 的语义是「**哪些 key 被挤出 TopK 了、它们当时的计数是多少**」，
用于观测「谁掉队了」。记录错的 count 会让这个队列**完全不可用于任何分析**：
被挤出者的真实计数被新来者的计数覆盖，你看到的数字既不描述旧 key、也不是新 key 的历史。

**修正**（`HeavyKeeper.add()` 修正点 2）：

```java
Node expelledNode = minHeap.poll();
String expelledKey = expelledNode == null ? null : expelledNode.key;
if (expelledNode != null) {
    expelledQueue.offer(new Item(expelledNode.key, expelledNode.count));  // ✅ 被挤出者自己的 count
}
```

**为什么「高频 key 被低频 key 挤掉」？** 两处缺陷叠加时最糟：
缺陷一让每个 key 只有 1 份计数（无冗余、易被污染），
缺陷二让挤出记录失真、无法从观测数据里发现异常。
于是热点 key 的 `maxCount` 被噪声压低 → 达不到 `minCount` 或比不过堆顶 → 进不了 TopK；
同时它也可能莫名其妙被挤出——整个过程在 `expelledQueue` 里还看不出问题。
修正后：高频 key 在 d 个独立位置各有一份计数，取最大值即有 d 倍冗余；
冲突只会污染其中一列，不会全灭。

#### 迁移时一并处理的其他几处（记录在类头 Javadoc，非算法缺陷）

| 编号 | 问题 | 处理 |
|---|---|---|
| HK-TOTAL-1 | `total += increment` / `total = total >> 1` 对 `volatile long` 是读-改-写，并发下丢更新 | 改 `AtomicLong`，`addAndGet` / `updateAndGet` |
| HK-EXPELLED-1 | `expelledQueue` 无界，主流程无消费者，内存随挤出次数线性增长（实测喂 20 万不同 key 滞留 173,394 条） | 改 `LinkedBlockingQueue(queueCapacity)`，默认 `DEFAULT_EXPELLED_QUEUE_CAPACITY = 1000`，`offer` 非阻塞、**满则静默丢弃** |
| — | `lookupTable` 下标可能越界（`count` 为负或 ≥ 256） | 统一走 `lookup()` 做上下界兜底 |
| — | 依赖 hutool 的 `HashUtil.murmur32`，而本模块无该依赖 | 内联一份等价的 MurmurHash3（x86 32bit），并扩展 `seed` 参数以支持按层不同哈希 |
| — | `fading()` 重建堆时比较器可能不一致 | 先收集快照，再 `clear()` + `addAll()`，比较器与原堆完全一致 |

> `expelled()` 返回的是**有界观测队列**，**不能当事件总线用**。主流程没有任何消费者，
> 内存有上界完全依赖队列的有界性。

---

## 4. 读路径伪代码与本地缓存回填时机

### 4.1 业务层（`GoodsService.getGoodsById`）

```java
public Goods getGoodsById(long id) {
    String key = CacheKeys.goodsDetailHashKey(id);      // "goods:detail:{id}"

    // 1+2: L1 → L2（热点判定与 L1 回填都在 CacheManager.get 内部完成）
    String cachedJson = readCache(key);                 // 缓存异常 → 降级返回 null
    if (cachedJson != null) {
        if (NULL_MARKER.equals(cachedJson)) return null;      // 负缓存命中，不打 MySQL
        Goods cached = deserialize(key, cachedJson);
        if (cached != null) return cached;                    // 反序列化失败则继续回源
    }

    // 3: L3 MySQL 回源
    Goods goods = goodsDao.selectByPrimaryKey(id);
    if (goods == null) {
        writeCache(key, NULL_MARKER);                   // 防穿透
        return null;                                    // 语义与改造前一致
    }
    writeCache(key, goods);                             // 只写 L2，不回填 L1
    return goods;
}
```

两个容易写错的地方：

- **`readCache` 每次请求只调用一次。** 不能先 `get(key, Goods.class)` 再取原始 JSON，
  那会让 HeavyKeeper 的计数被重复累加，把访问量放大成两倍（见 `GoodsService` 中 `objectMapper` 字段的 Javadoc）。
- **必须区分「未命中」与「命中负缓存/反序列化失败」。** typed get 会把两者都折叠成 `null`，
  负缓存就失效了，所以这里先取原始 JSON 做判定，只对真实数据做反序列化。

### 4.2 缓存层（`CacheManager.get(String)`）——回填时机在这里

```java
public String get(String key) {
    // ① L1
    Object local = localCache.getIfPresent(key);
    if (local != null) {
        hotKeyDetector.add(key, 1);            // 命中也要计数，否则热点判定会「只看冷启动」
        return local instanceof String ? (String) local : String.valueOf(local);
    }

    // ② L2
    String redisValue = redisTemplate.opsForValue().get(key);
    if (redisValue == null) return null;       // 两级都未命中，交给业务层回源 L3

    // ③ 只有被判为热 key 才回填 L1
    TopK.AddResult addResult = hotKeyDetector.add(key, 1);
    if (addResult != null && addResult.hotKey()) {
        localCache.put(key, redisValue);
    }
    return redisValue;
}
```

**回填时机的三条规则**（面试常问）：

1. **只有 `hotKey() == true` 才回填 L1。** 这是 L1 准入的唯一入口；
   `put()` 是业务回源后的「填充 L2」，两者职责不重叠。
2. **L1 未命中、L2 命中时才判定。** L1 命中时只 `add` 计数不回填（本来就在 L1 里）。
3. **L3 回源结果不回填 L1。** 冷启动期间读落在 Redis，这是刻意的取舍（见 2.3（1））。

> 一个 key 需要累计约 `minCount`（默认 10）次访问才可能被判热，所以**刚重启的实例在前几十个请求内
> L1 命中率是 0**，这是正常现象，不是缓存没生效。

---

## 5. 写路径：失效策略

### 5.1 `decrStock`：成功后主动失效 L1 + L2，且是**延迟双删**

```java
public void decrStock(long id, int count) {
    if (goodsDao.decrStock(count, id) <= 0) {
        // 扣减失败 = 数据没变 → 不删缓存（否则白白放一次请求去回源）
        throw new GlobalException(CodeMsg.GOODS_STOCK_LIMIT);
    }
    evictGoodsCache(id);        // 第一次删除：立即失效 L1 + L2
    scheduleDelayedEvict(id);   // 第二次删除：延迟 delayedEvictMs（默认 500ms）
}
```

`GoodsDao.decrStock` 的 SQL 是带条件的行级更新，**防超卖由数据库保证**，不是缓存：

```java
@Update("update goods set stock=stock-#{num} where id=#{goodsId} and stock>=#{num}")
```

**为什么要删两次？** 因为「先改库、再删缓存」与「先读库、再回写缓存」会交错：

```
  T1 读线程: SELECT 拿到旧值 stock=100
  T2 写线程: UPDATE stock=99 提交
  T3 写线程: evict（此时缓存里其实还没有旧值，删了个空）
  T4 读线程: 把 stock=100 回写 Redis（TTL 1800s）   ← 脏值最长存活 30 分钟
```

延迟一段时间再删一次，就能把 T4 这个「迟到的回写」一并清掉。500ms 是覆盖
「一次读请求从 SELECT 到回写缓存」的经验值，可用 `zhuawa.cache.delayed-evict-ms` 覆盖
（当前 yml 未配置，走 `@Value("${zhuawa.cache.delayed-evict-ms:500}")` 的默认值）。
**脏值窗口从「最长 TTL（30 分钟）」被压缩到「毫秒级」。**

`CacheManager.evict(String)` 的语义是**同时** `localCache.invalidate(key)` + `redisTemplate.delete(key)`。

**调度器实现要点**（见 `GoodsService` 中 `delayedEvictExecutor` 字段的 Javadoc、`scheduleDelayedEvict` 与 `getDelayedEvictExecutor`）：

- 自己建 `ScheduledThreadPoolExecutor`，**不用 Spring 的 `TaskScheduler`**——`@EnableScheduling`
  默认只有一个线程，HeavyKeeper 的 `fading` 也在用它，延迟删除挤进去会拖慢热点衰减；
  独立线程池还能隔离故障。
- 核心线程 1、线程 **daemon**、`allowCoreThreadTimeOut(true)`，`@PreDestroy shutdownDelayedEvict()` 关闭。
- **背压靠自己的计数器，不靠线程池。** `ScheduledThreadPoolExecutor` 内部固定使用**无界的
  `DelayedWorkQueue`**，`offer` 恒成功、拒绝策略永远不触发，所以"有界队列"这条路走不通。
  实现里用 `pendingDelayedEvicts`（`AtomicInteger`）计数：超过 `DELAYED_EVICT_QUEUE_CAPACITY = 10000`
  就放弃本次第二次删除（第一次删除已生效），任务体 `finally` 与提交失败两条路径都归还配额，确保计数不会只增不减。

> 线上若需要临时关掉第二次删除，把 `zhuawa.cache.delayed-evict-ms` 配成 `<= 0` 即可，等价于旧行为。

### 5.2 `genMockGoods`：新增**不失效**，这是刻意的

`GoodsService.genMockGoodsByName` 批量插入模拟商品，代码末尾的注释写明了原因：

```java
// 这里不做任何缓存失效：id 由雪花算法现场生成，此前不可能被读取过，
// 缓存里不存在对应条目；盲目 evict/清空反而会误伤其他热点商品。
```

拆开看是三个理由：

1. **不可能有脏数据。** 缓存 key 是 `goods:detail:{id}`，`id` 由 `idWorker.nextId()`（雪花算法）现场生成，
   全局唯一且从未对外暴露过。既然从没被读过，缓存里就不可能有它的条目，也就无所谓失效。
2. **`evict` 找不到目标，纯属浪费。** 对每个新 id 调一次 `evict` 会走一遍 `Caffeine.invalidate`
   加一次 `redisTemplate.delete`，全是空操作，还多打一次 Redis 往返。
3. **清空整个缓存是更坏的选择。** 若为了「保险」把 L1 全清或按前缀删 `goods:detail:*`，
   会把当时正在服务的**其他真热点商品**一起赶出 L1，制造一次人为的缓存雪崩。

同理，`getGoodsById` 里查不到商品时写入的负缓存 `NULL_MARKER` 也不会被 `genMockGoods` 影响——
雪花 id 不复用，不会出现「先负缓存了某个 id、后来这个 id 真的有商品了」的情况。

---

## 6. 与参考实现 yu-like 的差异汇总

| 维度 | yu-like 参考实现 | 本项目 | 影响 |
|---|---|---|---|
| **分层哈希** | `Math.abs(hash(keyBytes)) % width`，d 层同列 | `hash(keyBytes, depthIndex)` 按层不同种子 | 修复「多层退化成单层」；高频 key 不再被噪声压低 |
| **fingerprint** | 与列下标同源（同一个无种子 hash） | 固定 `hash(keyBytes, 0)`，与按层的列下标解耦 | 同一 key 在各层指纹一致，`maxCount` 取最大才有意义 |
| **expelled 计数** | `new Item(key, maxCount)`（新 key 的 count） | `new Item(expelledNode.key, expelledNode.count)` | 挤出观测数据恢复可信 |
| **expelled 队列** | 观测队列无容量上界 | `LinkedBlockingQueue(1000)`，满则丢弃 | 修复内存随挤出次数线性增长（HK-EXPELLED-1） |
| **total 并发** | `volatile long` 上做 `+=` / `>>=` | `AtomicLong` + `addAndGet` / `updateAndGet` | 修复并发丢更新（HK-TOTAL-1） |
| **哈希依赖** | hutool `HashUtil.murmur32` | 内联 MurmurHash3 并扩展 `seed` | 去掉对 hutool 的依赖，同时支持按层不同哈希 |
| **lookupTable 下标** | 直接下标访问 | `lookup()` 上下界兜底 | 不再有 `ArrayIndexOutOfBounds` 风险 |
| **本地缓存库** | 参考实现栈内的本地缓存 | Caffeine **2.9.3** | 见下方版本说明 |

> **Caffeine 版本必须是 2.x。** 本项目 `maven.compiler.source/target` 均为 **8**。
> Caffeine 2.x 的 class 字节码 `major=52`（Java 8）；Caffeine 3.x 起要求 Java 11+（3.1.8 为 `major=55`），
> 在 JRE 8 上会直接 `UnsupportedClassVersionError`。因此 `goods-service/pom.xml` 固定 `2.9.3`，
> 而本次用到的 `newBuilder() / maximumSize() / expireAfterWrite() / build()` 在 2.x 与 3.x 上 API 等价。

---

## 7. 局限、一致性策略与后续演进

### 7.1 一致性策略：写操作主动失效 + TTL 兜底

| 手段 | 覆盖场景 | 生效速度 |
|---|---|---|
| `decrStock` 后**立即删除** L1 + L2 | 本实例发起的写操作 | 立即 |
| **延迟双删**（默认 500ms 后再删一次） | 并发读线程「迟到的回写」 | 毫秒级 |
| **TTL**：L1 `local-expire-seconds=300`、L2 `redis-expire-seconds=1800` | **所有**漏网的失效（包括跨实例、其它服务直改数据库、canal 未覆盖的链路） | 最坏一个 TTL |
| 负缓存 `NULL_MARKER` | 缓存穿透（不存在的 id） | 与 TTL 同寿命 |

**核心结论：TTL 是最后一道兜底，不是主手段。** 主手段是写后主动失效；
TTL 保证「就算失效全部失败，数据也最多脏一个 TTL」。

### 7.2 已知局限：多实例下的本地缓存不一致

这是本方案**最重要的一条局限**，必须说清楚：

**问题**：L1 是**进程内**缓存。假设 goods-service 部署了 3 个实例 A/B/C，
用户在一次下单中经由网关打到 A 实例完成 `decrStock`，A 正确地删掉了**自己的** L1 和共享的 L2；
但 B 和 C 的 Caffeine 里**仍然留着旧库存**，且没有任何机制通知它们。

**最大脏窗口 = `local-expire-seconds`（默认 300 秒）。**
注意不是 `redis-expire-seconds`——L2 已经被删干净了，脏的是各实例自己的 L1。
在 300 秒内，打到 B/C 的读请求会看到旧库存；300 秒后 Caffeine 的
`expireAfterWrite` 到期，条目自然消失，读请求重新从（干净的）L2 或 L3 取到新值。

**为什么现在能接受**：

- 扣减库存的**真实并发安全由数据库保证**（`stock=stock-#{num} where stock>=#{num}`），不会超卖。
- 缓存侧解决的是「展示层读到旧库存」，属于体验问题而非资损问题。
- 当前部署是单实例教学环境，多实例场景尚未真实施加。

**已有的缓解**：L1 只有 `local-maximum-size=1000` 条且只放 TopK 商品，
脏窗口影响的是「最热的那批商品」——**恰恰是最需要新鲜度的那批**，所以这条局限不能靠"影响面小"来搪塞。

### 7.3 后续演进：用 canal 做跨实例失效

项目里已经具备全部基础设施，只差把链路接起来：

- **`canal-service`**（端口 18005）：`MysqlListener` 上的
  `@ListenPoint(destination = "shop", schema = "goods", table = {"goods"}, ...)`
  已经监听了 `goods.goods` 表的 INSERT / UPDATE / DELETE，并在回调里调用
  `MQSender.sendCanalMessage(...)` 把 `CanalMessage`（含 `goodsId` 与 `OperationType`）发到 RabbitMQ
  的 `canal.queue`。**注意它是点对点队列：多个消费者会分抢消息，不能直接用来做「每个实例都收到」的广播。**
- **`search-service`** 已经在消费这条链路同步 ES（`search-service/.../rabbitmq/MQReceiver.java`），
  是现成的参考写法。
- **`canal-service/.../handler/GoodsHandler.java` 目前整文件被注释掉**：

  ```java
  //@CanalTable(value = "goods.goods")
  //@Component
  //public class GoodsHandler implements EntryHandler<Goods> {
  //    @Override
  //    public void update(Goods before, Goods after) {
  //        logger.info("update before {} ", before);
  //        logger.info("update after {}", after);
  //    }
  //}
  ```

  取消注释后，`goods.goods` 表的**任意** UPDATE/INSERT 都会走到 `update`/`insert` 回调——
  这意味着**不只在 `decrStock`、任何直接改库的操作都能触发失效**，覆盖范围比"在 Service 里手写 evict"大得多。

**推荐的落地路径**（三层递进，从便宜到彻底）：

1. **广播失效（最小改动）**：复用 `MQSender` 里**已存在但当前没有调用方的 `sendFanout(...)`**
   （它发到 `MQConfig.FANOUT_EXCHANGE = "fanoutxchage"` 这个 `FanoutExchange`，
   广播语义正好满足「每个实例都收到」）。
   goods-service 侧每个实例声明自己的队列绑定到该 fanout 交换机，收到 `{goodsId}` 后各自执行
   `cacheManager.evict(key)`。这能把脏窗口从 300 秒压到「消息投递耗时」。
   两个现存细节要注意：
   - **不要复用 `canal.queue`**。它是 `MysqlListener` → `search-service` 的点对点队列，
     多实例会分抢消息，只有其中一个能收到，达不到广播效果。
   - 该 `FanoutExchange` 目前已有两条绑定（`topic.queue1` / `topic.queue2`，见 `MQConfig`），
     都是教学用的示例队列。接入前应确认这两个队列没有需要兼容的消费者，
     或为失效广播单独声明一个 exchange，避免把缓存失效消息投给无关消费方。
2. **只删 L1，不删 L2（优化）**：binlog 触发的失效说明**数据库已变更**，
   L2 的旧值也该清，但要注意「本地删了 L2 又被其它实例回填」的时序问题——
   与延迟双删配合更稳妥。
3. **引入版本号（彻底）**：L2 的 value 里带一个 `version`（如 binlog 位点或 `update_time`），
   L1 命中后异步比对版本，不一致则丢弃。代价是每次 L1 命中还要多一次网络往返，
   **与"L1 就是为了省网络"的初衷冲突**，一般不建议在中小规模下做。

> 在 canal 链路接通之前，**调小 `local-expire-seconds`**（如 60 秒）是最简单有效的缓解手段：
> 用 L1 命中率换一致性，代价可控、无需改动任何代码。

### 7.4 其他已知待清理项（不影响正确性）

- `CacheManager.get(String)` 开头的 `local instanceof String ? (String) local : String.valueOf(local)`
  是兜底分支：L1 里存的本就是 JSON 字符串，正常不会走到 `String.valueOf`；
  但若有人往同一个 Caffeine 实例里塞了非 String 对象，会被 `toString()` 成一个无法反序列化的字符串。
- `CacheManager` 还保留了一套 Hash 形态的读写方法（`get(hashKey, fieldKey)` / `putIfPresent` / `evictLocal`），
  是迁移时与 yu-like 教程保持一致的结构；**商品详情当前走的是单键形态**（`goods:detail:{id}` → JSON 字符串），
  Hash 形态暂无调用方。二者不要混用同一个 key。

---

## 8. 验证方式

### 8.1 单元测试

```bash
mvn -o -pl goods-service -am test
```

覆盖 `goods-service/src/test/java/com/zhuawa/shop/goods/cache/heavykeeper/` 下的两个测试类，**共 33 个用例**：

- **`HeavyKeeperAlgorithmTest`（26 个，纯算法，不启动 Spring、不连 MySQL/Redis）**
  覆盖 TopK 准确性、`fading` 衰减、`expelled` 挤出计数、分层哈希分布、参数边界与非法参数。
  其中两个用例专门固化本文第 6 节的修正：
  - `differentLayersMapToDifferentBuckets` —— 验证**缺陷一**已修（同一 key 在不同层落到不同列）；
  - `expelledItemRecordsExpelledKeyOwnCount` —— 验证**缺陷二**已修（记录的是被挤出者自己的 count）。
  另外 `fingerprintIsStableAcrossLayers` 验证指纹在各层一致。
- **`HeavyKeeperConcurrencyTest`（7 个）**
  覆盖并发 `add` 后热点仍在堆顶（`concurrentAddKeepsHotKeyOnTop`）、
  并发不同 key 下容量有界（`concurrentAddOnDistinctKeysKeepsCapacityBounded`）、
  并发下 `total` 不丢更新（`concurrentTotalIsNotLost`）、
  并发 add 与 fading 交错安全（`concurrentAddWithFadingIsSafe`）等。

> **判断测试是否真的重跑了**：输出里必须出现 `Compiling ... source files`。
> 只看到 `BUILD SUCCESS` 而没有编译行，说明复用了上一轮的 `target/classes`，结论不可信
> （要验证算法改动必须 `mvn clean` 或先删 `target/classes`）。

### 8.2 手工验证读/写路径

```bash
# 1) 启动 eureka + goods-service（goods 默认 18001）
# 2) 读一次：第一次会回源 MySQL 并写 L2；连续读 10+ 次后该 key 进 L1
curl http://localhost:18001/goods/get/1432247757988474880

# 3) 看 L2 是否写入（TTL 应为 1800 左右）
redis-cli -p 16379 -a 12345678 get goods:detail:1432247757988474880

# 4) 扣减库存，随后该 key 在 L2 应立刻消失（延迟双删）
curl "http://localhost:18001/goods/decrStock?goodsId=1432247757988474880&count=1"
redis-cli -p 16379 -a 12345678 exists goods:detail:1432247757988474880   # → 0

# 5) 不存在的 id 应返回 data=null 且不抛异常，同时写入负缓存
curl http://localhost:18001/goods/get/1
redis-cli -p 16379 -a 12345678 get goods:detail:1                        # → __NULL__
```

**注意 id 精度**：`Goods.id` 是 `Long` 雪花号（19 位）。网关/前端若把它当 JS `Number` 处理会丢精度，
实际接口返回的是字符串（如 `"1432247757988474880"`），验证时以字符串比对为准。
