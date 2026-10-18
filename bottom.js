/* =====================================================================
   ФОРМА — bottom.js (правки v3, исполнитель D)
   Блоки «Результаты», «Тарифы», «Вопросы», финал. Подключён после main.js и animations.js (defer).
   Опирается на window.FORMA (main.js): goal(), CONFIG, phase(). Без FORMA работает, цели не шлёт.
   Анимируем только transform и opacity. При prefers-reduced-motion — сразу конечное состояние.

   Разделы:
    0. BOTTOM_CONFIG
    1. Утилиты
    2. Данные: остаток мест (П4), «Уже записались» (П13), цена в день (П3), рейтинг (П7)
    3. Счётчики −4–7 кг и −6–10 см
    4. Появление: отзывы-скриншоты, печать (П5), шкала мест, фото FAQ, пункты тарифов
    5. Модалка видео-отзыва (П6): ловушка фокуса, Esc
    6. Цели Метрики
    7. Запуск
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     0. BOTTOM_CONFIG
     ВНИМАНИЕ: в проде — только реальные данные (из CRM/API/статистики школы).
     demo: true — значения ниже придуманы для показа клиенту. Любое поле = null — строка скрыта.
     =================================================================== */
  var BOTTOM_CONFIG = {
    demo: true,
    seatsTotal: 20,            // мест в «Личном ведении» на поток
    seatsLeft: 7,              // [демо] остаток мест. В проде — из CRM. null — строка и шкала скрыты; 0 — «мест нет»
    enrolledCount: 318,        // [демо] сколько уже записались на поток. В проде — реальное число оплат. null — скрыть
    enrolledStream: '2 ноября',
    rating: {                  // [демо] рейтинг выпускниц. null — строка скрыта
      value: '4,9',
      count: 2140,
      period: '2025–2026'
    },
    reviewsUrl: 'https://t.me/forma_reviews', // [демо] Telegram-канал с отзывами. null — ссылка скрыта
    programDays: 56,           // 8 недель — для «≈ N ₽ в день»
    countDuration: 1000        // мс, отсчёт цифр «−4–7 кг», «−6–10 см»
  };

  /* ===================================================================
     1. Утилиты
     =================================================================== */
  var doc = document;
  var root = doc.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasIO = 'IntersectionObserver' in window;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function F() { return window.FORMA || null; }
  function goal(name, params) { var f = F(); if (f && typeof f.goal === 'function') f.goal(name, params || {}); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  // Один раз, когда элемент входит в кадр. Без IO или при reduced-motion — сразу.
  function once(els, fn, opts) {
    els = [].concat(els).filter(Boolean);
    if (!els.length) return;
    if (!hasIO) { els.forEach(fn); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); }
      });
    }, opts || { rootMargin: '0px 0px -15% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ===================================================================
     2. Данные из конфига
     =================================================================== */
  function phaseNow() { var f = F(); return f && f.phase ? f.phase() : 'early'; }

  function renderSeats() {
    var left = BOTTOM_CONFIG.seatsLeft, total = BOTTOM_CONFIG.seatsTotal;
    var line = $('[data-seats-left]');
    var meter = $('[data-seats-meter]');
    var card = $('#tariff-lichnoe');
    var f = F();
    if (f && f.CONFIG && f.CONFIG.tariffs && f.CONFIG.tariffs.lichnoe) f.CONFIG.tariffs.lichnoe.seatsLeft = left; // синхронно с main.js
    var has = typeof left === 'number' && left >= 0 && typeof total === 'number' && total > 0;
    if (line) {
      line.hidden = !has;
      if (has) line.textContent = left > 0 ? 'Осталось ' + left + ' из ' + total : 'Места на этот поток закончились';
    }
    if (meter) {
      meter.hidden = !has || left === 0;
      if (has && !meter.children.length) {
        var taken = Math.max(0, total - left);
        for (var i = 0; i < total; i += 1) {
          var seg = doc.createElement('i');
          if (i >= taken) { seg.className = 'is-free'; seg.style.setProperty('--i', i - taken); }
          meter.appendChild(seg);
        }
      }
    }
    // «Мест нет» — только по реальным данным: карточка приглушена, оплата недоступна
    if (card) {
      var sold = has && left === 0;
      card.classList.toggle('is-soldout', sold);
      $$('[data-pay]', card).forEach(function (b) { b.disabled = sold; });
    }
  }

  function renderEnrolled() {
    var n = BOTTOM_CONFIG.enrolledCount;
    var box = $('[data-enrolled]');
    if (!box) return;
    var ok = typeof n === 'number' && n > 0 && phaseNow() !== 'started';
    box.hidden = !ok;
    if (ok) {
      var txt = $('[data-enrolled-text]', box);
      if (txt) {
        txt.textContent = 'Уже ' + plural(n, 'записалась', 'записались', 'записались') + ' ' + fmt(n) + ' ' +
          plural(n, 'девушка', 'девушки', 'девушек') + ' на поток ' + BOTTOM_CONFIG.enrolledStream;
      }
    }
  }

  function renderPerDay() {
    var f = F();
    $$('[data-per-day]').forEach(function (el) {
      var key = el.getAttribute('data-per-day');
      var t = f && f.CONFIG && f.CONFIG.tariffs && f.CONFIG.tariffs[key];
      if (!t) return;
      var price = phaseNow() === 'early' ? t.price.early : t.price.regular;
      el.textContent = '≈ ' + fmt(price / BOTTOM_CONFIG.programDays) + ' ₽ в день';
    });
  }

  function renderProof() {
    var box = $('[data-proof]');
    if (!box) return;
    var r = BOTTOM_CONFIG.rating;
    var rating = $('.proof__rating', box);
    var text = $('[data-rating-text]', box);
    var link = $('[data-reviews-link]', box);
    if (rating) rating.hidden = !r;
    if (r && text) {
      text.textContent = r.value + ' из 5 по ' + fmt(r.count) + ' ' + plural(r.count, 'оценке', 'оценкам', 'оценкам') +
        ' выпускниц потоков ' + r.period;
    }
    if (link) {
      link.hidden = !BOTTOM_CONFIG.reviewsUrl;
      if (BOTTOM_CONFIG.reviewsUrl) link.href = BOTTOM_CONFIG.reviewsUrl;
    }
    box.hidden = !r && !BOTTOM_CONFIG.reviewsUrl;
  }

  function renderAll() { renderSeats(); renderEnrolled(); renderPerDay(); renderProof(); }

  /* ===================================================================
     3. Счётчики «−4–7 кг», «−6–10 см»: числа считаются от 0, ширина зафиксирована (tabular-nums + ch)
     =================================================================== */
  function initCounters() {
    var values = $$('#rezultaty [data-count]');
    if (!values.length) return;
    var groups = values.map(function (el) {
      var src = el.textContent;
      var parts = src.split(/(\d+)/); // «−», «4», «–», «7», ""
      el.textContent = '';
      var nums = [];
      parts.forEach(function (p) {
        if (!p) return;
        if (/^\d+$/.test(p)) {
          var s = doc.createElement('span');
          s.className = 'stats__n';
          s.style.minWidth = p.length + 'ch';
          s.textContent = reduce ? p : '0';
          s.setAttribute('data-to', p);
          el.appendChild(s);
          nums.push(s);
        } else {
          el.appendChild(doc.createTextNode(p));
        }
      });
      el.setAttribute('aria-label', src);
      return nums;
    });
    if (reduce) return;
    once($('#rezultaty .stats'), function () {
      var dur = BOTTOM_CONFIG.countDuration, t0 = null;
      var all = [].concat.apply([], groups);
      function tick(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - k, 2); // power2.out
        all.forEach(function (s) { s.textContent = String(Math.round(Number(s.getAttribute('data-to')) * e)); });
        if (k < 1) requestAnimationFrame(tick);
      }
      setTimeout(function () { requestAnimationFrame(tick); }, 200);
    }, { threshold: 0.5 });
  }

  /* ===================================================================
     4. Появление
     =================================================================== */
  function initReveal() {
    // Отзывы-скриншоты: пузырь «приходит», затем галочки становятся «прочитано»
    var chats = $$('.review--chat');
    once(chats, function (c) {
      var i = chats.indexOf(c);
      var d = reduce ? 0 : 250 + i * 180;
      setTimeout(function () {
        c.classList.add('is-shown');
        setTimeout(function () { c.classList.add('is-read'); }, reduce ? 0 : 700);
      }, d);
    });

    // Печать «14 дней на возврат»: «штамп» после появления карточек + цель
    once($('[data-seal]'), function (s) {
      setTimeout(function () { s.classList.add('is-stamped'); }, reduce ? 0 : 900);
      goal('tariff_badge_view', { badge: 'refund_14' });
    }, { threshold: 0.6 });

    // Шкала мест
    once($('[data-seats-meter]'), function (m) { setTimeout(function () { m.classList.add('is-shown'); }, reduce ? 0 : 700); });

    // Фото Анны в FAQ
    once($('.faq__media'), function (m) { m.classList.add('is-shown'); });

    // Пункты «Входит» в карточках — мягкий каскад после карточек (GSAP есть — используем его)
    var gsap = window.gsap;
    var list = $('#tarify .tariffs__list');
    if (gsap && list && !reduce) {
      var items = $$('.tariff__list li', list);
      gsap.set(items, { opacity: 0, y: 8 });
      once(list, function () {
        gsap.to(items, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.025, delay: 0.45, clearProps: 'transform,opacity' });
      }, { rootMargin: '0px 0px -15% 0px' });
    }
  }

  /* ===================================================================
     5. Модалка видео-отзыва (ДЕМО: видео ещё не снято)
     Свои ловушка фокуса и Esc; окно — общие классы .overlay из styles.css.
     ПРОД: когда видео будет готово — вставить <video controls preload="none" poster="…"> в .vmodal__window
     вместо текста (или iframe Kinescope/VK Видео) и убрать фразу «появится после съёмки».
     =================================================================== */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var Modal = {
    el: null, opener: null, inerted: [],
    build: function () {
      var m = doc.createElement('div');
      m.className = 'overlay vmodal';
      m.id = 'video-modal';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', 'vmodal-title');
      m.setAttribute('aria-describedby', 'vmodal-text');
      m.hidden = true;
      m.innerHTML =
        '<div class="overlay__backdrop" data-vmodal-close></div>' +
        '<div class="overlay__window vmodal__window">' +
          '<button class="overlay__close" type="button" data-vmodal-close aria-label="Закрыть">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          '</button>' +
          '<p class="vmodal__eyebrow">Видео-отзыв</p>' +
          '<h2 class="vmodal__title" id="vmodal-title">Видео-отзыв появится после съёмки</h2>' +
          '<p class="vmodal__text" id="vmodal-text">Скоро здесь будет история Кати: как она впервые довела программу до конца. А пока посмотри фото до и после выпускниц выше.</p>' +
          '<button class="btn btn--primary" type="button" data-vmodal-close>Понятно</button>' +
        '</div>';
      doc.body.appendChild(m);
      this.el = m;
      var self = this;
      $$('[data-vmodal-close]', m).forEach(function (b) { b.addEventListener('click', function () { self.close(); }); });
      m.addEventListener('keydown', function (e) { self.onKey(e); });
    },
    open: function (opener) {
      if (!this.el) this.build();
      var m = this.el, self = this;
      if (!m.hidden) return;
      this.opener = opener || doc.activeElement;
      m.hidden = false;
      m.classList.remove('is-closing');
      this.inerted = [];
      Array.prototype.forEach.call(doc.body.children, function (c) {
        if (c === m || c.tagName === 'SCRIPT' || c.hasAttribute('inert')) return;
        c.setAttribute('inert', ''); self.inerted.push(c);
      });
      root.classList.add('is-locked');
      requestAnimationFrame(function () { requestAnimationFrame(function () { m.classList.add('is-open'); }); });
      setTimeout(function () { var b = $('.btn', m); if (b) b.focus({ preventScroll: true }); }, 30);
      goal('video_review_open', { review: 'katya' });
    },
    close: function () {
      var m = this.el, self = this;
      if (!m || m.hidden || m.classList.contains('is-closing')) return;
      m.classList.remove('is-open');
      m.classList.add('is-closing');
      setTimeout(function () {
        m.hidden = true;
        m.classList.remove('is-closing');
        self.inerted.forEach(function (c) { c.removeAttribute('inert'); });
        self.inerted = [];
        // не снимаем блокировку, если открыт другой оверлей main.js
        if (!$('.overlay.is-open:not(.vmodal)')) root.classList.remove('is-locked');
        if (self.opener && doc.contains(self.opener)) self.opener.focus({ preventScroll: true });
      }, reduce ? 0 : 240);
    },
    onKey: function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (e.key !== 'Tab') return;
      var items = $$(FOCUSABLE, this.el).filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) { e.preventDefault(); return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  function initVideoReview() {
    $$('[data-video-review]').forEach(function (b) {
      b.addEventListener('click', function () { Modal.open(b); });
    });
  }

  /* ===================================================================
     6. Цели
     =================================================================== */
  function initGoals() {
    var link = $('[data-reviews-link]');
    if (link) link.addEventListener('click', function () { goal('reviews_link', { placement: 'results' }); });
  }

  /* ===================================================================
     7. Запуск (после init() из main.js — он подписан на DOMContentLoaded раньше)
     =================================================================== */
  function init() {
    renderAll();
    doc.addEventListener('forma:phase', renderAll);
    initCounters();
    initReveal();
    initVideoReview();
    initGoals();
    window.FORMA_BOTTOM = { CONFIG: BOTTOM_CONFIG, render: renderAll, openVideoReview: function () { Modal.open(null); } };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
