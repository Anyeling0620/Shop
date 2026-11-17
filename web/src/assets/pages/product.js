// 商品详情页：/product/index.html?id=<goodsId>。全部数据来自真实后端。
(function () {
  'use strict';

  var Api = window.ShopApi;
  var UI = window.ShopUI;

  var goods = null;       // 详情对象；id 全程保留字符串
  var qty = 1;
  var maxQty = 99;
  var busy = false;

  function $(id) { return document.getElementById(id); }

  /** 商品不存在 / 加载失败：整块换成空态，页面不白屏。 */
  function showEmpty(message) {
    var root = $('pdpRoot');
    if (!root) return;
    root.innerHTML = '<section class="wrap">' + UI.emptyState(message, '/list/index.html', '返回全部商品') + '</section>';
  }

  /** 搜索接口的高亮标签转成纯文本，卡片自己负责转义。 */
  function plain(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
  }

  /** 空串 / 非法 JSON 一律当没有。 */
  function parseJsonObject(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function specRows(obj) {
    return Object.keys(obj).map(function (k) {
      return '<tr><th scope="row">' + UI.escapeHtml(k) + '</th><td>' +
        UI.escapeHtml(obj[k]) + '</td></tr>';
    }).join('');
  }

  function renderSpecs() {
    var specs = parseJsonObject(goods.specsJson);
    var params = parseJsonObject(goods.paramJson);
    var hasSpecs = specs && Object.keys(specs).length;
    var hasParams = params && Object.keys(params).length;
    var html = '';
    if (!hasSpecs && !hasParams) {
      html = '<tr><td colspan="2">暂无规格信息</td></tr>';
    } else {
      if (hasSpecs && hasParams) html += '<tr><th colspan="2">规格参数</th></tr>';
      if (hasSpecs) html += specRows(specs);
      if (hasParams) {
        if (hasSpecs) html += '<tr><th colspan="2">商品参数</th></tr>';
        html += specRows(params);
      }
    }
    $('pdpSpecRows').innerHTML = html;
  }

  function renderBreadcrumb() {
    if (!goods.categoryName) return;
    var crumbs = $('pdpCrumbs');
    if (!crumbs) return;
    var span = document.createElement('span');
    span.textContent = '/';
    var a = document.createElement('a');
    a.href = '/list/index.html?category=' + encodeURIComponent(goods.categoryName);
    a.textContent = goods.categoryName;
    crumbs.appendChild(span);
    crumbs.appendChild(a);
  }

  function renderDetail() {
    var info = UI.splitName(goods.name);
    var img = UI.goodsImage(goods.image);
    var stock = Number(goods.stock) || 0;
    var soldOut = stock <= 0;

    $('pdpMain').src = img;
    $('pdpMain').alt = info.title;
    $('pdpName').textContent = info.title;
    $('pdpSpec').textContent = info.specs.join(' · ');
    $('pdpPrice').textContent = UI.yuan(goods.price);
    $('pdpHighlights').innerHTML = (info.specs.length ? info.specs : [goods.categoryName, goods.brandName])
      .filter(Boolean)
      .map(function (s) { return '<li>' + UI.escapeHtml(s) + '</li>'; })
      .join('');
    $('pdpStock').textContent = soldOut ? '暂时缺货' : '现货 · 预计 24 小时内发出 · 全国联保';
    $('pdpFullName').textContent = goods.name;
    $('pdpMeta').textContent = '品牌：' + (goods.brandName || '—') + '　类目：' + (goods.categoryName || '—');

    maxQty = soldOut ? 0 : Math.min(99, stock);
    qty = 1;
    $('pdpQty').textContent = qty;
    $('addCart').disabled = soldOut;
    $('buyNow').disabled = soldOut;
    if (soldOut) $('addCart').textContent = '暂时缺货';
    Array.prototype.forEach.call(document.querySelectorAll('.pdp__buy .qty button'), function (b) {
      b.disabled = soldOut;
    });

    $('pdpSkeleton').hidden = true;
    $('pdpBody').hidden = false;
    $('pdpTabs').hidden = false;

    renderBreadcrumb();
    renderSpecs();
    bindTabs();
    bindQty();
    bindBuy();
  }

  function bindTabs() {
    var bar = document.querySelector('.pdp__tabbar');
    if (!bar || bar._bound) return;
    bar._bound = true;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      var name = btn.getAttribute('data-tab');
      Array.prototype.forEach.call(bar.querySelectorAll('button[data-tab]'), function (b) {
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.pdp__pane'), function (pane) {
        pane.hidden = pane.getAttribute('data-pane') !== name;
      });
    });
  }

  function bindQty() {
    var box = document.querySelector('.pdp__buy .qty');
    if (!box || box._bound) return;
    box._bound = true;
    function paint() { $('pdpQty').textContent = qty; }
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-qty]');
      if (!btn || maxQty <= 0) return;
      var step = Number(btn.getAttribute('data-qty')) || 0;
      qty = Math.max(1, Math.min(maxQty, qty + step));
      paint();
    });
  }

  /** 覆盖式 /cart/set：先读现有数量再加。 */
  function addToCart(goCart) {
    if (busy || !goods) return;
    if (!UI.requireLogin()) return;
    busy = true;
    var goodsId = String(goods.id);
    Api.getCart().then(function (items) {
      var existing = 0;
      (items || []).forEach(function (it) {
        if (String(it.goodsId) === goodsId) existing += Number(it.count) || 0;
      });
      return Api.setCartCount(goodsId, existing + qty);
    }).then(function () {
      busy = false;
      UI.toast('已加入购物车');
      UI.paintCartCount();
      if (goCart) location.href = '/cart/index.html';
    }).catch(function (err) {
      busy = false;
      if (err && err.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      UI.toast((err && err.message) || '加入购物车失败');
    });
  }

  function bindBuy() {
    if ($('addCart')._bound) return;
    $('addCart')._bound = true;
    $('addCart').addEventListener('click', function () { addToCart(false); });
    $('buyNow').addEventListener('click', function () { addToCart(true); });
  }

  function renderRelated() {
    var grid = $('pdpRelated');
    var section = $('pdpRelatedSection');
    if (!grid) return;
    grid.innerHTML = UI.skeletonCards(4);
    Api.searchGoods({ category: goods.categoryName }, 1, 8).then(function (res) {
      var list = (res && res.goodsEsInfoList) || [];
      var selfId = String(goods.id);
      list = list.filter(function (g) { return String(g.id) !== selfId; }).slice(0, 4);
      if (!list.length) {
        if (section) section.hidden = true;
        return;
      }
      if (section) section.hidden = false;
      grid.innerHTML = list.map(function (g) {
        // 搜索接口会在类目/品牌里塞 <font color='red'> 高亮；卡片会转义，先剥成纯文本。
        return '<li>' + UI.card({
          id: g.id, name: plain(g.name), image: g.image, price: g.price,
          brandName: plain(g.brandName), categoryName: plain(g.categoryName),
        }) + '</li>';
      }).join('');
    }).catch(function (err) {
      console.warn('[product] related', (err && err.message) || err);
      if (section) section.hidden = true;
    });
  }

  function load() {
    var id = new URLSearchParams(location.search).get('id');
    // 雪花 id 超过 Number.MAX_SAFE_INTEGER，全程字符串。
    id = id ? String(id).trim() : '';
    if (!id) {
      showEmpty('缺少商品编号');
      return;
    }
    Api.getGoods(id).then(function (data) {
      if (!data) {
        showEmpty('商品不存在或已下架');
        return;
      }
      goods = data;
      renderDetail();
      renderRelated();
    }).catch(function (err) {
      if (err && err.code === 404) {
        showEmpty('商品不存在或已下架');
        return;
      }
      console.warn('[product] detail', (err && err.message) || err);
      showEmpty('商品加载失败，请稍后重试');
    });
  }

  UI.boot(load);
})();
