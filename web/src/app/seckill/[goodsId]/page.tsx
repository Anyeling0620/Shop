import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeckillDetail } from '@/modules/seckill/api';
import { formatPrice } from '@/lib/format/display';
import { seckillImage } from '@/modules/seckill/utils';
import { SeckillBuyPanel } from '@/modules/seckill/SeckillBuyPanel';
import { getRequestToken } from '@/lib/auth/session';

interface Props {
  params: Promise<{ goodsId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { goodsId } = await params;
  const detail = await getSeckillDetail(goodsId);
  if (!detail) return { title: '秒杀商品不存在', robots: { index: false, follow: false } };
  return {
    title: `秒杀 · ${detail.goods.name}`,
    description: `${detail.goods.title || detail.goods.name}，秒杀价 ${formatPrice(detail.goods.priceSeckill)}，原价 ${formatPrice(detail.goods.price)}。`,
    alternates: { canonical: `/seckill/${detail.goods.goodsId}` },
  };
}

export default async function SeckillDetailPage({ params }: Props) {
  const { goodsId } = await params;
  const [detail, token] = await Promise.all([getSeckillDetail(goodsId), getRequestToken()]);
  if (!detail) notFound();

  const g = detail.goods;

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
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
              秒杀库存 {g.stockSeckill} 件 · 总库存 {g.stock} 件
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              活动时间 {new Date(g.startTime).toLocaleString('zh-CN', { hour12: false })} —{' '}
              {new Date(g.endTime).toLocaleString('zh-CN', { hour12: false })}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <SeckillBuyPanel
              goodsId={g.goodsId}
              status={detail.seckillStatus}
              remainSeconds={detail.remainSeconds}
              stockSeckill={g.stockSeckill}
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
