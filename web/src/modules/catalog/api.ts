import 'server-only';
import { backendRequest, safeRequest } from '@/lib/backend/client';
import type { Brand, Category, Goods } from '@/modules/catalog/types';

/** 类目数据是低频变更，缓存 5 分钟，避免每次页面渲染都打后端 */
const CATEGORY_REVALIDATE = 300;

/**
 * 顶级类目（parentId = 0）。
 * 头部导航只需要这一层，1 次请求即可，不要为了下拉去拉全量三级。
 */
export function getTopCategories() {
  return safeRequest(
    () =>
      backendRequest<Category[]>({
        service: 'goods',
        path: '/category/getCategoriesByParentId?parentId=0',
        revalidate: CATEGORY_REVALIDATE,
      }),
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
        revalidate: CATEGORY_REVALIDATE,
      }),
    [],
  );
}

/**
 * 构建三级类目树。
 *
 * ⚠️ 代价很高：实测 1 个顶级 + 51 次二级 + 123 次三级 = 175 个后端请求。
 * 只允许在确实需要层级展示的页面调用，**不要在 layout 里调用**，
 * 否则每个页面都要付这份开销，切换标签页会明显卡顿。
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

/** 头部只需要顶级类目，类型做成轻量版，避免误用重接口 */
export type TopCategory = Category;

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
