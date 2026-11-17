// 浏览器端冒烟：每个页面在真实 Chromium 里打开，收集 console 错误/失败请求，
// 并断言关键数据区确实被渲染（而不是空壳）。
//
// 用法（需先在临时目录装好 playwright）：
//   node e2e-check.mjs
// 只做只读访问，不提交订单、不改购物车。
import { chromium } from 'playwright';

const BASE = process.env.SHOP_BASE || 'http://localhost:18004';
const GATEWAY = 'http://localhost:8081';

const PAGES = [
  { path: '/index.html', name: '首页', must: ['#catRail', '.shelf'] },
  { path: '/list/index.html', name: '列表', must: ['#productGrid', '#listCount'] },
  { path: '/seckill/index.html', name: '秒杀', must: ['.seckill-grid, #seckillGrid, .sk-card'] },
  { path: '/page/newarrival/xpzx.html', name: '新品', must: ['#naRows, #rows'] },
  { path: '/page/xs/jyth.html', name: '教育', must: ['#eduGoods'] },
  { path: '/login/index.html', name: '登录', must: ['.acct__card'] },
];

const browser = await chromium.launch();
let failures = 0;

for (const page of PAGES) {
  const ctx = await browser.newContext();
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  tab.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  tab.on('requestfailed', (r) => {
    // 图片 404 单独看，不算致命
    if (!/\.(svg|jpeg|png)\b/.test(r.url())) errors.push('reqfail: ' + r.url());
  });

  await tab.goto(BASE + page.path, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => {
    errors.push('goto: ' + e.message);
  });
  await tab.waitForTimeout(1500);

  const stats = await tab.evaluate((sels) => {
    const out = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      out[sel] = el ? el.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : null;
    }
    out.__cardCount = document.querySelectorAll('.card, .sk-card').length;
    // 高亮标签被转义后会把 <font color='red'> 文字直接画在页面上，必须当断言拦下。
    out.__rawFontTag = /<font color/.test(document.body.innerText);
    out.__markCount = document.querySelectorAll('mark.hl').length;
    return out;
  }, page.must);

  const missing = page.must.filter((s) => stats[s] === null);
  if (stats.__rawFontTag) errors.push('页面上出现未高亮化的 <font color> 字面量');
  const ok = missing.length === 0 && errors.length === 0;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${page.name.padEnd(4)} ${page.path}`);
  console.log(`     cards=${stats.__cardCount} marks=${stats.__markCount} ${JSON.stringify(Object.fromEntries(Object.entries(stats).filter(([k]) => !k.startsWith('__'))))}`);
  if (missing.length) console.log('     missing:', missing.join(', '));
  if (errors.length) console.log('     errors:\n       ' + errors.slice(0, 6).join('\n       '));
  await ctx.close();
}

// 单独验证跨域登录 + 购物车（真实 cookie/token 链路）
{
  const ctx = await browser.newContext();
  const tab = await ctx.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(BASE + '/login/index.html', { waitUntil: 'networkidle' });
  const result = await tab.evaluate(async (gw) => {
    const r = await fetch(gw + '/user/user/login/do_login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      credentials: 'include',
      body: new URLSearchParams({ mobile: '12345678901', password: window.ShopApi.loginPassword('123456') }).toString(),
    });
    const body = await r.json();
    const token = r.headers.get('zhuawa-shop-token');
    const cart = await fetch(gw + '/order/cart/list', {
      headers: { 'zhuawa-shop-token': token || '' },
      credentials: 'include',
    }).then((x) => x.json());
    return { loginCode: body.code, hasToken: !!token, cartCode: cart.code, cartLen: (cart.data || []).length };
  }, GATEWAY).catch((e) => ({ err: e.message }));

  const ok = result.loginCode === 0 && result.hasToken && result.cartCode === 0 && !errors.length;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} 登录+购物车跨域 ${JSON.stringify(result)} ${errors.join('; ')}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
