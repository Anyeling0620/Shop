'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { incrCart, decrCart, setCartCount } from '@/modules/cart/api';
import { getRequestToken } from '@/lib/auth/session';
import { BackendError, isSessionError } from '@/lib/backend/client';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** 需要登录时前端跳登录页 */
  needLogin?: boolean;
}

/** 加购：加入成功后可选择直接跳购物车 */
export async function addToCartAction(goodsId: number, redirectToCart = false): Promise<ActionResult> {
  const token = await getRequestToken();
  if (!token) {
    return { ok: false, message: '请先登录后再加入购物车', needLogin: true };
  }

  try {
    await incrCart(goodsId, token);
    revalidatePath('/cart');
    if (redirectToCart) redirect('/cart');
    return { ok: true, message: '已加入购物车' };
  } catch (err) {
    if (isSessionError(err) || (err instanceof BackendError && err.code === 500102)) {
      return { ok: false, message: '登录状态已失效，请重新登录', needLogin: true };
    }
    return { ok: false, message: (err as Error).message || '加入购物车失败' };
  }
}

/** 数量 +1 */
export async function incrCartAction(goodsId: number): Promise<ActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };
  try {
    await incrCart(goodsId, token);
    revalidatePath('/cart');
    return { ok: true, message: 'ok' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** 数量 -1 */
export async function decrCartAction(goodsId: number): Promise<ActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };
  try {
    await decrCart(goodsId, token);
    revalidatePath('/cart');
    return { ok: true, message: 'ok' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** 直接设置数量 */
export async function setCartCountAction(goodsId: number, count: number): Promise<ActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };
  if (count < 1) return { ok: false, message: '数量不能小于 1' };
  try {
    await setCartCount(goodsId, count, token);
    revalidatePath('/cart');
    return { ok: true, message: 'ok' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
