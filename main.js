/* =====================================================================
   ФОРМА — «Перезагрузка за 8 недель»
   main.js — вся логика страницы (без анимаций; анимации — animations.js).
   Vanilla JS, без зависимостей. Подключается с defer.

   Разделы:
    1. CONFIG — даты, цены, бот, аналитика (всё, что меняется перед запуском)
    2. Утилиты
    3. Аналитика: goal() и подключение Метрики
    4. UTM и источник перехода
    5. Фаза потока (ранняя цена / обычная / поток стартовал) и цены
    6. Таймер
    7. Шапка, навигация, цели кнопок
    8. Цели «блок на 50% в кадре» и глубина прокрутки
    9. Вкладки (сегменты блока 2 и кейсы блока 5)
   10. Слайдер до/после
   11. Аккордеон FAQ
   12. Экран чата: таймкоды
   13. Тарифы: подсветка карточки, кнопки оплаты
   14. Оверлеи: ловушка фокуса, Esc, блокировка прокрутки
   15. Форма оплаты + handlePayment()
   16. Квиз «Твой старт»
   17. Ссылки в Telegram-бота
   18. Exit pop-up
   19. Запуск
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     1. CONFIG
     =================================================================== */
  var CONFIG = {
    // Даты потока. Время — московское (+03:00). Таймер считает до этих дат и не перезапускается.
    dates: {
      priceRise: '2026-10-28T00:00:00+03:00', // с этого момента цены выше (ранняя цена — до 27.10, 23:59 мск)
      start:     '2026-11-02T00:00:00+03:00', // старт потока; до него можно записаться (продажи до 1.11 включительно)
      finish:    '2026-12-27'                 // финиш (для справки и микроразметки)
    },

    // Telegram. ПРОД: заменить на реальные имена
    telegram: {
      bot: 'forma_bot',          // демо-имя бота
      support: 'forma_help',     // поддержка
      // Необязательный endpoint: при клике в бота отправляем visitor_id + UTM (navigator.sendBeacon),
      // чтобы бот по start-параметру нашёл источник. null — не отправляем.
      linkEndpoint: null
    },

    // Тарифы. price.early — до 27.10, price.regular — с 28.10. parts — на сколько частей делится «Долями»
    tariffs: {
      sama:    { name: 'Сама',           price: { early: 4900,  regular: 5900  }, parts: 4 },
      kurator: { name: 'С куратором',    price: { early: 9900,  regular: 11900 }, parts: 4 },
      lichnoe: { name: 'Личное ведение', price: { early: 24900, regular: 29900 }, parts: 4,
                 seatsTotal: 20,
                 seatsLeft: null }        // ТОЛЬКО реальные данные (из CRM/API). null — строка остатка скрыта
    },

    analytics: {
      metrikaId: null,           // ПРОД: ID счётчика Яндекс.Метрики, например 12345678
      // Лог целей в консоль: на localhost и при открытии файла — да
      debug: /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname)
    },

    hero: { variant: 'A' },      // вариант заголовка первого экрана для A/B (параметр целей hero_*)

    quiz: {
      storage: 'session',        // где хранить ответы: 'session' (sessionStorage) или 'local' (localStorage)
      storageKey: 'forma_quiz_v1',
      autoNextDelay: 300,        // мс: клик по варианту → следующий вопрос
      loadingMin: 600,           // мс: экран «Собираем твой старт…»
      loadingMax: 800
    },

    exitPopup: {
      minDelay: 15000,           // не показывать в первые 15 секунд
      storageKey: 'forma_exit_shown'
    },

    ui: {
      highlightDuration: 3000,   // мс: сколько держится подсветка карточки тарифа (.is-highlighted)
      tgFallbackDelay: 1200      // мс: через сколько показать «Не открылся Telegram?»
    },

    payment: {
      // Демо-исход заглушки handlePayment: 'success' | 'fail' | 'network'.
      // Для проверки можно передать в URL ?demo_payment=fail или ?demo_payment=network
      demoOutcome: 'success',
      demoDelay: 900
    },

    testing: {
      // ?now=2026-10-30T12:00:00+03:00 — посмотреть страницу «как в другой день» (фазы таймера).
      // ПРОД: можно оставить, на реальные цены и оплату не влияет — только на отображение
      allowNowParam: true
    }
  };

  /* ===================================================================
     2. Утилиты
     =================================================================== */
  var doc = document;
  var root = doc.documentElement;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function emit(name, detail) {
    try { doc.dispatchEvent(new CustomEvent('forma:' + name, { detail: detail || {} })); } catch (e) { /* старые браузеры */ }
  }
  var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function scrollBehavior() { return reducedMotion.matches ? 'auto' : 'smooth'; }

  // Безопасная работа с хранилищами (приватный режим, запрет cookies)
  function store(type) {
    var s = null;
    try { s = type === 'local' ? window.localStorage : window.sessionStorage; s.setItem('__t', '1'); s.removeItem('__t'); } catch (e) { s = null; }
    return {
      get: function (k) { try { var v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
      set: function (k, v) { try { s && s.setItem(k, JSON.stringify(v)); } catch (e) { /* место кончилось */ } },
      remove: function (k) { try { s && s.removeItem(k); } catch (e) { /* ничего */ } }
    };
  }
  var local = store('local');
  var session = store('session');

  var NBSP = ' ';
  // 4900 → «4 900 ₽» (неразрывные пробелы)
  function formatPrice(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
  }
  // Склонение: plural(5, 'день', 'дня', 'дней')
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function randomId(len) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', out = '';
    var arr = new Uint8Array(len);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (var i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < len; j++) out += chars[arr[j] % chars.length];
    return out;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var params = new URLSearchParams(location.search);

  /* ===================================================================
     3. Аналитика
     goal(name, params) — безопасна без Метрики: если счётчика нет, ничего не ломается.
     =================================================================== */
  var goalLog = [];
  window.__formaGoals = goalLog; // для QA: список отправленных целей

  function goal(name, data) {
    var payload = data || {};
    goalLog.push({ name: name, params: payload, t: Date.now() });
    try {
      if (CONFIG.analytics.metrikaId && typeof window.ym === 'function') {
        window.ym(CONFIG.analytics.metrikaId, 'reachGoal', name, payload);
      }
    } catch (e) { /* Метрика не должна ломать страницу */ }
    if (CONFIG.analytics.debug && window.console) console.info('[goal]', name, payload);
    emit('goal', { name: name, params: payload });
  }

  // Подключение Яндекс.Метрики. Срабатывает, только если задан CONFIG.analytics.metrikaId
  function initMetrika() {
    var id = CONFIG.analytics.metrikaId;
    if (!id) return;
    /* Стандартный код счётчика Метрики */
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, doc, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }

  /* ===================================================================
     4. UTM и источник перехода
     Хранятся в localStorage: utm_*, yclid, внешний реферер, первая страница, короткий visitor_id.
     Уходят скрытыми полями в форму оплаты и коротким ID в start-параметр бота.
     =================================================================== */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];
  var Tracking = {
    key: 'forma_tracking_v1',
    data: {},
    init: function () {
      var d = local.get(this.key) || {};
      var fresh = {}, hasFresh = false;
      UTM_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) { fresh[k] = v.slice(0, 200); hasFresh = true; }
      });
      // Новые метки перезаписывают старые целиком (последний рекламный переход)
      if (hasFresh) { UTM_KEYS.forEach(function (k) { d[k] = fresh[k] || ''; }); d.utm_at = new Date().toISOString(); }
      if (!d.visitor_id) d.visitor_id = randomId(8);
      // Реферер — только внешний, первый
      if (!d.referrer && doc.referrer) {
        try { if (new URL(doc.referrer).host !== location.host) d.referrer = doc.referrer.slice(0, 500); } catch (e) { /* битый URL */ }
      }
      if (!d.landing_page) d.landing_page = (location.origin + location.pathname + location.search).slice(0, 500);
      this.data = d;
      local.set(this.key, d);
    },
    // Поля для заявки/оплаты
    fields: function () {
      var d = this.data, out = {};
      UTM_KEYS.forEach(function (k) { out[k] = d[k] || ''; });
      out.referrer = d.referrer || '';
      out.landing_page = d.landing_page || '';
      out.visitor_id = d.visitor_id || '';
      return out;
    }
  };

  /* ===================================================================
     5. Фаза потока и цены
     early   — до 28.10 00:00 мск: ранняя цена, таймер «До повышения цены»
     regular — 28.10–1.11: обычная цена, таймер «До старта потока»
     started — со 2.11: таймер заменён на бота, запись закрыта
     =================================================================== */
  var timeOffset = 0; // для ?now=
  (function initNowParam() {
    if (!CONFIG.testing.allowNowParam) return;
    var p = params.get('now');
    if (!p) return;
    var t = Date.parse(p);
    if (!isNaN(t)) timeOffset = t - Date.now();
  })();
  function now() { return Date.now() + timeOffset; }

  var T_RISE = Date.parse(CONFIG.dates.priceRise);
  var T_START = Date.parse(CONFIG.dates.start);
  var phase = null;

  function getPhase() {
    var t = now();
    if (t < T_RISE) return 'early';
    if (t < T_START) return 'regular';
    return 'started';
  }
  function priceOf(key) {
    var t = CONFIG.tariffs[key];
    return phase === 'early' ? t.price.early : t.price.regular;
  }
  function partsOf(key) {
    var t = CONFIG.tariffs[key];
    return t.parts + NBSP + '×' + NBSP + formatPrice(priceOf(key) / t.parts);
  }

  function applyPhase() {
    var p = getPhase();
    if (p === phase) return;
    phase = p;
    root.setAttribute('data-phase', p);
    // Любой элемент с data-phase-show="early regular" виден только в перечисленных фазах
    $$('[data-phase-show]').forEach(function (el) {
      var list = el.getAttribute('data-phase-show').split(/\s+/);
      el.hidden = list.indexOf(p) === -1;
    });
    renderPrices();
    emit('phase', { phase: p });
  }

  function renderPrices() {
    $$('[data-price]').forEach(function (el) {
      var k = el.getAttribute('data-price');
      if (CONFIG.tariffs[k]) el.textContent = formatPrice(priceOf(k));
    });
    $$('[data-parts]').forEach(function (el) {
      var k = el.getAttribute('data-parts');
      if (CONFIG.tariffs[k]) el.textContent = partsOf(k);
    });
    $$('[data-price-next]').forEach(function (el) {
      var k = el.getAttribute('data-price-next');
      if (CONFIG.tariffs[k]) el.textContent = formatPrice(CONFIG.tariffs[k].price.regular);
    });
    // Остаток мест — только если есть реальное число
    var seats = $('[data-seats-left]');
    var left = CONFIG.tariffs.lichnoe.seatsLeft;
    if (seats) {
      if (typeof left === 'number' && left >= 0) {
        seats.textContent = 'Осталось ' + left + ' ' + plural(left, 'место', 'места', 'мест'); // [демо-текст строки]
        seats.hidden = false;
      } else {
        seats.hidden = true;
      }
    }
  }

  /* ===================================================================
     6. Таймер
     =================================================================== */
  var Timer = {
    el: null, last: '',
    init: function () {
      this.el = $('[data-timer]');
      this.tick();
      var self = this;
      setInterval(function () { self.tick(); }, 1000);
    },
    tick: function () {
      applyPhase(); // фаза может смениться прямо на открытой странице
      if (!this.el || phase === 'started') return;
      var target = phase === 'early' ? T_RISE : T_START;
      var totalMin = Math.max(0, Math.floor((target - now()) / 60000));
      var d = Math.floor(totalMin / 1440);
      var h = Math.floor((totalMin % 1440) / 60);
      var m = totalMin % 60;
      var key = d + ':' + h + ':' + m;
      if (key === this.last) return;
      this.last = key;
      this.set('days', d, ['день', 'дня', 'дней']);
      this.set('hours', h, ['час', 'часа', 'часов']);
      this.set('minutes', m, ['минута', 'минуты', 'минут']);
      emit('timer', { days: d, hours: h, minutes: m });
    },
    set: function (unit, val, forms) {
      var v = $('[data-timer-value="' + unit + '"]', this.el);
      var u = $('[data-timer-unit="' + unit + '"]', this.el);
      if (v) v.textContent = pad2(val);
      if (u) u.textContent = plural(val, forms[0], forms[1], forms[2]);
    }
  };

  /* ===================================================================
     7. Шапка, навигация, цели кнопок
     =================================================================== */
  var currentSection = 'hero';
  var lastSegment = ''; // последняя выбранная вкладка блока 2 (для целей)

  function initSectionTracking() {
    if (!('IntersectionObserver' in window)) return;
    // Секция, пересекающая середину экрана, — «текущая»
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          currentSection = e.target.getAttribute('data-section');
          $$('.header__link').forEach(function (a) {
            var on = a.getAttribute('href') === '#' + e.target.id;
            a.classList.toggle('is-current', on);
            if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
          });
          emit('section', { section: currentSection });
        }
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    $$('[data-section]').forEach(function (s) { io.observe(s); });

    // Шапка после первого экрана получает .is-scrolled
    var header = $('[data-header]');
    var hero = $('.hero');
    if (header && hero) {
      new IntersectionObserver(function (entries) {
        header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
      }, { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
    }
  }

  function initGoalLinks() {
    $$('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function () { goal('nav_click', { item: a.getAttribute('data-nav') }); });
    });
    $$('[data-goal]').forEach(function (el) {
      el.addEventListener('click', function () {
        var name = el.getAttribute('data-goal');
        var p = {};
        if (name === 'header_cta') p.section = currentSection;
        if (name === 'hero_cta') p.variant = CONFIG.hero.variant;
        if (name === 'block2_cta') p.segment = lastSegment || 'office';
        goal(name, p);
      });
    });
  }

  /* ===================================================================
     8. «Блок на 50% в кадре» и глубина прокрутки
     50% считаем от меньшего из (высота блока, высота окна) — так цель срабатывает и у высоких блоков.
     =================================================================== */
  function onHalfVisible(el, cb) {
    if (!el || !('IntersectionObserver' in window)) return;
    var th = []; for (var i = 0; i <= 20; i++) th.push(i / 20);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var vh = e.rootBounds ? e.rootBounds.height : window.innerHeight;
        var need = Math.min(e.boundingClientRect.height, vh) * 0.5;
        if (e.intersectionRect.height >= need - 1) { io.disconnect(); cb(); }
      });
    }, { threshold: th });
    io.observe(el);
  }

  function initViewGoals() {
    onHalfVisible($('[data-weeks]'), function () { goal('program_view'); });
    onHalfVisible($('[data-chat]'), function () { goal('tech_check_view'); });
    onHalfVisible($('#tarify'), function () { goal('tariffs_view'); });
    $$('.day').forEach(function (fig) {
      onHalfVisible(fig, function () { goal('day_timeline_view', { segment: fig.getAttribute('data-day') }); });
    });

    var sent50 = false, sent90 = false, ticking = false;
    function check() {
      ticking = false;
      var h = root.scrollHeight;
      var pct = (window.scrollY + window.innerHeight) / h;
      if (!sent50 && pct >= 0.5) { sent50 = true; goal('scroll_50'); }
      if (!sent90 && pct >= 0.9) { sent90 = true; goal('scroll_90'); window.removeEventListener('scroll', onScroll); }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ===================================================================
     9. Вкладки (WAI-ARIA Tabs, автоматическая активация)
     Стрелки влево/вправо, Home, End. Без JS все панели видны.
     =================================================================== */
  function initTabs(tablist, onChange) {
    var tabs = $$('[role="tab"]', tablist);
    function panelOf(tab) { return doc.getElementById(tab.getAttribute('aria-controls')); }

    function select(tab, opts) {
      opts = opts || {};
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        t.classList.toggle('is-active', on);
        var p = panelOf(t);
        if (p) { p.hidden = !on; p.classList.toggle('is-active', on); }
      });
      if (opts.focus) tab.focus();
      if (onChange && !opts.silent) onChange(tab, panelOf(tab));
    }

    tablist.addEventListener('click', function (e) {
      var tab = e.target.closest('[role="tab"]');
      if (tab && tab.getAttribute('aria-selected') !== 'true') select(tab);
    });
    tablist.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(doc.activeElement);
      if (i === -1) return;
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, { focus: true }); }
    });

    var initial = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
    select(initial, { silent: true });
    return { select: select, tabs: tabs };
  }

  function initSegments() {
    var list = $('[data-tabs]');
    if (!list) return;
    var section = list.closest('.segments');
    function setLight(panel) {
      // data-light на секции: morning / day / evening — цвет и угол луча (animations.js / styles.css)
      if (section && panel) section.setAttribute('data-light', panel.getAttribute('data-light') || 'morning');
    }
    var api = initTabs(list, function (tab, panel) {
      lastSegment = tab.getAttribute('data-segment');
      setLight(panel);
      goal('segment_switch', { segment: lastSegment });
      emit('tabchange', { group: 'segments', segment: lastSegment, tab: tab, panel: panel });
    });
    var active = api.tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
    if (active) setLight(doc.getElementById(active.getAttribute('aria-controls')));
  }

  function initCases() {
    var wrap = $('[data-cases]');
    if (!wrap) return;
    var list = $('[role="tablist"]', wrap);
    initTabs(list, function (tab, panel) {
      emit('tabchange', { group: 'cases', caseNo: tab.getAttribute('data-case'), tab: tab, panel: panel });
    });
    $$('[data-ba]', wrap).forEach(function (ba) {
      initBeforeAfter(ba, ba.closest('[data-case]').getAttribute('data-case'), wrap);
    });
  }

  /* ===================================================================
     10. Слайдер до/после
     Позиция — CSS-переменная --pos (0…100) на .ba. Мышь, касание (Pointer Events), клавиатура.
     Для касаний в CSS нужно: .ba { touch-action: pan-y; } — вертикальная прокрутка страницы остаётся.
     =================================================================== */
  function initBeforeAfter(ba, caseNo, wrap) {
    var handle = $('.ba__handle', ba);
    var pos = 50, dragging = false, moved = false, goalSent = false, startX = 0, pid = null;

    function set(p) {
      pos = Math.round(clamp(p, 0, 100));
      ba.style.setProperty('--pos', pos);
      if (handle) {
        handle.setAttribute('aria-valuenow', pos);
        handle.setAttribute('aria-valuetext', pos + '%');
      }
    }
    function fromEvent(e) {
      var r = ba.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    }
    function interacted() {
      wrap.classList.add('is-interacted'); // прячет подсказку «Потяни, чтобы сравнить»
      if (!goalSent) { goalSent = true; goal('before_after_drag', { 'case': Number(caseNo) }); }
    }

    ba.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; moved = false; startX = e.clientX; pid = e.pointerId;
      try { ba.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
      ba.classList.add('is-dragging');
      // мышь: клик сразу двигает границу; касание — только после явного горизонтального движения
      if (e.pointerType === 'mouse') { set(fromEvent(e)); moved = true; }
    });
    ba.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pid) return;
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true;
      set(fromEvent(e));
    });
    function end(e) {
      if (!dragging || (e && e.pointerId !== pid)) return;
      dragging = false;
      ba.classList.remove('is-dragging');
      if (moved) interacted();
    }
    ba.addEventListener('pointerup', end);
    ba.addEventListener('pointercancel', end);
    ba.addEventListener('lostpointercapture', end);

    if (handle) {
      handle.addEventListener('keydown', function (e) {
        var step = e.shiftKey ? 10 : 5, next = null;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pos - step;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pos + step;
        else if (e.key === 'PageDown') next = pos - 20;
        else if (e.key === 'PageUp') next = pos + 20;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = 100;
        if (next !== null) { e.preventDefault(); set(next); interacted(); }
      });
    }
    set(50);
  }

  /* ===================================================================
     11. Аккордеон FAQ
     Без JS все ответы раскрыты. С JS свёрнуты; можно открыть несколько.
     =================================================================== */
  function initAccordion() {
    var acc = $('[data-accordion]');
    if (!acc) return;
    var items = $$('.accordion__item', acc);
    function setOpen(item, open) {
      var btn = $('.accordion__trigger', item);
      var panel = doc.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      item.classList.toggle('is-open', open);
      panel.hidden = !open;
    }
    items.forEach(function (item) {
      setOpen(item, false);
      $('.accordion__trigger', item).addEventListener('click', function () {
        var open = this.getAttribute('aria-expanded') !== 'true';
        setOpen(item, open);
        if (open) goal('faq_open', { q: Number(item.getAttribute('data-q')) });
        emit('accordion', { item: item, open: open });
      });
    });
  }

  /* ===================================================================
     12. Экран чата: таймкоды
     Наведение / фокус / клик по таймкоду → метка на шкале видео .is-active, видео .is-scrubbing.
     Клик закрепляет подсветку (aria-pressed="true"), повторный клик снимает.
     =================================================================== */
  function initChat() {
    var chat = $('[data-chat]');
    if (!chat) return;
    var buttons = $$('.chat__tc', chat);
    var video = $('[data-video="first"]', chat);
    var pinned = null;
    var sent = {};

    function show(tc) {
      $$('.video__mark', chat).forEach(function (m) { m.classList.toggle('is-active', m.getAttribute('data-mark') === tc); });
      buttons.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-tc') === tc); });
      if (video) {
        video.classList.toggle('is-scrubbing', !!tc);
        var mark = tc ? $('.video__mark[data-mark="' + tc + '"]', chat) : null;
        if (mark) video.style.setProperty('--scrub', mark.style.getPropertyValue('--at'));
      }
      chat.classList.toggle('has-active-tc', !!tc);
      emit('timecode', { tc: tc || null });
      if (tc && !sent[tc]) { sent[tc] = true; goal('tech_check_timecode', { tc: tc }); }
    }

    buttons.forEach(function (b) {
      var tc = b.getAttribute('data-tc');
      b.addEventListener('mouseenter', function () { if (!pinned) show(tc); });
      b.addEventListener('mouseleave', function () { if (!pinned) show(null); });
      b.addEventListener('focus', function () { if (!pinned) show(tc); });
      b.addEventListener('blur', function () { if (!pinned) show(null); });
      b.addEventListener('click', function () {
        pinned = pinned === tc ? null : tc;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-tc') === pinned ? 'true' : 'false'); });
        show(pinned || tc);
        if (!pinned) show(null);
      });
    });
  }

  /* ===================================================================
     13. Тарифы
     =================================================================== */
  var engagedKey = 'forma_engaged'; // был клик по тарифу, в бота или открыт квиз → exit pop-up не показываем
  function markEngaged() { session.set(engagedKey, 1); }

  var highlightTimers = {};
  // Подсветить карточку тарифа на CONFIG.ui.highlightDuration (класс .is-highlighted)
  function highlightTariff(key) {
    var card = $('.tariff[data-tariff="' + key + '"]');
    if (!card) return;
    card.classList.remove('is-highlighted');
    void card.offsetWidth; // перезапуск CSS-анимации подсветки
    card.classList.add('is-highlighted');
    clearTimeout(highlightTimers[key]);
    highlightTimers[key] = setTimeout(function () { card.classList.remove('is-highlighted'); }, CONFIG.ui.highlightDuration);
    emit('tariffhighlight', { tariff: key, card: card });
  }
  // Метка «Тебе подходит по квизу» над рекомендованной карточкой (класс .is-recommended)
  function setRecommended(key) {
    $$('.tariff').forEach(function (card) {
      var on = card.getAttribute('data-tariff') === key;
      card.classList.toggle('is-recommended', on);
      var badge = $('.tariff__quiz-badge', card);
      if (badge) badge.hidden = !on;
    });
  }
  function scrollToTariffs(key) {
    var target = key ? $('.tariff[data-tariff="' + key + '"]') : $('#tarify');
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: key ? 'center' : 'start' });
  }

  function initTariffs() {
    $$('[data-pay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tariff = btn.getAttribute('data-pay');
        var method = btn.getAttribute('data-method') || 'full';
        markEngaged();
        goal('tariff_click', { tariff: tariff, method: method });
        Checkout.open(tariff, method, 'card', btn);
      });
    });
    // «Хочу с куратором» (блок 4) и подобные: переход к тарифам + подсветка карточки
    $$('[data-highlight-tariff]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var key = el.getAttribute('data-highlight-tariff');
        e.preventDefault();
        scrollToTariffs(key);
        highlightTariff(key);
        if (history.replaceState) history.replaceState(null, '', '#tarify');
      });
    });
  }

  /* ===================================================================
     14. Оверлеи (квиз, форма оплаты, pop-up)
     Открытие: снимается hidden, на следующем кадре ставится .is-open (для CSS/GSAP-перехода).
     Закрытие: снимается .is-open, ставится .is-closing, после transition — hidden.
     Остальная страница получает inert, html — .is-locked (блокировка прокрутки).
     =================================================================== */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var Overlay = {
    stack: [],
    inerted: [],
    open: function (el, opts) {
      opts = opts || {};
      if (this.stack.some(function (s) { return s.el === el; })) return;
      var entry = { el: el, opener: opts.opener || doc.activeElement, onEsc: opts.onEsc || null, onClose: opts.onClose || null };
      this.stack.push(entry);
      el.hidden = false;
      el.classList.remove('is-closing');
      this.setInert(el);
      root.classList.add('is-locked');
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-open'); }); });
      var focusTarget = opts.focus || $(FOCUSABLE, el);
      if (focusTarget) setTimeout(function () { focusTarget.focus({ preventScroll: true }); }, 30);
      emit('overlay', { id: el.id, open: true, el: el });
    },
    close: function (el, opts) {
      opts = opts || {};
      var idx = -1;
      this.stack.forEach(function (s, i) { if (s.el === el) idx = i; });
      if (idx === -1) return Promise.resolve();
      var entry = this.stack.splice(idx, 1)[0];
      el.classList.remove('is-open');
      el.classList.add('is-closing');
      var self = this;
      var delay = transitionTime(el);
      emit('overlay', { id: el.id, open: false, el: el });
      return wait(delay).then(function () {
        el.hidden = true;
        el.classList.remove('is-closing');
        if (!self.stack.length) {
          self.clearInert();
          root.classList.remove('is-locked');
        } else {
          self.setInert(self.stack[self.stack.length - 1].el);
        }
        if (opts.restoreFocus !== false && entry.opener && doc.contains(entry.opener) && typeof entry.opener.focus === 'function') {
          entry.opener.focus({ preventScroll: true });
        }
        if (entry.onClose) entry.onClose();
      });
    },
    top: function () { return this.stack[this.stack.length - 1] || null; },
    isOpen: function () { return this.stack.length > 0; },
    setInert: function (active) {
      this.clearInert();
      var self = this;
      Array.prototype.forEach.call(doc.body.children, function (child) {
        if (child === active || child.tagName === 'SCRIPT') return;
        if (!child.hasAttribute('inert')) { child.setAttribute('inert', ''); self.inerted.push(child); }
      });
    },
    clearInert: function () {
      this.inerted.forEach(function (el) { el.removeAttribute('inert'); });
      this.inerted = [];
    }
  };

  // Самая долгая transition/animation внутри оверлея (чтобы не обрезать анимацию закрытия). Максимум 1 с.
  function transitionTime(el) {
    var max = 0;
    [el, $('.overlay__window', el)].forEach(function (node) {
      if (!node) return;
      var cs = getComputedStyle(node);
      var d = (cs.transitionDuration || '0s').split(',').map(parseTime);
      var dl = (cs.transitionDelay || '0s').split(',').map(parseTime);
      d.forEach(function (v, i) { max = Math.max(max, v + (dl[i] || 0)); });
    });
    return Math.min(max, 1000);
  }
  function parseTime(s) { s = s.trim(); return s.indexOf('ms') > -1 ? parseFloat(s) : parseFloat(s) * 1000 || 0; }

  // Ловушка фокуса и Esc — общие для всех оверлеев
  doc.addEventListener('keydown', function (e) {
    var top = Overlay.top();
    if (!top) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      if (top.onEsc) top.onEsc(); else Overlay.close(top.el);
      return;
    }
    if (e.key === 'Tab') {
      var items = $$(FOCUSABLE, top.el).filter(function (n) { return n.offsetParent !== null || n === doc.activeElement; });
      if (!items.length) { e.preventDefault(); return; }
      var first = items[0], last = items[items.length - 1];
      if (!top.el.contains(doc.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ===================================================================
     15. Форма оплаты
     =================================================================== */

  /**
   * handlePayment(tariff, mode, data) — ЗАГЛУШКА платёжки. Возвращает Promise:
   *   { status: 'redirect', url }  — уйти на страницу оплаты (боевой вариант)
   *   { status: 'success' }        — оплата прошла (демо)
   *   { status: 'fail' }           — платёж отклонён (демо)
   *   throw                        — сбой сети → «Не получилось отправить…»
   *
   * tariff: 'sama' | 'kurator' | 'lichnoe'; mode: 'full' | 'dolyami';
   * data: имя, email, телефон, цена, UTM, реферер, visitor_id, ответы квиза.
   *
   * Как подключить (секретные ключи — ТОЛЬКО на сервере, не в этом файле):
   *
   * ЮKassa:
   *   1) Свой endpoint, например POST /api/pay, принимает data.
   *   2) Сервер создаёт платёж через API ЮKassa (POST https://api.yookassa.ru/v3/payments,
   *      amount = цена тарифа, confirmation.type = 'redirect',
   *      return_url = 'https://<домен>/?payment=success&tariff=<tariff>&method=<mode>',
   *      metadata = { tariff, visitor_id, utm_* }, receipt — для чека по 54-ФЗ на data.email).
   *   3) Сервер возвращает confirmation_url → здесь return { status: 'redirect', url }.
   *   4) Факт оплаты подтверждать вебхуком payment.succeeded на сервере (выдать доступ, написать в бота).
   *   «Долями» — способ оплаты, который включается в кабинете провайдера; mode передать на сервер.
   *
   * Prodamus:
   *   Сервер формирует ссылку платёжной формы (products[0][name], products[0][price], customer_email,
   *   customer_phone, order_id, urlReturn, urlSuccess) и подписывает её секретным ключом.
   *   Здесь: return { status: 'redirect', url: ссылкаОтСервера }. Оплата долями — способ оплаты в форме Prodamus.
   *   Подтверждение — уведомление (webhook) Prodamus на сервер.
   *
   * GetCourse:
   *   Вариант А: виджет формы заказа GetCourse вместо этой формы (data передать в скрытые поля виджета).
   *   Вариант Б: сервер создаёт заказ через API GetCourse (action=add, deal: offer_code тарифа,
   *   deal_cost, user: email/phone/name, utm-поля) и возвращает ссылку на оплату заказа → redirect.
   *
   * Цели Метрики: checkout_submit (до вызова), payment_redirect (перед уходом на оплату),
   * payment_success — на возврате с ?payment=success (см. Checkout.handleReturn) и, надёжнее, с сервера
   * через офлайн-конверсии Метрики.
   */
  function handlePayment(tariff, mode, data) {
    // --- ДЕМО ---
    var outcome = params.get('demo_payment') || CONFIG.payment.demoOutcome;
    if (CONFIG.analytics.debug && window.console) console.info('[handlePayment] demo', tariff, mode, data);
    return wait(CONFIG.payment.demoDelay).then(function () {
      if (outcome === 'network') throw new Error('network');
      return { status: outcome === 'fail' ? 'fail' : 'success' };
    });
    // --- БОЕВОЙ ВАРИАНТ (пример) ---
    // return fetch('/api/pay', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ tariff: tariff, method: mode, data: data })
    // }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    //   .then(function (json) { return { status: 'redirect', url: json.confirmation_url }; });
  }

  var Checkout = {
    el: null, form: null, tariff: 'kurator', method: 'full', source: 'card',
    draftKey: 'forma_checkout_draft',
    submitted: false,

    init: function () {
      this.el = $('[data-checkout]');
      if (!this.el) return;
      this.form = $('[data-checkout-form]', this.el);
      var self = this;

      $$('[data-checkout-close]', this.el).forEach(function (b) {
        b.addEventListener('click', function () { self.close(); });
      });
      $('[data-checkout-change]', this.el).addEventListener('click', function (e) {
        e.preventDefault();
        self.close({ restoreFocus: false }).then(function () { scrollToTariffs(); });
      });
      $('[data-checkout-retry]', this.el).addEventListener('click', function () {
        self.show('form');
        self.submit();
      });

      initPhoneMask($('[data-phone-mask]', this.form));

      this.form.addEventListener('submit', function (e) { e.preventDefault(); self.submit(); });
      // После первой попытки отправки — проверка поля при уходе с него и снятие ошибки при правке
      ['name', 'email', 'phone'].forEach(function (n) {
        var input = self.form.elements[n];
        input.addEventListener('blur', function () { if (self.submitted) self.validateField(n); });
        input.addEventListener('input', function () {
          if (self.submitted && input.getAttribute('aria-invalid') === 'true') self.validateField(n);
          self.saveDraft();
        });
      });
      this.form.elements.consent.addEventListener('change', function () { if (self.submitted) self.validateField('consent'); });

      this.handleReturn();
    },

    open: function (tariff, method, source, opener) {
      this.tariff = tariff; this.method = method || 'full'; this.source = source || 'card';
      var t = CONFIG.tariffs[tariff];
      var priceText = this.method === 'dolyami' ? partsOf(tariff) : formatPrice(priceOf(tariff));
      $('[data-checkout-name]', this.el).textContent = t.name;
      $('[data-checkout-price]', this.el).textContent = priceText;
      this.el.setAttribute('data-tariff', tariff);
      this.fillHidden();
      this.restoreDraft();
      this.clearErrors();
      this.submitted = false;
      this.show('form');
      Overlay.open(this.el, { opener: opener, focus: this.form.elements.name });
      goal('checkout_open', { tariff: tariff, source: this.source });
    },
    close: function (opts) { return Overlay.close(this.el, opts); },

    show: function (screen) {
      $$('[data-checkout-screen]', this.el).forEach(function (s) {
        var on = s.getAttribute('data-checkout-screen') === screen;
        s.hidden = !on;
        s.classList.toggle('is-active', on);
      });
      this.el.setAttribute('data-state', screen);
      if (screen !== 'form') {
        var h = $('[data-checkout-screen="' + screen + '"] .checkout__title', this.el);
        if (h) setTimeout(function () { h.focus(); }, 30);
      }
    },

    fillHidden: function () {
      var f = this.form.elements;
      var tr = Tracking.fields();
      Object.keys(tr).forEach(function (k) { if (f[k]) f[k].value = tr[k]; });
      f.tariff.value = this.tariff;
      f.tariff_name.value = CONFIG.tariffs[this.tariff].name;
      f.method.value = this.method;
      f.price.value = priceOf(this.tariff);
      f.source.value = this.source;
      var q = Quiz.state;
      f.quiz_segment.value = q.segment || '';
      f.quiz_result.value = q.result || '';
      f.quiz_answers.value = Object.keys(q.answers || {}).length ? JSON.stringify(q.answers) : '';
    },

    // «Данные мы сохранили»: черновик в sessionStorage (без согласия — его ставят заново)
    saveDraft: function () {
      var f = this.form.elements;
      session.set(this.draftKey, { name: f.name.value, email: f.email.value, phone: f.phone.value });
    },
    restoreDraft: function () {
      var d = session.get(this.draftKey);
      if (!d) return;
      var f = this.form.elements;
      if (d.name && !f.name.value) f.name.value = d.name;
      if (d.email && !f.email.value) f.email.value = d.email;
      if (d.phone && !f.phone.value) f.phone.value = d.phone;
    },

    messages: {
      name: 'Напиши, как к тебе обращаться',
      email: 'Кажется, в почте опечатка — проверь, пожалуйста',
      phone: 'Нужно 10 цифр после +7',
      consent: 'Без этой галочки мы не можем принять заявку — так требует закон о персональных данных',
      network: 'Не получилось отправить. Проверь интернет и нажми ещё раз — данные мы сохранили'
    },

    check: function (name) {
      var f = this.form.elements;
      if (name === 'name') return f.name.value.trim().length > 0;
      if (name === 'email') return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zа-яё]{2,}$/i.test(f.email.value.trim());
      if (name === 'phone') return phoneDigits(f.phone.value).length === 10;
      if (name === 'consent') return f.consent.checked;
      return true;
    },
    validateField: function (name) {
      var ok = this.check(name);
      var field = $('[data-field="' + name + '"]', this.form);
      var input = this.form.elements[name];
      var err = $('[data-error-for="' + name + '"]', this.form);
      field.classList.toggle('is-error', !ok);
      if (ok) { input.removeAttribute('aria-invalid'); err.hidden = true; err.textContent = ''; }
      else { input.setAttribute('aria-invalid', 'true'); err.textContent = this.messages[name]; err.hidden = false; }
      return ok;
    },
    clearErrors: function () {
      var self = this;
      ['name', 'email', 'phone', 'consent'].forEach(function (n) {
        var field = $('[data-field="' + n + '"]', self.form);
        field.classList.remove('is-error');
        self.form.elements[n].removeAttribute('aria-invalid');
        var err = $('[data-error-for="' + n + '"]', self.form);
        err.hidden = true; err.textContent = '';
      });
      this.setFormError('');
    },
    setFormError: function (text) {
      var box = $('[data-form-error]', this.form);
      box.textContent = text;
      box.hidden = !text;
      this.form.classList.toggle('is-error', !!text);
    },
    setLoading: function (on) {
      var btn = $('[data-submit]', this.form);
      btn.disabled = on;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
      btn.classList.toggle('is-loading', on);
      $('[data-submit-label]', btn).hidden = on;
      $('[data-submit-loading]', btn).hidden = !on;
      this.form.classList.toggle('is-loading', on);
    },

    submit: function () {
      var self = this;
      this.submitted = true;
      this.setFormError('');
      var invalid = ['name', 'email', 'phone', 'consent'].filter(function (n) { return !self.validateField(n); });
      if (invalid.length) {
        invalid.forEach(function (n) { goal('checkout_error', { field: n }); });
        var first = this.form.elements[invalid[0]];
        if (first) first.focus();
        return;
      }
      this.fillHidden();
      this.saveDraft();
      var data = {};
      new FormData(this.form).forEach(function (v, k) { data[k] = v; });
      data.phone_digits = '7' + phoneDigits(data.phone);
      var tariff = this.tariff, method = this.method, price = priceOf(tariff);

      goal('checkout_submit', { tariff: tariff, method: method });
      this.setLoading(true);

      handlePayment(tariff, method, data).then(function (res) {
        self.setLoading(false);
        if (res && res.status === 'redirect' && res.url) {
          goal('payment_redirect', { tariff: tariff, price: price });
          location.href = res.url;
          return;
        }
        if (res && res.status === 'success') {
          goal('payment_redirect', { tariff: tariff, price: price });
          self.success(tariff, price, method, data.email);
          return;
        }
        self.show('fail');
      }).catch(function () {
        self.setLoading(false);
        self.setFormError(self.messages.network);
        goal('checkout_error', { field: 'network' });
      });
    },

    success: function (tariff, price, method, email) {
      $('[data-checkout-email]', this.el).textContent = email || 'почту';
      session.remove(this.draftKey);
      this.show('success');
      goal('payment_success', { tariff: tariff, price: price, method: method });
    },

    // Возврат с платёжной страницы: ?payment=success|fail&tariff=kurator&method=full&email=…
    handleReturn: function () {
      var status = params.get('payment');
      if (!status) return;
      var tariff = CONFIG.tariffs[params.get('tariff')] ? params.get('tariff') : 'kurator';
      var method = params.get('method') === 'dolyami' ? 'dolyami' : 'full';
      var self = this;
      // Чистим URL, чтобы при обновлении цель не ушла второй раз
      if (history.replaceState) {
        ['payment', 'tariff', 'method', 'email'].forEach(function (k) { params.delete(k); });
        var qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
      setTimeout(function () {
        self.tariff = tariff; self.method = method;
        $('[data-checkout-name]', self.el).textContent = CONFIG.tariffs[tariff].name;
        Overlay.open(self.el, {});
        if (status === 'success') self.success(tariff, priceOf(tariff), method, (session.get(self.draftKey) || {}).email);
        else self.show('fail');
      }, 50);
    }
  };

  // ---------- Маска телефона +7 (___) ___-__-__ ----------
  // 10 цифр после +7. Вставка 8XXXXXXXXXX / +7XXXXXXXXXX / XXXXXXXXXX работает.
  function phoneDigits(value) {
    var s = String(value || '').trim();
    var d = s.replace(/\D/g, '');
    if (/^\+7/.test(s)) d = d.slice(1);                              // наш префикс +7
    else if (d.length === 11 && /^[78]/.test(d)) d = d.slice(1);      // 8XXXXXXXXXX / 7XXXXXXXXXX
    if (d.length === 11 && /^[78]/.test(d)) d = d.slice(1);           // вставили полный номер после +7
    return d.slice(0, 10);
  }
  function formatPhone(d, deleting) {
    if (!d.length) return deleting ? '' : '+7 ';
    var out = '+7 (' + d.slice(0, 3);
    if (d.length > 3 || (d.length === 3 && !deleting)) out += ') ';
    if (d.length > 3) out += d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }
  function initPhoneMask(input) {
    if (!input) return;
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 '; });
    input.addEventListener('blur', function () { if (phoneDigits(input.value).length === 0) input.value = ''; });
    input.addEventListener('input', function (e) {
      var deleting = e.inputType && e.inputType.indexOf('delete') === 0;
      var raw = input.value;
      var caret = input.selectionStart == null ? raw.length : input.selectionStart;
      // Сколько значимых цифр было слева от курсора (без префикса 7/8)
      var hasPrefix = /^\+7/.test(raw.trim());
      var leftDigits = raw.slice(0, caret).replace(/\D/g, '').length - (hasPrefix ? 1 : 0);
      var d = phoneDigits(raw);
      var formatted = formatPhone(d, deleting);
      input.value = formatted;
      // Ставим курсор после той же по счёту цифры
      var pos = formatted.length;
      if (leftDigits >= 0 && leftDigits < d.length) {
        var count = -1; // первая «7» в +7 — префикс, не считаем
        for (var i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) { count++; if (count === leftDigits) { pos = i; break; } }
        }
      }
      try { input.setSelectionRange(pos, pos); } catch (err) { /* type=tel поддерживает */ }
    });
  }

  /* ===================================================================
     16. Квиз «Твой старт»
     Экраны: start, q1, q1a, q2, q3, loading, result-*, confirm-close, resume, saved-result.
     Ответы — в sessionStorage (CONFIG.quiz.storage), контакты квиз не собирает.
     =================================================================== */
  var RESULT_NAMES = { kurator: 'С куратором', sama: 'Сама', lichnoe: 'Личное ведение', doctor: 'Сначала врач' };
  var QUESTION_SCREENS = ['q1', 'q1a', 'q2', 'q3'];
  var STEP_INFO = {
    q1:  { n: 1, label: 'Вопрос 1 из 3', progress: 0 },
    q1a: { n: 1, label: 'Вопрос 1 из 3, уточнение', progress: 0.5 / 3 },
    q2:  { n: 2, label: 'Вопрос 2 из 3', progress: 1 / 3 },
    q3:  { n: 3, label: 'Вопрос 3 из 3', progress: 2 / 3 }
  };

  var Quiz = {
    el: null,
    store: null,
    state: { screen: 'start', segment: '', answers: {}, result: '', history: [] },
    placement: 'hero',
    opener: null,
    returnScreen: null,
    busy: false,

    init: function () {
      this.el = $('[data-quiz]');
      this.store = CONFIG.quiz.storage === 'local' ? local : session;
      var saved = this.store.get(CONFIG.quiz.storageKey);
      if (saved && typeof saved === 'object') {
        this.state = {
          screen: saved.screen || 'start', segment: saved.segment || '', answers: saved.answers || {},
          result: saved.result || '', history: saved.history || []
        };
        if (this.state.result) setRecommended(this.state.result);
      }
      if (!this.el) return;
      var self = this;

      $$('[data-quiz-open]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var placement = a.getAttribute('data-quiz-open');
          if (placement === 'hero') goal('hero_quiz', { variant: CONFIG.hero.variant });
          if (placement === 'tariffs') goal('tariffs_quiz');
          self.open(placement, a);
        });
      });

      $('[data-quiz-close]', this.el).addEventListener('click', function () { self.requestClose(); });
      $('[data-quiz-close-backdrop]', this.el).addEventListener('click', function () { self.requestClose(); });

      this.el.addEventListener('click', function (e) {
        var opt = e.target.closest('.quiz__option');
        if (opt) { self.answer(opt); return; }
        var act = e.target.closest('[data-quiz-action]');
        if (act) { self.action(act.getAttribute('data-quiz-action')); return; }
        var cta = e.target.closest('[data-quiz-cta]');
        if (cta) self.cta(cta, e);
      });
    },

    save: function () { this.store.set(CONFIG.quiz.storageKey, this.state); },
    reset: function () {
      this.state = { screen: 'start', segment: '', answers: {}, result: '', history: [] };
      this.save();
      setRecommended(null);
      $$('.quiz__option', this.el).forEach(function (o) { o.setAttribute('aria-pressed', 'false'); o.classList.remove('is-selected'); });
    },

    open: function (placement, opener) {
      this.placement = placement || 'hero';
      this.opener = opener || null;
      markEngaged();
      goal('quiz_open', { placement: this.placement });
      var s = this.state;
      var first = 'start';
      if (s.result) first = 'saved-result';
      else if (QUESTION_SCREENS.indexOf(s.screen) > -1) first = 'resume';
      var self = this;
      Overlay.open(this.el, { opener: opener, onEsc: function () { self.requestClose(); } });
      this.show(first);
    },

    // Закрытие: на вопросах 2–3 сначала спрашиваем «Уже уходишь?»
    requestClose: function () {
      var cur = this.current;
      if (cur === 'q2' || cur === 'q3') {
        this.returnScreen = cur;
        var left = cur === 'q2' ? 2 : 1;
        $('[data-quiz-left]', this.el).textContent = left + ' ' + plural(left, 'вопрос', 'вопроса', 'вопросов');
        this.show('confirm-close');
        return;
      }
      if (cur === 'confirm-close') { this.closeNow(this.returnScreen); return; }
      this.closeNow(cur);
    },
    closeNow: function (screen, opts) {
      var stepScreen = screen || this.current;
      if (!this.state.result && (stepScreen === 'start' || QUESTION_SCREENS.indexOf(stepScreen) > -1)) {
        goal('quiz_close', { step: stepScreen === 'start' ? 'start' : stepScreen.slice(1) });
      }
      this.hideFallback();
      return Overlay.close(this.el, opts);
    },

    show: function (screen) {
      var prev = this.current;
      $$('.quiz__screen', this.el).forEach(function (s) {
        var on = s.getAttribute('data-screen') === screen;
        s.hidden = !on;
        s.classList.toggle('is-active', on);
      });
      this.current = screen;
      this.el.setAttribute('data-screen', screen);

      // Запоминаем, на каком вопросе остановилась (для «Продолжим с вопроса N?»)
      if (QUESTION_SCREENS.indexOf(screen) > -1 || screen === 'start') {
        this.state.screen = screen;
        this.save();
      }

      // Прогресс и «Назад»
      var info = STEP_INFO[screen];
      var progress = $('[data-quiz-progress]', this.el);
      var isResult = screen.indexOf('result-') === 0 || screen === 'loading';
      progress.hidden = !(info || isResult);
      if (info) {
        $('[data-quiz-step-label]', this.el).textContent = info.label;
        progress.style.setProperty('--progress', info.progress);
        $('.quiz__bar', this.el).setAttribute('aria-valuenow', info.n);
      } else if (isResult) {
        $('[data-quiz-step-label]', this.el).textContent = 'Готово';
        progress.style.setProperty('--progress', 1);
        $('.quiz__bar', this.el).setAttribute('aria-valuenow', 3);
      }
      $('[data-quiz-action="back"]', this.el).hidden = !info;
      if (screen.indexOf('result-') !== 0) this.hideFallback();

      // Отмеченные ранее ответы
      if (info) {
        var chosen = this.state.answers[screen];
        $$('.quiz__option', $('[data-screen="' + screen + '"]', this.el)).forEach(function (o) {
          var on = o.getAttribute('data-answer') === chosen;
          o.setAttribute('aria-pressed', on ? 'true' : 'false');
          o.classList.toggle('is-selected', on);
          o.disabled = false;
        });
      }

      // Фокус: на вопросах — первый вариант, на остальных экранах — заголовок
      var scr = $('[data-screen="' + screen + '"]', this.el);
      var focusEl = info ? $('.quiz__option', scr) : $('.quiz__title', scr);
      if (focusEl) {
        if (!info) focusEl.setAttribute('tabindex', '-1');
        setTimeout(function () { focusEl.focus({ preventScroll: true }); }, 40);
      }
      emit('quizscreen', { screen: screen, prev: prev, el: scr });
    },

    answer: function (opt) {
      if (this.busy) return;
      var screen = this.current;
      if (QUESTION_SCREENS.indexOf(screen) === -1) return;
      var value = opt.getAttribute('data-answer');
      var self = this;
      this.busy = true;
      $$('.quiz__option', opt.parentNode).forEach(function (o) {
        var on = o === opt;
        o.setAttribute('aria-pressed', on ? 'true' : 'false');
        o.classList.toggle('is-selected', on);
      });
      this.state.answers[screen] = value;
      if (screen === 'q1') {
        this.state.segment = value;
        if (value !== 'mom') delete this.state.answers.q1a;
      }
      this.save();
      goal('quiz_step', { step: screen.slice(1), answer: value });

      setTimeout(function () {
        self.busy = false;
        if (self.current !== screen) return; // квиз закрыли или ушли с экрана за эти 300 мс
        self.state.history.push(screen);
        var next = self.nextScreen(screen, value);
        if (next === 'finish') self.finish();
        else self.show(next);
      }, CONFIG.quiz.autoNextDelay);
    },

    nextScreen: function (screen, value) {
      if (screen === 'q1') return value === 'mom' ? 'q1a' : 'q2';
      if (screen === 'q1a') return value === 'yes' ? 'q2' : 'finish';
      if (screen === 'q2') return 'q3';
      return 'finish';
    },

    // Логика результата (по порядку проверки из плана)
    computeResult: function () {
      var a = this.state.answers, seg = this.state.segment;
      if (seg === 'mom' && (a.q1a === 'no_doctor' || a.q1a === 'limits')) return 'doctor';
      if (a.q3 === 'personal') return 'lichnoe';
      if (a.q2 === 'now' && a.q3 === 'self' && seg !== 'mom') return 'sama';
      return 'kurator';
    },

    finish: function () {
      var self = this;
      this.save();
      this.show('loading');
      var ms = CONFIG.quiz.loadingMin + Math.random() * (CONFIG.quiz.loadingMax - CONFIG.quiz.loadingMin);
      setTimeout(function () {
        if (self.current !== 'loading') return; // закрыли во время загрузки
        var result = self.computeResult();
        self.state.result = result;
        self.state.screen = 'result-' + result;
        self.save();
        self.showResult();
        goal('quiz_finish', { result: result, segment: self.state.segment });
      }, ms);
    },

    showResult: function () {
      var r = this.state.result;
      var seg = this.state.segment || 'office';
      var scr = $('[data-screen="result-' + r + '"]', this.el);
      if (scr) {
        $$('[data-for-segment]', scr).forEach(function (p) { p.hidden = p.getAttribute('data-for-segment') !== seg; });
      }
      if (r !== 'doctor') setRecommended(r); else setRecommended(null);
      this.show('result-' + r);
    },

    action: function (name) {
      if (name === 'start') {
        goal('quiz_start', { placement: this.placement });
        this.state.history = ['start'];
        this.show('q1');
      } else if (name === 'back') {
        var prev = this.state.history.pop() || 'start';
        this.save();
        this.show(prev);
      } else if (name === 'continue') {
        this.show(this.returnScreen || 'q1');
      } else if (name === 'close') {
        this.closeNow(this.returnScreen);
      } else if (name === 'resume') {
        this.show(this.state.screen);
      } else if (name === 'restart') {
        this.reset();
        this.show('start');
      } else if (name === 'show-result') {
        this.showResult();
      }
    },

    cta: function (el, e) {
      var action = el.getAttribute('data-quiz-cta');
      var result = this.state.result;
      var tariff = el.getAttribute('data-tariff') || (result !== 'doctor' ? result : 'kurator');
      goal('quiz_cta', { result: result, action: action });
      var opener = this.opener;
      if (action === 'checkout') {
        e.preventDefault();
        highlightTariff(tariff);
        this.closeNow(this.current, { restoreFocus: false }).then(function () {
          Checkout.open(tariff, 'full', 'quiz', opener);
        });
      } else if (action === 'compare' || action === 'all_tariffs') {
        e.preventDefault();
        var key = action === 'compare' ? tariff : (result !== 'doctor' ? result : null);
        this.closeNow(this.current, { restoreFocus: false }).then(function () {
          scrollToTariffs(key);
          if (key) highlightTariff(key);
        });
      }
      // 'marathon' — обычная ссылка в бота, цель marathon_click ставит Bot (раздел 17)
    },

    showFallback: function (url) { showTgFallback($('[data-tg-fallback]', this.el), url); },
    hideFallback: function () { var f = this.el && $('[data-tg-fallback]', this.el); if (f) f.hidden = true; }
  };

  /* ===================================================================
     17. Ссылки в Telegram-бота
     start-параметр: <placement>-<visitor_id> (Telegram разрешает A–Z, a–z, 0–9, _ и -, до 64 символов).
     Бот по visitor_id находит UTM, если они отправлены на CONFIG.telegram.linkEndpoint.
     =================================================================== */
  function botUrl(placement) {
    var start = (placement + '-' + (Tracking.data.visitor_id || '')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return 'https://t.me/' + CONFIG.telegram.bot + '?start=' + start;
  }

  function initBotLinks() {
    $$('[data-bot]').forEach(function (a) {
      a.href = botUrl(a.getAttribute('data-bot'));
      a.addEventListener('click', function () {
        var placement = a.getAttribute('data-bot');
        var inQuiz = !!a.closest('[data-quiz]');
        var inPopup = !!a.closest('[data-popup]');
        a.href = botUrl(placement);
        markEngaged();
        if (placement !== 'paid') {
          var goalPlacement = inQuiz ? 'quiz' : placement; // mom_qdoc → quiz
          goal('marathon_click', {
            placement: goalPlacement,
            segment: Quiz.state.segment || lastSegment || '',
            quiz_result: Quiz.state.result || ''
          });
        }
        if (inPopup) goal('exit_popup_click');
        sendLinkBeacon(placement);
        setTimeout(function () {
          if (inQuiz) Quiz.showFallback(a.href);
          else showToastFallback(a.href);
        }, CONFIG.ui.tgFallbackDelay);
        if (inPopup) ExitPopup.close();
      });
    });

    $$('[data-tg-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = btn.closest('.tg-fallback');
        var url = box.getAttribute('data-url') || botUrl('copy');
        copyText(url).then(function () {
          var done = $('[data-tg-copied]', box);
          if (done) done.textContent = 'Ссылка скопирована';
          box.classList.add('is-copied');
        });
      });
    });
    var toastClose = $('[data-tg-toast-close]');
    if (toastClose) toastClose.addEventListener('click', function () { var t = $('[data-tg-toast]'); t.hidden = true; t.classList.remove('is-open'); });
  }

  function sendLinkBeacon(placement) {
    var ep = CONFIG.telegram.linkEndpoint;
    if (!ep || !navigator.sendBeacon) return;
    try {
      var body = Tracking.fields();
      body.placement = placement;
      body.quiz_segment = Quiz.state.segment || '';
      body.quiz_result = Quiz.state.result || '';
      navigator.sendBeacon(ep, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    } catch (e) { /* ничего */ }
  }

  function showTgFallback(box, url) {
    if (!box) return;
    box.setAttribute('data-url', url);
    var u = $('[data-tg-url]', box);
    if (u) u.textContent = 't.me/' + CONFIG.telegram.bot;
    var done = $('[data-tg-copied]', box);
    if (done) done.textContent = '';
    box.classList.remove('is-copied');
    box.hidden = false;
  }
  var toastShown = false;
  function showToastFallback(url) {
    if (toastShown) return; // вне квиза — не чаще раза за визит
    toastShown = true;
    var t = $('[data-tg-toast]');
    showTgFallback(t, url);
    if (t) requestAnimationFrame(function () { t.classList.add('is-open'); });
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
    function fallback() {
      return new Promise(function (resolve) {
        var ta = doc.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        doc.body.appendChild(ta); ta.select();
        try { doc.execCommand('copy'); } catch (e) { /* ничего */ }
        doc.body.removeChild(ta); resolve();
      });
    }
  }

  /* ===================================================================
     18. Exit pop-up
     Desktop: курсор уходит к верхнему краю окна. Не чаще 1 раза за сессию, не в первые 15 с,
     не показываем, если был клик по тарифу, в бота или открыт квиз, и если открыт другой оверлей.
     =================================================================== */
  var ExitPopup = {
    el: null, startedAt: 0,
    init: function () {
      this.el = $('[data-popup]');
      if (!this.el) return;
      this.startedAt = Date.now();
      var self = this;
      $$('[data-popup-close]', this.el).forEach(function (b) { b.addEventListener('click', function () { self.close(); }); });
      doc.addEventListener('mouseout', function (e) {
        if (e.relatedTarget || e.toElement) return; // курсор остался в окне
        if (e.clientY > 0) return;                  // ушёл не вверх
        self.maybeShow();
      });
    },
    canShow: function () {
      if (session.get(CONFIG.exitPopup.storageKey)) return false;
      if (session.get(engagedKey)) return false;
      if (Date.now() - this.startedAt < CONFIG.exitPopup.minDelay) return false;
      if (Overlay.isOpen()) return false;
      return true;
    },
    maybeShow: function () { if (this.canShow()) this.show(); },
    show: function () {
      session.set(CONFIG.exitPopup.storageKey, 1);
      Overlay.open(this.el, { focus: $('.popup__cta', this.el) });
      goal('exit_popup_show');
    },
    close: function () { return Overlay.close(this.el); }
  };

  /* ===================================================================
     19. Запуск
     =================================================================== */
  function init() {
    initMetrika();
    Tracking.init();
    applyPhase();
    Timer.init();
    initSectionTracking();
    initGoalLinks();
    initViewGoals();
    initSegments();
    initCases();
    initAccordion();
    initChat();
    initTariffs();
    Quiz.init();
    Checkout.init();
    initBotLinks();
    ExitPopup.init();
    root.classList.add('is-ready');
    emit('ready', {});
  }

  // API для animations.js и для ручной проверки из консоли
  window.FORMA = {
    CONFIG: CONFIG,
    goal: goal,
    phase: function () { return phase; },
    openQuiz: function (placement) { Quiz.open(placement || 'hero', null); },
    openCheckout: function (tariff, method) { Checkout.open(tariff || 'kurator', method || 'full', 'card', null); },
    showExitPopup: function () { ExitPopup.show(); },
    highlightTariff: highlightTariff,
    handlePayment: handlePayment
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
