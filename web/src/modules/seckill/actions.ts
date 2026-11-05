'use server';

import { getSeckillPath, doSeckill, getSeckillResult } from '@/modules/seckill/api';
import { getRequestToken } from '@/lib/auth/session';
import { BackendError } from '@/lib/backend/client';
import { sessionIdOf } from '@/modules/seckill/utils';

export interface SeckillActionResult {
  ok: boolean;
  /** 0 排队中 / >0 订单号 / -1 失败 */
  value?: number;
  message: string;
  needLogin?: boolean;
}

/**
 * 错误码 → 用户可读文案（R-BUY-08）。
 * 不直出后端 msg：后端文案是面向调用方的（例如「秒杀商品不存在」），
 * 直接透给用户会答非所问；这里统一换成人话。
 */
function messageOf(code: number): { message: string; needLogin?: boolean } {
  switch (code) {
    case 500102:
      return { message: '登录已失效，请重新登录', needLogin: true };
    case 500500:
      return { message: '本场已抢光或已结束' };
    case 500501:
      return { message: '本场你已参与过，换一场再试试' };
    case 500502:
      return { message: '请求已过期，请重新点击抢购' };
    case 500503:
      return { message: '秒杀失败，请稍后重试' };
    case 500504:
      return { message: '场次不存在或商品已下架' };
    default:
      return { message: '秒杀请求失败，请稍后重试' };
  }
}

/**
 * 一次完整的秒杀尝试：取 path → 下单。
 * path 只有 60 秒有效，所以必须在同一个服务端动作里串起来（R-BUY-04）；
 * 两步必须带同一个 `sessionId`，否则 path 校验必然失败（R-BUY-05）。
 */
export async function seckillAction(goodsId: number, sessionId: number): Promise<SeckillActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录再参与秒杀', needLogin: true };

  // R-BUY-03：场次未知时宁可直接报错，也不要退化成「后端缺省场」而串场
  if (sessionId === null || sessionId === undefined || !Number.isFinite(Number(sessionId))) {
    return { ok: false, message: '场次信息缺失，请刷新页面后重试' };
  }
  const sid = sessionIdOf(sessionId);

  try {
    const path = await getSeckillPath(goodsId, sid, token);
    const value = await doSeckill(goodsId, path, sid, token);
    if (value === 0) return { ok: true, value, message: '已进入队列，正在为您抢购' };
    return { ok: true, value, message: '秒杀请求已提交' };
  } catch (err) {
    if (err instanceof BackendError) return { ok: false, ...messageOf(err.code) };
    return { ok: false, message: '秒杀请求失败' };
  }
}

/** 结果轮询。`sessionId` 必须与下单完全一致，否则会读到上一场的订单（R-API-06）。 */
export async function seckillResultAction(goodsId: number, sessionId: number): Promise<SeckillActionResult> {
  const token = await getRequestToken();
  if (!token) return { ok: false, message: '请先登录', needLogin: true };
  if (sessionId === null || sessionId === undefined || !Number.isFinite(Number(sessionId))) {
    return { ok: false, message: '场次信息缺失，请刷新页面后重试' };
  }
  try {
    const value = await getSeckillResult(goodsId, sessionIdOf(sessionId), token);
    return { ok: true, value, message: 'ok' };
  } catch (err) {
    if (err instanceof BackendError) return { ok: false, ...messageOf(err.code) };
    return { ok: false, message: '查询结果失败，请到订单页确认' };
  }
}
