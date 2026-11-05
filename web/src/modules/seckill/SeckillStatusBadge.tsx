'use client';

import { displayStock, formatCountdown } from '@/modules/seckill/utils';
import { useLivePhase } from '@/modules/seckill/useLivePhase';

/**
 * 首帧（未 hydration 或无可信基线）的中性占位。
 * 只画一个破折号：既不描述时间态（过期快照不可信），也不与「已抢光」重复。
 */
const PLACEHOLDER = '—';

export interface SeckillStatusBadgeProps {
  startAt: number | null;
  endAt: number | null;
  /**
   * 服务端下发的剩余秒数。仅**未开始**时可用（后端进行中固定返 0、已结束返 -1），
   * 用于把服务端时钟锚到本地时钟轴，抵消本机时钟偏差（R-UI-10）。
   */
  remainSeconds: number;
  /**
   * 0 未开始 1 进行中 2 已结束。**仅用于首帧校准**（R-UI-02）。
   * 列表页/首页不传——没有可信的服务端基线时首帧给中性占位（R-DEF-01）。
   */
  serverStatus?: number;
  /** 秒杀库存（可能是负数脏数据），内部统一走 displayStock 归一 */
  stockSeckill: unknown;
  /**
   * 是否在文案里带 `HH:mm:ss` 秒数。
   *
   * **列表页与首页的卡片现已开启**（`SeckillCard` 传 `showSeconds`），与详情页一致：
   * 展示「距开抢 00:00:05」/「抢购中 · 剩余 00:00:05」，每秒递减。
   * 秒数完全由本地时钟与已获取的时间快照相减得出，不触发任何后端请求。
   *
   * 传 `false` 时退化为纯文字（「即将开始」/「抢购中」），需要克制信息密度的场景可用。
   * 注意：无论本开关为何值，首帧的 `pending` 分支都先返回中性占位，不会输出秒数
   * （见下方实现，避免 SSR 输出倒计时导致 hydration mismatch）。
   */
  showSeconds?: boolean;
  className?: string;
}

/**
 * 列表 / 首页的状态徽标：时间态 + 「已抢光」合在一起算，保证两者永不矛盾。
 *
 * 「已抢光」只取决于库存数字（与时钟无关），首帧即可确定；
 * 时间态文案等 hydration 后才换成带秒数的版本（R-UI-03）。
 * `serverStatus` 不传时首帧给中性占位，避免把过期快照渲染进 HTML（R-DEF-01）。
 */
export function SeckillStatusBadge({
  startAt,
  endAt,
  remainSeconds,
  serverStatus,
  stockSeckill,
  showSeconds = false,
  className,
}: SeckillStatusBadgeProps) {
  // startAt/endAt 是**生效时刻**：可用校准时会换成客户端时钟轴上的目标时刻，
  // 所以下面算倒计时必须用它们，而不是 props 里的原始值，否则会与 phase 口径不一致。
  const { phase, now, startAt: effStartAt, endAt: effEndAt } = useLivePhase(
    startAt,
    endAt,
    serverStatus,
    remainSeconds,
  );
  const soldOut = displayStock(stockSeckill) <= 0;

  // 首帧：时间态未知，只把与时钟无关的「已抢光」说出来。
  // 这里是**先返回**，所以 `showSeconds` 再怎么开也不可能把倒计时秒数渲染进服务端 HTML
  // （SSR 与客户端首帧都走这个分支，输出逐字节一致，不会 hydration mismatch）。
  if (phase === 'pending') {
    return <span className={className}>{soldOut ? `${PLACEHOLDER} · 已抢光` : PLACEHOLDER}</span>;
  }

  let text: string;
  if (phase === 'unknown') {
    text = '时间待定';
  } else if (phase === 'ended') {
    // 「已结束」压过「已抢光」：结束是更强的终态（§8.5 优先级 2）
    text = '已结束';
  } else if (phase === 'upcoming') {
    text =
      showSeconds && now !== null && effStartAt !== null
        ? `距开抢 ${formatCountdown(Math.max(0, Math.ceil((effStartAt - now) / 1000)))}`
        : '即将开始';
    if (soldOut) text += ' · 已抢光';
  } else {
    text =
      showSeconds && now !== null && effEndAt !== null
        ? `抢购中 · 剩余 ${formatCountdown(Math.max(0, Math.ceil((effEndAt - now) / 1000)))}`
        : '抢购中';
    if (soldOut) text += ' · 已抢光';
  }

  return <span className={className}>{text}</span>;
}
