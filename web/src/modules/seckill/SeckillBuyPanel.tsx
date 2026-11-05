'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { seckillAction, seckillResultAction } from '@/modules/seckill/actions';
import { useLivePhase } from '@/modules/seckill/useLivePhase';
import { displayStock, formatCountdown, seckillDetailHref, sessionIdOf } from '@/modules/seckill/utils';

interface Props {
  goodsId: number;
  /**
   * 本场场次 id —— **必须**是详情接口实际返回的 `goods.sessionId`（R-TYPE-02），
   * 下单与轮询都锁死这个值。父组件用 `key={sessionId}` 重建本组件，
   * 所以切场时 phase/orderId 会自然重置，不会串场（R-DETAIL-08）。
   */
  sessionId: number;
  /** 0 未开始 1 进行中 2 已结束（仅首帧校准） */
  status: number;
  remainSeconds: number;
  stockSeckill: number;
  /** 时间字段（毫秒），用于客户端时间态迁移 */
  startAt: number | null;
  endAt: number | null;
  /** 服务端已判定登录态，避免首帧闪烁 */
  loggedIn: boolean;
  /** 排队/轮询中回报给父组件，用于禁用场次切换器（R-BUY-06） */
  onBusyChange?: (busy: boolean) => void;
}

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_TIMES = 20;

/**
 * 秒杀购买面板。
 *
 * 场次安全的三条铁律：
 * 1. `sessionId` 在**点击瞬间**捕获成快照，之后整个异步流程只用它（R-BUY-02）；
 * 2. path → do → result 三处用同一个快照值（R-BUY-01）；
 * 3. 轮询期间禁止切场，由父组件禁用选择器（R-BUY-06）。
 */
export function SeckillBuyPanel({
  goodsId,
  sessionId,
  status,
  remainSeconds,
  stockSeckill,
  startAt,
  endAt,
  loggedIn,
  onBusyChange,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'queued' | 'done' | 'failed'>('idle');
  const [orderId, setOrderId] = useState<number | null>(null);

  // 时间态由本机时钟决定；服务端状态与 remainSeconds 只作首帧基线。
  // remainSeconds 用于时钟校准（R-UI-10）：本机时钟偏快会让未开始的场次提前可下单，
  // 而后端 doSeckill 不校验时间窗，会真的扣库存——所以必须校准。
  // startAt/endAt 返回的是**生效时刻**（校准后已换算到客户端时钟轴），倒计时必须用它。
  const { phase: timePhase, now, startAt: effStartAt, endAt: effEndAt } = useLivePhase(
    startAt,
    endAt,
    status,
    remainSeconds,
  );

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // 把「排队中」上报给父组件，让场次切换器同步禁用
  useEffect(() => {
    onBusyChange?.(phase === 'queued');
  }, [phase, onBusyChange]);

  const startPolling = useCallback(
    (frozenSessionId: number) => {
      stopPolling();
      pollCount.current = 0;
      pollTimer.current = setInterval(async () => {
        pollCount.current += 1;
        // 最多轮询 20 次（约 20 秒），避免无限打后端
        if (pollCount.current > POLL_MAX_TIMES) {
          stopPolling();
          setPhase('failed');
          // R-BUY-07：超时不断言「没抢到」，保留去订单页确认的出路
          setMessage({ type: 'error', text: '排队结果确认中，请到订单页确认或稍后重试' });
          return;
        }
        // 用点击瞬间捕获的场次，绝不在回调里重新读 props（R-BUY-02）
        const res = await seckillResultAction(goodsId, frozenSessionId);
        if (!res.ok) return;
        const value = res.value ?? 0;
        if (value > 0) {
          stopPolling();
          setOrderId(value);
          setPhase('done');
          router.push(`/orders/${value}`);
        } else if (value === -1) {
          stopPolling();
          setPhase('failed');
          setMessage({ type: 'error', text: '很遗憾，本场没有抢到' });
        }
      }, POLL_INTERVAL_MS);
    },
    [goodsId, router, stopPolling],
  );

  function handleSeckill() {
    setMessage(null);
    // 快照：本次点击只服务这一个场次
    const frozenSessionId = sessionIdOf(sessionId);
    startTransition(async () => {
      const res = await seckillAction(goodsId, frozenSessionId);
      if (!res.ok) {
        if (res.needLogin) {
          // R-BUY-09：回跳 URL 必须保留 sessionId，否则登录回来会落到缺省场
          router.push(`/login?from=${encodeURIComponent(seckillDetailHref(goodsId, frozenSessionId))}`);
          return;
        }
        setMessage({ type: 'error', text: res.message });
        return;
      }
      const value = res.value ?? 0;
      if (value > 0) {
        setOrderId(value);
        setPhase('done');
        router.push(`/orders/${value}`);
        return;
      }
      setPhase('queued');
      setMessage({ type: 'info', text: '已进入队列，正在为您抢购…' });
      startPolling(frozenSessionId);
    });
  }

  const stock = displayStock(stockSeckill);
  const soldOut = stock <= 0;

  /**
   * §8.5 展示优先级：时间待定 > 已结束 > 未开始+已抢光 > 未开始 > 进行中+已抢光 > 进行中。
   * 「已结束」压过「已抢光」——结束是更强的终态。
   */
  let primaryText: string;
  let disabled = pending || phase === 'queued' || phase === 'done';
  if (timePhase === 'unknown') {
    primaryText = '时间待定';
    disabled = true;
  } else if (timePhase === 'ended') {
    primaryText = '已结束';
    disabled = true;
  } else if (soldOut) {
    primaryText = '已抢光';
    disabled = true;
  } else if (timePhase === 'upcoming') {
    primaryText = '即将开始';
    disabled = true;
  } else {
    primaryText = loggedIn ? '立即抢购' : '登录后抢购';
  }

  if (pending) primaryText = '正在提交…';
  else if (phase === 'queued') primaryText = '抢购中…';
  else if (phase === 'done') primaryText = '抢购成功';

  const countdown =
    now !== null && effStartAt !== null && effEndAt !== null
      ? timePhase === 'upcoming'
        ? Math.max(0, Math.ceil((effStartAt - now) / 1000))
        : Math.max(0, Math.ceil((effEndAt - now) / 1000))
      : null;

  return (
    <div>
      {timePhase === 'upcoming' && (
        <div className="alert alert--info" role="status" aria-live="polite">
          距离开抢还有 {formatCountdown(countdown ?? Math.max(0, remainSeconds))}
        </div>
      )}
      {timePhase === 'live' && countdown !== null && (
        <div className="alert alert--info" role="status" aria-live="polite">
          本场剩余 {formatCountdown(countdown)}
        </div>
      )}
      {timePhase === 'ended' && (
        <div className="alert alert--info" role="status">
          本场秒杀已结束
        </div>
      )}
      {timePhase === 'unknown' && (
        <div className="alert alert--info" role="status">
          本场时间信息异常，暂不可下单（场次 #{sessionIdOf(sessionId)}）
        </div>
      )}
      {soldOut && timePhase !== 'unknown' && (
        <div className="alert alert--error" role="status">
          已抢光，下次早点来
        </div>
      )}
      {/*
        F5：抢购结果（成功/失败/超时）是本页最需要被读屏播报的信息。
        错误用 role="alert"（打断式播报，因为需要用户立即处理），
        信息用 aria-live="polite"（等当前朗读结束后播报，不打断）。
      */}
      {message &&
        (message.type === 'error' ? (
          <div className="alert alert--error" role="alert">
            {message.text}
          </div>
        ) : (
          <div className="alert alert--info" aria-live="polite">
            {message.text}
          </div>
        ))}

      <button className="btn btn--block" disabled={disabled} onClick={handleSeckill}>
        {primaryText}
      </button>

      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>
        本场场次 #{sessionIdOf(sessionId)}
        {stock > 0 ? ` · 秒杀库存 ${stock} 件` : ' · 已抢光'}
      </p>

      {orderId !== null && (
        <p style={{ fontSize: 13, marginTop: 12 }}>
          订单号 {orderId}，
          <a href={`/orders/${orderId}`} style={{ color: 'var(--brand)' }}>
            查看订单
          </a>
        </p>
      )}
    </div>
  );
}
