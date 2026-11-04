import { NextResponse } from 'next/server';
import { getCategories } from '@/modules/catalog/api';

/**
 * 头部分类导航的子分类接口。
 *
 * 存在的理由：导航 hover 展开时才需要下层分类，若把三级分类树塞进 layout，
 * 每个页面都要付 175 次后端请求。这里按需返回单层，结果由浏览器端缓存。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = Number(searchParams.get('parentId') ?? 0);

  if (!Number.isFinite(parentId) || parentId < 0) {
    return NextResponse.json({ error: 'parentId 不合法' }, { status: 400 });
  }

  const categories = await getCategories(parentId);
  return NextResponse.json(categories, {
    headers: {
      // 分类是低频变更数据，交给浏览器缓存 5 分钟
      'Cache-Control': 'public, max-age=300',
    },
  });
}
