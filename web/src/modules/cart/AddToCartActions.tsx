'use client';

import { useState, useTransition } from 'react';
import { addToCartAction } from '@/modules/cart/actions';

interface Props {
  goodsId: number;
  stock: number;
}

/** 详情页的加购/立即购买。写操作必须走 Server Action，token 不落到浏览器。 */
export function AddToCartActions({ goodsId, stock }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const soldOut = stock <= 0;

  function handleAdd(redirect: boolean) {
    setMessage(null);
    startTransition(async () => {
      const res = await addToCartAction(goodsId, redirect);
      if (res.ok) {
        if (!redirect) setMessage({ type: 'info', text: '已加入购物车' });
      } else {
        setMessage({ type: 'error', text: res.message });
      }
    });
  }

  return (
    <div>
      {message && <div className={`alert alert--${message.type}`}>{message.text}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn" disabled={pending || soldOut} onClick={() => handleAdd(true)}>
          {soldOut ? '暂时无货' : pending ? '处理中…' : '立即购买'}
        </button>
        <button className="btn btn--ghost" disabled={pending || soldOut} onClick={() => handleAdd(false)}>
          加入购物车
        </button>
      </div>
    </div>
  );
}
