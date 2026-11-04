import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getCategoryTree } from '@/modules/catalog/api';

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
  // 头部导航依赖类目树，在服务端取好后再直出，爬虫能读到完整分类
  const categories = await getCategoryTree();

  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader categories={categories} />
        <main>{children}</main>
        <SiteFooter categories={categories} />
      </body>
    </html>
  );
}
