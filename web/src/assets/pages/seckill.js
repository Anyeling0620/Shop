// 秒杀：列表页（按 goodsId 聚合多场次）与详情页共用一份脚本，按 body.page--seckill 与 URL 区分。
(function () {
  'use strict';

  var UI = window.ShopUI;
  var Api = window.ShopApi;

  function query(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function num(v) { return Number(v) || 0; }

  /** 0=未开始 1=进行中 2=已结束，按接口时间窗判断。 */
  function phaseOf(sk) {
    var now = Date.now();
    var start = new Date(sk.startTime).getTime();
    var end = new Date(sk.endTime).getTime();
    if (isNaN(start) || isNaN(end)) return { code: 1, label: '进行中', cls: 'live' };
    if (now < start) return { code: 0, label: '即将开始', cls: 'upcoming' };
    if (now > end) return { code: 2, label: '已结束', cls: 'ended' };
    return { code: 1, label: '进行中', cls: 'live' };
  }

  function badge(phase) {
    return '<span class="sk-badge sk-badge--' + phase.cls + '">' + phase.label + '</span>';
  }

  /** 倒计时文本：未开始倒计时到开始，进行中倒计时到结束，已结束为空。 */
  function countdown(sk, phase) {
    if (phase.code === 2) return '已结束';
    var target = phase.code === 0 ? new Date(sk.startTime).getTime() : new Date(sk.endTime).getTime();
    var left = Math.max(0, Math.floor((target - Date.now()) / 1000));
    var h = Math.floor(left / 3600);
    var m = Math.floor((left % 3600) / 60);
    var s = left % 60;
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    return (phase.code === 0 ? '距开始 ' : '距结束 ') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function stockBar(sk) {
    var total = Math.max(0, num(sk.stock));
    var left = Math.max(0, num(sk.stockSeckill));
    var sold = total > 0 ? Math.min(100, Math.round((1 - left / total) * 100)) : 0;
    return '<div class="sk-card__bar"><i style="width:' + sold + '%"></i></div>' +
      '<p class="sk-card__meta"><span>库存 ' + left + '</span><span>已抢 ' + sold + '%</span></p>';
  }

  function detailHref(sk) {
    return '/seckill/detail.html?goodsId=' + encodeURIComponent(String(sk.goodsId)) +
      '&sessionId=' + encodeURIComponent(String(sk.sessionId));
  }

  /* ---------------------------------------------------------------- */
  /* 列表页                                                            */
  /* ---------------------------------------------------------------- */

  function initList() {
    var grid = document.getElementById('seckillGrid');
    var emptyBox = document.getElementById('seckillEmpty');

    Api.getSeckillList().then(function (list) {
      // 同一 goodsId 多场：聚合为一张卡片，展示进度最靠前的场次（进行中 > 即将开始 > 已结束）
      var byGoods = {};
      // 同一商品的场次优先级：进行中 > 即将开始 > 已结束
      function rank(code) { return code === 1 ? 3 : code === 0 ? 2 : 1; }
      (list || []).forEach(function (sk) {
        if (!sk || sk.goodsId == null) return;
        var key = String(sk.goodsId);
        var phase = phaseOf(sk);
        var cur = byGoods[key];
        if (!cur || rank(phase.code) > rank(cur.phase.code)) {
          byGoods[key] = { sk: sk, phase: phase };
        }
      });
      var cards = Object.keys(byGoods).map(function (k) { return byGoods[k]; });
      // 真实数据可能整站没有可抢的场次：照实提示，不伪造。已结束的场次不值得占首屏。
      cards = cards.filter(function (c) { return c.phase.code !== 2; });
      if (!cards.length) {
        grid.innerHTML = '';
        emptyBox.hidden = false;
        emptyBox.querySelector('p').textContent = '暂无进行中的秒杀。';
        return;
      }
      emptyBox.hidden = true;
      grid.innerHTML = cards.map(function (c) {
        var sk = c.sk;
        var phase = c.phase;
        return '<article class="sk-card">' +
          '<a class="sk-card__media" href="' + detailHref(sk) + '">' +
            '<img src="' + UI.goodsImage(sk.img) + '" alt="' + UI.escapeHtml(sk.name || '') + '" loading="lazy"></a>' +
          '<div class="sk-card__body">' +
            '<p>' + badge(phase) + '</p>' +
            '<h3 class="sk-card__title"><a href="' + detailHref(sk) + '">' + UI.escapeHtml(sk.name || sk.title || '') + '</a></h3>' +
            '<p class="sk-card__price">' + UI.yuanShort(sk.priceSeckill) + '<s>' + UI.yuanDirect(sk.price) + '</s></p>' +
            '<p class="sk-card__cd" data-cd="' + UI.escapeHtml(String(sk.goodsId)) + '">' + countdown(sk, phase) + '</p>' +
            stockBar(sk) +
            '<p class="sk-card__cta"><a href="' + detailHref(sk) + '">' +
              (phase.code === 1 ? '立即抢购' : phase.code === 0 ? '查看详情' : '已结束') + '</a></p>' +
          '</div>' +
        '</article>';
      }).join('');

      // 每秒刷新倒计时（真实时间差，不做本地递减）
      setInterval(function () {
        cards.forEach(function (c) {
          var el = grid.querySelector('[data-cd="' + c.sk.goodsId + '"]');
          if (el) el.textContent = countdown(c.sk, phaseOf(c.sk));
        });
      }, 1000);
    }).catch(function (ex) {
      grid.innerHTML = '';
      emptyBox.hidden = false;
      emptyBox.querySelector('p').textContent = (ex && ex.message) || '秒杀列表加载失败';
    });
  }

  /* ---------------------------------------------------------------- */
  /* 详情页                                                            */
  /* ---------------------------------------------------------------- */

  var polling = false;

  function pollResult(goodsId, sessionId, tries, btn) {
    if (tries > 20) {
      UI.toast('排队超时，请稍后在订单页确认结果');
      if (btn) { btn.disabled = false; btn.textContent = '立即抢购'; }
      polling = false;
      return;
    }
    setTimeout(function () {
      Api.getSeckillResult(goodsId, sessionId).then(function (v) {
        var r = Number(v);
        if (r > 0) {
          location.href = '/order/index.html?orderId=' + encodeURIComponent(String(v));
          return;
        }
        if (r === 0) {
          pollResult(goodsId, sessionId, tries + 1, btn);
          return;
        }
        polling = false;
        UI.toast('秒杀失败，商品可能已抢完');
        if (btn) { btn.disabled = false; btn.textContent = '立即抢购'; }
      }).catch(function (ex) {
        polling = false;
        if (ex && ex.code === 403) {
          location.href = UI.loginHref();
          return;
        }
        UI.toast((ex && ex.message) || '秒杀结果查询失败');
        if (btn) { btn.disabled = false; btn.textContent = '立即抢购'; }
      });
    }, 300);
  }

  function buy(goodsId, sessionId, btn) {
    if (!Api.isLoggedIn()) {
      location.href = UI.loginHref();
      return;
    }
    btn.disabled = true;
    btn.textContent = '抢购中…';
    Api.getSeckillPath(goodsId, sessionId).then(function (path) {
      return Api.doSeckill(goodsId, path, sessionId);
    }).then(function (v) {
      if (Number(v) === 0) {
        UI.toast('已进入排队，正在确认结果');
        pollResult(goodsId, sessionId, 0, btn);
        return;
      }
      // 直接返回订单号的情形同样兼容
      if (Number(v) > 0) {
        location.href = '/order/index.html?orderId=' + encodeURIComponent(String(v));
        return;
      }
      polling = false;
      UI.toast('秒杀失败');
      btn.disabled = false;
      btn.textContent = '立即抢购';
    }).catch(function (ex) {
      polling = false;
      if (ex && ex.code === 403) {
        location.href = UI.loginHref();
        return;
      }
      UI.toast((ex && ex.message) || '抢购失败');
      btn.disabled = false;
      btn.textContent = '立即抢购';
    });
  }

  function disableReason(phase, remain, stock) {
    if (phase.code === 0) {
      return '秒杀尚未开始' + (remain > 0 ? '，' + remain + ' 秒后开抢' : '');
    }
    if (phase.code === 2) return '秒杀已结束';
    if (stock <= 0) return '本场已售罄';
    return '';
  }

  function renderDetail(sk, status, remain) {
    var phase = status === 0 ? { code: 0, label: '即将开始', cls: 'upcoming' }
      : status === 2 ? { code: 2, label: '已结束', cls: 'ended' }
      : { code: 1, label: '进行中', cls: 'live' };
    var stock = Math.max(0, num(sk.stockSeckill));
    var reason = disableReason(phase, remain, stock);
    var root = document.getElementById('skDetail');
    root.innerHTML =
      '<div class="pdp__gallery">' +
        '<figure class="pdp__main"><img src="' + UI.goodsImage(sk.img) + '" alt="' + UI.escapeHtml(sk.name || '') + '"></figure>' +
      '</div>' +
      '<div class="pdp__info">' +
        '<h1>' + UI.escapeHtml(sk.name || sk.title || '') + '</h1>' +
        '<p class="pdp__sub">' + UI.escapeHtml(sk.detail || '') + '</p>' +
        '<p style="margin-top:12px">' + badge(phase) +
          ' <span class="sk-card__cd" id="skCountdown"></span></p>' +
        '<div class="pdp__price"><b>' + UI.yuanShort(sk.priceSeckill) + '</b>' +
          '<s>' + UI.yuanDirect(sk.price) + '</s></div>' +
        stockBar(sk) +
        '<p class="pdp__stock" id="skStockNote">' + (reason || '库存 ' + stock) + '</p>' +
        '<div class="pdp__buy">' +
          '<button class="btn btn--buy" type="button" id="skBuy"' + (reason ? ' disabled' : '') + '>立即抢购</button>' +
        '</div>' +
      '</div>';

    var cd = document.getElementById('skCountdown');
    function tick() {
      cd.textContent = countdown(sk, phase);
    }
    tick();
    setInterval(tick, 1000);

    var buyBtn = document.getElementById('skBuy');
    if (!reason) {
      buyBtn.addEventListener('click', function () {
        if (polling) return;
        polling = true;
        buy(String(sk.goodsId), sk.sessionId, buyBtn);
      });
    }
  }

  function initDetail() {
    var goodsId = query('goodsId');
    var sessionId = query('sessionId');
    if (!goodsId) {
      document.getElementById('skDetail').innerHTML = '';
      document.getElementById('skDetailEmpty').hidden = false;
      return;
    }

    Api.getSeckillList().then(function (list) {
      // 场次选择器：同商品的所有 sessionId
      var sessions = (list || []).filter(function (s) { return String(s.goodsId) === String(goodsId); });
      if (!sessions.length) {
        document.getElementById('skDetailEmpty').hidden = false;
        return;
      }
      if (sessionId == null) {
        sessionId = String(sessions[0].sessionId);
      }
      var tabs = null;
      if (sessions.length > 1) {
        tabs = document.createElement('div');
        tabs.className = 'session-tabs';
        sessions.forEach(function (s) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = '场次 ' + s.sessionId;
          b.setAttribute('aria-pressed', String(String(s.sessionId) === String(sessionId)));
          b.addEventListener('click', function () {
            location.href = '/seckill/detail.html?goodsId=' + encodeURIComponent(String(goodsId)) +
              '&sessionId=' + encodeURIComponent(String(s.sessionId));
          });
          tabs.appendChild(b);
        });
        document.getElementById('skDetail').parentNode.insertBefore(tabs, document.getElementById('skDetail'));
      }

      Api.getSeckillDetail(goodsId, sessionId).then(function (d) {
        if (!d || !d.goods) {
          document.getElementById('skDetail').innerHTML = '';
          document.getElementById('skDetailEmpty').hidden = false;
          return;
        }
        renderDetail(d.goods, d.seckillStatus, d.remainSeconds);
      }).catch(function (ex) {
        UI.toast((ex && ex.message) || '秒杀详情加载失败');
        document.getElementById('skDetail').innerHTML = '';
        document.getElementById('skDetailEmpty').hidden = false;
      });
    }).catch(function (ex) {
      UI.toast((ex && ex.message) || '秒杀列表加载失败');
      document.getElementById('skDetailEmpty').hidden = false;
    });
  }

  function init() {
    if (document.getElementById('seckillGrid')) {
      initList();
    } else {
      initDetail();
    }
  }

  UI.boot(init);
})();
