'use server';

import { revalidatePath } from 'next/cache';
import { genOrder, type GenOrderPayload } from '@/modules/order/api';
import { getRequestToken } from '@/lib/auth/session';
import { BackendError } from '@/lib/backend/client';

export interface GenOrderResult {
  ok: boolean;
  orderId?: number;
  message: string;
  needLogin?: boolean;
}

/** 提交订单（需登录）。订单号由后端雪花算法生成后返回。 */
export async function genOrderAction(payload: GenOrderPayload): Promise<GenOrderResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };

  if (!payload.cartItemIds?.length) {
    return { ok: false, message: '请先选择要结算的商品' };
  }

  try {
    const order = await genOrder(payload, token);
    revalidatePath('/cart');
    return { ok: true, orderId: order?.id, message: '下单成功' };
  } catch (err) {
    if (err instanceof BackendError) {
      if (err.code === 500102) return { ok: false, message: '登录已失效，请重新登录', needLogin: true };
      if (err.code === 500400) return { ok: false, message: '商品不存在，请刷新购物车' };
      if (err.code === 500401) return { ok: false, message: '商品库存不足' };
      return { ok: false, message: err.message };
    }
    return { ok: false, message: '下单失败，请稍后重试' };
  }
}
