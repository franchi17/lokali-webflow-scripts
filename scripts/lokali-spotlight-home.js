/**
 * Lokali — Homepage "Meet the vendor" Spotlight surface (#88 Tier 2).
 *
 * Renders up to 3 currently-ACTIVE homepage-tier Spotlight bookings as
 * personal cards after the "How It Works" section (`.section-3`). Data =
 * the anon `spotlight_homepage()` RPC (security definer; only publish-ready,
 * active+approved vendors with the Meet-the-Vendor fields — enforced at
 * booking time by the MtV hard gate).
 *
 * Empty pre-launch by design (NO comped spotlights — fairness decision
 * 2026-07-20): when the RPC returns [], nothing is injected and the homepage
 * looks exactly as it does today. The section only exists while someone has
 * paid for it.
 *
 * SAFETY: owner_name / owner_bio / business_name are VENDOR-AUTHORED — all
 * text lands via textContent (no innerHTML interpolation).
 *
 * Loads on the homepage via a Webflow-registered hosted script (@v1.4
 * floating). Requires lokali-supabase-client.js (site-wide) for
 * window.LokaliSupabaseReady. Keep this file byte-identical in scripts/ and
 * lokali-webflow-scripts/scripts/.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lok-sh-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.lok-sh{font-family:"Plus Jakarta Sans",sans-serif;padding:56px 20px;background:#FBFAFE;}' +
      '.lok-sh-inner{max-width:1060px;margin:0 auto;}' +
      '.lok-sh-kicker{font-size:12px;font-weight:700;letter-spacing:.14em;color:#9B8BE0;text-transform:uppercase;text-align:center;}' +
      '.lok-sh-title{font-size:30px;font-weight:700;color:#231D3F;text-align:center;margin:6px 0 4px;}' +
      '.lok-sh-sub{font-size:15px;color:#6B6580;text-align:center;margin:0 0 30px;}' +
      '.lok-sh-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}' +
      '@media(max-width:900px){.lok-sh-grid{grid-template-columns:1fr;max-width:460px;margin:0 auto;}}' +
      '.lok-sh-card{background:#fff;border:1.5px solid #ECE8F8;border-radius:18px;padding:26px 24px 24px;' +
        'box-shadow:0 12px 30px rgba(60,47,110,.07);display:flex;flex-direction:column;align-items:center;text-align:center;}' +
      '.lok-sh-photo{width:92px;height:92px;border-radius:50%;object-fit:cover;' +
        'border:3px solid #ECE8F8;box-shadow:0 6px 16px rgba(60,47,110,.12);}' +
      '.lok-sh-name{font-size:17px;font-weight:700;color:#231D3F;margin-top:12px;}' +
      '.lok-sh-biz{font-size:13.5px;font-weight:600;color:#5A4BB8;margin-top:2px;}' +
      '.lok-sh-cat{display:inline-block;background:#F5F2FC;color:#6d5bd0;border-radius:999px;' +
        'padding:3px 12px;font-size:11.5px;font-weight:700;margin-top:8px;}' +
      '.lok-sh-bio{font-size:13.5px;line-height:1.6;color:#6B6580;margin:12px 0 16px;' +
        'display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}' +
      '.lok-sh-cta{margin-top:auto;display:inline-block;border-radius:999px;padding:9px 22px;' +
        'font-size:14px;font-weight:600;color:#fff;background:#6d5bd0;text-decoration:none;line-height:1.2;}' +
      '.lok-sh-cta:hover{background:#5d4bc0;}' +
      '.lok-sh-badge{font-size:11px;font-weight:700;color:#EBA97D;letter-spacing:.08em;' +
        'text-transform:uppercase;margin-bottom:10px;}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text; // vendor-authored text stays text
    return n;
  }

  function firstName(name) {
    var s = String(name || '').trim();
    return s ? s.split(/\s+/)[0] : '';
  }

  function buildCard(v) {
    var card = el('div', 'lok-sh-card');
    card.appendChild(el('div', 'lok-sh-badge', '✦ Spotlight'));

    if (v.owner_photo) {
      var img = el('img', 'lok-sh-photo');
      img.src = v.owner_photo;
      img.alt = v.owner_name ? ('Photo of ' + v.owner_name) : 'Vendor photo';
      img.loading = 'lazy';
      card.appendChild(img);
    }
    card.appendChild(el('div', 'lok-sh-name', v.owner_name || ''));
    card.appendChild(el('div', 'lok-sh-biz', v.business_name || ''));
    if (v.category) card.appendChild(el('span', 'lok-sh-cat', v.category));
    if (v.owner_bio) card.appendChild(el('p', 'lok-sh-bio', v.owner_bio));

    if (v.slug) {
      var cta = el('a', 'lok-sh-cta',
        firstName(v.owner_name) ? ('Meet ' + firstName(v.owner_name)) : 'Visit their storefront');
      cta.href = '/' + encodeURIComponent(v.slug);
      card.appendChild(cta);
    }
    return card;
  }

  function render(cards) {
    var anchor = document.querySelector('.section-3');
    if (!anchor || document.getElementById('lok-sh')) return;
    injectStyle();

    var sec = el('section', 'lok-sh');
    sec.id = 'lok-sh';
    var inner = el('div', 'lok-sh-inner');
    inner.appendChild(el('div', 'lok-sh-kicker', 'In the spotlight'));
    inner.appendChild(el('h2', 'lok-sh-title', 'Meet the vendors'));
    inner.appendChild(el('p', 'lok-sh-sub', 'The people behind your local favorites.'));
    var grid = el('div', 'lok-sh-grid');
    cards.forEach(function (v) { grid.appendChild(buildCard(v)); });
    inner.appendChild(grid);
    sec.appendChild(inner);
    anchor.insertAdjacentElement('afterend', sec);
  }

  function start() {
    // Homepage only (the script is page-registered, but belt-and-braces).
    if (window.location.pathname !== '/' && window.location.pathname !== '') return;
    if (!window.LokaliSupabaseReady || !window.LokaliSupabaseReady.then) return;
    window.LokaliSupabaseReady.then(function (c) {
      return c.rpc('spotlight_homepage');
    }).then(function (res) {
      var rows = (res && res.data) || [];
      if (res && res.error) throw res.error;
      if (!Array.isArray(rows) || !rows.length) return; // empty pre-launch → no section
      render(rows.slice(0, 3));
    }).catch(function (err) {
      console.warn('[lokali-spotlight-home] skipped', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
