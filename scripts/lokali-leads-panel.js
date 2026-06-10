/**
 * Lokali — vendor dashboard "Leads" panel.
 *
 * Load AFTER scripts/lokali-api-client.js (needs window.LokaliAPI.leads, auth token set).
 * Self-mounting: renders into <div id="lok-leads-section"></div> — add that
 * one empty div on the dashboard page in Webflow wherever the panel should
 * appear. If the div is absent the script is a no-op.
 *
 * Shows: 30-day stats (form inquiries + direct-contact clicks by channel)
 * and the inquiry inbox (click a row to expand + mark read).
 */
(function () {
  'use strict';

  var DAY30 = 30 * 24 * 60 * 60 * 1000;

  var CHANNEL_LABELS = {
    call: 'Calls', sms: 'Texts', whatsapp: 'WhatsApp',
    email: 'Emails', instagram: 'Instagram', website: 'Website'
  };

  var CSS = [
    '#lok-leads-section{font-family:"Plus Jakarta Sans",sans-serif;color:#1A1530;}',
    '.lok-leads-card{background:#fff;border:1px solid #ECEAF3;border-radius:14px;padding:22px;margin-bottom:16px;}',
    '.lok-leads-h{font-size:17px;font-weight:700;margin:0 0 2px;}',
    '.lok-leads-sub{font-size:12.5px;color:#6B6680;margin:0 0 16px;}',
    '.lok-leads-stats{display:flex;flex-wrap:wrap;gap:10px;}',
    '.lok-leads-stat{flex:1 1 100px;min-width:100px;background:#F7F6FC;border-radius:10px;padding:12px 14px;}',
    '.lok-leads-stat .n{font-size:22px;font-weight:700;color:#6002EE;line-height:1.2;}',
    '.lok-leads-stat .l{font-size:11.5px;color:#6B6680;font-weight:600;}',
    '.lok-leads-empty{padding:18px 0;text-align:center;color:#6B6680;font-size:13.5px;}',
    '.lok-inq-row{border-top:1px solid #F0EEF7;padding:13px 4px;cursor:pointer;}',
    '.lok-inq-row:first-of-type{border-top:0;}',
    '.lok-inq-top{display:flex;align-items:center;gap:8px;}',
    '.lok-inq-dot{width:8px;height:8px;border-radius:50%;background:#6002EE;flex-shrink:0;}',
    '.lok-inq-row.is-read .lok-inq-dot{background:transparent;}',
    '.lok-inq-who{font-size:14px;font-weight:600;flex:1;}',
    '.lok-inq-row.is-read .lok-inq-who{font-weight:500;}',
    '.lok-inq-when{font-size:11.5px;color:#9A95AD;flex-shrink:0;}',
    '.lok-inq-preview{font-size:13px;color:#6B6680;margin:4px 0 0 16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.lok-inq-body{display:none;margin:10px 0 4px 16px;font-size:13.5px;line-height:1.55;}',
    '.lok-inq-row.is-open .lok-inq-body{display:block;}',
    '.lok-inq-row.is-open .lok-inq-preview{display:none;}',
    '.lok-inq-meta{margin-top:8px;font-size:12.5px;color:#6B6680;}',
    '.lok-inq-meta a{color:#6002EE;font-weight:600;text-decoration:none;}',
    '.lok-inq-ctx{display:inline-block;background:#F3EBFF;color:#6002EE;border-radius:100px;padding:2px 10px;font-size:11px;font-weight:600;margin-left:6px;}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('lok-leads-styles')) return;
    var s = document.createElement('style');
    s.id = 'lok-leads-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ts(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var n = Date.parse(v);
    return isNaN(n) ? 0 : n;
  }

  function ago(t) {
    var d = Date.now() - t;
    if (d < 3600000) return Math.max(1, Math.round(d / 60000)) + 'm ago';
    if (d < 86400000) return Math.round(d / 3600000) + 'h ago';
    if (d < 7 * 86400000) return Math.round(d / 86400000) + 'd ago';
    return new Date(t).toLocaleDateString();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderStats(card, inquiries, events) {
    var now = Date.now();
    var inq30 = inquiries.filter(function (i) { return now - ts(i.created_at) < DAY30; }).length;

    var stats = el('div', 'lok-leads-stats');
    var s1 = el('div', 'lok-leads-stat');
    s1.appendChild(el('div', 'n', String(inq30)));
    s1.appendChild(el('div', 'l', 'Inquiries (30 days)'));
    stats.appendChild(s1);

    var s2 = el('div', 'lok-leads-stat');
    s2.appendChild(el('div', 'n', String(events.length)));
    s2.appendChild(el('div', 'l', 'Contact clicks (30 days)'));
    stats.appendChild(s2);

    // Per-channel counts, biggest first, top 3 shown.
    var byType = {};
    events.forEach(function (ev) {
      var t = ev.event_type || 'other';
      byType[t] = (byType[t] || 0) + 1;
    });
    Object.keys(byType)
      .sort(function (a, b) { return byType[b] - byType[a]; })
      .slice(0, 3)
      .forEach(function (t) {
        var s = el('div', 'lok-leads-stat');
        s.appendChild(el('div', 'n', String(byType[t])));
        s.appendChild(el('div', 'l', CHANNEL_LABELS[t] || t));
        stats.appendChild(s);
      });

    card.appendChild(stats);
  }

  function renderInquiry(list, inq) {
    var row = el('div', 'lok-inq-row' + (inq.is_read ? ' is-read' : ''));
    var top = el('div', 'lok-inq-top');
    top.appendChild(el('span', 'lok-inq-dot'));
    var who = el('span', 'lok-inq-who', inq.customer_name || inq.customer_email || 'Customer');
    if (inq.context) who.appendChild(el('span', 'lok-inq-ctx', inq.context));
    top.appendChild(who);
    top.appendChild(el('span', 'lok-inq-when', ago(ts(inq.created_at))));
    row.appendChild(top);
    row.appendChild(el('div', 'lok-inq-preview', inq.message || ''));

    var body = el('div', 'lok-inq-body');
    body.appendChild(el('div', null, inq.message || ''));
    var meta = el('div', 'lok-inq-meta');
    if (inq.customer_email) {
      var a = el('a', null, inq.customer_email);
      a.href = 'mailto:' + inq.customer_email;
      meta.appendChild(document.createTextNode('Reply: '));
      meta.appendChild(a);
    }
    if (inq.customer_phone) meta.appendChild(document.createTextNode('  ·  ' + inq.customer_phone));
    body.appendChild(meta);
    row.appendChild(body);

    row.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') return; // let mailto through untouched
      row.classList.toggle('is-open');
      if (!inq.is_read && row.classList.contains('is-open')) {
        inq.is_read = true;
        row.classList.add('is-read');
        if (window.LokaliAPI.leads.markRead) window.LokaliAPI.leads.markRead(inq.id);
      }
    });
    list.appendChild(row);
  }

  function render(mount, data) {
    var inquiries = (data && Array.isArray(data.inquiries)) ? data.inquiries : [];
    var events = (data && Array.isArray(data.events_30d)) ? data.events_30d : [];

    mount.innerHTML = '';
    var card = el('div', 'lok-leads-card');
    card.appendChild(el('h3', 'lok-leads-h', 'Leads'));
    card.appendChild(el('p', 'lok-leads-sub', 'Customers who reached out through your Lokali listing.'));
    renderStats(card, inquiries, events);
    mount.appendChild(card);

    var inbox = el('div', 'lok-leads-card');
    inbox.appendChild(el('h3', 'lok-leads-h', 'Inquiries'));
    if (!inquiries.length) {
      inbox.appendChild(el('div', 'lok-leads-empty',
        'No inquiries yet — when a customer sends one from your listing, it shows up here.'));
    } else {
      var list = el('div');
      inquiries.forEach(function (inq) { renderInquiry(list, inq); });
      inbox.appendChild(list);
    }
    mount.appendChild(inbox);
  }

  function init() {
    var mount = document.getElementById('lok-leads-section');
    if (!mount) return; // page doesn't have the panel — no-op
    if (!window.LokaliAPI || !window.LokaliAPI.leads) {
      console.warn('[lokali-leads-panel] LokaliAPI.leads not available');
      return;
    }
    injectStyles();
    window.LokaliAPI.leads.getMine().then(function (res) {
      if (res.error) {
        console.warn('[lokali-leads-panel] failed to load leads:', res.error);
        return;
      }
      render(mount, res.data);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
