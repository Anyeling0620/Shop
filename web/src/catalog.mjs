// One flat catalogue shared by every card, listing page and detail page.
import { SHELVES, POINTS, NEW_GROUPS, EDU_ROWS } from './data.mjs';

const slugOf = (name) => `p-${[...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 100000}`;

const seen = new Map();
function add(name, spec, price, list, category, kind) {
  const slug = slugOf(name);
  if (seen.has(slug)) return seen.get(slug);
  const p = { slug, name, spec, price, list, category, kind };
  seen.set(slug, p);
  return p;
}

export const PRODUCTS = [];

for (const s of SHELVES) {
  for (const [name, spec, price, list] of s.items) {
    PRODUCTS.push(add(name, spec, price, list, s.title, '整机'));
  }
}
for (const [title, items] of NEW_GROUPS) {
  items.forEach((name, j) => {
    PRODUCTS.push(add(name, `${title} · 示例配置`, (2000 + name.length * 137) % 9000 + 999, null, title.replace('新品', ''), '新品'));
  });
}
for (const [title, items] of EDU_ROWS) {
  items.forEach((name, j) => {
    PRODUCTS.push(add(name, '教育优惠 · 示例配置', (3299 + name.length * 173 + j * 211) % 9000 + 499, null, title.replace('推荐', ''), '教育优惠'));
  });
}
for (const [name, spec, pts, stock] of POINTS) {
  PRODUCTS.push(add(name, spec, Math.round(pts / 10), pts * 10, '积分商城', '积分礼品'));
}

export const findProduct = (slug) => PRODUCTS.find((p) => p.slug === slug);
export const slugByName = (name) => slugOf(name);

// Detail copy is generic on purpose: it describes structure, not a real model.
export function detail(p) {
  return {
    gallery: [1, 2, 3, 4].map((n) => `/assets/p-${((n + p.name.length) % 6) + 1}.svg`),
    highlights: [
      `${p.spec}`,
      '全国联保 · 官方授权渠道',
      '7 天无理由退换 · 上门取件',
    ],
    specs: [
      ['商品编号', p.slug.toUpperCase()],
      ['分类', p.category],
      ['类型', p.kind],
      ['配置说明', p.spec],
      ['包装清单', '主机 × 1、电源适配器 × 1、说明书 × 1'],
      ['保修', '整机 2 年，主要部件 3 年'],
    ],
    services: [['正品保障', '官方授权'], ['极速发货', '24 小时内'], ['无忧退换', '7 天无理由'], ['专业服务', '在线客服']],
    reviews: [
      ['示例用户 A', '外观与描述一致，开箱即用，适合日常办公。', 5],
      ['示例用户 B', '续航符合预期，接口齐全，携带方便。', 4],
      ['示例用户 C', '客服响应快，物流及时。', 5],
    ],
    related: PRODUCTS.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4),
  };
}
