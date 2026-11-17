// 订单页：?ids= 结算确认 → genOrder；?orderId= 订单详情；两者都没有显示空态。
(function () {
  'use strict';

  var UI = window.ShopUI;
  var Api = window.ShopApi;

  var STATUS = ['待付款', '已付款', '已发货', '已收货', '已完成', '已评价'];

  function query(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function show(id) {
    ['orderEmpty', 'checkoutBody', 'orderBody'].forEach(function (k) {
      document.getElementById(k).hidden = k !== id;
    });
  }

  function empty(text) {
    document.getElementById('orderEmptyText').textContent = text;
    show('orderEmpty');
  }

  function lineHtml(name, image, unitCents, count, lineCents, goodsId) {
    return '<li>' +
      '<img src="' + UI.goodsImage(image) + '" width="48" height="48" alt="">' +
      (goodsId
        ? '<a href="/product/index.html?id=' + encodeURIComponent(String(goodsId)) + '">' + UI.escapeHtml(name) + '</a>'
        : '<span>' + UI.escapeHtml(name) + '</span>') +
      '<span>' + UI.yuan(unitCents) + ' × ' + count + '</span>' +
      '<b>' + UI.yuan(lineCents) + '</b>' +
    '</li>';
  }

  /* ---------------------------------------------------------------- */
  /* 结算确认                                                          */
  /* ---------------------------------------------------------------- */

  function initCheckout(rawIds) {
    var ids = rawIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!ids.some(function (s) { return /^\d+$/.test(s); })) {
      empty('结算链接无效，请从购物车重新发起结算。');
      return;
    }
    ids = ids.filter(function (s) { return /^\d+$/.test(s); });

    if (!Api.isLoggedIn()) {
      location.href = UI.loginHref();
      return;
    }

    document.getElementById('orderCrumb').textContent = '订单确认';
    document.getElementById('orderTitle').textContent = '确认订单';
    document.getElementById('orderSubtitle').textContent = '核对收货信息后提交，订单将真实写入后端。';

    Api.getCart().then(function (list) {
      var picked = (list || []).filter(function (it) {
        return Number(it.count) > 0 && ids.indexOf(String(it.itemId)) >= 0;
      });
      if (!picked.length) {
        empty('勾选的商品已不在购物车，请返回购物车重新选择。');
        return;
      }
      // 后端要求 cartItemIds 非空，且必须是数字数组（List<Long>）
      var cartItemIds = picked.map(function (it) { return Number(it.itemId); });
      var sum = 0;
      document.getElementById('checkoutItems').innerHTML = picked.map(function (it) {
        sum += Number(it.totalPriceNow) || 0;
        return lineHtml(it.title, it.image, it.priceNow, it.count, it.totalPriceNow, it.goodsId);
      }).join('');
      document.getElementById('checkoutTotal').textContent = UI.yuan(sum);
      show('checkoutBody');

      document.getElementById('checkoutForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var err = document.getElementById('checkoutErr');
        var go = document.getElementById('submitOrder');
        var address = document.getElementById('receiveAddress').value.trim();
        err.textContent = '';
        if (!address) {
          err.textContent = '请填写收货地址';
          return;
        }
        if (!cartItemIds.length) {
          err.textContent = '没有可结算的商品';
          return;
        }
        go.disabled = true;
        go.textContent = '提交中…';
        Api.genOrder({
          cartItemIds: cartItemIds,
          receiveAddress: address,
          payType: Number(document.getElementById('payType').value) || 0,
          consumerMsg: document.getElementById('consumerMsg').value.trim(),
        }).then(function (order) {
          UI.paintCartCount();
          if (!order || order.id == null) {
            err.textContent = '订单已提交，但未拿到订单号';
            go.disabled = false;
            go.textContent = '提交订单';
            return;
          }
          location.replace('/order/index.html?orderId=' + encodeURIComponent(String(order.id)));
        }).catch(function (ex) {
          if (ex && ex.code === 403) {
            location.href = UI.loginHref();
            return;
          }
          err.textContent = (ex && ex.message) || '提交订单失败';
          go.disabled = false;
          go.textContent = '提交订单';
        });
      });
    }).catch(function (ex) {
      if (ex && ex.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      empty((ex && ex.message) || '购物车加载失败');
    });
  }

  /* ---------------------------------------------------------------- */
  /* 订单详情                                                          */
  /* ---------------------------------------------------------------- */

  function initDetail(orderId) {
    if (!Api.isLoggedIn()) {
      location.href = UI.loginHref();
      return;
    }
    document.getElementById('orderCrumb').textContent = '订单详情';
    document.getElementById('orderTitle').textContent = '订单详情';

    Api.getOrder(orderId).then(function (o) {
      if (!o) {
        empty('订单不存在。');
        return;
      }
      document.getElementById('orderNo').textContent = String(o.id == null ? '—' : o.id);
      document.getElementById('orderTime').textContent = UI.formatDate(o.createTime);
      document.getElementById('orderStatus').textContent =
        o.status == null ? '—' : (STATUS[o.status] || ('状态 ' + o.status));
      document.getElementById('orderPayType').textContent = o.payType === 1 ? '货到付款' : '在线支付';
      document.getElementById('orderAddress').textContent = o.receiveAddress
        ? '收货地址：' + o.receiveAddress : '收货地址：—';
      var msg = document.getElementById('orderMsg');
      if (o.consumerMsg) {
        msg.hidden = false;
        msg.textContent = '备注：' + o.consumerMsg;
      }
      document.getElementById('orderItems').innerHTML = (o.orderItems || []).map(function (it) {
        var count = Number(it.count) || 0;
        var line = Number(it.price) || 0;
        var unit = count > 0 ? Math.round(line / count) : line;
        return lineHtml(it.goodsName, it.goodsImage, unit, count, line, it.goodsId);
      }).join('');
      document.getElementById('orderTotal').textContent = UI.yuan(o.actualPrice != null ? o.actualPrice : o.totalPrice);
      show('orderBody');
      UI.paintCartCount();
    }).catch(function (ex) {
      if (ex && ex.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      empty((ex && ex.message) || '订单加载失败');
    });
  }

  function init() {
    var ids = query('ids');
    var orderId = query('orderId');
    if (ids) {
      initCheckout(ids);
    } else if (orderId) {
      initDetail(orderId);
    } else {
      empty('还没有待展示的订单。');
    }
  }

  UI.boot(init);
})();
