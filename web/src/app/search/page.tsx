import type { Metadata } from 'next';
import Link from 'next/link';
import { searchGoods } from '@/modules/search/api';
import { getCategories, categoryHref } from '@/modules/catalog/api';
import { GoodsCard } from '@/components/GoodsCard';
import { Pager } from '@/components/Pager';

const PAGE_SIZE = 24;

interface SearchQuery {
  key?: string;
  category?: string;
  /** 非叶子类目点进来时用类目 id，页面展开子类目而不是直接搜 */
  categoryId?: string;
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

  // 从非叶子类目点进来：先取它的子类目。
  // 后端 ES 只有叶子类目名，直接按父类目名搜必然是 0 条，所以这一步是必需的。
  const categoryId = Number(sp.categoryId ?? 0) || 0;
  const children = categoryId > 0 ? await getCategories(categoryId) : [];

  // 有子类目 = 非叶子类目：展开子类目给用户继续点，不发无意义的搜索请求
  if (children.length > 0) {
    // 子类目是叶子才按名字搜；否则继续下钻到 categoryId（多级类目逐层展开）
    const grandChildren = await Promise.all(children.map((child) => getCategories(child.id)));

    return (
      <div className="container">
        <nav className="crumbs" aria-label="面包屑">
          <Link href="/">首页</Link>
          <span>/</span>
          <span>分类</span>
        </nav>

        <section className="section" style={{ marginTop: 0 }}>
          <div className="section__head">
            <h1 className="section__title">请选择具体分类</h1>
            <span className="section__more">共 {children.length} 个子分类</span>
          </div>

          <div className="filter-row">
            <span className="filter-row__label">子分类</span>
            <div className="filter-row__values">
              {children.map((child, i) => (
                <Link key={child.id} href={categoryHref(child, (grandChildren[i] ?? []).length === 0)}>
                  {child.name}
                </Link>
              ))}
            </div>
          </div>

          <p className="empty">
            商品按最末级分类归集，请在上方选择一个具体分类。
            <br />
            <Link href="/goods" style={{ color: 'var(--brand)' }}>
              或直接浏览全部商品
            </Link>
          </p>
        </section>
      </div>
    );
  }

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
