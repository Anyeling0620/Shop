import 'server-only';
import { backendRequest, BackendError, safeRequest } from '@/lib/backend/client';
import type { SeckillDetail, SeckillGoods } from '@/modules/catalog/types';
import { sessionQuery } from '@/modules/seckill/utils';

/** 商品/场次不存在的业务码。后端用它同时表示「商品不存在」与「场次不存在」（R-API-07）。 */
export const SECKILL_GOODS_NOT_EXIST = 500504;

/**
 * 秒杀列表（免登录）。
 * 后端**不接受** `sessionId`，返回的是「每个 (商品,场次) 一条」，聚合由前端做（R-API-01）。
 */
export function getSeckillList() {
  return safeRequest(
    () => backendRequest<SeckillGoods[]>({ service: 'seckill', path: '/seckill/list' }),
    [] as SeckillGoods[],
  );
}

/** 秒杀列表原始调用：保留错误码，供需要区分「商品/场次不存在」的页面使用。 */
export function getSeckillListStrict() {
  return backendRequest<SeckillGoods[]>({ service: 'seckill', path: '/seckill/list' });
}

/** 详情接口的单场结果；`error` 用于把「场次不存在」与「网络故障」区分开（R-API-07）。 */
export interface SeckillDetailOutcome {
  detail: SeckillDetail | null;
  /** 后端业务错误码（网络层错误为负数），调用方可据此决定提示文案 */
  errorCode: number | null;
}

async function fetchSeckillDetail(goodsId: number | string, sessionId?: number | null): Promise<SeckillDetailOutcome> {
  try {
    const detail = await backendRequest<SeckillDetail>({
      service: 'seckill',
      // 有场次就必须带，否则后端会回落到 session_id 最大的一场（R-DETAIL-03）
      path: `/seckill/detail/${encodeURIComponent(String(goodsId))}${sessionQuery(sessionId)}`,
    });
    return { detail, errorCode: null };
  } catch (err) {
    const code = err instanceof BackendError ? err.code : null;
    console.error('[seckill] detail failed', (err as Error).message);
    return { detail: null, errorCode: code };
  }
}

/**
 * 秒杀详情（免登录），把错误码一并返回，便于区分「场次失效」与「商品不存在」。
 *
 * 只有一个入口是有意为之：早先还存在一个只返回 `SeckillDetail | null` 的
 * `getSeckillDetail`，但它把错误码吞掉了，而详情页必须靠 `500504` 分辨
 * 「场次不存在」与「商品不存在」（R-API-07），所以那个函数全仓零调用、已删除。
 * 需要「拿不到就当没有」的宽松语义时，调用方自行判空即可，不要再加一层包装。
 */
export function getSeckillDetailOutcome(
  goodsId: number | string,
  sessionId?: number | null,
): Promise<SeckillDetailOutcome> {
  return fetchSeckillDetail(goodsId, sessionId);
}

/** 获取隐藏 path（需登录，60 秒有效）。必须与下单带同一个 sessionId（R-API-04）。 */
export function getSeckillPath(goodsId: number, sessionId: number, token: string | null) {
  return backendRequest<string>({
    service: 'seckill',
    path: `/seckill/path/${goodsId}${sessionQuery(sessionId)}`,
    token,
  });
}

/** 执行秒杀（需登录）→ 0 表示排队中。 */
export function doSeckill(goodsId: number, path: string, sessionId: number, token: string | null) {
  return backendRequest<number>({
    service: 'seckill',
    path: `/seckill/${encodeURIComponent(path)}/do/${goodsId}${sessionQuery(sessionId)}`,
    method: 'POST',
    token,
  });
}

/** 轮询结果（需登录）→ >0 订单号 / 0 排队中 / -1 失败。必须与下单同场（R-API-06）。 */
export function getSeckillResult(goodsId: number, sessionId: number, token: string | null) {
  return backendRequest<number>({
    service: 'seckill',
    path: `/seckill/result/${goodsId}${sessionQuery(sessionId)}`,
    token,
  });
}
