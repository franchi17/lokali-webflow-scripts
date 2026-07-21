/**
 * Lokali — Homepage category strip motion (#CAT-STRIP).
 *
 * The strip itself (section.lcs-section: 8 category chips + 2 aria-hidden clone
 * tracks) is REAL WEBFLOW MARKUP, authored in the Designer/MCP and published in
 * the page HTML. This script adds only the motion layer on top of it.
 *
 * Why the split: Webflow's element builder rejects @keyframes, ::before/::after,
 * and nested selectors, so a CSS-only marquee cannot be authored there. Rather
 * than move the whole strip into JS (which would hide 8 category names from the
 * initial HTML), the content stays in Webflow and only the animation lives here.
 *
 * That makes the no-JS / reduced-motion state the DEFAULT, not a fallback:
 * without this script the belt is a wrapped, centered, fully-visible rail of all
 * 8 categories (clones hidden via .lcs-clone{display:none}). Adding .lcs-on
 * flips it to a single nowrap row with clones shown and the marquee running.
 * If jsDelivr is down, the strip still renders correctly — it just doesn't move.
 *
 * Loop math must match the chip metrics in the Webflow styles:
 *   desktop  190px chip + 14px horizontal margin = 204 x 8 = 1632px
 *   <=767px  158px chip + 10px horizontal margin = 168 x 8 = 1344px
 * One track scrolls exactly its own width, so the 2 clones make the seam
 * invisible. If the chip width/margin changes in Webflow, change it here too.
 *
 * Accessibility: the real track keeps its list semantics; the clones are
 * aria-hidden (they carry no links, so there is no tab-order duplication).
 * prefers-reduced-motion is honored live via a change listener, and a pause
 * button is injected (WCAG 2.2.2 — hover alone doesn't cover touch).
 *
 * Keep this file byte-identical in scripts/ and lokali-webflow-scripts/scripts/.
 * Registered page-script on the homepage (SRI-pinned) — editing it requires
 * re-registration, same as lokali-spotlight-home.js.
 */
(function () {
  'use strict';

  var STYLE_ID = 'lcs-motion-style';
  var DESKTOP_TRACK = 1632; // px — one full track, desktop metrics
  var MOBILE_TRACK = 1344;  // px — one full track, <=767px metrics
  var DURATION = 36;        // s  — ~45px/s, the readable band for a logo marquee

  var ICON_PAUSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><line x1="9" y1="5" x2="9" y2="19"/>' +
    '<line x1="15" y1="5" x2="15" y2="19"/></svg>';
  var ICON_PLAY =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
    '<polygon points="7 4 20 12 7 20 7 4"/></svg>';

  function css() {
    return [
      '.lcs-on .lcs-belt{flex-wrap:nowrap;width:max-content;justify-content:flex-start;',
      'animation:lcsscroll ', DURATION, 's linear infinite;will-change:transform}',
      // width:auto + flex:none undoes the static rail's width:100%, which exists
      // so the no-script state wraps into rows instead of shrinking each track to
      // one chip and stacking all 8 vertically.
      '.lcs-on .lcs-track{flex-wrap:nowrap;width:auto;flex:0 0 auto}',
      '.lcs-on .lcs-clone{display:flex}',
      '.lcs-on .lcs-fade{display:block}',
      '.lcs-on .lcs-chip{margin-bottom:0}',
      '.lcs-on .lcs-viewport:hover .lcs-belt{animation-play-state:paused}',
      '.lcs-on.lcs-paused .lcs-belt{animation-play-state:paused}',
      '@keyframes lcsscroll{from{transform:translate3d(0,0,0)}',
      'to{transform:translate3d(-', DESKTOP_TRACK, 'px,0,0)}}',
      '@media screen and (max-width:767px){.lcs-on .lcs-belt{animation-name:lcsscrollm}}',
      '@keyframes lcsscrollm{from{transform:translate3d(0,0,0)}',
      'to{transform:translate3d(-', MOBILE_TRACK, 'px,0,0)}}',
      '.lcs-pausebtn{position:absolute;right:18px;bottom:14px;width:32px;height:32px;',
      'border-radius:50%;background-color:#ffffff;border:1px solid #e5ddf7;display:none;',
      'align-items:center;justify-content:center;cursor:pointer;z-index:3;color:#6b4de0;',
      'padding:0;line-height:0}',
      '.lcs-on .lcs-pausebtn{display:flex}',
      '.lcs-pausebtn:hover{background-color:#f7f4ff}',
      '.lcs-pausebtn:focus-visible{outline:2px solid #6002ee;outline-offset:2px}',
      '.lcs-pausebtn svg{width:12px;height:12px}'
    ].join('');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css();
    document.head.appendChild(s);
  }

  function makePauseButton(section) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lcs-pausebtn';
    btn.setAttribute('aria-label', 'Pause the scrolling category list');
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = ICON_PAUSE;
    btn.addEventListener('click', function () {
      var paused = section.classList.toggle('lcs-paused');
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.setAttribute(
        'aria-label',
        paused ? 'Resume the scrolling category list' : 'Pause the scrolling category list'
      );
      btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    });
    section.appendChild(btn);
    return btn;
  }

  function start() {
    var section = document.querySelector('.lcs-section');
    if (!section) return; // not the homepage, or the section was removed

    injectStyle();

    var mq = null;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) {}

    var btn = null;
    function apply() {
      var reduce = !!(mq && mq.matches);
      if (reduce) {
        section.classList.remove('lcs-on', 'lcs-paused');
        return;
      }
      if (!btn) btn = makePauseButton(section);
      section.classList.add('lcs-on');
    }

    apply();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else if (mq.addListener) mq.addListener(apply); // Safari < 14
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
