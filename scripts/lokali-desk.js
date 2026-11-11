/**
 * lokali-desk.js - The Referral Desk on the website (#244, F 2026-11-10).
 *
 * A shopper "rings the Desk": three quick questions (what, when, where), then
 * WhatsApp opens on Francesca's business number with the answers already
 * written as her first message. A person answers within a day with one to three
 * neighbors. Mockup F approved: https://claude.ai/artifact/Qpokps1QCRWuc968xA8knd
 * (look = "rotary phone modern", F 2026-11-10; NOT a case file).
 *
 * Site-wide (footer loader); it only acts where its anchors exist:
 *   1. Homepage: a "Ring the Desk" section right after "Shop by category"
 *      (#lok-cats, built by lokali-home.js), and a one-line "Rather ask a
 *      person?" link under the hero search (#lok-hs).
 *   2. The Market: a Desk card under the grid whenever fewer than 3 storefronts
 *      are showing (thin search or narrow filters), quoting the search term.
 *   3. Any element with [data-lokali-desk] opens the sheet (for Designer use).
 * The menu pill from the mockup is NOT in v1: F called the header too cramped
 * on 2026-10-11 (lokali-heart-nav.js note).
 *
 * Decisions (F 2026-11-10): hours 9 to 6 Central, every day; English AND
 * Spanish from day one (switch on the sheet, defaults to the browser
 * language); the "neighbors connected" counter stays hidden until it passes 20
 * (DESK_CONNECTED below is set by hand: Desk asks live in WhatsApp, so the site
 * cannot count them). Number = Lokali business WhatsApp, profile name "Lokali".
 *
 * Nothing is stored or sent by this script: the message goes from the
 * shopper's own WhatsApp. The only signal is a gtag event on the ring tap.
 * Plus Jakarta Sans set explicitly, violet/orange/light only, no emoji, no em
 * dashes in copy. All shopper text reaches the DOM via textContent and the
 * link via encodeURIComponent.
 */
(function () {
  'use strict';
  if (window.__lokaliDesk) return;
  window.__lokaliDesk = true;

  var WA_NUMBER = '13464593590';     // Lokali business WhatsApp (F 2026-11-10)
  var OPEN_HOUR = 9, CLOSE_HOUR = 18; // America/Chicago, every day
  var DESK_CONNECTED = 0;             // update by hand; shown only when > COUNTER_MIN
  var COUNTER_MIN = 20;
  var AREA_KEY = 'LOKALI_BROWSE_AREA';
  var LANG_KEY = 'LOKALI_DESK_LANG';
  var AREAS = [
    { id: '1', name: 'The Woodlands' }, { id: '2', name: 'Woodforest' },
    { id: '40', name: 'Shenandoah' }, { id: '4', name: 'Conroe' },
    { id: '33', name: 'Spring' }, { id: '32', name: 'Tomball' },
    { id: '34', name: 'Katy' }, { id: '41', name: 'Sugar Land' },
    { id: '3', name: 'Houston' }
  ];

  var T = {
    en: {
      hello: '“Referral Desk. This is Francesca.”',
      title: 'Can’t find who you need? Ring the Desk.',
      lede: 'Tell us what you’re looking for. A real person who knows the neighborhood writes back within a day with one to three neighbors who can help.',
      ring: 'Ring the Desk',
      openNow: 'Desk open today, 9 to 6',
      opensToday: 'The Desk opens at 9 today',
      opensTomorrow: 'The Desk opens at 9 tomorrow',
      connected: 'neighbors connected', wait: 'longest wait for an answer', oneDay: '1 day',
      spanish: 'hablamos español', si: 'Sí',
      nudge: 'Rather ask a person?',
      thinTitle: 'Not quite it? The Desk knows people the search doesn’t.',
      thinSub: 'Tell us what you need. Francesca writes back herself within a day, never AI.',
      sheetTitle: 'You’re ringing the Desk',
      qNeed: 'What do you need?', needPh: 'A birthday cake for 20, one guest is gluten free',
      qWhen: 'When?', when: ['This week', 'This weekend', 'Next month', 'No rush'],
      qWhere: 'Where?', pick: 'Choose your area', somewhere: 'Somewhere else',
      send: 'Ring on WhatsApp', privacy: 'Nobody else gets your number.',
      human: 'Francesca answers every message herself. Never AI, never a bot.',
      humanSheet: 'Francesca reads and answers every message herself. No AI, no bots.',
      afterHours: 'After 6 your message waits for the morning.',
      close: 'Close',
      msgHead: 'Ringing the Desk', msgNeed: 'Need', msgWhen: 'When', msgWhere: 'Where',
      msgBlank: 'Hi Desk! I’m looking for someone who can help me with: '
    },
    es: {
      hello: '“Referral Desk. Habla Francesca.”',
      title: '¿No encuentras a quien necesitas? Llama al Desk.',
      lede: 'Cuéntanos qué buscas. Una persona real que conoce el vecindario te responde en un día con uno a tres vecinos que pueden ayudarte.',
      ring: 'Llama al Desk',
      openNow: 'Desk abierto hoy, de 9 a 6',
      opensToday: 'El Desk abre hoy a las 9',
      opensTomorrow: 'El Desk abre mañana a las 9',
      connected: 'vecinos conectados', wait: 'espera máxima por respuesta', oneDay: '1 día',
      spanish: 'hablamos español', si: 'Sí',
      nudge: '¿Prefieres preguntarle a una persona?',
      thinTitle: '¿No es lo que buscas? El Desk conoce gente que la búsqueda no encuentra.',
      thinSub: 'Cuéntanos qué necesitas. Francesca te responde en persona en un día, nunca IA.',
      sheetTitle: 'Estás llamando al Desk',
      qNeed: '¿Qué necesitas?', needPh: 'Un pastel de cumpleaños para 20, un invitado sin gluten',
      qWhen: '¿Cuándo?', when: ['Esta semana', 'Este fin de semana', 'El próximo mes', 'Sin prisa'],
      qWhere: '¿Dónde?', pick: 'Elige tu zona', somewhere: 'En otro lugar',
      send: 'Llamar por WhatsApp', privacy: 'Nadie más recibe tu número.',
      human: 'Francesca responde cada mensaje en persona. Nunca IA, nunca un bot.',
      humanSheet: 'Francesca lee y responde cada mensaje en persona. Sin IA, sin bots.',
      afterHours: 'Después de las 6 tu mensaje espera hasta la mañana.',
      close: 'Cerrar',
      msgHead: 'Llamando al Desk', msgNeed: 'Necesito', msgWhen: 'Cuándo', msgWhere: 'Dónde',
      msgBlank: '¡Hola Desk! Busco a alguien que me ayude con: '
    }
  };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var lang = store(LANG_KEY) || ((navigator.language || '').toLowerCase().indexOf('es') === 0 ? 'es' : 'en');
  if (!T[lang]) lang = 'en';
  function t(k) { return T[lang][k]; }

  // ---- hours (America/Chicago) ---------------------------------------------
  function chicagoHour() {
    try {
      var h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
      return parseInt(h, 10);
    } catch (e) { return new Date().getHours(); }
  }
  function hoursState() {
    var h = chicagoHour();
    if (h >= OPEN_HOUR && h < CLOSE_HOUR) return 'open';
    return h < OPEN_HOUR ? 'today' : 'tomorrow';
  }
  function hoursText() {
    var s = hoursState();
    return s === 'open' ? t('openNow') : s === 'today' ? t('opensToday') : t('opensTomorrow');
  }

  // ---- drawing ---------------------------------------------------------------
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  // The Lokali L (purple on the white dial center), drawn in a 0..10 box.
  function lPath(x, y, k) {
    function P(px, py) { return (x + px * k).toFixed(1) + ' ' + (y + py * k).toFixed(1); }
    return 'M' + P(0, 0) + ' L' + P(3.1, 0) + ' L' + P(3.1, 7.2) + ' Q' + P(6.4, 7.1) + ' ' + P(9.2, 5.6) +
      ' L' + P(8.2, 10) + ' L' + P(0, 10) + ' Z';
  }
  function miniDial(cls) {
    var s = svg('svg', { viewBox: '0 0 48 48', 'class': 'lkd-mini ' + (cls || ''), 'aria-hidden': 'true', focusable: 'false' });
    var g = svg('g', { 'class': 'lkd-spin' }, s);
    svg('circle', { cx: 24, cy: 24, r: 23, fill: '#C9B0F2' }, g);
    [[24, 8.5], [34.9, 13.1], [39.5, 24], [34.9, 34.9], [24, 39.5], [13.1, 34.9], [8.5, 24], [13.1, 13.1]].forEach(function (p) {
      svg('circle', { cx: p[0], cy: p[1], r: 3.6, fill: '#F3EBFF' }, g);
    });
    svg('circle', { cx: 24, cy: 24, r: 9.5, fill: '#FFFFFF' }, s);
    svg('path', { d: lPath(19.6, 19, 0.95), fill: '#6002EE' }, s);
    return s;
  }
  // F 2026-11-10: "the perfect phone" = a glossy lilac desk phone with a coiled
  // cord, clear finger holes and a white center carrying the purple L.
  function bigPhone() {
    var root = svg('svg', { viewBox: '-10 0 400 330', 'class': 'lkd-art-svg', 'aria-hidden': 'true', focusable: 'false' });
    svg('ellipse', { cx: 190, cy: 312, rx: 140, ry: 11, fill: '#E2D4FF' }, root);
    var waves = svg('g', { 'class': 'lkd-waves', fill: 'none', stroke: '#FF8D00', 'stroke-width': 5, 'stroke-linecap': 'round' }, root);
    ['M26 52 Q14 74 26 96', 'M10 40 Q-6 74 10 108', 'M354 52 Q366 74 354 96', 'M370 40 Q386 74 370 108'].forEach(function (d, i) {
      svg('path', { d: d, 'class': 'lkd-wave lkd-wave' + (i % 2) }, waves);
    });
    var s = svg('g', { 'class': 'lkd-body' }, root);
    // coiled cord: from the handset's left cup down and round to the base
    var cord = svg('g', { fill: 'none', stroke: '#B99CEB', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, s);
    for (var c = 0; c <= 26; c++) {
      var u = c / 26, x0 = 56, y0 = 118, cx1 = 18, cy1 = 230, x1 = 92, y1 = 296;
      var x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx1 + u * u * x1;
      var y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy1 + u * u * y1;
      svg('ellipse', { cx: x.toFixed(1), cy: y.toFixed(1), rx: 13, ry: 4.2, transform: 'rotate(' + (-18 + u * 40).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' }, cord);
    }
    // cradle prongs
    svg('rect', { x: 122, y: 82, width: 24, height: 70, rx: 7, fill: '#C3A8F0' }, s);
    svg('rect', { x: 234, y: 82, width: 24, height: 70, rx: 7, fill: '#C3A8F0' }, s);
    svg('rect', { x: 146, y: 108, width: 88, height: 14, rx: 4, fill: '#B99CEB' }, s);
    // body
    svg('path', { d: 'M78 296 L106 160 Q111 140 134 140 L246 140 Q269 140 274 160 L302 296 Z', fill: '#CDB5F3' }, s);
    svg('path', { d: 'M112 160 Q116 148 134 148 L246 148 Q264 148 268 160 L272 178 L108 178 Z', fill: '#DCCAF8' }, s);
    svg('rect', { x: 70, y: 288, width: 240, height: 18, rx: 8, fill: '#BEA3EE' }, s);
    svg('rect', { x: 78, y: 284, width: 224, height: 6, rx: 3, fill: '#D6C2F7' }, s);
    // handset resting on the cradle
    var hs = svg('g', { 'class': 'lkd-handset' }, s);
    svg('path', { d: 'M46 92 Q46 52 92 50 L288 50 Q334 52 334 92 L334 104 Q334 124 312 124 L280 124 Q262 124 262 108 L262 96 Q262 86 250 86 L130 86 Q118 86 118 96 L118 108 Q118 124 100 124 L68 124 Q46 124 46 104 Z', fill: '#D4BEF6' }, hs);
    svg('path', { d: 'M70 60 Q100 54 140 54 L240 54', stroke: '#F1E8FF', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', opacity: .9 }, hs);
    svg('rect', { x: 52, y: 112, width: 60, height: 8, rx: 4, fill: '#BEA3EE' }, hs);
    svg('rect', { x: 268, y: 112, width: 60, height: 8, rx: 4, fill: '#BEA3EE' }, hs);
    // dial
    var cx = 190, cy = 228;
    svg('circle', { cx: cx, cy: cy, r: 66, fill: '#C3A8F0' }, s);
    var dial = svg('g', { 'class': 'lkd-bigdial' }, s);
    svg('circle', { cx: cx, cy: cy, r: 61, fill: '#CDB5F3' }, dial);
    for (var i = 0; i < 10; i++) {
      var a = (-62 - i * 27) * Math.PI / 180;
      var hx = cx + 45 * Math.cos(a), hy = cy - 45 * Math.sin(a);
      svg('circle', { cx: hx.toFixed(1), cy: hy.toFixed(1), r: 9.6, fill: '#EEE6FC', stroke: '#B99CEB', 'stroke-width': 1.5 }, dial);
      svg('path', { d: 'M' + (hx - 5).toFixed(1) + ' ' + (hy - 2.5).toFixed(1) + ' Q' + (hx - 4).toFixed(1) + ' ' + (hy - 7).toFixed(1) + ' ' + (hx + 1).toFixed(1) + ' ' + (hy - 7.5).toFixed(1), stroke: '#FFFFFF', 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' }, dial);
    }
    svg('circle', { cx: cx, cy: cy, r: 26, fill: '#FFFFFF' }, s);
    svg('path', { d: lPath(cx - 9.5, cy - 11, 2.1), fill: '#6002EE' }, s);
    svg('path', { d: 'M238 262 L254 276', stroke: '#B99CEB', 'stroke-width': 7, 'stroke-linecap': 'round' }, s);
    return root;
  }

  // ---- styles ----------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById('lkd-style')) return;
    var F = '"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
    var css = [
      '.lkd,.lkd *,.lkd-sheet,.lkd-sheet *{box-sizing:border-box;font-family:' + F + ';}',
      '.lkd-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:46px;padding:12px 22px;border-radius:999px;border:0;background:#6002EE;color:#fff !important;font-weight:700;font-size:15px;line-height:1.2;cursor:pointer;text-decoration:none !important;font-family:' + F + ';}',
      '.lkd-btn:hover{background:#4B02BB;}',
      '.lkd-btn:focus-visible,.lkd-link:focus-visible,.lkd-chip:focus-visible,.lkd-x:focus-visible,.lkd-lang button:focus-visible{outline:3px solid #FF8D00;outline-offset:3px;}',
      '.lkd-btn .lkd-mini{width:24px;height:24px;flex:none;}',
      '.lkd-spin,.lkd-bigdial{transform-box:fill-box;transform-origin:50% 50%;transition:transform .7s cubic-bezier(.3,1.4,.5,1);}',
      '.lkd-btn:hover .lkd-spin,.lkd-btn:focus-visible .lkd-spin,.lkd-link:hover .lkd-spin{transform:rotate(-60deg);}',
      '.lkd-sec.lkd-dialing .lkd-bigdial{transform:rotate(-60deg);}',
      '@keyframes lkdLift{0%,100%{transform:translateY(0) rotate(0)}5%,45%{transform:translateY(-9px) rotate(0)}10%{transform:translateY(-9px) rotate(-5deg)}15%{transform:translateY(-9px) rotate(5deg)}20%{transform:translateY(-9px) rotate(-5deg)}25%{transform:translateY(-9px) rotate(5deg)}30%{transform:translateY(-9px) rotate(-4deg)}35%{transform:translateY(-9px) rotate(3deg)}40%{transform:translateY(-9px) rotate(0)}50%{transform:translateY(0)}55%,95%{transform:translateY(-9px) rotate(0)}60%{transform:translateY(-9px) rotate(-5deg)}65%{transform:translateY(-9px) rotate(5deg)}70%{transform:translateY(-9px) rotate(-5deg)}75%{transform:translateY(-9px) rotate(5deg)}80%{transform:translateY(-9px) rotate(-4deg)}85%{transform:translateY(-9px) rotate(3deg)}90%{transform:translateY(-9px) rotate(0)}}',
      '@keyframes lkdBuzz{0%,45%,50%,95%,100%{transform:translateX(0)}10%,20%,30%,40%,60%,70%,80%,90%{transform:translateX(-2px)}15%,25%,35%,65%,75%,85%{transform:translateX(2px)}}',
      '@keyframes lkdWave{0%,100%{opacity:0}10%,35%{opacity:1}45%,50%{opacity:0}60%,85%{opacity:1}}',
      '@keyframes lkdTiny{0%,50%,100%{transform:rotate(0)}10%,30%,60%,80%{transform:rotate(-12deg)}20%,40%,70%,90%{transform:rotate(12deg)}}',
      '.lkd-handset,.lkd-body{transform-box:fill-box;}',
      '.lkd-handset{transform-origin:50% 100%;}',
      '.lkd-body{transform-origin:50% 100%;}',
      '.lkd-wave{opacity:0;}',
      '.lkd-ringing .lkd-handset{animation:lkdLift 1.4s ease-in-out;}',
      '.lkd-ringing .lkd-body{animation:lkdBuzz 1.4s linear;}',
      '.lkd-ringing .lkd-wave0{animation:lkdWave 1.4s ease-in-out;}',
      '.lkd-ringing .lkd-wave1{animation:lkdWave 1.4s ease-in-out .08s;}',
      '.lkd-thin.lkd-ringing > .lkd-mini{animation:lkdTiny 1.2s ease-in-out;transform-origin:50% 50%;}',
      '.lkd-human{display:flex;align-items:center;gap:8px;margin:0;font-size:14.5px;font-weight:700;color:#4B02BB;}',
      '.lkd-human svg{width:20px;height:20px;flex:none;padding:3px;border-radius:50%;background:#F3EBFF;box-sizing:content-box;}',
      '.lkd-human.lkd-human-sm{font-size:13px;}',
      '@media (prefers-reduced-motion:reduce){.lkd-spin,.lkd-bigdial{transition:none;}.lkd-btn:hover .lkd-spin,.lkd-sec.lkd-dialing .lkd-bigdial{transform:none;}.lkd-ringing .lkd-handset,.lkd-ringing .lkd-body,.lkd-ringing .lkd-wave0,.lkd-ringing .lkd-wave1,.lkd-thin.lkd-ringing > .lkd-mini{animation:none;}}',
      '.lkd-open{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;color:#4A4761;}',
      '.lkd-open i{width:9px;height:9px;border-radius:50%;background:#2BA84A;box-shadow:0 0 0 3px rgba(43,168,74,.18);}',
      '.lkd-open.lkd-closed i{background:#6E6A85;box-shadow:none;}',
      // homepage section
      '.lkd-sec{background:linear-gradient(180deg,#F3EBFF,#FFFFFF);padding:72px 20px;}',
      '.lkd-sec-in{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:40px;align-items:center;}',
      '.lkd-art{display:flex;justify-content:center;min-width:0;}',
      '.lkd-art-svg{width:100%;max-width:340px;height:auto;}',
      '.lkd-copy{display:flex;flex-direction:column;gap:16px;min-width:0;}',
      '.lkd-hello{font-weight:700;color:#B85F00;font-size:15px;margin:0;}',
      '.lkd-copy h2{margin:0;font-size:clamp(28px,3.4vw,40px);line-height:1.1;font-weight:800;letter-spacing:-.02em;color:#1A1829;text-wrap:balance;}',
      '.lkd-copy p.lkd-lede{margin:0;color:#4A4761;font-size:17px;line-height:1.55;max-width:56ch;}',
      '.lkd-row{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;}',
      '.lkd-count{display:flex;gap:24px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #E2D4FF;}',
      '.lkd-count div{display:flex;flex-direction:column;}',
      '.lkd-count b{font-size:24px;font-weight:800;color:#6002EE;line-height:1.1;font-variant-numeric:tabular-nums;}',
      '.lkd-count span{font-size:13px;color:#4A4761;}',
      '@media (max-width:860px){.lkd-sec{padding:48px 20px;}.lkd-sec-in{grid-template-columns:minmax(0,1fr);gap:20px;}.lkd-art-svg{max-width:220px;}}',
      // hero nudge
      '.lkd-nudge{margin:12px 0 0;font-size:14.5px;color:#4A4761;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
      '.lkd-link{display:inline-flex;align-items:center;gap:6px;color:#4B02BB;font-weight:700;background:none;border:0;padding:4px 0;cursor:pointer;font-size:14.5px;font-family:' + F + ';text-decoration:none;}',
      '.lkd-link .lkd-mini{width:18px;height:18px;}',
      // market card
      '.lkd-thin{max-width:560px;margin:24px auto;background:#fff;border:2px solid #6002EE;border-radius:20px;padding:22px;display:flex;gap:16px;align-items:flex-start;}',
      '.lkd-thin .lkd-mini{width:48px;height:48px;flex:none;}',
      '.lkd-thin-b{display:flex;flex-direction:column;gap:8px;min-width:0;}',
      '.lkd-thin-b b{font-size:18px;line-height:1.3;color:#1A1829;}',
      '.lkd-thin-b p{margin:0 0 6px;font-size:15px;color:#4A4761;}',
      '.lkd-thin .lkd-btn{align-self:flex-start;}',
      '@media (max-width:520px){.lkd-thin{flex-direction:column;margin:20px 0;}.lkd-thin .lkd-btn{width:100%;}}',
      // sheet
      '.lkd-sheet{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(75,2,187,.28);}',
      '.lkd-card{width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:24px;padding:22px 20px 20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 24px 60px rgba(75,2,187,.25);color:#1A1829;}',
      '@media (max-width:560px){.lkd-sheet{align-items:flex-end;padding:0;}.lkd-card{border-radius:24px 24px 0 0;max-height:92vh;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));}}',
      '.lkd-head{display:flex;align-items:center;gap:12px;}',
      '.lkd-head .lkd-mini{width:40px;height:40px;flex:none;}',
      '.lkd-head h3{margin:0;font-size:19px;font-weight:800;line-height:1.2;flex:1;}',
      '.lkd-x{border:0;background:#F3EBFF;color:#4B02BB;width:36px;height:36px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer;flex:none;}',
      '.lkd-q{display:flex;flex-direction:column;gap:7px;border:0;margin:0;padding:0;min-width:0;}',
      '.lkd-q > span,.lkd-q legend{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6E6A85;padding:0;margin-bottom:7px;}',
      '.lkd-q textarea,.lkd-q select{width:100%;border:1.5px solid #E2D4FF;border-radius:12px;padding:10px 12px;font-size:16px;font-family:' + F + ';color:#1A1829;background:#F7F6FC;resize:vertical;}',
      '.lkd-q textarea{min-height:76px;}',
      '.lkd-q textarea:focus,.lkd-q select:focus{outline:2px solid #6002EE;outline-offset:1px;border-color:#6002EE;}',
      '.lkd-chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.lkd-chip{border:1px solid #E2D4FF;background:#F3EBFF;color:#4B02BB;border-radius:999px;padding:8px 13px;font-size:14px;font-weight:700;cursor:pointer;min-height:38px;font-family:' + F + ';}',
      '.lkd-chip[aria-pressed="true"]{background:#6002EE;color:#fff;border-color:#6002EE;}',
      '.lkd-card .lkd-btn{width:100%;}',
      '.lkd-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;color:#6E6A85;flex-wrap:wrap;}',
      '.lkd-lang{display:inline-flex;gap:2px;background:#F3EBFF;border-radius:999px;padding:3px;}',
      '.lkd-lang button{border:0;background:transparent;color:#4B02BB;font-weight:800;font-size:12.5px;padding:5px 11px;border-radius:999px;cursor:pointer;font-family:' + F + ';}',
      '.lkd-lang button[aria-pressed="true"]{background:#6002EE;color:#fff;}',
      '.lkd-after{font-size:13px;color:#4A4761;margin:0;}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'lkd-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- helpers ---------------------------------------------------------------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function track(where) {
    try { if (window.gtag) window.gtag('event', 'desk_ring', { desk_place: where, desk_lang: lang }); } catch (e) {}
  }
  function ringButton(where, extraCls) {
    var b = el('button', 'lkd-btn ' + (extraCls || ''));
    b.type = 'button';
    b.appendChild(miniDial());
    b.appendChild(document.createTextNode(t('ring')));
    b.addEventListener('click', function () { openSheet(where, b); });
    return b;
  }
  function openLine() {
    var s = el('span', 'lkd-open' + (hoursState() === 'open' ? '' : ' lkd-closed'));
    s.appendChild(el('i'));
    s.appendChild(document.createTextNode(hoursText()));
    return s;
  }

  function humanLine(text, cls) {
    var p = el('p', 'lkd-human ' + (cls || ''));
    var ic = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    svg('circle', { cx: 12, cy: 8, r: 4, fill: 'currentColor' }, ic);
    svg('path', { d: 'M4 20c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5z', fill: 'currentColor' }, ic);
    p.appendChild(ic);
    p.appendChild(document.createTextNode(text));
    return p;
  }

  // ---- ringing -------------------------------------------------------------
  // F 2026-11-10 "make it jiggle like it's ringing": two short rings (handset
  // lifts and rattles, sound waves pulse) when the phone scrolls into view,
  // then every 7 s while it stays in view, at most 5 times a visit; also on
  // hover / keyboard focus. Nothing moves under prefers-reduced-motion.
  var REDUCE = false;
  try { REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function ring(node) {
    if (REDUCE || !node || node.__lkdRinging) return;
    node.__lkdRinging = true;
    node.classList.remove('lkd-ringing');
    void node.offsetWidth;
    node.classList.add('lkd-ringing');
    setTimeout(function () { node.classList.remove('lkd-ringing'); node.__lkdRinging = false; }, 1500);
  }
  function autoRing(node) {
    if (REDUCE || !('IntersectionObserver' in window)) return;
    var count = 0, timer = null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        clearInterval(timer);
        if (!e.isIntersecting || count >= 5) return;
        setTimeout(function () { ring(node); count++; }, 400);
        timer = setInterval(function () {
          if (count >= 5 || document.hidden) { if (count >= 5) clearInterval(timer); return; }
          ring(node); count++;
        }, 7000);
      });
    }, { threshold: 0.45 });
    io.observe(node);
  }

  // ---- the sheet -------------------------------------------------------------
  var sheetPrefill = '';
  function openSheet(where, opener) {
    injectStyle();
    var old = document.querySelector('.lkd-sheet');
    if (old) old.parentNode.removeChild(old);

    var when = null;
    var savedArea = store(AREA_KEY);
    var draft = { need: sheetPrefill, area: '' };
    AREAS.forEach(function (a) { if (savedArea && String(savedArea) === a.id) draft.area = a.name; });

    var wrap = el('div', 'lkd-sheet');
    var card = el('div', 'lkd-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'lkd-title');
    wrap.appendChild(card);

    function build() {
      card.textContent = '';
      var head = el('div', 'lkd-head');
      head.appendChild(miniDial());
      var h = el('h3', null, t('sheetTitle')); h.id = 'lkd-title';
      head.appendChild(h);
      var x = el('button', 'lkd-x', '×'); x.type = 'button'; x.setAttribute('aria-label', t('close'));
      x.addEventListener('click', close);
      head.appendChild(x);
      card.appendChild(head);

      var q1 = el('label', 'lkd-q');
      q1.appendChild(el('span', null, t('qNeed')));
      var ta = el('textarea'); ta.id = 'lkd-need'; ta.maxLength = 500; ta.placeholder = t('needPh'); ta.value = draft.need;
      ta.addEventListener('input', function () { draft.need = ta.value; refresh(); });
      q1.appendChild(ta);
      card.appendChild(q1);

      var q2 = el('fieldset', 'lkd-q');
      q2.appendChild(el('legend', null, t('qWhen')));
      var chips = el('div', 'lkd-chips');
      t('when').forEach(function (label, i) {
        var c = el('button', 'lkd-chip', label); c.type = 'button';
        c.setAttribute('aria-pressed', when === i ? 'true' : 'false');
        c.addEventListener('click', function () {
          when = when === i ? null : i;
          Array.prototype.forEach.call(chips.children, function (k, j) { k.setAttribute('aria-pressed', when === j ? 'true' : 'false'); });
          refresh();
        });
        chips.appendChild(c);
      });
      q2.appendChild(chips);
      card.appendChild(q2);

      var q3 = el('label', 'lkd-q');
      q3.appendChild(el('span', null, t('qWhere')));
      var sel = el('select'); sel.id = 'lkd-where';
      var o0 = el('option', null, t('pick')); o0.value = ''; sel.appendChild(o0);
      AREAS.forEach(function (a) { var o = el('option', null, a.name); o.value = a.name; sel.appendChild(o); });
      var oo = el('option', null, t('somewhere')); oo.value = '_other'; sel.appendChild(oo);
      sel.value = draft.area;
      sel.addEventListener('change', function () { draft.area = sel.value; refresh(); });
      q3.appendChild(sel);
      card.appendChild(q3);

      var go = el('a', 'lkd-btn');
      go.target = '_blank';
      go.rel = 'noopener';
      go.appendChild(miniDial());
      go.appendChild(document.createTextNode(t('send')));
      go.addEventListener('click', function () { track(where); setTimeout(close, 300); });
      card.appendChild(go);

      if (hoursState() !== 'open') card.appendChild(el('p', 'lkd-after', t('afterHours')));

      card.appendChild(humanLine(t('humanSheet'), 'lkd-human-sm'));
      var foot = el('div', 'lkd-foot');
      foot.appendChild(el('span', null, t('privacy')));
      var lg = el('div', 'lkd-lang'); lg.setAttribute('role', 'group'); lg.setAttribute('aria-label', 'Language / Idioma');
      [['en', 'EN'], ['es', 'ES']].forEach(function (p) {
        var b = el('button', null, p[1]); b.type = 'button';
        b.setAttribute('aria-pressed', lang === p[0] ? 'true' : 'false');
        b.setAttribute('lang', p[0]);
        b.addEventListener('click', function () {
          if (lang === p[0]) return;
          lang = p[0]; store(LANG_KEY, lang);
          build(); repaintPage();
          var f = card.querySelector('.lkd-lang [aria-pressed="true"]'); if (f) f.focus();
        });
        lg.appendChild(b);
      });
      foot.appendChild(lg);
      card.appendChild(foot);

      function refresh() {
        var lines = [];
        var need = String(draft.need || '').trim();
        var area = draft.area === '_other' ? '' : draft.area;
        if (!need && when == null && !area) {
          lines.push(t('msgBlank'));
        } else {
          lines.push(t('msgHead'));
          if (need) lines.push(t('msgNeed') + ': ' + need);
          if (when != null) lines.push(t('msgWhen') + ': ' + t('when')[when]);
          if (area) lines.push(t('msgWhere') + ': ' + area);
        }
        go.href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
      }
      refresh();
      return ta;
    }

    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      var f = card.querySelectorAll('button, a[href], textarea, select');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.documentElement.style.overflow = prevOverflow;
      if (opener && opener.focus) try { opener.focus(); } catch (e) {}
    }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey, true);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    var ta = build();
    document.body.appendChild(wrap);
    try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
  }

  // ---- homepage --------------------------------------------------------------
  function buildSection() {
    var sec = el('section', 'lkd lkd-sec');
    sec.id = 'lokali-desk';
    sec.setAttribute('aria-labelledby', 'lkd-h');
    var inner = el('div', 'lkd-sec-in');
    var art = el('div', 'lkd-art');
    art.appendChild(bigPhone());
    inner.appendChild(art);
    var copy = el('div', 'lkd-copy');
    copy.appendChild(el('p', 'lkd-hello', t('hello')));
    var h = el('h2', null, t('title')); h.id = 'lkd-h';
    copy.appendChild(h);
    copy.appendChild(el('p', 'lkd-lede', t('lede')));
    var row = el('div', 'lkd-row');
    var b = ringButton('home');
    row.appendChild(b);
    row.appendChild(openLine());
    copy.appendChild(row);
    copy.appendChild(humanLine(t('human')));
    var cnt = el('div', 'lkd-count');
    if (DESK_CONNECTED > COUNTER_MIN) {
      var c1 = el('div'); c1.appendChild(el('b', null, String(DESK_CONNECTED))); c1.appendChild(el('span', null, t('connected'))); cnt.appendChild(c1);
    }
    var c2 = el('div'); c2.appendChild(el('b', null, t('oneDay'))); c2.appendChild(el('span', null, t('wait'))); cnt.appendChild(c2);
    var c3 = el('div'); c3.appendChild(el('b', null, t('si'))); c3.appendChild(el('span', null, t('spanish'))); cnt.appendChild(c3);
    copy.appendChild(cnt);
    inner.appendChild(copy);
    sec.appendChild(inner);
    [art, b].forEach(function (n) {
      n.addEventListener('mouseenter', function () { sec.classList.add('lkd-dialing'); ring(sec); });
      n.addEventListener('mouseleave', function () { sec.classList.remove('lkd-dialing'); });
    });
    b.addEventListener('focus', function () { sec.classList.add('lkd-dialing'); ring(sec); });
    b.addEventListener('blur', function () { sec.classList.remove('lkd-dialing'); });
    autoRing(sec);
    return sec;
  }
  function buildNudge() {
    var p = el('p', 'lkd lkd-nudge');
    p.id = 'lkd-nudge';
    p.appendChild(document.createTextNode(t('nudge') + ' '));
    var a = el('button', 'lkd-link');
    a.type = 'button';
    a.appendChild(miniDial());
    a.appendChild(document.createTextNode(t('ring')));
    a.addEventListener('click', function () {
      var inp = document.querySelector('#lok-hs input[name="q"]');
      sheetPrefill = inp ? String(inp.value || '').trim() : '';
      openSheet('home-search', a);
    });
    p.appendChild(a);
    return p;
  }
  function mountHome() {
    var cats = document.getElementById('lok-cats');
    if (cats && !document.getElementById('lokali-desk')) cats.parentNode.insertBefore(buildSection(), cats.nextSibling);
    var hs = document.getElementById('lok-hs');
    if (hs && !document.getElementById('lkd-nudge')) hs.parentNode.insertBefore(buildNudge(), hs.nextSibling);
    return !!(document.getElementById('lokali-desk') && document.getElementById('lkd-nudge'));
  }

  // ---- The Market ------------------------------------------------------------
  function marketTerm() {
    var inp = document.getElementById('browse-search');
    if (!inp) {
      var hosts = document.querySelectorAll('[class*="code-island"], [data-code-island], .w-embed');
      for (var i = 0; i < hosts.length && !inp; i++) {
        var r = hosts[i].shadowRoot;
        if (r) inp = r.getElementById ? r.getElementById('browse-search') : r.querySelector('#browse-search');
      }
    }
    var v = inp && inp.value ? String(inp.value).trim() : '';
    if (!v) { try { v = (new URLSearchParams(location.search).get('q') || '').trim(); } catch (e) {} }
    return v.slice(0, 200);
  }
  var thinCard = null, seenCards = false;
  function buildThin() {
    var box = el('div', 'lkd lkd-thin');
    box.id = 'lkd-thin';
    box.appendChild(miniDial());
    var b = el('div', 'lkd-thin-b');
    b.appendChild(el('b', null, t('thinTitle')));
    b.appendChild(el('p', null, t('thinSub')));
    var btn = el('button', 'lkd-btn');
    btn.type = 'button';
    btn.appendChild(miniDial());
    btn.appendChild(document.createTextNode(t('ring')));
    btn.addEventListener('click', function () { sheetPrefill = marketTerm(); openSheet('market', btn); });
    b.appendChild(btn);
    box.appendChild(b);
    return box;
  }
  function visible(n) { return !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length)); }
  function checkMarket(grid) {
    var cards = grid.querySelectorAll('.vcard');
    var shown = 0;
    for (var i = 0; i < cards.length; i++) if (visible(cards[i])) shown++;
    if (shown > 0) seenCards = true;
    var empty = document.getElementById('browse-empty-state');
    var loaded = seenCards || visible(empty);
    var want = loaded && shown < 3;
    if (want && !thinCard) {
      thinCard = buildThin();
      setTimeout(function () { ring(thinCard); }, 300);
      grid.parentNode.insertBefore(thinCard, grid.nextSibling);
    } else if (!want && thinCard) {
      if (thinCard.parentNode) thinCard.parentNode.removeChild(thinCard);
      thinCard = null;
    }
  }
  function mountMarket() {
    var grid = document.getElementById('browse-vendor-grid');
    if (!grid || grid.__lkd) return !!grid;
    grid.__lkd = true;
    var timer = null;
    var run = function () { clearTimeout(timer); timer = setTimeout(function () { checkMarket(grid); }, 150); };
    new MutationObserver(run).observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    run();
    return true;
  }

  // ---- language repaint (homepage + market pieces follow the sheet switch) ---
  function repaintPage() {
    var s = document.getElementById('lokali-desk');
    if (s) s.parentNode.replaceChild(buildSection(), s);
    var n = document.getElementById('lkd-nudge');
    if (n) n.parentNode.replaceChild(buildNudge(), n);
    if (thinCard && thinCard.parentNode) { var fresh = buildThin(); thinCard.parentNode.replaceChild(fresh, thinCard); thinCard = fresh; }
  }

  // ---- [data-lokali-desk] hooks ---------------------------------------------
  document.addEventListener('click', function (e) {
    var hook = e.target && e.target.closest ? e.target.closest('[data-lokali-desk]') : null;
    if (!hook) return;
    e.preventDefault();
    sheetPrefill = '';
    openSheet(hook.getAttribute('data-lokali-desk') || 'hook', hook);
  });

  // ---- boot --------------------------------------------------------------------
  // lokali-home.js and lokali-browse.js build their anchors after load, so watch
  // the page for up to 15 seconds instead of assuming an order.
  function start() {
    var home = !!document.querySelector('.wi-section') || !!document.getElementById('lok-hs');
    var market = !!document.getElementById('browse-vendor-grid') || /^\/the-market/.test(location.pathname);
    if (!home && !market) return;
    injectStyle();
    var tries = 0;
    var tick = function () {
      var ok = true;
      if (home) ok = mountHome() && ok;
      if (market) ok = mountMarket() && ok;
      if (!ok && ++tries < 60) setTimeout(tick, 250);
    };
    tick();
  }
  window.LokaliDesk = { open: function (where) { sheetPrefill = ''; openSheet(where || 'api', null); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
