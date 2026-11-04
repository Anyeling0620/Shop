import type { Metadata } from 'next';
import Link from 'next/link';
import { getOrder } from '@/modules/order/api';
import { getRequestToken } from '@/lib/auth/session';
import { formatPrice, goodsImageSrc, formatDate } from '@/lib/format/display';

export const metadata: Metadata = {
  title: '订单详情',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;
  const token = await getRequestToken();

  if (!token) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">订单详情</h1>
        <div className="empty">
          请先登录查看订单。
          <br />
          <Link href={`/login?from=/orders/${orderId}`} className="btn" style={{ marginTop: 16 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const order = await getOrder(orderId, token);

  if (!order) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">订单详情</h1>
        <div className="empty">
          查不到该订单，或登录状态已失效。
          <br />
          <Link href="/login?from=/orders" className="btn" style={{ marginTop: 16 }}>
            重新登录
          </Link>
        </div>
      </div>
    );
  }

  const items = order.orderItems ?? [];

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <nav className="crumbs" aria-label="面包屑">
        <Link href="/">首页</Link>
        <span>/</span>
        <span>订单详情</span>
      </nav>

      <h1 className="section__title" style={{ marginBottom: 8 }}>
        订单 {order.id}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 0 }}>
        下单时间 {formatDate(order.createTime)} · 收货地址 {order.receiveAddress || '—'}
      </p>

      <table className="table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>商品</th>
            <th style={{ width: 100 }}>数量</th>
            <th style={{ width: 140 }}>实付</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: 'var(--ink-3)' }}>
                该订单没有商品明细
              </td>
            </tr>
          )}
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                <div className="cart-goods">
                  <img src={goodsImageSrc(it.goodsImage)} alt={it.goodsName} width={64} height={64} />
                  <span>{it.goodsName}</span>
                </div>
              </td>
              <td className="num">{it.count}</td>
              <td className="num price">{formatPrice(it.actualPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          商品总额 <span className="num">{formatPrice(order.totalPrice)}</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          应付 <span className="price price--large">{formatPrice(order.actualPrice)}</span>
        </span>
      </div>

      {order.consumerMsg && (
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 12 }}>备注：{order.consumerMsg}</p>
      )}
    </div>
  );
}
