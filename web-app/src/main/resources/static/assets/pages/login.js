// 登录页：手机号 + 密码，成功后回 ?next=。
(function () {
  'use strict';

  var UI = window.ShopUI;
  var Api = window.ShopApi;

  /** nextParam 在无 next 时返回当前页，登录页本身要挡掉，避免登录成功后原地打转。 */
  function target() {
    var raw = new URLSearchParams(location.search).get('next');
    if (!raw || raw.charAt(0) !== '/' || raw.charAt(1) === '/' || /^\/login\//.test(raw)) {
      return '/index.html';
    }
    return raw;
  }

  function init() {
    var next = target();
    var form = document.getElementById('loginForm');
    var err = document.getElementById('loginErr');
    var go = document.getElementById('loginGo');
    var hint = document.getElementById('loginNext');

    if (new URLSearchParams(location.search).get('next')) {
      if (hint) hint.hidden = false;
    }

    if (Api.isLoggedIn()) {
      location.replace(next);
      return;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var mobile = document.getElementById('phone').value.trim();
      var password = document.getElementById('password').value;
      err.textContent = '';
      if (!/^\d{6,11}$/.test(mobile)) {
        err.textContent = '请输入正确的手机号';
        return;
      }
      if (!password) {
        err.textContent = '请输入密码';
        return;
      }
      go.disabled = true;
      go.textContent = '登录中…';
      Api.login(mobile, password).then(function () {
        location.replace(next);
      }).catch(function (ex) {
        err.textContent = (ex && ex.message) || '登录失败';
        go.disabled = false;
        go.textContent = '登录';
      });
    });
  }

  UI.boot(init);
})();
