import 'server-only';
import { backendRequest, safeRequest } from '@/lib/backend/client';
import type { Brand, Category, Goods } from '@/modules/catalog/types';

/** 顶级类目（parentId = 0） */
export function getTopCategories() {
  return safeRequest(
    () => backendRequest<Category[]>({ service: 'goods', path: '/category/getCategoriesByParentId?parentId=0' }),
    [],
  );
}

/** 任意层级的子类目 */
export function getCategories(parentId: number) {
  return safeRequest(
    () =>
      backendRequest<Category[]>({
        service: 'goods',
        path: `/category/getCategoriesByParentId?parentId=${parentId}`,
      }),
    [],
  );
}

/**
 * 构建三级类目导航。
 * 数据量小（顶级约 10 个、每级 3~8 个），并发拉取可接受。
 */
export async function getCategoryTree() {
  const tops = await getTopCategories();
  const level2 = await Promise.all(tops.map((c) => getCategories(c.id)));
  const level3 = await Promise.all(level2.map((children) => Promise.all(children.map((c) => getCategories(c.id)))));

  return tops.map((top, i) => ({
    ...top,
    children: (level2[i] ?? []).map((second, j) => ({
      ...second,
      children: level3[i]?.[j] ?? [],
    })),
  }));
}

export type CategoryNode = Awaited<ReturnType<typeof getCategoryTree>>[number];

/** 按类目取品牌 */
export function getBrandsByCategory(categoryId: number) {
  return safeRequest(
    () =>
      backendRequest<Brand[]>({
        service: 'goods',
        path: `/brand/listByCategoryId?categoryId=${categoryId}`,
      }),
    [],
  );
}

/** 商品详情。不存在时返回 null，交给页面走 notFound()。 */
export async function getGoodsById(id: number | string) {
  try {
    return await backendRequest<Goods>({
      service: 'goods',
      path: `/goods/get/${encodeURIComponent(String(id))}`,
      revalidate: 60,
    });
  } catch (err) {
    console.error('[catalog] getGoodsById failed', (err as Error).message);
    return null;
  }
}

/**
 * 全量上架商品（约 8MB）。
 * 只用于「猜你喜欢」这类需要小样本的场景，且服务端截断，绝不下发整包。
 */
export async function getAllValidGoods(limit = 8): Promise<Goods[]> {
  const all = await safeRequest(
    () => backendRequest<Goods[]>({ service: 'goods', path: '/goods/getAllValidGoods', timeoutMs: 15000 }),
    [],
  );
  // 等距抽样，避免首页清一色同一款 SKU 的不同颜色
  if (all.length <= limit) return all;
  const step = Math.floor(all.length / limit);
  return Array.from({ length: limit }, (_, i) => all[i * step]).filter(Boolean);
}
