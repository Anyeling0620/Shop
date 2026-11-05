'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 搜索页的「单选筛选行」，类目行与品牌行共用。
 *
 * 为什么不用 <Link>：类目 / 品牌都是单选筛选，点一下只应该换筛选条件，
 * 整页跳一下（外加一次完整 HTML 重新取回）既闪屏又丢焦点，
 * 和旁边「综合 / 价格从低到高」那种原地切换的体验也不一致。
 * 所以改成 <button> + router.push：仍然走 App Router 的客户端路由，
 * 只是由我们先给出选中态，再在后台把新的 RSC 结果换进来。
 *
 * href 一律由服务端算好传进来（Server Component 不能把函数当 props 传给客户端组件），
 * 因此这个组件里没有任何 query 拼接逻辑，也没有任何 server-only 调用。
 */
export interface FilterOption {
  name: string;
  /** 选中该项后的完整地址（服务端用 buildQuery 生成，已去掉 page） */
  href: string;
}

interface Props {
  /** 无障碍分组名，如「类目筛选」/「品牌筛选」 */
  label: string;
  /** 选项列表；空数组时只渲染「不限」（只显示当前值 + 不限的场景就传单个元素） */
  options: FilterOption[];
  /** 当前生效的值，'' 表示「不限」 */
  active: string;
  /** 「不限」对应的地址（即去掉本维度参数、保留 key/价格/排序/另一个维度） */
  allHref: string;
}

export function FilterRow({ label, options, active, allHref }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /**
   * 本地选中值：点击时立刻变红加粗，不等服务端往返。
   * URL 仍然是唯一真相 —— 服务端把新的 active 传回来后就以它为准，
   * 这样直接刷新带参数的地址、或用浏览器前进后退时，选中态也不会失真。
   */
  const [picked, setPicked] = useState(active);
  useEffect(() => {
    setPicked(active);
  }, [active]);

  const prefetch = (href: string) => {
    // 悬停/聚焦先预取，点下去时 RSC 结果通常已经就绪，接近「瞬时」切换。
    router.prefetch(href);
  };

  const choose = (value: string, href: string) => {
    if (value === picked) return; // 已选中的项再点一次：不重复导航，也不重置滚动位置
    setPicked(value);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="filter-row__values" role="group" aria-label={label}>
      <button
        type="button"
        data-active={picked === ''}
        aria-pressed={picked === ''}
        onPointerEnter={() => prefetch(allHref)}
        onFocus={() => prefetch(allHref)}
        onClick={() => choose('', allHref)}
      >
        不限
      </button>

      {options.map((option) => (
        <button
          key={option.name}
          type="button"
          data-active={picked === option.name}
          aria-pressed={picked === option.name}
          onPointerEnter={() => prefetch(option.href)}
          onFocus={() => prefetch(option.href)}
          onClick={() => choose(option.name, option.href)}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
