import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/user/api';
import { getRequestToken } from '@/lib/auth/session';
import { logoutAction } from '@/modules/user/logout';

export const metadata: Metadata = {
  title: '我的账户',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const token = await getRequestToken();
  const user = await getCurrentUser(token);

  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">我的账户</h1>
        <div className="empty">
          请先登录。
          <br />
          <Link href="/login?from=/account" className="btn" style={{ marginTop: 16 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 32, maxWidth: 720 }}>
      <h1 className="section__title" style={{ marginBottom: 20 }}>
        我的账户
      </h1>

      <table className="spec-table">
        <tbody>
          <tr>
            <th scope="row">昵称</th>
            <td>{user.nickname || '—'}</td>
          </tr>
          <tr>
            <th scope="row">手机号</th>
            <td>{user.mobile ? `${user.mobile.slice(0, 3)}****${user.mobile.slice(-4)}` : '—'}</td>
          </tr>
          <tr>
            <th scope="row">积分</th>
            <td className="num">{user.point ?? 0}</td>
          </tr>
          <tr>
            <th scope="row">用户 ID</th>
            <td className="num">{user.id}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <Link className="btn" href="/cart">
          我的购物车
        </Link>
        <form action={logoutAction}>
          <button className="btn btn--ghost" type="submit">
            退出登录
          </button>
        </form>
      </div>

      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 20 }}>
        说明：后端暂未提供「我的订单列表」接口，因此只能通过下单结果进入单个订单详情页。
      </p>
    </div>
  );
}
