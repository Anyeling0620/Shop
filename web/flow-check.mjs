// 交互链路冒烟：详情页渲染、加入购物车、登录态头部、结算下单。
// 用法：node flow-check.mjs（需先在临时目录装好 playwright）
import { chromium } from 'playwright';

const BASE = process.env.SHOP_BASE || 'http://localhost:18004';
const GOODS_ID = '1432247757988474880';
let failures = 0;

function report(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail || ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const tab = await ctx.newPage();
const errors = [];
tab.on('pageerror', (e) => errors.push(e.message));
tab.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 1. 未登录打开详情页
await tab.goto(`${BASE}/product/index.html?id=${GOODS_ID}`, { waitUntil: 'networkidle' });
await tab.waitForTimeout(1200);
const detail = await tab.evaluate(() => ({
  title: document.querySelector('.pdp__info h1')?.textContent.trim(),
  price: document.querySelector('#pdpPrice')?.textContent.trim(),
  specs: document.querySelectorAll('.pdp__specs tr').length,
  related: document.querySelectorAll('.pdp__related .card').length,
  bodyVisible: !document.querySelector('#pdpBody')?.hidden,
}));
report('详情页渲染', !!detail.title && detail.price && detail.bodyVisible, JSON.stringify(detail));

// 2. 缺 id 走空态，不白屏
await tab.goto(`${BASE}/product/index.html`, { waitUntil: 'networkidle' });
await tab.waitForTimeout(800);
const emptyOk = await tab.evaluate(() => !!document.querySelector('.empty-state') && document.body.innerText.length > 40);
report('详情页缺 id 空态', emptyOk);

// 3. 登录页真实登录
await tab.goto(`${BASE}/login/index.html`, { waitUntil: 'networkidle' });
await tab.fill("#phone", '12345678901');
await tab.fill("#password", '123456');
await tab.click('#loginGo');
await tab.waitForTimeout(2500);
const loggedIn = await tab.evaluate(() => ({ token: !!window.ShopApi.getToken(), url: location.pathname }));
report('登录成功并持有 token', loggedIn.token, JSON.stringify(loggedIn));

// 4. 登录态头部与加购
await tab.goto(`${BASE}/product/index.html?id=${GOODS_ID}`, { waitUntil: 'networkidle' });
await tab.waitForTimeout(1200);
const accountVisible = await tab.evaluate(() => !document.getElementById('navAccount')?.hidden);
report('头部显示登录态', accountVisible);

await tab.click('#addCart');
await tab.waitForTimeout(1800);
const cartCount = await tab.evaluate(() => document.getElementById('cartCount')?.textContent);
report('加入购物车后角标更新', Number(cartCount) > 0, `cartCount=${cartCount}`);

// 5. 购物车页渲染真实行
await tab.goto(`${BASE}/cart/index.html`, { waitUntil: 'networkidle' });
await tab.waitForTimeout(1500);
const cartRows = await tab.evaluate(() => ({
  rows: document.querySelectorAll('#cartRows tr').length,
  total: document.querySelector('#cartTotal')?.textContent.trim(),
  emptyHidden: document.getElementById('cartEmpty')?.hidden,
}));
report('购物车渲染真实数据', cartRows.rows > 0 && cartRows.emptyHidden, JSON.stringify(cartRows));

// 6. 去结算 -> 订单确认页 -> 提交
await tab.click('#checkout');
await tab.waitForTimeout(2000);
const onOrderPage = tab.url().includes('/order/index.html');
report('结算跳转订单页', onOrderPage, tab.url());

if (onOrderPage) {
  await tab.fill('#receiveAddress', '北京市海淀区测试路 1 号');
  await tab.waitForTimeout(300);
  // 页面头部搜索表单也有 type=submit 按钮，且排在前；必须用 id 精确定位
  const submit = await tab.$('#submitOrder');
  if (submit) {
    await submit.click();
    await tab.waitForTimeout(3000);
  }
  const orderState = await tab.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160),
    hasOrderId: /orderId=/.test(location.href),
  }));
  report('提交订单成功', orderState.hasOrderId, JSON.stringify(orderState));
}

if (errors.length) {
  failures += 1;
  console.log('页面错误:\n  ' + errors.slice(0, 8).join('\n  '));
}

await browser.close();
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
