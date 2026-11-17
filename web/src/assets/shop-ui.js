// 全站共享 UI：头部登录态、购物车角标、商品卡片渲染、价格/图片格式化、通用页面骨架。
// 每个页面在 site.js 之前加载，页面脚本再基于 window.ShopUI 组装具体内容。
(function () {
  'use strict';

  var Api = window.ShopApi;

  /* ------------------------------------------------------------------ */
  /* 格式化                                                              */
  /* ------------------------------------------------------------------ */

  /** 后端价格单位是分。 */
  function yuan(cents) {
    var n = Number(cents);
    if (!isFinite(n)) n = 0;
    return '￥' + (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** 秒杀接口的 price 是 BigDecimal（元），不能再除 100。 */
  function yuanDirect(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return '￥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** 秒杀列表里价格常常是 0.01 这类占位值，展示成整数更清爽。 */
  function yuanShort(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 0;
    return '￥' + Number(n.toFixed(2)).toLocaleString('zh-CN');
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  /** 商品图 /img/xxx 由 web-app 静态目录提供。 */
  function goodsImage(image) {
    var raw = String(image || '').trim();
    if (!raw) return '/assets/p-1.svg';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.indexOf('/img/') === 0) {
      return (window.SHOP_IMG_BASE || 'http://localhost:18004') + raw;
    }
    return raw;
  }

  /** 后端搜索高亮写 <font color='red'>，只放行这个标签，其余转义，避免 XSS。 */
  function highlight(input) {
    var raw = String(input == null ? '' : input);
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;font color='red'&gt;/g, '<mark class="hl">')
      .replace(/&lt;\/font&gt;/g, '</mark>');
  }

  /** 商品名里的 "品牌 + 规格;规格" 拆成标题和副标题，列表里更好读。 */
  function splitName(name) {
    var parts = String(name || '').split(';');
    return { title: parts[0] || name || '', specs: parts.slice(1).filter(Boolean) };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ------------------------------------------------------------------ */
  /* 商品卡片                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 统一卡片。goods 可以是 /goods/get 的 Goods，也可以是 ES 的 GoodsEsInfo。
   * 列表页卡片用 data-id 记录真实商品 id，点击进 /product/index.html?id=xxx。
   */
  function card(goods, opts) {
    opts = opts || {};
    var g = goods || {};
    var info = splitName(g.name);
    var href = '/product/index.html?id=' + encodeURIComponent(String(g.id));
    var sub = opts.spec || info.specs.slice(0, 3).join(' · ') || (g.categoryName || '');
    var price = opts.priceText || yuan(g.price);
    var listPrice = opts.listPriceText || '';
    var name = opts.nameHtml || escapeHtml(info.title);
    return '<a class="card" href="' + href + '" data-id="' + escapeHtml(String(g.id)) + '">' +
      '<div class="card__media"><img src="' + goodsImage(g.image) + '" alt="" loading="lazy" width="200" height="140"></div>' +
      '<h3 class="card__title">' + name + '</h3>' +
      '<p class="card__spec">' + escapeHtml(sub) + '</p>' +
      (g.brandName || g.categoryName
        ? '<p class="card__tags"><span class="chip">' + escapeHtml(g.brandName || '') + '</span>' +
          '<span class="chip">' + escapeHtml(g.categoryName || '') + '</span></p>'
        : '') +
      '<p class="card__price"><b>' + price + '</b>' + listPrice + '</p>' +
      '</a>';
  }

  function skeletonCards(n, cols) {
    var one = '<li><div class="card card--skeleton"><div class="card__media"></div>' +
      '<p class="sk-line"></p><p class="sk-line sk-line--short"></p></div></li>';
    return new Array(n || 4).fill(one).join('');
  }

  function emptyState(message, actionHref, actionText) {
    return '<div class="empty-state"><p>' + escapeHtml(message) + '</p>' +
      (actionHref ? '<a class="btn" href="' + actionHref + '">' + escapeHtml(actionText || '去逛逛') + '</a>' : '') +
      '</div>';
  }

  function toast(message) {
    var box = document.getElementById('shopToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'shopToast';
      box.className = 'toast';
      box.setAttribute('role', 'status');
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('is-on');
    clearTimeout(box._timer);
    box._timer = setTimeout(function () { box.classList.remove('is-on'); }, 2200);
  }

  /* ------------------------------------------------------------------ */
  /* 头部：登录态 + 购物车角标                                            */
  /* ------------------------------------------------------------------ */

  function nextParam() {
    var n = new URLSearchParams(location.search).get('next');
    // 只接受站内路径，'//host' 会跳出站点
    return n && n.charAt(0) === '/' && n.charAt(1) !== '/' ? n : location.pathname + location.search;
  }

  function loginHref() {
    return '/login/index.html?next=' + encodeURIComponent(nextParam());
  }

  function requireLogin() {
    if (Api.isLoggedIn()) return true;
    location.href = loginHref();
    return false;
  }

  function paintAccount() {
    var login = document.getElementById('navLogin');
    var slot = document.getElementById('navAccount');
    if (!login || !slot) return;
    if (!Api.isLoggedIn()) {
      login.hidden = false;
      login.querySelector('a').href = loginHref();
      slot.hidden = true;
      slot.innerHTML = '';
      return;
    }
    Api.getCurrentUser().then(function (user) {
      login.hidden = true;
      slot.hidden = false;
      var label = user && (user.nickname || user.mobile) ? (user.nickname || user.mobile) : '我的账号';
      slot.innerHTML = '<span class="utility__who">' + escapeHtml(label) + '</span>' +
        '<button type="button" class="utility__out" id="navSignOut">退出</button>';
      document.getElementById('navSignOut').addEventListener('click', function () {
        Api.logout();
        location.reload();
      });
    }).catch(function () {
      // token 过期：按未登录展示，不要把坏 token 一直带着
      Api.logout();
      paintAccount();
    });
  }

  /** 购物车角标：以真实 /cart/list 为准，未登录不显示。 */
  function paintCartCount() {
    var badge = document.getElementById('cartCount');
    if (!badge) return;
    if (!Api.isLoggedIn()) {
      badge.hidden = true;
      return;
    }
    Api.getCart().then(function (items) {
      var n = 0;
      (items || []).forEach(function (i) { n += Number(i.count) || 0; });
      badge.textContent = n;
      badge.hidden = n === 0;
    }).catch(function () { badge.hidden = true; });
  }

  function initChrome() {
    paintAccount();
    paintCartCount();
  }

  /* ------------------------------------------------------------------ */
  /* 分类轨道（首页/列表共用）                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 首页左侧分类轨道：只取真实顶级类目（parentId=0），hover 展示二级。
   * 真实父类目有 21 个，这里取前 8 个避免撑破首屏。
   */
  function renderCategoryRail(list, limit) {
    var tops = (list || []).slice(0, limit || 8);
    if (!tops.length) return '';
    return tops.map(function (c) {
      return '<li data-cat-id="' + c.id + '"><a href="/list/index.html?category=' +
        encodeURIComponent(c.name) + '"><span>' + escapeHtml(c.name) + '</span>' +
        '<small id="rail-sub-' + c.id + '">查看全部 →</small></a>' +
        '<div class="catrail__fly" data-sub="' + c.id + '"></div></li>';
    }).join('');
  }

  /** 二级类目懒加载：hover 时才请求，避免首屏 21×N 次调用。 */
  function bindCategoryRail() {
    var rail = document.querySelector('.catrail ul');
    if (!rail) return;
    rail.addEventListener('mouseover', function (e) {
      var li = e.target.closest('li[data-cat-id]');
      if (!li || li._loaded) return;
      li._loaded = true;
      var box = li.querySelector('.catrail__fly');
      var catId = li.getAttribute('data-cat-id');
      Api.getCategories(catId).then(function (children) {
        if (!children || !children.length) {
          box.innerHTML = '<a href="/list/index.html?category=' + encodeURIComponent(li.querySelector('span').textContent) + '">全部商品</a>';
          return;
        }
        box.innerHTML = children.slice(0, 8).map(function (c) {
          return '<a href="/list/index.html?category=' + encodeURIComponent(c.name) + '">' + escapeHtml(c.name) + '</a>';
        }).join('');
      }).catch(function () { box.innerHTML = ''; });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 页面通用                                                            */
  /* ------------------------------------------------------------------ */

  /** 页面初始化统一入口：先画头部，再跑页面自己的逻辑。 */
  function boot(pageInit) {
    function run() {
      initChrome();
      bindCategoryRail();
      if (pageInit) pageInit();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  window.ShopUI = {
    boot: boot,
    yuan: yuan,
    yuanDirect: yuanDirect,
    yuanShort: yuanShort,
    formatDate: formatDate,
    goodsImage: goodsImage,
    highlight: highlight,
    splitName: splitName,
    escapeHtml: escapeHtml,
    card: card,
    skeletonCards: skeletonCards,
    emptyState: emptyState,
    toast: toast,
    requireLogin: requireLogin,
    loginHref: loginHref,
    nextParam: nextParam,
    renderCategoryRail: renderCategoryRail,
    paintCartCount: paintCartCount,
    paintAccount: paintAccount,
  };
})();
