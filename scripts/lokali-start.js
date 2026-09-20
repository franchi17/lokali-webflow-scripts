/**
 * lokali-start.js - "Start Here": the new-business checklist at /start (2026-09-20, F).
 *
 * A public, no-account page: product or service first (services are where the
 * licenses and certifications live), then the kind, then how you are set up,
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

  var LAST_CHECKED = 'September 20, 2026';
  var KEY = 'lokali_start_v2';
  var FONT = '"Plus Jakarta Sans",sans-serif';

  // Every entry was opened and read on LAST_CHECKED. `t` is the link label.
  var SRC = {
    clerk: { t: 'Montgomery County Clerk, Assumed Names', u: 'https://www.mctx.org/index_clerk/public_records/assumed_names_dba/index.php' },
    sos: { t: 'Texas Secretary of State, Form 205 instructions', u: 'https://www.sos.state.tx.us/corp/instructions/205.shtml' },
    irs: { t: 'IRS, Get an employer identification number', u: 'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number' },
    tax: { t: 'Texas Comptroller, Sales tax permit', u: 'https://comptroller.texas.gov/taxes/sales/faq/permit.php' },
    taxsvc: { t: 'Texas Comptroller, Taxable services', u: 'https://comptroller.texas.gov/taxes/publications/96-259.php' },
    dshs: { t: 'Texas Department of State Health Services, Cottage food production', u: 'https://www.dshs.texas.gov/retail-food-establishments/texas-cottage-food-production' },
    dshsfood: { t: 'Texas Department of State Health Services, Retail food permits', u: 'https://www.dshs.texas.gov/retail-food-establishments/permitting-information-retail-food-establishments' },
    mcfood: { t: 'Montgomery County Environmental Health, Consumer health and food', u: 'https://www.mctx.org/departments/departments_d_-_f/environmental_health/consumer_health_and_food.php' },
    tdlr: { t: 'Texas Department of Licensing and Regulation, full list of licenses', u: 'https://www.tdlr.texas.gov/licenses.htm' },
    tsbpe: { t: 'Texas State Board of Plumbing Examiners', u: 'https://tsbpe.texas.gov/' },
    ccr: { t: 'Texas Health and Human Services, Become a child care provider', u: 'https://www.hhs.texas.gov/providers/child-care-regulation/become-a-provider' },
    guide: { t: 'Office of the Governor, Texas Business Licenses and Permits Guide (PDF)', u: 'https://gov.texas.gov/uploads/files/business/Texas_Licenses_Permits_Guide.pdf' },
    permits: { t: 'Office of the Governor, Texas Business Permit Office', u: 'https://gov.texas.gov/business/page/business-permits-office' },
    sbalic: { t: 'U.S. Small Business Administration, Apply for licenses and permits', u: 'https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits' },
    sbabank: { t: 'U.S. Small Business Administration, Open a business bank account', u: 'https://www.sba.gov/business-guide/launch-your-business/open-business-bank-account' },
    sbains: { t: 'U.S. Small Business Administration, Get business insurance', u: 'https://www.sba.gov/business-guide/launch-your-business/get-business-insurance' }
  };

  // Free help, shown under every checklist. Same rule: opened and read on LAST_CHECKED.
  var HELP = [
    { t: 'SBA: 10 steps to start your business', d: 'The federal government\'s own walk-through, from market research to insurance.', u: 'https://www.sba.gov/business-guide/10-steps-start-your-business' },
    { t: 'Small Business Development Center at The Woodlands', d: 'One-on-one business advising for Montgomery County, run by Sam Houston State University with SBA funding.', u: 'https://www.sbdc.uh.edu/sbdc/Sam_Houston_State_University_SBDC_at_The_Woodlands.asp' },
    { t: 'SCORE mentors', d: 'Volunteer mentors who have run businesses themselves. An SBA partner.', u: 'https://www.score.org/find-mentor' },
    { t: 'Texas Small Business Resource Portal', d: 'Five short questions, then a list of state and local resources from the Governor\'s office.', u: 'https://gov.texas.gov/business/page/small-business-portal' }
  ];

  var KIND = [
    { k: 'product', t: 'A product' },
    { k: 'service', t: 'A service' },
    { k: 'both', t: 'Both' }
  ];
  var PRODUCT = [
    { k: 'food', t: 'Food I make at home' },
    { k: 'goods', t: 'Handmade goods or other products' }
  ];
  var SERVICE = [
    { k: 'care', t: 'Beauty, wellness or personal care' },
    { k: 'trade', t: 'Home repair or a skilled trade' },
    { k: 'foodsvc', t: 'Catering or food service' },
    { k: 'kids', t: 'Child care, tutoring or classes' },
    { k: 'pro', t: 'Professional, creative or something else' }
  ];
  var SETUP = [
    { k: 'sole', t: 'Just me, under a business name' },
    { k: 'llc', t: 'An LLC' },
    { k: 'unsure', t: 'Not sure yet' }
  ];

  var NO_GENERAL = ' Texas has no general state business license, so what you need depends on the work you do.';
  var LICENSE = {
    care: { d: 'Most hands-on personal care needs a Texas license before you take a paying client. Barbering and cosmetology (hair, nails, skin, lashes), massage therapy and laser hair removal are all licensed by the Texas Department of Licensing and Regulation. Dietitians and athletic trainers are too.' + NO_GENERAL, src: ['tdlr', 'guide'] },
    trade: { d: 'Electricians and air conditioning contractors are licensed by the Texas Department of Licensing and Regulation, and plumbers by the Texas State Board of Plumbing Examiners. Look your trade up before you take a paying job, and ask your city whether the job itself needs a permit.' + NO_GENERAL, src: ['tdlr', 'tsbpe', 'guide'] },
    kids: { d: 'Caring for children, including in your own home, is regulated by Texas Health and Human Services, which sets out the steps to become a provider. Other teaching and coaching work varies, so look yours up in the state guide.' + NO_GENERAL, src: ['ccr', 'guide'] },
    pro: { d: 'Many professions are licensed by their own state board, for example real estate, accounting and pest control. The state guide lists every license by occupation, and the Texas Business Permit Office will help you work out which ones apply to you.' + NO_GENERAL, src: ['guide', 'permits', 'tdlr'] }
  };

  function steps(st) {
    var out = [];
    var product = st.kind === 'product' || st.kind === 'both';
    var service = st.kind === 'service' || st.kind === 'both';
    var setup = st.setup;
    if (setup === 'llc') {
      out.push({ id: 'llc', t: 'Form your LLC', d: 'File a Certificate of Formation (Form 205) with the Texas Secretary of State. The filing fee is $300, plus 2.7% if you pay by card. An LLC that trades under a different name registers that name with the Secretary of State, not the county.', src: ['sos'] });
    } else {
      out.push({ id: 'dba', t: 'Register your business name', d: 'Doing business under any name other than your own? File an Assumed Name Certificate with the Montgomery County Clerk. It costs $22.50 for one owner, plus $0.50 for each extra owner, and you sign it in front of a notary.' + (setup === 'unsure' ? ' Most people start this way. An LLC costs $300 to form and is worth asking an SBDC advisor about as you grow (see Free help below).' : ''), src: ['clerk'] });
    }
    out.push({ id: 'ein', t: 'Get a tax ID number if you need one', d: 'An EIN is free and the IRS issues it online right away. You need one to hire employees or to run a partnership or corporation. As a sole owner it is optional, and it lets you hand clients an EIN instead of your Social Security number. The IRS never charges for it, so skip any site that does.', src: ['irs'] });

    if (service && st.service === 'foodsvc') {
      out.push({ id: 'foodpermit', t: 'Get your food permit before you serve', d: 'Catering and other food service is not covered by the home kitchen rules. In Montgomery County, food establishments and temporary event booths are permitted by County Environmental Health. Food trucks and other mobile vendors moved to the Texas Department of State Health Services on July 1, 2026.', src: ['mcfood', 'dshsfood'] });
      out.push({ id: 'handler', t: 'Take a food handler course', d: 'Food safety training is part of every food permit. Ask the office that issues yours whether you also need a Certified Food Manager.', src: ['dshsfood'] });
    } else if (service) {
      var L = LICENSE[st.service];
      out.push({ id: 'lic', t: 'Check the license or certification your work needs', d: L.d, src: L.src });
    }
    if (service) {
      out.push({ id: 'taxsvc', t: 'Check whether your service is taxable', d: 'Texas taxes some services and not others. Taxable ones include landscaping, pest control and janitorial work, repairs to personal property, and security services. If yours is on the list, apply for a sales tax permit from the Texas Comptroller. There is no fee to apply.', src: ['taxsvc', 'tax'] });
    }
    if (product) {
      out.push({ id: 'tax', t: 'Apply for a Texas sales tax permit', d: 'You need one if you sell taxable items in Texas. Apply with the Texas Comptroller. There is no fee to apply.', src: ['tax'] });
    }
    if (product && st.product === 'food') {
      out.push({ id: 'handler', t: 'Take a food handler course', d: 'Anyone who runs a home food business in Texas must complete a basic food safety course for food handlers. A Food Manager Certification counts too.', src: ['dshs'] });
      out.push({ id: 'label', t: 'Label every product', d: 'Each label needs your business name, your address or a state registration number in its place, the product name, allergens, and this statement: "This product was produced in a private residence that is not subject to governmental licensing or inspection." Registering with the state lets you keep your home address off the label.', src: ['dshs'] });
      out.push({ id: 'limits', t: 'Know what the home kitchen rules allow', d: 'You can sell up to $150,000 a year from a home kitchen, at farmers markets, farm stands, retail stores and online. Not allowed: meat, poultry, seafood, ice products, low-acid canned goods, CBD or THC products, and raw milk. Foods that need refrigeration require state registration and the date the food was made.', src: ['dshs'] });
    }
    out.push({ id: 'bank', t: 'Keep business money separate', d: 'Not a legal requirement for a sole owner, and the SBA recommends it for everyone: a business bank account keeps your records clean at tax time. Think about insurance too. General liability is the usual starting point, and some venues and markets ask for proof of it.', src: ['sbabank', 'sbains'] });

    var seen = {};
    out = out.filter(function (s) { if (seen[s.id]) return false; seen[s.id] = 1; return true; });

    out.push({ id: 'lokali', lokali: true, t: 'Create your free Lokali account', d: 'Become a vendor and your storefront goes up in about ten minutes: photos, what you offer, how to reach you, and your own QR code and review link, so the first customers you meet can find you again.', cta: { t: 'Become a vendor', u: '/sign-up' } });
    if (product) {
      out.push({ id: 'market', t: 'Find your first market', d: 'Local options include The Woodlands Farmers Market at Grogan\'s Mill, the Farmer\'s Market on Tamina, Gosling Sunday Market and Rayford Sunday Market. Check each market\'s site for how to apply.' });
    }
    out.push({ id: 'ask', lokali: true, t: 'Ask your first customers for a review', d: 'One or two reviews change how a stranger reads your storefront. Your Lokali dashboard has a review link and QR code made for handing to customers you meet in person.' });
    return out;
  }

  // ---- state (this browser only) ----
  var state = { kind: null, product: null, service: null, setup: null, done: {} };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      state.kind = raw.kind || null; state.product = raw.product || null;
      state.service = raw.service || null; state.setup = raw.setup || null;
      state.done = (raw.done && typeof raw.done === 'object') ? raw.done : {};
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function isReady() {
    if (!state.kind || !state.setup) return false;
    if (state.kind !== 'service' && !state.product) return false;
    if (state.kind !== 'product' && !state.service) return false;
    return true;
  }

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
      '.lkst-hint{font-size:14px;line-height:1.55;color:#6B6880;margin:-4px 0 12px;}',
      '.lkst-help{padding:14px 0;border-top:1px solid #EEEDF6;}',
      '.lkst-help:first-of-type{border-top:0;}',
      '.lkst-help a{font-size:15.5px;font-weight:700;color:#6002EE;text-decoration:none;}',
      '.lkst-help a:hover{text-decoration:underline;}',
      '.lkst-help p{font-size:14.5px;line-height:1.6;color:#4A4761;margin:4px 0 0;}',
      '.lkst-join{background:#F3EBFF;border-color:#E4DCF7;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}',
      '.lkst-join h2{font-size:20px;font-weight:800;margin:0 0 4px;}',
      '.lkst-join p{font-size:15px;line-height:1.55;color:#4A4761;margin:0;max-width:46ch;}',
      '.lkst-join .lkst-btn{margin-top:0;}',
      '.lkst-src{display:block;width:fit-content;margin-top:8px;font-size:13px;font-weight:600;color:#6002EE;text-decoration:none;}',
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

  function chips(name, label, list, cur) {
    return '<div class="lkst-chips" role="group" aria-label="' + esc(label) + '">' + list.map(function (o) {
      return '<button type="button" class="lkst-chip" data-g="' + name + '" data-k="' + o.k + '" aria-pressed="' + (cur === o.k ? 'true' : 'false') + '">' + esc(o.t) + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    var ready = isReady();
    var html = '<div class="lkst"><div class="lkst-wrap">' +
      '<div><span class="lkst-eyebrow">Start here</span>' +
      '<h1>Starting a small business in Montgomery County?</h1>' +
      '<p class="lkst-lede">Answer a few questions and get a checklist made for what you sell: the official steps, what each one costs, the licenses to check, and where Lokali fits. It is free, and you do not need an account.</p></div>' +
      '<div class="lkst-card"><p class="lkst-q">Are you selling a product or a service?</p>' + chips('kind', 'Product or service', KIND, state.kind) + '</div>';
    if (state.kind === 'product' || state.kind === 'both') {
      html += '<div class="lkst-card"><p class="lkst-q">What kind of product?</p>' + chips('product', 'Kind of product', PRODUCT, state.product) + '</div>';
    }
    if (state.kind === 'service' || state.kind === 'both') {
      html += '<div class="lkst-card"><p class="lkst-q">What kind of service?</p><p class="lkst-hint">Services are where licenses and certifications come in, so this one shapes your list the most.</p>' + chips('service', 'Kind of service', SERVICE, state.service) + '</div>';
    }
    if (state.kind) {
      html += '<div class="lkst-card"><p class="lkst-q">How are you setting up?</p>' + chips('setup', 'Business setup', SETUP, state.setup) + '</div>';
    }

    if (ready) {
      var list = steps(state);
      var n = list.filter(function (s) { return state.done[s.id]; }).length;
      var pct = Math.round(n / list.length * 100);
      html += '<div class="lkst-card" id="lkst-list"><div class="lkst-head"><h2>Your checklist</h2><span class="lkst-count">' + n + ' of ' + list.length + ' done</span></div>' +
        '<div class="lkst-bar" role="img" aria-label="' + n + ' of ' + list.length + ' steps done"><i style="width:' + pct + '%"></i></div>' +
        list.map(function (s) {
          var on = !!state.done[s.id];
          var src = (s.src || []).map(function (k) {
            return '<a class="lkst-src" href="' + SRC[k].u + '" target="_blank" rel="noopener">Official source: ' + esc(SRC[k].t) + '</a>';
          }).join('');
          var cta = s.cta ? '<div class="lkst-noprint"><a class="lkst-btn" href="' + s.cta.u + '">' + esc(s.cta.t) + '</a></div>' : '';
          return '<div class="lkst-step' + (s.lokali ? ' lk' : '') + (on ? ' done' : '') + '">' +
            '<input type="checkbox" id="lkst-c-' + s.id + '" data-step="' + s.id + '"' + (on ? ' checked' : '') + '>' +
            '<div><label for="lkst-c-' + s.id + '">' + esc(s.t) + '</label><p>' + esc(s.d) + '</p>' + src + cta + '</div></div>';
        }).join('') +
        '</div>' +
        '<div class="lkst-noprint"><button type="button" class="lkst-btn ghost" data-act="print">Print this checklist</button></div>' +
        '<div class="lkst-card"><div class="lkst-head"><h2>Free help, from people who do this every day</h2></div>' +
        '<p class="lkst-hint">None of these charge you, and none of them are Lokali.</p>' +
        HELP.map(function (h) {
          return '<div class="lkst-help"><a href="' + h.u + '" target="_blank" rel="noopener">' + esc(h.t) + '</a><p>' + esc(h.d) + '</p></div>';
        }).join('') + '</div>' +
        '<div class="lkst-card lkst-join lkst-noprint"><div><h2>Ready for customers?</h2><p>Create your free Lokali account and put your business in front of neighbors in about ten minutes.</p></div>' +
        '<a class="lkst-btn" href="/sign-up">Become a vendor</a></div>';
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
    var first = !isReady();
    state[g] = k; save(); render();
    var again = mount.querySelector('[data-g="' + g + '"][data-k="' + k + '"]');
    if (again) again.focus();
    if (first && isReady()) {
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
