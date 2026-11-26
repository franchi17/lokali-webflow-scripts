/**
 * Lokali — For vendors page v2 (2026-11 site-consistency pass, F said
 * "Yes" to mockup v23, claude.ai/artifact/Why9i9icbjoqL6crm9baJL, 2026-11-22).
 *
 * Restyles the page's own `.lkft` HTML embed (Designer) without touching it.
 * Every heading and paragraph is the page's own text; only the photos, the
 * "what business owners tell us" column and a few labels are new.
 *   - Top: a magazine spread. White text half (small spaced label, Extra Bold
 *     headline with the second line in deep blue, a thin rule, the lede, the
 *     button) beside one large photo of a neighbor's work running to the page
 *     edge: The OG Pour (F: "Their photos are amazing").
 *   - A gallery row: Fern Home and Fashion, Paperloom, Madrone Painting.
 *   - "You started a business, not a second job on social media.": what
 *     owners tell us next to what Lokali does (the three old hero cards).
 *   - Everything your storefront needs: a clean list with plan labels.
 *   - The comparison table, then the ending band in deep blue.
 *   - Plan prices are hidden here; they live on /pricing only.
 * Colors follow docs/design/brand-guide.html: For vendors is a SKY page, so
 * sky does every job (#E6EFFB ground, #1D4E9E words and buttons). No violet
 * inside the page (violet stays in the header), no orange.
 *
 * Deploy: Webflow REGISTERED script (`lokaliforvendors`, page-level on
 * /for-vendors). A version bump is a re-register with the new @1.4.N URL +
 * SRI hash. Keep this file byte-identical in scripts/ and
 * lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-fv-style';
  var MEDIA = 'https://api.golokali.com/storage/v1/object/public/vendor-media/';
  var HERO = { img: MEDIA + '722/service/mvprf9fv58986u.jpg', slug: 'the-og-pour-mobile-bar', biz: 'The OG Pour Mobile Bar', alt: 'A cocktail being stirred at an event by The OG Pour Mobile Bar' };
  // Fern's photo carries black bars above and below; the square crop keeps them out.
  var GALLERY = [
    { img: MEDIA + '684/portfolio/mv8jcsjiw4agpg.webp', slug: 'fern-home-and-fashion', biz: 'Fern Home and Fashion', alt: 'Three geode necklaces on stone by Fern Home and Fashion', pos: '50% 50%' },
    { img: MEDIA + '146/portfolio/mtk9vu1ymz5oaz.webp', slug: 'paperloom', biz: 'Paperloom', alt: 'A wedding menu card on a green plate by Paperloom', pos: '50% 50%' },
    { img: MEDIA + '431/portfolio/mu04x225y7tz1w.webp', slug: 'madrone-painting-llc', biz: 'Madrone Painting', alt: 'A dining room painted by Madrone Painting', pos: '55% 50%' }
  ];
  // What vendors say about the big platforms (voice-of-customer research,
  // docs/marketing/voice-of-customer-reddit-facebook-2026-10.md section 1).
  var TELL = [
    ['"Views dropped overnight, and nobody will say why."', 'Makers on big marketplaces'],
    ['"Does anyone else gasp at the fees?"', 'Every seller forum, every month'],
    ['"Paid for leads. Not one was real."', 'Service pros on pay-per-lead sites']
  ];

  var C = { ink: '#45415A', body: '#4A4761', mute: '#6E6A85', sk: '#E6EFFB', sd: '#1D4E9E', sdk: '#163E7E', line: '#C9DAF2' };
  var F = '"Plus Jakarta Sans",sans-serif';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // one family: sky. Buttons, links, labels and the headline's second line.
      '.lkft{color:' + C.ink + '!important;}' +
      '.lkft h1,.lkft h2,.lkft h3{color:' + C.ink + '!important;}' +
      '.lkft .lkft-eb{display:none!important;}' + // no eyebrow (F 2026-11-25: a label on top of every section reads as machine-made)
      '.lkft .lkft-btn{background:' + C.sd + '!important;color:#fff!important;font-weight:800!important;}' +
      '.lkft .lkft-btn:hover{background:' + C.sdk + '!important;}' +
      '.lkft .lkft-ul{color:' + C.sd + '!important;}' +
      '.lkft .lkft-ico{background:' + C.sk + '!important;color:' + C.sd + '!important;}' +
      '.lkft .lkft-copy,.lkft .lkft-sechead p,.lkft .lkft-card p,.lkft .lkft-news p,.lkft .lkft-lede{color:' + C.body + '!important;}' +
      // the top: magazine spread
      '.lkft .lkft-hero.lok-fv-hero{background:#fff!important;padding:0!important;border-bottom:1px solid ' + C.sk + ';}' +
      '.lok-fv-spread{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:640px;}' +
      '.lok-fv-txt{padding:88px 56px 72px max(40px,calc((100vw - 1240px)/2 + 40px));display:flex;flex-direction:column;justify-content:center;}' +
      '.lkft .lok-fv-txt h1{font-size:54px!important;line-height:1.04!important;font-weight:800!important;letter-spacing:-.035em!important;margin:22px 0 0!important;}' +
      '.lkft .lok-fv-txt h1 .v{color:' + C.sd + '!important;}' +
      '.lok-fv-rule{display:block;width:56px;height:1px;background:' + C.sd + ';margin:32px 0 24px;}' +
      '.lkft .lok-fv-txt .lkft-lede{margin-top:0!important;font-size:17px!important;line-height:1.75!important;max-width:30em;}' +
      '.lok-fv-small{margin:16px 0 0!important;font:400 13px/1.5 ' + F + ';color:' + C.mute + ';}' +
      '.lok-fv-ph{margin:0;position:relative;overflow:hidden;background:#1b1b1b;min-height:420px;}' +
      '.lok-fv-ph a{position:absolute;inset:0;display:block;}' +
      '.lok-fv-ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%;display:block;}' +
      '.lok-fv-ph figcaption{text-align:left;position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;gap:12px;padding:18px 24px;background:linear-gradient(transparent,rgba(20,18,16,.45));color:#fff;font:600 10.5px/1.4 ' + F + ';letter-spacing:.2em;text-transform:uppercase;}' +
      // the gallery row
      '.lok-fv-gal{padding:72px 0 8px;background:#fff;}' +
      '.lok-fv-k{margin:0 0 18px!important;font:700 11px/1.3 ' + F + ';letter-spacing:.32em;text-transform:uppercase;color:' + C.sd + ';}' +
      '.lok-fv-row{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:end;}' +
      '.lok-fv-row figure{margin:0;}' +
      '.lok-fv-row a{display:block;text-decoration:none!important;color:inherit;}' +
      '.lok-fv-row img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;}' +
      '.lok-fv-row figure:first-child img{aspect-ratio:1/1;}' +
      '.lok-fv-row figcaption{text-align:left!important;margin-top:10px;padding-top:8px;border-top:1px solid ' + C.line + ';font:600 10.5px/1.4 ' + F + ';letter-spacing:.18em;text-transform:uppercase;color:' + C.body + ';}' +
      '.lok-fv-row a:hover figcaption{color:' + C.sd + ';}' +
      // what owners tell us / on Lokali
      '.lok-fv-why{padding:80px 0 24px;background:#fff;}' +
      '.lkft .lok-fv-why h2{max-width:16em;}' +
      '.lok-fv-sub{margin:12px 0 0!important;font:400 17px/1.6 ' + F + ';color:' + C.body + ';}' +
      '.lok-vs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:32px;border:1px solid ' + C.line + ';border-radius:20px;overflow:hidden;}' +
      '.lok-vs>div{padding:28px 30px;}' +
      '.lok-vs .lok-no{background:#F7F9FC;}' +
      '.lok-vs h4{margin:0 0 14px!important;font:700 11px/1.3 ' + F + ';letter-spacing:.16em;text-transform:uppercase;color:' + C.mute + ';}' +
      '.lok-vs .lok-yes h4{color:' + C.sd + ';}' +
      '.lok-vs ul{list-style:none!important;margin:0!important;padding:0!important;display:grid;gap:16px;}' +
      '.lok-vs li{margin:0!important;padding:0!important;}' +
      '.lok-vs .lok-no li{font:italic 400 16px/1.5 ' + F + ';color:' + C.body + ';}' +
      '.lok-vs .lok-no li small{display:block;font-style:normal;font-size:12.5px;color:' + C.mute + ';margin-top:3px;}' +
      '.lok-vs .lok-yes li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;font:400 15px/1.55 ' + F + ';color:' + C.body + ';}' +
      '.lok-vs .lok-yes li::before{content:"\\2713";color:' + C.sd + ';font-weight:800;}' +
      '.lok-vs .lok-yes li b{display:block;font-weight:800;color:' + C.ink + ';}' +
      // everything your storefront needs: a clean list
      '.lkft .lkft-sec-lav{background:#fff!important;}' +
      '.lkft .lkft-cards{gap:0!important;border-top:1px solid ' + C.line + ';}' +
      '.lkft .lkft-card{background:transparent!important;border:0!important;border-bottom:1px solid ' + C.line + '!important;border-radius:0!important;box-shadow:none!important;padding:26px 28px 26px 0!important;}' +
      '.lkft .lkft-tag{background:transparent!important;color:' + C.sd + '!important;padding:0!important;font:800 11px/1.4 ' + F + '!important;letter-spacing:.1em;text-transform:uppercase;border:0!important;}' +
      '.lkft .lkft-news{background:' + C.sk + '!important;border:0!important;box-shadow:none!important;}' +
      // comparison table in sky
      '.lkft .lkft-cmp .lk{background:' + C.sk + '!important;color:' + C.sd + '!important;}' +
      '.lkft .lkft-cmp td:nth-child(2){background:' + C.sk + '!important;}' +
      '.lkft .lkft-cmp .y{color:' + C.sd + '!important;}' +
      // plan prices live on /pricing only
      '.lkft #plans{display:none!important;}' +
      // the ending band: deep blue
      '.lkft .lkft-ctab{background:' + C.sd + '!important;}' +
      // closing band = rounded card like Pricing (F 2026-11-25 'Yes, as drawn')
      '.lkft .lkft-ctab{border-radius:26px!important;max-width:1160px!important;width:calc(100% - 48px)!important;margin:0 auto 64px!important;padding:48px 40px!important;box-sizing:border-box!important;text-align:center!important;}' +
      '.lkft .lkft-ctab h2{font-size:38px!important;line-height:1.1!important;letter-spacing:-.025em!important;}' +
      '@media(max-width:767px){.lkft .lkft-ctab{width:calc(100% - 32px)!important;border-radius:20px!important;padding:36px 20px!important;margin-bottom:48px!important;}.lkft .lkft-ctab h2{font-size:30px!important;}}' +
      '.lkft .lkft-ctab h2{color:#fff!important;}' +
      '.lkft .lkft-ctab p,.lkft .lkft-ctab small{color:#D7E6F8!important;}' +
      '.lkft .lkft-ctab .lkft-btn{background:#fff!important;color:' + C.sd + '!important;}' +
      '.lkft .lkft-ctab .lkft-btn:hover{background:' + C.sk + '!important;}' +
      '.lok-fv-ghost{display:inline-flex;align-items:center;justify-content:center;margin-left:12px;border:2px solid #fff;color:#fff!important;font:800 15.5px/1.2 ' + F + ';border-radius:999px;padding:14px 26px;text-decoration:none!important;}' +
      '.lok-fv-ghost:hover{background:rgba(255,255,255,.12);}' +
      // responsive
      '@media(max-width:991px){.lok-fv-spread{grid-template-columns:1fr;min-height:0;}.lok-fv-ph{order:-1;aspect-ratio:4/5;min-height:0;}' +
        '.lok-fv-txt{padding:44px 24px 48px;}.lkft .lok-fv-txt h1{font-size:40px!important;}.lok-vs{grid-template-columns:1fr;}}' +
      '@media(max-width:767px){.lok-fv-ph{aspect-ratio:1/1;}.lok-fv-ph figcaption{flex-direction:column;gap:2px;font-size:10px;padding:14px 16px;}' +
        '.lok-fv-txt{padding:36px 16px 40px;}.lkft .lok-fv-txt h1{font-size:36px!important;}' +
        '.lok-fv-gal{padding-top:48px;}.lok-fv-row{grid-template-columns:1fr 1fr;gap:12px;}.lok-fv-row figure:first-child{grid-column:1/-1;}' +
        '.lok-fv-why{padding-top:56px;}.lok-vs>div{padding:22px 20px;}.lok-fv-ghost{margin:12px 0 0;width:100%;}.lkft .lkft-ctab .lkft-btn{width:100%;}' +
        '.lkft .lkft-card{padding:22px 0!important;}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function vendorHref(slug) { return '/' + encodeURIComponent(slug); }
  function img(src, alt, pos, w) {
    var i = el('img');
    i.alt = alt || '';
    i.decoding = 'async';
    if (pos) i.style.objectPosition = pos;
    var I = window.LokaliImg;
    if (I && typeof I.set === 'function') I.set(i, src, w); else i.src = src;
    return i;
  }

  function buildHero(root) {
    var hero = root.querySelector('.lkft-hero');
    if (!hero) return null;
    var two = hero.querySelector('.lkft-two');
    var txt = two && two.firstElementChild;
    var cards = hero.querySelector('.lkft-why-cards');
    if (!txt) return null;
    hero.classList.add('lok-fv-hero');
    var spread = el('div', 'lok-fv-spread');
    txt.className = 'lok-fv-txt';
    var h1 = txt.querySelector('h1'), lede = txt.querySelector('.lkft-lede');
    if (h1) h1.insertAdjacentElement('afterend', el('span', 'lok-fv-rule'));
    var acts = txt.querySelector('.lkft-acts');
    if (acts) acts.insertAdjacentElement('afterend', el('p', 'lok-fv-small', "Nobody is billed until there are enough shoppers, and you'll get a month's notice first."));
    if (lede) lede.removeAttribute('style');
    spread.appendChild(txt);
    var fig = el('figure', 'lok-fv-ph');
    var a = el('a');
    a.href = vendorHref(HERO.slug);
    a.setAttribute('aria-label', 'Visit ' + HERO.biz + "'s storefront");
    a.appendChild(img(HERO.img, HERO.alt, null, 1100));
    var cap = el('figcaption');
    cap.appendChild(el('span', null, HERO.biz));
    cap.appendChild(el('span', null, 'From their storefront on Lokali'));
    a.appendChild(cap);
    fig.appendChild(a);
    spread.appendChild(fig);
    hero.textContent = '';
    hero.appendChild(spread);
    return cards;
  }

  function buildGallery(after) {
    var sec = el('section', 'lok-fv-gal');
    var wrap = el('div', 'lkft-wrap');
    wrap.appendChild(el('p', 'lok-fv-k', 'Work from the neighbors on Lokali'));
    var row = el('div', 'lok-fv-row');
    GALLERY.forEach(function (g) {
      var fig = el('figure'), a = el('a');
      a.href = vendorHref(g.slug);
      a.appendChild(img(g.img, g.alt, g.pos, 700));
      a.appendChild(el('figcaption', null, g.biz));
      fig.appendChild(a);
      row.appendChild(fig);
    });
    wrap.appendChild(row);
    sec.appendChild(wrap);
    after.insertAdjacentElement('afterend', sec);
    return sec;
  }

  function buildWhy(after, cards) {
    var sec = el('section', 'lok-fv-why');
    var wrap = el('div', 'lkft-wrap');
    wrap.appendChild(el('h2', null, 'You started a business, not a second job on social media.'));
    wrap.appendChild(el('p', 'lok-fv-sub', "Most good businesses still grow by word of mouth. It works, slowly. Here's what changes."));
    var vs = el('div', 'lok-vs');
    var no = el('div', 'lok-no');
    no.appendChild(el('h4', null, 'What business owners tell us'));
    var ul = el('ul');
    TELL.forEach(function (t) { var li = el('li', null, t[0]); li.appendChild(el('small', null, t[1])); ul.appendChild(li); });
    no.appendChild(ul);
    vs.appendChild(no);
    var yes = el('div', 'lok-yes');
    yes.appendChild(el('h4', null, 'On Lokali'));
    var ul2 = el('ul');
    // The three hero cards, moved here word for word (their text stays the page's own).
    var items = cards ? cards.querySelectorAll('.lkft-why-card > div') : [];
    for (var i = 0; i < items.length; i++) {
      var li = el('li'), box = el('div');
      var b = items[i].querySelector('b'), sp = items[i].querySelector('span');
      if (b) box.appendChild(b);
      if (sp) { sp.removeAttribute('class'); box.appendChild(sp); }
      li.appendChild(box);
      ul2.appendChild(li);
    }
    yes.appendChild(ul2);
    vs.appendChild(yes);
    wrap.appendChild(vs);
    sec.appendChild(wrap);
    after.insertAdjacentElement('afterend', sec);
    return sec;
  }

  function start() {
    var root = document.querySelector('.lkft');
    if (!root || root.getAttribute('data-lok-fv')) return;
    root.setAttribute('data-lok-fv', '1');
    injectStyle();
    var cards = buildHero(root);
    var hero = root.querySelector('.lkft-hero');
    if (!hero) return;
    var gal = buildGallery(hero);
    var why = buildWhy(gal, cards);
    // Features first, then the comparison table (as in the approved mockup).
    var feats = root.querySelector('.lkft-sec-lav');
    var versus = root.querySelector('#versus');
    if (feats) why.insertAdjacentElement('afterend', feats);
    if (feats && versus) feats.insertAdjacentElement('afterend', versus);
    var cta = root.querySelector('.lkft-ctab .lkft-btn');
    if (cta && !root.querySelector('.lok-fv-ghost')) {
      var g = el('a', 'lok-fv-ghost', 'See pricing');
      g.href = '/pricing';
      cta.insertAdjacentElement('afterend', g);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
