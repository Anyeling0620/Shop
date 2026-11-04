'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { genOrderAction } from '@/modules/order/actions';
import { formatPrice } from '@/lib/format/display';

interface Item {
  itemId: number;
  title: string;
  totalPriceOrigin: number;
}

interface Props {
  items: Item[];
}

/** 结算面板：选择收货信息 → 提交订单。 */
export function CheckoutPanel({ items }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [consumerMsg, setConsumerMsg] = useState('');
  const [payType, setPayType] = useState('1');

  const total = items.reduce((sum, i) => sum + Number(i.totalPriceOrigin ?? 0), 0);

  function submit() {
    setError(null);
    if (!address.trim()) {
      setError('请填写收货地址');
      return;
    }
    startTransition(async () => {
      const res = await genOrderAction({
        cartItemIds: items.map((i) => i.itemId),
        receiveAddress: address.trim(),
        payType: Number(payType),
        consumerMsg: consumerMsg.trim(),
      });
      if (!res.ok) {
        if (res.needLogin) {
          router.push('/login?from=/cart');
          return;
        }
        setError(res.message);
        return;
      }
      if (res.orderId) router.push(`/orders/${res.orderId}`);
    });
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 2, padding: 20, marginTop: 24 }}>
      <h2 className="section__title" style={{ fontSize: 18, marginTop: 0 }}>
        结算
      </h2>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="field">
        <label htmlFor="address">收货地址</label>
        <textarea
          id="address"
          rows={3}
          placeholder="省 / 市 / 区 / 详细地址 / 收件人 / 手机号"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="msg">订单备注（选填）</label>
        <input id="msg" value={consumerMsg} onChange={(e) => setConsumerMsg(e.target.value)} placeholder="选填" />
      </div>

      <div className="field">
        <label htmlFor="pay">支付方式</label>
        <select id="pay" value={payType} onChange={(e) => setPayType(e.target.value)}>
          <option value="1">在线支付（演示）</option>
          <option value="2">货到付款（演示）</option>
        </select>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--line)',
          paddingTop: 16,
          marginTop: 8,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          共 {items.length} 件 · 应付 <span className="price price--large">{formatPrice(total)}</span>
        </span>
        <button className="btn" disabled={pending || items.length === 0} onClick={submit}>
          {pending ? '提交中…' : '提交订单'}
        </button>
      </div>
    </div>
  );
}
