/* =====================================================================
   ФОРМА — демо-админка. admin-data.js
   ДЕМО-ДАННЫЕ. Всё ниже сгенерировано детерминированно (seed), чтобы
   показать клиенту, как будет выглядеть отчёт. В проде данные приходят
   из Яндекс.Метрики (визиты, цели) и CRM (оплаты, выручка), расходы —
   из рекламных кабинетов.

   Разделы:
    1. Справочники: тарифы, источники, кампании, сегменты
    2. Исходные цены и тексты сайта (совпадают с main.js и index.html)
    3. Генератор куба «день × кампания × сегмент» за 60 дней
    4. Профиль активности по часам (для тепловой карты)
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- Детерминированный генератор (mulberry32) ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Стохастическое округление: сумма по многим строкам остаётся честной
  function sround(x, r) { var f = Math.floor(x); return f + (r() < x - f ? 1 : 0); }
  // Гауссов шум (Бокс — Мюллер)
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* ===================================================================
     1. Справочники
     =================================================================== */
  var TARIFFS = [
    { key: 'kurator', name: 'С куратором' },
    { key: 'sama', name: 'Сама' },
    { key: 'lichnoe', name: 'Личное ведение' }
  ];

  var SOURCES = [
    { key: 'ig',  name: 'Instagram/Reels', mobile: 0.89 },
    { key: 'tg',  name: 'Telegram Ads',    mobile: 0.82 },
    { key: 'vk',  name: 'VK',              mobile: 0.78 },
    { key: 'org', name: 'Органика',        mobile: 0.58 }
  ];

  var SEGMENTS = [
    { key: 'office', name: 'Офис' },
    { key: 'mom',    name: 'Мама' },
    { key: 'newbie', name: 'Новичок' }
  ];

  // Кампании (UTM). cpc — цена клика, ctr — кликабельность; organic/бесплатные — без расходов.
  // seg — относительный вес кампании в сегменте (внутри источника нормируется)
  var CAMPAIGNS = [
    { id: 'reels_promo_talia', source: 'ig', medium: 'reels',   label: 'Reels: продвижение «минус 6–10 см»', share: 0.42, cpc: 38, ctr: 0.016, seg: { office: 1.0, mom: 1.0, newbie: 1.2 } },
    { id: 'stories_anna',      source: 'ig', medium: 'stories', label: 'Сторис Анны (свой блог)',            share: 0.36, cpc: 0,  ctr: 0.031, seg: { office: 0.9, mom: 1.3, newbie: 0.9 } },
    { id: 'bio_link',          source: 'ig', medium: 'bio',     label: 'Ссылка в профиле',                    share: 0.22, cpc: 0,  ctr: 0,     seg: { office: 1.0, mom: 1.0, newbie: 1.0 } },
    { id: 'tg_ads_office',     source: 'tg', medium: 'cpm',     label: 'Telegram Ads: каналы о работе',       share: 0.56, cpc: 44, ctr: 0.009, seg: { office: 1.6, mom: 0.4, newbie: 0.9 } },
    { id: 'tg_ads_mama',       source: 'tg', medium: 'cpm',     label: 'Telegram Ads: мамские каналы',        share: 0.44, cpc: 39, ctr: 0.011, seg: { office: 0.4, mom: 1.8, newbie: 0.8 } },
    { id: 'vk_lookalike',      source: 'vk', medium: 'cpc',     label: 'VK: похожие на выпускниц',            share: 0.52, cpc: 33, ctr: 0.0075, seg: { office: 1.1, mom: 0.9, newbie: 1.1 } },
    { id: 'vk_mama_30_40',     source: 'vk', medium: 'cpc',     label: 'VK: мамы 30–40',                      share: 0.48, cpc: 29, ctr: 0.0068, seg: { office: 0.4, mom: 1.7, newbie: 0.7 } },
    { id: 'organic',           source: 'org', medium: 'none',   label: 'Без UTM: поиск и прямые заходы',      share: 1.0,  cpc: 0,  ctr: 0,     seg: { office: 1.0, mom: 1.0, newbie: 1.0 } }
  ];

  /* ===================================================================
     2. Исходные цены и тексты сайта
     Должны совпадать с CONFIG в сайт/main.js и BOTTOM_CONFIG в bottom.js
     =================================================================== */
  var PRICE_DEFAULTS = {
    sama:    { early: 4900,  regular: 5900,  parts: 4, showBonus: true },
    kurator: { early: 9900,  regular: 11900, parts: 4, showBonus: true },
    lichnoe: { early: 24900, regular: 29900, parts: 4, showBonus: true, seatsLeft: 7, seatsTotal: 20 }
  };

  // Содержимое карточек тарифов (для превью в редакторе цен) — копия текстов index.html
  var TARIFF_CARDS = {
    sama: {
      name: 'Сама', forText: 'Уже тренировалась и держишь ритм сама', main: false,
      inList: ['тренировки дома на 8 недель', 'план питания без жёстких запретов', 'трекер прогресса'],
      outList: ['чат, проверка техники, эфиры'],
      bonusTitle: 'Бонус ранней записи', bonus: ['эфир с Анной «Праздники без отката»'],
      hint: 'Новичкам и мамам после родов советуем «С куратором»'
    },
    kurator: {
      name: 'С куратором', forText: 'Новичкам, мамам и тем, кто уже бросал', main: true, badge: 'Основной',
      inList: ['всё из «Сама»', 'чат с кураторами', 'проверка техники по видео каждую неделю', 'прямые эфиры с Анной'],
      outList: [],
      bonusTitle: 'Бонусы ранней записи', bonus: ['«Неделя 0» — 3 тренировки на технику до старта', 'эфир «Праздники без отката»'],
      anchor: 'Проверка техники и эфиры — как в «Личном ведении», но в 2,5 раза дешевле'
    },
    lichnoe: {
      name: 'Личное ведение', forText: 'Нужен план под тебя и разговор с Анной лично', main: false,
      inList: ['всё из «С куратором»', 'индивидуальный план от Анны', '4 созвона с Анной по 30 минут'],
      outList: [],
      bonusTitle: 'Бонус ранней записи', bonus: ['первый созвон — до старта'],
      seats: '20 мест на поток'
    }
  };

  // Блоки сайта для редактора контента. Тексты — из сайт/index.html (утверждённый план v2)
  var CONTENT_BLOCKS = [
    { key: 'hero', name: 'Первый экран', anchor: '#top', theme: 'hero', live: true, fields: [
      { key: 'eyebrow', label: 'Надзаголовок', value: 'Онлайн-программа Анны Соколовой для женщин' },
      { key: 'titleAvg', label: 'Заголовок: малая строка', value: 'В среднем', site: true },
      { key: 'titleA', label: 'Заголовок: строка 1', value: 'минус', site: true },
      { key: 'titleNum', label: 'Заголовок: акцент (цифра)', value: '6–10 см', site: true },
      { key: 'titleB', label: 'Заголовок: строка 2', value: 'в талии за 8 недель', site: true },
      { key: 'titleC', label: 'Заголовок: строка 3', value: 'Дома, по 30–40 минут', site: true },
      { key: 'cta', label: 'Главная кнопка', value: 'Записаться на поток 2 ноября', site: true },
      { key: 'link', label: 'Ссылка под кнопкой', value: 'Не знаешь, с чего начать? Узнай свой старт за 1 минуту' }
    ] },
    { key: 'segments', name: 'Это про тебя', anchor: '#pro-tebya', theme: 'dark', fields: [
      { key: 'title', label: 'Заголовок', value: 'Это про тебя?' },
      { key: 'lead', label: 'Подзаголовок', value: 'Выбери, что ближе' },
      { key: 'tab1', label: 'Вкладка 1', value: 'Работаю, времени нет' },
      { key: 'tab2', label: 'Вкладка 2', value: 'Я мама малыша' },
      { key: 'tab3', label: 'Вкладка 3', value: 'Начинала уже 10 раз' },
      { key: 'cta', label: 'Кнопка', value: 'Выбрать свой тариф' }
    ] },
    { key: 'results', name: 'Результаты', anchor: '#rezultaty', theme: 'light', fields: [
      { key: 'title', label: 'Заголовок', value: 'Что меняется за 8 недель у обычных женщин' },
      { key: 'lead', label: 'Сноска о результате', value: '*Средний результат выпускниц за 8 недель. У каждой он свой — зависит от старта, здоровья и регулярности.', multiline: true },
      { key: 'cta', label: 'Кнопка', value: 'Начать свои 8 недель' }
    ] },
    { key: 'program', name: 'Программа', anchor: '#programma', theme: 'dark', fields: [
      { key: 'eyebrow', label: 'Надзаголовок', value: 'Программа' },
      { key: 'title', label: 'Заголовок', value: '8 недель с Анной — без рывков и «с понедельника — всё»' },
      { key: 'cta', label: 'Кнопка', value: 'Тренироваться с Анной' }
    ] },
    { key: 'tech', name: 'Куратор', anchor: '#kurator', theme: 'light', fields: [
      { key: 'eyebrow', label: 'Надзаголовок', value: 'Проверка техники' },
      { key: 'title', label: 'Заголовок', value: 'Куратор смотрит твою технику — каждую неделю' },
      { key: 'lead', label: 'Подзаголовок', value: 'Снимаешь 2–3 упражнения на телефон — куратор отвечает, что поправить. По секундам.', multiline: true },
      { key: 'cta', label: 'Кнопка', value: 'Хочу с куратором' }
    ] },
    { key: 'tariffs', name: 'Тарифы', anchor: '#tarify', theme: 'dark', fields: [
      { key: 'title', label: 'Заголовок', value: 'Выбери, как пройдёшь эти 8 недель' },
      { key: 'lead', label: 'Подзаголовок', value: 'Тренировки и питание — во всех тарифах. Разница — сколько поддержки рядом.', multiline: true }
    ] },
    { key: 'faq', name: 'Вопросы', anchor: '#voprosy', theme: 'dark', faq: true, fields: [
      { key: 'title', label: 'Заголовок', value: 'Отвечаем честно' }
    ], items: [
      { q: 'У меня совсем нет времени. Это реально?', a: 'Тренировка — 30–40 минут дома, когда удобно: утром, в обед или когда дети уснули. Пропустила день — продолжаешь со следующего, план не сгорает.' },
      { q: 'Что если пропущу тренировку или заболею?', a: 'Ничего страшного. Тренировки остаются в личном кабинете, куратор поможет вернуться в ритм без «догонялок». Доступ к материалам — 6 месяцев.' },
      { q: 'Я недавно родила. Мне можно?', a: 'Только после разрешения врача — это важно. Если было кесарево или есть диастаз, скажи куратору: подскажем, чем заменить упражнения. Анна сама возвращалась в форму после родов.' },
      { q: 'Я уже бросала много раз. Чем это отличается от YouTube?', a: 'Видео бывают отличными, но в них никто не смотрит на твою технику и не замечает, что ты пропала. Здесь есть куратор, чат и план по неделям. Бросают обычно от одиночества, а не от лени.' },
      { q: 'Я никогда не занималась. Не отстану?', a: 'Первые 2 недели — техника и привычка, а не рекорды. Хватит коврика, резинки и гантели понадобятся позже. Ты дома — сравнивать себя не с кем.' },
      { q: 'Какой инвентарь нужен и сколько он стоит?', a: 'Первые 2 недели — ничего. С 3-й недели — набор резинок, примерно 1 000 ₽. С 5-й — пара гантелей 2–4 кг, примерно 2 000 ₽. На старте их можно заменить бутылками с водой.' },
      { q: 'Чем «С куратором» отличается от «Сама»?', a: 'В «Сама» — тренировки, питание и трекер. В «С куратором» к ним добавляется живой человек: чат, проверка техники каждую неделю и эфиры с Анной. Новичкам и мамам после родов — сюда.' },
      { q: 'Кому программа не подойдёт?', a: 'Если ты беременна, недавно родила и врач ещё не разрешил нагрузки, или у тебя есть противопоказания к спорту — сначала к врачу. Мы честно скажем, если тебе пока рано, и вернём деньги.' },
      { q: 'Вы точно не развод? А если не подойдёт?', a: 'Программу прошли 12 000+ женщин, оценка — 4,9. Работаем по договору-оферте, чек приходит на почту, реквизиты — внизу страницы. В течение 14 дней с начала программы вернём деньги, если не подойдёт.' }
    ] },
    { key: 'final', name: 'Финал', anchor: '#start', theme: 'final', fields: [
      { key: 'title', label: 'Заголовок', value: '27 декабря ты можешь сказать: «Я дошла»' },
      { key: 'text', label: 'Текст', value: 'Старт — 2 ноября. Ранняя цена — до 27 октября.' },
      { key: 'cta', label: 'Кнопка 1', value: 'Записаться на поток' },
      { key: 'cta2', label: 'Ссылка в бота', value: 'Сначала 3 бесплатных дня в Telegram' }
    ] }
  ];

  // История изменений (демо)
  var HISTORY = [
    { block: 'tariffs', who: 'Менеджер школы', when: '2026-10-17T18:20:00+03:00', what: 'Обновлён подзаголовок' },
    { block: 'hero',    who: 'Анна Соколова',  when: '2026-10-16T11:05:00+03:00', what: 'Опубликован вариант A заголовка' },
    { block: 'faq',     who: 'Менеджер школы', when: '2026-10-15T16:42:00+03:00', what: 'Добавлен вопрос «Кому программа не подойдёт?»' },
    { block: 'final',   who: 'Менеджер школы', when: '2026-10-14T10:12:00+03:00', what: 'Изменён текст про раннюю цену' },
    { block: 'tech',    who: 'Анна Соколова',  when: '2026-10-12T20:30:00+03:00', what: 'Новый подзаголовок про ответ по секундам' },
    { block: 'results', who: 'Менеджер школы', when: '2026-10-11T12:00:00+03:00', what: 'Сноска перенесена из первого экрана' },
    { block: 'segments', who: 'Менеджер школы', when: '2026-10-09T09:48:00+03:00', what: 'Переименована вкладка «Начинала уже 10 раз»' },
    { block: 'program', who: 'Анна Соколова',  when: '2026-10-08T19:15:00+03:00', what: 'Опубликован заголовок блока' }
  ];

  /* ===================================================================
     3. Генератор куба
     Строка: { d (индекс дня 0..59), c (id кампании), s (источник), g (сегмент),
               visits, mobile, scroll, quizStart, quizFinish, checkout,
               pay: {kurator, sama, lichnoe}, marathon, clicks, impr, spend }
     =================================================================== */
  var DAYS = 60;
  var END = new Date(2026, 9, 18); // 18 октября 2026 — «сегодня» отчёта
  var dates = [];
  for (var i = 0; i < DAYS; i++) {
    var dt = new Date(END); dt.setDate(END.getDate() - (DAYS - 1 - i));
    dates.push(dt);
  }

  // Визитов в день по источнику: старт → конец периода (рост к дедлайну ранней цены)
  var BASE_VISITS = { ig: [250, 395], tg: [70, 128], vk: [55, 104], org: [38, 64] };
  var SEG_SHARE = {
    ig:  { office: 0.38, mom: 0.37, newbie: 0.25 },
    tg:  { office: 0.48, mom: 0.24, newbie: 0.28 },
    vk:  { office: 0.30, mom: 0.42, newbie: 0.28 },
    org: { office: 0.40, mom: 0.30, newbie: 0.30 }
  };
  var DOW = [1.12, 1.06, 1.0, 0.99, 0.97, 0.88, 0.94]; // вс, пн, вт, ср, чт, пт, сб
  // Качество трафика: тёплая аудитория Анны конвертируется лучше холодной рекламы
  var SRC_Q = {
    ig:  { scroll: 1.05, quiz: 1.0, checkout: 1.18, marathon: 0.8 },
    tg:  { scroll: 0.94, quiz: 1.12, checkout: 0.82, marathon: 1.35 },
    vk:  { scroll: 0.9, quiz: 1.08, checkout: 0.74, marathon: 1.4 },
    org: { scroll: 1.12, quiz: 0.9, checkout: 1.32, marathon: 0.9 }
  };
  var SEG_Q = {
    office: { scroll: 0.55, quizStart: 0.10, quizFin: 0.76, checkout: 1.08, mix: { sama: 0.37, kurator: 0.60, lichnoe: 0.03 } },
    mom:    { scroll: 0.48, quizStart: 0.16, quizFin: 0.68, checkout: 0.96, mix: { sama: 0.21, kurator: 0.755, lichnoe: 0.035 } },
    newbie: { scroll: 0.51, quizStart: 0.21, quizFin: 0.73, checkout: 0.9,  mix: { sama: 0.29, kurator: 0.69, lichnoe: 0.02 } }
  };
  // Вклад кампаний: качество внутри источника
  var CAMP_Q = { reels_promo_talia: 0.9, stories_anna: 1.25, bio_link: 1.1, tg_ads_office: 1.05, tg_ads_mama: 0.95, vk_lookalike: 1.08, vk_mama_30_40: 0.92, organic: 1 };

  var r = rng(20261102); // seed = дата старта потока
  var rows = [];
  for (var d = 0; d < DAYS; d++) {
    var t = d / (DAYS - 1);
    var dow = dates[d].getDay();
    var urgency = 1 + 0.42 * Math.pow(t, 1.6); // CR растёт к дедлайну ранней цены
    SOURCES.forEach(function (src) {
      var b = BASE_VISITS[src.key];
      var srcVisits = (b[0] + (b[1] - b[0]) * t) * DOW[dow] * (1 + 0.1 * gauss(r));
      // всплески: эфир Анны и посты в блоге дают пики в Instagram
      if (src.key === 'ig' && (d === 41 || d === 52 || d === 57)) srcVisits *= 1.55;
      var camps = CAMPAIGNS.filter(function (c) { return c.source === src.key; });
      SEGMENTS.forEach(function (seg) {
        var segVisits = srcVisits * SEG_SHARE[src.key][seg.key];
        var wsum = camps.reduce(function (s, c) { return s + c.share * c.seg[seg.key]; }, 0);
        camps.forEach(function (c) {
          var w = c.share * c.seg[seg.key] / wsum;
          var visits = sround(segVisits * w * (1 + 0.06 * gauss(r)), r);
          if (visits < 0) visits = 0;
          var sq = SEG_Q[seg.key], q = SRC_Q[src.key], cq = CAMP_Q[c.id];
          var scroll = sround(visits * Math.min(0.92, sq.scroll * q.scroll * (1 + 0.04 * gauss(r))), r);
          var quizStart = sround(visits * sq.quizStart * q.quiz * (1 + 0.08 * gauss(r)), r);
          var quizFinish = sround(quizStart * Math.min(0.95, sq.quizFin * (1 + 0.05 * gauss(r))), r);
          var checkout = sround(visits * 0.041 * q.checkout * sq.checkout * cq * urgency * (1 + 0.1 * gauss(r)), r);
          if (checkout > scroll) checkout = scroll;
          var paid = sround(checkout * 0.43 * (1 + 0.08 * gauss(r)), r);
          if (paid > checkout) paid = checkout;
          var pay = { kurator: 0, sama: 0, lichnoe: 0 };
          for (var k = 0; k < paid; k++) {
            var x = r();
            if (x < sq.mix.lichnoe) pay.lichnoe++;
            else if (x < sq.mix.lichnoe + sq.mix.sama) pay.sama++;
            else pay.kurator++;
          }
          var marathon = sround(visits * 0.058 * q.marathon * (1 + 0.1 * gauss(r)), r);
          var mobile = sround(visits * Math.min(0.97, src.mobile * (1 + 0.02 * gauss(r))), r);
          var clicks = c.medium === 'none' || c.medium === 'bio' ? 0 : Math.round(visits / 0.88);
          var impr = c.ctr ? Math.round(clicks / c.ctr) : 0;
          var spend = Math.round(clicks * c.cpc * (1 + 0.05 * gauss(r)));
          rows.push({ d: d, c: c.id, s: src.key, g: seg.key, visits: visits, mobile: mobile, scroll: scroll,
            quizStart: quizStart, quizFinish: quizFinish, checkout: checkout, pay: pay, marathon: marathon,
            clicks: clicks, impr: impr, spend: spend > 0 ? spend : 0 });
        });
      });
    });
  }

  /* ===================================================================
     4. Активность по часам: доля визитов сегмента в каждый час суток
     Офис — утро до работы, обед, поздний вечер; мама — дневной сон малыша и вечер; новичок — вечер.
     =================================================================== */
  function profile(peaks) {
    var arr = [];
    for (var h = 0; h < 24; h++) {
      var v = 0.04;
      peaks.forEach(function (p) { v += p[1] * Math.exp(-Math.pow(h - p[0], 2) / (2 * p[2] * p[2])); });
      if (h >= 1 && h <= 5) v *= 0.25;
      arr.push(v);
    }
    var s = arr.reduce(function (a, b) { return a + b; }, 0);
    return arr.map(function (v) { return v / s; });
  }
  var HOURS = {
    office: profile([[7.5, 0.7, 1], [13, 0.8, 1], [21.5, 1.2, 1.4]]),
    mom:    profile([[10.5, 0.7, 1.3], [14.5, 0.8, 1.2], [21.5, 1.1, 1.3]]),
    newbie: profile([[12.5, 0.4, 1.5], [20.5, 1.2, 1.6]])
  };
  // Telegram Ads сильнее в дороге на работу, VK — вечером
  var SRC_HOUR = {
    ig:  function () { return 1; },
    tg:  function (h) { return (h >= 8 && h <= 10) || (h >= 18 && h <= 19) ? 1.35 : 1; },
    vk:  function (h) { return h >= 19 && h <= 23 ? 1.2 : 0.95; },
    org: function (h) { return h >= 10 && h <= 17 ? 1.2 : 0.95; }
  };
  var hr = rng(777);
  var HOUR_NOISE = [];
  for (var dw = 0; dw < 7; dw++) { HOUR_NOISE.push([]); for (var hh = 0; hh < 24; hh++) HOUR_NOISE[dw].push(1 + 0.12 * gauss(hr)); }

  window.FORMA_ADMIN_DATA = {
    demo: true,
    generatedFor: '2026-10-18',
    dates: dates,
    days: DAYS,
    rows: rows,
    tariffs: TARIFFS,
    sources: SOURCES,
    segments: SEGMENTS,
    campaigns: CAMPAIGNS,
    priceDefaults: PRICE_DEFAULTS,
    tariffCards: TARIFF_CARDS,
    contentBlocks: CONTENT_BLOCKS,
    history: HISTORY,
    hours: HOURS,
    srcHour: SRC_HOUR,
    hourNoise: HOUR_NOISE,
    rng: rng
  };
})();
