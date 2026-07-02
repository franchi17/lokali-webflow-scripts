/**
 * Lokali — vendor dashboard "Leads" page (the action page).
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI.leads + an
 * auth token). Self-mounting into <div id="lok-leads-page"></div> — no-op if absent.
 *
 * Data sources (both existing endpoints, fetched in parallel):
 *   - leads.getMine()   → { inquiries:[full rows], events_30d:[full rows] }  (the list + statuses)
 *   - leads.analytics() → { totals, inquiries[], contacts[], views[] }        (hero numbers + MoM %)
 *
 * A "lead" = a form inquiry OR a direct-contact click (call/text/WhatsApp/
 * email/Instagram/website). Inquiries carry the customer's name/message;
 * contact clicks carry no visitor PII — only the channel + when. Each lead has
 * a vendor-set follow-up status (new/replied/won/closed) persisted via the
 * inquiry/event status PATCH endpoints.
 *
 * See docs/vendor-leads-analytics-maintainer-guide.md for the full data model.
 */
(function () {
  'use strict';

  var DAY30 = 30 * 24 * 60 * 60 * 1000;

  var INK = '#1A1829', DUSK = '#4A4761', SLATE = '#8E8BA6',
      VIOLET = '#6002EE', VIOLET_L = '#F3EBFF',
      GREEN = '#1D6A45', GREEN_L = '#EAFAF2', BORDER = '#EEEDF6', SNOW = '#F7F6FC';

  // Channel config: how each contact-click type renders. `verb` completes
  // "Someone <verb>" for the anonymous event rows.
  var CH = {
    email:     { label: 'Email',     verb: 'revealed your email',  cls: 'email',    icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z|M22 6 12 13 2 6' },
    call:      { label: 'Phone',     verb: 'tapped to call you',   cls: 'phone',    icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
    phone:     { label: 'Phone',     verb: 'tapped to call you',   cls: 'phone',    icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' },
    sms:       { label: 'Text',      verb: 'tapped to text you',   cls: 'phone',    icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z' },
    whatsapp:  { label: 'WhatsApp',  verb: 'tapped your WhatsApp', cls: 'whatsapp', icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z' },
    instagram: { label: 'Instagram', verb: 'opened your Instagram',cls: 'phone',    icon: 'M2 2h20v20H2z|M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' },
    website:   { label: 'Website',   verb: 'visited your website', cls: 'website',  icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' },
    inquiry:   { label: 'Inquiry',   verb: 'sent an inquiry',      cls: 'email',    icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }
  };
  var STATUSES = ['new', 'replied', 'won', 'closed'];

  var CSS = [
    '#lok-leads-page{font-family:"Plus Jakarta Sans",-apple-system,sans-serif;color:' + INK + ';}',
    // Hero: light brand-gradient surface (was solid ink — Francesca wants no
    // black/ink panels in the dashboard, 2026-07-02).
    '#lok-leads-page .lp-hero{background:linear-gradient(120deg,' + VIOLET_L + ' 0%,#FFF3E4 100%);border:.5px solid ' + BORDER + ';border-radius:12px;padding:1.5rem 1.75rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;}',
    '#lok-leads-page .lp-hero-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:' + SLATE + ';}',
    '#lok-leads-page .lp-hero-value{font-size:40px;font-weight:700;color:' + VIOLET + ';line-height:1;margin-top:4px;}',
    '#lok-leads-page .lp-hero-cum{font-size:12px;color:' + DUSK + ';margin-top:8px;}',
    '#lok-leads-page .lp-hero-cum strong{color:' + VIOLET + ';font-weight:600;}',
    '#lok-leads-page .lp-hero-delta{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:' + GREEN + ';background:' + GREEN_L + ';border-radius:100px;padding:5px 12px;}',
    '#lok-leads-page .lp-hero-delta.down{color:#B42318;background:#FEE4E2;}',
    '#lok-leads-page .lp-sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:1.25rem;}',
    '#lok-leads-page .lp-chip{background:#fff;border:.5px solid ' + BORDER + ';border-radius:10px;padding:.9rem 1rem;display:flex;align-items:center;gap:10px;}',
    '#lok-leads-page .lp-chip-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + VIOLET_L + ';color:' + VIOLET + ';}',
    '#lok-leads-page .lp-chip-ic.phone,#lok-leads-page .lp-chip-ic.website{background:' + SNOW + ';color:' + DUSK + ';}',
    '#lok-leads-page .lp-chip-ic.whatsapp{background:#EDFAF3;color:#1A6640;}',
    '#lok-leads-page .lp-chip-count{font-size:17px;font-weight:600;line-height:1.1;}',
    '#lok-leads-page .lp-chip-name{font-size:11px;color:' + SLATE + ';}',
    '#lok-leads-page .lp-filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1rem;}',
    '#lok-leads-page .lp-fbtn{font:inherit;font-size:12px;font-weight:500;padding:6px 13px;border-radius:100px;border:.5px solid #C8C6D8;background:#fff;color:' + DUSK + ';cursor:pointer;}',
    '#lok-leads-page .lp-fbtn.active{background:' + VIOLET_L + ';color:' + VIOLET + ';border-color:#E5D4FD;}',
    '#lok-leads-page .lp-fbtn .c{color:' + SLATE + ';font-weight:400;}',
    '#lok-leads-page .lp-list{background:#fff;border:.5px solid ' + BORDER + ';border-radius:12px;overflow:hidden;}',
    '#lok-leads-page .lp-item{display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:.5px solid ' + BORDER + ';}',
    '#lok-leads-page .lp-item:last-child{border-bottom:none;}',
    '#lok-leads-page .lp-item.is-new{background:#FCFAFF;}',
    '#lok-leads-page .lp-ch{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:' + VIOLET_L + ';color:' + VIOLET + ';}',
    '#lok-leads-page .lp-ch.phone,#lok-leads-page .lp-ch.website{background:' + SNOW + ';color:' + DUSK + ';}',
    '#lok-leads-page .lp-ch.whatsapp{background:#EDFAF3;color:#1A6640;}',
    '#lok-leads-page .lp-body{flex:1;min-width:0;}',
    '#lok-leads-page .lp-l1{font-size:13px;color:' + INK + ';}',
    '#lok-leads-page .lp-l1 strong{font-weight:600;}',
    '#lok-leads-page .lp-l2{font-size:12px;color:' + SLATE + ';margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#lok-leads-page .lp-time{font-size:12px;color:' + SLATE + ';flex-shrink:0;white-space:nowrap;}',
    '#lok-leads-page .lp-status{font:inherit;font-size:11px;font-weight:600;border-radius:100px;padding:5px 11px;border:none;cursor:pointer;outline:none;-webkit-appearance:none;appearance:none;flex-shrink:0;}',
    '#lok-leads-page .lp-status.new{background:' + VIOLET_L + ';color:' + VIOLET + ';}',
    '#lok-leads-page .lp-status.replied{background:#EEEDF6;color:' + DUSK + ';}',
    '#lok-leads-page .lp-status.won{background:' + GREEN_L + ';color:' + GREEN + ';}',
    '#lok-leads-page .lp-status.closed{background:' + SNOW + ';color:' + SLATE + ';}',
    '#lok-leads-page .lp-explain{font-size:11px;color:' + SLATE + ';line-height:1.6;margin-top:12px;padding:0 2px;}',
    '#lok-leads-page .lp-empty{padding:32px;text-align:center;color:' + SLATE + ';font-size:13.5px;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-leads-styles')) return;
    var s = document.createElement('style'); s.id = 'lok-leads-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ts(v) { if (v == null) return 0; if (typeof v === 'number') return v; var n = Date.parse(v); return isNaN(n) ? 0 : n; }
  function ago(t) {
    var d = Date.now() - t;
    if (d < 3600000) return Math.max(1, Math.round(d / 60000)) + 'm ago';
    if (d < 86400000) return Math.round(d / 3600000) + 'h ago';
    if (d < 2 * 86400000) return 'Yesterday';
    if (d < 7 * 86400000) return Math.round(d / 86400000) + 'd ago';
    return new Date(t).toLocaleDateString();
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(paths) {
    var p = paths.split('|').map(function (d) { return '<path d="' + d + '"/>'; }).join('');
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  // Merge inquiries + contact events into one normalized, status-trackable list.
  function buildLeads(inquiries, events) {
    var out = [];
    (inquiries || []).forEach(function (i) {
      out.push({
        kind: 'inquiry', id: i.id, t: ts(i.created_at), channel: 'inquiry',
        status: (i.status || 'new'),
        name: i.customer_name || i.customer_email || 'Someone',
        context: i.context || '', message: i.message || ''
      });
    });
    (events || []).forEach(function (e) {
      out.push({
        kind: 'event', id: e.id, t: ts(e.created_at), channel: (e.event_type || 'website'),
        status: (e.status || 'new'), source: e.source || 'listing'
      });
    });
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  function countInWindow(rows, fromAgo, toAgo) {
    var now = Date.now();
    return rows.filter(function (r) { var d = now - ts(r.created_at); return d >= fromAgo && d < toAgo; }).length;
  }

  function render(mount, leadsData, analytics) {
    var inquiries = (leadsData && leadsData.inquiries) || [];
    var events = (leadsData && leadsData.events_30d) || [];
    var totals = (analytics && analytics.totals) || {};
    var aInq = (analytics && analytics.inquiries) || [];
    var aCon = (analytics && analytics.contacts) || [];

    // Hero numbers (this 30d vs prior 30d) from the analytics rows.
    var thisMonth = countInWindow(aInq, 0, DAY30) + countInWindow(aCon, 0, DAY30);
    var prevMonth = countInWindow(aInq, DAY30, 2 * DAY30) + countInWindow(aCon, DAY30, 2 * DAY30);
    var sinceJoin = (totals.inquiries || 0) + (totals.contacts || 0);
    var deltaPct = prevMonth === 0 ? (thisMonth > 0 ? 100 : 0) : Math.round((thisMonth - prevMonth) / prevMonth * 100);
    var leads = buildLeads(inquiries, events);

    mount.innerHTML = '';

    // ── hero ──
    var hero = el('div', 'lp-hero');
    var hmain = el('div');
    hmain.appendChild(el('div', 'lp-hero-label', 'Leads this month'));
    hmain.appendChild(el('div', 'lp-hero-value', String(thisMonth)));
    var cum = el('div', 'lp-hero-cum');
    cum.innerHTML = '<strong>' + sinceJoin + '</strong> leads since you joined Lokali';
    hmain.appendChild(cum);
    hero.appendChild(hmain);
    if (prevMonth > 0 || thisMonth > 0) {
      var up = deltaPct >= 0;
      var delta = el('div', 'lp-hero-delta' + (up ? '' : ' down'),
        (up ? '▲ +' : '▼ ') + Math.abs(deltaPct) + '% vs last month');
      hero.appendChild(delta);
    }
    mount.appendChild(hero);

    // ── source split (this month, from analytics contact rows) ──
    var byCh = {};
    aCon.forEach(function (e) {
      if (Date.now() - ts(e.created_at) >= DAY30) return;
      var ty = e.event_type || 'website';
      if (ty === 'call' || ty === 'sms') ty = 'phone'; // merge call+text into Phone
      byCh[ty] = (byCh[ty] || 0) + 1;
    });
    var chOrder = ['email', 'phone', 'whatsapp', 'instagram', 'website'];
    var sources = el('div', 'lp-sources');
    chOrder.forEach(function (ty) {
      if (!byCh[ty]) return;
      var cfg = CH[ty] || CH.website;
      var chip = el('div', 'lp-chip');
      var ic = el('div', 'lp-chip-ic ' + cfg.cls); ic.innerHTML = icon(cfg.icon);
      chip.appendChild(ic);
      var meta = el('div');
      meta.appendChild(el('div', 'lp-chip-count', String(byCh[ty])));
      meta.appendChild(el('div', 'lp-chip-name', cfg.label));
      chip.appendChild(meta);
      sources.appendChild(chip);
    });
    if (sources.children.length) mount.appendChild(sources);

    // ── filters ──
    var newCount = leads.filter(function (l) { return l.status === 'new'; }).length;
    var filterBar = el('div', 'lp-filters');
    var current = 'all';
    var defs = [{ k: 'all', label: 'All', c: leads.length }, { k: 'new', label: 'New', c: newCount }];
    // add a filter per channel present
    var present = {};
    leads.forEach(function (l) { var c = (l.channel === 'call' || l.channel === 'sms') ? 'phone' : l.channel; present[c] = true; });
    Object.keys(present).forEach(function (c) { defs.push({ k: c, label: (CH[c] || { label: c }).label }); });

    var listWrap = el('div', 'lp-list');

    function rowMatches(l, k) {
      if (k === 'all') return true;
      if (k === 'new') return l.status === 'new';
      var c = (l.channel === 'call' || l.channel === 'sms') ? 'phone' : l.channel;
      return c === k;
    }

    function renderList() {
      listWrap.innerHTML = '';
      var shown = leads.filter(function (l) { return rowMatches(l, current); });
      if (!shown.length) {
        listWrap.appendChild(el('div', 'lp-empty', 'No leads here yet. When someone contacts you through your listing, they’ll show up here.'));
        return;
      }
      shown.forEach(function (l) { listWrap.appendChild(renderRow(l)); });
    }

    defs.forEach(function (d) {
      var b = el('button', 'lp-fbtn' + (d.k === 'all' ? ' active' : ''));
      b.innerHTML = d.label + (d.c != null ? ' <span class="c">' + d.c + '</span>' : '');
      b.onclick = function () {
        current = d.k;
        Array.prototype.forEach.call(filterBar.children, function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderList();
      };
      filterBar.appendChild(b);
    });
    mount.appendChild(filterBar);

    function renderRow(l) {
      var cfg = CH[l.channel] || CH.website;
      var row = el('div', 'lp-item' + (l.status === 'new' ? ' is-new' : ''));
      var ch = el('div', 'lp-ch ' + cfg.cls); ch.innerHTML = icon(cfg.icon);
      row.appendChild(ch);
      var body = el('div', 'lp-body');
      var l1 = el('div', 'lp-l1');
      var l2 = el('div', 'lp-l2');
      if (l.kind === 'inquiry') {
        l1.innerHTML = '<strong>' + escapeHtml(l.name) + '</strong> sent you an inquiry';
        l2.textContent = [l.context, l.message].filter(Boolean).join(' · ') || 'From your listing';
      } else {
        l1.innerHTML = 'Someone ' + cfg.verb;
        l2.textContent = 'From your ' + (l.source === 'service' ? 'service page' : l.source === 'product' ? 'product page' : 'listing');
      }
      body.appendChild(l1); body.appendChild(l2);
      row.appendChild(body);
      row.appendChild(el('div', 'lp-time', ago(l.t)));
      row.appendChild(statusSelect(l));
      return row;
    }

    function statusSelect(l) {
      var sel = el('select', 'lp-status ' + l.status);
      STATUSES.forEach(function (s) {
        var o = el('option', null, s.charAt(0).toUpperCase() + s.slice(1));
        o.value = s; if (s === l.status) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () {
        var nv = sel.value, prev = l.status;
        l.status = nv; sel.className = 'lp-status ' + nv;
        var call = l.kind === 'inquiry'
          ? window.LokaliAPI.leads.setInquiryStatus(l.id, nv)
          : window.LokaliAPI.leads.setEventStatus(l.id, nv);
        call.then(function (res) {
          if (res && res.error) { l.status = prev; sel.value = prev; sel.className = 'lp-status ' + prev; }
        });
      };
      return sel;
    }

    renderList();
    mount.appendChild(listWrap);

    var explain = el('div', 'lp-explain',
      'A lead is logged when someone taps to contact you — your conversation then happens directly by email, phone, or WhatsApp, never through Lokali. Set a status to track who you’ve followed up with. We never see the contents of your messages.');
    mount.appendChild(explain);
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function init() {
    var mount = document.getElementById('lok-leads-page');
    if (!mount) return;
    if (!window.LokaliAPI || !window.LokaliAPI.leads || typeof window.LokaliAPI.leads.analytics !== 'function') {
      console.warn('[lokali-leads] LokaliAPI.leads not available'); return;
    }
    injectStyles();
    Promise.all([window.LokaliAPI.leads.getMine(), window.LokaliAPI.leads.analytics()])
      .then(function (res) {
        var leadsRes = res[0], anRes = res[1];
        if ((!leadsRes || leadsRes.error) && (!anRes || anRes.error)) {
          mount.innerHTML = '';
          var c = el('div', 'lp-list'); c.appendChild(el('div', 'lp-empty', 'Leads are taking a moment to load. Refresh in a few seconds.'));
          mount.appendChild(c); return;
        }
        render(mount, (leadsRes && leadsRes.data) || {}, (anRes && anRes.data) || {});
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
