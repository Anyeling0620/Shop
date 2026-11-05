import type { Metadata } from 'next';
import Link from 'next/link';
import { searchGoods } from '@/modules/search/api';
import { getCategories, categoryHref } from '@/modules/catalog/api';
import { GoodsCard } from '@/components/GoodsCard';
import { Pager } from '@/components/Pager';
import { FilterRow, type FilterOption } from '@/components/FilterRow';

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

  /** 查询共用的筛选条件：key / 品牌 / 价格 / 排序 */
  const baseFilters = {
    key: sp.key ?? null,
    brand: sp.brand ?? '',
    minPrice: Number(sp.minPrice ?? 0) || 0,
    maxPrice: Number(sp.maxPrice ?? 0) || 0,
    orderField: sp.orderField ?? '',
    orderType: (sp.orderType as 'asc' | 'desc' | '') ?? '',
  };

  const selectedCategory = sp.category ?? '';
  const selectedBrand = sp.brand ?? '';

  /**
   * 只发一次查询。
   *
   * ⚠️ 历史坑（不要再改回去）：上一版为了解决「后端 category 非空时不返回 categoryList」，
   * 在选中类目时补发了一次 category 为空的查询来取选项。这个做法是错的：
   * 从头部导航点「手机」进来时 URL 里没有 key，于是那次补发查询 =
   * **空关键词 + 空类目 + 没有任何筛选**，ES 会把它当成全站聚合，
   * 把所有有货的叶子类目都吐回来 —— 实测 /search?category=手机 的类目行
   * 因此冒出毫不相干的「休闲鞋」（鞋靴>流行男鞋>休闲鞋）和「平板电视」，
   * 而它们和「手机」分属三个不同的顶级类目。
   * 结论：**不能用空 category 的查询来取选项，因为无 key 时它等于全站聚合**。
   *
   * 现在改成下面这样，只依赖这一次查询的结果，不再多发请求：
   * - 没选类目/品牌（''）→ 后端本来就会返回本次搜索的聚合，直接用它，
   *   这个场景是有意义的收窄提示（例如搜「华为」得到手机、平板电视）；
   * - 已选中某类目/品牌 → 后端返回 null（聚合只剩当前值，没有筛选意义），
   *   就只展示「不限 + 当前值」，不猜、不补查、不展示跨大类的无关项。
   */
  const result = await searchGoods({ ...baseFilters, category: selectedCategory }, page, PAGE_SIZE);

  /** 选项名：'' 时取后端聚合，非空时只有当前这一个（去重、最多 12 个） */
  function optionNames(selected: string, aggregated: string[] | null): string[] {
    if (selected) return [selected];
    return Array.from(new Set(aggregated ?? [])).filter(Boolean).slice(0, 12);
  }

  const categoryNames = optionNames(selectedCategory, result.categoryList);
  const brandNames = optionNames(selectedBrand, result.brandList);

  // 地址由服务端算好传给客户端组件，组件里不做任何 query 拼接；
  // 换任一维度都不带 page，等于把页码重置回第一页
  const toLinks = (names: string[], patch: (name: string) => Partial<SearchQuery>): FilterOption[] =>
    names.map((name) => ({ name, href: buildQuery(sp, { ...patch(name), page: undefined }) }));

  const categoryLinks = toLinks(categoryNames, (name) => ({ category: name }));
  const categoryAllHref = buildQuery(sp, { category: '', page: undefined });
  const brandLinks = toLinks(brandNames, (name) => ({ brand: name }));
  const brandAllHref = buildQuery(sp, { brand: '', page: undefined });
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
          {/*
            类目行与品牌行都是单选筛选，交给同一个客户端组件原地切换（不整页跳转）。
            选项来源见上方 optionNames 的注释：选中某值时只显示「不限 + 当前值」，
            所以刷新带参数的地址也照样渲染出完整的行，不会整行消失。
          */}
          {categoryLinks.length > 0 && (
            <div className="filter-row">
              <span className="filter-row__label">类目</span>
              <FilterRow
                label="类目筛选"
                options={categoryLinks}
                active={selectedCategory}
                allHref={categoryAllHref}
              />
            </div>
          )}

          {brandLinks.length > 0 && (
            <div className="filter-row">
              <span className="filter-row__label">品牌</span>
              <FilterRow
                label="品牌筛选"
                options={brandLinks}
                active={selectedBrand}
                allHref={brandAllHref}
              />
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
