'use client';

import { useEffect, useRef, useState } from 'react';
import { calibrateWindow, timePhaseOf, type ClockCalibration, type TimePhase } from '@/modules/seckill/utils';

/** 组件侧的时间态：在领域四态之外多一个「首帧未定时」。 */
export type LivePhase = TimePhase | 'pending';

/**
 * 服务端快照 → 首帧时间态。
 *
 * `seckillStatus = 1 且 remainSeconds = 0` 是二义的：后端在 `startTime`/`endTime`
 * 缺失时同样返回 `{1, 0}`。所以只有时间字段可解析时才敢采信服务端状态，
 * 否则一律「时间待定」（R-API-03）。
 *
 * `serverStatus` 为 `undefined` 时说明调用方没有可信的首帧基线（例如列表页没有
 * 服务端状态可传），此时返回 `pending`，由组件渲染中性占位，**绝不用过期快照冒充当前状态**
 * （R-DEF-01 / R-DEF-04）。
 */
export function initialPhase(
  startAt: number | null,
  endAt: number | null,
  serverStatus: number | undefined,
): LivePhase {
  if (serverStatus === undefined) return 'pending';
  if (startAt === null || endAt === null) return 'unknown';
  if (serverStatus === 0) return 'upcoming';
  if (serverStatus === 2) return 'ended';
  return 'live';
}

export interface LivePhaseResult {
  phase: LivePhase;
  /** 客户端当前时刻；`null` 表示尚未 hydration */
  now: number | null;
  /** 生效的开始时刻（已校准则换算到客户端时钟轴） */
  startAt: number | null;
  /** 生效的结束时刻（已校准则换算到客户端时钟轴） */
  endAt: number | null;
  /** 本次是否成功用 remainSeconds 校准过 */
  calibrated: boolean;
}

/**
 * 用本机时钟推进时间态（R-UI-02 / R-UI-03 / R-DEF-01）。
 *
 * `now === null` 表示还没 hydration：此时只输出首帧文案，不算秒数，
 * 保证服务端 HTML 与客户端首帧完全一致（R-DEF-04，无 hydration mismatch）。
 *
 * ## 时钟校准（R-UI-10）
 *
 * 直接用 `Date.now()` 和绝对时刻 `startAt/endAt` 比较，会受**本机时钟偏差**影响：
 * 时钟偏快会让未开始的场次提前被判为「进行中」并启用按钮——而后端 `doSeckill`
 * 并不校验时间窗（只校验 path、内存标记与 Lua 库存），于是会**真的提前扣库存下单**；
 * 时钟偏慢则会让已开抢的场次仍显示「即将开始」，用户直接错过。
 *
 * 因此当服务端给出可用的 `remainSeconds`（仅**未开始**阶段可用）时，用
 * `calibrateWindow` 把它换算成客户端时钟轴上的 `targetStart/targetEnd`，
 * 之后所有判定都比对这两个目标时刻，从而对时钟偏差免疫。
 *
 * 不可校准时（进行中/已结束、或时间字段不可解析）回退到直接比较绝对时刻。
 * 精度前提与失效边界见 `calibrateWindow` 的注释。
 *
 * 刷新粒度（R-UI-04）：
 * - 未开始 → 每秒重算；跨过 `startAt` 立刻变「抢购中」（R-UI-09，不留 00:00:00）；
 * - 进行中 → **每秒**重算；跨过 `endAt` 立刻变「已结束」（R-UI-08）；
 * - 已结束 / 时间待定 → 不再计时。
 *
 * 为什么每秒刷新是安全的：倒计时显示的秒数完全由**已获取的时间快照**
 * （`startAt`/`endAt`，或校准后的 `targetStart`/`targetEnd`）与本地时钟相减得出，
 * 这里只是让 `now` 每秒前进一次触发重渲染，**纯本地时钟推进，不触发任何后端请求**。
 * 后端请求频率不受刷新粒度影响（页面数据仍只在导航/刷新时取）。
 * 因此把「进行中」从 30 秒改成每秒，观感上倒计时才是真的在走，而成本可以忽略。
 *
 * （注意与 `SeckillCard` 里那个 30 秒定时器的区别：那个驱动的是「重新选场」，
 * 每次都跑一遍 `pickSession` 并可能改变卡片链接，属另一类开销，不随本条调整。）
 */
export function useLivePhase(
  startAt: number | null,
  endAt: number | null,
  serverStatus: number | undefined,
  /**
   * 服务端下发的剩余秒数。**只有未开始时才是「距开始秒数」**；
   * 进行中后端固定返回 0、已结束返回 -1，二者都被视为校准不可用。
   */
  remainSeconds?: number,
): LivePhaseResult {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  /**
   * 校准只在**首次 hydration** 时做一次，之后固定不变。
   *
   * 为什么不在每次 tick 都重算：`targetStart = now + remainSeconds` 若随 `now` 一起推进，
   * 目标时刻会被无限向后推，倒计时永远归不了零。校准的本质是「一次性把服务端时钟锚到
   * 本地时钟轴」，锚定后就是一串固定时刻。
   */
  const calibrationRef = useRef<ClockCalibration | null>(null);
  const calibratedRef = useRef(false);
  if (now !== null && !calibratedRef.current) {
    calibrationRef.current = calibrateWindow(startAt, endAt, serverStatus, remainSeconds, now);
    calibratedRef.current = true;
  }
  const calibration = calibrationRef.current;

  // 有校准时比较目标时刻；否则回退到原始绝对时刻（两端同时替换，口径保持一致）
  const effectiveStart = calibration ? calibration.targetStart : startAt;
  const effectiveEnd = calibration ? calibration.targetEnd : endAt;

  const phase: LivePhase =
    now === null ? initialPhase(startAt, endAt, serverStatus) : timePhaseOf(effectiveStart, effectiveEnd, now);

  useEffect(() => {
    if (now === null) return;
    // 未开始与进行中都按 1 秒推进：前者倒数到开抢，后者倒数到结束。
    // 纯本地时钟推进（只 setNow），不发任何请求，所以每秒刷新没有额外成本。
    const interval = phase === 'upcoming' || phase === 'live' ? 1000 : null;
    if (interval === null) return;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [phase, now]);

  return { phase, now, startAt: effectiveStart, endAt: effectiveEnd, calibrated: calibration !== null };
}
