import Link from 'next/link';
import type { Metadata } from 'next';
import { getCategoryTree } from '@/modules/catalog/api';
import { searchGoods } from '@/modules/search/api';
import { getSeckillList } from '@/modules/seckill/api';
import { GoodsCard } from '@/components/GoodsCard';
import { formatPrice } from '@/lib/format/display';

export const metadata: Metadata = {
  title: '朱瓦商城 · 手机、电脑、家电正品直营',
  description: '正品手机、电脑办公、家用电器一站购齐，限时秒杀每天开抢。',
  alternates: { canonical: '/' },
};

// 首页 1 分钟内复用缓存，避免每次访问都打后端
export const revalidate = 60;

export default async function HomePage() {
  const [categories, featured, seckillGoods] = await Promise.all([
    getCategoryTree(),
    searchGoods({}, 1, 8),
    getSeckillList(),
  ]);

  const hot = featured.goodsEsInfoList ?? [];
  const seckills = seckillGoods.slice(0, 4);

  return (
    <div className="container">
      <div className="hero">
        <aside className="hero__cats" aria-label="商品分类">
          {categories.map((c) => (
            <Link key={c.id} className="hero__cat-item" href={`/search?category=${encodeURIComponent(c.name)}`}>
              <span>{c.name}</span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </aside>

        <section className="hero__banner">
          <span className="hero__eyebrow">今日主推</span>
          <h1 className="hero__title">换新季，正品旗舰一次到位</h1>
          <p className="hero__sub">
            手机、笔记本、家电全品类在售，支持全国联保与顺丰配送。限时秒杀每天开抢，先到先得。
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link className="btn" href="/goods">
              浏览全部商品
            </Link>
            <Link
              className="btn btn--ghost"
              href="/seckill"
              style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.7)' }}
            >
              查看秒杀
            </Link>
          </div>
        </section>
      </div>

      {seckills.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">限时秒杀</h2>
            <Link className="section__more" href="/seckill">
              全部秒杀 ›
            </Link>
          </div>
          <div className="seckill-row">
            {seckills.map((g) => (
              <Link key={g.goodsId} href={`/seckill/${g.goodsId}`} className="seckill-card">
                <div className="seckill-card__head">
                  <span>限时抢购</span>
                  <span>仅剩 {g.stockSeckill} 件</span>
                </div>
                <div className="seckill-card__body">
                  <div style={{ aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* 秒杀图同样是后端相对路径 */}
                    <img
                      src={g.img?.startsWith('/img/') ? `/backend-img/${g.img.slice(5)}` : g.img}
                      alt={g.name}
                      style={{ maxHeight: 140, objectFit: 'contain' }}
                      loading="lazy"
                    />
                  </div>
                  <p style={{ fontSize: 13, margin: '8px 0', minHeight: 38 }}>{g.name}</p>
                  <div className="seckill-price">
                    <span className="price price--large">{formatPrice(g.priceSeckill)}</span>
                    <del>{formatPrice(g.price)}</del>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">热门商品</h2>
          <Link className="section__more" href="/goods">
            查看全部 ›
          </Link>
        </div>
        {hot.length > 0 ? (
          <div className="grid">
            {hot.map((g) => (
              <GoodsCard key={g.id} goods={g} />
            ))}
          </div>
        ) : (
          <p className="empty">暂时没有可展示的商品，请确认后端 search 服务已导入数据。</p>
        )}
      </section>
    </div>
  );
}
