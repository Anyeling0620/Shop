// 教育特惠页：只渲染后端真实在售商品，不存在教育专属价字段，文案已注明。
(function () {
  'use strict';

  var Api = window.ShopApi;
  var UI = window.ShopUI;

  function render(list) {
    var box = document.getElementById('eduGoods');
    if (!box) return;
    box.innerHTML = (list || []).map(function (g) {
      return '<li>' + UI.card(g) + '</li>';
    }).join('');
  }

  function setStatus(text) {
    var box = document.getElementById('eduStatus');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  }

  UI.boot(function () {
    var box = document.getElementById('eduGoods');
    if (box) box.innerHTML = UI.skeletonCards(8);

    Api.safe(Api.searchGoods({}, 1, 12), null).then(function (data) {
      var list = (data && data.goodsEsInfoList) || [];
      render(list);
      if (!list.length) setStatus('暂时没有可展示的商品，请稍后再来。');
    });
  });
})();
