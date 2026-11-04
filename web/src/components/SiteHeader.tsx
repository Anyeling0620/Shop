import Link from 'next/link';
import type { CategoryNode } from '@/modules/catalog/api';

export function SiteHeader({ categories }: { categories: CategoryNode[] }) {
  return (
    <header className="header">
      <div className="header__bar">
        <div className="container header__bar-inner">
          <span>正品保障 · 全国联保 · 顺丰包邮</span>
          <nav className="header__links" aria-label="快捷链接">
            <Link href="/account">我的账户</Link>
            <Link href="/cart">购物车</Link>
            <Link href="/orders/0" prefetch={false} style={{ display: 'none' }}>
              订单
            </Link>
            <Link href="/login">登录</Link>
          </nav>
        </div>
      </div>

      <div className="container header__main">
        <Link href="/" className="logo" aria-label="朱瓦商城首页">
          朱瓦<span>商城</span>
        </Link>

        <form className="search-form" action="/search" method="get" role="search">
          <input
            type="search"
            name="key"
            placeholder="搜索手机、笔记本、家电…"
            aria-label="搜索商品"
            autoComplete="off"
          />
          <button type="submit">搜索</button>
        </form>

        <div className="header__actions">
          <Link className="btn btn--ghost" href="/seckill">
            秒杀
          </Link>
          <Link className="btn" href="/cart">
            购物车
          </Link>
          <Link className="header__user" href="/account" aria-label="我的账户">
            <span className="header__user-name">我的账户</span>
            <span className="header__user-sub">订单 · 积分</span>
          </Link>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        <div className="container nav__inner">
          <Link className="nav__link nav__link--active" href="/">
            首页
          </Link>
          <Link className="nav__link" href="/goods">
            全部商品
          </Link>
          <Link className="nav__link" href="/seckill">
            限时秒杀
          </Link>
          {categories.slice(0, 6).map((c) => (
            <Link key={c.id} className="nav__link" href={`/search?category=${encodeURIComponent(c.name)}`}>
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
