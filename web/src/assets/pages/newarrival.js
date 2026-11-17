// 新品页：筛选条、最近上架 3 个大卡、分页列表，全部来自真实 search 接口。
(function () {
  'use strict';

  var Api = window.ShopApi;
  var UI = window.ShopUI;

  var state = { category: '', page: 1, totalPages: 1, loading: false };

  function catsBox() { return document.getElementById('naCats'); }
  function rowsBox() { return document.getElementById('naRows'); }
  function featureBox() { return document.getElementById('naFeature'); }
  function statusBox() { return document.getElementById('naStatus'); }
  function moreBtn() { return document.getElementById('naMore'); }

  function setStatus(text) {
    var box = statusBox();
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  }

  /** 分类按钮来自 searchGoods 的聚合字段 categoryList（纯字符串）。 */
  function paintCats(categories) {
    var box = catsBox();
    if (!box) return;
    var html = '<li><a href="#rows" data-cat="" aria-current="true">全部</a></li>';
    html += (categories || []).map(function (name) {
      return '<li><a href="#rows" data-cat="' + UI.escapeHtml(name) + '">' + UI.escapeHtml(name) + '</a></li>';
    }).join('');
    box.innerHTML = html;
  }

  function paintFeature(list) {
    var box = featureBox();
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<li>' + UI.emptyState('暂无新品', '/list/index.html', '去全部商品') + '</li>';
      return;
    }
    box.innerHTML = list.slice(0, 3).map(function (g) {
      var info = UI.splitName(g.name);
      var specs = info.specs.slice(0, 4).join(' · ') || g.categoryName || '';
      return '<li><a class="na-big" href="/product/index.html?id=' + encodeURIComponent(String(g.id)) + '">' +
        '<div class="na-big__media"><img src="' + UI.goodsImage(g.image) + '" alt="" loading="lazy"></div>' +
        '<h3>' + UI.escapeHtml(info.title) + '</h3>' +
        '<p>' + UI.escapeHtml((g.brandName ? g.brandName + ' · ' : '') + specs) + '</p>' +
        '<b>' + UI.yuan(g.price) + '</b></a></li>';
    }).join('');
  }

  function renderRows(list, append) {
    var box = rowsBox();
    if (!box) return;
    var html = (list || []).map(function (g) { return '<li>' + UI.card(g) + '</li>'; }).join('');
    if (append) box.insertAdjacentHTML('beforeend', html);
    else box.innerHTML = html;
  }

  function load(page, append) {
    if (state.loading) return;
    state.loading = true;
    setStatus('');
    if (!append) {
      var box = rowsBox();
      if (box) box.innerHTML = UI.skeletonCards(8);
    }
    Api.searchGoods({ category: state.category }, page, 24)
      .then(function (data) {
        var list = (data && data.goodsEsInfoList) || [];
        state.page = (data && data.page) || page;
        state.totalPages = (data && data.totalPages) || 1;
        renderRows(list, append);
        if (!list.length && !append) {
          setStatus('没有符合条件的商品，换个分类试试。');
        }
        if (moreBtn()) moreBtn().hidden = state.page >= state.totalPages;
      })
      .catch(function () {
        setStatus('商品加载失败，请稍后重试。');
        if (!append) renderRows([], false);
        if (moreBtn()) moreBtn().hidden = true;
      })
      .finally(function () { state.loading = false; });
  }

  function bindCats() {
    var box = catsBox();
    if (!box) return;
    box.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-cat]');
      if (!a) return;
      e.preventDefault();
      var cat = a.getAttribute('data-cat') || '';
      if (cat === state.category) return;
      state.category = cat;
      state.page = 1;
      Array.prototype.forEach.call(box.querySelectorAll('a[data-cat]'), function (x) {
        if (x === a) x.setAttribute('aria-current', 'true');
        else x.removeAttribute('aria-current');
      });
      load(1, false);
    });
  }

  function bindMore() {
    var btn = moreBtn();
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (state.page >= state.totalPages) return;
      load(state.page + 1, true);
    });
  }

  UI.boot(function () {
    bindCats();
    bindMore();

    // 一次取聚合：分类列表 + 首屏商品共用同一接口，分类取第 1 页 1 条即可。
    Api.safe(Api.searchGoods({}, 1, 1), null).then(function (data) {
      // 用户已点过分类就不再重画，避免把 aria-current 冲掉
      if (data && data.categoryList && !state.category) paintCats(data.categoryList);
    });

    Api.safe(Api.searchGoods({ orderField: 'updateTime', orderType: 'desc' }, 1, 3), null)
      .then(function (data) {
        paintFeature(data && data.goodsEsInfoList);
      });

    load(1, false);
  });
})();
