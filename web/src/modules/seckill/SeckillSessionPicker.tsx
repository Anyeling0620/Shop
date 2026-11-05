'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  formatTimeWindow,
  phaseLabel,
  seckillDetailHref,
  sessionPhase,
  type SeckillSession,
} from '@/modules/seckill/utils';

interface Props {
  goodsId: number;
  /** 该商品的全部场次（已排序） */
  sessions: SeckillSession[];
  /** 当前生效场次 = 详情接口实际返回的那一场（不是 URL 里的字符串，R-DETAIL-06） */
  activeSessionId: number;
  /** URL 是否显式带场次；false 时提示「当前显示：最近一场」 */
  explicit: boolean;
  /** 轮询中禁止切场（R-BUY-06），由购买面板上报 */
  disabled?: boolean;
  /** 轮询中点的提示文案 */
  disabledHint?: string;
}

/**
 * 场次切换器（R-DETAIL-04 ~ R-DETAIL-06）。
 *
 * 一、数据源：后端没有「列出某商品所有场次」的接口，候选集只能从 `/seckill/list`
 * 全量结果里按 goodsId 过滤得到（服务端算好再传进来）。
 *
 * 二、切场是**纯导航**：只用 `<Link>` 改 URL，不在客户端改 state 冒充已切换（R-DETAIL-09）。
 * 新的 URL 会触发一次新的服务端渲染，价格/库存/时间窗/状态随之全部更新。
 *
 * 三、每项必须显示时间窗（用户靠时间分辨场次），sessionId 作为弱化标识便于排查（R-DETAIL-05）。
 */
export function SeckillSessionPicker({
  goodsId,
  sessions,
  activeSessionId,
  explicit,
  disabled = false,
  disabledHint = '当前场次正在排队，请先等待结果',
}: Props) {
  // 时间态标签依赖当前时刻，只能等 hydration 之后算：服务端渲染时 now 为 null，
  // 此时只展示时间窗（不随时间变化的客观事实），避免 water 不一致（R-DEF-04）。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (sessions.length === 0) return null;

  return (
    // F5：外层用 role="group" 把「选择场次」这个标签与整组链接绑定，
    // 否则读屏用户听到的是一串没有归属的链接。
    <div role="group" aria-label="秒杀场次选择" style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>选择场次</span>
        {!explicit && (
          // R-DETAIL-11：缺省场由后端决定，前端只做非阻断提示，不自作主张猜「当前场」
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>当前显示：最近一场</span>
        )}
        {sessions.length === 1 && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>该商品只有 1 场</span>}
      </div>

      {disabled && (
        <p className="alert alert--info" role="status" aria-live="polite" style={{ marginBottom: 8 }}>
          {disabledHint}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sessions.map((session) => {
          const active = session.sessionId === activeSessionId;
          // R-DETAIL-05：时间窗是必显项（用户靠时间分辨场次）；时间态标签等 hydration 后再补
          const window = formatTimeWindow(session.startAt, session.endAt);
          const phase = now === null ? null : sessionPhase(session, now);
          const label = phase === null ? window : `${window} · ${phaseLabel(phase, false)}`;

          if (active) {
            return (
              <span
                key={session.sessionId}
                aria-current="true"
                title={`当前生效场次 sessionId=${session.sessionId}`}
                style={{
                  border: '1px solid var(--brand)',
                  background: 'var(--brand-soft)',
                  color: 'var(--brand-dark)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {label}
                <span style={{ marginLeft: 6, color: 'var(--ink-3)', fontWeight: 400 }}>#{session.sessionId}</span>
              </span>
            );
          }

          if (disabled) {
            return (
              <span
                key={session.sessionId}
                aria-disabled="true"
                title={disabledHint}
                style={{
                  border: '1px solid var(--line)',
                  color: 'var(--ink-3)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'not-allowed',
                  opacity: 0.6,
                }}
              >
                {label}
                <span style={{ marginLeft: 6 }}>#{session.sessionId}</span>
              </span>
            );
          }

          return (
            <Link
              key={session.sessionId}
              // 切场后 URL 立刻带上 sessionId，此后可复制分享且语义稳定（R-DETAIL-12）
              href={seckillDetailHref(goodsId, session.sessionId)}
              title={`切换到 sessionId=${session.sessionId}`}
              style={{
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 12,
              }}
            >
              {label}
              <span style={{ marginLeft: 6, color: 'var(--ink-3)' }}>#{session.sessionId}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
