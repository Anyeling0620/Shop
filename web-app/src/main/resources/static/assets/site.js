// 全站交互骨架：轮播、移动端导航、货架页签。
// 具体业务数据全部在 pages/*.js 里通过 window.ShopApi 取，这里不碰商品、购物车与登录。
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
    if (hero) {
      hero.addEventListener('mouseenter', function () { clearInterval(timer); });
      hero.addEventListener('mouseleave', restart);
      hero.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') next(-1);
        if (e.key === 'ArrowRight') next(1);
      });
    }
    restart();
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

  // --- Shelf tabs: 只切换高亮，真实筛选交给页面脚本读 data-shelf-tab 自行处理。
  document.querySelectorAll('.shelf__tabs').forEach(function (list) {
    list.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      list.querySelectorAll('a').forEach(function (x) { x.removeAttribute('aria-current'); });
      a.setAttribute('aria-current', 'true');
    });
  });

  // --- 横向滚动条（教育专区权益卡片等）左右箭头。
  document.querySelectorAll('[data-scroll-target]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.querySelector(btn.getAttribute('data-scroll-target'));
      if (!target) return;
      var dir = btn.classList.contains('edu-arrow--prev') ? -1 : 1;
      target.scrollBy({ left: dir * Math.max(320, target.clientWidth * 0.8), behavior: 'smooth' });
    });
  });
})();
