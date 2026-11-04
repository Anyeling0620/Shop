import 'server-only';
import { backendRequest, safeRequest } from '@/lib/backend/client';
import type { SeckillDetail, SeckillGoods } from '@/modules/catalog/types';

/** 秒杀列表（免登录） */
export function getSeckillList() {
  return safeRequest(
    () => backendRequest<SeckillGoods[]>({ service: 'seckill', path: '/seckill/list' }),
    [] as SeckillGoods[],
  );
}

/** 秒杀详情（免登录），含状态与倒计时 */
export async function getSeckillDetail(goodsId: number | string): Promise<SeckillDetail | null> {
  try {
    return await backendRequest<SeckillDetail>({
      service: 'seckill',
      path: `/seckill/detail/${encodeURIComponent(String(goodsId))}`,
    });
  } catch (err) {
    console.error('[seckill] detail failed', (err as Error).message);
    return null;
  }
}

/** 获取隐藏 path（需登录，60 秒有效） */
export function getSeckillPath(goodsId: number, token: string | null) {
  return backendRequest<string>({
    service: 'seckill',
    path: `/seckill/path/${goodsId}`,
    token,
  });
}

/** 执行秒杀（需登录）→ 0 表示排队中 */
export function doSeckill(goodsId: number, path: string, token: string | null) {
  return backendRequest<number>({
    service: 'seckill',
    path: `/seckill/${encodeURIComponent(path)}/do/${goodsId}`,
    method: 'POST',
    token,
  });
}

/** 轮询结果（需登录）→ >0 订单号 / 0 排队中 / -1 失败 */
export function getSeckillResult(goodsId: number, token: string | null) {
  return backendRequest<number>({
    service: 'seckill',
    path: `/seckill/result/${goodsId}`,
    token,
  });
}
