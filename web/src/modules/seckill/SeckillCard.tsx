'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SeckillGoods } from '@/modules/catalog/types';
import { formatPrice } from '@/lib/format/display';
import { SeckillStatusBadge } from '@/modules/seckill/SeckillStatusBadge';
import {
  displayStock,
  formatDateTime,
  parseTime,
  pickSession,
  seckillDetailHref,
  seckillImage,
  sessionIdOf,
  type SeckillSession,
} from '@/modules/seckill/utils';

interface Props {
  /**
   * 服务端在**渲染时刻**选出的那一场。首帧就渲染它：
   * 保证 SSR 与客户端首帧完全一致（无 hydration mismatch、不闪、SEO 可读）。
   */
  goods: SeckillGoods;
  /**
   * 该商品的全部候选场次（服务端下发）。
   *
   * 为什么需要：选场原本固定在服务端渲染时刻，而卡片上的时间态由客户端按本机时钟
   * 持续迁移，两者会脱节——用户 11:50 打开列表选中 session3（11:00–12:00），
   * 停留到 12:10 时卡片正确显示「已结束」，但真正可抢的 session5 从未出现。
   * 因此把候选集下发到客户端，hydration 后按本机时钟重新选场（R-LIST-03 / R-DEF-02）。
   *
   * 传空数组时退化为「只用 `goods` 这一场」，卡片仍可正常渲染。
   */
  allSessions?: SeckillSession[];
  /** 首屏可见的卡片用 eager 加载 */
  eager?: boolean;
}

/**
 * 秒杀卡片（列表页与首页共用）。
 *
 * 卡片展示的**全部**是「当前选中那一场」的数据；链接必须带 `?sessionId=`（R-LIST-09）：
 * 列表选出的场次，与详情页缺省时的「session_id 最大」那场完全可能不是同一场，
 * 裸链接会让用户从「抢购中」点进去看到「已结束」——这正是本次要堵的陷阱。
 *
 * ## 首帧与 hydration 的取舍
 *
 * - **首帧（服务端 + 客户端 hydration 前）**：渲染服务端选出的 `goods`，
 *   时间态徽标用中性占位（因为那一刻没有可信的服务端状态基线）。
 * - **hydration 之后**：按本机时钟在 `allSessions` 里重新选场，
 *   选场与时间态文案一起迁移，不会出现「状态变了、选中场次没变」。
 *
 * 这里有一处刻意的口径不一致：首帧的场次来自服务端（可信），而时间态是占位（不可信）。
 * 两者不同步是**有意的**——场次是数据、占位只是等待客户端接管；若首帧也把场次改成中性，
 * 链接会短暂指向不存在的场次，且不利于 SEO。
 */
export function SeckillCard({ goods, allSessions = [], eager = false }: Props) {
  // null 表示尚未 hydration：此时一律用服务端选出的 goods，保证首帧一致
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    // ⚠️ 这里的 30 秒**不是倒计时粒度**，别顺手改成 1 秒。
    // 它驱动的是「**重新选场**」：每次触发都会跑一遍 pickSession，还可能改变卡片的场次与链接。
    // 秒杀场次的边界是以分钟计的（11:00–12:00 这种），30 秒足够及时；
    // 若改成每秒，pickSession 每秒跑一次、卡片 href 可能频繁变化，得不偿失。
    // 卡片上的「距开抢 / 剩余」秒数由 SeckillStatusBadge → useLivePhase 以 1 秒推进，
    // 与这里的选场刷新是两件独立的事。
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // hydration 后按本机时钟重选场；候选集为空或还没挂载时沿用服务端结果
  const pickedSession: SeckillSession | null =
    now !== null && allSessions.length > 0
      ? pickSession(
          allSessions.map((s) => s.goods),
          now,
        )
      : null;

  const active = pickedSession ?? null;
  const displayGoods = active ? active.goods : goods;
  const sessionId = active ? active.sessionId : sessionIdOf(goods.sessionId);
  const startAt = active ? active.startAt : parseTime(goods.startTime);
  const endAt = active ? active.endAt : parseTime(goods.endTime);
  const stock = displayStock(displayGoods.stockSeckill);

  return (
    <Link
      href={seckillDetailHref(displayGoods.goodsId, sessionId)}
      className="seckill-card"
      aria-label={`${displayGoods.name} 秒杀`}
    >
      <div className="seckill-card__head">
        <SeckillStatusBadge
          startAt={startAt}
          endAt={endAt}
          // 卡片不传 remainSeconds：列表没有服务端状态基线，无从校准（R-UI-10 的可用前提不满足）
          remainSeconds={0}
          stockSeckill={displayGoods.stockSeckill}
        />
        {/* 负库存一律显示 0 并归入「已抢光」，卡片本身不隐藏（R-UI-07 / R-DEF-06） */}
        <span>{stock > 0 ? `仅剩 ${stock} 件` : '已抢光'}</span>
      </div>
      <div className="seckill-card__body">
        <div style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={seckillImage(displayGoods.img)}
            alt={displayGoods.name}
            style={{ maxHeight: 150, objectFit: 'contain' }}
            loading={eager ? 'eager' : 'lazy'}
          />
        </div>
        <p style={{ fontSize: 13, margin: '8px 0', minHeight: 38 }}>{displayGoods.name}</p>
        <div className="seckill-price">
          <span className="price price--large">{formatPrice(displayGoods.priceSeckill)}</span>
          <del>{formatPrice(displayGoods.price)}</del>
        </div>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
          {startAt === null ? '时间待定' : `${formatDateTime(startAt)} 开抢`}
        </p>
      </div>
    </Link>
  );
}
