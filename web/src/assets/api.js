// 真实后端接口层：所有页面只通过这里取数，不再读 localStorage / mock-api.json。
//
// 后端拓扑（本机开发）：
//   网关 http://localhost:8081/{serviceName}/**  →  StripPrefix 后进各微服务
//   /goods/**  /user/**  /order/**  /seckill/**  剥一层；/search/** 不剥（类级映射已含 /search）
// 鉴权：网关要求请求头或 cookie 带 zhuawa-shop-token；登录接口在白名单内。
//
// 与网关 origin 不同源，所以必须带 credentials 才能让浏览器回传 cookie。
(function () {
  'use strict';

  var GATEWAY = (window.SHOP_GATEWAY || 'http://localhost:8081').replace(/\/+$/, '');
  var TOKEN_HEADER = 'zhuawa-shop-token';
  var TOKEN_COOKIE = 'zhuawa-shop-token';

  function readCookie(name) {
    var parts = document.cookie ? document.cookie.split(';') : [];
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].trim();
      if (kv.indexOf(name + '=') === 0) return decodeURIComponent(kv.slice(name.length + 1));
    }
    return null;
  }

  // 登录后后端把 JWT 放在响应头与 Set-Cookie 里；浏览器的 Set-Cookie 带 Domain 限制，
  // 跨端口同主机（localhost:3000 → localhost:8081）能回传，用 127.0.0.1 打开则可能丢失。
  // 所以登录成功时同时把 token 存进 localStorage，作为请求头兜底，两种方式都带上。
  var TOKEN_KEY = 'zhuawa-shop-token';

  function getToken() {
    try {
      var t = localStorage.getItem(TOKEN_KEY);
      if (t) return t;
    } catch (e) { /* 隐私模式禁用 storage 时忽略 */ }
    return readCookie(TOKEN_COOKIE);
  }

  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  /** 后端统一返回 {code,msg,data}，code!==0 一律视为业务失败。 */
  function request(service, path, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    var token = getToken();
    if (token) headers[TOKEN_HEADER] = token;
    var init = {
      method: opts.method || 'GET',
      headers: headers,
      credentials: 'include',
    };
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
      init.body = new URLSearchParams(opts.form).toString();
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      // 后端按 UTF-8 解码；字符串直接交给 fetch 会用 UTF-8，中文 key 不会被按 latin-1 拆坏。
      init.body = JSON.stringify(opts.json);
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, opts.timeoutMs || 10000);
    init.signal = controller.signal;

    return fetch(GATEWAY + path, init)
      .then(function (res) {
        return res.text().then(function (text) {
          var parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
          if (res.status === 403) {
            var err403 = new Error('需要登录');
            err403.code = 403;
            throw err403;
          }
          if (!res.ok) {
            var httpErr = new Error(service + ' 服务返回 HTTP ' + res.status);
            httpErr.code = res.status;
            throw httpErr;
          }
          if (!parsed) {
            var emptyErr = new Error(service + ' 服务返回空响应');
            emptyErr.code = -3;
            throw emptyErr;
          }
          if (parsed.code !== 0) {
            var bizErr = new Error(parsed.msg || '请求失败');
            bizErr.code = parsed.code;
            throw bizErr;
          }
          return parsed.data;
        });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          var t = new Error('请求超时');
          t.code = -1;
          throw t;
        }
        throw err;
      })
      .finally(function () { clearTimeout(timer); });
  }

  /** 页面容错：后端挂了也不要白屏，返回兜底值。 */
  function safe(promise, fallback) {
    return promise.catch(function (err) {
      console.warn('[api]', (err && err.message) || err);
      return fallback;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 商品 / 类目                                                         */
  /* ------------------------------------------------------------------ */

  /** 商品详情。id 是雪花 id，必须按字符串传，超过 Number.MAX_SAFE_INTEGER。 */
  function getGoods(id) {
    return request('goods', '/goods/goods/get/' + encodeURIComponent(String(id)));
  }

  function getAllValidGoods() {
    return request('goods', '/goods/goods/getAllValidGoods');
  }

  /** 任意层级的子类目。parentId=0 即顶级。 */
  function getCategories(parentId) {
    return request('goods', '/category/getCategoriesByParentId?parentId=' + encodeURIComponent(parentId));
  }

  function getBrandsByCategory(categoryId) {
    return request('goods', '/goods/brand/listByCategoryId?categoryId=' + encodeURIComponent(categoryId));
  }

  /* ------------------------------------------------------------------ */
  /* 搜索（ES 分页）                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * 分页搜索。
   * 坑：key 传空串会让后端拼出非法 multiMatchQuery 直接 500，必须传 null。
   */
  function searchGoods(params, page, size) {
    page = page || 1;
    size = size || 24;
    var key = params && params.key ? String(params.key).trim() : '';
    var body = {
      key: key || null,
      category: (params && params.category) || '',
      brand: (params && params.brand) || '',
      specsValueMap: (params && params.specsValueMap) || null,
      minPrice: Number((params && params.minPrice) || 0) || 0,
      maxPrice: Number((params && params.maxPrice) || 0) || 0,
      orderField: (params && params.orderField) || '',
      orderType: (params && params.orderType) || '',
    };
    return request('search', '/search/goods/search/' + page + '/' + size, {
      method: 'POST',
      json: body,
      timeoutMs: 15000,
    });
  }

  /* ------------------------------------------------------------------ */
  /* 用户 / 登录                                                         */
  /* ------------------------------------------------------------------ */

  // 后端约定：前端先做一次 MD5，后端再用固定盐 1a2b3c4d 做第二次。
  // 第一次的拼法是 salt[0]+salt[2]+pass+salt[5]+salt[4] = "12"+pass+"c3"。
  var INTERNAL_SALT = '1a2b3c4d';

  function loginPassword(inputPass) {
    return md5('' + INTERNAL_SALT.charAt(0) + INTERNAL_SALT.charAt(2) + inputPass +
      INTERNAL_SALT.charAt(5) + INTERNAL_SALT.charAt(4));
  }

  /**
   * 登录。响应头里有 JWT，响应体里是 UUID（不是 token），两者都要看：
   * 头拿不到时退回 body 没有意义，所以头优先，其次 cookie。
   */
  function login(mobile, password) {
    var formPass = loginPassword(password);
    return fetch(GATEWAY + '/user/user/login/do_login', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      credentials: 'include',
      body: new URLSearchParams({ mobile: mobile, password: formPass }).toString(),
    }).then(function (res) {
      return res.text().then(function (text) {
        var parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
        if (!parsed) {
          throw new Error('登录服务返回异常');
        }
        if (parsed.code !== 0) {
          var e = new Error(parsed.msg || '登录失败');
          e.code = parsed.code;
          throw e;
        }
        var token = res.headers.get(TOKEN_HEADER) || readCookie(TOKEN_COOKIE);
        if (token) setToken(token);
        return { token: token, uuid: parsed.data };
      });
    });
  }

  function logout() {
    setToken(null);
  }

  function getCurrentUser() {
    return request('user', '/user/user/info');
  }

  /* ------------------------------------------------------------------ */
  /* 购物车 / 订单                                                       */
  /* ------------------------------------------------------------------ */

  function getCart() {
    return request('order', '/order/cart/list');
  }

  function setCartCount(goodsId, count) {
    return request('order', '/order/cart/set?goodsId=' + encodeURIComponent(goodsId) +
      '&count=' + encodeURIComponent(count));
  }

  // genOrder 的 cartItemIds 传空数组时，后端会走一条无 where 条件的 delete
  // （既有缺陷，见 OrderService 注释）。所以结算前必须确认真的有商品行。
  function genOrder(payload) {
    return request('order', '/order/order/genOrder', { method: 'POST', json: payload });
  }

  function getOrder(orderId) {
    return request('order', '/order/order/getOrder/' + encodeURIComponent(String(orderId)));
  }

  /* ------------------------------------------------------------------ */
  /* 秒杀                                                                */
  /* ------------------------------------------------------------------ */

  // 一条记录 = 一个 (goodsId, sessionId) 场次；列表接口不带 sessionId。
  function getSeckillList() {
    return request('seckill', '/seckill/seckill/list');
  }

  function getSeckillDetail(goodsId, sessionId) {
    var q = (sessionId === null || sessionId === undefined) ? '' : '?sessionId=' + sessionId;
    return request('seckill', '/seckill/seckill/detail/' + encodeURIComponent(goodsId) + q);
  }

  function getSeckillPath(goodsId, sessionId) {
    var q = (sessionId === null || sessionId === undefined) ? '' : '?sessionId=' + sessionId;
    return request('seckill', '/seckill/seckill/path/' + encodeURIComponent(goodsId) + q);
  }

  function doSeckill(goodsId, path, sessionId) {
    var q = (sessionId === null || sessionId === undefined) ? '' : '?sessionId=' + sessionId;
    return request('seckill', '/seckill/seckill/' + encodeURIComponent(path) + '/do/' +
      encodeURIComponent(goodsId) + q, { method: 'POST' });
  }

  function getSeckillResult(goodsId, sessionId) {
    var q = (sessionId === null || sessionId === undefined) ? '' : '?sessionId=' + sessionId;
    return request('seckill', '/seckill/seckill/result/' + encodeURIComponent(goodsId) + q);
  }

  window.ShopApi = {
    GATEWAY: GATEWAY,
    TOKEN_HEADER: TOKEN_HEADER,
    getToken: getToken,
    setToken: setToken,
    isLoggedIn: function () { return !!getToken(); },
    safe: safe,
    getGoods: getGoods,
    getAllValidGoods: getAllValidGoods,
    getCategories: getCategories,
    getBrandsByCategory: getBrandsByCategory,
    searchGoods: searchGoods,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    getCart: getCart,
    setCartCount: setCartCount,
    genOrder: genOrder,
    getOrder: getOrder,
    getSeckillList: getSeckillList,
    getSeckillDetail: getSeckillDetail,
    getSeckillPath: getSeckillPath,
    doSeckill: doSeckill,
    getSeckillResult: getSeckillResult,
    md5: md5,
    loginPassword: loginPassword,
  };
})();
