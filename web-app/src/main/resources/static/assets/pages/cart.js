// 购物车：真实 /order/cart/list 渲染，勾选行参与结算。
(function () {
  'use strict';

  var UI = window.ShopUI;
  var Api = window.ShopApi;

  var items = [];
  var selected = {};

  function rowHtml(it) {
    var id = it.itemId;
    return '<tr data-item="' + UI.escapeHtml(String(id)) + '">' +
      '<td><input type="checkbox" data-check="' + UI.escapeHtml(String(id)) + '"' +
        (selected[id] ? ' checked' : '') + ' aria-label="选择此商品"></td>' +
      '<td><img src="' + UI.goodsImage(it.image) + '" width="56" height="56" alt="" style="vertical-align:middle;margin-right:10px">' +
        '<a class="cartPage__link" href="/product/index.html?id=' + encodeURIComponent(String(it.goodsId)) + '">' +
        UI.escapeHtml(it.title) + '</a></td>' +
      '<td>' + UI.yuan(it.priceNow) + '</td>' +
      '<td><div class="qty" role="group" aria-label="数量">' +
        '<button type="button" data-step="-1" data-goods="' + UI.escapeHtml(String(it.goodsId)) + '" aria-label="减少">−</button>' +
        '<output>' + (Number(it.count) || 0) + '</output>' +
        '<button type="button" data-step="1" data-goods="' + UI.escapeHtml(String(it.goodsId)) + '" aria-label="增加">+</button>' +
      '</div></td>' +
      '<td><b>' + UI.yuan(it.totalPriceNow) + '</b></td>' +
      '<td><button type="button" class="cartPage__clear" data-del="' + UI.escapeHtml(String(it.goodsId)) + '">删除</button></td>' +
    '</tr>';
  }

  function total() {
    var sum = 0;
    items.forEach(function (it) {
      if (selected[it.itemId]) sum += Number(it.priceNow) * Number(it.count);
    });
    return sum;
  }

  /** .cartPage__empty 自带 display:grid，会压过 [hidden]，所以要同时改 display。 */
  function setEmpty(show) {
    var empty = document.getElementById('cartEmpty');
    empty.hidden = !show;
    empty.style.display = show ? 'grid' : 'none';
  }

  function paint() {
    var body = document.getElementById('cartBody');
    if (!items.length) {
      body.hidden = true;
      setEmpty(true);
      return;
    }
    setEmpty(false);
    body.hidden = false;
    document.getElementById('cartRows').innerHTML = items.map(rowHtml).join('');
    document.getElementById('cartTotal').textContent = UI.yuan(total());
    var all = items.every(function (it) { return selected[it.itemId]; });
    document.getElementById('cartCheckAll').checked = all;
  }

  function load() {
    return Api.getCart().then(function (list) {
      // shortcut: 后端 set(0) 会删行后立刻以 count=0 重新插入，行删不掉；
      // 前端按 0 数量隐藏，等后端修 setCount 后再去掉这层过滤。
      items = (list || []).filter(function (it) { return Number(it.count) > 0; });
      // 默认全选；刷新后保持已删除行的选择没有意义，统一重建
      var next = {};
      items.forEach(function (it) { next[it.itemId] = true; });
      // 保留用户之前的取消勾选
      Object.keys(selected).forEach(function (k) {
        if (next[k] !== undefined) next[k] = selected[k];
      });
      selected = next;
      paint();
    }).catch(function (err) {
      if (err && err.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      UI.toast((err && err.message) || '购物车加载失败');
      items = [];
      paint();
    });
  }

  function showGuest() {
    document.getElementById('cartBody').hidden = true;
    setEmpty(true);
    document.getElementById('cartEmptyText').textContent = '登录后查看购物车。';
    var action = document.getElementById('cartEmptyAction');
    action.textContent = '去登录';
    action.href = UI.loginHref();
  }

  function setCount(goodsId, count) {
    Api.setCartCount(goodsId, count).then(load).catch(function (err) {
      if (err && err.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      UI.toast((err && err.message) || '数量更新失败');
    });
  }

  function init() {
    if (!Api.isLoggedIn()) {
      showGuest();
      return;
    }

    document.getElementById('cartRows').addEventListener('click', function (e) {
      var t = e.target;
      var step = t.getAttribute('data-step');
      if (step) {
        var row = t.closest('tr[data-item]');
        var item = items.filter(function (it) { return String(it.itemId) === row.getAttribute('data-item'); })[0];
        if (item) setCount(item.goodsId, Number(item.count) + Number(step));
        return;
      }
      var del = t.getAttribute('data-del');
      if (del) setCount(del, 0);
    });

    document.getElementById('cartRows').addEventListener('change', function (e) {
      var check = e.target.getAttribute('data-check');
      if (!check) return;
      selected[check] = e.target.checked;
      document.getElementById('cartTotal').textContent = UI.yuan(total());
      document.getElementById('cartCheckAll').checked = items.every(function (it) { return selected[it.itemId]; });
    });

    document.getElementById('cartCheckAll').addEventListener('change', function (e) {
      // 表头全选
      var on = e.target.checked;
      items.forEach(function (it) { selected[it.itemId] = on; });
      paint();
    });

    document.getElementById('cartClear').addEventListener('click', function () {
      if (!items.length) return;
      if (!window.confirm('确定清空购物车吗？')) return;
      // 后端没有批量删除接口，逐行 set count=0（后端会删行）
      var chain = Promise.resolve();
      items.forEach(function (it) {
        chain = chain.then(function () { return Api.setCartCount(it.goodsId, 0); });
      });
      chain.then(load).catch(function (err) {
        if (err && err.code === 403) {
          location.href = UI.loginHref();
          return;
        }
        UI.toast((err && err.message) || '清空失败');
        load();
      });
    });

    document.getElementById('checkout').addEventListener('click', function () {
      var ids = items.filter(function (it) { return selected[it.itemId]; })
        .map(function (it) { return it.itemId; });
      if (!ids.length) {
        UI.toast('请先勾选要结算的商品');
        return;
      }
      location.href = '/order/index.html?ids=' + ids.map(encodeURIComponent).join(',');
    });

    load();
  }

  UI.boot(init);
})();
