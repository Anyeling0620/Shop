import type { Metadata } from 'next';
import Link from 'next/link';
import { searchGoods } from '@/modules/search/api';
import { getTopCategories, getCategories, categoryHref } from '@/modules/catalog/api';
import { GoodsCard } from '@/components/GoodsCard';
import { Pager } from '@/components/Pager';

export const metadata: Metadata = {
  title: '全部商品',
  description: '朱瓦商城全部在售商品，覆盖手机、电脑办公、家用电器、个护化妆等类目。',
  alternates: { canonical: '/goods' },
};

export const revalidate = 60;

const PAGE_SIZE = 24;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function GoodsListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  // 筛选行展示全部一级类目及其二级（每级只取前 9 个，避免行过长）
  const [result, tops] = await Promise.all([searchGoods({}, page, PAGE_SIZE), getTopCategories()]);
  const shown = tops;
  const secondLevel = await Promise.all(shown.map((c) => getCategories(c.id)));
  // 二级类目本身也可能是非叶子，第三个请求用来判断它该按名字搜还是继续展开
  const thirdLevel = await Promise.all(secondLevel.map((subs) => Promise.all(subs.map((sub) => getCategories(sub.id)))));
  const categories = shown.map((c, i) => ({
    ...c,
    children: (secondLevel[i] ?? []).map((sub, j) => ({
      ...sub,
      isLeaf: (thirdLevel[i]?.[j] ?? []).length === 0,
    })),
  }));

  return (
    <div className="container">
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>全部商品</span>
      </nav>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section__head">
          <h1 className="section__title">全部商品</h1>
          <span className="section__more">共 {result.total} 件</span>
        </div>

        <div className="filters">
          {categories.map((c) => (
            <div className="filter-row" key={c.id}>
              <span className="filter-row__label">{c.name}</span>
              <div className="filter-row__values">
                {c.children.slice(0, 9).map((sub) => (
                  <Link key={sub.id} href={categoryHref(sub, sub.isLeaf)}>
                    {sub.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {result.goodsEsInfoList.length > 0 ? (
          <>
            <div className="grid">
              {result.goodsEsInfoList.map((g) => (
                <GoodsCard key={g.id} goods={g} />
              ))}
            </div>
            <Pager
              page={result.page || page}
              totalPages={result.totalPages}
              makeHref={(p) => `/goods?page=${p}`}
            />
          </>
        ) : (
          <p className="empty">暂无商品数据。请确认 search 服务可访问，且已执行过 ES 导入。</p>
        )}
      </section>
    </div>
  );
}
