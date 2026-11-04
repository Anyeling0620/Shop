/** 秒杀图片同样是 /img/xxx 形式，统一走 Next 重写，避免浏览器直连后端。 */
export function seckillImage(img: string | null | undefined): string {
  const raw = String(img ?? '').trim();
  if (!raw) return '/placeholder-goods.svg';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/img/')) return `/backend-img/${raw.slice('/img/'.length)}`;
  return raw;
}
