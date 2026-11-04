'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { seckillAction, seckillResultAction } from '@/modules/seckill/actions';

interface Props {
  goodsId: number;
  /** 0 未开始 1 进行中 2 已结束 */
  status: number;
  remainSeconds: number;
  stockSeckill: number;
  /** 服务端已判定登录态，避免首帧闪烁 */
  loggedIn: boolean;
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function SeckillBuyPanel({ goodsId, status, remainSeconds, stockSeckill, loggedIn }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'queued' | 'done' | 'failed'>('idle');
  const [orderId, setOrderId] = useState<number | null>(null);

  // 秒杀开始倒计时
  const [remain, setRemain] = useState(Math.max(0, remainSeconds));
  // 本地计时（后端只给剩余秒数，需要自己走）
  const [liveStatus, setLiveStatus] = useState(status);

  useEffect(() => {
    setRemain(Math.max(0, remainSeconds));
    setLiveStatus(status);
  }, [remainSeconds, status]);

  useEffect(() => {
    if (liveStatus !== 0) return;
    const timer = setInterval(() => {
      setRemain((prev) => {
        if (prev <= 1) {
          setLiveStatus(1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [liveStatus]);

  // 排队后轮询结果
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollCount.current = 0;
    pollTimer.current = setInterval(async () => {
      pollCount.current += 1;
      // 最多轮询 20 次（约 20 秒），避免无限打后端
      if (pollCount.current > 20) {
        stopPolling();
        setPhase('failed');
        setMessage({ type: 'error', text: '排队超时，请到订单页确认或稍后重试' });
        return;
      }
      const res = await seckillResultAction(goodsId);
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
        setMessage({ type: 'error', text: '很遗憾，没有抢到' });
      }
    }, 1000);
  }, [goodsId, router, stopPolling]);

  function handleSeckill() {
    setMessage(null);
    startTransition(async () => {
      const res = await seckillAction(goodsId);
      if (!res.ok) {
        if (res.needLogin) {
          router.push(`/login?from=/seckill/${goodsId}`);
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
      startPolling();
    });
  }

  const soldOut = stockSeckill <= 0;
  const notStarted = liveStatus === 0;
  const ended = liveStatus === 2;
  const disabled = pending || soldOut || ended || phase === 'queued' || phase === 'done';

  return (
    <div>
      {notStarted && (
        <div className="alert alert--info">距离开抢还有 {formatCountdown(remain)}</div>
      )}
      {ended && <div className="alert alert--info">本场秒杀已结束</div>}
      {soldOut && <div className="alert alert--error">已抢光，下次早点来</div>}
      {message && <div className={`alert alert--${message.type}`}>{message.text}</div>}

      <button className="btn btn--block" disabled={disabled} onClick={handleSeckill}>
        {pending
          ? '正在提交…'
          : phase === 'queued'
            ? '抢购中…'
            : phase === 'done'
              ? '抢购成功'
              : soldOut
                ? '已抢光'
                : ended
                  ? '已结束'
                  : notStarted
                    ? '即将开始'
                    : loggedIn
                      ? '立即抢购'
                      : '登录后抢购'}
      </button>

      {orderId && (
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
