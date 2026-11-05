import Link from 'next/link';
import type { TopCategory } from '@/modules/catalog/api';
import type { ShopUser } from '@/modules/catalog/types';
import { CategoryNav } from '@/components/CategoryNav';

interface Props {
  categories: TopCategory[];
  user: ShopUser | null;
}

/**
 * 顶部导航固定展示的六个热门一级类目，按中文网购习惯排序：
 * 手机在最前（这是商城的主力品类），后面依次是电脑办公、家电、个护、钟表、数码。
 *
 * 为什么写死这六个、而不是查库按热度排序：
 * 1. 库里没有「类目热度 / 排序权重」这类字段，也没有按点击量统计的表。
 *    要按真实热度排，得先埋点、再建聚合，成本远大于收益，而且冷启动期间没有数据。
 * 2. 一级类目一共 21 个，全渲染会把这行挤成两排甚至横向滚动条，
 *    首屏「搜索框 + 六个品类」的横向节奏也没了。
 * 3. 这六个覆盖了商城实际有货、且用户最常点的方向，剩下的品类仍可从
 *    「全部」和页脚分类入口进入，没有丢失任何入口。
 *
 * ⚠️ 名字必须与 goods-service 返回的一级类目名**完全相等**。
 * 特别注意后端把若干品类合并成了一级类目，名字里用的是**中文顿号「、」**，
 * 例如「电脑、办公」是一个完整的类目名（不是「电脑」和「办公」两条）。
 * 所以这里既不能用 split、也不能用 includes 之类的模糊匹配，
 * 否则要么漏掉整个「电脑、办公」，要么把别的类目误算进来，
 * 最终渲染不满六项（见下方 pickHotCategories 的严格相等过滤）。
 */
const HOT_CATEGORY_NAMES = ['手机', '电脑、办公', '家用电器', '个护化妆', '钟表', '数码'] as const;

/**
 * 按 HOT_CATEGORY_NAMES 的顺序挑出一级类目。
 *
 * - 严格相等（String === String）匹配，不做 trim / 模糊匹配：
 *   白名单与后端名字只要有一个字符不同（最常见就是顿号「、」写成逗号「,」），
 *   这一项就会静默缺失，让导航只剩五项。所以宁可严格，让问题一眼能看出来。
 * - 按白名单顺序输出，而不是沿用后端返回顺序，这样热门项的排列是稳定的。
 * - 只做展示层过滤，不额外请求：categories 本来就是 layout 里 getTopCategories()
 *   的那一次请求，CategoryNav 的子类目是 hover 时才走 /api/categories/children 懒加载的，
 *   与一级类目剩几个无关。
 * - 万一后端一个都没匹配上（比如类目改名），退回前六个，避免导航整行变空。
 */
function pickHotCategories(categories: TopCategory[]): TopCategory[] {
  const picked: TopCategory[] = [];
  for (const name of HOT_CATEGORY_NAMES) {
    const hit = categories.find((category) => category.name === name);
    if (hit) picked.push(hit);
  }
  return picked.length > 0 ? picked : categories.slice(0, HOT_CATEGORY_NAMES.length);
}

/**
 * 站点头部，格式参照联想官网：固定在浏览器顶部，分类可选。
 *
 * 只保留真实存在的入口，不虚构「企业购 / 服务支持 / 合作伙伴」等没有后端的栏目。
 *
 * ⚠️ 一级类目都不是叶子类目（商品挂在「手机」这类末级分类下），
 * 所以一级类目不能直接按名字跳搜索，统一交给 CategoryNav 做 hover 逐层展开。
 */
export function SiteHeader({ categories, user }: Props) {
  const hotCategories = pickHotCategories(categories);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label="朱瓦商城首页">
          <span className="brand__mark">ZHUWA</span>
          <span className="brand__name">朱瓦</span>
        </Link>

        {/* 分类在最上方可直接选：一级类目 hover 在右侧展开子类目，叶子类目才跳转 */}
        <nav className="category-nav" aria-label="商品分类">
          <CategoryNav categories={hotCategories} />
        </nav>

        <div className="header-tools">
          <form className="header-search" action="/search" method="get" role="search">
            <input
              type="search"
              name="key"
              placeholder="搜索商品"
              aria-label="搜索商品"
              autoComplete="off"
            />
            <button type="submit" aria-label="搜索">
              <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <line x1="12.8" y1="12.8" x2="17" y2="17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <Link className="header-tools__cart" href="/cart" aria-label="购物车">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M3 4h2.2l2.2 10.2h9.9L19.5 7H6.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="19" r="1.4" fill="currentColor" />
              <circle cx="17" cy="19" r="1.4" fill="currentColor" />
            </svg>
            <span>购物车</span>
          </Link>

          {/* 已登录显示账户，未登录才显示 登录 | 注册 */}
          {user ? (
            <Link className="header-tools__account" href="/account">
              <span className="header-tools__account-name">{user.nickname || '我的账户'}</span>
            </Link>
          ) : (
            <div className="header-tools__auth">
              <Link href="/login">登录</Link>
              <span className="header-tools__sep" aria-hidden="true">
                |
              </span>
              <Link href="/login">注册</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
