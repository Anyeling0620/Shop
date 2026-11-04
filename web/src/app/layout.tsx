import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getTopCategories } from '@/modules/catalog/api';
import { getCurrentUser } from '@/modules/user/api';
import { getRequestToken } from '@/lib/auth/session';

const site = process.env.SITE_ORIGIN ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: '朱瓦商城 · 手机、电脑、家电正品直营',
    template: '%s | 朱瓦商城',
  },
  description: '朱瓦商城提供手机、电脑办公、家用电器等正品商品，支持秒杀抢购与在线下单。',
  openGraph: {
    type: 'website',
    siteName: '朱瓦商城',
    locale: 'zh_CN',
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * 头部只需要顶级类目（1 次请求）。
   * 注意不要在这里调 getCategoryTree()：它要发 175 次请求，
   * 每个页面都要付这份开销，切换标签会明显卡顿。
   */
  const token = await getRequestToken();
  const [categories, user] = await Promise.all([
    getTopCategories(),
    token ? getCurrentUser(token) : Promise.resolve(null),
  ]);

  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader categories={categories} user={user} />
        <main>{children}</main>
        <SiteFooter categories={categories} />
      </body>
    </html>
  );
}
