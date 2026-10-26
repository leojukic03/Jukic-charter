(() => {
  const C = window.CHARTER;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- Language ---------------- */
  const pathEn = /\/en\/?$/.test(location.pathname);
  const BASE = document.documentElement.dataset.base || ''; // '../' on the /en/ copy
  // Language follows the URL: / is Croatian, /en/ is English (each has its own indexable page).
  let lang = new URLSearchParams(location.search).get('lang') || (pathEn ? 'en' : 'hr');
  lang = lang === 'en' ? 'en' : 'hr';
  const T = () => window.SITE_TXT[lang];
  const hrOriginal = new Map();

  function applyLang() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      if (!hrOriginal.has(el)) hrOriginal.set(el, el.textContent);
      el.textContent = lang === 'en' ? (window.SITE_EN[k] ?? hrOriginal.get(el)) : hrOriginal.get(el);
    });
    $$('[data-lang-toggle]').forEach((b) => { b.textContent = lang === 'en' ? 'HR' : 'EN'; b.setAttribute('aria-label', lang === 'en' ? 'Hrvatski' : 'English'); });
    $$('a[data-guide]').forEach((a) => { a.href = BASE + 'vodic/' + (lang === 'en' ? '?lang=en' : ''); });
    bindConfig(); renderPrices(); cal.render(); updateSum(); story.stats();
  }
  $$('[data-lang-toggle]').forEach((b) => b.addEventListener('click', () => {
    location.href = (lang === 'en' ? BASE : 'en/') + location.hash;
  }));

  /* ---------------- Config → page ---------------- */
  const money = (v) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hr-HR', { style: 'currency', currency: (R && R.currency) || 'EUR', maximumFractionDigits: 0 }).format(v);
  const num = (v, d = 1) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hr-HR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

  function bindConfig() {
    $$('[data-brand]').forEach((e) => (e.textContent = C.brand.name));
    $$('[data-address]').forEach((e) => (e.textContent = C.brand.address));
    $$('[data-phone]').forEach((e) => { e.textContent = C.brand.phone; e.href = 'tel:' + C.brand.phone.replace(/\s/g, ''); });
    $$('[data-mail]').forEach((e) => { if (!e.textContent.trim() || e.textContent.includes('@')) e.textContent = C.brand.email; e.href = `mailto:${C.brand.email}?subject=${encodeURIComponent(T().mailSubject)}`; });
    $$('[data-wa]').forEach((e) => (e.href = `https://wa.me/${C.brand.whatsapp}?text=${encodeURIComponent(T().waIntro)}`));
    renderBoat();
    if (R) $$('[data-deposit]').forEach((e) => (e.textContent = money(R.deposit)));
    const g = $('input[name="guests"]'); if (g) g.max = R ? R.maxGuests : C.boat.maxGuests;
  }
  /* ---------------- Boat: details and photos the owner edits in /admin/ ---------------- */
  let boatDetails = null, boatPhotos = [];
  const dim = (v) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hr-HR', { maximumFractionDigits: 2 }).format(v);
  function renderBoat() {
    const d = boatDetails;
    const b = C.boat;
    const en = lang === 'en';
    const dl = $('.boat__specs dl');
    if (dl) {
      const label = (k, hr) => (en ? window.SITE_EN[k] : hr);
      const engine = (d && d.engine) || b.engine.replace(/^.*?(\d+\s*KS|\d+\s*hp)$/i, '$1').replace('KS', en ? 'hp' : 'KS');
      const rows = [
        ['spec.guests', 'Osoba', (d && d.maxGuests) || b.maxGuests, (v) => T().guests(v)],
        ['spec.berths', 'Ležajevi', d && d.berths, (v) => String(v)],
        ['spec.length', 'Duljina', (d && d.lengthM) || b.lengthM, (v) => `${dim(v)} m`],
        ['spec.beam', 'Širina', d && d.beamM, (v) => `${dim(v)} m`],
        ['spec.engine', 'Motor', engine, (v) => v],
        ['spec.tank', 'Spremnik goriva', (d && d.fuelTankL) || b.fuelTankL, (v) => `${v} L`],
        ['spec.water', 'Voda', d && d.waterTankL, (v) => `${v} L`],
        ['spec.year', 'Godina', d && d.year, (v) => String(v)],
      ].filter((r) => r[2]);
      dl.innerHTML = rows.map(([k, hr, v, f]) => `<div><dt>${escapeHtml(label(k, hr))}</dt><dd>${escapeHtml(f(v))}</dd></div>`).join('');
    }
    const feats = d ? ((en && d.features_en && d.features_en.length ? d.features_en : d.features_hr) || []) : b.features;
    const ul = $('[data-boat-features]');
    if (ul) ul.innerHTML = feats.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
    const desc = $('[data-boat-desc]');
    const text = d ? (en ? d.description_en || d.description_hr : d.description_hr) : '';
    if (desc) { desc.textContent = text || ''; desc.hidden = !text; }
    renderGallery();
  }
  function renderGallery() {
    const g = $('[data-gallery]'), art = $('#boatArt');
    if (!g) return;
    const has = boatPhotos.length > 0;
    g.hidden = !has; if (art) art.hidden = has;
    if (!has) return;
    const track = $('[data-gallery-track]', g);
    track.innerHTML = boatPhotos.map((p, i) => {
      const alt = (lang === 'en' ? p.alt_en || p.alt_hr : p.alt_hr) || `Merry Fisher 795, ${i + 1}/${boatPhotos.length}`;
      const dims = p.width && p.height ? ` width="${p.width}" height="${p.height}"` : '';
      return `<figure class="gallery__slide"><img src="${BASE}${p.url.replace(/^\//, '')}" alt="${escapeHtml(alt)}"${dims} ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async"></figure>`;
    }).join('');
    galleryUpdate();
  }
  function galleryIndex() {
    const track = $('[data-gallery-track]');
    const w = track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 12 : 1;
    return Math.max(0, Math.min(boatPhotos.length - 1, Math.round(track.scrollLeft / w)));
  }
  function galleryUpdate() {
    const i = galleryIndex();
    $('[data-gallery-count]').textContent = `${i + 1} / ${boatPhotos.length}`;
    $('[data-gallery-prev]').disabled = i === 0;
    $('[data-gallery-next]').disabled = i === boatPhotos.length - 1;
  }
  (() => {
    const track = $('[data-gallery-track]'); if (!track) return;
    const go = (d) => { const s = track.children[galleryIndex() + d]; if (s) s.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' }); };
    $('[data-gallery-prev]').addEventListener('click', () => go(-1));
    $('[data-gallery-next]').addEventListener('click', () => go(1));
    track.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } });
    let t = 0; track.addEventListener('scroll', () => { cancelAnimationFrame(t); t = requestAnimationFrame(galleryUpdate); }, { passive: true });
  })();
  async function loadBoat() {
    try {
      const r = await fetch(BASE + 'api/boat');
      if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return;
      const j = await r.json();
      boatDetails = j.details || null; boatPhotos = j.photos || [];
      renderBoat();
    } catch (e) { /* no server: keep the illustration and config */ }
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Prices ---------------- */
  // Prices and rules live in data/booking.json; the same rules module runs on the server, which recomputes the price.
  let R = null, RM = null, online = false;
  const L = (o) => (o && typeof o === 'object' ? o[lang] || o.hr : o);
  function renderPrices() {
    const el = $('[data-price-table]'); if (!el || !R) return;
    const head = `<div class="prices__row prices__row--head"><span>${T().season}</span><span>${T().perDayCol(R.minDays)}</span><span>${T().perWeekCol}</span></div>`;
    const fmtRange = ([a, b]) => `${a.slice(3)}.${a.slice(0, 2)}.–${b.slice(3)}.${b.slice(0, 2)}.`;
    const rows = R.seasons.map((s) => `<div class="prices__row"><span><strong style="font-size:1rem">${escapeHtml(L(s.label))}</strong><small>${s.ranges.map(fmtRange).join(', ')}</small></span><span><strong>${money(s.perDay)}</strong></span><span><strong>${money(s.perWeek)}</strong></span></div>`).join('');
    el.style.gridTemplateColumns = '1fr';
    el.innerHTML = head + rows;
    $$('.prices__row', el).forEach((r) => (r.style.gridTemplateColumns = '1.3fr 1fr 1fr'));
    const t = T();
    $('[data-price-note]').textContent = [t.weekNote(R.weeklyFromDays), R.cleaningFee ? t.cleaningNote(money(R.cleaningFee)) : '',
      t.timesNote(R.checkIn, R.checkOut), t.fuelNote(R.fuelIncluded, money(R.deposit)), R.payment.mode === 'advance' ? t.advanceNote(R.payment.advancePercent) : '']
      .filter(Boolean).join(' ');
  }

  /* ---------------- Booking: pick-up day + number of days ---------------- */
  const state = { date: null, days: 7, taken: new Set() };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let range = null; // bookable { from, to }
  const fmtDay = (isoStr, opts = { weekday: 'short', day: 'numeric', month: 'long' }) => new Date(isoStr + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'hr-HR', opts);
  const maxFrom = (start) => RM.freeRun(R, start, state.taken, range.to);
  const daysInput = () => $('input[name="days"]');

  const cal = (() => {
    const root = $('[data-cal]');
    let view = null;
    function init() {
      range = RM.bookableRange(R, RM.todayIn(R.timezone));
      const first = new Date(range.from + 'T00:00');
      view = new Date(first.getFullYear(), first.getMonth(), 1);
      // Open on the first month with a day where a minimum rental fits.
      for (let i = 0; i < 14; i++) {
        const last = new Date(view.getFullYear(), view.getMonth() + 1, 0);
        let any = false;
        for (let d = new Date(view); d <= last && !any; d.setDate(d.getDate() + 1)) { const k = iso(d); if (k >= range.from && maxFrom(k) >= R.minDays) any = true; }
        if (any) break;
        view.setMonth(view.getMonth() + 1);
      }
      render();
    }
    function render() {
      if (!root || !view) return;
      const t = T();
      $('[data-cal-title]', root).textContent = `${t.months[view.getMonth()]} ${view.getFullYear()}`;
      $('[data-cal-dow]', root).innerHTML = t.dow.map((d) => `<span>${d}</span>`).join('');
      const offset = (view.getDay() + 6) % 7;
      const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      const selEnd = state.date ? RM.endOf(state.date, state.days) : null;
      let html = '';
      for (let i = 0; i < offset; i++) html += '<span class="day day--blank"></span>';
      for (let n = 1; n <= daysInMonth; n++) {
        const k = iso(new Date(view.getFullYear(), view.getMonth(), n));
        const s = RM.seasonFor(R, k);
        const taken = state.taken.has(k);
        const canStart = !taken && k >= range.from && maxFrom(k) >= R.minDays;
        const inSel = state.date && k >= state.date && k <= selEnd;
        const price = canStart && s ? money(s.perDay) : '';
        const label = `${n}. ${t.months[view.getMonth()]}${taken ? ', ' + t.booked : !s ? ', ' + t.offSeason : price ? ', ' + t.from + ' ' + price : ''}`;
        const edge = inSel ? (k === state.date ? 'start' : k === selEnd ? 'end' : 'mid') : '';
        html += `<button type="button" class="day" data-date="${k}" role="gridcell" aria-label="${label}" aria-selected="${!!inSel}" ${edge ? `data-sel="${edge}"` : ''} ${canStart ? '' : 'disabled'} ${taken ? 'data-booked' : ''}>${n}${price ? `<small>${price.replace(/\s/g, '')}</small>` : ''}</button>`;
      }
      $('[data-cal-days]', root).innerHTML = html;
      $('[data-cal-prev]', root).disabled = view <= new Date(range.from.slice(0, 7) + '-01T00:00');
      $('[data-cal-next]', root).disabled = view >= new Date(range.to.slice(0, 7) + '-01T00:00');
    }
    if (root) {
      $('[data-cal-prev]', root).addEventListener('click', () => { view.setMonth(view.getMonth() - 1); render(); });
      $('[data-cal-next]', root).addEventListener('click', () => { view.setMonth(view.getMonth() + 1); render(); });
      $('[data-cal-days]', root).addEventListener('click', (e) => {
        const b = e.target.closest('.day[data-date]'); if (!b || b.disabled) return;
        state.date = b.dataset.date;
        fitDays(); render(); updateSum(); clearError();
      });
    }
    return { init, render };
  })();

  // Keep the number of days within the rules and within the free run from the chosen start.
  function fitDays() {
    const hint = $('[data-range-hint]');
    let max = R.maxDays;
    hint.textContent = '';
    if (state.date) {
      max = Math.min(max, maxFrom(state.date));
      if (max < R.minDays) { hint.textContent = T().hintNoStart(R.minDays); state.date = null; max = R.maxDays; }
      else if (max < R.maxDays) hint.textContent = T().hintMax(max);
    }
    state.days = Math.max(R.minDays, Math.min(max, state.days));
    const i = daysInput(); i.min = R.minDays; i.max = max; i.value = state.days;
  }
  $$('[data-days-step]').forEach((b) => b.addEventListener('click', () => {
    if (!R) return;
    state.days += +b.dataset.daysStep; fitDays(); cal.render(); updateSum();
  }));
  document.addEventListener('change', (e) => {
    if (e.target.name === 'days' && R) { state.days = Number.parseInt(e.target.value, 10) || R.minDays; fitDays(); cal.render(); updateSum(); }
    if (e.target.name === 'license') clearError();
  });
  $$('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const i = $('input[name="guests"]');
    i.value = Math.max(1, Math.min(R ? R.maxGuests : C.boat.maxGuests, (+i.value || 1) + +b.dataset.step));
  }));

  function quote() {
    if (!state.date || !R) return null;
    const q = RM.quote(R, { date: state.date, days: state.days });
    if (!q) return null;
    const rangeTxt = T().range(`${fmtDay(state.date)} ${R.checkIn}`, `${fmtDay(q.end)} ${R.checkOut}`, RM.daysLabel(state.days, lang));
    return { ...q, rangeTxt };
  }
  function updateSum() {
    const q = quote();
    const lbl = $('[data-sum-label]'), tot = $('[data-sum-total]'), det = $('[data-sum-detail]');
    if (!lbl || !R) return;
    if (!q) { lbl.textContent = T().pickDate; tot.textContent = '—'; det.textContent = ''; return; }
    const split = online && q.payLater > 0;
    lbl.textContent = split ? T().payNowLabel : T().pickPkg;
    tot.textContent = money(split ? q.payNow : q.total);
    det.textContent = `${q.rangeTxt}. ${T().breakdown(money(q.rental), money(q.cleaning), q.weekly)} `
      + (split ? T().splitNote(money(q.total), money(q.payLater)) + ' ' : '')
      + T().fuelNote(R.fuelIncluded, money(R.deposit));
  }

  const errEl = $('[data-form-error]');
  const showError = (msg, field) => { errEl.textContent = msg; errEl.hidden = false; if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); } };
  const clearError = () => { if (errEl) errEl.hidden = true; $$('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid')); };
  const submitLabel = () => {
    const b = $('[data-submit]'); if (b) b.textContent = online ? T().submitOnline : T().submitOffline;
    $$('[data-pay-only]').forEach((e) => (e.hidden = !online));
  };
  function showDone(title, text, kind = 'ok') {
    const done = $('[data-done]');
    $('[data-done-title]', done).textContent = title;
    $('[data-done-text]', done).textContent = text;
    done.dataset.kind = kind; done.hidden = false;
    return done;
  }

  async function loadAvailability() {
    // Live availability from the booking API; the static file is the fallback when no server is set up.
    try {
      const r = await fetch(BASE + 'api/availability', { cache: 'no-store' });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) { const a = await r.json(); online = true; return a; }
    } catch (e) { /* offline or no API */ }
    online = false;
    try { const r = await fetch(BASE + 'data/availability.json', { cache: 'no-store' }); return r.ok ? await r.json() : {}; } catch (e) { return {}; }
  }
  async function refreshAvailability() {
    const a = await loadAvailability();
    state.taken = new Set(a.booked || []);
    if (range) { fitDays(); cal.render(); }
    updateSum(); submitLabel();
  }

  const form = $('#bookForm');
  form && form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearError();
    const q = quote();
    const f = form.elements;
    if (!q) return showError(state.date ? T().errSeason : T().errDate, $('[data-cal-days] .day:not([disabled])'));
    if (!f.license.checked) return showError(T().errLicense, f.license);
    if (f.name.value.trim().length < 2) return showError(T().errName, f.name);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) return showError(T().errEmail, f.email);
    const payload = {
      date: state.date, days: state.days, guests: +f.guests.value, license: true,
      name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim(), lang,
    };
    const btn = $('[data-submit]');
    if (online) {
      btn.disabled = true; btn.textContent = T().redirecting;
      try {
        const r = await fetch(BASE + 'api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.url) { location.href = j.url; return; } // Stripe Checkout
        if (r.status === 409) { await refreshAvailability(); showError(T().errTaken); }
        else if (r.status === 422) {
          const map = { date: [T().errDate, null], days: [T().errDays(R.minDays, R.maxDays), f.days], season: [T().errSeason, null], license: [T().errLicense, f.license], name: [T().errName, f.name], email: [T().errEmail, f.email], guests: [T().errGuests, f.guests] };
          const first = (j.fields || []).map((k) => map[k]).find(Boolean) || [T().errSend, null];
          showError(first[0], first[1]);
        } else if (r.status === 429) showError(T().errTooMany);
        else showError(T().errPayUnavailable);
      } catch (err) { showError(T().errSend); }
      btn.disabled = false; submitLabel();
      return;
    }
    // No booking server: hand the request to WhatsApp with everything filled in.
    const msgObj = { range: q.rangeTxt, guests: payload.guests, total: money(q.total), name: payload.name, phone: payload.phone, note: payload.note };
    window.open(`https://wa.me/${C.brand.whatsapp}?text=${encodeURIComponent(`${T().waIntro}\n\n${T().waLines(msgObj)}`)}`, '_blank', 'noopener');
    showDone(T().doneRequestT, T().doneRequestP);
  });

  // Coming back from Stripe: ?booking=success&session_id=… or ?booking=cancel&b=<id>
  async function handleReturn() {
    const p = new URLSearchParams(location.search);
    const kind = p.get('booking'); if (!kind) return;
    history.replaceState(null, '', location.pathname + '#rezervacija');
    $('.book__head').after($('[data-done]')); // show the result above the calendar, where the guest lands
    if (kind === 'success') {
      const done = showDone(T().donePaidT, T().checking);
      for (let i = 0; i < 6; i++) { // the webhook usually lands within a second or two
        try {
          const r = await fetch(BASE + 'api/booking?session_id=' + encodeURIComponent(p.get('session_id') || ''), { cache: 'no-store' });
          const b = r.ok ? await r.json() : null;
          if (b && b.status === 'confirmed') {
            const rangeTxt = T().range(fmtDay(b.date), fmtDay(b.end_date), RM.daysLabel(b.days, lang));
            const rest = b.total_cents > b.paid_cents ? T().restDue(money(Math.round((b.total_cents - b.paid_cents) / 100))) : '';
            showDone(T().donePaidT, T().donePaidP(rangeTxt, money(Math.round(b.paid_cents / 100)), RM.guestsLabel(b.guests, lang)) + rest);
            await refreshAvailability();
            break;
          }
          if (b && b.status === 'pending') showDone(T().donePendingT, T().donePendingP, 'wait');
        } catch (e) { /* retry */ }
        await new Promise((res) => setTimeout(res, 1500));
      }
      done.focus();
    } else if (kind === 'cancel') {
      const id = p.get('b');
      if (id) await fetch(BASE + 'api/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
      showDone(T().doneCancelT, T().doneCancelP, 'info');
      await refreshAvailability();
    }
    $('#rezervacija').scrollIntoView({ behavior: 'auto' });
  }

  async function loadBooking() {
    try {
      [R, RM] = await Promise.all([
        fetch(BASE + 'data/booking.json').then((r) => r.json()),
        import(new URL(BASE + 'shared/booking-rules.js', location.href).href),
      ]);
    } catch (e) { return; }
    state.days = Math.max(R.minDays, Math.min(R.weeklyFromDays, R.maxDays));
    const a = await loadAvailability();
    state.taken = new Set(a.booked || []);
    cal.init(); fitDays(); renderPrices(); bindConfig(); updateSum(); submitLabel();
    handleReturn();
    // Keep the calendar live while the page is open.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAvailability(); });
  }

  /* ---------------- Scroll story ---------------- */
  const story = (() => {
    const sec = $('#story'); if (!sec) return { stats() {} };
    const stage = $('.story__stage', sec), land = $('.story__land', sec), svg = $('.story__route', sec);
    const line = $('.story__line', svg), wake = $('.story__wake', svg), boat = $('.story__boat', svg), pins = $('.story__pins', svg);
    const hero = $('.hero', sec), chapters = $$('.chapter', sec), bar = $('.story__progress span', sec), cove = $('.story__cove', sec);
    const labels = $$('.sea-label', sec);
    // Image geometry: hero-land.png covers 43.74–44.02 N, 15.10–15.52 E (10 m cells, 2× downsampled).
    const IMG = { w: 1685, h: 1558, west: 15.10, north: 44.02, dx: 2.49248e-4, dy: 1.79662e-4 };
    const P = ([lon, lat]) => [(lon - IMG.west) / IMG.dx, (IMG.north - lat) / IMG.dy];
    // Computed with the guide's sea router (js/router.js) on the OSM-derived mask.
    const LEGS = [
      [[15.4425,43.9395],[15.4425,43.9403],[15.4021,43.9687],[15.3921,43.9773],[15.3881,43.9812],[15.3841,43.9812],[15.3831,43.9805],[15.3837,43.9787]],
      [[15.3837,43.9787],[15.3831,43.9805],[15.3806,43.9805],[15.3776,43.9794],[15.2983,44.0078],[15.2894,44.0139],[15.2654,44.0226],[15.2514,44.0154],[15.2509,44.0146],[15.2504,44.0146],[15.2499,44.0132],[15.232,43.9137],[15.2265,43.8885],[15.229,43.8849],[15.2265,43.8759],[15.2255,43.8756],[15.221,43.8759],[15.2185,43.8745],[15.207,43.8749],[15.1861,43.8896],[15.1781,43.8928],[15.1691,43.8986],[15.1626,43.8986],[15.1587,43.8925],[15.1589,43.8924]],
      [[15.1589,43.8924],[15.1587,43.8925],[15.1636,43.8989],[15.1716,43.8979],[15.2021,43.8785],[15.203,43.8418],[15.23,43.8224],[15.2415,43.8174],[15.246,43.8181],[15.2474,43.8192],[15.2475,43.8193]],
      [[15.2475,43.8193],[15.2474,43.8192],[15.2445,43.8174],[15.24,43.8177],[15.229,43.8231],[15.225,43.8264],[15.218,43.8364],[15.2205,43.8756],[15.2215,43.8763],[15.2255,43.8756],[15.227,43.8759],[15.235,43.8839],[15.2499,43.8867],[15.2564,43.8918],[15.2664,43.895],[15.3268,43.8936],[15.4111,43.8954],[15.428,43.8882],[15.452,43.8853],[15.4575,43.8889],[15.458,43.8975],[15.437,43.9381],[15.437,43.941],[15.4405,43.9417],[15.4425,43.9403],[15.4425,43.9395]],
    ];
    const LEG_NM = [3.8, 18.89, 7.3, 18.79];
    const pts = []; const cum = [0];
    LEGS.forEach((leg, li) => leg.forEach((c, i) => { if (li && !i) return; const p = P(c); if (pts.length) cum.push(cum[cum.length - 1] + Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1])); pts.push(p); }));
    const total = cum[cum.length - 1];
    // Route fraction at each stop (by drawn length).
    const stopIdx = [0]; { let n = 0; LEGS.forEach((leg, li) => { n += leg.length - (li ? 1 : 0); stopIdx.push(n - 1); }); }
    const stopFrac = stopIdx.map((i) => cum[i] / total);
    pins.innerHTML = stopIdx.slice(0, -1).map((i) => `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="5"/>`).join('');
    const pinEls = $$('circle', pins);

    const bboxOf = (a, b) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = a; i <= b; i++) { const [x, y] = pts[i]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
    const biograd = pts[0];
    const CAM = {
      overview: null, // cover the whole image
      biograd: [biograd[0] - 170, biograd[1] - 140, biograd[0] + 120, biograd[1] + 130],
      leg1: bboxOf(stopIdx[0], stopIdx[1]),
      leg2: bboxOf(stopIdx[1], stopIdx[2]),
      leg3: bboxOf(stopIdx[2], stopIdx[3]),
      all: bboxOf(0, pts.length - 1),
    };
    const KEYS = [
      { p: 0.00, cam: 'overview', r: 0 }, { p: 0.08, cam: 'overview', r: 0 },
      { p: 0.22, cam: 'biograd', r: 0 }, { p: 0.30, cam: 'biograd', r: 0 },
      { p: 0.40, cam: 'leg1', r: stopFrac[1] }, { p: 0.46, cam: 'leg1', r: stopFrac[1] },
      { p: 0.60, cam: 'leg2', r: stopFrac[2] }, { p: 0.66, cam: 'leg2', r: stopFrac[2] },
      { p: 0.78, cam: 'leg3', r: stopFrac[3] }, { p: 0.84, cam: 'leg3', r: stopFrac[3] },
      { p: 0.95, cam: 'all', r: 1 }, { p: 1.00, cam: 'all', r: 1 },
    ];
    const WIN = [[0.20, 0.33], [0.38, 0.49], [0.58, 0.69], [0.76, 0.87], [0.93, 1.2]];

    let vw = 0, vh = 0, focus = null, cams = {}, isStatic = false, labelW = [];
    function layout() {
      isStatic = reduceMotion.matches;
      sec.toggleAttribute('data-static', isStatic);
      vw = stage.clientWidth; vh = stage.clientHeight;
      labelW = labels.map((l) => l.offsetWidth);
      const wide = vw >= 860;
      // Where the camera may place things: away from the chapter card.
      focus = wide ? { x: 0, y: 70, w: vw - Math.min(480, vw * 0.4), h: vh - 90 } : { x: 0, y: 80, w: vw, h: vh * 0.56 - 80 };
      const fit = (b, pad = 0.18) => {
        const bw = (b[2] - b[0]) * (1 + pad * 2) + 40, bh = (b[3] - b[1]) * (1 + pad * 2) + 40;
        const s = Math.min(focus.w / bw, focus.h / bh);
        return { s, cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, fx: focus.x + focus.w / 2, fy: focus.y + focus.h / 2 };
      };
      const cover = Math.max(vw / IMG.w, vh / IMG.h);
      cams = {
        overview: { s: cover * 1.04, cx: IMG.w * 0.6, cy: IMG.h * 0.42, fx: vw / 2, fy: vh / 2 },
        biograd: fit(CAM.biograd, 0.05), leg1: fit(CAM.leg1), leg2: fit(CAM.leg2), leg3: fit(CAM.leg3), all: fit(CAM.all, 0.08),
      };
      if (isStatic) { cams.overview = cams.all; }
      last = -1; frame();
    }
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = (t) => Math.max(0, Math.min(1, t));

    function at(p) {
      let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
      const a = KEYS[i], b = KEYS[i + 1], t = ease(clamp01((p - a.p) / (b.p - a.p || 1)));
      const A = cams[a.cam], B = cams[b.cam];
      return {
        s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), t)),
        cx: lerp(A.cx, B.cx, t), cy: lerp(A.cy, B.cy, t), fx: lerp(A.fx, B.fx, t), fy: lerp(A.fy, B.fy, t),
        r: lerp(a.r, b.r, t),
      };
    }
    function pathUpTo(r) {
      const target = r * total; let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`; let head = pts[0], prev = pts[0];
      for (let i = 1; i < pts.length; i++) {
        if (cum[i] <= target) { d += `L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`; prev = pts[i - 1]; head = pts[i]; continue; }
        const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        head = [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]; prev = pts[i - 1];
        if (t > 0) d += `L${head[0].toFixed(1)} ${head[1].toFixed(1)}`;
        if (t === 0) { prev = pts[Math.max(0, i - 2)]; head = pts[i - 1]; }
        if (t > 0 && Math.hypot(head[0] - prev[0], head[1] - prev[1]) < 0.01) prev = pts[Math.max(0, i - 2)];
        return { d, head, ang: Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) };
      }
      const n = pts.length - 1;
      return { d, head: pts[n], ang: Math.atan2(pts[n][1] - pts[n - 1][1], pts[n][0] - pts[n - 1][0]) };
    }
    wake.setAttribute('d', 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L'));
    const labelPos = labels.map((l) => P(l.dataset.at.split(',').map(Number)));

    let last = -1;
    function progress() {
      if (isStatic) return 1;
      const r = sec.getBoundingClientRect();
      return clamp01(-r.top / (r.height - vh));
    }
    function frame() {
      const p = progress();
      if (Math.abs(p - last) < 1e-4) return;
      last = p;
      const c = at(isStatic ? 1 : p);
      const tx = c.fx - c.cx * c.s, ty = c.fy - c.cy * c.s;
      land.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${c.s.toFixed(5)})`;
      svg.setAttribute('viewBox', `${(c.cx - c.fx / c.s).toFixed(2)} ${(c.cy - c.fy / c.s).toFixed(2)} ${(vw / c.s).toFixed(2)} ${(vh / c.s).toFixed(2)}`);
      const { d, head, ang } = pathUpTo(c.r);
      line.setAttribute('d', d);
      boat.setAttribute('transform', `translate(${head[0].toFixed(1)} ${head[1].toFixed(1)}) rotate(${(ang * 180 / Math.PI + 90).toFixed(1)}) scale(${(1.25 / c.s).toFixed(4)})`);
      boat.style.opacity = c.r > 0.0005 && c.r < 0.9995 ? 1 : 0;
      pinEls.forEach((el, i) => { el.setAttribute('r', (5.5 / c.s).toFixed(2)); el.style.opacity = c.r + 1e-4 >= stopFrac[i] ? 1 : 0.35; });
      const h = isStatic ? 1 : clamp01((p - 0.025) / 0.07);
      // Sea names stay out of the way of the headline, and only show when they fit fully on screen.
      labels.forEach((l, i) => {
        const x = labelPos[i][0] * c.s + tx, y = labelPos[i][1] * c.s + ty;
        const fits = x > 8 && x + labelW[i] < vw - 8 && y > 90 && y < vh - 40;
        l.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        l.style.opacity = fits ? h : 0;
      });
      if (isStatic) { hero.style.opacity = ''; land.style.opacity = 0.35; return; }
      // Islands sit quietly under the headline, then come up to full white as the trip starts.
      land.style.opacity = (0.3 + 0.7 * clamp01((p - 0.04) / 0.12)).toFixed(3);
      hero.style.opacity = 1 - h;
      hero.style.visibility = h >= 1 ? 'hidden' : '';
      hero.style.translate = `0 ${(-28 * h).toFixed(1)}px`;
      chapters.forEach((ch, i) => {
        const [a, b] = WIN[i];
        const k = Math.min(clamp01((p - a) / 0.03), clamp01((b - p) / 0.03));
        ch.style.opacity = k;
        ch.style.visibility = k <= 0 ? 'hidden' : 'visible';
        ch.style.transform = `translate3d(0, ${((1 - k) * 18).toFixed(1)}px, 0)`;
      });
      bar.style.transform = `scaleX(${p.toFixed(4)})`;
      // Shallow-cove tint as the boat reaches Lojena (opacity of an overlay, not a repainted background).
      cove.style.opacity = (0.6 * clamp01(1 - Math.abs(p - 0.81) / 0.12)).toFixed(3);
    }
    let ticking = false;
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; frame(); }); } }, { passive: true });
    // Phones resize the viewport when the address bar slides in or out while scrolling; re-fitting the camera then
    // makes the map jump, so only react to real size changes (rotation, window resize).
    let lastW = innerWidth, lastH = innerHeight;
    addEventListener('resize', () => {
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
      lastW = innerWidth; lastH = innerHeight; requestAnimationFrame(layout);
    });
    reduceMotion.addEventListener?.('change', layout);
    (land.complete ? Promise.resolve() : land.decode().catch(() => {})).then(layout);
    layout();

    function stats() {
      const sp = C.speeds.find((s) => s.id === 'cruise') || C.speeds[0];
      const nm = LEG_NM.reduce((a, b) => a + b, 0), hours = nm / sp.kn;
      const set = (k, v) => $$(`[data-stat="${k}"]`).forEach((e) => (e.textContent = v));
      set('nm', `${num(nm, 1)} NM`);
      set('time', T().time(Math.floor(hours), Math.round((hours % 1) * 60)));
      set('fuel', `~${Math.round(hours * sp.lph)} L`);
    }
    return { stats };
  })();

  /* ---------------- Boat drift ---------------- */
  (() => {
    // Skipped on touch screens: transforming an SVG group repaints the whole drawing on every scroll frame.
    const body = $('.boat__body'), sec = $('#brod'); if (!body || reduceMotion.matches || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let ticking = false;
    const run = () => {
      ticking = false;
      const r = sec.getBoundingClientRect(), vh = innerHeight;
      const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      body.style.transform = `translate(${(t * 90).toFixed(1)}px, ${(Math.sin(t * 4) * 3).toFixed(1)}px) rotate(${(t * -1.2).toFixed(2)}deg)`;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
    run();
  })();

  /* ---------------- Nav, reveals, live guide preview ---------------- */
  const nav = $('#nav'), storyEl = $('#story');
  const navCheck = () => nav.toggleAttribute('data-solid', !storyEl || storyEl.getBoundingClientRect().bottom < 70);
  addEventListener('scroll', navCheck, { passive: true }); navCheck();

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const els = $$('.boat__intro, .boat__specs, .guide__copy, .phone, .prices > *, .book__head, .faq__list, .close > *');
    els.forEach((el) => { el.classList.add('reveal'); if (el.getBoundingClientRect().top > innerHeight) el.setAttribute('data-hidden', ''); });
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.removeAttribute('data-hidden'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -10% 0px' });
    els.forEach((el) => io.observe(el));
  }

  const phone = $('.phone');
  if (phone) {
    const iframe = $('iframe', phone);
    const load = () => { if (phone.hasAttribute('data-live')) return; iframe.src = iframe.dataset.src + (lang === 'en' ? '&lang=en' : ''); phone.setAttribute('data-live', ''); };
    $('.phone__load', phone).addEventListener('click', load);
    // Load automatically on wide screens once the section is near; phones get the button (saves data).
    if (matchMedia('(min-width: 960px)').matches && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { load(); io.disconnect(); } }, { rootMargin: '300px' });
      io.observe(phone);
    }
  }

  applyLang();
  loadBoat();
  loadBooking();
})();
