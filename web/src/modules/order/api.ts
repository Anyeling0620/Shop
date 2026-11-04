import 'server-only';
import { backendRequest } from '@/lib/backend/client';
import type { Order } from '@/modules/catalog/types';

export interface GenOrderPayload {
  cartItemIds: number[];
  receiveAddress: string;
  payType: number;
  consumerMsg: string;
}

/** 提交订单（需登录） */
export function genOrder(payload: GenOrderPayload, token: string | null) {
  return backendRequest<Order>({
    service: 'order',
    path: '/order/genOrder',
    method: 'POST',
    json: payload,
    token,
  });
}

/** 订单详情（需登录） */
export async function getOrder(orderId: string | number, token: string | null): Promise<Order | null> {
  try {
    return await backendRequest<Order>({
      service: 'order',
      path: `/order/getOrder/${encodeURIComponent(String(orderId))}`,
      token,
    });
  } catch (err) {
    console.error('[order] detail failed', (err as Error).message);
    return null;
  }
}
