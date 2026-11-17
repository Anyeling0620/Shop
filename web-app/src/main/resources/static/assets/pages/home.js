// 首页数据区：分类轨道、秒杀区、按顶级类目分组的货架。
// 骨架里的 hero / 快捷入口 / 促销位 / 服务承诺是纯展示，这里不碰。
(function () {
  'use strict';

  var Api = window.ShopApi;
  var UI = window.ShopUI;

  /* ------------------------------------------------------------------ */
  /* 分类                                                                */
  /* ------------------------------------------------------------------ */

  function loadCategories(parentId) {
    return Api.getCategories(parentId);
  }

  function initRail() {
    var box = document.getElementById('catRail');
    if (!box) return;
    Api.safe(loadCategories(0), []).then(function (list) {
      box.innerHTML = UI.renderCategoryRail(list, 8) ||
        '<li><a href="/list/index.html"><span>全部商品</span></a></li>';
    });
  }

  /* ------------------------------------------------------------------ */
  /* 秒杀                                                                */
  /* ------------------------------------------------------------------ */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /** 进行中 → 即将开始 → 刚结束，最多 4 场；没有联查到商品的场次无法展示，跳过。 */
  function pickSessions(list) {
    var now = Date.now();
    function ts(v) { var t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
    var rows = (list || []).filter(function (s) { return s && s.goodsId != null && s.img; });
    var live = rows.filter(function (s) { return ts(s.startTime) <= now && now < ts(s.endTime); });
    var soon = rows.filter(function (s) { return ts(s.startTime) > now; });
    var done = rows.filter(function (s) { return ts(s.endTime) <= now; })
      .sort(function (a, b) { return ts(b.endTime) - ts(a.endTime); });
    return live.concat(soon.sort(function (a, b) { return ts(a.startTime) - ts(b.startTime); }), done)
      .slice(0, 4);
  }

  function cardHtml(s) {
    var href = '/seckill/detail.html?goodsId=' + encodeURIComponent(String(s.goodsId)) +
      '&sessionId=' + encodeURIComponent(String(s.sessionId == null ? 0 : s.sessionId));
    return '<a class="fcard" href="' + href + '">' +
      '<div class="fcard__media" aria-hidden="true"><img src="' + UI.goodsImage(s.img) +
      '" alt="" width="120" height="90"></div>' +
      '<p class="fcard__badge">秒杀价</p>' +
      '<p class="fcard__title">' + UI.escapeHtml(UI.splitName(s.name).title) + '</p>' +
      '<p class="fcard__price">' + UI.yuanShort(s.priceSeckill) +
      (s.price ? '<s>' + UI.yuanShort(s.price) + '</s>' : '') + '</p>' +
      '</a>';
  }

  /** 时钟跟随第一张卡片所在的场次，按 endTime 每秒递减，该场结束后推进到下一场。 */
  function startClock(sessions) {
    var h = document.getElementById('cdH');
    var m = document.getElementById('cdM');
    var s = document.getElementById('cdS');
    if (!h || !m || !s) return;
    var idx = 0;
    var end = new Date(sessions[0].endTime).getTime();
    var tick = function () {
      var left = end - Date.now();
      while (left <= 0 && idx + 1 < sessions.length) {
        idx += 1;
        end = new Date(sessions[idx].endTime).getTime();
        left = end - Date.now();
      }
      if (!isFinite(left) || left <= 0) {
        h.textContent = '00'; m.textContent = '00'; s.textContent = '00';
        clearInterval(timer);
        return;
      }
      var total = Math.floor(left / 1000);
      h.textContent = pad2(Math.floor(total / 3600));
      m.textContent = pad2(Math.floor(total % 3600 / 60));
      s.textContent = pad2(total % 60);
    };
    tick();
    var timer = setInterval(tick, 1000);
  }

  function initFlash() {
    var grid = document.querySelector('.flash__grid');
    if (!grid) return;
    var more = grid.querySelector('.flash__more');
    grid.insertAdjacentHTML('beforeend', UI.skeletonCards(4).replace(/<\/?li>/g, ''));

    Api.safe(Api.getSeckillList(), []).then(function (list) {
      var sessions = pickSessions(list);
      grid.querySelectorAll('.card--skeleton').forEach(function (n) { n.remove(); });
      if (!sessions.length) return; // 没有可展示的场次：保留促销位，不留空壳卡片
      var html = sessions.map(cardHtml).join('');
      if (more) more.insertAdjacentHTML('beforebegin', html);
      else grid.insertAdjacentHTML('beforeend', html);
      startClock(sessions);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 货架                                                                */
  /* ------------------------------------------------------------------ */

  function shelfHtml(cat, goods) {
    var cards = goods.map(function (g) { return '<li>' + UI.card(g) + '</li>'; }).join('');
    return '<section class="shelf" aria-label="' + UI.escapeHtml(cat.name) + '">' +
      '<div class="shelf__head">' +
        '<h2 class="shelf__title">' + UI.escapeHtml(cat.name) + '</h2>' +
        '<a class="shelf__all" href="/list/index.html?category=' +
          encodeURIComponent(cat.name) + '">查看全部 →</a>' +
      '</div>' +
      '<ul class="shelf__grid">' + cards + '</ul>' +
      '</section>';
  }

  function initShelves() {
    var box = document.querySelector('.shelves .wrap');
    if (!box) return;
    box.innerHTML = UI.skeletonCards(4);

    // 货架按「ES 里真的有商品」的类目名分组：类目树里多数顶级类目在 ES 无货，
    // 所以先拿一次无筛选搜索的聚合结果（categoryList），取不到再退回顶级类目树。
    Promise.all([
      Api.safe(Api.searchGoods({}, 1, 1), null),
      Api.safe(loadCategories(0), []),
    ]).then(function (both) {
      var res = both[0];
      var agg = (res && res.categoryList) || [];
      var names = agg.length ? agg : (both[1] || []).map(function (c) { return c.name; });
      names = names.slice(0, 8);
      if (!names.length) {
        box.innerHTML = UI.emptyState('暂时拿不到商品分类', '/list/index.html', '去全部商品');
        return;
      }
      // 遍历到 4 个有货类目为止，搜不到商品的类目直接跳过，不留空区块。
      // shortcut: 串行请求，最多 8 次；数据量变大时改成并发分批。
      var shelves = [];
      var chain = Promise.resolve();
      names.forEach(function (name) {
        chain = chain.then(function () {
          if (shelves.length >= 4) return;
          return Api.safe(Api.searchGoods({ category: name }, 1, 8), { goodsEsInfoList: [] })
            .then(function (r) {
              var goods = (r && r.goodsEsInfoList) || [];
              if (goods.length && shelves.length < 4) {
                shelves.push(shelfHtml({ name: name }, goods));
              }
            });
        });
      });
      chain.then(function () {
        box.innerHTML = shelves.join('') ||
          UI.emptyState('暂时没有可展示的商品', '/list/index.html', '去全部商品');
      });
    });
  }

  UI.boot(function () {
    initRail();
    initFlash();
    initShelves();
  });
})();
