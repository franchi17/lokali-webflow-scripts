/* lokali-quiet-labels.js
 * F 2026-11-25 ("Yes, as drawn"): no small capital-letter label (eyebrow) on top of every
 * section; a label on every band reads as machine-made. Pages whose eyebrows come from our
 * own scripts had them removed at the source (home, about, start, this-week, holiday,
 * for-vendors, the-market). This file covers the pages whose eyebrows live in Webflow itself
 * (page code or HTML embeds) or in a script pinned where a bump means a big rewrite, path-gated so no other page is touched.
 * Kept on purpose: This Week day names, Pricing plan names, For vendors plan tags, About
 * Vendors / Customers column labels, Founding vendors step numbers.
 */
(function () {
  var p = String(location.pathname || '').replace(/\/+$/, '') || '/';
  var css = '';
  if (p === '/pricing') {
    css = '.title-header,.c-eyebrow{display:none!important;}';
  } else if (p === '/for-customers') {
    css = '.lkfc .eye,.lk-ai-eye{display:none!important;}' +
      '.lkfc figcaption,.lkfc figcaption a{text-transform:none!important;letter-spacing:normal!important;}';
  } else if (p === '/this-week' || p === '/this-weekend') {
    // lokali-weekend.js is pinned in the site footer loader; v1.4.703+ drops it at the source too.
    css = '.lkw-eyebrow{display:none!important;}';
  } else if (p === '/neighborhood-edit') {
    css = '#ne-lp .eb{display:none!important;}';
  } else if (/^\/vendor-resources(\/|$)/.test(p)) {
    css = '.lkg-eyebrow,.lg-eyebrow,.lg-section-eye{display:none!important;}';
  }
  if (!css) return;
  var s = document.createElement('style');
  s.id = 'lokali-quiet-labels';
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
})();
