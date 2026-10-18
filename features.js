/* =====================================================================
   ФОРМА — features.js (правки v3, исполнитель C)
   Подключается с defer после main.js и animations.js. Vanilla JS, без зависимостей.
   Анимируем только transform и opacity (классы + CSS-переходы из features.css).

   Разделы:
    0. FEATURES_CONFIG — всё, что меняется перед запуском
    1. Утилиты (время с учётом ?now=, цели Метрики через window.FORMA.goal)
    2. Блок 4 «Куратор»: переписка проигрывается сама (Д5)
    3. Мини-таймер в шапке (Д9, часть C)
    4. Время на блоке тарифов (общий счётчик для П12 и П14)
    5. Плашка квиза (П12)
    6. Уведомление о покупке (П14)
    7. Запуск
   ===================================================================== */
(function () {
  'use strict';

  /* ===================================================================
     0. FEATURES_CONFIG
     =================================================================== */
  var FEATURES_CONFIG = {
    // ДЕМО-РЕЖИМ. true — уведомления о покупках берутся из recentPurchases ниже (примеры для показа клиенту).
    // ПРОД: поставить false и задать purchasesEndpoint. В проде — только реальные данные.
    demo: true,

    // Блок 4: переписка
    chat: {
      startThreshold: 0.4,   // доля телефона в кадре, при которой начинается проигрывание
      typingMin: 600,        // мс: «печатает…» перед сообщением куратора
      typingMax: 900,
      outDelay: 650,         // мс: пауза перед сообщением ученицы
      videoHold: 900,        // мс: пауза после видео-пузыря
      timecodeHold: 1600,    // мс: сколько луч держится на метке после сообщения с таймкодом
      factLit: 2200          // мс: сколько факт слева подсвечен после «своего» сообщения
    },

    // Мини-таймер в шапке. Даты берутся из main.js (window.FORMA.CONFIG.dates); ниже — запасные
    headerTimer: {
      fallbackPriceRise: '2026-10-28T00:00:00+03:00',
      fallbackStart: '2026-11-02T00:00:00+03:00',
      refresh: 30000         // мс: как часто обновлять текст
    },

    // Блок тарифов: «посетитель в блоке», если секция занимает не меньше этой доли окна
    tariffsView: { minViewportShare: 0.5 },

    // П12. Плашка квиза
    quizNudge: {
      delay: 40000,                         // мс в блоке тарифов без клика по оплате
      storageKey: 'forma_quiz_nudge_shown'  // один раз за сессию (sessionStorage)
    },

    // П14. Уведомление о покупке
    purchases: {
      firstDelay: 10000,     // мс в блоке тарифов до первого уведомления
      intervalMin: 25000,    // следующее — через 25–40 с пребывания в блоке
      intervalMax: 40000,
      visibleFor: 6000,      // мс: сколько висит одно уведомление
      maxPerSession: 3,
      storageKey: 'forma_purchase_toasts'
    },

    /* -----------------------------------------------------------------
       ВАЖНО: уведомления о покупках — ТОЛЬКО РЕАЛЬНЫЕ ЗАКАЗЫ.
       Выдуманные «Марина только что купила» в проде запрещены:
       это недостоверная реклама (ФЗ «О рекламе», ст. 5: реклама не должна содержать
       не соответствующие действительности сведения), нарушение доверия и этики брифа
       (у клиента правило: никаких фактов сверх реальных). Штраф и потеря репутации
       дороже любой конверсии.

       Как подключить реальные данные:
       1. На бэкенде (CRM / платёжный сервис / бот) сделать endpoint, который отдаёт
          последние ОПЛАЧЕННЫЕ заказы потока, например GET https://api.forma-fit.ru/recent-orders:
            [{ "name": "Марина", "from": "из Казани", "tariff": "kurator", "paidAt": "2026-10-18T12:03:00+03:00" }, …]
          Только имя (без фамилии) и город, и только у тех, кто дал на это согласие при оплате
          (152-ФЗ: имя + город — персональные данные). Ключ tariff: sama | kurator | lichnoe.
       2. Вписать адрес в purchasesEndpoint, demo поставить false.
       3. Если endpoint недоступен или заказов нет — уведомления просто не показываются.
       ----------------------------------------------------------------- */
    purchasesEndpoint: null,

    // ДЕМО-примеры (используются только при demo: true). Имя «Анна» не использовать — это эксперт.
    recentPurchases: [
      { name: 'Марина', from: 'из Казани',       tariff: 'kurator', minutesAgo: 2 },
      { name: 'Ольга',  from: 'из Екатеринбурга', tariff: 'sama',    minutesAgo: 7 },
      { name: 'Света',  from: 'из Минска',       tariff: 'kurator', minutesAgo: 12 }
    ]
  };

  /* ===================================================================
     1. Утилиты
     =================================================================== */
  var doc = document;
  var root = doc.documentElement;
  var FORMA = window.FORMA || {};
  var MAIN = FORMA.CONFIG || {};
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
  function goal(name, params) {
    try { if (window.FORMA && typeof window.FORMA.goal === 'function') window.FORMA.goal(name, params || {}); } catch (e) { /* без аналитики */ }
  }
  function icon(name) {
    if (name === 'close') return '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12"/></svg>';
    return '';
  }
  // Хранилище сессии (приватный режим не ломает страницу)
  var session = {
    get: function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* нет доступа */ } }
  };

  // Время «сейчас» с учётом ?now= (как в main.js: проверка фаз без ожидания)
  var timeOffset = 0;
  (function () {
    var allow = !MAIN.testing || MAIN.testing.allowNowParam !== false;
    if (!allow) return;
    try {
      var p = new URLSearchParams(location.search).get('now');
      var t = p ? Date.parse(p) : NaN;
      if (!isNaN(t)) timeOffset = t - Date.now();
    } catch (e) { /* старый браузер */ }
  })();
  function now() { return Date.now() + timeOffset; }

  function overlayOpen() { return root.classList.contains('is-locked'); }

  /* ===================================================================
     2. Блок 4 «Куратор»: переписка проигрывается сама
     Без JS и при reduced-motion: вся переписка видна статично (прокрутка внутри экрана).
     С JS: лента прижата к низу, сообщения появляются по очереди, старые уезжают вверх (FLIP на transform).
     Сообщение куратора: «печатает…» 600–900 мс → пузырь (opacity + translateY).
     Сообщение с таймкодом: луч на кадре едет к метке, метка подсвечивается (те же классы, что ставит main.js).
     =================================================================== */
  var Chat = {
    init: function () {
      var section = $('#kurator');
      if (!section) return;
      this.section = section;
      this.phone = $('[data-chat]', section);
      this.feed = $('[data-chat-feed]', section);
      this.status = $('[data-chat-status]', section);
      this.replayBtn = $('[data-chat-replay]', section);
      this.video = $('[data-video="first"]', section);
      this.beamTc = $('[data-beam-tc]', section);
      if (!this.phone || !this.feed) return;
      this.items = Array.prototype.slice.call(this.feed.children);
      this.facts = $$('[data-fact]', section);
      this.runId = 0;
      this.factTimers = {};

      this.initRays();
      if (reduceMq.matches) return; // статичный режим: всё уже видно, таймкоды работают через main.js

      this.initFactsReveal();
      section.classList.add('kurator--player');

      // «Печатает…» — один пузырь, переезжает перед следующим сообщением куратора
      var typing = doc.createElement('li');
      typing.className = 'chat__typing is-pending';
      typing.setAttribute('aria-hidden', 'true');
      typing.innerHTML = '<i></i><i></i><i></i>';
      this.typing = typing;
      this.feed.appendChild(typing);

      this.reset();

      var self = this;
      if (this.replayBtn) {
        this.replayBtn.hidden = false;
        this.replayBtn.addEventListener('click', function () {
          goal('chat_replay');
          self.play();
        });
      }

      // Старт, когда телефон на 40% в кадре; один раз
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting && e.intersectionRatio >= FEATURES_CONFIG.chat.startThreshold) self.play();
          });
        }, { threshold: [0, FEATURES_CONFIG.chat.startThreshold] });
        io.observe(this.phone);
        this.io = io;
      } else {
        this.play();
      }
    },

    // Лучи за телефоном «дышат» только пока блок в кадре
    initRays: function () {
      var section = this.section;
      if (!('IntersectionObserver' in window)) { section.classList.add('is-inview'); return; }
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { section.classList.toggle('is-inview', e.isIntersecting); });
      }).observe(section);
    },

    // Каскад фактов слева (opacity + translateY, шаг 80 мс)
    initFactsReveal: function () {
      var facts = this.facts;
      if (!facts.length || !('IntersectionObserver' in window)) return;
      this.section.classList.add('kurator--anim');
      facts.forEach(function (f, i) { f.style.setProperty('--i', i); });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.disconnect();
          facts.forEach(function (f) { f.classList.add('is-in'); });
        });
      }, { rootMargin: '0px 0px -15% 0px' });
      io.observe(facts[0]);
    },

    reset: function () {
      this.items.forEach(function (li) { li.classList.add('is-pending'); li.classList.remove('is-entering'); });
      this.typing.classList.add('is-pending');
      this.setTyping(false);
      this.highlight(null);
      this.feed.style.transition = 'none';
      this.feed.style.transform = '';
      this.facts.forEach(function (f) { f.classList.remove('is-lit'); });
      if (this.replayBtn) this.replayBtn.classList.remove('is-ready');
    },

    // Пауза, которая обрывается при повторном запуске
    wait: function (ms, id) {
      var self = this;
      return new Promise(function (resolve, reject) {
        setTimeout(function () { if (id === self.runId) resolve(); else reject('cancel'); }, ms);
      });
    },

    // Показать элемент ленты. replaced — что он заменяет (пузырь «печатает…»).
    // FLIP: лента прижата к низу, поэтому сдвигаем её вниз на прирост высоты и плавно возвращаем.
    reveal: function (li, replaced) {
      var feed = this.feed;
      var before = feed.offsetHeight;
      if (replaced) replaced.classList.add('is-pending');
      li.classList.add('is-entering');
      li.classList.remove('is-pending');
      var delta = feed.offsetHeight - before;
      feed.style.transition = 'none';
      feed.style.willChange = 'transform';
      feed.style.transform = 'translateY(' + delta + 'px)';
      void feed.offsetHeight; // зафиксировать стартовое состояние
      feed.style.transition = 'transform 440ms cubic-bezier(0.22, 1, 0.36, 1)';
      feed.style.transform = 'translateY(0)';
      // снимаем стартовое состояние в следующем такте (setTimeout, а не rAF: в фоновой вкладке rAF стоит)
      setTimeout(function () { li.classList.remove('is-entering'); }, 16);
      clearTimeout(this.wcTimer);
      this.wcTimer = setTimeout(function () { feed.style.willChange = ''; }, 500);
      this.lightFact(li);
    },

    setTyping: function (on) {
      var chat = this.phone ? $('.chat', this.phone) : null;
      if (chat) chat.classList.toggle('is-typing', on);
      if (this.status) this.status.textContent = on ? 'печатает…' : 'в сети';
    },

    // Подсветка метки на кадре: те же классы и переменная, что у main.js (наведение на таймкод)
    highlight: function (tc) {
      var phone = this.phone;
      $$('.video__mark', phone).forEach(function (m) { m.classList.toggle('is-active', m.getAttribute('data-mark') === tc); });
      $$('.chat__tc', phone).forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-tc') === tc); });
      if (this.video) {
        this.video.classList.toggle('is-scrubbing', !!tc);
        var mark = tc ? $('.video__mark[data-mark="' + tc + '"]', phone) : null;
        if (mark) this.video.style.setProperty('--scrub', mark.style.getPropertyValue('--at'));
      }
      if (tc && this.beamTc) this.beamTc.textContent = tc;
      phone.classList.toggle('has-active-tc', !!tc);
    },

    // Факт слева, связанный с сообщением (data-callout), коротко подсвечивается лучом
    lightFact: function (li) {
      var key = li.getAttribute('data-callout');
      if (!key) { var inner = $('[data-callout]', li); key = inner ? inner.getAttribute('data-callout') : null; }
      if (!key && $('.chat__tc', li)) key = 'timecode'; // каждое сообщение с таймкодом
      if (!key) return;
      var fact = $('[data-fact="' + key + '"]', this.section);
      if (!fact) return;
      fact.classList.add('is-lit');
      clearTimeout(this.factTimers[key]);
      this.factTimers[key] = setTimeout(function () { fact.classList.remove('is-lit'); }, FEATURES_CONFIG.chat.factLit);
    },

    play: function () {
      var self = this;
      if (this.io) { this.io.disconnect(); this.io = null; } // автостарт — один раз (или уже нажали «Смотреть заново»)
      var id = ++this.runId;
      var C = FEATURES_CONFIG.chat;
      this.reset();

      var steps = this.items.slice();
      var i = 0;
      var activeTc = null;

      function next() {
        if (id !== self.runId) return Promise.reject('cancel');
        if (i >= steps.length) return Promise.resolve();
        var li = steps[i++];
        var isDay = li.classList.contains('chat__day');
        var isIn = li.classList.contains('chat__msg--in');
        var isVideo = li.classList.contains('chat__msg--video');
        var tcBtn = $('.chat__tc', li);
        var p;

        // луч уходит с кадра, когда разговор переходит к другому
        if (activeTc && !tcBtn) { self.highlight(null); activeTc = null; }

        if (isDay) {
          p = self.wait(i === 1 ? 200 : 600, id).then(function () { self.reveal(li); });
        } else if (isIn) {
          p = self.wait(350, id).then(function () {
            self.feed.insertBefore(self.typing, li);
            self.setTyping(true);
            self.reveal(self.typing);
            return self.wait(rand(C.typingMin, C.typingMax), id);
          }).then(function () {
            self.setTyping(false);
            self.reveal(li, self.typing);
            if (tcBtn) {
              activeTc = tcBtn.getAttribute('data-tc');
              // луч стартует, когда пузырь уже «сел»
              return self.wait(260, id).then(function () {
                self.highlight(activeTc);
                return self.wait(C.timecodeHold, id);
              });
            }
            return self.wait(450, id);
          });
        } else {
          p = self.wait(C.outDelay, id).then(function () {
            self.reveal(li);
            return self.wait(isVideo ? C.videoHold : 250, id);
          });
        }
        return p.then(next);
      }

      next().then(function () {
        if (self.replayBtn) self.replayBtn.classList.add('is-ready');
      }, function (e) { if (e !== 'cancel' && window.console) console.error(e); });
    }
  };

  /* ===================================================================
     3. Мини-таймер в шапке: «Ранняя цена: 9 д 10 ч»
     Меняем только текст существующей плашки (разметку шапки не трогаем).
     До 28.10 — отсчёт до повышения цены; после — «Старт 2 ноября»; после старта — плашки скрыты.
     =================================================================== */
  var HeaderTimer = {
    init: function () {
      var H = FEATURES_CONFIG.headerTimer;
      var dates = MAIN.dates || {};
      this.rise = Date.parse(dates.priceRise || H.fallbackPriceRise);
      this.start = Date.parse(dates.start || H.fallbackStart);
      if (isNaN(this.rise)) this.rise = Date.parse(H.fallbackPriceRise);
      if (isNaN(this.start)) this.start = Date.parse(H.fallbackStart);
      this.chips = $$('.header__chip');
      if (!this.chips.length) return;
      // Плашка ранней цены: по data-phase-show, иначе — первая
      this.early = this.chips.filter(function (c) { return /\bearly\b/.test(c.getAttribute('data-phase-show') || ''); })[0] || this.chips[0];
      this.regular = this.chips.filter(function (c) { return /\bregular\b/.test(c.getAttribute('data-phase-show') || ''); })[0] || null;
      var self = this;
      this.tick();
      setInterval(function () { self.tick(); }, H.refresh);
      doc.addEventListener('forma:phase', function () { self.tick(); });
    },
    tick: function () {
      var t = now();
      var early = this.early, regular = this.regular;
      if (t < this.rise) {
        var totalMin = Math.max(0, Math.floor((this.rise - t) / 60000));
        var d = Math.floor(totalMin / 1440);
        var h = Math.floor((totalMin % 1440) / 60);
        var m = totalMin % 60;
        var left = d > 0 ? d + ' д ' + h + ' ч' : h + ' ч ' + m + ' мин';
        var text = 'Ранняя цена: ' + left;
        if (early.textContent !== text) early.textContent = text;
        early.classList.add('header__chip--timer');
      } else if (t < this.start) {
        // main.js сам переключает плашки по фазе; если плашки «regular» нет — переиспользуем раннюю
        if (regular) { if (regular.textContent !== 'Старт 2 ноября') regular.textContent = 'Старт 2 ноября'; }
        else { early.textContent = 'Старт 2 ноября'; early.hidden = false; }
        early.classList.remove('header__chip--timer');
      } else {
        this.chips.forEach(function (c) { c.hidden = true; });
      }
    }
  };

  /* ===================================================================
     4. Время на блоке тарифов
     Считаем только когда вкладка видна, блок занимает ≥ 50% окна и не открыт оверлей.
     =================================================================== */
  var Dwell = {
    ms: 0,
    inView: false,
    payClicked: false,
    listeners: [],
    init: function () {
      this.section = $('#tarify');
      if (!this.section) return;
      var self = this;
      // Клик по оплате (кнопки тарифов) или открытие формы оплаты — плашка квиза больше не нужна
      doc.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('[data-pay]')) self.payClicked = true;
      }, true);
      doc.addEventListener('forma:overlay', function (e) {
        var d = e.detail || {};
        if (d.open && d.id === 'checkout') self.payClicked = true;
        if (d.open) { Nudge.hide(); Toast.hide(); }
      });
      var last = Date.now();
      setInterval(function () {
        var t = Date.now();
        var dt = t - last; last = t;
        self.inView = self.check();
        if (self.inView && doc.visibilityState !== 'hidden' && !overlayOpen()) self.ms += Math.min(dt, 1000);
        self.listeners.forEach(function (fn) { fn(self); });
      }, 500);
    },
    check: function () {
      var r = this.section.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      return visible >= vh * FEATURES_CONFIG.tariffsView.minViewportShare;
    },
    onTick: function (fn) { this.listeners.push(fn); }
  };

  // Не перекрывает ли плавающий элемент кнопки оплаты (с запасом 12 px)
  function overlapsPay(el) {
    var a = el.getBoundingClientRect();
    return $$('[data-pay]').some(function (b) {
      if (b.offsetParent === null) return false;
      var r = b.getBoundingClientRect();
      if (r.width === 0) return false;
      return !(r.right < a.left - 12 || r.left > a.right + 12 || r.bottom < a.top - 12 || r.top > a.bottom + 12);
    });
  }

  /* ===================================================================
     5. П12. Плашка квиза: «Не можешь выбрать? Квиз подскажет за 1 минуту»
     40 с на тарифах без клика по оплате → снизу по центру. Один раз за сессию.
     =================================================================== */
  var Nudge = {
    el: null,
    open: false,
    init: function () {
      if (!Dwell.section || !window.FORMA || typeof window.FORMA.openQuiz !== 'function') return;
      if (session.get(FEATURES_CONFIG.quizNudge.storageKey)) return;
      var self = this;
      Dwell.onTick(function (d) {
        if (self.done) {
          if (self.open) self.dodge();
          if (self.open && !d.inView) self.hide();
          return;
        }
        if (d.payClicked) { self.done = true; return; }
        if (d.ms >= FEATURES_CONFIG.quizNudge.delay && d.inView && !overlayOpen()) self.show();
      });
    },
    build: function () {
      var el = doc.createElement('aside');
      el.className = 'fnudge';
      el.setAttribute('aria-label', 'Подсказка: квиз поможет выбрать тариф');
      el.innerHTML =
        '<p class="fnudge__text">Не можешь выбрать? Квиз подскажет за 1 минуту</p>' +
        '<button class="fnudge__go btn btn--secondary" type="button">Пройти</button>' +
        '<button class="fnudge__close" type="button" aria-label="Закрыть подсказку">' + icon('close') + '</button>';
      doc.body.appendChild(el);
      var self = this;
      el.querySelector('.fnudge__go').addEventListener('click', function () {
        goal('quiz_nudge_click');
        self.hide();
        window.FORMA.openQuiz('nudge');
      });
      el.querySelector('.fnudge__close').addEventListener('click', function () { self.hide(); });
      this.el = el;
    },
    show: function () {
      this.done = true;
      session.set(FEATURES_CONFIG.quizNudge.storageKey, '1');
      Toast.hide(); // не показываем вместе с уведомлением о покупке
      if (!this.el) this.build();
      var el = this.el;
      void el.offsetWidth;
      el.classList.add('is-open');
      this.open = true;
      this.dodge();
      goal('quiz_nudge_show');
    },
    dodge: function () { if (this.el) this.el.classList.toggle('is-dodged', overlapsPay(this.el)); },
    hide: function () {
      if (!this.el || !this.open) return;
      this.open = false;
      var el = this.el;
      el.classList.remove('is-open');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
      this.el = null;
    }
  };

  /* ===================================================================
     6. П14. Уведомление о покупке (снизу слева)
     Первое — через 10 с на тарифах, дальше раз в 25–40 с, максимум 3 за сессию.
     Не перекрывает кнопки оплаты, не показывается вместе с плашкой квиза и поверх оверлеев.
     В ПРОДЕ — ТОЛЬКО РЕАЛЬНЫЕ ПОКУПКИ (см. комментарий у purchasesEndpoint в FEATURES_CONFIG).
     =================================================================== */
  var Toast = {
    el: null,
    open: false,
    queue: [],
    init: function () {
      if (!Dwell.section) return;
      var P = FEATURES_CONFIG.purchases;
      this.shown = parseInt(session.get(P.storageKey) || '0', 10) || 0;
      if (this.shown >= P.maxPerSession) return;
      var self = this;
      this.load().then(function (list) {
        self.queue = list.slice(self.shown); // в сессии продолжаем с того, на чём остановились
        if (!self.queue.length) return;
        self.nextAt = P.firstDelay;
        Dwell.onTick(function (d) { self.tick(d); });
      });
    },
    // Источник данных: демо-список или реальные заказы с endpoint
    load: function () {
      var F = FEATURES_CONFIG;
      if (F.demo) return Promise.resolve(F.recentPurchases.slice());
      if (!F.purchasesEndpoint || !window.fetch) return Promise.resolve([]);
      return fetch(F.purchasesEndpoint, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          if (!Array.isArray(rows)) return [];
          return rows.filter(function (o) { return o && o.name && o.tariff && o.paidAt; }).map(function (o) {
            var mins = Math.max(1, Math.round((Date.now() - Date.parse(o.paidAt)) / 60000));
            return { name: String(o.name), from: o.from ? String(o.from) : '', tariff: String(o.tariff), minutesAgo: mins };
          }).filter(function (o) { return o.minutesAgo <= 24 * 60; }); // только свежие, не старше суток
        })
        .catch(function () { return []; });
    },
    tick: function (d) {
      var P = FEATURES_CONFIG.purchases;
      if (this.open) {
        this.dodge();
        if (Nudge.open || overlayOpen()) this.hide();
        return;
      }
      if (this.closedByUser || this.shown >= P.maxPerSession || !this.queue.length) return;
      if (d.ms < this.nextAt || !d.inView || overlayOpen() || Nudge.open) return;
      // если через пару секунд должна появиться плашка квиза — уступаем ей
      var nudgeAt = FEATURES_CONFIG.quizNudge.delay;
      if (!Nudge.done && !d.payClicked && d.ms < nudgeAt && nudgeAt - d.ms < P.visibleFor + 1000 && !session.get(FEATURES_CONFIG.quizNudge.storageKey)) return;
      this.show(this.queue.shift(), d);
    },
    tariffName: function (key) {
      var t = MAIN.tariffs && MAIN.tariffs[key];
      if (t && t.name) return t.name;
      return { sama: 'Сама', kurator: 'С куратором', lichnoe: 'Личное ведение' }[key] || key;
    },
    minutesText: function (m) {
      if (m < 60) return m + ' мин назад';
      var h = Math.floor(m / 60);
      return h + ' ч назад';
    },
    build: function () {
      var el = doc.createElement('aside');
      el.className = 'ftoast';
      el.setAttribute('aria-label', 'Недавняя запись на поток');
      el.innerHTML =
        '<span class="ftoast__avatar" aria-hidden="true"></span>' +
        '<div class="ftoast__body" role="status"><p class="ftoast__text"></p><p class="ftoast__time"></p></div>' +
        '<button class="ftoast__close" type="button" aria-label="Закрыть уведомление">' + icon('close') + '</button>';
      doc.body.appendChild(el);
      var self = this;
      el.querySelector('.ftoast__close').addEventListener('click', function () {
        self.closedByUser = true; // закрыла — больше не показываем в этой сессии
        self.hide();
      });
      this.el = el;
    },
    show: function (p, d) {
      var P = FEATURES_CONFIG.purchases;
      if (!this.el) this.build();
      var el = this.el;
      $('.ftoast__avatar', el).textContent = p.name.charAt(0).toUpperCase();
      var text = $('.ftoast__text', el);
      text.textContent = '';
      var b = doc.createElement('b');
      b.textContent = p.name + (p.from ? ' ' + p.from : '');
      text.appendChild(b);
      text.appendChild(doc.createTextNode(' только что выбрала «' + this.tariffName(p.tariff) + '»'));
      $('.ftoast__time', el).textContent = this.minutesText(p.minutesAgo);
      // если в этом месте экрана кнопка оплаты — ждём, пока посетитель прокрутит
      if (overlapsPay(el)) { this.queue.unshift(p); this.nextAt = d.ms + 2000; return; }
      void el.offsetWidth;
      el.classList.add('is-open');
      el.classList.remove('is-dodged');
      this.open = true;
      this.shown += 1;
      session.set(P.storageKey, String(this.shown));
      this.nextAt = d.ms + rand(P.intervalMin, P.intervalMax);
      goal('purchase_toast_show', { tariff: p.tariff, demo: !!FEATURES_CONFIG.demo });
      var self = this;
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(function () { self.hide(); }, P.visibleFor);
    },
    dodge: function () { if (this.el) this.el.classList.toggle('is-dodged', overlapsPay(this.el)); },
    hide: function () {
      if (!this.el || !this.open) return;
      this.open = false;
      clearTimeout(this.hideTimer);
      this.el.classList.remove('is-open');
    }
  };

  /* ===================================================================
     7. Запуск
     =================================================================== */
  function init() {
    Chat.init();
    HeaderTimer.init();
    Dwell.init();
    Nudge.init();
    Toast.init();
    window.FORMA_FEATURES = { CONFIG: FEATURES_CONFIG, chat: Chat, dwell: Dwell, nudge: Nudge, toast: Toast };
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
