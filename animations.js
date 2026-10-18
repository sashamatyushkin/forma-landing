/* =====================================================================
   ФОРМА — animations.js
   Анимации и декор концепции «Луч». GSAP 3 + ScrollTrigger (cdnjs, подключены в index.html).
   Анимируем только transform и opacity. Контент виден без JS: стартовые состояния
   ставятся здесь (gsap.set) или в styles.css под html.js.

   Разделы:
    0. Режим: anim-on (GSAP есть, движение разрешено) / anim-off (reduced-motion или нет GSAP)
    1. Декор, который нужен в любом режиме с JS (часы шкалы дня, линия 8 недель, подсказки таймкодов,
       выноски, ползунок вкладок, классы is-inview, плавные якоря)
    2. Утилиты анимаций (reveal, line-mask)
    3. Первый экран: загрузка + блик по «6–10 СМ»
    4. Блок 2
    5. Блок 3: штора Анны, вау-момент «солнце проходит 8 недель» (pin)
    6. Блок 4: телефон, сообщения, выноски
    7. Блок 5: подсказка слайдера, отсчёт цифр
    8. Блок 6: карточки, луч, таймер
    9. Блок 7: FAQ, финал
   ===================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var reduce = reduceMq.matches;
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var animate = !!(gsap && ST) && !reduce;

  // Аналоги токенов --ease-light (.22,1,.36,1 ≈ quint out) и --ease-move (.65,0,.35,1 ≈ cubic in-out)
  var EASE_LIGHT = 'power4.out';
  var EASE_MOVE = 'power2.inOut';

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function on(name, fn) { doc.addEventListener('forma:' + name, function (e) { fn(e.detail || {}); }); }

  if (animate) gsap.registerPlugin(ST);

  /* ===================================================================
     1. Декор (работает и при reduced-motion)
     =================================================================== */

  // 1.1. Подписи часов под дорожкой шкалы дня (правка v3 Д4): 6:00, 9:00 … 21:00
  $$('.day__line').forEach(function (line) {
    var hours = el('div', 'day__hours');
    hours.setAttribute('aria-hidden', 'true');
    for (var h = 6; h <= 21; h += 3) {
      var s = el('span', 'day__hour', h + ':00');
      s.style.setProperty('--h', h - 6);
      hours.appendChild(s);
    }
    line.appendChild(hours);
  });

  // 1.2. Классы .is-inview: дрейф лучей идёт только в зоне видимости, шкала дня рисуется при входе
  if ('IntersectionObserver' in window) {
    var ioView = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-inview', e.isIntersecting); });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.hero, .tariffs, .final').forEach(function (s) { ioView.observe(s); });
    var ioOnce = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-inview'); ioOnce.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -15% 0px' });
    $$('.day').forEach(function (d) { ioOnce.observe(d); });
  } else {
    $$('.hero, .tariffs, .final, .day').forEach(function (s) { s.classList.add('is-inview'); });
  }

  // 1.3. Финал: «27 декабря» — отдельной строкой цветом луча
  var finalTitle = $('.final__title');
  if (finalTitle && finalTitle.firstChild && finalTitle.firstChild.nodeType === 3) {
    var txt = finalTitle.firstChild.textContent;
    var m = txt.match(/^(\s*27\s+декабря)\s*/i);
    if (m) {
      var date = el('span', 'final__title-date', m[1].trim());
      finalTitle.firstChild.textContent = txt.slice(m[0].length);
      finalTitle.insertBefore(date, finalTitle.firstChild);
    }
  }

  // 1.4. 8 недель: линия прогресса с 8 делениями и солнце (в статичной версии — над этапом 4)
  var weeks = $('[data-weeks]');
  var weeksParts = null;
  if (weeks) {
    var track = el('div', 'weeks__track');
    track.setAttribute('aria-hidden', 'true');
    var bar = el('div', 'weeks__bar');
    var fill = el('span', 'weeks__fill');
    var ticks = el('div', 'weeks__ticks');
    for (var t = 0; t <= 8; t++) ticks.appendChild(el('span', 'weeks__tick'));
    bar.appendChild(fill); bar.appendChild(ticks);
    var ends = el('div', 'weeks__ends');
    ends.appendChild(el('span', '', '2 ноября'));
    ends.appendChild(el('span', '', '27 декабря'));
    track.appendChild(bar); track.appendChild(ends);
    var list = $('.weeks__list', weeks);
    list.parentNode.insertBefore(track, list.nextSibling);

    var sun = el('span', 'weeks__sun');
    sun.setAttribute('aria-hidden', 'true');
    weeks.insertBefore(sun, weeks.firstChild);
    $$('.weeks__stage', weeks).forEach(function (s) { s.classList.add('is-lit'); });
    weeksParts = { track: track, fill: fill, sun: sun, list: list };
  }

  // 1.5. Подсказки на метках видео: текст из сообщения куратора («колени уходят внутрь»)
  $$('.chat__tc').forEach(function (btn) {
    var tc = btn.getAttribute('data-tc');
    var mark = $('.video__mark[data-mark="' + tc + '"]');
    if (!mark) return;
    var text = (btn.parentNode.textContent || '').replace(tc, '').replace(/^[\s—–-]+/, '');
    var tip = text.split(/[.!]/)[0].trim();
    if (tip) mark.setAttribute('data-tip', tip);
  });

  // 1.6. Чат: подсказка «Пролистай до пятницы» и выноски, привязанные к сообщениям
  var chat = $('[data-chat]');
  var chatList = chat ? $('.chat__list', chat) : null;
  var callouts = $('.callouts');
  var stage = $('.tech__stage');
  function placeCallouts() {
    if (!callouts || !chatList || !stage) return;
    var sr = stage.getBoundingClientRect();
    var lr = chatList.getBoundingClientRect();
    var cr = callouts.getBoundingClientRect();
    $$('.callouts__item', callouts).forEach(function (item) {
      var target = $('[data-callout="' + item.getAttribute('data-for') + '"]', chat);
      if (!target) return;
      var r = target.getBoundingClientRect();
      var y = r.top + Math.min(r.height, 120) / 2 - cr.top - 10;
      item.style.setProperty('--y', Math.round(y) + 'px');
      item.classList.toggle('is-off', r.top + 20 < lr.top || r.top + 20 > lr.bottom - 20);
    });
    void sr;
  }
  if (chatList) {
    var hint = el('p', 'chat__hint', 'Пролистай до пятницы');
    hint.setAttribute('aria-hidden', 'true');
    $('.chat', chat).appendChild(hint);
    var raf = 0;
    chatList.addEventListener('scroll', function () {
      if (chatList.scrollTop > 8) hint.classList.add('is-hidden');
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; placeCallouts(); });
    }, { passive: true });
  }
  if (callouts && chatList) {
    callouts.classList.add('callouts--placed');
    placeCallouts();
    window.addEventListener('resize', placeCallouts);
    window.addEventListener('load', placeCallouts);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placeCallouts);
  }

  // 1.7. Ползунок вкладок блока 2 («освещённая» подложка переезжает)
  var tabs = $('[data-tabs]');
  var glider = null;
  function moveGlider(instant) {
    if (!glider) return;
    var active = $('.tabs__tab.is-active', tabs) || $('.tabs__tab', tabs);
    if (!active) return;
    var oldX = glider._x == null ? active.offsetLeft : glider._x;
    var oldW = glider._w == null ? active.offsetWidth : glider._w;
    var x = active.offsetLeft, w = active.offsetWidth;
    glider._x = x; glider._w = w;
    // Ширина ставится сразу (не анимируется), движение — transform (FLIP: x + scaleX)
    glider.style.width = w + 'px';
    if (animate && !instant && (oldX !== x || oldW !== w)) {
      gsap.fromTo(glider, { x: oldX, scaleX: oldW / w }, { x: x, scaleX: 1, duration: 0.32, ease: EASE_MOVE, overwrite: true });
    } else if (gsap) {
      gsap.set(glider, { x: x, scaleX: 1 });
    } else {
      glider.style.transform = 'translateX(' + x + 'px)';
    }
  }
  if (tabs) {
    glider = el('span', 'tabs__glider');
    glider.setAttribute('aria-hidden', 'true');
    tabs.insertBefore(glider, tabs.firstChild);
    tabs.classList.add('has-glider');
    moveGlider(true);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { glider._x = null; glider._w = null; moveGlider(true); });
    on('tabchange', function (d) { if (d.group === 'segments') moveGlider(false); });
  }

  // 1.8. Плавные якоря (без Lenis): учитывают scroll-margin-top под шапку. main.js сам обрабатывает
  // свои ссылки (квиз, «Хочу с куратором») и ставит preventDefault — их не трогаем.
  doc.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('skip-link')) return;
    var id = a.getAttribute('href').slice(1);
    var target = id ? doc.getElementById(id) : null;
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (history.pushState) history.pushState(null, '', '#' + id);
  });

  /* ===================================================================
     0. Режим
     =================================================================== */
  if (!animate) {
    root.classList.add('anim-off');
    if (reduceMq.addEventListener) reduceMq.addEventListener('change', function () { location.reload(); });
    return;
  }

  /* ===================================================================
     2. Утилиты анимаций
     =================================================================== */
  function toArr(t) { return typeof t === 'string' ? $$(t) : (t && t.length != null ? Array.prototype.slice.call(t) : (t ? [t] : [])); }

  // Появление: opacity 0→1, сдвиг 24→0, 800 мс, шаг 80 мс, когда верх на 85% экрана, один раз
  function reveal(trigger, targets, o) {
    o = o || {};
    targets = toArr(targets).filter(Boolean);
    if (!targets.length) return null;
    gsap.set(targets, { opacity: 0, y: o.y == null ? 24 : o.y, x: o.x || 0 });
    return ST.create({
      trigger: trigger || targets[0],
      start: o.start || 'top 85%',
      once: true,
      onEnter: function () {
        gsap.to(targets, {
          opacity: 1, y: 0, x: 0,
          duration: o.duration || 0.8, ease: o.ease || EASE_LIGHT,
          stagger: o.stagger == null ? 0.08 : o.stagger, delay: o.delay || 0,
          clearProps: 'transform,opacity',
          onComplete: o.onComplete
        });
      }
    });
  }

  // Разбивка заголовка на слова в масках (замена SplitText без доп. плагина)
  function splitWords(node, out) {
    out = out || [];
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = doc.createDocumentFragment();
        n.textContent.split(/([ \t\n\r]+)/).forEach(function (p) {
          if (!p) return;
          if (/^[ \t\n\r]+$/.test(p)) { frag.appendChild(doc.createTextNode(' ')); return; }
          var mask = el('span', 'mask');
          var inner = el('span', 'mask__in', p);
          mask.appendChild(inner);
          frag.appendChild(mask);
          out.push(inner);
        });
        n.parentNode.replaceChild(frag, n);
      } else if (n.nodeType === 1) {
        splitWords(n, out);
      }
    });
    return out;
  }

  // Построчное появление: слова одной строки выезжают из маски вместе, строки — с шагом 90 мс
  function lineMask(heading, o) {
    if (!heading) return;
    o = o || {};
    var words = splitWords(heading);
    if (!words.length) return;
    gsap.set(words, { yPercent: 150 }); // 150, а не 110: иначе у Ё и Й торчат точки и дужка над маской
    ST.create({
      trigger: heading, start: o.start || 'top 85%', once: true,
      onEnter: function () {
        var tops = [], idx = words.map(function (w) {
          var top = Math.round(w.parentNode.offsetTop / 4);
          var i = tops.indexOf(top);
          if (i === -1) { tops.push(top); i = tops.length - 1; }
          return i;
        });
        gsap.to(words, {
          yPercent: 0, duration: 0.9, ease: EASE_LIGHT, delay: o.delay || 0,
          stagger: function (i) { return idx[i] * 0.09; },
          clearProps: 'transform'
        });
      }
    });
  }

  /* ===================================================================
     3. Первый экран
     =================================================================== */
  var hero = $('.hero');
  var heroLines = $$('.hero__title > span');
  var heroInners = heroLines.map(function (line) {
    var inner = el('span', 'mask__in');
    while (line.firstChild) inner.appendChild(line.firstChild);
    line.appendChild(inner);
    line.style.clipPath = 'inset(-0.12em -0.3em -0.14em -0.3em)';
    return inner;
  });

  // Блик: дубль «6–10 СМ» в узком окне, окно едет вправо, текст внутри — навстречу
  var num = $('.hero__title-num .mask__in');
  var glint = null, glintText = null;
  if (num) {
    glint = el('span', 'glint');
    glint.setAttribute('aria-hidden', 'true');
    glintText = el('span', 'glint__text', $('.hero__title-num').textContent);
    glint.appendChild(glintText);
    num.appendChild(glint);
  }

  var heroMedia = $('.hero__media');
  var heroImg = heroMedia ? $('img', heroMedia) : null;
  var heroBeams = $('.hero__beams');
  var heroTrust = $$('.trust__item');
  var heroCta = $('.hero__cta');
  var heroQuiz = [$('.hero__quiz'), $('.hero__price'), $('.hero__title-ref')].filter(Boolean);
  var heroEyebrow = $('.hero__eyebrow');

  gsap.set(heroMedia, { opacity: 0 });
  if (heroImg) gsap.set(heroImg, { scale: 1.06, transformOrigin: '60% 40%' });
  gsap.set(heroInners, { yPercent: 110 });
  gsap.set([heroEyebrow, heroCta].concat(heroQuiz, heroTrust), { opacity: 0, y: 24 });
  gsap.set(heroBeams, { opacity: 0 });
  gsap.set(hero, { '--clock-o': 0 });
  root.classList.add('anim-on'); // CSS-страховка снимается: дальше состояния держит GSAP

  function startHero() {
    var tl = gsap.timeline({ defaults: { ease: EASE_LIGHT } });
    tl.to(heroMedia, { opacity: 1, duration: 1.4 }, 0)
      .to(heroImg, { scale: 1, duration: 1.4, clearProps: 'transform' }, 0)
      .to(heroEyebrow, { opacity: 1, y: 0, duration: 0.8 }, 0.2)
      .to(heroInners, { yPercent: 0, duration: 0.9, stagger: 0.1 }, 0.3)
      .to(heroBeams, { opacity: 1, duration: 1, ease: 'sine.out' }, 0.6)
      .to(heroTrust, { opacity: 1, y: 0, duration: 0.8, stagger: 0.06 }, 0.9)
      .to(heroCta, { opacity: 1, y: 0, duration: 0.8, clearProps: 'transform' }, 1.0)
      .to(heroQuiz, { opacity: 1, y: 0, duration: 0.8, stagger: 0.06, clearProps: 'transform' }, 1.1)
      .to(hero, { '--clock-o': 1, duration: 1.2, ease: 'sine.out' }, 1.1);

    if (glint) {
      var w = $('.hero__title-num').offsetWidth;
      gsap.set(glint, { x: -0.3 * w });
      gsap.set(glintText, { x: 0.3 * w });
      var g = gsap.timeline({ repeat: -1, repeatDelay: 6.6, delay: 1.3 });
      g.fromTo(glint, { x: -0.3 * w }, { x: 1.0 * w, duration: 1.4, ease: EASE_MOVE }, 0)
       .fromTo(glintText, { x: 0.3 * w }, { x: -1.0 * w, duration: 1.4, ease: EASE_MOVE }, 0);
      // блик не крутится, пока первый экран не виден
      ST.create({ trigger: hero, start: 'top top', end: 'bottom top', onToggle: function (s) { s.isActive ? g.resume() : g.pause(); } });
    }
  }
  // Параллакс фото первого экрана: фото уходит медленнее текста
  if (heroMedia) {
    gsap.to(heroMedia, { y: 140, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__body', { y: -60, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }
  // «Дыхание» луча: полосы медленно меняют яркость вразнобой (только opacity)
  function breathe(sel) {
    $$(sel).forEach(function (b, i) {
      var base = parseFloat(getComputedStyle(b).opacity) || 1;
      gsap.to(b, { opacity: base * 0.45, duration: 3.2 + i * 0.9, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.7 });
    });
  }
  breathe('.hero__beams .beams__beam');
  breathe('.final__beams .beams__beam');

  var heroStarted = false;
  function heroGo() { if (!heroStarted) { heroStarted = true; startHero(); } }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(heroGo);
  setTimeout(heroGo, 600);

  /* ===================================================================
     4. Блок 2. Это про тебя
     =================================================================== */
  lineMask($('.segments__title'));
  reveal('.segments__head', '.segments__lead', { delay: 0.2 });
  reveal('.segments__tabs', '.segments__tabs');
  var activePanel = $('.segments__panel.is-active');
  if (activePanel) reveal(activePanel, $$('.compare__col, .compare__arrow', activePanel), { stagger: 0.08 });
  reveal('.segments__actions', '.segments__actions > *');

  /* ===================================================================
     5. Блок 3. Программа
     =================================================================== */
  lineMask($('.program__title'));
  reveal('.program__head', '.program__eyebrow');
  reveal('.coach__quote', '.coach__quote', { delay: 0.2 });

  // 3а. Фото Анны открывается «шторой», плашки-факты приходят справа
  var coachMedia = $('.coach__media');
  if (coachMedia) {
    var curtain = el('span', 'coach__curtain');
    curtain.setAttribute('aria-hidden', 'true');
    coachMedia.appendChild(curtain);
    var coachImg = $('img', coachMedia);
    gsap.fromTo(coachImg, { yPercent: -5 }, { yPercent: 5, ease: 'none', scrollTrigger: { trigger: coachMedia, start: 'top bottom', end: 'bottom top', scrub: true } });
    var facts = $$('.coach__fact');
    gsap.set(facts, { opacity: 0, x: 16 });
    ST.create({
      trigger: coachMedia, start: 'top 80%', once: true,
      onEnter: function () {
        gsap.to(curtain, { xPercent: 101, duration: 1, ease: EASE_LIGHT });
        gsap.to(facts, { opacity: 1, x: 0, duration: 0.8, ease: EASE_LIGHT, stagger: 0.08, delay: 0.4, clearProps: 'transform,opacity' });
      }
    });
  }

  // 3в. Вау-момент: «солнце проходит 8 недель» — pin на 1800 px, scrub 0.6
  if (weeks && weeksParts && window.innerHeight >= 640) {
    weeks.classList.add('weeks--pin');
    var stages = $$('.weeks__stage', weeks);
    stages.forEach(function (s) { s.classList.remove('is-lit'); });
    var finish = $('.weeks__finish', weeks);
    var sunEl = weeksParts.sun;

    var trail = el('span', 'weeks__trail'); trail.setAttribute('aria-hidden', 'true');
    var milk = el('span', 'weeks__milk'); milk.setAttribute('aria-hidden', 'true');
    weeks.insertBefore(trail, weeks.firstChild);
    weeks.insertBefore(milk, finish);

    var counter = el('div', 'weeks__counter');
    counter.setAttribute('aria-hidden', 'true');
    counter.appendChild(el('span', 'weeks__counter-label', 'Неделя'));
    var cNum = el('span', 'weeks__counter-num');
    var cStroke = el('span', 'weeks__counter-stroke', '1');
    var cFill = el('span', 'weeks__counter-fill', '8');
    cNum.appendChild(cStroke); cNum.appendChild(cFill);
    counter.appendChild(cNum);
    ($('.weeks__top', weeks) || weeks).appendChild(counter);

    var sunW = 360;
    function stageX(i) {
      var sr = weeks.getBoundingClientRect(), r = stages[i].getBoundingClientRect();
      return r.left - sr.left + (r.width - 32) / 2 - sunW / 2;
    }
    function trailScale(i) { return (stageX(i) + sunW / 2) / weeks.offsetWidth; }

    gsap.set(sunEl, { x: -sunW * 1.6, rotation: -24, scaleX: 1, opacity: 0, transformOrigin: '50% 50%' });
    gsap.set(trail, { scaleX: 0 });
    gsap.set(stages, { opacity: 0.45 });
    gsap.set(weeksParts.fill, { scaleX: 0 });
    gsap.set(milk, { opacity: 0 });
    gsap.set(finish, { opacity: 0, y: 16 });

    var lastWeek = 0, lastStage = -1;
    function onProgress(p) {
      var week = p >= 0.84 ? 8 : Math.min(8, Math.floor(p / 0.105) + 1);
      if (week !== lastWeek) { lastWeek = week; cStroke.textContent = String(week); counter.classList.toggle('is-done', p >= 0.79); }
      else counter.classList.toggle('is-done', p >= 0.79);
      var st = p < 0.21 ? 0 : p < 0.42 ? 1 : p < 0.63 ? 2 : 3;
      if (st !== lastStage) {
        lastStage = st;
        stages.forEach(function (s, i) { s.classList.toggle('is-lit', i === st); });
      }
      // финиш интерактивен только когда проявился (кнопок в нём нет, но не мешаем фокусу)
    }

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: weeks, start: 'top top', end: '+=1800',
        pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: function (self) { onProgress(self.progress); },
        onRefresh: function (self) { onProgress(self.progress); }
      }
    });
    tl.to(sunEl, { x: function () { return stageX(0); }, opacity: 1, duration: 0.04, ease: 'power1.out' }, 0)
      .to(trail, { scaleX: function () { return trailScale(0); }, duration: 0.04 }, 0)
      .to(stages[0], { opacity: 1, duration: 0.03 }, 0.01)
      .to(weeksParts.fill, { scaleX: 2 / 8, duration: 0.17 }, 0.04);
    for (var i = 1; i < 4; i++) {
      (function (i) {
        var t0 = 0.21 * i;
        tl.to(sunEl, { x: function () { return stageX(i); }, duration: 0.07, ease: 'power1.inOut' }, t0)
          .to(trail, { scaleX: function () { return trailScale(i); }, duration: 0.07, ease: 'power1.inOut' }, t0)
          .to(stages[i - 1], { opacity: 0.8, duration: 0.05 }, t0)
          .to(stages[i], { opacity: 1, duration: 0.05 }, t0 + 0.03)
          .to(weeksParts.fill, { scaleX: (2 * i + 2) / 8, duration: 0.14 }, t0 + 0.07);
      })(i);
    }
    // Финал: луч расширяется и заливает комнату светом, проявляется «Финиш 27 декабря»
    tl.to(sunEl, { scaleX: 6, duration: 0.1, ease: 'power1.in' }, 0.84)
      .to(milk, { opacity: 1, duration: 0.1, ease: 'power1.in' }, 0.84)
      .to([weeksParts.list, weeksParts.track, counter], { opacity: 0, duration: 0.06 }, 0.86)
      .to(finish, { opacity: 1, y: 0, duration: 0.06 }, 0.94);
  } else if (weeks) {
    reveal(weeks, '.weeks__stage', { stagger: 0.1 });
  }

  // 3б. Что внутри: карточки модулей каскадом
  lineMask($('.inside__title'));
  reveal('.inside__head', '.inside__sub', { delay: 0.2 });
  reveal('.inside__grid', '.inside__card', { stagger: 0.07, onComplete: null });
  reveal('.program__actions', '.program__actions > *', { stagger: 0.08 });

  /* ===================================================================
     6. Блок 4. Куратор
     =================================================================== */
  lineMask($('.tech__title'));
  reveal('.tech__head', ['.tech__lead'], { delay: 0.2 });
  reveal('.tech__note', ['.tech__note', '.tech__actions > *']);
  var phone = $('.tech__phone');
  if (phone) {
    gsap.set(phone, { opacity: 0, y: 40 });
    var msgs = $$('.chat__msg', phone);
    gsap.set(msgs, { opacity: 0, y: 12 });
    var cItems = $$('.callouts__item');
    gsap.set(cItems, { opacity: 0 });
    ST.create({
      trigger: phone, start: 'top 85%', once: true,
      onEnter: function () { gsap.to(phone, { opacity: 1, y: 0, duration: 0.9, ease: EASE_LIGHT, clearProps: 'transform,opacity' }); }
    });
    ST.create({
      trigger: phone, start: 'top 60%', once: true,
      onEnter: function () {
        gsap.to(msgs, { opacity: 1, y: 0, duration: 0.32, ease: EASE_LIGHT, stagger: 0.16, delay: 0.3, clearProps: 'transform,opacity' });
        // выноска появляется после «своего» сообщения
        cItems.forEach(function (item) {
          var target = $('[data-callout="' + item.getAttribute('data-for') + '"]', phone);
          var n = target ? msgs.indexOf(target.closest('.chat__msg')) : 0;
          var d = 0.3 + Math.max(0, n) * 0.16 + 0.32;
          gsap.to(item, { opacity: 1, duration: 0.3, delay: d, clearProps: 'opacity', onStart: function () { item.classList.add('is-drawn'); } });
        });
      }
    });
  }

  /* ===================================================================
     7. Блок 5. Результаты
     =================================================================== */
  lineMask($('.results__title'));
  reveal('.cases__switch', '.cases__tab', { stagger: 0.06 });
  reveal('.stats', ['.stats__item', '.stats__note'], { stagger: 0.08 });
  var reviews = $$('.reviews__item');
  if (reviews.length) {
    gsap.set(reviews, { opacity: 0, y: 24 });
    ST.create({
      trigger: '.reviews', start: 'top 85%', once: true,
      onEnter: function () {
        reviews.forEach(function (r, i) {
          gsap.to(r, { opacity: 1, y: 0, duration: 0.8, ease: EASE_LIGHT, delay: i * 0.06 + (i === 1 ? 0.12 : 0), clearProps: 'transform,opacity' });
        });
      }
    });
  }
  reveal('.results__consent', ['.results__consent', '.results__actions > *']);

  // Отсчёт цифр кейса: −0,0 → −5,8 (меняется только текст, ширина держится tabular-nums)
  function countUp(node, dur) {
    if (!node) return;
    var src = node.getAttribute('data-src') || node.textContent;
    node.setAttribute('data-src', src);
    var m = src.match(/^([^\d]*)(\d+(?:,\d+)?)(.*)$/);
    if (!m) return;
    var dec = (m[2].split(',')[1] || '').length;
    var target = parseFloat(m[2].replace(',', '.'));
    var o = { v: 0 };
    gsap.killTweensOf(node._cnt || {});
    node._cnt = o;
    gsap.to(o, {
      v: target, duration: dur, ease: 'power2.out',
      onUpdate: function () { node.textContent = m[1] + o.v.toFixed(dec).replace('.', ',') + m[3]; },
      onComplete: function () { node.textContent = src; }
    });
  }
  function caseNums(panel, dur) { $$('.case__num', panel).forEach(function (n) { countUp(n, dur); }); }
  var firstCase = $('.cases__case.is-active') || $('.cases__case');
  if (firstCase) {
    gsap.set($$('.case__info > *', firstCase), { opacity: 0, y: 24 });
    gsap.set($('.ba', firstCase), { opacity: 0, y: 24 });
    ST.create({
      trigger: firstCase, start: 'top 80%', once: true,
      onEnter: function () {
        gsap.to($('.ba', firstCase), { opacity: 1, y: 0, duration: 0.8, ease: EASE_LIGHT, clearProps: 'transform,opacity' });
        gsap.to($$('.case__info > *', firstCase), { opacity: 1, y: 0, duration: 0.8, ease: EASE_LIGHT, stagger: 0.08, delay: 0.1, clearProps: 'transform,opacity' });
        caseNums(firstCase, 1);
      }
    });
    // Подсказка слайдера: ручка 50% → 38% → 50%, один раз
    var ba = $('.ba', firstCase);
    var wrap = $('[data-cases]');
    ST.create({
      trigger: ba, start: 'top 55%', once: true,
      onEnter: function () {
        if (wrap && wrap.classList.contains('is-interacted')) return;
        var p = { v: 50 };
        gsap.to(p, {
          keyframes: [{ v: 38, duration: 0.6, ease: EASE_MOVE }, { v: 50, duration: 0.6, ease: EASE_MOVE }],
          delay: 0.6,
          onUpdate: function () { if (!ba.classList.contains('is-dragging')) ba.style.setProperty('--pos', p.v.toFixed(2)); }
        });
      }
    });
  }
  on('tabchange', function (d) { if (d.group === 'cases' && d.panel) caseNums(d.panel, 0.6); });

  /* ===================================================================
     8. Блок 6. Тарифы
     =================================================================== */
  lineMask($('.tariffs__title'));
  reveal('.tariffs__head', '.tariffs__lead', { delay: 0.2 });
  reveal('.tariffs__timer', '.tariffs__timer');
  var tSection = $('.tariffs');
  var mainItem = $('.tariffs__item--main');
  var sideItems = $$('.tariffs__item:not(.tariffs__item--main)');
  if (mainItem) {
    gsap.set(mainItem, { opacity: 0, y: 64 });
    gsap.set(sideItems, { opacity: 0, y: 40 });
    ST.create({
      trigger: '.tariffs__list', start: 'top 85%', once: true,
      onEnter: function () {
        gsap.to([mainItem].concat(sideItems), {
          opacity: 1, y: 0, duration: 0.8, ease: EASE_LIGHT, stagger: 0.1, clearProps: 'transform,opacity',
          onComplete: function () { if (this.targets && tSection) tSection.classList.add('is-lit'); }
        });
        gsap.delayedCall(0.9, function () { tSection.classList.add('is-lit'); });
      }
    });
  }
  reveal('.tariffs__footer', '.tariffs__footer > *', { stagger: 0.06 });

  // Таймер: новая цифра приходит снизу (240 мс), без мигания
  var lastTimer = {};
  on('timer', function (d) {
    ['days', 'hours', 'minutes'].forEach(function (k) {
      if (lastTimer[k] != null && lastTimer[k] !== d[k]) {
        var v = $('[data-timer-value="' + k + '"]');
        if (v) gsap.fromTo(v, { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.24, ease: EASE_LIGHT, clearProps: 'transform,opacity' });
      }
      lastTimer[k] = d[k];
    });
  });

  /* ===================================================================
     9. Блок 7. FAQ и финал
     =================================================================== */
  lineMask($('.faq__title'));
  reveal('.faq__list', '.accordion__item', { stagger: 0.06 });

  var fBeams = $('.final__beams');
  var fMedia = $('.final__media');
  gsap.set(fBeams, { opacity: 0 });
  if (fMedia) gsap.set(fMedia, { opacity: 0 });
  ST.create({
    trigger: '.final', start: 'top 75%', once: true,
    onEnter: function () {
      gsap.to(fMedia, { opacity: 1, duration: 1.2, ease: 'sine.out' });
      gsap.to(fBeams, { opacity: 1, duration: 1.2, ease: 'sine.out', delay: 0.2 });
    }
  });
  lineMask(finalTitle);
  reveal('.final__inner', ['.final__text:not([hidden])', '.final__actions', '.final__risk'], { stagger: 0.08, delay: 0.3 });

  /* Пересчёт позиций после загрузки шрифтов и картинок */
  function refresh() { ST.refresh(); placeCallouts(); }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);
})();
