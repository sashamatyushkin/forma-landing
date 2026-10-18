/* =====================================================================
   ФОРМА — admin-bridge.js (демо-связка с админкой сайт/admin/)
   Подключён последним (defer), после main.js, animations.js, features.js, bottom.js.

   Читает localStorage['forma_admin_overrides'], который пишет админка по кнопке
   «Опубликовать», и применяет к лендингу:
    - цены тарифов (ранняя / после 28.10), «долями», «≈ N ₽ в день»,
      кнопки «Оплатить», цены в квизе и в форме оплаты — через window.FORMA.CONFIG
      (main.js читает его при открытии оплаты) и перерисовку тех же [data-price*];
    - «Осталось N из 20» в «Личном ведении» — через window.FORMA_BOTTOM (bottom.js);
    - видимость бонусов ранней записи;
    - заголовок первого экрана и текст главной кнопки.
   Слушает событие storage: если админка открыта в соседней вкладке, лендинг
   обновляется сразу, без перезагрузки. Удаление ключа возвращает исходные значения.

   ПРОД: этот файл не нужен — цены и тексты приходят из CMS/CRM при сборке или по API.
   Ключ в localStorage виден только в этом браузере, другим посетителям ничего не меняется.
   ===================================================================== */
(function () {
  'use strict';

  var KEY = 'forma_admin_overrides';
  var doc = document;
  var root = doc.documentElement;
  var NBSP = ' ';
  var KEYS = ['sama', 'kurator', 'lichnoe'];
  var HERO_PARTS = { titleAvg: '.hero__title-avg', titleA: '.hero__title-a', titleNum: '.hero__title-num', titleB: '.hero__title-b', titleC: '.hero__title-c' };

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function money(n) { return fmt(n) + NBSP + '₽'; }
  function read() { try { var v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function num(v, min) { return typeof v === 'number' && isFinite(v) && v >= (min || 0) ? v : null; }

  var F = window.FORMA || null;
  var B = window.FORMA_BOTTOM || null;
  var CONFIG = F && F.CONFIG ? F.CONFIG : null;
  function phase() { return F && typeof F.phase === 'function' ? (F.phase() || 'early') : (root.getAttribute('data-phase') || 'early'); }

  /* ---------- Снимок исходных значений (для «Сбросить к исходным») ---------- */
  var FALLBACK = { sama: [4900, 5900], kurator: [9900, 11900], lichnoe: [24900, 29900] };
  var orig = { tariffs: {}, seatsLeft: B && B.CONFIG ? B.CONFIG.seatsLeft : null, hero: {}, cta: null, heroPrice: null };
  KEYS.forEach(function (k) {
    var t = CONFIG && CONFIG.tariffs[k];
    orig.tariffs[k] = t ? { early: t.price.early, regular: t.price.regular, parts: t.parts } : { early: FALLBACK[k][0], regular: FALLBACK[k][1], parts: 4 };
  });

  // Текст строки заголовка без служебных узлов animations.js (маска, блик)
  function lineTarget(span) { return $('.mask__in', span) || span; }
  function lineText(span) {
    var t = lineTarget(span), s = '';
    Array.prototype.forEach.call(t.childNodes, function (n) { if (!(n.nodeType === 1 && n.classList.contains('glint'))) s += n.textContent; });
    return s;
  }
  function setLine(span, text) {
    var t = lineTarget(span);
    Array.prototype.slice.call(t.childNodes).forEach(function (n) { if (!(n.nodeType === 1 && n.classList.contains('glint'))) t.removeChild(n); });
    t.insertBefore(doc.createTextNode(text), t.firstChild);
    var g = $('.glint__text', span);
    if (g) g.textContent = text;
  }
  Object.keys(HERO_PARTS).forEach(function (k) { var el = $(HERO_PARTS[k]); if (el) orig.hero[k] = lineText(el); });
  var ctaLabel = $('.hero__cta .btn__label');
  if (ctaLabel) orig.cta = ctaLabel.textContent;
  var heroPrice = $('.hero__price');
  if (heroPrice) orig.heroPrice = heroPrice.textContent;

  /* ---------- Применение ---------- */
  var lastSeats = orig.seatsLeft;

  function apply(o) {
    var ov = (o && o.tariffs) || {};
    var p = phase();
    var t = {};
    KEYS.forEach(function (k) {
      var src = ov[k] || {}, base = orig.tariffs[k];
      var parts = num(src.parts, 1);
      t[k] = {
        early: num(src.early, 1) || base.early,
        regular: num(src.regular, 1) || base.regular,
        parts: parts ? Math.round(parts) : base.parts,
        showBonus: src.showBonus !== false
      };
      // main.js читает CONFIG при открытии формы оплаты (цена, «долями», скрытое поле price)
      if (CONFIG && CONFIG.tariffs[k]) {
        CONFIG.tariffs[k].price.early = t[k].early;
        CONFIG.tariffs[k].price.regular = t[k].regular;
        CONFIG.tariffs[k].parts = t[k].parts;
      }
    });
    function priceOf(k) { return p === 'early' ? t[k].early : t[k].regular; }

    // Цены в карточках, кнопках «Оплатить», квизе — те же атрибуты, что рисует main.js
    $$('[data-price]').forEach(function (el) { var k = el.getAttribute('data-price'); if (t[k]) el.textContent = money(priceOf(k)); });
    $$('[data-parts]').forEach(function (el) { var k = el.getAttribute('data-parts'); if (t[k]) el.textContent = t[k].parts + NBSP + '×' + NBSP + money(priceOf(k) / t[k].parts); });
    $$('[data-price-next]').forEach(function (el) { var k = el.getAttribute('data-price-next'); if (t[k]) el.textContent = money(t[k].regular); });

    // Остаток мест «Личного ведения» (bottom.js рисует строку и шкалу)
    var seats = ov.lichnoe && num(ov.lichnoe.seatsLeft, 0) !== null ? Math.min(20, Math.round(ov.lichnoe.seatsLeft)) : orig.seatsLeft;
    if (B && B.CONFIG) {
      B.CONFIG.seatsLeft = seats;
      if (seats !== lastSeats) { var meter = $('[data-seats-meter]'); if (meter) meter.innerHTML = ''; lastSeats = seats; }
      if (typeof B.render === 'function') B.render(); // заодно пересчитывает «≈ N ₽ в день» по новому CONFIG
    } else {
      $$('[data-per-day]').forEach(function (el) { var k = el.getAttribute('data-per-day'); if (t[k]) el.textContent = '≈ ' + fmt(priceOf(k) / 56) + ' ₽ в день'; });
    }

    // Бонусы ранней записи: только в фазе early и если не выключены в админке
    KEYS.forEach(function (k) {
      $$('.tariff[data-tariff="' + k + '"] .tariff__bonus').forEach(function (el) { el.hidden = !(p === 'early' && t[k].showBonus); });
    });

    // «от N ₽, можно долями» под кнопкой первого экрана
    if (heroPrice && orig.heroPrice) {
      var changed = KEYS.some(function (k) { return t[k].early !== orig.tariffs[k].early || t[k].regular !== orig.tariffs[k].regular; });
      heroPrice.textContent = changed ? 'от ' + money(Math.min.apply(null, KEYS.map(priceOf))) + ', можно долями' : orig.heroPrice;
    }

    // Первый экран: заголовок и главная кнопка
    var hero = (o && o.content && o.content.hero) || {};
    Object.keys(HERO_PARTS).forEach(function (k) {
      var el = $(HERO_PARTS[k]);
      if (!el || orig.hero[k] == null) return;
      var v = typeof hero[k] === 'string' && hero[k].trim() ? hero[k].trim() : orig.hero[k];
      if (k === 'titleNum') v = v.replace(/ /g, NBSP);
      if (lineText(el) !== v) setLine(el, v);
    });
    if (ctaLabel && orig.cta != null) {
      var c = typeof hero.cta === 'string' && hero.cta.trim() ? hero.cta.trim() : orig.cta;
      if (ctaLabel.textContent !== c) ctaLabel.textContent = c;
    }

    root.setAttribute('data-admin-overrides', o ? 'on' : 'off');
    if (o && window.console) console.info('[admin-bridge] применены правки из админки (демо)', o);
  }

  apply(read());

  // Админка в соседней вкладке опубликовала изменения — применяем без перезагрузки
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) apply(read()); });
  // Смена фазы (28.10, 2.11) — main.js перерисовал цены и бонусы, накладываем правки снова
  doc.addEventListener('forma:phase', function () { apply(read()); });

  window.FORMA_ADMIN_BRIDGE = { apply: function () { apply(read()); }, key: KEY, original: orig };
})();
