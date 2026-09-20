/**
 * lokali-start.js - "Start Here": the new-business checklist at /start (2026-09-20, F).
 *
 * A public, no-account page: two questions (what you sell, how you are set up)
 * build a tailored checklist that mixes the OFFICIAL steps for a small business
 * in Montgomery County, Texas with the Lokali steps. Progress is kept in this
 * browser only (localStorage, try/catch) so it works signed out and prints clean.
 *
 * EVERY legal fact below was read on the official page named in its `src` on
 * LAST_CHECKED. Before editing a fee, a limit or a rule, re-read that page and
 * move the date. This is general information, never legal advice, and the page
 * says so. Mounts into #lokali-start; does nothing when that element is absent.
 * Copy rules: no emoji, no em dashes, Plus Jakarta Sans set explicitly, no ink
 * surfaces, and the vendor CTA stays "Become a vendor".
 */
(function () {
  'use strict';
  var mount = document.getElementById('lokali-start');
  if (!mount || mount.getAttribute('data-ready') === '1') return;
  mount.setAttribute('data-ready', '1');

  var LAST_CHECKED = 'September 19, 2026';
  var KEY = 'lokali_start_v1';
  var FONT = '"Plus Jakarta Sans",sans-serif';

  var SRC = {
    clerk: { t: 'Montgomery County Clerk, Assumed Names', u: 'https://www.mctx.org/index_clerk/public_records/assumed_names_dba/index.php' },
    sos: { t: 'Texas Secretary of State, Form 205 instructions', u: 'https://www.sos.state.tx.us/corp/instructions/205.shtml' },
    irs: { t: 'IRS, Get an employer identification number', u: 'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number' },
    tax: { t: 'Texas Comptroller, Sales tax permit', u: 'https://comptroller.texas.gov/taxes/sales/faq/permit.php' },
    dshs: { t: 'Texas Department of State Health Services, Cottage food production', u: 'https://www.dshs.texas.gov/retail-food-establishments/texas-cottage-food-production' },
    tdlr: { t: 'Texas Department of Licensing and Regulation', u: 'https://www.tdlr.texas.gov/' }
  };

  var SELL = [
    { k: 'food', t: 'Food I make at home' },
    { k: 'goods', t: 'Handmade goods or products' },
    { k: 'service', t: 'A service' }
  ];
  var SETUP = [
    { k: 'sole', t: 'Just me, under a business name' },
    { k: 'llc', t: 'An LLC' },
    { k: 'unsure', t: 'Not sure yet' }
  ];

  function steps(sell, setup) {
    var out = [];
    if (setup === 'llc') {
      out.push({ id: 'llc', t: 'Form your LLC', d: 'File a Certificate of Formation (Form 205) with the Texas Secretary of State. The filing fee is $300, plus 2.7% if you pay by card. An LLC that trades under a different name registers that name with the Secretary of State, not the county.', src: 'sos' });
    } else {
      out.push({ id: 'dba', t: 'Register your business name', d: 'Doing business under any name other than your own? File an Assumed Name Certificate with the Montgomery County Clerk. It costs $22.50 for one owner, plus $0.50 for each extra owner, and you sign it in front of a notary.' + (setup === 'unsure' ? ' Most people start this way. An LLC costs $300 to form and is worth asking an advisor about as you grow.' : ''), src: 'clerk' });
    }
    out.push({ id: 'ein', t: 'Get a tax ID number if you need one', d: 'An EIN is free and the IRS issues it online right away. You need one to hire employees or to run a partnership or corporation. As a sole owner it is optional, and it lets you hand clients an EIN instead of your Social Security number. The IRS never charges for it, so skip any site that does.', src: 'irs' });
    if (sell === 'service') {
      out.push({ id: 'tax', t: 'Check whether your service is taxable', d: 'Texas taxes some services and not others. If yours is taxable, apply for a sales tax permit from the Texas Comptroller. There is no fee to apply.', src: 'tax' });
      out.push({ id: 'lic', t: 'Check whether your trade needs a state license', d: 'Some trades need a Texas license, for example cosmetology, electrical work and air conditioning. Look yours up before you take a paying client.', src: 'tdlr' });
    } else {
      out.push({ id: 'tax', t: 'Apply for a Texas sales tax permit', d: 'You need one if you sell taxable items in Texas. Apply with the Texas Comptroller. There is no fee to apply.', src: 'tax' });
    }
    if (sell === 'food') {
      out.push({ id: 'handler', t: 'Take a food handler course', d: 'Anyone who runs a home food business in Texas must complete a basic food safety course for food handlers. A Food Manager Certification counts too.', src: 'dshs' });
      out.push({ id: 'label', t: 'Label every product', d: 'Each label needs your business name, your address or a state registration number in its place, the product name, allergens, and this statement: "This product was produced in a private residence that is not subject to governmental licensing or inspection." Registering with the state lets you keep your home address off the label.', src: 'dshs' });
      out.push({ id: 'limits', t: 'Know what the home kitchen rules allow', d: 'You can sell up to $150,000 a year from a home kitchen, at farmers markets, farm stands, retail stores and online. Not allowed: meat, poultry, seafood, ice products, low-acid canned goods, CBD or THC products, and raw milk. Foods that need refrigeration require state registration and the date the food was made.', src: 'dshs' });
    }
    out.push({ id: 'lokali', lokali: true, t: 'Become a vendor on Lokali', d: 'Your free storefront takes about ten minutes and comes with your own QR code and review link, so the first customers you meet can find you again.', cta: { t: 'Become a vendor', u: '/sign-up' } });
    if (sell !== 'service') {
      out.push({ id: 'market', t: 'Find your first market', d: 'Local options include The Woodlands Farmers Market at Grogan\'s Mill, the Farmer\'s Market on Tamina, Gosling Sunday Market and Rayford Sunday Market. Check each market\'s site for how to apply.' });
    }
    out.push({ id: 'ask', lokali: true, t: 'Ask your first customers for a review', d: 'One or two reviews change how a stranger reads your storefront. Your Lokali dashboard has a review link and QR code made for handing to customers you meet in person.' });
    return out;
  }

  // ---- state (this browser only) ----
  var state = { sell: null, setup: null, done: {} };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      state.sell = raw.sell || null; state.setup = raw.setup || null;
      state.done = (raw.done && typeof raw.done === 'object') ? raw.done : {};
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function css() {
    if (document.getElementById('lkst-css')) return;
    var s = document.createElement('style'); s.id = 'lkst-css';
    s.textContent = [
      '.lkst{font-family:' + FONT + ';color:#1A1829;background:#F7F6FC;padding:56px 0 72px;}',
      '.lkst *{box-sizing:border-box;font-family:' + FONT + ';}',
      '.lkst-wrap{max-width:760px;margin:0 auto;padding:0 20px;display:flex;flex-direction:column;gap:22px;}',
      '.lkst-eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6002EE;}',
      '.lkst h1{font-size:34px;line-height:1.15;font-weight:800;color:#1A1829;margin:6px 0 10px;}',
      '.lkst-lede{font-size:17px;line-height:1.6;color:#4A4761;margin:0;max-width:62ch;}',
      '.lkst-card{background:#fff;border:1px solid #DEDAEE;border-radius:16px;padding:20px;}',
      '.lkst-q{font-size:16px;font-weight:700;margin:0 0 12px;}',
      '.lkst-chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.lkst-chip{font-size:14px;font-weight:700;min-height:44px;padding:10px 16px;border-radius:999px;border:1px solid #DEDAEE;background:#fff;color:#4A4761;cursor:pointer;}',
      '.lkst-chip[aria-pressed="true"]{background:#6002EE;border-color:#6002EE;color:#fff;}',
      '.lkst-chip:focus-visible,.lkst-btn:focus-visible,.lkst-step input:focus-visible,.lkst a:focus-visible{outline:3px solid #C9B3FA;outline-offset:2px;}',
      '.lkst-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
      '.lkst-head h2{font-size:22px;font-weight:800;margin:0;}',
      '.lkst-count{font-size:13px;font-weight:700;color:#6002EE;background:#F3EBFF;border-radius:999px;padding:5px 12px;font-variant-numeric:tabular-nums;}',
      '.lkst-bar{height:8px;border-radius:999px;background:#E4DCF7;overflow:hidden;margin:12px 0 4px;}',
      '.lkst-bar i{display:block;height:100%;background:#6002EE;border-radius:999px;transition:width .25s;}',
      '.lkst-step{display:flex;gap:14px;align-items:flex-start;padding:16px 0;border-top:1px solid #EEEDF6;}',
      '.lkst-step:first-of-type{border-top:0;}',
      '.lkst-step.lk{background:#F3EBFF;border-radius:12px;padding:16px;border-top:0;margin:8px 0;}',
      '.lkst-step input{width:22px;height:22px;margin:2px 0 0;accent-color:#6002EE;flex:none;cursor:pointer;}',
      '.lkst-step label{font-size:16px;font-weight:700;line-height:1.35;cursor:pointer;display:block;}',
      '.lkst-step.done label{color:#6B6880;text-decoration:line-through;}',
      '.lkst-step p{font-size:14.5px;line-height:1.6;color:#4A4761;margin:6px 0 0;}',
      '.lkst-src{display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:#6002EE;text-decoration:none;}',
      '.lkst-src:hover{text-decoration:underline;}',
      '.lkst-btn{display:inline-block;margin-top:12px;font-size:14px;font-weight:700;min-height:44px;line-height:22px;padding:11px 20px;border-radius:999px;border:0;background:#6002EE;color:#fff;text-decoration:none;cursor:pointer;}',
      '.lkst-btn.ghost{background:#fff;color:#6002EE;border:1px solid #E4DCF7;margin-top:0;}',
      '.lkst-fine{font-size:13px;line-height:1.65;color:#6B6880;margin:0;}',
      '.lkst-fine a{color:#6002EE;font-weight:600;text-decoration:none;}',
      '@media(max-width:600px){.lkst{padding:36px 0 56px;}.lkst h1{font-size:27px;}.lkst-lede{font-size:16px;}.lkst-card{padding:16px;}}',
      '@media (prefers-reduced-motion:reduce){.lkst-bar i{transition:none;}}',
      '@media print{.lkst{background:#fff;padding:0;}.lkst-chips,.lkst-btn,.lkst-noprint{display:none !important;}.lkst-card{border:0;padding:0;}.lkst-step.lk{background:#fff;border:1px solid #DEDAEE;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function chips(name, list, cur) {
    return '<div class="lkst-chips" role="group" aria-label="' + esc(name) + '">' + list.map(function (o) {
      return '<button type="button" class="lkst-chip" data-g="' + name + '" data-k="' + o.k + '" aria-pressed="' + (cur === o.k ? 'true' : 'false') + '">' + esc(o.t) + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    var ready = !!(state.sell && state.setup);
    var html = '<div class="lkst"><div class="lkst-wrap">' +
      '<div><span class="lkst-eyebrow">Start here</span>' +
      '<h1>Starting a small business in Montgomery County?</h1>' +
      '<p class="lkst-lede">Answer two questions and get a checklist made for what you sell: the official steps, what each one costs, and where Lokali fits. It is free, and you do not need an account.</p></div>' +
      '<div class="lkst-card"><p class="lkst-q" id="lkst-q1">What will you sell?</p>' + chips('sell', SELL, state.sell) + '</div>' +
      '<div class="lkst-card"><p class="lkst-q" id="lkst-q2">How are you setting up?</p>' + chips('setup', SETUP, state.setup) + '</div>';

    if (ready) {
      var list = steps(state.sell, state.setup);
      var n = list.filter(function (s) { return state.done[s.id]; }).length;
      var pct = Math.round(n / list.length * 100);
      html += '<div class="lkst-card" id="lkst-list"><div class="lkst-head"><h2>Your checklist</h2><span class="lkst-count">' + n + ' of ' + list.length + ' done</span></div>' +
        '<div class="lkst-bar" role="img" aria-label="' + n + ' of ' + list.length + ' steps done"><i style="width:' + pct + '%"></i></div>' +
        list.map(function (s) {
          var on = !!state.done[s.id];
          var src = s.src ? '<a class="lkst-src" href="' + SRC[s.src].u + '" target="_blank" rel="noopener">Official source: ' + esc(SRC[s.src].t) + '</a>' : '';
          var cta = s.cta ? '<div class="lkst-noprint"><a class="lkst-btn" href="' + s.cta.u + '">' + esc(s.cta.t) + '</a></div>' : '';
          return '<div class="lkst-step' + (s.lokali ? ' lk' : '') + (on ? ' done' : '') + '">' +
            '<input type="checkbox" id="lkst-c-' + s.id + '" data-step="' + s.id + '"' + (on ? ' checked' : '') + '>' +
            '<div><label for="lkst-c-' + s.id + '">' + esc(s.t) + '</label><p>' + esc(s.d) + '</p>' + src + cta + '</div></div>';
        }).join('') +
        '</div>' +
        '<div class="lkst-noprint"><button type="button" class="lkst-btn ghost" data-act="print">Print this checklist</button></div>';
    }

    html += '<p class="lkst-fine">This is general information, not legal advice. Fees and rules change, so follow the official source on each step. Every fact here was checked against its official page on ' + LAST_CHECKED + '. County steps are for Montgomery County. In Harris, Fort Bend or Waller County the state steps are the same and your county clerk sets the name filing fee. Your progress is saved in this browser only. Spotted something out of date? <a href="/contact-us">Tell us</a>.</p>' +
      '</div></div>';
    mount.innerHTML = html;
  }

  mount.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-g],[data-act]') : null;
    if (!t) return;
    if (t.getAttribute('data-act') === 'print') { window.print(); return; }
    var g = t.getAttribute('data-g'), k = t.getAttribute('data-k');
    var first = !(state.sell && state.setup);
    state[g] = k; save(); render();
    var again = mount.querySelector('[data-g="' + g + '"][data-k="' + k + '"]');
    if (again) again.focus();
    if (first && state.sell && state.setup) {
      var list = document.getElementById('lkst-list');
      if (list && list.scrollIntoView) {
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        list.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      }
    }
  });
  mount.addEventListener('change', function (e) {
    var id = e.target && e.target.getAttribute && e.target.getAttribute('data-step');
    if (!id) return;
    if (e.target.checked) state.done[id] = 1; else delete state.done[id];
    save(); render();
    var box = document.getElementById('lkst-c-' + id);
    if (box) box.focus();
  });

  css();
  render();
})();
