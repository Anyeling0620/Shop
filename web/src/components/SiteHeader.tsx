import Link from 'next/link';
import type { TopCategory } from '@/modules/catalog/api';
import type { ShopUser } from '@/modules/catalog/types';
import { CategoryNav } from '@/components/CategoryNav';

interface Props {
  categories: TopCategory[];
  user: ShopUser | null;
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
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label="朱瓦商城首页">
          <span className="brand__mark">ZHUWA</span>
          <span className="brand__name">朱瓦</span>
        </Link>

        {/* 分类在最上方可直接选：一级类目 hover 在右侧展开子类目，叶子类目才跳转 */}
        <nav className="category-nav" aria-label="商品分类">
          <CategoryNav categories={categories} />
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
