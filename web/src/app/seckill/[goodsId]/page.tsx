import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getSeckillDetailOutcome, getSeckillListStrict, SECKILL_GOODS_NOT_EXIST } from '@/modules/seckill/api';
import { formatPrice } from '@/lib/format/display';
import {
  candidatesForGoods,
  displayStock,
  formatDateTime,
  parseSessionIdParam,
  parseTime,
  seckillDetailHref,
  seckillImage,
  sessionIdOf,
} from '@/modules/seckill/utils';
import { SeckillDetailInteractive } from '@/modules/seckill/SeckillDetailInteractive';
import { getRequestToken } from '@/lib/auth/session';

interface Props {
  params: Promise<{ goodsId: string }>;
  /** URL 的 sessionId 是唯一事实来源（R-DETAIL-01 / R-DETAIL-02） */
  searchParams: Promise<{ sessionId?: string | string[] }>;
}

/**
 * 该商品的全部场次。后端没有「列出某商品所有场次」的接口（详情只给单场、列表不分商品过滤），
 * 所以候选集只能从 `/seckill/list` 全量结果里过滤（R-DETAIL-04）。列表挂了就返回空数组，
 * 选择器自动隐藏，页面主体仍可用。
 *
 * 用 React `cache()` 包一层：`generateMetadata` 与页面组件在同一次请求里各调一次，
 * 没缓存时会打出 2 次相同的后端请求（R-DETAIL-04 允许「多打一次」，但没理由多打两次）。
 */
const loadSessions = cache(async (goodsId: string) => {
  const list = await getSeckillListStrict().catch(() => []);
  return candidatesForGoods(list, goodsId);
});

/**
 * 详情页的数据装配：URL 里的合法 sessionId 透传给后端；
 * 缺省时不传，由后端回退到 session_id 最大的一场（R-DETAIL-11），前端绝不自行猜测。
 *
 * 500504 需要区分「场次失效」与「商品不存在」：后端用同一个错误码表示两种语义
 * （SeckillGoodsService 里 getByGoodsIdAndSession 查不到就抛），
 * 所以必须再查一次列表，看该 goodsId 到底有没有任何场次（R-API-07 / R-DETAIL-13）。
 *
 * 同样用 `cache()` 包一层：`generateMetadata` 与页面组件会以相同参数各调一次。
 */
const loadDetail = cache(async (goodsId: string, requestedSessionId: number | null) => {
  const { detail, errorCode } = await getSeckillDetailOutcome(goodsId, requestedSessionId ?? undefined);
  if (detail) return { kind: 'ok' as const, detail };

  // 只有「显式传了场次却 500504」才谈得上「场次失效」
  if (requestedSessionId !== null && errorCode === SECKILL_GOODS_NOT_EXIST) {
    const sessions = await loadSessions(goodsId);
    if (sessions.length > 0) {
      return { kind: 'stale-session' as const, sessions };
    }
    return { kind: 'not-found' as const };
  }

  return { kind: 'not-found' as const };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ goodsId }, sp] = await Promise.all([params, searchParams]);
  const requestedSessionId = parseSessionIdParam(sp.sessionId);
  const result = await loadDetail(goodsId, requestedSessionId);

  if (result.kind !== 'ok') {
    return { title: '秒杀场次不存在', robots: { index: false, follow: false } };
  }

  const { goods } = result.detail;
  const activeSessionId = sessionIdOf(goods.sessionId);
  // R-DETAIL-15：标题/描述/canonical 都必须与当前场次一致，不能描述另一场的价格
  return {
    title: `秒杀 · ${goods.name}`,
    description: `${goods.title || goods.name}，秒杀价 ${formatPrice(goods.priceSeckill)}，原价 ${formatPrice(goods.price)}。`,
    alternates: { canonical: `/seckill/${goods.goodsId}?sessionId=${activeSessionId}` },
  };
}

export default async function SeckillDetailPage({ params, searchParams }: Props) {
  const [{ goodsId }, sp, token] = await Promise.all([params, searchParams, getRequestToken()]);
  const requestedSessionId = parseSessionIdParam(sp.sessionId);
  const result = await loadDetail(goodsId, requestedSessionId);

  if (result.kind === 'not-found') notFound();

  if (result.kind === 'stale-session') {
    // R-DETAIL-13：商品存在、只是这个场次没了 —— 不能 404，也不能静默回落（R-DETAIL-14）
    return (
      <div className="container">
        <nav className="crumbs" aria-label="面包屑">
          <Link href="/">首页</Link>
          <span>/</span>
          <Link href="/seckill">限时秒杀</Link>
        </nav>
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section__head">
            <h1 className="section__title">该场次已失效</h1>
          </div>
          <p className="alert alert--error" role="alert">
            你访问的场次（sessionId={requestedSessionId}）已下线或不存在。为避免扣减错误的库存，
            系统不会自动切到其它场次。
          </p>
          <p style={{ marginBottom: 16 }}>该商品当前有 {result.sessions.length} 个场次：</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {result.sessions.map((session) => (
              <Link
                key={session.sessionId}
                href={seckillDetailHref(goodsId, session.sessionId)}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 10px',
                  fontSize: 12,
                }}
              >
                {/* 时间不可用时不能拿 0 去格式化（会渲染成 1970 年），这里显式分流 */}
                {session.startAt === null ? '时间待定' : `${formatDateTime(session.startAt)} 开抢`} · #{session.sessionId}
              </Link>
            ))}
          </div>
          <Link className="btn" href={`/seckill/${goodsId}`}>
            回到最近一场
          </Link>
        </section>
      </div>
    );
  }

  const detail = result.detail;
  const g = detail.goods;
  const activeSessionId = sessionIdOf(g.sessionId);
  const startAt = parseTime(g.startTime);
  const endAt = parseTime(g.endTime);
  const stock = displayStock(g.stockSeckill);

  // 场次候选集来自列表（R-DETAIL-04）；列表挂了就给空数组，选择器自动隐藏
  const sessions = await loadSessions(goodsId);

  // 开发期自检：显式传了场次，后端返回的生效场次就必须是它。
  // 若不等，说明后端没有按 sessionId 过滤，展示的数据会与 URL 不一致（R-DETAIL-02）。
  if (requestedSessionId !== null && requestedSessionId !== activeSessionId) {
    console.error('[seckill] URL 场次与生效场次不一致', { requestedSessionId, activeSessionId });
  }

  // 兜底：生效场次若不在候选集里（列表请求失败/该场刚下线），至少把它自己补进去，
  // 否则选择器会「一个都不高亮」，用户看不出当前在哪一场（R-DETAIL-06）。
  const sessionOptions = sessions.some((s) => s.sessionId === activeSessionId)
    ? sessions
    : [
        {
          goods: g,
          sessionId: activeSessionId,
          startAt,
          endAt,
        },
        ...sessions,
      ];

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        {/* R-DETAIL-16：列表页没有场次维度，返回时不带 sessionId */}
        <Link href="/seckill">限时秒杀</Link>
        <span>/</span>
        <span>{g.name}</span>
      </nav>

      <div className="detail">
        <div className="detail__media">
          <img src={seckillImage(g.img)} alt={g.name} width={420} height={420} />
        </div>

        <div>
          <h1 className="detail__title">{g.title || g.name}</h1>

          <div className="price-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>秒杀价</span>
              <span className="price price--large">{formatPrice(g.priceSeckill)}</span>
              <del style={{ color: 'var(--ink-3)', fontSize: 13 }}>{formatPrice(g.price)}</del>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {/* 展示归一：脏数据 -70 显示为 0（R-DEF-05 / R-DEF-06） */}
              秒杀库存 {stock} 件 · 总库存 {g.stock} 件 · 场次 #{activeSessionId}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {startAt === null || endAt === null
                ? '活动时间待定'
                : `活动时间 ${formatDateTime(startAt)} — ${formatDateTime(endAt)}`}
            </div>
            {requestedSessionId === null && (
              // R-DETAIL-11：缺省场由后端决定，这里如实告知，不做前端猜测
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>当前显示：最近一场（由后端缺省场次决定）</div>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            {/*
              key={activeSessionId}：切场时强制卸载重建购买面板，
              phase / orderId / 轮询定时器全部作废，杜绝「A 场排队中、页面显示 B 场」（R-DETAIL-08）。
            */}
            <SeckillDetailInteractive
              key={activeSessionId}
              goodsId={g.goodsId}
              sessionId={activeSessionId}
              sessions={sessionOptions}
              explicit={requestedSessionId !== null}
              status={detail.seckillStatus}
              remainSeconds={detail.remainSeconds}
              stockSeckill={g.stockSeckill}
              startAt={startAt}
              endAt={endAt}
              loggedIn={Boolean(token)}
            />
          </div>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16 }}>
            秒杀采用 Redis 预减库存 + MQ 异步下单，提交后需轮询结果，订单可能在几秒内生成。
          </p>
        </div>
      </div>

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">商品详情</h2>
        </div>
        <p style={{ color: 'var(--ink-2)', maxWidth: '70ch' }}>{g.detail || '暂无详细描述'}</p>
      </section>
    </div>
  );
}
