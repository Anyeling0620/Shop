// Small interactions: hero carousel, countdown, mobile nav, shelf tabs, coupon form.
(function () {
  'use strict';

  // --- Hero carousel: arrows, dots, autoplay that pauses on hover/focus, respects reduced motion.
  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero__slide'));
  var dotsBox = document.getElementById('heroDots');
  if (slides.length && dotsBox) {
    var index = 0;
    var timer = null;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    slides.forEach(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { show(i, true); });
      dotsBox.appendChild(b);
    });

    function show(i, fromUser) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle('is-current', j === index); });
      Array.prototype.forEach.call(dotsBox.children, function (d, j) {
        d.setAttribute('aria-current', j === index ? 'true' : 'false');
      });
      if (fromUser) restart();
    }
    function next(step) { show(index + step, true); }
    function restart() {
      if (reduce) return;
      clearInterval(timer);
      timer = setInterval(function () { show(index + 1); }, 6000);
    }

    var prev = document.querySelector('.hero__arrow--prev');
    var nex = document.querySelector('.hero__arrow--next');
    if (prev) prev.addEventListener('click', function () { next(-1); });
    if (nex) nex.addEventListener('click', function () { next(1); });

    var hero = document.querySelector('.hero');
    hero.addEventListener('mouseenter', function () { clearInterval(timer); });
    hero.addEventListener('mouseleave', restart);
    hero.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') next(-1);
      if (e.key === 'ArrowRight') next(1);
    });
    restart();
  }

  // --- Flash-sale countdown (cosmetic, resets each visit).
  var h = document.getElementById('cdH'), m = document.getElementById('cdM'), s = document.getElementById('cdS');
  if (h && m && s) {
    var left = 2 * 3600 + 18 * 60 + 45;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var tick = function () {
      h.textContent = pad(Math.floor(left / 3600));
      m.textContent = pad(Math.floor((left % 3600) / 60));
      s.textContent = pad(left % 60);
      left = left > 0 ? left - 1 : 2 * 3600 + 18 * 60 + 45;
    };
    tick();
    setInterval(tick, 1000);
  }

  // --- Mobile nav toggle.
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('mainnav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // --- Shelf tabs: swap the highlighted tab (products stay the same sample set).
  document.querySelectorAll('.shelf__tabs').forEach(function (list) {
    list.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      list.querySelectorAll('a').forEach(function (x) { x.removeAttribute('aria-current'); });
      a.setAttribute('aria-current', 'true');
    });
  });


  // --- Mock account: a demo session in localStorage gates checkout and drives the header.
  var USER_KEY = 'nova-user';
  var getUser = function () { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } };
  var maskPhone = function (p) { return p.slice(0, 3) + '****' + p.slice(-4); };
  var nextUrl = function () {
    var n = new URLSearchParams(location.search).get('next');
    // only same-site paths: '//host' would leave the site
    return n && n.charAt(0) === '/' && n.charAt(1) !== '/' ? n : '/index.html';
  };
  var setUser = function (u) {
    try { if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); else localStorage.removeItem(USER_KEY); } catch (e) {}
    paintAccount();
  };
  function paintAccount() {
    var login = document.getElementById('navLogin'), reg = document.getElementById('navReg');
    var slot = document.getElementById('navAccount');
    if (!login || !slot) return;
    var u = getUser();
    login.hidden = !!u;
    if (reg) reg.hidden = !!u;
    slot.hidden = !u;
    if (!u) { slot.innerHTML = ''; return; }
    slot.innerHTML = '<span class="utility__who">' + maskPhone(u.phone) + '</span>' +
      '<button type="button" class="utility__out" id="navSignOut">退出</button>';
    document.getElementById('navSignOut').addEventListener('click', function () { setUser(null); });
  }
  paintAccount();

  function loginForm(form, phoneEl, codeEl, onDone) {
    if (!form || !phoneEl || !codeEl) return;
    var err = document.createElement('p');
    err.className = 'login-err';
    err.setAttribute('role', 'alert');
    err.hidden = true;
    form.appendChild(err);
    var fail = function (msg) { err.textContent = msg; err.hidden = false; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var phone = phoneEl.value.trim(), code = codeEl.value.trim();
      if (!/^1\d{10}$/.test(phone)) return fail('请输入 11 位手机号。');
      if (!/^\d{4,6}$/.test(code)) return fail('请输入 4–6 位验证码（演示环境可随意填写）。');
      err.hidden = true;
      setUser({ phone: phone, at: Date.now() });
      onDone();
    });
  }

  // Coupon page: signing in returns to the page that asked for it.
  var acctForm = document.querySelector('.acct__card form');
  if (acctForm) {
    var hint = document.getElementById('loginNext');
    if (hint && new URLSearchParams(location.search).get('next')) hint.hidden = false;
    loginForm(acctForm, document.getElementById('phone'), document.getElementById('code'), function () {
      location.href = nextUrl();
    });
    var acctCode = acctForm.querySelector('.field__code');
    if (acctCode) acctCode.addEventListener('click', function () {
      acctCode.textContent = '已发送';
      acctCode.disabled = true;
    });
  }

  // --- Login panel: close, tabs, code button and a working submit.
  var pop = document.querySelector('.login-pop');
  var paintPopTabs = function (a) {
    pop.querySelectorAll('.login-pop__tabs a').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
    a.setAttribute('aria-selected', 'true');
    var qr = a.textContent.indexOf('扫码') >= 0;
    pop.querySelector('.login-pop__pane').hidden = qr;
    pop.querySelector('.login-pop__qr').hidden = !qr;
  };
  if (pop) {
    var popX = pop.querySelector('.login-pop__x');
    if (popX) popX.addEventListener('click', function () { pop.hidden = true; });
    document.querySelectorAll('.utility__right a[href^="/mycenter/mycoupon.html"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (getUser()) return;
        e.preventDefault(); pop.hidden = false; pop.querySelector('input').focus();
      });
    });
    pop.querySelectorAll('.login-pop__tabs a').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); paintPopTabs(a); });
    });
    var popCode = pop.querySelector('.login-pop__row button');
    if (popCode) popCode.addEventListener('click', function () { popCode.textContent = '已发送'; popCode.disabled = true; });
    loginForm(pop.querySelector('.login-pop__pane'), document.getElementById('popPhone'), document.getElementById('popCode'), function () {
      pop.hidden = true;
    });
  }

  // --- Mock data layer: one JSON file stands in for the backend.
  var API = '/assets/mock-api.json';

  // --- Cart (localStorage; the brief leaves the backend out).
  var CART_KEY = 'nova-cart';
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    paintCartCount();
  }
  function paintCartCount() {
    var badge = document.getElementById('cartCount');
    if (!badge) return;
    var n = 0;
    readCart().forEach(function (i) { n += i.qty; });
    badge.textContent = n;
    badge.hidden = n === 0;
  }
  paintCartCount();

  // --- Product detail: gallery, quantity, tabs, add to cart.
  var main = document.getElementById('pdpMain');
  var qty = 1;
  if (main) {
    document.querySelectorAll('.pdp__thumbs button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.pdp__thumbs button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        main.src = b.dataset.src;
      });
    });
    var out = document.getElementById('pdpQty');
    document.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        qty = Math.max(1, Math.min(99, qty + Number(b.dataset.qty)));
        out.textContent = qty;
      });
    });
    document.querySelectorAll('.pdp__tabbar button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.pdp__tabbar button').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
        b.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.pdp__pane').forEach(function (p) { p.hidden = p.dataset.pane !== b.dataset.tab; });
      });
    });
    // One line per product: adding or buying the same item merges into the existing row.
    var putInCart = function (slug, name, price) {
      var items = readCart();
      var hit = items.filter(function (i) { return i.slug === slug; })[0];
      if (hit) hit.qty += qty;
      else items.push({ slug: slug, name: name, price: price, qty: qty });
      writeCart(items);
    };
    var add = document.getElementById('addCart');
    if (add) add.addEventListener('click', function () {
      putInCart(add.dataset.slug, add.dataset.name, Number(add.dataset.price));
      add.textContent = '已加入 ✓';
      setTimeout(function () { add.textContent = '加入购物车'; }, 1400);
    });
    var buy = document.getElementById('buyNow');
    if (buy) buy.addEventListener('click', function () {
      putInCart(buy.dataset.slug, document.querySelector('.pdp__info h1').textContent,
        Number(document.getElementById('pdpPrice').textContent));
      location.href = '/cart/index.html';
    });
    if (window.fetch) {
      fetch(API).then(function (r) { return r.json(); }).then(function (d) {
        document.documentElement.dataset.catalog = String(d.products.length);
      }).catch(function () {});
    }
  }

  // --- Listing: category, price and sort filters, plus the search box.
  var grid = document.getElementById('productGrid');
  if (grid) {
    var cards = Array.prototype.slice.call(grid.children);
    var view = { cat: '', price: '', sort: 'default', q: '' };
    var count = document.getElementById('listCount'), empty = document.getElementById('listEmpty');
    var inRange = function (p, r) { if (!r) return true; var a = r.split('-'); return p >= Number(a[0]) && p <= Number(a[1]); };
    var apply = function () {
      var shown = cards.filter(function (c) {
        var p = Number(c.dataset.price);
        var ok = (!view.cat || c.dataset.cat === view.cat) && inRange(p, view.price) &&
          (!view.q || c.dataset.name.toLowerCase().indexOf(view.q) >= 0);
        c.hidden = !ok;
        return ok;
      });
      if (view.sort !== 'default') {
        shown.sort(function (a, b) { return (Number(a.dataset.price) - Number(b.dataset.price)) * (view.sort === 'asc' ? 1 : -1); });
        shown.forEach(function (c) { grid.appendChild(c); });
      }
      count.textContent = '共 ' + shown.length + ' 件商品';
      empty.hidden = shown.length > 0;
    };
    document.querySelectorAll('#catFilter button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#catFilter button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true'); view.cat = b.dataset.cat; apply();
      });
    });
    document.querySelectorAll('#priceFilter button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('#priceFilter button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true'); view.price = b.dataset.price; apply();
      });
    });
    document.getElementById('sortBy').addEventListener('change', function (e) { view.sort = e.target.value; apply(); });
    view.q = (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase();
    var qBox = document.getElementById('q');
    if (qBox && view.q) qBox.value = view.q;
    apply();
  }

  // --- Cart page rendering.
  var rows = document.getElementById('cartRows');
  if (rows) {
    var body = document.getElementById('cartBody'), emptyBox = document.getElementById('cartEmpty');
    var note = document.getElementById('cartNote');
    var render = function () {
      var items = readCart();
      body.hidden = items.length === 0;
      emptyBox.hidden = items.length > 0;
      rows.innerHTML = items.map(function (it, i) {
        return '<tr>' +
          '<td><div class="cartTitle"><img src="/assets/p-' + ((it.name.length % 6) + 1) + '.svg" alt="">' +
          '<a href="/product/' + it.slug + '.html">' + it.name + '</a></div></td>' +
          '<td>￥' + it.price + '</td>' +
          '<td><span class="cartQty"><button type="button" data-step="-1" data-i="' + i + '" aria-label="减少">−</button>' +
          '<output>' + it.qty + '</output><button type="button" data-step="1" data-i="' + i + '" aria-label="增加">+</button></span></td>' +
          '<td><b>￥' + it.price * it.qty + '</b></td>' +
          '<td><button type="button" data-del="' + i + '">删除</button></td></tr>';
      }).join('');
      var total = 0;
      items.forEach(function (i) { total += i.price * i.qty; });
      document.getElementById('cartTotal').textContent = '￥' + total;
    };
    rows.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var items = readCart();
      if (b.dataset.del !== undefined) items.splice(Number(b.dataset.del), 1);
      else {
        var i = Number(b.dataset.i);
        items[i].qty = Math.max(1, items[i].qty + Number(b.dataset.step));
      }
      writeCart(items); render();
    });
    document.getElementById('cartClear').addEventListener('click', function () { writeCart([]); render(); });
    document.getElementById('checkout').addEventListener('click', function () {
      var items = readCart();
      if (!items.length) return;
      if (!(function () { try { return JSON.parse(localStorage.getItem('nova-user')); } catch (e) { return null; } })()) {
        location.href = '/mycenter/mycoupon.html?next=%2Fcart%2Findex.html';
        return;
      }
      var total = 0;
      items.forEach(function (i) { total += i.price * i.qty; });
      try {
        localStorage.setItem('nova-order', JSON.stringify({ no: 'N' + Date.now().toString().slice(-10), at: new Date().toLocaleString('zh-CN'), items: items, total: total }));
        localStorage.removeItem(CART_KEY);
      } catch (e) {}
      location.href = '/order/index.html';
    });
    render();
  }


  // --- Order confirmation, read back from the mock checkout above.
  var orderItems = document.getElementById('orderItems');
  if (orderItems) {
    var order = null;
    try { order = JSON.parse(localStorage.getItem('nova-order')); } catch (e) {}
    var empty = document.getElementById('orderEmpty'), bodyEl = document.getElementById('orderBody');
    if (!order) { empty.hidden = false; }
    else {
      bodyEl.hidden = false;
      document.getElementById('orderNo').textContent = order.no;
      document.getElementById('orderTime').textContent = order.at;
      orderItems.innerHTML = order.items.map(function (it) {
        return '<li><a href="/product/' + it.slug + '.html">' + it.name + '</a>' +
          '<span>￥' + it.price + ' × ' + it.qty + '</span><b>￥' + it.price * it.qty + '</b></li>';
      }).join('');
      document.getElementById('orderTotal').textContent = '￥' + order.total;
    }
  }

  // --- Points: redeem a reward (mock, no backend).
  document.querySelectorAll('[data-redeem]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      b.textContent = '已兑换';
      var msg = document.getElementById('pointsNote');
      if (msg) msg.textContent = '示例弹窗：' + b.dataset.redeem + ' 已加入兑换记录（本地演示，不会真实发货）。';
    });
  });

})();
