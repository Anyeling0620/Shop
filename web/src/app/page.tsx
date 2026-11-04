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
  // 秒杀区与热门商品同级同宽，默认只预览 4 个，其余点「更多」进秒杀页
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

      {/* 秒杀与热门商品同宽同级，位于热门商品之上 */}
      {seckills.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">
              限时秒杀
              <span className="section__note">每日整点开抢</span>
            </h2>
            <Link className="section__more" href="/seckill">
              更多 ›
            </Link>
          </div>
          <div className="grid">
            {seckills.map((g) => (
              <article className="card" key={g.goodsId}>
                <Link href={`/seckill/${g.goodsId}`} className="card__media" aria-label={g.name}>
                  <img
                    src={g.img?.startsWith('/img/') ? `/backend-img/${g.img.slice(5)}` : g.img}
                    alt={g.name}
                    loading="lazy"
                    width={300}
                    height={300}
                  />
                </Link>
                <div className="card__body">
                  <Link href={`/seckill/${g.goodsId}`}>
                    <h3 className="card__name">{g.name}</h3>
                  </Link>
                  <div className="card__foot">
                    <span className="price">{formatPrice(g.priceSeckill)}</span>
                    <del className="card__was">{formatPrice(g.price)}</del>
                  </div>
                  <span className="card__stock">仅剩 {g.stockSeckill} 件</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section__head">
          <h2 className="section__title">热门商品</h2>
          <Link className="section__more" href="/goods">
            更多 ›
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
