/**
 * lokali-followers.js - the vendor's Followers page, /vendor-dashboard/followers
 * (Followers release, 2026-09-20; F chose option A: Save IS follow).
 *
 * Free on every plan. Mount: <div id="lok-followers-page"></div>.
 *   1. Follower COUNT (total, new this week, how many get the weekly email). Never
 *      who: a vendor cannot see or export customer emails (F, privacy + consent).
 *   2. "Tell your followers": a 30-second post. Four kinds, matching what vendors
 *      already announce on social: Where I'll be / New item / Orders open / Sold
 *      out. A post shows on the storefront at once, feeds the public weekend page,
 *      and goes out in ONE weekly email (Thursdays) to people who saved the vendor.
 *   3. Your recent posts, with Remove (soft delete).
 * UX rules applied: one primary action per screen, smart defaults (next Saturday,
 * 9 to 1, "every week" one tap), plain words, 44px targets, visible focus, errors
 * that say what to do. No emoji, no em dashes, Plus Jakarta Sans set explicitly.
 * Data: window.LokaliSupabaseAPI.posts (patch_vendor_posts.sql; RLS gates writes).
 */
(function () {
  'use strict';
  if (window.__lokFollowersBooted) return;
  window.__lokFollowersBooted = true;

  var F = "'Plus Jakarta Sans',sans-serif";
  var KINDS = [
    { k: 'where', t: "Where I'll be", ph: 'Anything to add? (optional)  e.g. Bringing the fall flavors' },
    { k: 'new', t: 'New item', ph: 'What is new?  e.g. Fall spiced honey is back' },
    { k: 'orders', t: 'Orders open', ph: 'What can people order, and by when?' },
    { k: 'soldout', t: 'Sold out', ph: 'What sold out, and when is it back?' }
  ];
  var KIND_T = { where: "Where I'll be", 'new': 'New item', orders: 'Orders open', soldout: 'Sold out' };

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nextSaturday() {
    var d = new Date(); var add = (6 - d.getDay() + 7) % 7; if (add === 0) add = 7;
    d.setDate(d.getDate() + add);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function localIso(date, time) { var d = new Date(date + 'T' + time + ':00'); return isNaN(d.getTime()) ? null : d.toISOString(); }
  function whenText(p) {
    if (!p.starts_at) return '';
    var s = new Date(p.starts_at);
    var out = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' +
      s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
    if (p.ends_at) out += ' to ' + new Date(p.ends_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
    return out + (p.repeats_weekly ? ', every week' : '');
  }

  function css() {
    if (document.getElementById('lkf-css')) return;
    var s = document.createElement('style'); s.id = 'lkf-css';
    s.textContent = [
      '#lok-followers-page{font-family:' + F + ';color:#1A1829;max-width:760px;}',
      '#lok-followers-page *{box-sizing:border-box;font-family:' + F + ';}',
      '.lkf-h1{font-size:26px;font-weight:800;margin:0 0 6px;}',
      '.lkf-lede{font-size:15px;line-height:1.55;color:#4A4761;margin:0 0 20px;max-width:62ch;}',
      '.lkf-card{background:#fff;border:1px solid #DEDAEE;border-radius:16px;padding:20px;margin:0 0 16px;}',
      '.lkf-h2{font-size:17px;font-weight:800;margin:0 0 4px;}',
      '.lkf-sub{font-size:13.5px;line-height:1.5;color:#6B6880;margin:0 0 14px;}',
      '.lkf-stats{display:flex;gap:10px;flex-wrap:wrap;}',
      '.lkf-stat{flex:1 1 130px;background:#F3EBFF;border-radius:12px;padding:12px 14px;}',
      '.lkf-stat b{display:block;font-size:24px;font-weight:800;color:#6002EE;line-height:1.15;font-variant-numeric:tabular-nums;}',
      '.lkf-stat span{font-size:12.5px;font-weight:600;color:#4A4761;}',
      '.lkf-chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px;}',
      '.lkf-chip{font-size:13.5px;font-weight:700;min-height:44px;padding:10px 15px;border-radius:999px;border:1px solid #DEDAEE;background:#fff;color:#4A4761;cursor:pointer;}',
      '.lkf-chip[aria-pressed="true"]{background:#6002EE;border-color:#6002EE;color:#fff;}',
      '.lkf-row{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px;}',
      '.lkf-f{flex:1 1 150px;display:flex;flex-direction:column;gap:5px;}',
      '.lkf-f.wide{flex:1 1 100%;}',
      '.lkf-f label{font-size:12.5px;font-weight:700;color:#4A4761;}',
      '.lkf-in{width:100%;min-height:44px;font-size:15px;font-weight:500;color:#1A1829;background:#FAF7FF;border:1px solid #DEDAEE;border-radius:12px;padding:10px 12px;}',
      'textarea.lkf-in{min-height:84px;resize:vertical;line-height:1.5;}',
      '.lkf-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:14px;font-weight:600;color:#4A4761;cursor:pointer;margin:0 0 12px;}',
      '.lkf-check input{width:20px;height:20px;accent-color:#6002EE;}',
      '.lkf-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.lkf-hint{font-size:12.5px;line-height:1.45;color:#6B6880;flex:1 1 220px;}',
      '.lkf-btn{font-size:14.5px;font-weight:700;min-height:44px;padding:11px 22px;border-radius:999px;border:0;background:#6002EE;color:#fff;cursor:pointer;}',
      '.lkf-btn[disabled]{opacity:.6;cursor:default;}',
      '.lkf-link{font-size:13px;font-weight:700;color:#6002EE;background:none;border:0;min-height:44px;padding:0 6px;cursor:pointer;}',
      '.lkf-in:focus-visible,.lkf-chip:focus-visible,.lkf-btn:focus-visible,.lkf-link:focus-visible,.lkf-check input:focus-visible{outline:3px solid #C9B3FA;outline-offset:2px;}',
      '.lkf-msg{font-size:13.5px;font-weight:600;color:#8A4B14;background:#FFF0E6;border:1px solid #F6D9BE;border-radius:10px;padding:9px 12px;margin:12px 0 0;}',
      '.lkf-post{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:12px 0;border-top:1px solid #EEEDF6;}',
      '.lkf-post:first-of-type{border-top:0;}',
      '.lkf-pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#6002EE;background:#F3EBFF;border-radius:999px;padding:3px 9px;}',
      '.lkf-post-t{font-size:14.5px;font-weight:700;margin:5px 0 0;overflow-wrap:anywhere;}',
      '.lkf-post-s{font-size:13px;color:#6B6880;margin:2px 0 0;overflow-wrap:anywhere;}',
      '.lkf-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#EAFAF2;color:#1D6A45;border:1px solid #BFE6D1;font:700 14px ' + F + ';border-radius:999px;padding:12px 20px;z-index:9999;display:none;}',
      '@media(max-width:600px){.lkf-card{padding:16px;}.lkf-h1{font-size:22px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var toastT;
  function toast(m) {
    var t = document.querySelector('.lkf-toast');
    if (!t) { t = document.createElement('div'); t.className = 'lkf-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = m; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(function () { t.style.display = 'none'; }, 3600);
  }

  function Page(mount, vendor, SB) {
    this.mount = mount; this.vendor = vendor; this.SB = SB;
    this.kind = 'where'; this.stats = null; this.posts = []; this.err = '';
    this.draft = { place: '', date: nextSaturday(), from: '09:00', to: '13:00', weekly: false, body: '' };
    var self = this;
    mount.addEventListener('click', function (e) { self.onClick(e); });
    mount.addEventListener('input', function (e) { self.onInput(e); });
    mount.addEventListener('change', function (e) { self.onInput(e); });
    this.load();
  }
  Page.prototype.load = function () {
    var self = this;
    Promise.all([this.SB.posts.followerStats(), this.SB.posts.forVendor(this.vendor.id, 12)]).then(function (rs) {
      var st = rs[0] && rs[0].data; self.stats = (st && st.ok) ? st : null;
      self.posts = (rs[1] && Array.isArray(rs[1].data)) ? rs[1].data : [];
      self.render();
    });
  };
  Page.prototype.onInput = function (e) {
    var k = e.target && e.target.getAttribute && e.target.getAttribute('data-d');
    if (!k) return;
    this.draft[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    var c = document.getElementById('lkf-count');
    if (k === 'body' && c) c.textContent = (this.draft.body || '').length + ' of 280';
  };
  Page.prototype.onClick = function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-kind],[data-act]') : null;
    if (!t) return;
    var self = this;
    if (t.hasAttribute('data-kind')) {
      this.kind = t.getAttribute('data-kind'); this.err = ''; this.render();
      var again = this.mount.querySelector('[data-kind="' + this.kind + '"]'); if (again) again.focus();
      return;
    }
    var act = t.getAttribute('data-act');
    if (act === 'post') this.post(t);
    else if (act === 'remove') {
      var id = Number(t.getAttribute('data-id'));
      t.disabled = true;
      this.SB.posts.remove(id).then(function (res) {
        if (res && res.error) { t.disabled = false; toast('Could not remove that post. Please try again.'); return; }
        self.posts = self.posts.filter(function (p) { return p.id !== id; });
        self.render(); toast('Removed from your storefront');
      });
    }
  };
  Page.prototype.post = function (btn) {
    var d = this.draft, self = this, f = { kind: this.kind, body: (d.body || '').trim() };
    if (this.kind === 'where') {
      if (!(d.place || '').trim()) return this.fail('Add the place, for example the market name.');
      f.place = d.place.trim();
      f.starts_at = localIso(d.date, d.from);
      f.ends_at = d.to ? localIso(d.date, d.to) : null;
      if (!f.starts_at) return this.fail('Pick a date and a start time.');
      if (f.ends_at && Date.parse(f.ends_at) <= Date.parse(f.starts_at)) return this.fail('The end time needs to be after the start time.');
      if (!d.weekly && Date.parse(f.starts_at) < Date.now() - 3600000) return this.fail('That date has passed. Pick an upcoming one.');
      f.repeats_weekly = d.weekly === true;
    } else if (!f.body) {
      return this.fail('Write a line for your followers first.');
    }
    if (f.body.length > 280) return this.fail('Keep it to 280 characters or fewer.');
    btn.disabled = true;
    this.SB.posts.create(this.vendor.id, f).then(function (res) {
      btn.disabled = false;
      if (res && res.error) {
        var m = String((res.error && res.error.message) || res.error || '');
        return self.fail(/daily limit/i.test(m) ? 'You have reached 10 posts today. Try again tomorrow.' : 'Something went wrong on our end and your post was not saved. Please try again.');
      }
      if (res && res.data) self.posts.unshift(res.data);
      self.draft.body = ''; self.draft.place = ''; self.err = '';
      self.render(); toast('Posted. It is on your storefront now.');
    });
  };
  Page.prototype.fail = function (m) { this.err = m; this.render(); var e = document.getElementById('lkf-err'); if (e && e.focus) e.focus(); };

  Page.prototype.render = function () {
    var d = this.draft, k = this.kind, st = this.stats;
    var kd = KINDS.filter(function (x) { return x.k === k; })[0];
    var n = st ? st.followers : 0;
    // The page title + sub-line are Webflow's own (Heading 20 + .subheader), like
    // every other dashboard page, so this starts at the numbers.
    var html = '<div class="lkf-card"><div class="lkf-stats">' +
        '<div class="lkf-stat"><b>' + (st ? st.followers : 0) + '</b><span>' + (n === 1 ? 'follower' : 'followers') + '</span></div>' +
        '<div class="lkf-stat"><b>' + (st ? st.new_7d : 0) + '</b><span>new this week</span></div>' +
        '<div class="lkf-stat"><b>' + (st ? st.emailable : 0) + '</b><span>get the weekly email</span></div>' +
      '</div>' +
      (n === 0 ? '<p class="lkf-sub" style="margin:14px 0 0;">No followers yet. Your QR code and storefront link both lead to the Save button, so every customer you meet can follow you. Posts still show on your storefront today.</p>' : '') +
      '</div>' +
      '<div class="lkf-card"><h2 class="lkf-h2">Tell your followers</h2><p class="lkf-sub">Pick what it is about. It takes about thirty seconds.</p>' +
      '<div class="lkf-chips" role="group" aria-label="Kind of update">' + KINDS.map(function (x) {
        return '<button type="button" class="lkf-chip" data-kind="' + x.k + '" aria-pressed="' + (x.k === k ? 'true' : 'false') + '">' + esc(x.t) + '</button>';
      }).join('') + '</div>';
    if (k === 'where') {
      html += '<div class="lkf-row"><div class="lkf-f wide"><label for="lkf-place">Place</label><input class="lkf-in" id="lkf-place" data-d="place" maxlength="120" placeholder="e.g. The Woodlands Farmers Market" value="' + esc(d.place) + '"></div></div>' +
        '<div class="lkf-row">' +
          '<div class="lkf-f"><label for="lkf-date">Date</label><input class="lkf-in" type="date" id="lkf-date" data-d="date" value="' + esc(d.date) + '"></div>' +
          '<div class="lkf-f"><label for="lkf-from">From</label><input class="lkf-in" type="time" id="lkf-from" data-d="from" value="' + esc(d.from) + '"></div>' +
          '<div class="lkf-f"><label for="lkf-to">To</label><input class="lkf-in" type="time" id="lkf-to" data-d="to" value="' + esc(d.to) + '"></div>' +
        '</div>' +
        '<label class="lkf-check"><input type="checkbox" id="lkf-weekly" data-d="weekly"' + (d.weekly ? ' checked' : '') + '>I am there every week at this time</label>';
    }
    html += '<div class="lkf-row"><div class="lkf-f wide"><label for="lkf-body">' + (k === 'where' ? 'Note' : 'Your update') + ' <span id="lkf-count" style="font-weight:500;color:#6B6880;">' + (d.body || '').length + ' of 280</span></label>' +
      '<textarea class="lkf-in" id="lkf-body" data-d="body" maxlength="280" placeholder="' + esc(kd.ph) + '">' + esc(d.body) + '</textarea></div></div>' +
      '<div class="lkf-foot"><span class="lkf-hint">Shows on your storefront now. Included in Thursday\'s weekly email to your followers.</span>' +
      '<button type="button" class="lkf-btn" data-act="post">Post</button></div>' +
      (this.err ? '<p class="lkf-msg" id="lkf-err" role="alert" tabindex="-1">' + esc(this.err) + '</p>' : '') +
      '</div>';

    html += '<div class="lkf-card"><h2 class="lkf-h2">Your recent posts</h2>';
    if (!this.posts.length) html += '<p class="lkf-sub" style="margin:6px 0 0;">Nothing posted yet. A good first one: where you will be this week.</p>';
    else html += this.posts.map(function (p) {
      var title = p.kind === 'where' ? (p.place || '') : (p.body || '');
      var sub = p.kind === 'where' ? [whenText(p), p.body || ''].filter(Boolean).join(' · ') : '';
      return '<div class="lkf-post"><div style="min-width:0"><span class="lkf-pill">' + esc(KIND_T[p.kind] || 'Update') + '</span>' +
        '<p class="lkf-post-t">' + esc(title) + '</p>' + (sub ? '<p class="lkf-post-s">' + esc(sub) + '</p>' : '') + '</div>' +
        '<button type="button" class="lkf-link" data-act="remove" data-id="' + p.id + '" aria-label="Remove this post">Remove</button></div>';
    }).join('');
    html += '</div>';
    this.mount.innerHTML = html;
  };

  function boot() {
    var mount = document.getElementById('lok-followers-page');
    var SB = window.LokaliSupabaseAPI;
    if (!mount || !SB || !SB.vendors || !SB.posts) return;
    css();
    SB.vendors.me().then(function (r) {
      var vendor = r && r.data;
      if (!vendor || !vendor.id) return; // not a vendor / signed out: lokali-dashboard.js owns the redirect
      new Page(mount, vendor, SB);
    });
  }
  var tries = 0;
  function start() {
    // The page embed can run before the footer's client tag: wait for it, up to ~30s.
    if (!window.LokaliSupabaseReady) { if (++tries < 200) setTimeout(start, 150); return; }
    window.LokaliSupabaseReady.then(function () {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    });
  }
  start();
})();
