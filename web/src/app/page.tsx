import Link from 'next/link';
import type { Metadata } from 'next';
import { getTopCategories } from '@/modules/catalog/api';
import { searchGoods } from '@/modules/search/api';
import { getSeckillList } from '@/modules/seckill/api';
import { SeckillStatusBadge } from '@/modules/seckill/SeckillStatusBadge';
import {
  displayStock,
  groupSessionsByGoods,
  parseTime,
  seckillDetailHref,
  seckillImage,
  sortGroupsForList,
} from '@/modules/seckill/utils';
import { GoodsCard } from '@/components/GoodsCard';
import { HeroCategoryNav } from '@/components/HeroCategoryNav';
import { formatPrice } from '@/lib/format/display';

export const metadata: Metadata = {
  title: '朱瓦商城 · 手机、电脑、家电正品直营',
  description: '正品手机、电脑办公、家用电器一站购齐，限时秒杀每天开抢。',
  alternates: { canonical: '/' },
};

// 首页 1 分钟内复用缓存，避免每次访问都打后端。
// （注：秒杀列表走 no-store，实际不会被这个声明缓存；这里只影响其它数据源。）
export const revalidate = 60;

export default async function HomePage() {
  // 首页左侧只需一级类目，不拉三级树（那要 175 次请求）
  const [categories, featured, seckillGoods] = await Promise.all([
    getTopCategories(),
    searchGoods({}, 1, 8),
    getSeckillList(),
  ]);

  const hot = featured.goodsEsInfoList ?? [];
  // R-LIST-11：必须**先聚合、后切片**。/seckill/list 是「每个 (商品,场次) 一条」，
  // 先 slice 会让同一商品的多场占掉多个首页位置，出现重复卡片。
  // `seckillRenderNow` 是渲染时刻快照：首页只在服务端选这一次场，不做客户端重选
  // （首页是预览区，不承载「停留后继续抢」的主流程；主流程在 /seckill 与详情页）。
  const seckillRenderNow = Date.now();
  const seckills = sortGroupsForList(
    groupSessionsByGoods(seckillGoods, seckillRenderNow),
    seckillRenderNow,
  ).slice(0, 4);

  return (
    <div className="container">
      <div className="hero">
        <aside className="hero__cats" aria-label="商品分类">
          <HeroCategoryNav categories={categories} />
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
            {seckills.map(({ goodsId, picked }) => {
              const g = picked.goods;
              const href = seckillDetailHref(g.goodsId, picked.sessionId);
              const stock = displayStock(g.stockSeckill);
              return (
                // R-LIST-06：key 用 (goodsId, sessionId)，同一商品多场也不会撞 key
                <article className="card" key={`${goodsId}:${picked.sessionId}`}>
                  <Link href={href} className="card__media" aria-label={g.name}>
                    <img src={seckillImage(g.img)} alt={g.name} loading="lazy" width={300} height={300} />
                  </Link>
                  <div className="card__body">
                    <Link href={href}>
                      <h3 className="card__name">{g.name}</h3>
                    </Link>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>
                      {/*
                        状态文案交给客户端组件按本机时钟计算，不把渲染时刻的判断写进 HTML（R-DEF-01）。
                        不传 serverStatus：本页没有可信的服务端状态基线，首帧给中性占位。
                      */}
                      <SeckillStatusBadge
                        startAt={parseTime(g.startTime)}
                        endAt={parseTime(g.endTime)}
                        remainSeconds={0}
                        stockSeckill={g.stockSeckill}
                      />
                    </div>
                    <div className="card__foot">
                      <span className="price">{formatPrice(g.priceSeckill)}</span>
                      <del className="card__was">{formatPrice(g.price)}</del>
                    </div>
                    {/* 库存归一：-70 显示为 0 / 已抢光，绝不出现负号（R-DEF-05） */}
                    <span className="card__stock">{stock > 0 ? `仅剩 ${stock} 件` : '已抢光'}</span>
                  </div>
                </article>
              );
            })}
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
