import 'server-only';
import { backendRequest } from '@/lib/backend/client';
import type { CartItem } from '@/modules/catalog/types';

/** 购物车列表（需登录） */
export function getCart(token: string | null) {
  return backendRequest<CartItem[]>({ service: 'order', path: '/cart/list', token });
}

/** 数量 +1 */
export function incrCart(goodsId: number, token: string | null) {
  return backendRequest<string>({ service: 'order', path: `/cart/incr?goodsId=${goodsId}`, token });
}

/** 数量 -1 */
export function decrCart(goodsId: number, token: string | null) {
  return backendRequest<string>({ service: 'order', path: `/cart/decr?goodsId=${goodsId}`, token });
}

/** 直接设置数量 */
export function setCartCount(goodsId: number, count: number, token: string | null) {
  return backendRequest<string>({
    service: 'order',
    path: `/cart/set?goodsId=${goodsId}&count=${count}`,
    token,
  });
}
