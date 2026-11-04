import 'server-only';
import { backendRequest, safeRequest } from '@/lib/backend/client';
import type { SearchParams, SearchResult } from '@/modules/catalog/types';

export const EMPTY_SEARCH: SearchResult = {
  goodsEsInfoList: [],
  categoryList: [],
  brandList: [],
  specsList: {},
  category: null,
  brand: null,
  specsValueMap: null,
  total: 0,
  page: 1,
  totalPages: 0,
};

/**
 * 分页搜索商品。
 *
 * 后端坑位（实测）：
 * 1. key 传空串 "" 会触发 multiMatchQuery("") 抛异常 → 500。必须 null 或非空。
 * 2. body 必须是合法 JSON，且 Content-Type: application/json。
 */
export function searchGoods(params: SearchParams, page = 1, size = 24) {
  const key = params.key?.trim() ? params.key.trim() : null;

  const body = {
    key,
    category: params.category ?? '',
    brand: params.brand ?? '',
    specsValueMap: params.specsValueMap && Object.keys(params.specsValueMap).length > 0 ? params.specsValueMap : null,
    minPrice: Number(params.minPrice ?? 0) || 0,
    maxPrice: Number(params.maxPrice ?? 0) || 0,
    orderField: params.orderField ?? '',
    orderType: params.orderType ?? '',
  };

  return safeRequest(
    () =>
      backendRequest<SearchResult>({
        service: 'search',
        path: `/search/goods/search/${page}/${size}`,
        method: 'POST',
        json: body,
        timeoutMs: 15000,
      }),
    { ...EMPTY_SEARCH, page },
  );
}
