// Static site build: wraps each page fragment with the shared chrome and copies assets.
//
// 页面本身是空壳 + 客户端取数：构建期不生成任何商品数据，
// 所有列表/详情/购物车/订单数据都来自真实后端（见 src/assets/api.js）。
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

const NAV = [
  ['首页', '/index.html'],
  ['新品', '/page/newarrival/xpzx.html'],
  ['限时秒杀', '/seckill/index.html'],
  ['全部商品', '/list/index.html'],
  ['教育特惠', '/page/xs/jyth.html'],
];

// 分类轨道由页面运行时用真实类目接口填充；这里只留容器。
const FOOTER_COLS = [
  ['购物指南', ['购买流程', '注册登录', '商品评价']],
  ['配送方式', ['配送方式', '配送信息', '签收规则', '物流查询']],
  ['支付方式', ['分期支付', '支付方式', '支付问题']],
  ['订单信息', ['订单信息', '发票信息', '激活查询']],
  ['售后服务', ['售后总则', '在线客服', '服务入口', '热门问题']],
  ['其他说明', ['服务承诺', '账户安全', '购买须知', '环境信息']],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function header(active, assetBase) {
  const nav = NAV.map(
    ([label, href]) =>
      `<li><a href="${href}"${href === active ? ' class="is-active" aria-current="page"' : ''}>${label}</a></li>`
  ).join('');
  return `
<a class="skip" href="#main">跳到主要内容</a>
<div class="utility">
  <div class="wrap utility__in">
    <ul class="utility__left">
      <li><a href="/index.html">首页</a></li>
      <li><a href="/list/index.html">全部商品</a></li>
      <li><a href="/seckill/index.html">限时秒杀</a></li>
    </ul>
    <ul class="utility__right">
      <li><a href="/list/index.html">全部商品</a></li>
      <li><a href="/cart/index.html">购物车</a></li>
      <li id="navLogin"><a class="utility__login" href="/login/index.html?next=${encodeURIComponent('')}">登录</a></li>
      <li id="navAccount" class="utility__account" hidden></li>
      <li><a class="utility__cart" href="/cart/index.html" aria-label="购物车">
        <img src="${assetBase}cart.svg" width="20" height="20" alt="">
        <span class="utility__count" id="cartCount" hidden>0</span>
      </a></li>
    </ul>
  </div>
</div>
<header class="masthead">
  <div class="wrap masthead__in">
    <a class="brand" href="/index.html" aria-label="商城首页">
      <span class="brand__mark" aria-hidden="true">N</span>
      <span class="brand__name">NOVA<em>store</em></span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mainnav">
      <span></span><span></span><span></span><span class="sr">导航菜单</span>
    </button>
    <nav class="mainnav" id="mainnav" aria-label="主导航"><ul>${nav}</ul></nav>
    <form class="search" action="/list/index.html" method="get" role="search">
      <label class="sr" for="q">搜索商品</label>
      <input id="q" type="search" name="q" placeholder="搜索商品 / 型号">
      <button type="submit" aria-label="搜索">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
    </form>
  </div>
</header>`;
}

function footer(assetBase) {
  const cols = FOOTER_COLS.map(
    ([title, links]) =>
      `<div class="foot__col"><p class="foot__title">${title}</p><ul>${links
        .map((l) => `<li><a href="#">${l}</a></li>`)
        .join('')}</ul></div>`
  ).join('');
  return `
<footer class="foot">
  <div class="foot__band">
    <div class="wrap foot__band-in">
      <div class="foot__promise">
        <span class="foot__badge" aria-hidden="true"></span>
        <p><strong>正品保障</strong><small>官方授权 · 全国联保</small></p>
      </div>
      <div class="foot__promise">
        <span class="foot__badge foot__badge--2" aria-hidden="true"></span>
        <p><strong>极速发货</strong><small>现货商品 24 小时内发出</small></p>
      </div>
      <div class="foot__promise">
        <span class="foot__badge foot__badge--3" aria-hidden="true"></span>
        <p><strong>无忧退换</strong><small>7 天无理由 · 上门取件</small></p>
      </div>
      <div class="foot__promise">
        <span class="foot__badge foot__badge--4" aria-hidden="true"></span>
        <p><strong>专业服务</strong><small>在线客服 · 到店维修</small></p>
      </div>
    </div>
  </div>
  <div class="foot__links">
    <div class="wrap foot__links-in">
      ${cols}
      <div class="foot__phone">
        <p class="foot__title">服务热线</p>
        <h2>400-166-6666</h2>
        <p class="foot__hours">周一至周日 9:00–21:00</p>
        <a class="foot__qr" href="#" aria-label="扫码关注">
          <img src="${assetBase}qr.svg" width="72" height="72" alt="">
        </a>
      </div>
    </div>
  </div>
  <div class="foot__legal">
    <div class="wrap foot__legal-in">
      <p>© 2026 NOVA 商城 · 商品与价格来自本地后端服务</p>
      <ul>
        <li><a href="#">法律公告</a></li>
        <li><a href="#">隐私权政策</a></li>
        <li><a href="#">产品安全</a></li>
        <li><a href="#">备案号示例</a></li>
      </ul>
    </div>
  </div>
</footer>`;
}

const PAGES = [
  ['index.html', 'home.html', '商城首页', 'home', '/index.html'],
  ['list/index.html', 'list.html', '全部商品', 'list', '/list/index.html'],
  ['product/index.html', 'product.html', '商品详情', 'product', '/list/index.html'],
  ['cart/index.html', 'cart.html', '购物车', 'cart', '/cart/index.html'],
  ['order/index.html', 'order.html', '订单详情', 'order', '/order/index.html'],
  ['seckill/index.html', 'seckill.html', '限时秒杀', 'seckill', '/seckill/index.html'],
  ['seckill/detail.html', 'seckill-detail.html', '秒杀详情', 'seckill', '/seckill/index.html'],
  ['login/index.html', 'login.html', '会员登录', 'login', '/login/index.html'],
  ['page/newarrival/xpzx.html', 'newarrival.html', '新品', 'newarrival', '/page/newarrival/xpzx.html'],
  ['page/xs/jyth.html', 'education.html', '教育特惠', 'education', '/page/xs/jyth.html'],
];

/**
 * 每页需要额外加载的脚本（相对 assets/）。
 * 共享脚本始终包含：md5 → api → shop-ui → site。
 */
const PAGE_SCRIPTS = {
  home: ['pages/home.js'],
  list: ['pages/list.js'],
  product: ['pages/product.js'],
  cart: ['pages/cart.js'],
  order: ['pages/order.js'],
  seckill: ['pages/seckill.js'],
  login: ['pages/login.js'],
  newarrival: ['pages/newarrival.js'],
  education: ['pages/education.js'],
};

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'src/assets'), join(dist, 'assets'), { recursive: true });

function writePage({ out, fragment, title, active, canonical }) {
  const depth = out.split('/').length - 1;
  const assetBase = '../'.repeat(depth) + 'assets/';
  const body = readFileSync(join(root, 'src/pages', fragment), 'utf8')
    .split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const extra = (PAGE_SCRIPTS[active] || [])
    .map((s) => `<script src="${assetBase}${s}" defer></script>`)
    .join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · NOVA 商城</title>
<meta name="description" content="NOVA 商城前台，商品与订单数据来自本地微服务后端。">
<link rel="icon" href="${assetBase}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${assetBase}site.css">
<link rel="canonical" href="${canonical}">
</head>
<body class="page--${active || 'home'}">
${header(active, assetBase)}
<main id="main">
${body}
</main>
${footer(assetBase)}
<script src="${assetBase}md5.js" defer></script>
<script src="${assetBase}api.js" defer></script>
<script src="${assetBase}shop-ui.js" defer></script>
<script src="${assetBase}site.js" defer></script>
${extra}
</body>
</html>`;
  mkdirSync(dirname(join(dist, out)), { recursive: true });
  writeFileSync(join(dist, out), html);
  console.log('wrote', out);
}

for (const [out, fragment, title, active, canonical] of PAGES) {
  writePage({ out, fragment, title, active, canonical });
}
