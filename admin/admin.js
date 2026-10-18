/* =====================================================================
   ФОРМА — демо-админка. admin.js
   Vanilla JS + Apache ECharts 5.5.1. Данные — admin-data.js (демо, seed).

   Разделы:
    1. Утилиты и хранилище
    2. Состояние, фильтры, агрегирование
    3. KPI-карточки со спарклайнами
    4. Графики ECharts: выручка и оплаты, тарифы, источники, сегменты, тепловая карта
    5. Воронка и таблица кампаний (+ экспорт CSV)
    6. «Живость»: лента событий, колокольчик, «сейчас на сайте», обновление
    7. Навигация по разделам и режим «Фокус»
    8. Редактор цен (демо: сохраняется только в localStorage админки)
    9. Редактор контента (+ FAQ с перетаскиванием, история)
   10. Настройки, тосты
   11. Запуск

   Публикация: localStorage['forma_admin_overrides'] =
     { version: 1, updatedAt, tariffs: { sama|kurator|lichnoe: { early, regular, parts, showBonus, seatsLeft? } },
       content: { hero: { titleAvg, titleA, titleNum, titleB, titleC, cta } } }
   Демо-режим: сайт этот ключ НЕ читает (admin-bridge.js отключён, лежит в проект/архив/).
   ===================================================================== */
(function () {
  'use strict';

  var D = window.FORMA_ADMIN_DATA;
  var doc = document;
  var OVERRIDES_KEY = 'forma_admin_overrides';
  var CONTENT_KEY = 'forma_admin_content';
  var SETTINGS_KEY = 'forma_admin_settings';

  /* ===================================================================
     1. Утилиты
     =================================================================== */
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  var NBSP = ' ';
  function int(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function money(n) { return int(n) + NBSP + '₽'; }
  function pct(x, digits) { if (!isFinite(x)) return '—'; return (x * 100).toFixed(digits == null ? 1 : digits).replace('.', ',') + '%'; }
  function dec(x, d) { return x.toFixed(d).replace('.', ','); }
  function compactMoney(n) {
    if (n >= 1e6) return { v: dec(n / 1e6, 2), u: 'млн ₽' };
    if (n >= 1e4) return { v: dec(n / 1e3, 0), u: 'тыс ₽' };
    return { v: int(n), u: '₽' };
  }
  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function dShort(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1); }
  function dLong(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) { /* приватный режим */ } }
  };

  var COLORS = { kurator: '#D9702A', sama: '#3987E5', lichnoe: '#199E70', ig: '#D9702A', tg: '#3987E5', vk: '#199E70', org: '#9085E9' };
  var SRC_NAME = {}; D.sources.forEach(function (s) { SRC_NAME[s.key] = s.name; });
  var SEG_NAME = {}; D.segments.forEach(function (s) { SEG_NAME[s.key] = s.name; });
  var TAR_NAME = { kurator: 'С куратором', sama: 'Сама', lichnoe: 'Личное ведение' };
  var CAMP = {}; D.campaigns.forEach(function (c) { CAMP[c.id] = c; });

  // Цены, по которым прошли демо-продажи (ранняя цена). Публикация новых цен историю не меняет
  var HIST_PRICE = { kurator: D.priceDefaults.kurator.early, sama: D.priceDefaults.sama.early, lichnoe: D.priceDefaults.lichnoe.early };
  D.rows.forEach(function (r) {
    r.pays = r.pay.kurator + r.pay.sama + r.pay.lichnoe;
    r.rev = r.pay.kurator * HIST_PRICE.kurator + r.pay.sama * HIST_PRICE.sama + r.pay.lichnoe * HIST_PRICE.lichnoe;
  });

  /* ===================================================================
     2. Состояние и агрегирование
     =================================================================== */
  var state = { period: 30, source: 'all', segment: 'all', tariffMeasure: 'count', sortKey: 'revenue', sortDir: -1 };

  function range(period, shift) {
    var to = D.days - 1 - (shift ? period : 0);
    return [to - period + 1, to];
  }
  function pick(opts) {
    var rg = opts.range, src = opts.source, seg = opts.segment;
    return D.rows.filter(function (r) {
      return r.d >= rg[0] && r.d <= rg[1] && (src === 'all' || r.s === src) && (seg === 'all' || r.g === seg);
    });
  }
  function sum(rows) {
    var a = { visits: 0, mobile: 0, scroll: 0, quizStart: 0, quizFinish: 0, checkout: 0, pays: 0, rev: 0, kurator: 0, sama: 0, lichnoe: 0,
      marathon: 0, spend: 0, paidRev: 0, clicks: 0, impr: 0 };
    rows.forEach(function (r) {
      a.visits += r.visits; a.mobile += r.mobile; a.scroll += r.scroll; a.quizStart += r.quizStart; a.quizFinish += r.quizFinish;
      a.checkout += r.checkout; a.pays += r.pays; a.rev += r.rev; a.kurator += r.pay.kurator; a.sama += r.pay.sama; a.lichnoe += r.pay.lichnoe;
      a.marathon += r.marathon; a.spend += r.spend; a.clicks += r.clicks; a.impr += r.impr;
      if (r.spend > 0) a.paidRev += r.rev;
    });
    return a;
  }
  function byDay(rows, rg) {
    var out = [];
    for (var d = rg[0]; d <= rg[1]; d++) out.push(sum([]));
    rows.forEach(function (r) {
      var o = out[r.d - rg[0]];
      o.visits += r.visits; o.mobile += r.mobile; o.scroll += r.scroll; o.quizStart += r.quizStart; o.quizFinish += r.quizFinish;
      o.checkout += r.checkout; o.pays += r.pays; o.rev += r.rev; o.kurator += r.pay.kurator; o.sama += r.pay.sama; o.lichnoe += r.pay.lichnoe;
      o.marathon += r.marathon; o.spend += r.spend; if (r.spend > 0) o.paidRev += r.rev;
    });
    return out;
  }
  function filters(overrides) {
    var f = { range: range(state.period), source: state.source, segment: state.segment };
    if (overrides) Object.keys(overrides).forEach(function (k) { f[k] = overrides[k]; });
    return f;
  }
  function ctxText() {
    var parts = [state.period + ' ' + plural(state.period, 'день', 'дня', 'дней')];
    parts.push(state.source === 'all' ? 'все источники' : SRC_NAME[state.source]);
    parts.push(state.segment === 'all' ? 'все сегменты' : 'сегмент «' + SEG_NAME[state.segment] + '»');
    return parts.join(', ');
  }

  /* ===================================================================
     3. KPI
     =================================================================== */
  var ARROW_UP = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 7H1z" fill="currentColor"/></svg>';
  var ARROW_DN = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 9 1 3h8z" fill="currentColor"/></svg>';
  function romi(a) { return a.spend > 0 ? (a.paidRev - a.spend) / a.spend : NaN; }

  var KPI_DEFS = [
    { key: 'visits', label: 'Посетители', type: 'rel',
      val: function (a) { return a.visits; }, fmt: function (v) { return { v: int(v) }; },
      sub: function (a) { return 'мобильные ' + pct(a.mobile / a.visits, 0); }, day: function (o) { return o.visits; } },
    { key: 'cr', label: 'CR в оплату', type: 'pp',
      val: function (a) { return a.pays / a.visits; }, fmt: function (v) { return { v: pct(v, 2) }; },
      sub: function (a) { return 'в заявку ' + pct(a.checkout / a.visits, 1); }, day: function (o) { return o.visits ? o.pays / o.visits : 0; } },
    { key: 'pays', label: 'Оплаты', type: 'rel',
      val: function (a) { return a.pays; }, fmt: function (v) { return { v: int(v) }; },
      sub: function (a) { return 'заявок ' + int(a.checkout); }, day: function (o) { return o.pays; } },
    { key: 'rev', label: 'Выручка', type: 'rel', accent: true,
      val: function (a) { return a.rev; }, fmt: function (v) { return compactMoney(v); },
      sub: function () { return 'за ' + state.period + ' ' + plural(state.period, 'день', 'дня', 'дней'); }, day: function (o) { return o.rev; } },
    { key: 'avg', label: 'Средний чек', type: 'rel',
      val: function (a) { return a.pays ? a.rev / a.pays : 0; }, fmt: function (v) { return { v: int(v), u: '₽' }; },
      sub: function () { return 'по оплатам периода'; }, day: function (o) { return o.pays ? o.rev / o.pays : null; } },
    { key: 'kshare', label: 'Доля «С куратором»', type: 'pp',
      val: function (a) { return a.pays ? a.kurator / a.pays : 0; }, fmt: function (v) { return { v: pct(v, 0) }; },
      sub: function (a) { return int(a.kurator) + ' ' + plural(a.kurator, 'оплата', 'оплаты', 'оплат'); }, day: function (o) { return o.pays ? o.kurator / o.pays : null; } },
    { key: 'quiz', label: 'Прохождение квиза', type: 'pp',
      val: function (a) { return a.quizStart ? a.quizFinish / a.quizStart : 0; }, fmt: function (v) { return { v: pct(v, 0) }; },
      sub: function (a) { return 'начали ' + int(a.quizStart); }, day: function (o) { return o.quizStart ? o.quizFinish / o.quizStart : null; } },
    { key: 'bot', label: 'Подписки на марафон в боте', type: 'rel',
      val: function (a) { return a.marathon; }, fmt: function (v) { return { v: int(v) }; },
      sub: function (a) { return pct(a.marathon / a.visits, 1) + ' от визитов'; }, day: function (o) { return o.marathon; } },
    { key: 'romi', label: 'ROMI / CAC платного трафика', type: 'pp',
      val: function (a) { return romi(a); }, fmt: function (v) { return isFinite(v) ? { v: pct(v, 0) } : { v: '—' }; },
      sub: function (a) {
        if (!(a.spend > 0)) return 'нет расходов на рекламу';
        var paidPays = a._paidPays || 0;
        return 'CAC ' + (paidPays ? money(a.spend / paidPays) : '—');
      },
      day: function (o) { return o.spend > 0 ? (o.paidRev - o.spend) / o.spend : null; } }
  ];

  function spark(values) {
    var vals = values.filter(function (v) { return v != null && isFinite(v); });
    if (vals.length < 2) return '<svg class="spark" viewBox="0 0 64 28" aria-hidden="true"></svg>';
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = max - min || 1, n = values.length - 1, pts = [];
    values.forEach(function (v, i) {
      if (v == null || !isFinite(v)) return;
      pts.push([(i / n) * 64, 26 - ((v - min) / span) * 22]);
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' 28 L' + pts[0][0].toFixed(1) + ' 28 Z';
    return '<svg class="spark" viewBox="0 0 64 28" preserveAspectRatio="none" aria-hidden="true"><path class="spark__area" d="' + area + '"/><path d="' + line + '"/></svg>';
  }
  function deltaHtml(cur, prev, type, lowerIsBetter) {
    if (!isFinite(cur) || !isFinite(prev) || (type === 'rel' && !prev)) return '<span class="delta is-flat">нет базы</span>';
    var d = type === 'rel' ? (cur - prev) / prev : (cur - prev);
    var txt = type === 'rel' ? (d >= 0 ? '+' : '−') + dec(Math.abs(d * 100), 1) + '%' : (d >= 0 ? '+' : '−') + dec(Math.abs(d * 100), 1) + NBSP + 'п.п.';
    var flat = Math.abs(d) < 0.0005;
    var good = lowerIsBetter ? d < 0 : d > 0;
    var cls = flat ? 'is-flat' : good ? 'is-good' : 'is-bad';
    return '<span class="delta ' + cls + '" title="к предыдущим ' + state.period + ' ' + plural(state.period, 'дню', 'дням', 'дням') + '">' +
      (flat ? '' : d > 0 ? ARROW_UP : ARROW_DN) + txt + '</span>';
  }
  function paidPays(rows) { return rows.reduce(function (s, r) { return s + (r.spend > 0 ? r.pays : 0); }, 0); }

  function renderKpis(flash) {
    var fCur = filters(), fPrev = filters({ range: range(state.period, true) });
    var rowsCur = pick(fCur), rowsPrev = pick(fPrev);
    var cur = sum(rowsCur), prev = sum(rowsPrev);
    cur._paidPays = paidPays(rowsCur); prev._paidPays = paidPays(rowsPrev);
    var days = byDay(rowsCur, fCur.range);
    var html = KPI_DEFS.map(function (k) {
      var v = k.val(cur), pv = k.val(prev), f = k.fmt(v);
      return '<li class="kpi' + (k.accent ? ' kpi--accent' : '') + (flash ? ' is-updated' : '') + '" data-kpi="' + k.key + '">' +
        '<p class="kpi__label">' + esc(k.label) + '</p>' +
        '<p class="kpi__value">' + esc(f.v) + (f.u ? '<small>' + esc(f.u) + '</small>' : '') + '</p>' +
        '<p class="kpi__sub">' + esc(k.sub(cur)) + '</p>' +
        '<div class="kpi__foot">' + deltaHtml(v, pv, k.type, false) + spark(days.map(k.day)) + '</div>' +
        '</li>';
    }).join('');
    $('[data-kpis]').innerHTML = html;
  }

  /* ===================================================================
     4. Графики
     =================================================================== */
  var charts = {};
  var hasEcharts = !!window.echarts;
  var AXIS = { axisLine: { lineStyle: { color: 'rgba(255,213,151,0.18)' } }, axisTick: { show: false }, axisLabel: { color: '#9C8E7E', fontSize: 11 }, splitLine: { lineStyle: { color: 'rgba(255,213,151,0.07)' } } };
  var TOOLTIP = { backgroundColor: '#3A2D23', borderColor: 'rgba(255,213,151,0.25)', borderWidth: 1, padding: [10, 12], textStyle: { color: '#F5EBDD', fontSize: 12, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }, extraCssText: 'border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.45);' };
  var BASE = { backgroundColor: 'transparent', textStyle: { fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }, animationDuration: reduce ? 0 : 700, animationDurationUpdate: reduce ? 0 : 500, animationEasingUpdate: 'cubicOut' };
  function dot(c) { return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + c + ';margin-right:6px"></span>'; }
  function axisMoney(v) { return v >= 1000 ? int(v / 1000) + NBSP + 'тыс' : int(v); }

  function initCharts() {
    if (!hasEcharts) {
      $$('.vis__chart').forEach(function (el) { el.innerHTML = '<p class="vis__sub" style="padding:24px 0">Графики не загрузились: нет доступа к CDN (ECharts). KPI, воронка и таблица работают.</p>'; });
      return;
    }
    ['trend', 'tariffs', 'sources', 'segments', 'heat'].forEach(function (k) {
      charts[k] = echarts.init(doc.getElementById('ch-' + k), null, { renderer: 'canvas' });
    });
    // Кросс-фильтрация, как в Power BI: клик по сектору или столбцу — фильтр отчёта
    charts.sources.on('click', function (p) {
      var key = p.data && p.data.key; if (!key) return;
      setFilter('source', state.source === key ? 'all' : key);
    });
    charts.segments.on('click', function (p) {
      var key = SEG_KEYS[p.dataIndex]; if (!key) return;
      setFilter('segment', state.segment === key ? 'all' : key);
    });
    window.addEventListener('resize', function () { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); });
  }
  var SEG_KEYS = D.segments.map(function (s) { return s.key; });

  function renderTrend() {
    var f = filters(), rows = pick(f), days = byDay(rows, f.range);
    var labels = [];
    for (var d = f.range[0]; d <= f.range[1]; d++) labels.push(dShort(D.dates[d]));
    var barW = state.period <= 7 ? '46%' : state.period <= 14 ? '58%' : '66%';
    function stackBar(key, name, last) {
      return { name: name, type: 'bar', stack: 'pays', xAxisIndex: 1, yAxisIndex: 1, barWidth: barW,
        itemStyle: { color: COLORS[key], borderColor: '#2A2019', borderWidth: 1, borderRadius: last ? [3, 3, 0, 0] : 0 },
        emphasis: { focus: 'series' }, data: days.map(function (o) { return o[key]; }) };
    }
    charts.trend.setOption(Object.assign({}, BASE, {
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: '#CDBFAD', fontSize: 12 }, data: ['Выручка', 'С куратором', 'Сама', 'Личное ведение'] },
      axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: 'rgba(255,213,151,0.4)' } },
      tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis', axisPointer: { type: 'line' },
        formatter: function (ps) {
          var i = ps[0].dataIndex, o = days[i];
          return '<b>' + labels[i] + '.2026</b><br>' + dot('#FF9F4A') + 'Выручка: <b>' + money(o.rev) + '</b><br>' +
            dot(COLORS.kurator) + 'С куратором: ' + o.kurator + '<br>' + dot(COLORS.sama) + 'Сама: ' + o.sama + '<br>' +
            dot(COLORS.lichnoe) + 'Личное ведение: ' + o.lichnoe + '<br><span style="color:#9C8E7E">Оплат всего: ' + o.pays + ', визитов: ' + int(o.visits) + '</span>';
        } }),
      grid: [{ left: 58, right: 12, top: 34, height: '50%' }, { left: 58, right: 12, top: '69%', bottom: 26 }],
      xAxis: [
        Object.assign({}, AXIS, { type: 'category', gridIndex: 0, data: labels, boundaryGap: true, axisLabel: { show: false } }),
        Object.assign({}, AXIS, { type: 'category', gridIndex: 1, data: labels, boundaryGap: true, axisLabel: Object.assign({}, AXIS.axisLabel, { interval: state.period > 14 ? 3 : 0 }) })
      ],
      yAxis: [
        Object.assign({}, AXIS, { type: 'value', gridIndex: 0, name: 'Выручка, ₽', nameTextStyle: { color: '#9C8E7E', fontSize: 11, align: 'left', padding: [0, 0, 0, -50] }, splitNumber: 3, axisLabel: Object.assign({}, AXIS.axisLabel, { formatter: axisMoney }), axisLine: { show: false } }),
        Object.assign({}, AXIS, { type: 'value', gridIndex: 1, name: 'Оплаты', nameTextStyle: { color: '#9C8E7E', fontSize: 11, align: 'left', padding: [0, 0, 0, -50] }, splitNumber: 2, minInterval: 1, axisLine: { show: false } })
      ],
      series: [
        { name: 'Выручка', type: 'line', xAxisIndex: 0, yAxisIndex: 0, smooth: 0.3, symbol: 'circle', symbolSize: 8, showSymbol: false,
          lineStyle: { width: 2, color: '#FF9F4A' }, itemStyle: { color: '#FF9F4A', borderColor: '#2A2019', borderWidth: 2 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,159,74,0.32)' }, { offset: 1, color: 'rgba(255,159,74,0)' }]) },
          data: days.map(function (o) { return o.rev; }) },
        stackBar('kurator', 'С куратором'), stackBar('sama', 'Сама'), stackBar('lichnoe', 'Личное ведение', true)
      ]
    }), { replaceMerge: ['series', 'xAxis', 'yAxis'] });
  }

  function renderTariffs() {
    var a = sum(pick(filters()));
    var keys = ['kurator', 'sama', 'lichnoe'];
    var byRev = state.tariffMeasure === 'revenue';
    $('[data-tariff-sub]').textContent = byRev ? 'выручка, ₽' : 'число оплат';
    var data = keys.map(function (k) {
      var count = a[k], rev = count * HIST_PRICE[k];
      return { value: byRev ? rev : count, count: count, rev: rev, key: k, itemStyle: { color: COLORS[k], borderRadius: [4, 4, 0, 0] } };
    });
    charts.tariffs.setOption(Object.assign({}, BASE, {
      grid: { left: 52, right: 8, top: 30, bottom: 28 },
      tooltip: Object.assign({}, TOOLTIP, { trigger: 'item', formatter: function (p) {
        var d = p.data; return dot(COLORS[d.key]) + '<b>' + TAR_NAME[d.key] + '</b><br>Оплаты: ' + d.count + ' (' + pct(a.pays ? d.count / a.pays : 0, 0) + ')<br>Выручка: ' + money(d.rev);
      } }),
      xAxis: Object.assign({}, AXIS, { type: 'category', data: keys.map(function (k) { return TAR_NAME[k]; }), axisLabel: Object.assign({}, AXIS.axisLabel, { color: '#CDBFAD', fontSize: 12, interval: 0 }) }),
      yAxis: Object.assign({}, AXIS, { type: 'value', splitNumber: 3, axisLine: { show: false }, axisLabel: Object.assign({}, AXIS.axisLabel, { formatter: byRev ? axisMoney : function (v) { return int(v); } }) }),
      series: [{ type: 'bar', barWidth: '46%', data: data,
        label: { show: true, position: 'top', color: '#F5EBDD', fontSize: 13, fontWeight: 600, formatter: function (p) { return byRev ? compactMoney(p.data.rev).v + ' ' + compactMoney(p.data.rev).u : p.data.count; } } }]
    }), { replaceMerge: ['series'] });
  }

  function renderSources() {
    var rows = pick(filters({ source: 'all' }));
    var tot = 0, vals = {};
    D.sources.forEach(function (s) { vals[s.key] = 0; });
    rows.forEach(function (r) { vals[r.s] += r.visits; tot += r.visits; });
    var data = D.sources.map(function (s) {
      var dim = state.source !== 'all' && state.source !== s.key;
      return { name: s.name, key: s.key, value: vals[s.key], itemStyle: { color: COLORS[s.key], opacity: dim ? 0.25 : 1, borderColor: '#2A2019', borderWidth: 2 } };
    });
    var shown = state.source === 'all' ? tot : vals[state.source];
    charts.sources.setOption(Object.assign({}, BASE, {
      tooltip: Object.assign({}, TOOLTIP, { trigger: 'item', formatter: function (p) { return dot(COLORS[p.data.key]) + '<b>' + p.name + '</b><br>Визиты: ' + int(p.value) + ' (' + pct(p.value / tot, 1) + ')<br><span style="color:#9C8E7E">Клик: фильтр по источнику</span>'; } }),
      legend: { orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10, itemGap: 14, selectedMode: false,
        textStyle: { color: '#CDBFAD', fontSize: 12, rich: { p: { color: '#F5EBDD', fontWeight: 600, fontSize: 12, padding: [0, 0, 0, 6] } } },
        formatter: function (name) { var s = D.sources.filter(function (x) { return x.name === name; })[0]; return name + '{p|' + pct(vals[s.key] / tot, 0) + '}'; } },
      graphic: [{ type: 'group', left: '19%', top: 'middle', children: [
        { type: 'text', style: { text: int(shown), x: 0, y: 0, textAlign: 'center', fill: '#F5EBDD', font: '800 30px "Sofia Sans Extra Condensed", "Arial Narrow", sans-serif' }, left: 'center' },
        { type: 'text', style: { text: state.source === 'all' ? 'визитов' : SRC_NAME[state.source], x: 0, y: 34, textAlign: 'center', fill: '#9C8E7E', font: '12px "Helvetica Neue", Arial, sans-serif' } }
      ] }],
      series: [{ type: 'pie', radius: ['56%', '80%'], center: ['30%', '50%'], avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 5 }, cursor: 'pointer', data: data }]
    }), { replaceMerge: ['series', 'graphic'] });
  }

  function renderSegments() {
    var rows = pick(filters({ segment: 'all' }));
    var agg = {}; SEG_KEYS.forEach(function (k) { agg[k] = sum(rows.filter(function (r) { return r.g === k; })); });
    function series(name, color, fn) {
      return { name: name, type: 'bar', barGap: '18%', barWidth: '26%',
        data: SEG_KEYS.map(function (k) {
          var dim = state.segment !== 'all' && state.segment !== k;
          return { value: +(fn(agg[k]) * 100).toFixed(2), itemStyle: { color: color, opacity: dim ? 0.25 : 1, borderRadius: [0, 4, 4, 0] } };
        }),
        label: { show: true, position: 'right', color: '#F5EBDD', fontSize: 12, formatter: function (p) { return dec(p.value, 1) + '%'; } } };
    }
    charts.segments.setOption(Object.assign({}, BASE, {
      legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#CDBFAD', fontSize: 12 }, selectedMode: false },
      tooltip: Object.assign({}, TOOLTIP, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,213,151,0.05)' } }, formatter: function (ps) {
        var k = SEG_KEYS[ps[0].dataIndex], a = agg[k];
        return '<b>' + SEG_NAME[k] + '</b><br>' + ps.map(function (p) { return dot(p.color) + p.seriesName + ': ' + dec(p.value, 2) + '%'; }).join('<br>') +
          '<br><span style="color:#9C8E7E">Визиты: ' + int(a.visits) + ', оплаты: ' + a.pays + '<br>Клик: фильтр по сегменту</span>';
      } }),
      grid: { left: 70, right: 48, top: 34, bottom: 26 },
      xAxis: Object.assign({}, AXIS, { type: 'value', splitNumber: 3, axisLabel: Object.assign({}, AXIS.axisLabel, { formatter: function (v) { return v + '%'; } }) }),
      yAxis: Object.assign({}, AXIS, { type: 'category', inverse: true, data: SEG_KEYS.map(function (k) { return SEG_NAME[k]; }), axisLabel: Object.assign({}, AXIS.axisLabel, { color: '#CDBFAD', fontSize: 13 }) }),
      series: [
        series('Визит → заявка', '#3987E5', function (a) { return a.visits ? a.checkout / a.visits : 0; }),
        series('Визит → оплата', '#D9702A', function (a) { return a.visits ? a.pays / a.visits : 0; })
      ]
    }), { replaceMerge: ['series'] });
  }

  // Профили «час суток» по сегменту и источнику (нормированы)
  var PROF = {};
  SEG_KEYS.forEach(function (g) {
    PROF[g] = {};
    D.sources.forEach(function (s) {
      var arr = D.hours[g].map(function (v, h) { return v * D.srcHour[s.key](h); });
      var t = arr.reduce(function (x, y) { return x + y; }, 0);
      PROF[g][s.key] = arr.map(function (v) { return v / t; });
    });
  });
  var DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  function renderHeat() {
    var f = filters(), rows = pick(f);
    var grid = []; for (var i = 0; i < 7; i++) { grid.push([]); for (var h = 0; h < 24; h++) grid[i].push(0); }
    var dayCount = [0, 0, 0, 0, 0, 0, 0];
    for (var d = f.range[0]; d <= f.range[1]; d++) dayCount[(D.dates[d].getDay() + 6) % 7]++;
    rows.forEach(function (r) {
      var jsDow = D.dates[r.d].getDay(), row = (jsDow + 6) % 7, p = PROF[r.g][r.s];
      for (var h = 0; h < 24; h++) grid[row][h] += r.visits * p[h] * D.hourNoise[jsDow][h];
    });
    var data = [], max = 0;
    for (var y = 0; y < 7; y++) for (var x = 0; x < 24; x++) {
      var v = dayCount[y] ? grid[y][x] / dayCount[y] : 0; // среднее в такой день недели
      max = Math.max(max, v); data.push([x, y, +v.toFixed(1)]);
    }
    var hours = []; for (var hh = 0; hh < 24; hh++) hours.push(pad(hh));
    charts.heat.setOption(Object.assign({}, BASE, {
      tooltip: Object.assign({}, TOOLTIP, { formatter: function (p) {
        var x = p.data[0], y = p.data[1]; return '<b>' + DOW_LABELS[y] + ', ' + pad(x) + ':00–' + pad((x + 1) % 24) + ':00</b><br>В среднем визитов: ' + dec(p.data[2], 1);
      } }),
      grid: { left: 36, right: 76, top: 6, bottom: 26 },
      xAxis: Object.assign({}, AXIS, { type: 'category', data: hours, splitArea: { show: false }, axisLine: { show: false } }),
      yAxis: Object.assign({}, AXIS, { type: 'category', data: DOW_LABELS, inverse: true, axisLine: { show: false }, axisLabel: Object.assign({}, AXIS.axisLabel, { color: '#CDBFAD' }) }),
      visualMap: { min: 0, max: Math.ceil(max), calculable: false, orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 150,
        text: ['больше', 'меньше'], textStyle: { color: '#9C8E7E', fontSize: 11 },
        inRange: { color: ['#30261E', '#5A3A20', '#9A5224', '#D9702A', '#FFB46E', '#FFE3BC'] } },
      series: [{ type: 'heatmap', data: data, itemStyle: { borderColor: '#2A2019', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: '#FFD597', borderWidth: 1 } } }]
    }), { replaceMerge: ['series'] });
  }

  /* ===================================================================
     5. Воронка и таблица
     =================================================================== */
  function renderFunnel() {
    var a = sum(pick(filters()));
    var stages = [
      ['Визит', a.visits], ['Прокрутка до тарифов', a.scroll], ['Квиз начат', a.quizStart],
      ['Квиз пройден', a.quizFinish], ['Открыл оплату', a.checkout], ['Оплатил', a.pays]
    ];
    var html = stages.map(function (s, i) {
      var share = a.visits ? s[1] / a.visits : 0;
      var step = i ? (stages[i - 1][1] ? s[1] / stages[i - 1][1] : 0) : null;
      return '<li class="funnel__row">' +
        (i ? '<p class="funnel__step" style="grid-column:1/-1">↓ <b>' + pct(step, 0) + '</b> от шага «' + stages[i - 1][0] + '»</p>' : '') +
        '<p class="funnel__name">' + s[0] + '</p><p class="funnel__val">' + int(s[1]) + '<span>' + pct(share, i > 3 ? 1 : 0) + '</span></p>' +
        '<div class="funnel__bar"><div class="funnel__fill" style="--w:0"></div></div></li>';
    }).join('');
    var box = $('[data-funnel]');
    var old = $$('.funnel__fill', box).map(function (el) { return el.style.getPropertyValue('--w'); });
    box.innerHTML = html;
    var fills = $$('.funnel__fill', box);
    fills.forEach(function (el, i) { if (old[i]) el.style.setProperty('--w', old[i]); });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fills.forEach(function (el, i) { el.style.setProperty('--w', Math.max(0.012, a.visits ? stages[i][1] / a.visits : 0).toFixed(4)); });
      });
    });
  }

  var tableRows = [];
  function buildCampaignRows() {
    var rows = pick(filters());
    var map = {};
    rows.forEach(function (r) {
      var m = map[r.c] || (map[r.c] = { id: r.c, impr: 0, clicks: 0, visits: 0, pays: 0, revenue: 0, spend: 0 });
      m.impr += r.impr; m.clicks += r.clicks; m.visits += r.visits; m.pays += r.pays; m.revenue += r.rev; m.spend += r.spend;
    });
    return Object.keys(map).map(function (k) {
      var m = map[k], c = CAMP[k];
      m.label = c.id; m.desc = c.label; m.source = c.source; m.sourceName = SRC_NAME[c.source]; m.medium = c.medium;
      m.romi = m.spend > 0 ? (m.revenue - m.spend) / m.spend : -Infinity;
      return m;
    });
  }
  function renderTable() {
    tableRows = buildCampaignRows();
    var k = state.sortKey, dir = state.sortDir;
    tableRows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string') return x.localeCompare(y, 'ru') * dir;
      return (x - y) * dir;
    });
    var maxRev = Math.max.apply(null, tableRows.map(function (r) { return r.revenue; }).concat([1]));
    var dash = '<span class="tbl__dash">—</span>';
    $('[data-campaigns] tbody').innerHTML = tableRows.map(function (r) {
      var romiCls = r.spend > 0 ? (r.romi >= 1 ? 'is-good' : r.romi < 0 ? 'is-bad' : '') : '';
      return '<tr>' +
        '<td><div class="tbl__camp"><code>' + esc(r.label) + '</code><span>' + esc(r.desc) + '</span></div></td>' +
        '<td><span class="tbl__src" style="--c:' + COLORS[r.source] + '"><i></i>' + esc(r.sourceName) + '</span></td>' +
        '<td class="num">' + (r.impr ? int(r.impr) : dash) + '</td>' +
        '<td class="num">' + (r.clicks ? int(r.clicks) : dash) + '</td>' +
        '<td class="num">' + int(r.visits) + '</td>' +
        '<td class="num">' + int(r.pays) + '</td>' +
        '<td class="num"><span class="tbl__bar" style="--w:' + (r.revenue / maxRev).toFixed(3) + '"><span>' + money(r.revenue) + '</span></span></td>' +
        '<td class="num">' + (r.spend ? money(r.spend) : dash) + '</td>' +
        '<td class="num"><span class="tbl__romi ' + romiCls + '">' + (r.spend > 0 ? pct(r.romi, 0) : dash) + '</span></td>' +
        '</tr>';
    }).join('');
    var t = tableRows.reduce(function (a, r) { a.impr += r.impr; a.clicks += r.clicks; a.visits += r.visits; a.pays += r.pays; a.revenue += r.revenue; a.spend += r.spend; if (r.spend > 0) a.paidRev += r.revenue; return a; },
      { impr: 0, clicks: 0, visits: 0, pays: 0, revenue: 0, spend: 0, paidRev: 0 });
    $('[data-campaigns] tfoot').innerHTML = '<tr><td>Итого</td><td>' + tableRows.length + ' ' + plural(tableRows.length, 'кампания', 'кампании', 'кампаний') + '</td>' +
      '<td class="num">' + int(t.impr) + '</td><td class="num">' + int(t.clicks) + '</td><td class="num">' + int(t.visits) + '</td><td class="num">' + int(t.pays) + '</td>' +
      '<td class="num">' + money(t.revenue) + '</td><td class="num">' + (t.spend ? money(t.spend) : '—') + '</td>' +
      '<td class="num" title="ROMI платных кампаний">' + (t.spend ? pct((t.paidRev - t.spend) / t.spend, 0) : '—') + '</td></tr>';
    $$('[data-campaigns] thead th').forEach(function (th) {
      th.setAttribute('aria-sort', th.getAttribute('data-sort') === k ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }
  function initTable() {
    $$('[data-campaigns] thead th').forEach(function (th) {
      $('button', th).addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sortKey === key) state.sortDir *= -1;
        else { state.sortKey = key; state.sortDir = (key === 'label' || key === 'sourceName') ? 1 : -1; }
        renderTable();
      });
    });
    $('[data-export]').addEventListener('click', exportCsv);
  }
  function exportCsv() {
    var head = ['utm_campaign', 'Описание', 'Источник', 'utm_medium', 'Показы', 'Клики', 'Визиты', 'Оплаты', 'Выручка, руб', 'Расход, руб', 'ROMI, %'];
    var lines = [head].concat(tableRows.map(function (r) {
      return [r.label, r.desc, r.sourceName, r.medium, r.impr, r.clicks, r.visits, r.pays, Math.round(r.revenue), Math.round(r.spend), r.spend > 0 ? Math.round(r.romi * 100) : ''];
    }));
    var csv = '﻿' + lines.map(function (row) {
      return row.map(function (v) { var s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url; a.download = 'forma-kampanii-' + state.period + 'd' + (state.source !== 'all' ? '-' + state.source : '') + (state.segment !== 'all' ? '-' + state.segment : '') + '.csv';
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    window.__formaLastCsv = csv; // для проверки
    toast('CSV выгружен', tableRows.length + ' ' + plural(tableRows.length, 'строка', 'строки', 'строк') + ', разделитель «;», открывается в Excel', 'info');
  }

  /* ---------- Пересчёт всего отчёта ---------- */
  function renderAll(flash) {
    var rg = range(state.period);
    $('[data-range]').textContent = dLong(D.dates[rg[0]]) + ' — ' + dLong(D.dates[rg[1]]) + ' 2026';
    $$('[data-ctx]').forEach(function (el) { el.textContent = ctxText(); });
    $('[data-reset-filters]').hidden = state.source === 'all' && state.segment === 'all' && state.period === 30;
    renderKpis(flash);
    renderFunnel();
    renderTable();
    if (hasEcharts) { renderTrend(); renderTariffs(); renderSources(); renderSegments(); renderHeat(); }
  }
  function syncSlicers() {
    $$('[data-slicer]').forEach(function (g) {
      var key = g.getAttribute('data-slicer');
      $$('button', g).forEach(function (b) {
        var on = String(state[key]) === b.getAttribute('data-value');
        b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  }
  function setFilter(key, val) {
    state[key] = key === 'period' ? +val : val;
    syncSlicers();
    renderAll(true);
  }
  function initSlicers() {
    $$('[data-slicer]').forEach(function (g) {
      var key = g.getAttribute('data-slicer');
      $$('button', g).forEach(function (b) {
        b.addEventListener('click', function () { setFilter(key, b.getAttribute('data-value')); });
      });
      // стрелки внутри группы, как у radiogroup
      g.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var bs = $$('button', g), i = bs.indexOf(doc.activeElement); if (i < 0) return;
        var n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
        n.focus(); n.click(); e.preventDefault();
      });
    });
    $('[data-reset-filters]').addEventListener('click', function () {
      state.period = 30; state.source = 'all'; state.segment = 'all'; syncSlicers(); renderAll(true);
    });
    $$('[data-tariff-measure] button').forEach(function (b) {
      b.addEventListener('click', function () {
        state.tariffMeasure = b.getAttribute('data-value');
        $$('[data-tariff-measure] button').forEach(function (x) { var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        if (hasEcharts) renderTariffs();
      });
    });
  }

  /* ===================================================================
     6. «Живость»
     =================================================================== */
  var liveR = D.rng(Date.now() % 100000);
  function currentPrice(key) {
    var o = store.get(OVERRIDES_KEY), t = o && o.tariffs && o.tariffs[key];
    var base = D.priceDefaults[key];
    var early = t && t.early ? t.early : base.early, regular = t && t.regular ? t.regular : base.regular;
    return Date.now() < Date.parse('2026-10-28T00:00:00+03:00') ? early : regular;
  }
  function weighted(list) {
    var tot = list.reduce(function (s, x) { return s + x[1]; }, 0), x = liveR() * tot;
    for (var i = 0; i < list.length; i++) { x -= list[i][1]; if (x <= 0) return list[i][0]; }
    return list[0][0];
  }
  function makeEvent() {
    var src = weighted([['ig', 58], ['tg', 18], ['vk', 14], ['org', 10]]);
    var seg = weighted([['office', 38], ['mom', 35], ['newbie', 27]]);
    var type = weighted([['pay', 30], ['quiz', 30], ['bot', 25], ['checkout', 15]]);
    var ev = { type: type, src: src, seg: seg, t: new Date() };
    if (type === 'pay' || type === 'checkout') ev.tariff = weighted([['kurator', 66], ['sama', 30], ['lichnoe', 4]]);
    if (type === 'pay') ev.price = currentPrice(ev.tariff);
    if (type === 'quiz') ev.result = weighted([['kurator', 62], ['sama', 26], ['lichnoe', 6], ['doctor', 6]]);
    return ev;
  }
  var ICONS = {
    pay: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 7h18v10H3zM3 11h18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    checkout: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 5h2l2 10h10l2-7H7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="19" r="1.4" fill="currentColor"/><circle cx="17" cy="19" r="1.4" fill="currentColor"/></svg>',
    quiz: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="m5 12 4 4 10-10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bot: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="m21 4-18 7 6 2 2 6 3-4 4 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };
  var RESULT = { kurator: '«С куратором»', sama: '«Сама»', lichnoe: '«Личное ведение»', doctor: 'сначала к врачу' };
  function eventText(ev) {
    var meta = SRC_NAME[ev.src] + ', сегмент «' + SEG_NAME[ev.seg] + '»';
    if (ev.type === 'pay') return { title: 'Оплата: «' + TAR_NAME[ev.tariff] + '», ' + money(ev.price), meta: meta, icon: 'pay' };
    if (ev.type === 'checkout') return { title: 'Открыла оплату: «' + TAR_NAME[ev.tariff] + '»', meta: meta, icon: 'pay' };
    if (ev.type === 'quiz') return { title: 'Квиз пройден: ' + RESULT[ev.result], meta: meta, icon: 'quiz' };
    return { title: 'Подписка на марафон в боте', meta: meta, icon: 'bot' };
  }
  function addFeed(ev, isNew) {
    var list = $('[data-feed]'), t = eventText(ev);
    var li = doc.createElement('li');
    li.className = 'feed__item' + (isNew ? ' is-new' : '');
    li.innerHTML = '<span class="feed__icon feed__icon--' + t.icon + '" aria-hidden="true">' + ICONS[ev.type] + '</span>' +
      '<p class="feed__text">' + esc(t.title) + '<span>' + esc(t.meta) + '</span></p><span class="feed__time">' + hhmm(ev.t) + '</span>';
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 7) list.removeChild(list.lastChild);
    if (isNew) setTimeout(function () { li.classList.remove('is-new'); }, 2400);
  }

  // Колокольчик
  var bell = { items: [], unread: 0 };
  function bellAdd(title, meta, unread, ring) {
    bell.items.unshift({ title: title, meta: meta, unread: unread });
    bell.items = bell.items.slice(0, 12);
    if (unread) bell.unread++;
    renderBell(ring);
  }
  function renderBell(ring) {
    $('[data-bell-list]').innerHTML = bell.items.map(function (n) {
      return '<li class="bell__item' + (n.unread ? ' is-unread' : '') + '"><p>' + esc(n.title) + '<span>' + esc(n.meta) + '</span></p></li>';
    }).join('');
    var c = $('[data-bell-count]');
    c.textContent = bell.unread; c.hidden = !bell.unread;
    if (ring) {
      var btn = $('[data-bell]');
      c.classList.remove('is-bump'); btn.classList.remove('is-ring');
      void c.offsetWidth;
      c.classList.add('is-bump'); btn.classList.add('is-ring');
    }
  }
  function initBell() {
    var btn = $('[data-bell]'), panel = $('#bell-panel');
    bellAdd('Осталось 7 мест в «Личном ведении»', 'Тарифы, 40 мин назад', true);
    bellAdd('Квиз пройден: результат «С куратором»', 'Telegram Ads, 26 мин назад', true);
    bellAdd('Новая оплата: «С куратором», ' + money(currentPrice('kurator')), 'Instagram/Reels, 12 мин назад', true);
    function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden; panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('[data-bell-read]').addEventListener('click', function () { bell.items.forEach(function (n) { n.unread = false; }); bell.unread = 0; renderBell(); });
    doc.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); } });
  }

  function initLive() {
    // стартовая лента: несколько событий за последние минуты
    var now = Date.now(), offs = [], acc = 0;
    for (var j = 0; j < 6; j++) { acc += 2 + Math.floor(liveR() * 5); offs.push(acc); }
    for (var i = 5; i >= 0; i--) { var ev = makeEvent(); ev.t = new Date(now - offs[i] * 60000); addFeed(ev, false); }
    function tick() {
      var ev = makeEvent();
      addFeed(ev, true);
      if (ev.type === 'pay') bellAdd('Новая оплата: «' + TAR_NAME[ev.tariff] + '», ' + money(ev.price), SRC_NAME[ev.src] + ', только что', true, true);
      setTimeout(tick, 6000 + liveR() * 7000);
    }
    setTimeout(tick, 3500);
    var online = 37;
    setInterval(function () {
      online = Math.max(18, Math.min(64, online + Math.round((liveR() - 0.48) * 6)));
      $('[data-online]').textContent = online;
    }, 3500);
    $('[data-refresh]').addEventListener('click', function () {
      var b = this; b.classList.remove('is-spinning'); void b.offsetWidth; b.classList.add('is-spinning');
      var d = new Date();
      $('[data-updated]').textContent = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + hhmm(d);
      renderAll(true);
      toast('Данные обновлены', 'Демо: в проде — выгрузка из Метрики и CRM', 'info');
    });
  }

  /* ===================================================================
     7. Навигация и «Фокус»
     =================================================================== */
  var CRUMBS = { analytics: 'Аналитика', prices: 'Редактор цен', content: 'Редактор контента', settings: 'Настройки' };
  function route() {
    var v = (location.hash || '#analytics').slice(1);
    if (!CRUMBS[v]) v = 'analytics';
    $$('[data-view]').forEach(function (s) { var on = s.getAttribute('data-view') === v; s.hidden = !on; s.classList.toggle('is-active', on); });
    $$('[data-view-link]').forEach(function (a) {
      var on = a.getAttribute('data-view-link') === v;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('[data-crumb]').textContent = CRUMBS[v];
    if (v === 'analytics' && hasEcharts) requestAnimationFrame(function () { Object.keys(charts).forEach(function (k) { charts[k].resize(); }); });
    window.scrollTo(0, 0);
  }
  function initFocus() {
    var backdrop = null, current = null;
    function close() {
      if (!current) return;
      current.classList.remove('is-focus'); backdrop.remove(); backdrop = null;
      var btn = $('[data-focus]', current); btn.setAttribute('aria-label', 'Развернуть визуал'); btn.focus();
      current = null; resizeAll();
    }
    function resizeAll() { if (hasEcharts) Object.keys(charts).forEach(function (k) { charts[k].resize(); }); }
    $$('[data-focus]').forEach(function (b) {
      b.addEventListener('click', function () {
        var vis = b.closest('[data-vis]');
        if (current === vis) { close(); return; }
        current = vis; vis.classList.add('is-focus');
        backdrop = doc.createElement('div'); backdrop.className = 'focus-backdrop'; backdrop.addEventListener('click', close);
        doc.body.appendChild(backdrop);
        b.setAttribute('aria-label', 'Свернуть визуал');
        resizeAll();
      });
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  /* ===================================================================
     8. Редактор цен
     =================================================================== */
  var TKEYS = ['sama', 'kurator', 'lichnoe'];
  var PROGRAM_DAYS = 56;
  var prices = { published: null, draft: null, preview: 'kurator', phase: 'early' };

  function readPublishedPrices() {
    var o = store.get(OVERRIDES_KEY), out = clone(D.priceDefaults);
    if (o && o.tariffs) TKEYS.forEach(function (k) { if (o.tariffs[k]) Object.keys(o.tariffs[k]).forEach(function (f) { out[k][f] = o.tariffs[k][f]; }); });
    return out;
  }
  function priceEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function priceField(k, f, label, hint) {
    return '<div class="field" data-pf="' + k + ':' + f + '"><label class="field__label" for="p-' + k + '-' + f + '">' + label + '</label>' +
      '<div class="field__money"><input class="field__input field__input--money" id="p-' + k + '-' + f + '" inputmode="numeric" autocomplete="off" data-k="' + k + '" data-f="' + f + '"></div>' +
      '<p class="field__hint">' + hint + '</p></div>';
  }
  function renderPriceEditors() {
    $('[data-price-editors]').innerHTML = TKEYS.map(function (k) {
      var card = D.tariffCards[k];
      var seats = k === 'lichnoe'
        ? '<div class="field"><label class="field__label" for="p-lichnoe-seats">Осталось мест из ' + D.priceDefaults.lichnoe.seatsTotal + '</label>' +
          '<div class="seats"><input class="field__input" id="p-lichnoe-seats" type="number" min="0" max="20" step="1" data-k="lichnoe" data-f="seatsLeft"><div class="seats__meter" data-seats-meter aria-hidden="true"></div></div>' +
          '<p class="field__hint">На сайте: «Осталось N из 20» и шкала мест. 0 — «Места закончились», оплата отключится</p></div>'
        : '';
      return '<article class="pcard" data-pcard="' + k + '" tabindex="-1">' +
        '<div class="pcard__head"><h3 class="pcard__name">' + card.name + (card.main ? '<span class="pcard__tag">ОСНОВНОЙ</span>' : '') + '</h3><span class="pcard__changed" data-changed hidden>изменено, не опубликовано</span></div>' +
        '<div class="pcard__grid">' +
          priceField(k, 'early', 'Ранняя цена', 'до 27.10, 23:59 мск') +
          priceField(k, 'regular', 'Цена после 28.10', 'с 28.10 и до старта') +
          '<div class="field"><label class="field__label" for="p-' + k + '-parts">Долями</label><select class="field__input" id="p-' + k + '-parts" data-k="' + k + '" data-f="parts">' +
            [2, 3, 4, 6].map(function (n) { return '<option value="' + n + '">' + n + ' ' + plural(n, 'платёж', 'платежа', 'платежей') + '</option>'; }).join('') +
          '</select><p class="field__hint">сервис оплаты долями</p></div>' +
        '</div>' +
        '<div class="pcard__row2">' +
          '<label class="switch"><input type="checkbox" data-k="' + k + '" data-f="showBonus"><span class="switch__track" aria-hidden="true"></span>Показывать бонусы ранней записи</label>' +
          seats +
          '<p class="pcard__calc" data-calc></p>' +
        '</div></article>';
    }).join('');

    $$('[data-price-editors] [data-k]').forEach(function (inp) {
      var k = inp.getAttribute('data-k'), f = inp.getAttribute('data-f');
      var v = prices.draft[k][f];
      if (inp.type === 'checkbox') inp.checked = !!v;
      else if (inp.classList.contains('field__input--money')) inp.value = int(v);
      else inp.value = v;
      var evName = inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(evName, function () {
        var val;
        if (inp.type === 'checkbox') val = inp.checked;
        else if (f === 'parts') val = +inp.value;
        else {
          var digits = inp.value.replace(/\D/g, '').slice(0, 7);
          val = digits ? +digits : 0;
          if (inp.classList.contains('field__input--money')) {
            var pos = inp.value.length - inp.selectionStart;
            inp.value = digits ? int(val) : '';
            var p = Math.max(0, inp.value.length - pos); try { inp.setSelectionRange(p, p); } catch (e) { /* number */ }
          }
          if (f === 'seatsLeft') val = Math.max(0, Math.min(20, val));
        }
        prices.draft[k][f] = val;
        setPreview(k);
        updatePrices(f === 'early' || f === 'regular' ? k : null);
      });
      inp.addEventListener('focus', function () { setPreview(k); });
    });
    $$('[data-pcard]').forEach(function (c) { c.addEventListener('click', function () { setPreview(c.getAttribute('data-pcard')); }); });
  }

  function validatePrices() {
    var ok = true;
    TKEYS.forEach(function (k) {
      ['early', 'regular'].forEach(function (f) {
        var box = $('[data-pf="' + k + ':' + f + '"]'), v = prices.draft[k][f], hint = $('.field__hint', box);
        var bad = !(v >= 490 && v <= 999999);
        var warn = !bad && f === 'regular' && v < prices.draft[k].early;
        box.classList.toggle('is-error', bad); box.classList.toggle('is-warn', warn);
        hint.textContent = bad ? 'Цена от 490 до 999 999 ₽' : warn ? 'Ниже ранней цены, проверь' : (f === 'early' ? 'до 27.10, 23:59 мск' : 'с 28.10 и до старта');
        if (bad) ok = false;
      });
    });
    return ok;
  }

  function updatePrices(flashKey) {
    var ok = validatePrices();
    TKEYS.forEach(function (k) {
      var d = prices.draft[k], p = prices.published[k], card = $('[data-pcard="' + k + '"]');
      var changed = !priceEqual(d, p);
      $('[data-changed]', card).hidden = !changed;
      ['early', 'regular'].forEach(function (f) { $('[data-pf="' + k + ':' + f + '"]').classList.toggle('is-changed', d[f] !== p[f]); });
      var cur = d.early > 0 ? d.early : 0;
      var discount = d.regular > 0 && d.early > 0 ? 1 - d.early / d.regular : 0;
      $('[data-calc]', card).innerHTML = '<span>в день <b>≈' + NBSP + int(cur / PROGRAM_DAYS) + NBSP + '₽</b></span><span>долями <b>' + d.parts + NBSP + '×' + NBSP + money(cur / d.parts) + '</b></span>' +
        (discount > 0 ? '<span>выгода ранней цены <b>' + pct(discount, 0) + '</b></span>' : '');
      if (k === 'lichnoe') {
        var m = $('[data-seats-meter]', card), total = D.priceDefaults.lichnoe.seatsTotal, left = d.seatsLeft, html = '';
        for (var i = 0; i < total; i++) html += '<i' + (i >= total - left ? ' class="is-free"' : '') + '></i>';
        m.innerHTML = html;
      }
    });
    var dirty = !priceEqual(prices.draft, prices.published);
    var st = $('[data-price-status]');
    st.classList.toggle('is-draft', dirty);
    var o = store.get(OVERRIDES_KEY);
    $('[data-price-status-text]').textContent = dirty ? 'Черновик: есть неопубликованные изменения' :
      (o && o.tariffs && o.pricesAt ? 'Опубликовано ' + o.pricesAt : 'Опубликовано: исходные цены');
    $('[data-publish-prices]').disabled = !dirty || !ok;
    renderDiff();
    renderPreview(flashKey);
  }

  function renderDiff() {
    var items = [];
    var LABEL = { early: 'ранняя цена', regular: 'цена после 28.10', parts: 'долями', showBonus: 'бонусы', seatsLeft: 'осталось мест' };
    TKEYS.forEach(function (k) {
      var d = prices.draft[k], p = prices.published[k];
      Object.keys(LABEL).forEach(function (f) {
        if (!(f in d) || d[f] === p[f]) return;
        var fmt = function (v) { return f === 'early' || f === 'regular' ? money(v) : f === 'parts' ? v + ' ' + plural(v, 'платёж', 'платежа', 'платежей') : f === 'showBonus' ? (v ? 'показывать' : 'скрыть') : String(v); };
        items.push('<li><span class="diff__what">' + TAR_NAME[k] + ': ' + LABEL[f] + '</span><span class="diff__val"><s>' + fmt(p[f]) + '</s><b>' + fmt(d[f]) + '</b></span></li>');
      });
    });
    $('[data-diff]').innerHTML = items.length ? items.join('') : '<li class="diff__empty">Изменений нет. Поправь цену слева, превью обновится сразу.</li>';
  }

  function setPreview(k) {
    if (prices.preview === k) return;
    prices.preview = k;
    $$('[data-preview-tabs] button').forEach(function (b) { var on = b.getAttribute('data-value') === k; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('[data-pcard]').forEach(function (c) { c.classList.toggle('is-current', c.getAttribute('data-pcard') === k); });
    renderPreview();
  }

  function renderPreview(flashKey) {
    var k = prices.preview, card = D.tariffCards[k], d = prices.draft[k], p = prices.published[k];
    var early = prices.phase === 'early';
    var price = early ? d.early : d.regular, pubPrice = early ? p.early : p.regular;
    var ch = function (cond) { return cond ? ' is-changed-val' : ''; };
    var priceChanged = price !== pubPrice, partsChanged = priceChanged || d.parts !== p.parts;
    var html = '<article class="tariff' + (card.main ? ' tariff--main' : '') + (flashKey === k ? ' is-flash' : '') + '">';
    if (card.badge) html += '<p class="tariff__badge">' + card.badge + '</p>';
    html += '<h3 class="tariff__name">' + card.name + '</h3><p class="tariff__for">' + card.forText + '</p>';
    html += '<p class="tariff__price"><span class="' + ch(priceChanged) + '">' + money(price) + '</span></p>';
    if (k === 'kurator') html += '<p class="tariff__per-day' + ch(priceChanged) + '">≈' + NBSP + int(price / PROGRAM_DAYS) + NBSP + '₽ в' + NBSP + 'день</p>';
    if (early) html += '<p class="tariff__price-next">с 28 октября — <span class="' + ch(d.regular !== p.regular) + '">' + money(d.regular) + '</span></p>';
    html += '<div class="tariff__group"><p class="tariff__group-title">Входит</p><ul class="tariff__list tariff__list--in">' + card.inList.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
    if (card.outList.length) html += '<div class="tariff__group"><p class="tariff__group-title">Не входит</p><ul class="tariff__list tariff__list--out">' + card.outList.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>';
    if (early && d.showBonus) {
      html += '<div class="tariff__bonus' + ch(d.showBonus !== p.showBonus) + '"><p class="tariff__group-title">' + card.bonusTitle + '</p>' +
        (card.bonus.length > 1 ? '<ul class="tariff__list tariff__list--bonus">' + card.bonus.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '<p class="tariff__bonus-text">' + card.bonus[0] + '</p>') + '</div>';
    }
    if (card.anchor) html += '<p class="tariff__anchor">' + card.anchor + '</p>';
    if (card.seats) {
      var total = d.seatsTotal, left = d.seatsLeft, meter = '';
      for (var i = 0; i < total; i++) meter += '<i' + (i >= total - left ? ' class="is-free"' : '') + '></i>';
      html += '<p class="tariff__seats">' + card.seats + '</p><p class="tariff__seats-left' + ch(left !== p.seatsLeft) + '">' + (left > 0 ? 'Осталось ' + left + ' из ' + total : 'Места на этот поток закончились') + '</p>' +
        (left > 0 ? '<div class="tariff__meter">' + meter + '</div>' : '');
    }
    html += '<div class="tariff__actions"><span class="tariff__pay"><span class="' + ch(priceChanged) + '">Оплатить ' + money(price) + '</span></span>' +
      '<span class="tariff__parts' + ch(partsChanged) + '">Долями — ' + d.parts + NBSP + '×' + NBSP + money(price / d.parts) + '</span></div>';
    if (card.hint) html += '<p class="tariff__hint">' + card.hint + '</p>';
    html += '</article>';
    $('[data-preview]').innerHTML = html;
  }

  function nowStamp() { var d = new Date(); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ', ' + hhmm(d); }

  function initPrices() {
    prices.published = readPublishedPrices();
    prices.draft = clone(prices.published);
    renderPriceEditors();
    $$('[data-pcard]').forEach(function (c) { c.classList.toggle('is-current', c.getAttribute('data-pcard') === prices.preview); });
    updatePrices();
    $$('[data-preview-tabs] button').forEach(function (b) { b.addEventListener('click', function () { setPreview(b.getAttribute('data-value')); }); });
    $$('[data-preview-phase] button').forEach(function (b) {
      b.addEventListener('click', function () {
        prices.phase = b.getAttribute('data-value');
        $$('[data-preview-phase] button').forEach(function (x) { var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        renderPreview();
      });
    });
    $('[data-publish-prices]').addEventListener('click', function () {
      var btn = this;
      if (!validatePrices()) return;
      btn.classList.add('is-loading'); btn.disabled = true;
      setTimeout(function () {
        var o = store.get(OVERRIDES_KEY) || { version: 1 };
        o.version = 1; o.tariffs = clone(prices.draft); o.updatedAt = new Date().toISOString(); o.pricesAt = nowStamp();
        TKEYS.forEach(function (k) { delete o.tariffs[k].seatsTotal; });
        store.set(OVERRIDES_KEY, o);
        prices.published = clone(prices.draft);
        btn.classList.remove('is-loading');
        updatePrices();
        toast('Цены сохранены (демо)', 'Изменения видны только в админке. На сайт в демо-режиме ничего не отправляется.', 'ok');
        bellAdd('Цены опубликованы', 'Менеджер школы, только что', false);
      }, reduce ? 0 : 700);
    });
    $('[data-reset-prices]').addEventListener('click', function () {
      var o = store.get(OVERRIDES_KEY);
      if (o) { delete o.tariffs; delete o.pricesAt; if (o.content) store.set(OVERRIDES_KEY, o); else store.remove(OVERRIDES_KEY); }
      prices.published = clone(D.priceDefaults); prices.draft = clone(D.priceDefaults);
      renderPriceEditors();
      $$('[data-pcard]').forEach(function (c) { c.classList.toggle('is-current', c.getAttribute('data-pcard') === prices.preview); });
      updatePrices();
      toast('Цены сброшены к исходным', '4 900, 9 900 и 24 900 ₽ до 28.10. На сайте — после обновления страницы', 'info');
    });
  }

  /* ===================================================================
     9. Редактор контента
     =================================================================== */
  var content = { published: {}, draft: {}, history: [], current: 'hero' };
  var BLOCKS = D.contentBlocks;
  var BLOCK = {}; BLOCKS.forEach(function (b) { BLOCK[b.key] = b; });

  function defaultsOf(b) {
    var o = { fields: {} };
    b.fields.forEach(function (f) { o.fields[f.key] = f.value; });
    if (b.faq) o.items = clone(b.items);
    return o;
  }
  function loadContent() {
    var saved = store.get(CONTENT_KEY) || {};
    BLOCKS.forEach(function (b) {
      var def = defaultsOf(b), pub = saved.published && saved.published[b.key];
      content.published[b.key] = pub ? { fields: Object.assign({}, def.fields, pub.fields), items: pub.items || def.items } : def;
      if (!b.faq) delete content.published[b.key].items;
    });
    content.draft = clone(content.published);
    content.history = (saved.history || []).concat(D.history);
  }
  function saveContent() {
    var saved = { published: content.published, history: content.history.filter(function (h) { return h.local; }).slice(0, 30) };
    store.set(CONTENT_KEY, saved);
  }
  function isDirty(key) { return JSON.stringify(content.draft[key]) !== JSON.stringify(content.published[key]); }

  function renderBlockList() {
    $('[data-blocks]').innerHTML = BLOCKS.map(function (b, i) {
      var dirty = isDirty(b.key);
      return '<li><button type="button" class="blocks__item' + (b.key === content.current ? ' is-active' : '') + '" data-block="' + b.key + '"' + (b.key === content.current ? ' aria-current="true"' : '') + '>' +
        '<span class="blocks__num">' + pad(i + 1) + '</span><span class="blocks__name">' + b.name + '</span>' +
        '<span class="blocks__state' + (dirty ? ' is-draft' : '') + '">' + (dirty ? 'Черновик' : 'Опубликовано') + '</span></button></li>';
    }).join('');
    $$('[data-block]').forEach(function (btn) { btn.addEventListener('click', function () { selectBlock(btn.getAttribute('data-block')); }); });
  }

  function fieldHtml(b, f) {
    var id = 'c-' + b.key + '-' + f.key, val = content.draft[b.key].fields[f.key];
    var input = f.multiline
      ? '<textarea class="field__input" id="' + id + '" rows="3" data-cf="' + f.key + '">' + esc(val) + '</textarea>'
      : '<input class="field__input" id="' + id + '" value="' + esc(val) + '" data-cf="' + f.key + '" autocomplete="off">';
    return '<div class="field"><div class="field__top"><label class="field__label" for="' + id + '">' + f.label + '' + '</label>' +
      '<span class="field__count" data-count="' + f.key + '">' + val.length + '</span></div>' + input + '</div>';
  }
  function faqHtml(b) {
    var items = content.draft[b.key].items;
    return '<div class="field"><p class="field__label">Вопросы и ответы (' + items.length + ')</p><ol class="faq-ed" data-faq>' +
      items.map(function (it, i) {
        return '<li class="faq-ed__item" data-i="' + i + '">' +
          '<button class="faq-ed__handle" type="button" aria-label="Перетащить вопрос ' + (i + 1) + '" title="Перетащи, чтобы поменять порядок" data-handle>' +
            '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/></g></svg></button>' +
          '<div class="faq-ed__fields"><input class="field__input faq-ed__q" value="' + esc(it.q) + '" aria-label="Вопрос ' + (i + 1) + '" data-fq="q" placeholder="Вопрос">' +
            '<textarea class="field__input faq-ed__a" rows="2" aria-label="Ответ ' + (i + 1) + '" data-fq="a" placeholder="Ответ">' + esc(it.a) + '</textarea></div>' +
          '<div class="faq-ed__tools">' +
            '<button class="ibtn" type="button" data-move="-1" aria-label="Поднять вопрос ' + (i + 1) + '"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 10 4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
            '<button class="ibtn" type="button" data-move="1" aria-label="Опустить вопрос ' + (i + 1) + '"' + (i === items.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>' +
            '<button class="ibtn ibtn--del" type="button" data-del aria-label="Удалить вопрос ' + (i + 1) + '"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
          '</div></li>';
      }).join('') + '</ol>' +
      '<button class="btn btn--ghost btn--s faq-ed__add" type="button" data-faq-add>+ Добавить вопрос</button></div>';
  }

  function renderEditor() {
    var b = BLOCK[content.current];
    $('[data-editor-title]').textContent = b.name;
    $('[data-editor-anchor]').textContent = b.anchor;
    $('[data-wys-url]').textContent = 'forma-fit.ru/' + b.anchor;
    var form = $('[data-editor-form]');
    form.innerHTML = b.fields.map(function (f) { return fieldHtml(b, f); }).join('') + (b.faq ? faqHtml(b) : '');
    $('[data-editor-note]').textContent = 'Демо: сохраняется в админке';
    $$('[data-cf]', form).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.getAttribute('data-cf');
        content.draft[b.key].fields[k] = inp.value;
        $('[data-count="' + k + '"]', form).textContent = inp.value.length;
        onContentChange(k);
      });
    });
    if (b.faq) initFaqEditor(b);
    updateContentStatus();
    renderWys();
  }

  function initFaqEditor(b) {
    var list = $('[data-faq]'), items = content.draft[b.key].items, dragFrom = null;
    function rerender(focusSel) {
      var y = window.scrollY;
      renderEditor(); onContentChange('faq');
      window.scrollTo(0, y);
      if (focusSel) { var el = $(focusSel); if (el) el.focus(); }
    }
    $$('.faq-ed__item', list).forEach(function (li) {
      var i = +li.getAttribute('data-i');
      $$('[data-fq]', li).forEach(function (inp) {
        inp.addEventListener('input', function () { items[i][inp.getAttribute('data-fq')] = inp.value; onContentChange('faq' + i); });
      });
      $$('[data-move]', li).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var to = i + +btn.getAttribute('data-move'); if (to < 0 || to >= items.length) return;
          var it = items.splice(i, 1)[0]; items.splice(to, 0, it);
          rerender('.faq-ed__item[data-i="' + to + '"] [data-move="' + btn.getAttribute('data-move') + '"]');
        });
      });
      $('[data-del]', li).addEventListener('click', function () {
        items.splice(i, 1);
        rerender('[data-faq-add]');
        toast('Вопрос удалён', 'Чтобы вернуть, нажми «Отменить изменения»', 'info');
      });
      // Перетаскивание: тянем за ручку
      var handle = $('[data-handle]', li);
      handle.addEventListener('mousedown', function () { li.draggable = true; });
      handle.addEventListener('mouseup', function () { li.draggable = false; });
      li.addEventListener('dragstart', function (e) { dragFrom = i; li.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch (x) { /* IE */ } });
      li.addEventListener('dragend', function () { li.draggable = false; li.classList.remove('is-dragging'); $$('.faq-ed__item', list).forEach(function (x) { x.classList.remove('is-over'); }); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; li.classList.add('is-over'); });
      li.addEventListener('dragleave', function () { li.classList.remove('is-over'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        if (dragFrom === null || dragFrom === i) return;
        var it = items.splice(dragFrom, 1)[0]; items.splice(i, 0, it); dragFrom = null;
        rerender();
      });
    });
    $('[data-faq-add]').addEventListener('click', function () {
      items.push({ q: 'Новый вопрос', a: 'Ответ на вопрос.' });
      rerender();
      var last = $$('.faq-ed__item', list.ownerDocument).pop();
      if (last) { last.classList.add('is-added'); var q = $('.faq-ed__q', last); q.focus(); q.select(); }
    });
  }

  function onContentChange(fieldKey) {
    updateContentStatus();
    renderWys(fieldKey);
    // статус в списке блоков
    var btn = $('[data-block="' + content.current + '"] .blocks__state'), dirty = isDirty(content.current);
    if (btn) { btn.classList.toggle('is-draft', dirty); btn.textContent = dirty ? 'Черновик' : 'Опубликовано'; }
  }
  function updateContentStatus() {
    var dirty = isDirty(content.current), st = $('[data-content-status]');
    st.classList.toggle('is-draft', dirty);
    $('[data-content-status-text]').textContent = dirty ? 'Черновик' : 'Опубликовано';
    $('[data-content-publish]').disabled = !dirty;
    $('[data-content-revert]').disabled = !dirty;
    renderHistory();
  }
  function renderHistory() {
    var list = content.history.filter(function (h) { return h.block === content.current; }).slice(0, 6);
    $('[data-history]').innerHTML = list.length ? list.map(function (h) {
      var d = new Date(h.when);
      return '<li class="history__item' + (h.fresh ? ' is-new' : '') + '"><div>' + esc(h.what) + '<div class="history__who">' + esc(h.who) + '</div></div><span class="history__when">' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ', ' + hhmm(d) + '</span></li>';
    }).join('') : '<li class="history__item"><div>Изменений пока не было</div><span></span></li>';
  }

  function wysText(key, f, mark) { return '<span data-wf="' + f + '"' + (mark === f ? ' class="w-mark"' : '') + '>' + esc(content.draft[key].fields[f]) + '</span>'; }
  function renderWys(mark) {
    var key = content.current, b = BLOCK[key], F = function (f) { return wysText(key, f, mark); }, html = '';
    var pub = prices.published;
    if (key === 'hero') {
      html = '<div class="w-hero"><p class="w-eyebrow">' + F('eyebrow') + '</p>' +
        '<h2 class="w-hero__title"><span class="w-hero__avg">' + F('titleAvg') + '</span><span class="w-hero__a">' + F('titleA') + '</span><span class="w-hero__num">' + F('titleNum') + '</span><span class="w-hero__b">' + F('titleB') + '</span><span class="w-hero__c">' + F('titleC') + '</span></h2>' +
        '<div class="w-trust"><span>Старт 2 ноября</span><span>12 000+ выпускниц</span><span>Рейтинг 4,9</span></div>' +
        '<span class="w-btn">' + F('cta') + '</span><span class="w-link">' + F('link') + '</span></div>';
    } else if (key === 'segments') {
      html = '<div class="w-sec"><span class="w-beam"></span><h2 class="w-title">' + F('title') + '</h2><p class="w-lead">' + F('lead') + '</p>' +
        '<div class="w-tabs"><span>' + F('tab1') + '</span><span>' + F('tab2') + '</span><span>' + F('tab3') + '</span></div>' +
        '<p class="w-lead">Сейчас: абонемент куплен в январе, сходила три раза. В ФОРМЕ: 30 минут в 7:15, пока все спят.</p><span class="w-btn">' + F('cta') + '</span></div>';
    } else if (key === 'results') {
      html = '<div class="w-sec w-sec--light"><h2 class="w-title">' + F('title') + '</h2>' +
        '<p class="w-title" style="font-size:72px;margin-top:22px;color:var(--color-ember)">−4–7 <small style="font-size:28px">кг</small> −6–10 <small style="font-size:28px">см</small></p>' +
        '<p class="w-lead" style="font-size:13px">' + F('lead') + '</p><span class="w-btn">' + F('cta') + '</span></div>';
    } else if (key === 'program') {
      html = '<div class="w-sec"><span class="w-beam"></span><p class="w-eyebrow">' + F('eyebrow') + '</p><h2 class="w-title">' + F('title') + '</h2>' +
        '<p class="w-lead">9 лет тренирует женщин. Нутрициолог, мастер спорта по фитнес-бикини. Мама двоих, сама вернулась в форму после родов.</p><span class="w-btn">' + F('cta') + '</span></div>';
    } else if (key === 'tech') {
      html = '<div class="w-sec w-sec--light"><p class="w-eyebrow">' + F('eyebrow') + '</p><h2 class="w-title">' + F('title') + '</h2><p class="w-lead">' + F('lead') + '</p><span class="w-btn">' + F('cta') + '</span></div>';
    } else if (key === 'tariffs') {
      html = '<div class="w-sec"><span class="w-beam"></span><h2 class="w-title">' + F('title') + '</h2><p class="w-lead">' + F('lead') + '</p>' +
        '<div class="w-tabs" style="margin-top:22px"><span>С куратором ' + money(pub.kurator.early) + '</span><span>Сама ' + money(pub.sama.early) + '</span><span>Личное ведение ' + money(pub.lichnoe.early) + '</span></div>' +
        '<p class="w-lead" style="font-size:13px">Цены меняются в разделе «Редактор цен».</p></div>';
    } else if (key === 'faq') {
      html = '<div class="w-sec"><h2 class="w-title">' + F('title') + '</h2><div class="w-faq">' +
        content.draft.faq.items.map(function (it, i) {
          var m = mark === 'faq' + i ? ' w-mark' : '';
          return '<div class="w-faq__item"><p class="w-faq__q' + m + '">' + esc(it.q) + '</p>' + (i === 0 ? '<p class="w-faq__a">' + esc(it.a) + '</p>' : '') + '</div>';
        }).join('') + '</div></div>';
    } else if (key === 'final') {
      html = '<div class="w-sec w-final"><span class="w-beam"></span><h2 class="w-title">' + F('title') + '</h2><p class="w-lead">' + F('text') + '</p>' +
        '<div><span class="w-btn">' + F('cta') + '</span></div><span class="w-link">' + F('cta2') + '</span><p class="w-lead" style="font-size:13px">14 дней на возврат. Можно долями.</p></div>';
    }
    html += '<p class="w-note">' + 'Превью. Демо: тексты сохраняются только в админке.' + '</p>';
    $('[data-wys]').innerHTML = html;
  }

  function selectBlock(key) {
    content.current = key;
    $$('[data-block]').forEach(function (b) {
      var on = b.getAttribute('data-block') === key;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    renderEditor();
  }

  function describeChange(key) {
    var b = BLOCK[key], d = content.draft[key], p = content.published[key], changed = [];
    b.fields.forEach(function (f) { if (d.fields[f.key] !== p.fields[f.key]) changed.push(f.label.toLowerCase()); });
    if (b.faq && JSON.stringify(d.items) !== JSON.stringify(p.items)) {
      changed.push(d.items.length !== p.items.length ? 'список вопросов (' + d.items.length + ')' : 'вопросы и порядок');
    }
    return changed.length ? 'Изменено: ' + changed.join(', ') : 'Опубликовано без изменений';
  }

  function publishHeroToSite() {
    var f = content.published.hero.fields, def = defaultsOf(BLOCK.hero).fields;
    var hero = {}, any = false;
    ['titleAvg', 'titleA', 'titleNum', 'titleB', 'titleC', 'cta'].forEach(function (k) { if (f[k] !== def[k]) { hero[k] = f[k]; any = true; } });
    var o = store.get(OVERRIDES_KEY) || { version: 1 };
    if (any) { o.content = { hero: hero }; o.version = 1; o.updatedAt = new Date().toISOString(); store.set(OVERRIDES_KEY, o); }
    else { delete o.content; if (o.tariffs) store.set(OVERRIDES_KEY, o); else store.remove(OVERRIDES_KEY); }
  }

  function initContent() {
    loadContent();
    renderBlockList();
    renderEditor();
    $('[data-content-publish]').addEventListener('click', function () {
      var btn = this, key = content.current;
      btn.classList.add('is-loading'); btn.disabled = true;
      setTimeout(function () {
        var what = describeChange(key);
        content.published[key] = clone(content.draft[key]);
        content.history.forEach(function (h) { h.fresh = false; });
        content.history.unshift({ block: key, who: 'Менеджер школы', when: new Date().toISOString(), what: what, local: true, fresh: true });
        saveContent();
        if (key === 'hero') publishHeroToSite();
        btn.classList.remove('is-loading');
        renderBlockList(); updateContentStatus();
        toast('Блок «' + BLOCK[key].name + '» опубликован', 'Демо: тексты сохранены в админке, на сайт не уходят', 'ok');
      }, reduce ? 0 : 600);
    });
    $('[data-content-revert]').addEventListener('click', function () {
      content.draft[content.current] = clone(content.published[content.current]);
      renderBlockList(); renderEditor();
    });
  }

  /* ===================================================================
     10. Настройки и тосты
     =================================================================== */
  function initSettings() {
    var form = $('[data-settings]'), saved = store.get(SETTINGS_KEY) || {};
    ['metrika', 'bot', 'pay'].forEach(function (n) { if (saved[n]) form.elements[n].value = saved[n]; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = { metrika: form.elements.metrika.value.trim(), bot: form.elements.bot.value.trim(), pay: form.elements.pay.value.trim() };
      var mf = form.elements.metrika.closest('.field');
      var bad = v.metrika && !/^\d{5,10}$/.test(v.metrika);
      mf.classList.toggle('is-error', !!bad);
      $('.field__hint', mf).textContent = bad ? 'ID счётчика — только цифры, 5–10 знаков' : 'Подставится в CONFIG.analytics.metrikaId в main.js';
      if (bad) { form.elements.metrika.focus(); return; }
      store.set(SETTINGS_KEY, v);
      toast('Настройки сохранены', 'Демо: хранятся в этом браузере и никуда не отправляются', 'ok');
    });
  }

  var OK_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var INFO_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5m0-8.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function toast(title, sub, kind, allowHtml) {
    var box = $('[data-toasts]'), el = doc.createElement('div');
    el.className = 'toast' + (kind === 'info' ? ' toast--info' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = (kind === 'info' ? INFO_ICON : OK_ICON) + '<div><strong>' + esc(title) + '</strong>' + (sub ? '<span>' + (allowHtml ? sub : esc(sub)) + '</span>' : '') + '</div>';
    box.appendChild(el);
    setTimeout(function () { el.classList.add('is-out'); setTimeout(function () { el.remove(); }, 320); }, 4600);
  }

  /* ===================================================================
     11. Запуск
     =================================================================== */
  function init() {
    var d0 = new Date();
    $('[data-updated]').textContent = pad(d0.getDate()) + '.' + pad(d0.getMonth() + 1) + '.' + d0.getFullYear() + ', ' + hhmm(d0);
    initCharts();
    initSlicers();
    initTable();
    renderAll(false);
    initBell();
    initLive();
    initFocus();
    initPrices();
    initContent();
    initSettings();
    window.addEventListener('hashchange', route);
    route();
    // Если цены поменяли в другой вкладке админки — подтянуть
    window.addEventListener('storage', function (e) {
      if (e.key === OVERRIDES_KEY && priceEqual(prices.draft, prices.published)) {
        prices.published = readPublishedPrices(); prices.draft = clone(prices.published); renderPriceEditors(); updatePrices();
      }
    });
    window.FORMA_ADMIN = { state: state, setFilter: setFilter, prices: prices, content: content, sum: sum, pick: pick, filters: filters };
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
