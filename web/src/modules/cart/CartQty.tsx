'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { incrCartAction, decrCartAction, setCartCountAction } from '@/modules/cart/actions';

interface Props {
  goodsId: number;
  count: number;
}

/** 购物车数量控制。写操作走 Server Action，避免把 token 暴露给浏览器。 */
export function CartQty({ goodsId, count }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.message);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="qty">
        <button
          type="button"
          aria-label="减少数量"
          disabled={pending || count <= 1}
          onClick={() => run(() => setCartCountAction(goodsId, Math.max(1, count - 1)))}
        >
          −
        </button>
        <span aria-live="polite">{count}</span>
        <button type="button" aria-label="增加数量" disabled={pending} onClick={() => run(() => incrCartAction(goodsId))}>
          +
        </button>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: '#b3261e', marginTop: 4 }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
