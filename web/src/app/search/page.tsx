import type { Metadata } from 'next';
import Link from 'next/link';
import { searchGoods } from '@/modules/search/api';
import { GoodsCard } from '@/components/GoodsCard';
import { Pager } from '@/components/Pager';

const PAGE_SIZE = 24;

interface SearchQuery {
  key?: string;
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  orderField?: string;
  orderType?: string;
  page?: string;
}

interface Props {
  searchParams: Promise<SearchQuery>;
}

function buildQuery(base: SearchQuery, patch: Partial<SearchQuery>): string {
  const merged = { ...base, ...patch };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== '' && v !== null && k !== 'page') sp.set(k, String(v));
  }
  if (merged.page) sp.set('page', String(merged.page));
  const qs = sp.toString();
  return qs ? `/search?${qs}` : '/search';
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const subject = sp.key || sp.category || sp.brand || '全部商品';
  return {
    title: `搜索：${subject}`,
    description: `在朱瓦商城搜索「${subject}」，查看价格、品牌与类目筛选结果。`,
    // 搜索结果的无限组合不应被索引，避免爬虫陷入参数空间
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const result = await searchGoods(
    {
      key: sp.key ?? null,
      category: sp.category ?? '',
      brand: sp.brand ?? '',
      minPrice: Number(sp.minPrice ?? 0) || 0,
      maxPrice: Number(sp.maxPrice ?? 0) || 0,
      orderField: sp.orderField ?? '',
      orderType: (sp.orderType as 'asc' | 'desc' | '') ?? '',
    },
    page,
    PAGE_SIZE,
  );

  const categories = result.categoryList ?? [];
  const brands = result.brandList ?? [];
  const hasFilter = Boolean(sp.key || sp.category || sp.brand || sp.minPrice || sp.maxPrice);

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>搜索</span>
      </nav>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section__head">
          <h1 className="section__title">
            {sp.key ? `“${sp.key}” 的搜索结果` : sp.category || sp.brand || '全部商品'}
          </h1>
          <span className="section__more">共 {result.total} 件</span>
        </div>

        <div className="filters">
          {categories.length > 0 && (
            <div className="filter-row">
              <span className="filter-row__label">类目</span>
              <div className="filter-row__values">
                <Link href={buildQuery(sp, { category: '', page: undefined })} data-active={!sp.category}>
                  不限
                </Link>
                {categories.slice(0, 12).map((c) => (
                  <Link
                    key={c}
                    href={buildQuery(sp, { category: c, page: undefined })}
                    data-active={sp.category === c}
                  >
                    {c}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {brands.length > 0 && (
            <div className="filter-row">
              <span className="filter-row__label">品牌</span>
              <div className="filter-row__values">
                <Link href={buildQuery(sp, { brand: '', page: undefined })} data-active={!sp.brand}>
                  不限
                </Link>
                {brands.slice(0, 12).map((b) => (
                  <Link key={b} href={buildQuery(sp, { brand: b, page: undefined })} data-active={sp.brand === b}>
                    {b}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="filter-row">
            <span className="filter-row__label">排序</span>
            <div className="filter-row__values">
              <Link
                href={buildQuery(sp, { orderField: '', orderType: '', page: undefined })}
                data-active={!sp.orderField}
              >
                综合
              </Link>
              <Link
                href={buildQuery(sp, { orderField: 'price', orderType: 'asc', page: undefined })}
                data-active={sp.orderField === 'price' && sp.orderType === 'asc'}
              >
                价格从低到高
              </Link>
              <Link
                href={buildQuery(sp, { orderField: 'price', orderType: 'desc', page: undefined })}
                data-active={sp.orderField === 'price' && sp.orderType === 'desc'}
              >
                价格从高到低
              </Link>
            </div>
          </div>
        </div>

        {result.goodsEsInfoList.length > 0 ? (
          <>
            <div className="grid">
              {result.goodsEsInfoList.map((g) => (
                <GoodsCard key={g.id} goods={g} highlighted={Boolean(sp.key || sp.category || sp.brand)} />
              ))}
            </div>
            <Pager
              page={result.page || page}
              totalPages={result.totalPages}
              makeHref={(p) => buildQuery(sp, { page: String(p) })}
            />
          </>
        ) : (
          <div className="empty">
            {hasFilter ? (
              <>
                没有找到符合条件的商品。
                <br />
                <Link href="/goods" style={{ color: 'var(--brand)' }}>
                  看看全部商品
                </Link>
              </>
            ) : (
              '暂无商品数据，请确认 search 服务与 ES 索引可用。'
            )}
          </div>
        )}
      </section>
    </div>
  );
}
