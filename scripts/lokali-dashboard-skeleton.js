/*
  Lokali — Dashboard skeleton loader.
  The vendor dashboard home (/vendor-dashboard/dashboard) renders its stat values only
  after lokali-dashboard-home.js finishes its Xano calls (vendors.me / services /
  products / billing). Until then the stat slots are empty/placeholder. This script
  shows a shimmer placeholder over those slots on load and clears it the moment real
  data lands — so the page reads as "loading" instead of "empty", with no full-screen
  splash.

  Fully decoupled from the data script: it watches the target elements and clears all
  skeletons as soon as the first one is populated (data arrived), with a failsafe
  timeout so a slot that legitimately stays blank can't shimmer forever. Targets are
  the known stat ids the dashboard fills (resolved by #id OR [data-lokali="id"], same
  as the data script) plus anything you tag with [data-lok-skeleton] in Webflow.

  Self-contained, idempotent, no dependencies. No-op on pages without these slots.
*/
(function () {
  'use strict';

  // Stat slots filled by lokali-dashboard-home.js. Each is found by #id or [data-lokali="id"].
  var TARGET_IDS = [
    'dashboard-active-services',
    'dashboard-active-products',
    'dashboard-listing-strength',
    'dashboard-profile-views',
    'listing-strength-score'
  ];

  var CSS_ID = 'lok-skel-css';
  var SKEL_CLASS = 'lok-skel';
  var FAILSAFE_MS = 6000;

  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.' + SKEL_CLASS + '{',
      'color:transparent!important;border-radius:8px;display:inline-block;',
      'min-width:2.4em;min-height:1em;vertical-align:middle;',
      'background:linear-gradient(90deg,#ece9f5 25%,#f6f4fb 37%,#ece9f5 63%);',
      'background-size:400% 100%;animation:lok-skel-pulse 1.4s ease infinite;}',
      '.' + SKEL_CLASS + ' *{visibility:hidden!important;}',
      '@keyframes lok-skel-pulse{0%{background-position:100% 0}100%{background-position:0 0}}',
      '@media (prefers-reduced-motion: reduce){',
      '.' + SKEL_CLASS + '{animation:lok-skel-fade 1.4s ease-in-out infinite;}',
      '@keyframes lok-skel-fade{0%,100%{opacity:1}50%{opacity:.55}}}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function resolve(id) {
    return document.getElementById(id) || document.querySelector('[data-lokali="' + id + '"]');
  }

  function collectTargets() {
    var out = [];
    var seen = [];
    function add(el) {
      if (el && seen.indexOf(el) === -1) { seen.push(el); out.push(el); }
    }
    for (var i = 0; i < TARGET_IDS.length; i++) add(resolve(TARGET_IDS[i]));
    var tagged = document.querySelectorAll('[data-lok-skeleton]');
    for (var j = 0; j < tagged.length; j++) add(tagged[j]);
    return out;
  }

  var targets = [];
  var baseline = [];   // initial text per target, to detect "real data arrived"
  var mo = null;
  var cleared = false;

  function apply() {
    targets = collectTargets();
    if (!targets.length) return false;
    injectCss();
    for (var i = 0; i < targets.length; i++) {
      baseline[i] = (targets[i].textContent || '').trim();
      targets[i].classList.add(SKEL_CLASS);
    }
    return true;
  }

  function clearAll() {
    if (cleared) return;
    cleared = true;
    if (mo) { mo.disconnect(); mo = null; }
    for (var i = 0; i < targets.length; i++) targets[i].classList.remove(SKEL_CLASS);
  }

  // Real data has arrived if any target's text changed from its (placeholder) baseline
  // to a non-empty value.
  function dataArrived() {
    for (var i = 0; i < targets.length; i++) {
      var now = (targets[i].textContent || '').trim();
      if (now && now !== baseline[i]) return true;
    }
    return false;
  }

  function watch() {
    if (!window.MutationObserver) { setTimeout(clearAll, FAILSAFE_MS); return; }
    mo = new MutationObserver(function () { if (dataArrived()) clearAll(); });
    for (var i = 0; i < targets.length; i++) {
      mo.observe(targets[i], { childList: true, characterData: true, subtree: true });
    }
    setTimeout(clearAll, FAILSAFE_MS); // failsafe: never shimmer forever
  }

  function init() {
    if (!apply()) return; // no dashboard slots on this page → no-op
    watch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
