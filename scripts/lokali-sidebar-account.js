/**
 * Lokali — vendor dashboard sidebar account chip.
 *
 * Turns the sidebar's bottom Settings/Logout group into a Claude-style account
 * chip: business name + plan + avatar, click to expand a menu (Settings,
 * Upgrade to Featured [if not top tier], Help, Logout).
 *
 * Load site-wide (footer). No-op anywhere the dashboard sidebar isn't present
 * (guards on `.div-block-29`). Needs window.LokaliAPI (api-client) for vendors.me().
 *
 * It MOVES the existing Settings + Logout <a> nodes into the menu (rather than
 * recreating them) so the Clerk logout handler bound to #button-logout in
 * lokali-clerk-auth.js keeps working. See the maintainer guide for the sidebar.
 */
(function () {
  'use strict';

  var INK = '#1A1829', DUSK = '#4A4761', SLATE = '#8E8BA6',
      VIOLET = '#6002EE', VIOLET_L = '#F3EBFF', ORANGE = '#FF8D00', BORDER = '#EEEDF6';

  var CSS = [
    '#lok-acct{position:relative;width:100%;margin-top:auto;padding-top:10px;}',
    '#lok-acct *{box-sizing:border-box;}',
    '#lok-acct .lok-chip{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:10px;cursor:pointer;border:none;background:none;font-family:inherit;text-align:left;}',
    '#lok-acct .lok-chip:hover{background:' + VIOLET_L + ';}',
    '#lok-acct.open .lok-chip{background:' + VIOLET_L + ';}',
    '#lok-acct .lok-av{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:' + VIOLET + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background-size:cover;background-position:center;}',
    '#lok-acct .lok-meta{flex:1;min-width:0;}',
    '#lok-acct .lok-name{font-size:13px;font-weight:700;color:' + INK + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}',
    '#lok-acct .lok-plan{font-size:11px;color:' + SLATE + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '#lok-acct .lok-caret{flex-shrink:0;color:' + SLATE + ';transition:transform .15s;}',
    '#lok-acct.open .lok-caret{transform:rotate(180deg);}',
    '#lok-acct .lok-menu{position:absolute;left:0;right:0;bottom:calc(100% - 2px);background:#fff;border:0.5px solid ' + BORDER + ';border-radius:12px;box-shadow:0 10px 34px rgba(43,26,74,.14);padding:6px;display:none;z-index:50;}',
    '#lok-acct.open .lok-menu{display:block;}',
    // rows (both moved anchors and new ones get .lok-row)
    '#lok-acct .lok-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:500;color:' + DUSK + ';text-decoration:none;cursor:pointer;background:none;border:none;width:100%;font-family:inherit;text-align:left;margin:0;}',
    '#lok-acct .lok-row:hover{background:' + VIOLET_L + ';color:' + VIOLET + ';}',
    '#lok-acct .lok-row svg{flex-shrink:0;}',
    '#lok-acct .lok-row.is-upgrade{color:' + ORANGE + ';font-weight:600;}',
    '#lok-acct .lok-row.is-upgrade:hover{background:#FFF3E6;color:' + ORANGE + ';}',
    // normalize the moved Settings/Logout anchors (they carry .dashboard-btn)
    '#lok-acct .lok-menu a.dashboard-btn{margin-bottom:0;}',
    '#lok-acct .lok-menu a.dashboard-btn .dashboard-icon{width:16px;height:16px;}',
    '#lok-acct .lok-divider{height:0.5px;background:' + BORDER + ';margin:6px 4px;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-acct-styles')) return;
    var s = document.createElement('style'); s.id = 'lok-acct-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function ic(p) { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }

  function planLabel(v) {
    var p = String((v && (v.plan || v.tier || v.plan_name || v.subscription_tier || v.plan_tier)) || '').toLowerCase();
    if (!p || p === 'free' || p === 'basic') return { label: 'Free plan', top: false };
    if (p.indexOf('featured') >= 0 || p.indexOf('spotlight') >= 0) return { label: 'Featured', top: true };
    if (p.indexOf('pro') >= 0) return { label: 'Pro plan', top: false };
    return { label: p.charAt(0).toUpperCase() + p.slice(1), top: false };
  }
  function initials(name) {
    // only words that start with a letter/number (skip "&", "-", etc.)
    var parts = String(name || '').trim().split(/\s+/).filter(function (p) { return /^[a-z0-9]/i.test(p); });
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function build(bottom, vendor) {
    var anchors = Array.prototype.slice.call(bottom.querySelectorAll('a'));
    var settingsLink = anchors.filter(function (a) { return /\/settings/i.test(a.getAttribute('href') || ''); })[0];
    var logoutLink = document.getElementById('button-logout') ||
      anchors.filter(function (a) { return /logout/i.test(a.textContent || ''); })[0];

    var name = (vendor && (vendor.business_name || vendor.name)) || 'Your business';
    var photo = vendor && (vendor.profile_photo || vendor.photo || vendor.logo);
    var plan = planLabel(vendor);

    var wrap = el('div'); wrap.id = 'lok-acct';
    var menu = el('div', 'lok-menu');

    // Settings (move the real node, add row class)
    if (settingsLink) { settingsLink.classList.add('lok-row'); menu.appendChild(settingsLink); }

    // Upgrade (only if not top tier) — orange accent
    if (!plan.top) {
      var up = el('a', 'lok-row is-upgrade', ic('<polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/>') + '<span>Upgrade to Featured</span>');
      up.href = '/pricing';
      menu.appendChild(up);
    }

    // Help / Contact
    var help = el('a', 'lok-row', ic('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') + '<span>Help &amp; contact</span>');
    help.href = '/contact-us';
    menu.appendChild(help);

    menu.appendChild(el('div', 'lok-divider'));

    // Logout (move the real node — preserves the Clerk handler on #button-logout)
    if (logoutLink) { logoutLink.classList.add('lok-row'); menu.appendChild(logoutLink); }

    // chip
    var chip = el('div', 'lok-chip');
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    var av = el('div', 'lok-av');
    if (photo) { av.style.backgroundImage = 'url("' + photo + '")'; av.textContent = ''; }
    else av.textContent = initials(name);
    var meta = el('div', 'lok-meta');
    var nm = el('div', 'lok-name'); nm.textContent = name;
    var pl = el('div', 'lok-plan'); pl.textContent = plan.label;
    meta.appendChild(nm); meta.appendChild(pl);
    var caret = el('span', 'lok-caret', ic('<polyline points="18 15 12 9 6 15"/>'));
    chip.appendChild(av); chip.appendChild(meta); chip.appendChild(caret);

    wrap.appendChild(menu); wrap.appendChild(chip);

    // mount: replace the bottom group's contents with the chip wrapper
    bottom.innerHTML = '';
    bottom.style.marginTop = 'auto';
    bottom.style.display = 'block';
    bottom.appendChild(wrap);

    // toggle behavior
    function close() { wrap.classList.remove('open'); }
    chip.addEventListener('click', function (e) { e.stopPropagation(); wrap.classList.toggle('open'); });
    chip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrap.classList.toggle('open'); } });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  function whenReady(cb, tries) {
    tries = tries || 0;
    var bottom = document.querySelector('.div-block-29');
    var api = window.LokaliAPI && window.LokaliAPI.vendors;
    if (bottom && api) return cb(bottom);
    if (tries > 40) return; // ~10s; not a dashboard page or api never loaded
    setTimeout(function () { whenReady(cb, tries + 1); }, 250);
  }

  function init() {
    if (document.getElementById('lok-acct')) return;
    whenReady(function (bottom) {
      if (document.getElementById('lok-acct')) return;
      injectStyles();
      window.LokaliAPI.vendors.me().then(function (res) {
        build(bottom, (res && !res.error && res.data) ? res.data : null);
      }).catch(function () { build(bottom, null); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
