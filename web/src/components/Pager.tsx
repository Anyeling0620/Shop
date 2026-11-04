import Link from 'next/link';

interface Props {
  page: number;
  totalPages: number;
  /** 生成指定页码的链接，保留当前筛选条件 */
  makeHref: (page: number) => string;
}

/** 服务端渲染的分页：输出真实 <a>，爬虫可逐页跟进。 */
export function Pager({ page, totalPages, makeHref }: Props) {
  if (totalPages <= 1) return null;

  const current = Math.min(Math.max(page, 1), totalPages);
  const windowSize = 2;
  const from = Math.max(1, current - windowSize);
  const to = Math.min(totalPages, current + windowSize);

  const pages: number[] = [];
  for (let i = from; i <= to; i += 1) pages.push(i);

  return (
    <nav className="pager" aria-label="分页">
      {current > 1 && (
        <Link href={makeHref(current - 1)} rel="prev">
          上一页
        </Link>
      )}
      {from > 1 && (
        <>
          <Link href={makeHref(1)}>1</Link>
          {from > 2 && <span>…</span>}
        </>
      )}
      {pages.map((p) =>
        p === current ? (
          <span key={p} aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={makeHref(p)}>
            {p}
          </Link>
        ),
      )}
      {to < totalPages && (
        <>
          {to < totalPages - 1 && <span>…</span>}
          <Link href={makeHref(totalPages)}>{totalPages}</Link>
        </>
      )}
      {current < totalPages && (
        <Link href={makeHref(current + 1)} rel="next">
          下一页
        </Link>
      )}
    </nav>
  );
}
