import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGoodsById, getBrandsByCategory } from '@/modules/catalog/api';
import { formatPrice, goodsImageSrc } from '@/lib/format/display';
import { AddToCartActions } from '@/modules/cart/AddToCartActions';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const goods = await getGoodsById(id);
  if (!goods) {
    return { title: '商品不存在', robots: { index: false, follow: false } };
  }
  const desc = `${goods.name}｜${goods.brandName}｜${goods.categoryName}，朱瓦商城正品在售。`;
  return {
    title: goods.name,
    description: desc,
    alternates: { canonical: `/goods/${goods.id}` },
    openGraph: {
      title: goods.name,
      description: desc,
      images: [goodsImageSrc(goods.image)],
    },
  };
}

function parseSpecs(specsJson: string | undefined): Array<[string, string]> {
  if (!specsJson) return [];
  try {
    const obj = JSON.parse(specsJson) as Record<string, unknown>;
    return Object.entries(obj).map(([k, v]) => [k, String(v)]);
  } catch {
    return [];
  }
}

export default async function GoodsDetailPage({ params }: Props) {
  const { id } = await params;
  const goods = await getGoodsById(id);
  if (!goods) notFound();

  const [brands, specs] = await Promise.all([getBrandsByCategory(goods.categoryId), parseSpecs(goods.specsJson)]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: goods.name,
    image: [goodsImageSrc(goods.image)],
    description: `${goods.name} ${goods.brandName} ${goods.categoryName}`,
    brand: { '@type': 'Brand', name: goods.brandName },
    sku: String(goods.id),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'CNY',
      // 后端是「分」，价格结构化数据要「元」
      price: (goods.price / 100).toFixed(2),
      availability: goods.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: '朱瓦商城' },
    },
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        {/* 商品挂载的类目一定是最末级类目，按名字搜就能命中该商品 */}
        <Link href={`/search?category=${encodeURIComponent(goods.categoryName)}`}>{goods.categoryName}</Link>
        <span>/</span>
        <span>{goods.brandName}</span>
      </nav>

      <div className="detail">
        <div className="detail__media">
          <img src={goodsImageSrc(goods.image)} alt={goods.name} width={420} height={420} />
        </div>

        <div>
          <h1 className="detail__title">{goods.name}</h1>

          <div className="price-panel">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>售价</span>
              <span className="price price--large">{formatPrice(goods.price)}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              库存 {goods.stock > 0 ? `${goods.stock} 件` : '暂时无货'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              品牌 {goods.brandName} · 类目 {goods.categoryName}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <AddToCartActions goodsId={goods.id} stock={goods.stock} />
          </div>

          <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16 }}>
            提示：加入购物车与购买需要先登录，登录信息仅保存在本机 Cookie 中。
          </p>
        </div>
      </div>

      {specs.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">规格参数</h2>
          </div>
          <table className="spec-table">
            <tbody>
              {specs.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {brands.length > 0 && (
        <section className="section">
          <div className="section__head">
            <h2 className="section__title">同类目品牌</h2>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {brands.map((b) => (
              <Link
                key={b.id}
                href={`/search?brand=${encodeURIComponent(b.name)}`}
                className="btn btn--ghost"
                style={{ height: 34 }}
              >
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
