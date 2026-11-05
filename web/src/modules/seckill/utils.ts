import type { SeckillGoods } from '@/modules/catalog/types';

/**
 * 秒杀模块的纯函数集合：场次归一 / 选场 / 聚合 / 时间态 / 库存 / URL。
 *
 * 这里**不引用 React、不读 `Date.now()`**（`now` 一律由调用方传入），
 * 这样服务端与客户端可以用同一条规则，也便于单测。展示用的「当前时间」
 * 只在客户端组件里取，避免被 ISR 缓存固化成过期文案。
 */

/** 秒杀图片同样是 /img/xxx 形式，统一走 Next 重写，避免浏览器直连后端。 */
export function seckillImage(img: string | null | undefined): string {
  const raw = String(img ?? '').trim();
  if (!raw) return '/placeholder-goods.svg';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/img/')) return `/backend-img/${raw.slice('/img/'.length)}`;
  return raw;
}

/** 一笔秒杀记录归一后的「场次」——时间字段转成了可比较的数值。 */
export interface SeckillSession {
  goods: SeckillGoods;
  /** 非负整数；后端漏字段时为 0（与后端 sessionIdOf 同口径） */
  sessionId: number;
  /** startTime 的毫秒值，无法解析为 null */
  startAt: number | null;
  /** endTime 的毫秒值，无法解析为 null */
  endAt: number | null;
}

/** 时间态：未开始 / 进行中 / 已结束 / 时间待定（时间字段缺失或无法解析）。 */
export type TimePhase = 'upcoming' | 'live' | 'ended' | 'unknown';

/* ------------------------------------------------------------------ */
/* 基础归一                                                            */
/* ------------------------------------------------------------------ */

/** `null → 0`，并对脏值兜底（非整数 / 负数按 0）。 */
export function sessionIdOf(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

/** 时间字符串 → 毫秒；缺失或不可解析返回 null（R-UI-01「时间待定」的唯一判据）。 */
export function parseTime(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * 库存展示归一：负数与非数一律视为 0（R-UI-05）。
 * **全站唯一实现**，任何展示库存的地方都必须过它（R-DEF-07）。
 */
export function displayStock(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/* ------------------------------------------------------------------ */
/* URL                                                                 */
/* ------------------------------------------------------------------ */

/** 详情页路径。`sessionId` 已归一化时**必须**带上，否则后端会回落到 session_id 最大的那场。 */
export function seckillDetailHref(goodsId: number | string, sessionId?: number | null): string {
  const base = `/seckill/${encodeURIComponent(String(goodsId))}`;
  return sessionId === null || sessionId === undefined ? base : `${base}?sessionId=${sessionIdOf(sessionId)}`;
}

/** 秒杀接口的 query 串；`sessionId` 缺省（null/undefined）时返回空串——不拼 `sessionId=`。 */
export function sessionQuery(sessionId?: number | null): string {
  if (sessionId === null || sessionId === undefined) return '';
  return `?sessionId=${sessionIdOf(sessionId)}`;
}

/**
 * URL 里的 `sessionId` 字符串 → 合法场次 id；非法（`abc`/`-1`/`1.5`/空串）一律当作「未提供」。
 * 严格要求「非负整数」的字面量，绝不把原始字符串拼进后端 URL（R-DETAIL-01）。
 */
export function parseSessionIdParam(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* 时间态                                                              */
/* ------------------------------------------------------------------ */

/** 时间态判定，与后端 `SeckillController` 的 seckillStatus 同口径（R-UI-01）。 */
export function timePhaseOf(startAt: number | null, endAt: number | null, now: number): TimePhase {
  if (startAt === null || endAt === null) return 'unknown';
  if (now < startAt) return 'upcoming';
  if (now > endAt) return 'ended';
  return 'live';
}

/** 把一条记录归一成场次。 */
export function toSession(goods: SeckillGoods): SeckillSession {
  return {
    goods,
    sessionId: sessionIdOf(goods.sessionId),
    startAt: parseTime(goods.startTime),
    endAt: parseTime(goods.endTime),
  };
}

/** 场次的时间态。 */
export function sessionPhase(session: SeckillSession, now: number): TimePhase {
  return timePhaseOf(session.startAt, session.endAt, now);
}

/**
 * 选场优先级：进行中 > 即将开始 > 最近结束 > 时间不可用（R-LIST-03）。
 * 返回排序用的组号（越小越优先）。
 */
function phaseRank(phase: TimePhase): number {
  switch (phase) {
    case 'live':
      return 0;
    case 'upcoming':
      return 1;
    case 'ended':
      return 2;
    default:
      return 3;
  }
}

/**
 * 场次比较函数（R-LIST-04）：完全由「时间态 + 时间字段 + sessionId」决定，
 * 不依赖数组原始顺序；任意两次调用结果一致。
 *
 * - 进行中：startTime 早者优先，再 sessionId 小者
 * - 即将开始：startTime 早者优先，再 sessionId 小者
 * - 已结束：endTime 晚者优先（最近结束），再 sessionId 大者
 * - 时间不可用：sessionId 大者优先（与后端 session_id desc 同向）
 */
export function compareSessions(a: SeckillSession, b: SeckillSession, now: number): number {
  const rankDiff = phaseRank(sessionPhase(a, now)) - phaseRank(sessionPhase(b, now));
  if (rankDiff !== 0) return rankDiff;

  const phase = sessionPhase(a, now);
  if (phase === 'live' || phase === 'upcoming') {
    const startDiff = (a.startAt ?? 0) - (b.startAt ?? 0);
    if (startDiff !== 0) return startDiff;
    return a.sessionId - b.sessionId;
  }
  if (phase === 'ended') {
    // endAt 非 null：ended 的前提就是两个时间字段都能解析
    const endDiff = (b.endAt ?? 0) - (a.endAt ?? 0);
    if (endDiff !== 0) return endDiff;
    return b.sessionId - a.sessionId;
  }
  return b.sessionId - a.sessionId;
}

/** 同一商品的多场里挑唯一一场。空数组返回 null。 */
export function pickSession(records: SeckillGoods[], now: number): SeckillSession | null {
  if (records.length === 0) return null;
  const sessions = records.map(toSession);
  let best = sessions[0];
  for (let i = 1; i < sessions.length; i += 1) {
    if (compareSessions(sessions[i], best, now) < 0) best = sessions[i];
  }
  return best;
}

/** 一个商品的聚合结果：被选中的那一场 + 它的全部场次。 */
export interface GoodsSessionGroup {
  goodsId: string;
  picked: SeckillSession;
  allSessions: SeckillSession[];
}

/**
 * 按商品聚合（R-LIST-01 / R-LIST-02）：
 * 先用 `(goodsId, sessionId)` 去重（保留首次出现），再为每个商品选出唯一一场。
 *
 * ⚠️ `renderNow` 是**渲染时刻**的时钟，不是「当前时刻」：
 * 服务端渲染出的选场结果只代表那一刻的判断。列表卡片会在客户端按本机时钟重新选场
 * （见 `SeckillCard`，方案 a），因此这里的结果仅用于 SSR 首帧，停留期间可能已经过期。
 * 名字刻意不叫 `now`，避免后来者误以为它是持续有效的当前时间。
 */
export function groupSessionsByGoods(list: SeckillGoods[], renderNow: number): GoodsSessionGroup[] {
  const seen = new Set<string>();
  const byGoods = new Map<string, SeckillGoods[]>();

  for (const goods of list) {
    const sessionId = sessionIdOf(goods.sessionId);
    const goodsId = String(goods.goodsId);
    const dedupeKey = `${goodsId}:${sessionId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const bucket = byGoods.get(goodsId);
    if (bucket) {
      bucket.push(goods);
    } else {
      byGoods.set(goodsId, [goods]);
    }
  }

  const groups: GoodsSessionGroup[] = [];
  for (const [goodsId, records] of byGoods) {
    const picked = pickSession(records, renderNow);
    // picked 非 null：bucket 至少有 1 条记录
    if (!picked) continue;
    groups.push({
      goodsId,
      picked,
      allSessions: records.map(toSession),
    });
  }
  return groups;
}

/**
 * 列表展示顺序（R-LIST-10）：按选中场次的时间态分组
 * 进行中 → 即将开始（startAt 升序）→ 已结束（endAt 降序）→ 时间不可用；
 * 同组内按 goodsId 升序，保证跨请求稳定。
 *
 * `renderNow` 同 `groupSessionsByGoods`：是渲染时刻快照，客户端重选场后不会重排，
 * 属于已知取舍（见 requirements.md §5.7）。
 */
export function sortGroupsForList(groups: GoodsSessionGroup[], renderNow: number): GoodsSessionGroup[] {
  return [...groups].sort((a, b) => {
    const rankDiff = phaseRank(sessionPhase(a.picked, renderNow)) - phaseRank(sessionPhase(b.picked, renderNow));
    if (rankDiff !== 0) return rankDiff;

    const phase = sessionPhase(a.picked, renderNow);
    if (phase === 'live' || phase === 'upcoming') {
      const startDiff = (a.picked.startAt ?? 0) - (b.picked.startAt ?? 0);
      if (startDiff !== 0) return startDiff;
    } else if (phase === 'ended') {
      const endDiff = (b.picked.endAt ?? 0) - (a.picked.endAt ?? 0);
      if (endDiff !== 0) return endDiff;
    }
    return Number(a.goodsId) - Number(b.goodsId);
  });
}

/** 某商品的候选场次（详情页场次选择器用，R-DETAIL-04）：startTime 升序 → sessionId 升序，时间不可用排最后。 */
export function candidatesForGoods(list: SeckillGoods[], goodsId: number | string): SeckillSession[] {
  const target = String(goodsId);
  const seen = new Set<string>();
  const sessions: SeckillSession[] = [];

  for (const goods of list) {
    if (String(goods.goodsId) !== target) continue;
    const sessionId = sessionIdOf(goods.sessionId);
    const dedupeKey = `${target}:${sessionId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    sessions.push(toSession(goods));
  }

  return sessions.sort((a, b) => {
    const aKnown = a.startAt !== null;
    const bKnown = b.startAt !== null;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown) {
      const startDiff = (a.startAt ?? 0) - (b.startAt ?? 0);
      if (startDiff !== 0) return startDiff;
    }
    return a.sessionId - b.sessionId;
  });
}

/* ------------------------------------------------------------------ */
/* 时钟校准                                                            */
/* ------------------------------------------------------------------ */

/** 校准后的时间窗（已换算到「客户端时钟轴」上）。 */
export interface ClockCalibration {
  /** 校准后的开始时刻（客户端时钟轴，毫秒） */
  targetStart: number;
  /** 校准后的结束时刻（客户端时钟轴，毫秒） */
  targetEnd: number;
}

/**
 * 用服务端下发的 `remainSeconds` 建立目标时刻，抵消本机时钟偏差（R-UI-10）。
 *
 * 为什么只认「未开始」阶段：后端在**进行中**时把 `remainSeconds` 固定写成 0
 * （`SeckillController` 的 `// 秒杀进行中` 分支），已结束时写 -1 —— 二者都不是
 * 可用的「还剩多久」基线。只有未开始时它才真的等于「距开始秒数」。
 *
 * 推导方式：`targetStart = 客户端 now + remainSeconds`，再用
 * `duration = endAt - startAt`（两个绝对时刻之差，与时区无关）推出
 * `targetEnd = targetStart + duration`。此后状态迁移全部用本地时钟跨过这两个
 * 目标时刻来驱动，从而对「本机时钟偏快/偏慢」免疫。
 *
 * ⚠️ 精度前提：等价性建立在「服务端算出 remainSeconds → 客户端收到」的延迟可忽略之上。
 * 实际有几十毫秒量级网络延迟，因此这是**秒级近似**，不是毫秒级精确。
 * 对秒杀场景（用户操作粒度在百毫秒以上）足够；不要拿它做精确计时。
 *
 * 返回 null 表示校准不可用，调用方应回退到「直接比较绝对时刻」的旧口径。
 */
export function calibrateWindow(
  startAt: number | null,
  endAt: number | null,
  serverStatus: number | undefined,
  remainSeconds: number | undefined,
  nowMs: number,
): ClockCalibration | null {
  // 只有「未开始」才有可用基线；进行中/已结束（1/2）以及无可信基线（undefined）一律回退
  if (serverStatus !== 0) return null;
  if (startAt === null || endAt === null) return null;
  if (typeof remainSeconds !== 'number' || !Number.isFinite(remainSeconds) || remainSeconds < 0) return null;

  const duration = endAt - startAt;
  // duration <= 0 说明时间窗配置异常（结束早于开始），校准没有意义，回退原口径
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const targetStart = nowMs + remainSeconds * 1000;
  return { targetStart, targetEnd: targetStart + duration };
}

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

/**
 * 店铺展示时区：**固定东八区**，不跟随运行时 TZ。
 *
 * 为什么必须固定：`SeckillCard` / `SeckillSessionPicker` 虽然标了 `'use client'`，
 * 但它们**同样参与 SSR** —— 服务端容器通常是 UTC、用户浏览器在东八区，同一个时刻
 * 会被两边各格式化一次，结果差 8 小时，既显示错误的时间又会触发 hydration mismatch。
 * 固定时区后服务端与客户端逐字节一致，同时保证「开抢时间」呈现的是业务时区（东八区）。
 */
const SHOP_TIME_ZONE = 'Asia/Shanghai';

/**
 * 用 `Intl` 的 `formatToParts` 自己拼装，而不是直接用 `format()`：
 * `format()` 的输出受 locale 默认分隔符影响（`zh-CN` 可能带 `/` 或全角冒号），
 * 不同 Node/浏览器 ICU 版本之间也可能有差异；`formatToParts` 只取数字分量，拼装完全由我们掌控。
 */
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: SHOP_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 秒 → `HH:mm:ss`（负数按 0 处理，绝不出现 `-1` 或残留在 00:00:00 之下）。 */
export function formatCountdown(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.trunc(totalSeconds)) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** 时间窗文案 `MM-DD HH:mm – MM-DD HH:mm`；不可解析时返回「时间待定」。 */
export function formatTimeWindow(startAt: number | null, endAt: number | null): string {
  if (startAt === null && endAt === null) return '时间待定';
  const fmt = (ms: number | null) => (ms === null ? '待定' : formatDateTime(ms));
  return `${fmt(startAt)} – ${fmt(endAt)}`;
}

/**
 * 时刻文案 `MM-DD HH:mm`，**固定按东八区展示**，防止 SSR/hydration 因运行时 TZ 不同而分叉。
 *
 * 注意：这依赖 `parseTime` 拿到的毫秒值本身是确定的。后端返回带偏移量的时间串
 * （如 `2021-10-23T15:59:59.000+00:00`），解析结果与时区无关；若将来后端改为返回
 * 无时区的本地时间串，`new Date()` 会按运行时 TZ 解析，这里就重新产生分叉——届时需在
 * `parseTime` 侧一并固定时区。
 */
export function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return '时间待定';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '时间待定';

  const parts = DATE_TIME_FORMATTER.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const month = pick('month');
  const day = pick('day');
  const hour = pick('hour');
  const minute = pick('minute');
  // 极端环境（缺少 ICU 时区数据）可能拿不到分量；宁可显示中性文案，也不要输出半截时间
  if (!month || !day || !hour || !minute) return '时间待定';
  return `${month}-${day} ${hour}:${minute}`;
}

/** 状态文案（展示用）。时间待定优先于一切（§8.5 优先级 1）。 */
export function phaseLabel(phase: TimePhase, soldOut: boolean): string {
  switch (phase) {
    case 'unknown':
      return '时间待定';
    case 'ended':
      return '已结束';
    case 'upcoming':
      return soldOut ? '即将开始 · 已抢光' : '即将开始';
    default:
      return soldOut ? '抢购中 · 已抢光' : '抢购中';
  }
}
