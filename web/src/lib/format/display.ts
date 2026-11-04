/** 后端价格单位是「分」，展示统一换算成元。 */
export function formatPrice(cents: number | null | undefined): string {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return '¥0.00';
  return `¥${(n / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 秒杀接口的 price 是 BigDecimal（元），不能除以 100。 */
export function formatYuan(yuan: number | string | null | undefined): string {
  const n = Number(yuan ?? 0);
  if (!Number.isFinite(n)) return '¥0.00';
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { hour12: false });
}

/**
 * 后端搜索接口把高亮写成 <font color='red'>词</font>。
 * 直接 dangerouslySetInnerHTML 会有 XSS 风险，这里只保留高亮标签、其余转义。
 */
export function sanitizeHighlight(input: string | null | undefined): string {
  const raw = String(input ?? '');
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '\u0000')
    .replace(/>/g, '\u0001');
  // 还原被转义掉的 <font color='red'> 与 </font>
  return escaped
    .replace(/\u0000font color='red'\u0001/g, "<mark class=\"hl\">")
    .replace(/\u0000\/font\u0001/g, '</mark>')
    .replace(/\u0000/g, '&lt;')
    .replace(/\u0001/g, '&gt;');
}

/** 商品图：后端返回 /img/xxx.jpeg，走 Next 的 /backend-img 重写。 */
export function goodsImageSrc(image: string | null | undefined): string {
  const raw = String(image ?? '').trim();
  if (!raw) return '/placeholder-goods.svg';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/img/')) return `/backend-img/${raw.slice('/img/'.length)}`;
  return raw;
}
