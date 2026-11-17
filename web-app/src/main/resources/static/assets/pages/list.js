// 全部商品列表：ES 搜索 + 分类/价格筛选 + 排序 + 分页，状态全部同步到 URL。
(function () {
  'use strict';

  var Api = window.ShopApi;
  var UI = window.ShopUI;
  var SIZE = 24;

  var qs = new URLSearchParams(location.search);
  var state = {
    q: qs.get('q') || '',
    category: qs.get('category') || '',
    price: qs.get('price') || '',
    sort: qs.get('sort') || 'default',
    page: Math.max(1, parseInt(qs.get('page'), 10) || 1),
  };
  // 分类按钮来自搜索结果聚合；筛选后聚合会缩小，这里做并集，避免按钮越点越少。
  var knownCats = [];
  var seq = 0;

  var grid = document.getElementById('productGrid');
  var empty = document.getElementById('listEmpty');
  var countEl = document.getElementById('listCount');
  var pager = document.getElementById('listPager');
  var sortEl = document.getElementById('sortBy');
  var catBox = document.getElementById('catFilter');
  var priceBox = document.getElementById('priceFilter');

  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.price) p.set('price', state.price);
    if (state.sort !== 'default') p.set('sort', state.sort);
    if (state.page > 1) p.set('page', String(state.page));
    var next = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.replaceState(null, '', next);
  }

  function priceRange(value) {
    if (!value) return { minPrice: 0, maxPrice: 0 };
    var parts = value.split('-');
    return {
      minPrice: (parseInt(parts[0], 10) || 0) * 100,
      maxPrice: (parseInt(parts[1], 10) || 0) * 100,
    };
  }

  function renderCats() {
    if (!catBox) return;
    catBox.innerHTML = '<li><button type="button" data-cat="" aria-pressed="' +
      (state.category ? 'false' : 'true') + '">全部</button></li>' +
      knownCats.map(function (name) {
        return '<li><button type="button" data-cat="' + UI.escapeHtml(name) + '" aria-pressed="' +
          (state.category === name ? 'true' : 'false') + '">' + UI.escapeHtml(name) + '</button></li>';
      }).join('');
  }

  function renderPrices() {
    if (!priceBox) return;
    Array.prototype.forEach.call(priceBox.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-price') === state.price ? 'true' : 'false');
    });
  }

  function pageLink(p, label, current) {
    return '<a href="#" data-page="' + p + '"' + (current ? ' aria-current="true"' : '') + '>' + label + '</a>';
  }

  function renderPager(totalPages) {
    if (!pager) return;
    if (totalPages <= 1) { pager.innerHTML = ''; return; }
    var cur = state.page;
    var end = Math.min(totalPages, Math.max(1, cur - 3) + 6);
    var start = Math.max(1, end - 6);
    var html = cur > 1 ? pageLink(cur - 1, '‹') : '';
    for (var i = start; i <= end; i++) html += pageLink(i, String(i), i === cur);
    html += cur < totalPages ? pageLink(cur + 1, '›') : '';
    pager.innerHTML = html;
  }

  function render(res) {
    var goods = (res && res.goodsEsInfoList) || [];
    var total = Number(res && res.total) || 0;
    var totalPages = Number(res && res.totalPages) || 0;
    if (countEl) countEl.textContent = '共 ' + total + ' 件商品';

    var cats = (res && res.categoryList) || [];
    var changed = false;
    cats.forEach(function (name) {
      if (name && knownCats.indexOf(name) < 0) { knownCats.push(name); changed = true; }
    });
    if (state.category && knownCats.indexOf(state.category) < 0) {
      knownCats.unshift(state.category);
      changed = true;
    }
    if (changed || !catBox.children.length) renderCats();

    if (!goods.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      renderPager(0);
      return;
    }
    grid.innerHTML = goods.map(function (g) {
      return '<li>' + UI.card(g, { nameHtml: UI.highlight(UI.splitName(g.name).title) }) + '</li>';
    }).join('');
    empty.hidden = true;
    renderPager(totalPages);
  }

  function load() {
    var mine = ++seq;
    grid.innerHTML = UI.skeletonCards(8);
    empty.hidden = true;
    if (pager) pager.innerHTML = '';
    var range = priceRange(state.price);
    var params = {
      key: state.q,
      category: state.category,
      minPrice: range.minPrice,
      maxPrice: range.maxPrice,
    };
    if (state.sort === 'asc' || state.sort === 'desc') {
      params.orderField = 'price';
      params.orderType = state.sort;
    }
    Api.searchGoods(params, state.page, SIZE).then(function (res) {
      if (mine !== seq) return; // 快速切换筛选时丢掉过期响应
      render(res);
    }).catch(function (err) {
      if (mine !== seq) return;
      console.warn('[list]', (err && err.message) || err);
      if (countEl) countEl.textContent = '共 0 件商品';
      grid.innerHTML = '<li>' + UI.emptyState('商品加载失败，请稍后重试', '/index.html', '回首页') + '</li>';
      empty.hidden = true;
      renderPager(0);
    });
  }

  function apply(patch) {
    Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
    syncUrl();
    load();
  }

  if (catBox) {
    catBox.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cat]');
      if (!b) return;
      apply({ category: b.getAttribute('data-cat'), page: 1 });
      renderCats();
    });
  }

  if (priceBox) {
    priceBox.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-price]');
      if (!b) return;
      apply({ price: b.getAttribute('data-price'), page: 1 });
      renderPrices();
    });
  }

  if (sortEl) {
    sortEl.value = state.sort;
    sortEl.addEventListener('change', function () {
      apply({ sort: sortEl.value, page: 1 });
    });
  }

  if (pager) {
    pager.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-page]');
      if (!a) return;
      e.preventDefault();
      apply({ page: parseInt(a.getAttribute('data-page'), 10) || 1 });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  UI.boot(function () {
    var input = document.getElementById('q');
    if (input && state.q) input.value = state.q;
    renderPrices();
    syncUrl();
    load();
  });
})();
