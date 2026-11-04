import Link from 'next/link';
import type { CategoryNode } from '@/modules/catalog/api';

/**
 * 顶部导航，结构参照联想官网：
 * 单行 = [品牌 Logo] [主导航] ……… [快捷项] [搜索] [登录|注册]
 * 不设顶部信息条，保持一条干净的横向导航。
 */
export function SiteHeader({ categories }: { categories: CategoryNode[] }) {
  // 主栏目：品牌站级导航，与后端类目解耦；类目作为下拉在「消费产品」里展开
  const topCategories = categories.slice(0, 8);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label="朱瓦商城首页">
          <span className="brand__mark">ZHUWA</span>
          <span className="brand__name">朱瓦</span>
        </Link>

        <nav className="primary-nav" aria-label="主导航">
          <Link className="primary-nav__link primary-nav__link--active" href="/">
            商城
          </Link>
          <div className="primary-nav__group">
            <Link className="primary-nav__link" href="/goods">
              消费产品
            </Link>
            <div className="primary-nav__panel">
              {topCategories.map((c) => (
                <Link
                  key={c.id}
                  className="primary-nav__panel-link"
                  href={`/search?category=${encodeURIComponent(c.name)}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
          <Link className="primary-nav__link" href="/seckill">
            限时秒杀
          </Link>
          <Link className="primary-nav__link" href="/goods">
            企业购
          </Link>
          <Link className="primary-nav__link" href="/seckill">
            服务支持
          </Link>
          <Link className="primary-nav__link" href="/goods">
            合作伙伴
          </Link>
          <Link className="primary-nav__link" href="/search">
            品牌
          </Link>
        </nav>

        <div className="header-tools">
          <nav className="header-tools__links" aria-label="快捷链接">
            <Link href="/account">门店</Link>
            <Link href="/account">会员</Link>
            <Link href="/account">社区</Link>
          </nav>

          <form className="header-search" action="/search" method="get" role="search">
            <input
              type="search"
              name="key"
              placeholder="搜索"
              aria-label="搜索商品"
              autoComplete="off"
            />
            <button type="submit" aria-label="搜索">
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <line x1="12.8" y1="12.8" x2="17" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="header-tools__auth">
            <Link href="/login">登录</Link>
            <span className="header-tools__sep" aria-hidden="true">
              |
            </span>
            <Link href="/login?from=/account">注册</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
