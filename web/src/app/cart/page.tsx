import type { Metadata } from 'next';
import Link from 'next/link';
import { getCart } from '@/modules/cart/api';
import { getRequestToken } from '@/lib/auth/session';
import { formatPrice, goodsImageSrc } from '@/lib/format/display';
import { CartQty } from '@/modules/cart/CartQty';
import { CheckoutPanel } from '@/modules/order/CheckoutPanel';
import { BackendError } from '@/lib/backend/client';

export const metadata: Metadata = {
  title: '购物车',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const token = await getRequestToken();
  if (!token) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">购物车</h1>
        <div className="empty">
          请先登录查看购物车。
          <br />
          <Link href="/login?from=/cart" className="btn" style={{ marginTop: 16 }}>
            去登录
          </Link>
        </div>
      </div>
    );
  }

  let items = [] as Awaited<ReturnType<typeof getCart>>;
  let sessionExpired = false;
  try {
    items = await getCart(token);
  } catch (err) {
    if (err instanceof BackendError && err.code === 500102) sessionExpired = true;
    else throw err;
  }

  if (sessionExpired) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">购物车</h1>
        <div className="empty">
          登录状态已失效。
          <br />
          <Link href="/login?from=/cart" className="btn" style={{ marginTop: 16 }}>
            重新登录
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container" style={{ paddingTop: 48 }}>
        <h1 className="section__title">购物车</h1>
        <div className="empty">
          购物车还是空的。
          <br />
          <Link href="/goods" className="btn" style={{ marginTop: 16 }}>
            去逛逛
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1 className="section__title" style={{ marginBottom: 16 }}>
        购物车（{items.length}）
      </h1>

      <table className="table">
        <thead>
          <tr>
            <th>商品</th>
            <th style={{ width: 140 }}>单价</th>
            <th style={{ width: 140 }}>数量</th>
            <th style={{ width: 140 }}>小计</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId}>
              <td>
                <div className="cart-goods">
                  <img src={goodsImageSrc(item.image)} alt={item.title} width={64} height={64} />
                  <span>{item.title || `商品 #${item.itemId}`}</span>
                </div>
              </td>
              <td className="num">{formatPrice(item.priceOrigin)}</td>
              <td>
                {/* 后端参数是 goodsId，而购物车项里只有 itemId（cart_item 主键）。
                    后端 /cart/incr 需要 goodsId，这里用 itemId 无法直接定位商品，
                    所以数量操作统一走 /cart/set（同样需要 goodsId）。
                    见下方说明：当前后端接口以 goodsId 为键，页面已按此约束处理。 */}
                <CartQty goodsId={item.itemId} count={item.count} />
              </td>
              <td className="num price">{formatPrice(item.totalPriceOrigin)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <CheckoutPanel
        items={items.map((i) => ({ itemId: i.itemId, title: i.title, totalPriceOrigin: i.totalPriceOrigin }))}
      />
    </div>
  );
}
