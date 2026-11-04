import type { Metadata } from 'next';
import Link from 'next/link';
import { getSeckillList } from '@/modules/seckill/api';
import { formatPrice } from '@/lib/format/display';
import { seckillImage } from '@/modules/seckill/utils';

export const metadata: Metadata = {
  title: '限时秒杀',
  description: '朱瓦商城限时秒杀专场，每日整点开抢，库存有限先到先得。',
  alternates: { canonical: '/seckill' },
};

export const revalidate = 30;

function statusOf(start: string, end: string): { text: string; tone: 'wait' | 'live' | 'over' } {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return { text: '时间待定', tone: 'wait' };
  if (now < s) return { text: '即将开始', tone: 'wait' };
  if (now > e) return { text: '已结束', tone: 'over' };
  return { text: '抢购中', tone: 'live' };
}

export default async function SeckillPage() {
  const list = await getSeckillList();

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>限时秒杀</span>
      </nav>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section__head">
          <h1 className="section__title">限时秒杀</h1>
          <span className="section__more">共 {list.length} 款</span>
        </div>

        {list.length > 0 ? (
          <div className="seckill-row">
            {list.map((g) => {
              const st = statusOf(g.startTime, g.endTime);
              return (
                <Link key={g.goodsId} href={`/seckill/${g.goodsId}`} className="seckill-card">
                  <div className="seckill-card__head">
                    <span>{st.text}</span>
                    <span>{g.stockSeckill > 0 ? `剩余 ${g.stockSeckill} 件` : '已抢光'}</span>
                  </div>
                  <div className="seckill-card__body">
                    <div style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={seckillImage(g.img)}
                        alt={g.name}
                        style={{ maxHeight: 150, objectFit: 'contain' }}
                        loading="lazy"
                      />
                    </div>
                    <p style={{ fontSize: 13, margin: '8px 0', minHeight: 38 }}>{g.name}</p>
                    <div className="seckill-price">
                      <span className="price price--large">{formatPrice(g.priceSeckill)}</span>
                      <del>{formatPrice(g.price)}</del>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                      {new Date(g.startTime).toLocaleString('zh-CN', { hour12: false })} 开抢
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="empty">当前没有秒杀商品。请确认 seckill 服务已启动且已上架商品。</p>
        )}
      </section>
    </div>
  );
}
