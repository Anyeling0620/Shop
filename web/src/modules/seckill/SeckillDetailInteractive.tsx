'use client';

import { useCallback, useState } from 'react';
import { SeckillBuyPanel } from '@/modules/seckill/SeckillBuyPanel';
import { SeckillSessionPicker } from '@/modules/seckill/SeckillSessionPicker';
import type { SeckillSession } from '@/modules/seckill/utils';

interface Props {
  goodsId: number;
  /** 当前生效场次 = 详情接口返回的 goods.sessionId（R-TYPE-02） */
  sessionId: number;
  sessions: SeckillSession[];
  /** URL 是否显式带 sessionId；false → 展示「当前显示：最近一场」提示 */
  explicit: boolean;
  status: number;
  remainSeconds: number;
  stockSeckill: number;
  startAt: number | null;
  endAt: number | null;
  loggedIn: boolean;
}

/**
 * 详情页右侧交互区：场次切换器 + 购买面板。
 *
 * 两者必须协同：排队/轮询期间场次切换器要禁用（R-BUY-06），
 * 否则会出现「A 场在途、页面已显示 B 场」的分裂状态。这个「忙」状态
 * 由 `SeckillBuyPanel` 上报、在这里统一下发给 `SeckillSessionPicker`。
 *
 * 切场重置的保证：购买面板用 `key={sessionId}` 挂载，场次一变 React 直接卸载重建，
 * phase / orderId / 轮询定时器全部作废（R-DETAIL-08）。
 */
export function SeckillDetailInteractive({
  goodsId,
  sessionId,
  sessions,
  explicit,
  status,
  remainSeconds,
  stockSeckill,
  startAt,
  endAt,
  loggedIn,
}: Props) {
  const [busy, setBusy] = useState(false);
  const handleBusyChange = useCallback((next: boolean) => setBusy(next), []);

  return (
    <>
      <SeckillBuyPanel
        key={sessionId}
        goodsId={goodsId}
        sessionId={sessionId}
        status={status}
        remainSeconds={remainSeconds}
        stockSeckill={stockSeckill}
        startAt={startAt}
        endAt={endAt}
        loggedIn={loggedIn}
        onBusyChange={handleBusyChange}
      />
      <SeckillSessionPicker
        goodsId={goodsId}
        sessions={sessions}
        activeSessionId={sessionId}
        explicit={explicit}
        disabled={busy}
      />
    </>
  );
}
