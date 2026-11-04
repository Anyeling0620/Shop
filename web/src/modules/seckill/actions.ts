'use server';

import { getSeckillPath, doSeckill, getSeckillResult } from '@/modules/seckill/api';
import { getRequestToken } from '@/lib/auth/session';
import { BackendError } from '@/lib/backend/client';

export interface SeckillActionResult {
  ok: boolean;
  /** 0 排队中 / >0 订单号 / -1 失败 */
  value?: number;
  message: string;
  needLogin?: boolean;
}

/**
 * 一次完整的秒杀尝试：取 path → 下单。
 * path 只有 60 秒有效，所以必须在同一个服务端动作里串起来。
 */
export async function seckillAction(goodsId: number): Promise<SeckillActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录再参与秒杀', needLogin: true };

  try {
    const path = await getSeckillPath(goodsId, token);
    const value = await doSeckill(goodsId, path, token);
    if (value === 0) return { ok: true, value, message: '已进入队列，正在为您抢购' };
    return { ok: true, value, message: '秒杀请求已提交' };
  } catch (err) {
    if (err instanceof BackendError) {
      if (err.code === 500102) return { ok: false, message: '登录已失效，请重新登录', needLogin: true };
      return { ok: false, message: err.message };
    }
    return { ok: false, message: '秒杀请求失败' };
  }
}

/** 结果轮询 */
export async function seckillResultAction(goodsId: number): Promise<SeckillActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };
  try {
    const value = await getSeckillResult(goodsId, token);
    return { ok: true, value, message: 'ok' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
