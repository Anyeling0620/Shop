import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/modules/user/LoginForm';

export const metadata: Metadata = {
  title: '登录',
  description: '登录朱瓦商城，管理购物车与订单。',
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ from?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const from = sp.from && sp.from.startsWith('/') ? sp.from : '/';

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 48, paddingBottom: 64 }}>
      <h1 className="section__title" style={{ marginBottom: 8 }}>
        登录朱瓦商城
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 0, marginBottom: 24 }}>
        演示账号：手机号 12345678901（密码由演示环境提供）
      </p>

      <LoginForm from={from} />

      <p style={{ fontSize: 13, marginTop: 20, textAlign: 'center' }}>
        还没有账号？本演示环境<b>未开放注册接口</b>，请联系管理员开通。
      </p>
      <p style={{ fontSize: 13, textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--brand)' }}>
          返回首页
        </Link>
      </p>
    </div>
  );
}
