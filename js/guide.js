(() => {
  const C = window.CHARTER, I18N = window.GUIDE_I18N, WX = window.Weather;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const params = new URLSearchParams(location.search);
  const EMBED = params.has('embed');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 900px)');

  /* ---------- Persistence ---------- */
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  /* ---------- Language ---------- */
  let lang = params.get('lang') || ls.get('g:lang', null) || ((navigator.language || '').match(/^(hr|bs|sr)/i) ? 'hr' : 'en');
  lang = lang === 'en' ? 'en' : 'hr';
  const t = (k) => I18N[lang][k];
  const L = (o) => (o && typeof o === 'object' ? o[lang] || o.hr || '' : o); // empty translation falls back to Croatian
  const nf = (v, d = 1) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hr-HR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const nameOf = (p) => (p.name && p.name.trim()) || `${t('type1')[p.type]} (${t('unnamed')})`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Icons (one stroke set, used in UI and on the map) ---------- */
  const ICON = {
    bay: 'M3 13c3 0 3-2 6-2s3 2 6 2 3-2 6-2M3 18c3 0 3-2 6-2s3 2 6 2 3-2 6-2M8 7l4-3 4 3',
    beach: 'M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 12v8M4 20h16',
    restaurant: 'M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2 1-3 4-3 7s1 4 3 4',
    anchorage: 'M12 7v14M8 10h8M5 14a7 7 0 0 0 14 0M12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
    marina: 'M4 15h16l-2 5H6zM12 3v12M12 4l6 8h-6',
    fuel: 'M5 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M4 21h11M7 8h5M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-3-3',
    sight: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6L3.4 9.3l6-.7z',
  };
  const TYPES = ['bay', 'beach', 'restaurant', 'anchorage', 'marina', 'fuel', 'sight'];
  const COLOR = { bay: '#12908f', beach: '#c47f00', restaurant: '#c2410c', anchorage: '#0a5c8a', marina: '#06324f', fuel: '#a21caf', sight: '#3f7d3a' };
  const svgIco = (type) => `<svg viewBox="0 0 24 24"><path d="${ICON[type]}"/></svg>`;
  const ARROW = '<svg viewBox="0 0 24 24"><path d="M12 2 18 20 12 16 6 20z"/></svg>';

  /* ---------- State ---------- */
  const state = {
    mode: 'featured', cats: new Set(TYPES), overlay: 'none', seamarks: false,
    speed: ls.get('g:speed', C.defaultSpeed), tab: 'explore', placeId: null, prevTab: 'explore',
    me: null, wxDay: null, wxHour: null, filter: 'all',
  };
  const plan = Object.assign({ day: null, depart: '09:00', stops: [], optimize: true, stays: {} }, ls.get('g:plan', {}));
  const savePlan = () => ls.set('g:plan', plan);
  const speed = () => C.speeds.find((s) => s.id === state.speed) || C.speeds[0];

  let places = new Map();   // featured + selected "all" items by id
  let featured = [];
  let routesDef = [];
  let allData = null;
  const home = () => places.get('home') || { ...C.home, type: 'marina' };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('[data-toast]'); el.textContent = msg; el.hidden = false; el.removeAttribute('data-out');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.setAttribute('data-out', ''); setTimeout(() => (el.hidden = true), 220); }, 2600);
  }

  /* ---------- Geometry ---------- */
  const R = 6371008.8, rad = Math.PI / 180;
  function havNm(a, b) {
    const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return (2 * R * Math.asin(Math.sqrt(s))) / 1852;
  }
  const fmtDur = (hours) => { const m = Math.round(hours * 60); return m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)} ${t('h')} ${String(m % 60).padStart(2, '0')}`; };
  const legStats = (nm, sp = speed()) => { const h = nm / sp.kn; return { nm, h, fuel: h * sp.lph }; };
  const compass = (deg) => t('dirs')[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  /* ---------- Router ---------- */
  const router = window.SeaRouter.create('../');
  const routeCache = new Map(Object.entries(ls.get('g:routes', {})));
  const DATA_V = 'v4'; // bump when masks or featured places change, to drop cached routes
  async function seaRoute(points) {
    const k = DATA_V + ':' + points.map((p) => `${p.lon.toFixed(4)},${p.lat.toFixed(4)}`).join(';');
    if (routeCache.has(k)) return routeCache.get(k);
    const r = await (await router).route(points.map((p) => [p.lon, p.lat]));
    const slim = { nm: r.nm, legs: r.legs.map((l) => ({ nm: l.nm, approx: l.approx, coarse: l.coarse, coords: l.coords.map((c) => [+c[0].toFixed(5), +c[1].toFixed(5)]) })) };
    routeCache.set(k, slim);
    if (routeCache.size < 300) ls.set('g:routes', Object.fromEntries(routeCache));
    return slim;
  }

  /* ---------- Map ---------- */
  const map = new maplibregl.Map({
    container: 'map', style: C.map.style, center: C.map.center, zoom: C.map.zoom,
    attributionControl: false, dragRotate: false, pitchWithRotate: false, maxPitch: 0,
    cooperativeGestures: EMBED,
  });
  map.touchZoomRotate.disableRotation();
  map.on('error', (e) => console.warn('map:', e && e.error && e.error.message));
  if (params.has('debug')) window.guideMap = map;
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap · Open-Meteo' }), 'bottom-right');

  function drawPin(type) {
    const s = 2, size = 44 * s, c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d');
    x.shadowColor = 'rgba(11,27,38,0.35)'; x.shadowBlur = 4 * s; x.shadowOffsetY = 1 * s;
    x.beginPath(); x.arc(size / 2, size / 2, 15 * s, 0, Math.PI * 2); x.fillStyle = COLOR[type]; x.fill();
    x.shadowColor = 'transparent'; x.lineWidth = 2.5 * s; x.strokeStyle = '#fbfcf9'; x.stroke();
    x.save(); x.translate(size / 2 - 9 * s, size / 2 - 9 * s); x.scale(0.75 * s, 0.75 * s);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#fbfcf9'; x.stroke(new Path2D(ICON[type]));
    x.restore();
    return { width: size, height: size, data: x.getImageData(0, 0, size, size).data };
  }
  function drawArrow() {
    const s = 2, size = 32 * s, c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); x.translate(size / 2, size / 2); x.scale(s, s);
    x.beginPath(); x.moveTo(0, -13); x.lineTo(8, 11); x.lineTo(0, 6); x.lineTo(-8, 11); x.closePath(); x.fillStyle = '#fff'; x.fill();
    return { width: size, height: size, data: x.getImageData(0, 0, size, size).data };
  }

  const fc = (features) => ({ type: 'FeatureCollection', features });
  const pt = (lon, lat, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });

  let mapReady = false;
  map.on('load', () => {
    mapReady = true;
    // A touch of chart colour on the base map: clearer water, quieter land.
    for (const l of map.getStyle().layers) {
      if (l.type === 'fill' && /water/.test(l.id)) map.setPaintProperty(l.id, 'fill-color', '#a9d6e5');
      if (l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#f1f2ec');
    }
    TYPES.forEach((ty) => map.addImage('pin-' + ty, drawPin(ty), { pixelRatio: 2 }));
    map.addImage('wx-arrow', drawArrow(), { pixelRatio: 2, sdf: true });

    map.addSource('route', { type: 'geojson', data: fc([]) });
    map.addSource('route-stops', { type: 'geojson', data: fc([]) });
    map.addSource('all', { type: 'geojson', data: fc([]), cluster: true, clusterRadius: 44, clusterMaxZoom: 11 });
    map.addSource('feat', { type: 'geojson', data: fc([]) });
    map.addSource('sel', { type: 'geojson', data: fc([]) });
    map.addSource('wx', { type: 'geojson', data: fc([]) });
    map.addSource('me', { type: 'geojson', data: fc([]) });

    map.addLayer({ id: 'wx-arrow', type: 'symbol', source: 'wx', layout: {
      'icon-image': 'wx-arrow', 'icon-rotate': ['+', ['get', 'dir'], 180], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['get', 'mag'], 0, 0.55, 25, 1.05], 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'],
      'text-size': 11, 'text-offset': [0, 1.5], 'text-allow-overlap': true },
      paint: { 'icon-color': ['match', ['get', 'lvl'], 2, '#c9361f', 1, '#d08a00', '#06324f'], 'text-color': '#0b1b26', 'text-halo-color': '#fbfcf9', 'text-halo-width': 1.4 } });

    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fbfcf9', 'line-width': 8 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!', ['get', 'approx']], layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#06324f', 'line-width': 4 } });
    map.addLayer({ id: 'route-approx', type: 'line', source: 'route', filter: ['get', 'approx'], layout: { 'line-join': 'round' },
      paint: { 'line-color': '#c9361f', 'line-width': 4, 'line-dasharray': [1, 1.5] } });

    map.addLayer({ id: 'all-cluster', type: 'circle', source: 'all', filter: ['has', 'point_count'],
      paint: { 'circle-color': '#0a5c8a', 'circle-opacity': 0.85, 'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 22], 'circle-stroke-color': '#fbfcf9', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'all-count', type: 'symbol', source: 'all', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 }, paint: { 'text-color': '#fbfcf9' } });
    map.addLayer({ id: 'all-pt', type: 'circle', source: 'all', filter: ['!', ['has', 'point_count']],
      paint: { 'circle-color': ['match', ['get', 'type'], ...TYPES.flatMap((ty) => [ty, COLOR[ty]]), '#666'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 13, 7], 'circle-stroke-color': '#fbfcf9', 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'all-label', type: 'symbol', source: 'all', minzoom: 12, filter: ['!', ['has', 'point_count']],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#0b1b26', 'text-halo-color': '#fbfcf9', 'text-halo-width': 1.4 } });

    map.addLayer({ id: 'sel-ring', type: 'circle', source: 'sel', paint: { 'circle-radius': 24, 'circle-color': 'rgba(242,183,5,0.25)', 'circle-stroke-color': '#f2b705', 'circle-stroke-width': 3 } });
    map.addLayer({ id: 'feat-pin', type: 'symbol', source: 'feat', layout: {
      'icon-image': ['concat', 'pin-', ['get', 'type']], 'icon-allow-overlap': true, 'icon-ignore-placement': false,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 10, 0.85, 13, 1],
      'symbol-sort-key': ['match', ['get', 'type'], 'marina', 0, 'fuel', 1, 'sight', 2, 3],
      'text-field': ['step', ['zoom'], '', 10.5, ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
      'text-offset': [0, 1.35], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 },
      paint: { 'text-color': '#0b1b26', 'text-halo-color': '#fbfcf9', 'text-halo-width': 1.6 } });

    map.addLayer({ id: 'route-stop', type: 'circle', source: 'route-stops', paint: { 'circle-radius': 11, 'circle-color': '#f2b705', 'circle-stroke-color': '#06324f', 'circle-stroke-width': 2.5 } });
    map.addLayer({ id: 'route-num', type: 'symbol', source: 'route-stops', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#06324f' } });
    map.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 8, 'circle-color': '#0a5c8a', 'circle-stroke-color': '#fbfcf9', 'circle-stroke-width': 3 } });

    for (const id of ['feat-pin', 'all-pt']) {
      map.on('click', id, (e) => { const f = e.features[0]; openPlace(f.properties.id); });
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    map.on('click', 'all-cluster', async (e) => {
      const f = e.features[0];
      const z = await map.getSource('all').getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.2, duration: reduceMotion.matches ? 0 : 400 });
    });
    map.on('moveend', () => { if (state.overlay !== 'none') scheduleWxGrid(); });
    refreshLayers();
    if (lastRoute) showRoute(lastRoute.res, lastRoute.stops, false);
  });

  function refreshLayers() {
    if (!mapReady) return;
    const cats = state.cats;
    map.getSource('feat').setData(fc(featured.filter((p) => cats.has(p.type)).map((p) => pt(p.lon, p.lat, { id: p.id, type: p.type, name: p.name }))));
    if (state.mode === 'all' && allData) {
      map.getSource('all').setData(fc(allData.filter((p) => cats.has(p.type)).map((p) => pt(p.lon, p.lat, { id: p.id, type: p.type, name: p.name || '' }))));
    } else map.getSource('all').setData(fc([]));
    const vis = state.overlay === 'none' ? 'none' : 'visible';
    map.setLayoutProperty('wx-arrow', 'visibility', vis);
    if (state.seamarks && !map.getSource('seamarks')) {
      map.addSource('seamarks', { type: 'raster', tiles: [C.map.seamarkTiles], tileSize: 256, attribution: 'Pomorske oznake © OpenSeaMap (CC BY-SA)' });
      map.addLayer({ id: 'seamarks', type: 'raster', source: 'seamarks', minzoom: 9 }, 'route-casing');
    }
    if (map.getLayer('seamarks')) map.setLayoutProperty('seamarks', 'visibility', state.seamarks ? 'visible' : 'none');
  }

  function mapPadding() {
    if (wide.matches) return { top: 80, bottom: 40, left: 440, right: 60 };
    return { top: 80 + (state.overlay !== 'none' ? 110 : 0), bottom: sheet.targetVisible() + 30, left: 40, right: 40 };
  }
  function fitTo(coords) {
    if (!coords.length) return;
    const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(b, { padding: mapPadding(), maxZoom: 13, duration: reduceMotion.matches ? 0 : 700 });
  }

  /* ---------- Route display ---------- */
  let lastRoute = null;
  function showRoute(res, stops, fit = true) {
    lastRoute = { res, stops };
    if (!mapReady) return;
    map.getSource('route').setData(fc(res.legs.map((l) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: l.coords }, properties: { approx: !!l.approx } }))));
    const seen = new Set();
    map.getSource('route-stops').setData(fc(stops.map((s, i) => {
      const k = s.id + '|' + i; if (s.id === 'home' && seen.has('home')) return null; seen.add(s.id);
      return pt(s.lon, s.lat, { n: s.id === 'home' ? 'B' : String(i) });
    }).filter(Boolean)));
    if (fit) fitTo(res.legs.flatMap((l) => l.coords));
  }
  function clearRoute() { lastRoute = null; if (mapReady) { map.getSource('route').setData(fc([])); map.getSource('route-stops').setData(fc([])); } }

  /* ---------- Bottom sheet with spring physics ---------- */
  const sheet = (() => {
    const el = $('#sheet'), grab = $('[data-grab]', el), app = $('#app');
    let snap = 'peek', y = 0, raf = 0, v = 0;
    const H = () => el.offsetHeight;
    const peekPx = () => 148 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0);
    const snaps = () => ({ peek: H() - peekPx(), half: Math.max(0, H() - Math.round(innerHeight * 0.52)), full: 0 });
    const visible = () => (wide.matches ? 0 : Math.max(0, H() - y));
    const apply = () => { el.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`; };
    function setSnap(name, velocity = 0) {
      snap = name; app.dataset.sheet = name; el.dataset.snap = name;
      if (wide.matches) { y = 0; el.style.transform = ''; return; }
      const target = snaps()[name];
      if (reduceMotion.matches) { y = target; apply(); afterSettle(); return; }
      animateTo(target, velocity, velocity ? 0.8 : 1);
    }
    function animateTo(target, vel, zeta) {
      cancelAnimationFrame(raf);
      v = vel; const response = 0.38, w = (2 * Math.PI) / response, k = w * w, c = 2 * zeta * w;
      let last = performance.now();
      const step = (now) => {
        let dt = Math.min(0.032, (now - last) / 1000); last = now;
        while (dt > 0) { const h = Math.min(dt, 1 / 240); const a = -k * (y - target) - c * v; v += a * h; y += v * h; dt -= h; }
        if (Math.abs(y - target) < 0.4 && Math.abs(v) < 8) { y = target; apply(); afterSettle(); return; }
        apply(); raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function afterSettle() { if (mapReady && !wide.matches) map.setPadding({ top: 0, left: 0, right: 0, bottom: 0 }); }
    // Drag: 1:1 tracking, rubber-band past the ends, momentum projection on release.
    let drag = null;
    grab.addEventListener('pointerdown', (e) => {
      if (wide.matches || e.button > 0) return;
      cancelAnimationFrame(raf);
      drag = { id: e.pointerId, y0: e.clientY, s0: y, moved: false, hist: [[e.timeStamp, e.clientY]] };
    });
    grab.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < 8) return;
      if (!drag.moved) { drag.moved = true; grab.setPointerCapture(e.pointerId); }
      const s = snaps(); let ny = drag.s0 + dy;
      const rb = (o, d) => (o * d * 0.55) / (d + 0.55 * Math.abs(o));
      if (ny < s.full) ny = s.full - rb(s.full - ny, H());
      if (ny > s.peek) ny = s.peek + rb(ny - s.peek, H());
      y = ny; apply();
      drag.hist.push([e.timeStamp, e.clientY]); if (drag.hist.length > 6) drag.hist.shift();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.moved) return;
      const [t0, y0] = d.hist[0], [t1, y1] = d.hist[d.hist.length - 1];
      const vel = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;
      const projected = y + (vel / 1000) * 0.998 / (1 - 0.998);
      const s = snaps();
      const best = Object.entries(s).sort((a, b) => Math.abs(a[1] - projected) - Math.abs(b[1] - projected))[0][0];
      setSnap(best, vel);
      d.cancelClick = true;
      grab.dataset.dragged = '1'; setTimeout(() => delete grab.dataset.dragged, 50);
    };
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
    // Tap the handle area to toggle.
    grab.addEventListener('click', (e) => {
      if (grab.dataset.dragged || e.target.closest('[role="tab"]')) return;
      setSnap(snap === 'peek' ? 'half' : 'peek');
    });
    addEventListener('resize', () => setSnap(snap));
    wide.addEventListener?.('change', () => setSnap(snap));
    requestAnimationFrame(() => { y = snaps().peek; if (!wide.matches) apply(); app.dataset.sheet = 'peek'; });
    const targetVisible = () => (wide.matches ? 0 : Math.max(0, H() - snaps()[snap]));
    return { setSnap, visible, targetVisible, get snap() { return snap; } };
  })();

  /* ---------- Tabs & panels ---------- */
  const panels = Object.fromEntries($$('[data-panel]').map((p) => [p.dataset.panel, p]));
  function showPanel(name) {
    Object.entries(panels).forEach(([k, p]) => (p.hidden = k !== name));
    $('[data-sheet-body]').scrollTop = 0;
  }
  function setTab(tab, open = true) {
    state.tab = tab;
    $$('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    showPanel(tab);
    render[tab]();
    if (open && sheet.snap === 'peek') sheet.setSnap('half');
  }
  $$('[role="tab"]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  const speedSeg = () => `<div class="speeds" role="group" aria-label="${t('speed')}">${C.speeds.map((s) => `<button type="button" data-speed="${s.id}" aria-pressed="${s.id === state.speed}">${esc(L(s.label))}<small>${s.kn} ${t('kn')} · ${s.lph} L/h</small></button>`).join('')}</div>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]'); if (!b) return;
    state.speed = b.dataset.speed; ls.set('g:speed', state.speed);
    render[state.tab === 'place' ? 'place' : state.tab]();
  });
  const statsHtml = (nm, approx) => { const s = legStats(nm); return `<div class="stats"><div><b>${nf(nm)}</b><span>${t('nm')}${approx ? ' ≈' : ''}</span></div><div><b>${fmtDur(s.h)}</b><span>${t('time')}</span></div><div><b>${Math.round(s.fuel)} ${t('liters')}</b><span>${t('fuel')} ≈ ${Math.round(s.fuel * C.fuelPriceEur)} €</span></div></div>`; };

  /* Explore */
  const distCache = ls.get('g:dist:' + DATA_V, {});
  let distRunning = false;
  async function computeDistances() {
    if (distRunning) return; distRunning = true;
    const h = home();
    for (const p of featured) {
      if (p.id === 'home' || distCache[p.id] != null) continue;
      try { const r = await seaRoute([h, p]); distCache[p.id] = +r.nm.toFixed(2); ls.set('g:dist:' + DATA_V, distCache); } catch (e) { distCache[p.id] = null; }
      if (state.tab === 'explore' && !panels.explore.hidden) renderExploreList();
    }
    distRunning = false;
  }
  function renderExplore() {
    const counts = Object.fromEntries(TYPES.map((ty) => [ty, featured.filter((p) => p.type === ty).length]));
    panels.explore.innerHTML = `
      <h2>${t('exploreTitle')}</h2>
      <p class="sub" data-explore-sub>${state.me ? t('exploreSubMe') : t('exploreSub')}</p>
      <div class="chips" role="group">
        <button class="chip" type="button" data-filter="all" aria-pressed="${state.filter === 'all'}">${t('all')}</button>
        ${TYPES.filter((ty) => counts[ty]).map((ty) => `<button class="chip" type="button" data-filter="${ty}" aria-pressed="${state.filter === ty}">${svgIco(ty)}${t('types')[ty]}</button>`).join('')}
      </div>
      <ul class="list" data-explore-list></ul>`;
    renderExploreList();
    computeDistances();
  }
  function renderExploreList() {
    const ul = $('[data-explore-list]'); if (!ul) return;
    const ref = state.me;
    let items = featured.filter((p) => p.id !== 'home' && (state.filter === 'all' || p.type === state.filter));
    const d = (p) => (ref ? havNm(ref, p) : distCache[p.id] ?? havNm(home(), p) * 1.3);
    items.sort((a, b) => d(a) - d(b));
    if (!items.length) { ul.innerHTML = `<li class="hint">${t('nothing')}</li>`; return; }
    ul.innerHTML = items.map((p) => {
      const known = ref || distCache[p.id] != null;
      const nm = d(p), s = legStats(nm);
      return `<li><button class="item" type="button" data-open="${p.id}">
        <span class="item__ico t-${p.type}">${svgIco(p.type)}</span>
        <span class="item__main"><span class="item__name">${esc(nameOf(p))}</span><span class="item__meta">${esc(t('type1')[p.type])}${(p.tags || []).includes('np') ? ' · NP Kornati' : ''}${(p.tags || []).includes('pp') ? ' · PP Telašćica' : ''}</span></span>
        <span class="item__dist">${known ? '' : '≈'}${nf(nm)} ${t('nm')}<small>${ref ? '' : fmtDur(s.h)}</small></span>
      </button></li>`;
    }).join('');
  }
  document.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.dataset.filter; $$('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === f))); renderExploreList(); return; }
    const o = e.target.closest('[data-open]'); if (o) openPlace(o.dataset.open);
  });

  /* Place */
  function placeById(id) {
    if (places.has(id)) return places.get(id);
    if (allData) { const p = allData.find((x) => x.id === id); if (p) return p; }
    return null;
  }
  function openPlace(id) {
    const p = placeById(id); if (!p) return;
    if (state.tab !== 'place') state.prevTab = state.tab;
    state.placeId = id; state.tab = 'place';
    $$('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.prevTab)));
    showPanel('place'); render.place();
    if (mapReady) map.getSource('sel').setData(fc([pt(p.lon, p.lat, {})]));
    if (sheet.snap === 'peek') sheet.setSnap('half');
    if (mapReady) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 11.5), padding: mapPadding(), duration: reduceMotion.matches ? 0 : 500 });
    history.replaceState(null, '', '#p=' + encodeURIComponent(id));
  }
  let placeRoute = null;
  render.place = function () {
    const p = placeById(state.placeId); if (!p) return;
    const name = nameOf(p);
    const inPlan = plan.stops.includes(p.id);
    const from = state.me ? { ...state.me, id: 'me' } : home();
    const notes = (p.tags || []).map((tg) => `<p class="note">${t(tg)}</p>`).join('');
    const pr = placeRoute && placeRoute.id === p.id && placeRoute.from === (state.me ? 'me' : 'home') ? placeRoute : null;
    panels.place.innerHTML = `
      <button class="back" type="button" data-back><svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>${t('back')}</button>
      <h2>${esc(name)}</h2>
      <span class="place__type"><span class="item__ico t-${p.type}">${svgIco(p.type)}</span>${esc(t('type1')[p.type])}</span>
      ${p.desc ? `<p class="place__desc">${esc(L(p.desc))}</p>` : ''}
      ${notes}
      ${p.id !== 'home' ? `
        <h3>${state.me ? t('fromMe') : t('fromHome')}, ${t('oneWay')}</h3>
        ${pr ? statsHtml(pr.nm, pr.approx) + (pr.approx ? `<p class="note note--warn">${t('approx')}</p>` : '') : `<div class="stats"><div><b class="skeleton">00,0</b><span>${t('nm')}</span></div><div><b class="skeleton">0 h 00</b><span>${t('time')}</span></div><div><b class="skeleton">00 L</b><span>${t('fuel')}</span></div></div>`}
        ${speedSeg()}
        <div class="actions">
          <button class="btn" type="button" data-route-here>${svgRoute}${t('routeHere')}</button>
          <button class="btn btn--light" type="button" data-plan-toggle ${inPlan ? 'aria-pressed="true"' : ''}>${inPlan ? '✓ ' + t('inPlan') : '+ ' + t('addPlan')}</button>
        </div>` : ''}
      <p class="hint">${p.osm ? `<a class="link" href="https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[p.osm[0]]}/${p.osm.slice(1)}" target="_blank" rel="noopener">${t('openOsm')}</a> · ` : ''}${nf(p.lat, 4)} N, ${nf(p.lon, 4)} E</p>`;
    if (!pr && p.id !== 'home') {
      seaRoute([from, p]).then((r) => {
        placeRoute = { id: p.id, from: state.me ? 'me' : 'home', nm: r.nm, approx: r.legs.some((l) => l.approx || l.coarse), res: r, stops: [from, p] };
        if (state.tab === 'place' && state.placeId === p.id) render.place();
      }).catch(() => {});
    }
  };
  const svgRoute = '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8 18h6a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6"/></svg>';
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) {
      if (mapReady) map.getSource('sel').setData(fc([]));
      history.replaceState(null, '', location.pathname + location.search);
      setTab(state.prevTab || 'explore', false); return;
    }
    if (e.target.closest('[data-route-here]')) {
      if (placeRoute && placeRoute.id === state.placeId) { sheet.setSnap('peek'); showRoute(placeRoute.res, placeRoute.stops); }
      return;
    }
    if (e.target.closest('[data-plan-toggle]')) { togglePlan(state.placeId); render.place(); }
  });
  function togglePlan(id) {
    const i = plan.stops.indexOf(id);
    if (i >= 0) { plan.stops.splice(i, 1); toast(t('removed')); }
    else { if (plan.stops.length >= 8) return toast(t('tooMany')); plan.stops.push(id); toast(t('added')); }
    planResult = null; savePlan(); updateBadge();
  }
  function updateBadge() { const b = $('[data-plan-count]'); b.hidden = !plan.stops.length; b.textContent = plan.stops.length; }

  /* Routes */
  const routeResults = new Map();
  render.routes = function () {
    panels.routes.innerHTML = `<h2>${t('routesTitle')}</h2><p class="sub">${t('routesSub')}</p>${speedSeg()}
      ${routesDef.map((r) => {
        const res = routeResults.get(r.id);
        return `<article class="card" data-route="${r.id}" ${lastRoute && lastRoute.id === r.id ? 'data-active' : ''}>
          <span class="card__tag">${r.length === 'half' ? t('half') : t('full')}</span>
          <h3>${esc(L(r).name)}</h3><p>${esc(L(r).text)}</p>
          ${res ? statsHtml(res.nm, res.legs.some((l) => l.approx)) : `<div class="stats"><div><b class="skeleton">00,0</b><span>${t('nm')}</span></div><div><b class="skeleton">0 h 00</b><span>${t('time')}</span></div><div><b class="skeleton">00 L</b><span>${t('fuel')}</span></div></div>`}
          <div class="actions"><button class="btn" type="button" data-show-route="${r.id}">${t('showOnMap')}</button><button class="btn btn--light" type="button" data-use-route="${r.id}">${t('usePlan')}</button></div>
        </article>`;
      }).join('')}`;
    computeRoutes();
  };
  let routesRunning = false;
  async function computeRoutes() {
    if (routesRunning) return; routesRunning = true;
    for (const r of routesDef) {
      if (routeResults.has(r.id)) continue;
      const stops = r.stops.map((id) => places.get(id)).filter(Boolean);
      try { routeResults.set(r.id, await seaRoute(stops)); } catch (e) { continue; }
      if (state.tab === 'routes') render.routes();
    }
    routesRunning = false;
  }
  document.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-show-route]');
    if (s) {
      const r = routesDef.find((x) => x.id === s.dataset.showRoute);
      const stops = r.stops.map((id) => places.get(id));
      const res = routeResults.get(r.id) || await seaRoute(stops);
      sheet.setSnap('peek'); showRoute(res, stops); lastRoute.id = r.id;
      return;
    }
    const u = e.target.closest('[data-use-route]');
    if (u) {
      const r = routesDef.find((x) => x.id === u.dataset.useRoute);
      plan.stops = r.stops.filter((id) => id !== 'home'); plan.optimize = false; planResult = null; savePlan(); updateBadge();
      setTab('plan');
    }
  });

  /* Planner */
  const tz = 'Europe/Zagreb';
  const localNow = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, h: +parts.hour, m: +parts.minute };
  };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayList = () => { const n = localNow(); return Array.from({ length: 7 }, (_, i) => addDays(n.date, i)); };
  const dayLabel = (iso, i) => i === 0 ? t('today') : i === 1 ? t('tomorrow') : new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'hr-HR', { weekday: 'short', timeZone: 'UTC' });
  const hm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
  const defaultStay = { sight: 15, bay: 75, beach: 90, anchorage: 75, restaurant: 90, marina: 30, fuel: 15 };
  const stayOf = (p) => plan.stays[p.id] ?? defaultStay[p.type] ?? 60;
  let planResult = null, planBusy = false;
  if (!plan.day || !dayList().includes(plan.day)) plan.day = localNow().h >= 14 ? dayList()[1] : dayList()[0];

  render.plan = function () {
    const days = dayList();
    const stops = plan.stops.map(placeById).filter(Boolean);
    const homeWx = homeForecast;
    const dayLvl = (iso) => {
      if (!homeWx) return -1;
      let lvl = -1;
      for (let h = 8; h <= 19; h++) { const i = WX.idxAt(homeWx, `${iso}T${String(h).padStart(2, '0')}:00`); const s = WX.sample(homeWx, i); if (s) lvl = Math.max(lvl, WX.assess(s).lvl); }
      return lvl;
    };
    const departOpts = []; for (let m = 6 * 60; m <= 17 * 60; m += 30) departOpts.push(hm(m));
    panels.plan.innerHTML = `
      <h2>${t('planTitle')}</h2><p class="sub">${t('planSub')}</p>
      <h3>${t('day')}</h3>
      <div class="days" role="group">${days.map((d, i) => { const l = dayLvl(d); return `<button type="button" data-day="${d}" aria-pressed="${plan.day === d}"><span>${esc(dayLabel(d, i))}</span><b>${+d.slice(8)}.</b><i class="${l >= 0 ? 'dot-' + l : ''}"></i></button>`; }).join('')}</div>
      <div class="form-row">
        <label class="field">${t('depart')}<select data-depart>${departOpts.map((o) => `<option ${o === plan.depart ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label class="field">${t('speed')}<select data-speed-select>${C.speeds.map((s) => `<option value="${s.id}" ${s.id === state.speed ? 'selected' : ''}>${esc(L(s.label))} · ${s.kn} ${t('kn')}</option>`).join('')}</select></label>
      </div>
      <h3>${t('stops')}</h3>
      ${stops.length ? `<ol class="stops">${stops.map((p, i) => `<li class="stop">
          <span class="stop__n">${i + 1}</span>
          <span class="stop__main"><b>${esc(nameOf(p))}</b><small class="muted">${esc(t('type1')[p.type])}</small></span>
          <select data-stay="${p.id}" aria-label="${t('stay')}">${[0, 15, 30, 45, 60, 75, 90, 120, 150, 180].map((m) => `<option value="${m}" ${m === stayOf(p) ? 'selected' : ''}>${m} ${t('min')}</option>`).join('')}</select>
          <button class="stop__x" type="button" data-unplan="${p.id}" aria-label="${t('remove')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </li>`).join('')}</ol>` : `<p class="hint">${t('noStops')}</p>`}
      <label class="check"><input type="checkbox" data-optimize ${plan.optimize ? 'checked' : ''}>${t('optimize')}</label>
      <input class="search" type="search" placeholder="${t('search')}" data-plan-search enterkeyhint="search" autocomplete="off">
      <ul class="list" data-plan-pick></ul>
      <div class="actions">
        <button class="btn btn--signal" type="button" data-build ${!stops.length || planBusy ? 'disabled' : ''}>${planBusy ? t('computing') : t('compute')}</button>
        <button class="btn btn--light" type="button" data-clear-plan ${!stops.length ? 'disabled' : ''}>${t('clear')}</button>
      </div>
      <div data-plan-out>${planResult ? planHtml(planResult) : ''}</div>`;
    renderPick('');
  };
  function renderPick(q) {
    const ul = $('[data-plan-pick]'); if (!ul) return;
    const qq = q.trim().toLowerCase();
    const list = featured.filter((p) => p.id !== 'home' && !plan.stops.includes(p.id) && (!qq || p.name.toLowerCase().includes(qq)))
      .sort((a, b) => (distCache[a.id] ?? 99) - (distCache[b.id] ?? 99)).slice(0, qq ? 12 : 6);
    ul.innerHTML = list.map((p) => `<li><button class="item" type="button" data-plan-add="${p.id}"><span class="item__ico t-${p.type}">${svgIco(p.type)}</span><span class="item__main"><span class="item__name">${esc(nameOf(p))}</span><span class="item__meta">${esc(t('type1')[p.type])}</span></span><span class="item__dist">+</span></button></li>`).join('');
  }
  document.addEventListener('input', (e) => { if (e.target.matches('[data-plan-search]')) renderPick(e.target.value); });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('[data-depart]')) { plan.depart = el.value; planResult = null; savePlan(); }
    if (el.matches('[data-speed-select]')) { state.speed = el.value; ls.set('g:speed', state.speed); planResult = null; render.plan(); }
    if (el.matches('[data-stay]')) { plan.stays[el.dataset.stay] = +el.value; planResult = null; savePlan(); }
    if (el.matches('[data-optimize]')) { plan.optimize = el.checked; planResult = null; savePlan(); }
  });
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'); if (d) { plan.day = d.dataset.day; planResult = null; savePlan(); render.plan(); return; }
    const a = e.target.closest('[data-plan-add]'); if (a) { togglePlan(a.dataset.planAdd); render.plan(); return; }
    const x = e.target.closest('[data-unplan]'); if (x) { togglePlan(x.dataset.unplan); render.plan(); return; }
    if (e.target.closest('[data-clear-plan]')) { plan.stops = []; planResult = null; savePlan(); updateBadge(); clearRoute(); render.plan(); return; }
    if (e.target.closest('[data-build]')) buildPlan();
  });

  function bestOrder(stops) {
    const h = home();
    if (!plan.optimize || stops.length < 3) return stops;
    let best = null, bestD = Infinity;
    const perm = (arr, l) => {
      if (l === arr.length) {
        let dd = havNm(h, arr[0]); for (let i = 1; i < arr.length; i++) dd += havNm(arr[i - 1], arr[i]); dd += havNm(arr[arr.length - 1], h);
        if (dd < bestD) { bestD = dd; best = arr.slice(); } return;
      }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    perm(stops.slice(), 0);
    return best;
  }
  // Points along a polyline every ~stepNm, with the fraction of the leg they sit at.
  function samplesAlong(coords, stepNm) {
    const out = []; let acc = 0, next = 0;
    const segs = []; let total = 0;
    for (let i = 1; i < coords.length; i++) { const a = { lon: coords[i - 1][0], lat: coords[i - 1][1] }, b = { lon: coords[i][0], lat: coords[i][1] }; const d = havNm(a, b); segs.push([a, b, d]); total += d; }
    for (const [a, b, d] of segs) {
      while (next <= acc + d) { const f = d ? (next - acc) / d : 0; out.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, frac: total ? next / total : 0 }); next += stepNm; }
      acc += d;
    }
    const last = coords[coords.length - 1]; out.push({ lon: last[0], lat: last[1], frac: 1 });
    return out;
  }

  async function buildPlan() {
    const stops0 = plan.stops.map(placeById).filter(Boolean);
    if (!stops0.length || planBusy) return;
    planBusy = true; render.plan();
    try {
      const ordered = bestOrder(stops0);
      if (plan.optimize) { plan.stops = ordered.map((p) => p.id); savePlan(); }
      const pts = [home(), ...ordered, home()];
      const res = await seaRoute(pts);
      const sp = speed();
      let tmin = +plan.depart.slice(0, 2) * 60 + +plan.depart.slice(3);
      const rows = []; const wxPts = [];
      res.legs.forEach((leg, i) => {
        const dur = (leg.nm / sp.kn) * 60;
        const smp = samplesAlong(leg.coords, Math.max(2, leg.nm / 4)).slice(0, 6);
        smp.forEach((s) => wxPts.push({ lat: s.lat, lon: s.lon, leg: i, at: tmin + dur * s.frac }));
        rows.push({ kind: 'leg', i, nm: leg.nm, start: tmin, dur, approx: leg.approx });
        tmin += dur;
        const stop = pts[i + 1];
        if (i < res.legs.length - 1) { const st = stayOf(stop); wxPts.push({ lat: stop.lat, lon: stop.lon, leg: i, stop: true, at: tmin + st / 2 }); rows.push({ kind: 'stop', p: stop, at: tmin, stay: st }); tmin += st; }
      });
      const result = { res, pts, rows, endMin: tmin, nm: res.nm, day: plan.day, speed: sp.id, wx: null };
      planResult = result; showRoute(res, pts);
      render.plan();
      // Weather along the route at the time the boat passes each point.
      try {
        const cap = wxPts.slice(0, 40);
        const data = await WX.fetchPoints(cap, 7);
        const legLvl = res.legs.map(() => ({ lvl: -1, reasons: [], s: null }));
        cap.forEach((w, k) => {
          const hh = Math.min(23, Math.round(w.at / 60));
          const i = WX.idxAt(data[k], `${plan.day}T${String(hh).padStart(2, '0')}:00`);
          const s = WX.sample(data[k], i); if (!s) return;
          const a = WX.assess(s); const L2 = legLvl[w.leg];
          if (a.lvl > L2.lvl || (a.lvl === L2.lvl && (!L2.s || s.gust > L2.s.gust))) { L2.lvl = a.lvl; L2.reasons = a.reasons; L2.s = s; }
        });
        const sunset = data[0] && data[0].sunset[plan.day];
        result.wx = { legs: legLvl, sunset: sunset ? sunset.slice(11, 16) : null };
      } catch (e) { result.wx = { error: true }; }
      if (planResult === result) render.plan();
    } finally { planBusy = false; if (state.tab === 'plan') render.plan(); }
  }
  function wxBadge(w) {
    if (!w || w.lvl < 0 || !w.s) return '';
    const r = I18N[lang].reasons;
    // Numbers are already in the badge; only name the wind type when it matters.
    const why = w.reasons.filter((k) => k === 'bura' || k === 'jugo').map((k) => r[k]).join(', ');
    return `<span class="wxb lvl-${w.lvl}"><i class="dot-${w.lvl}"></i>${t('lvlShort')[w.lvl]} · ${Math.round(w.s.wind)}/${Math.round(w.s.gust)} ${t('kn')} ${compass(w.s.dir)}${w.s.wave != null ? ` · ${nf(w.s.wave)} m` : ''}${why ? ` · ${esc(why)}` : ''}</span>`;
  }
  function planHtml(r) {
    const sp = C.speeds.find((s) => s.id === r.speed) || speed();
    const fuel = (r.nm / sp.kn) * sp.lph, fuelRes = fuel * (1 + C.fuelReserve);
    const warn = [];
    if (r.wx && r.wx.legs) { const worst = Math.max(...r.wx.legs.map((l) => l.lvl)); if (worst === 2) warn.push(`<p class="note note--danger"><b>${t('lvl')[2]}.</b> ${t('wxRouteWorst')}: ${wxBadge(r.wx.legs.find((l) => l.lvl === 2))}</p>`); }
    if (r.wx && r.wx.sunset) { const [sh, sm] = r.wx.sunset.split(':').map(Number); if (r.endMin > sh * 60 + sm - 30) warn.push(`<p class="note note--warn">${t('sunsetWarn')(r.wx.sunset)}</p>`); }
    if (fuelRes > C.boat.fuelTankL) warn.push(`<p class="note note--warn">${t('tankWarn')(Math.round(fuelRes), C.boat.fuelTankL)}</p>`);
    if (r.res.legs.some((l) => l.approx || l.coarse)) warn.push(`<p class="note note--warn">${t('approx')}</p>`);
    if (r.wx && r.wx.error) warn.push(`<p class="note">${t('wxError')}</p>`);
    const items = r.rows.map((row) => row.kind === 'leg'
      ? `<li class="tl tl--leg"><time></time><span class="tl__dot"></span><span>${nf(row.nm)} ${t('nm')} · ${fmtDur(row.dur / 60)}${r.wx && r.wx.legs ? '<br>' + wxBadge(r.wx.legs[row.i]) : (r.wx ? '' : `<br><span class="wxb">${t('wxLoading')}</span>`)}</span></li>`
      : `<li class="tl"><time>${hm(row.at)}</time><span class="tl__dot"></span><span><b>${esc(nameOf(row.p))}</b><small>${t('stayFor')(row.stay)}</small></span></li>`).join('');
    return `<h3>${t('planResult')}</h3>
      <div class="stats"><div><b>${nf(r.nm)}</b><span>${t('nm')}</span></div><div><b>${fmtDur(r.nm / sp.kn)}</b><span>${t('underway')}</span></div><div><b>${Math.round(fuel)} ${t('liters')}</b><span>≈ ${Math.round(fuel * C.fuelPriceEur)} € · +${Math.round(C.fuelReserve * 100)} %: ${Math.round(fuelRes)} L</span></div></div>
      ${warn.join('')}
      <ol class="timeline">
        <li class="tl"><time>${plan.depart}</time><span class="tl__dot"></span><span><b>${t('leaveHome')}</b></span></li>
        ${items}
        <li class="tl"><time>${hm(r.endMin)}</time><span class="tl__dot"></span><span><b>${t('arriveHome')}</b>${r.wx && r.wx.sunset ? `<small>☀︎ ${r.wx.sunset}</small>` : ''}</span></li>
      </ol>`;
  }

  /* Weather */
  let homeForecast = null;
  async function loadHomeWeather() {
    try {
      const [d] = await WX.fetchPoints([{ lat: home().lat, lon: home().lon }], 7);
      homeForecast = d;
      if (d.stale) toast(t('offline'));
    } catch (e) { homeForecast = null; }
    updatePill();
    if (state.tab === 'weather') render.weather();
    if (state.tab === 'plan') render.plan();
  }
  const nowIso = () => { const n = localNow(); return `${n.date}T${String(n.h).padStart(2, '0')}:00`; };
  function updatePill() {
    const pill = $('[data-wx-pill]'), txt = $('[data-wx-pill-text]');
    const s = homeForecast && WX.sample(homeForecast, WX.idxAt(homeForecast, nowIso()));
    pill.classList.remove('lvl-0', 'lvl-1', 'lvl-2');
    if (!s) { txt.textContent = homeForecast === null ? '—' : '…'; return; }
    const a = WX.assess(s);
    pill.classList.add('lvl-' + a.lvl);
    txt.textContent = `${Math.round(s.wind)}–${Math.round(s.gust)} ${t('kn')} ${compass(s.dir)}${s.wave != null ? ` · ${nf(s.wave)} m` : ''}`;
    pill.setAttribute('aria-label', `${t('wxNow')}: ${t('lvl')[a.lvl]}, ${txt.textContent}`);
  }
  $('[data-wx-pill]').addEventListener('click', () => setTab('weather'));

  render.weather = function () {
    const d = homeForecast;
    if (!d) { panels.weather.innerHTML = `<h2>${t('wxTitle')}</h2><p class="sub">${homeForecast === null ? t('wxError') : t('wxLoading')}</p>`; return; }
    const days = dayList();
    state.wxDay = state.wxDay && days.includes(state.wxDay) ? state.wxDay : days[0];
    const s = WX.sample(d, WX.idxAt(d, nowIso())) || WX.sample(d, 0);
    const a = WX.assess(s);
    const r = I18N[lang].reasons;
    const why = a.reasons.map((k) => (k === 'wind' ? r.wind(Math.round(s.wind)) : k === 'gust' ? r.gust(Math.round(s.gust)) : k === 'wave' ? r.wave(nf(s.wave)) : r[k])).join(', ');
    const hours = []; for (let h = 6; h <= 21; h++) { const i = WX.idxAt(d, `${state.wxDay}T${String(h).padStart(2, '0')}:00`); const x = WX.sample(d, i); if (x) hours.push(x); }
    panels.weather.innerHTML = `
      <h2>${t('wxTitle')}</h2>
      ${d.stale ? `<p class="hint">${t('stale')(new Date(d.fetched).toLocaleString(lang === 'en' ? 'en-GB' : 'hr-HR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }))}</p>` : ''}
      <div class="now">
        <span class="now__arrow"><svg viewBox="0 0 24 24" style="transform: rotate(${(s.dir + 180) % 360}deg)"><path d="M12 2 18 20 12 16 6 20z"/></svg></span>
        <span class="now__big">${Math.round(s.wind)} <small style="font-size:0.9rem">${t('kn')}</small> · ${t('gust')} ${Math.round(s.gust)}</span>
        <span class="now__small">${t('wxNow')} · ${t('from')} ${compass(s.dir)} (${Math.round(s.dir)}°)${s.wave != null ? ` · ${t('waves')} ${nf(s.wave)} m` : ''}${s.sst != null ? ` · ${t('sea')} ${Math.round(s.sst)}°C` : ''}${s.temp != null ? ` · ${t('air')} ${Math.round(s.temp)}°C` : ''}</span>
        <span class="now__lvl lvl-${a.lvl}"><i class="dot-${a.lvl}"></i><span>${t('lvl')[a.lvl]}${why ? ': ' + esc(why) : ''}</span></span>
      </div>
      <h3>${t('wxDay')}</h3>
      <div class="days" role="group">${days.map((dd, i) => `<button type="button" data-wxday="${dd}" aria-pressed="${dd === state.wxDay}"><span>${esc(dayLabel(dd, i))}</span><b>${+dd.slice(8)}.</b></button>`).join('')}</div>
      <div class="hours">${hours.map((x) => { const l = WX.assess(x).lvl; return `<div class="hour" title="${t('lvl')[l]}"><time>${x.time.slice(11, 13)}</time><svg viewBox="0 0 24 24" style="transform: rotate(${(x.dir + 180) % 360}deg)"><path d="M12 2 18 20 12 16 6 20z"/></svg><b>${Math.round(x.wind)}</b><span>${Math.round(x.gust)}</span><span>${x.wave != null ? nf(x.wave) + ' m' : '–'}</span><span class="bar lvlbar-${l}"></span></div>`; }).join('') || `<p class="hint">${t('wxNoData')}</p>`}</div>
      <p class="hint">${t('wind')} / ${t('gust')} (${t('kn')}) · ${t('waves')}</p>
      <div class="actions"><button class="btn" type="button" data-wx-map>${t('wxMap')}</button><a class="btn btn--light" href="https://meteo.hr/prognoze.php?section=prognoze_specp&param=pomorci" target="_blank" rel="noopener">DHMZ</a></div>
      <h3>${t('windsTitle')}</h3>
      <dl class="winds">${t('winds').map(([a2, b]) => `<dt>${esc(a2)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
      <p class="source">${t('wxSource')}</p>`;
  };
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-wxday]'); if (d) { state.wxDay = d.dataset.wxday; render.weather(); return; }
    if (e.target.closest('[data-wx-map]')) { setOverlay('wind'); sheet.setSnap('peek'); }
  });

  /* Weather overlay on the map */
  const wxGridCache = new Map();
  let wxTimer = 0;
  function scheduleWxGrid() { clearTimeout(wxTimer); wxTimer = setTimeout(loadWxGrid, 350); }
  async function loadWxGrid() {
    if (!mapReady || state.overlay === 'none') return;
    const b = map.getBounds(), z = map.getZoom();
    let step = z < 7 ? 0.6 : z < 8.5 ? 0.3 : z < 10 ? 0.15 : 0.08;
    let pts;
    for (;;) {
      pts = [];
      for (let la = Math.ceil(b.getSouth() / step) * step; la <= b.getNorth(); la += step)
        for (let lo = Math.ceil(b.getWest() / step) * step; lo <= b.getEast(); lo += step) pts.push({ lat: +la.toFixed(3), lon: +lo.toFixed(3) });
      if (pts.length <= 70) break;
      step *= 1.5;
    }
    const need = pts.filter((p) => !wxGridCache.has(p.lat + ',' + p.lon));
    if (need.length) {
      try { const data = await WX.fetchPoints(need, 7); need.forEach((p, i) => wxGridCache.set(p.lat + ',' + p.lon, data[i])); }
      catch (e) { toast(t('wxError')); }
    }
    wxGridPts = pts; drawWxGrid();
  }
  let wxGridPts = [];
  function drawWxGrid() {
    if (!mapReady) return;
    const iso = `${state.wxDay || dayList()[0]}T${String(state.wxHour ?? localNow().h).padStart(2, '0')}:00`;
    const feats = [];
    for (const p of wxGridPts) {
      const d = wxGridCache.get(p.lat + ',' + p.lon); if (!d) continue;
      const s = WX.sample(d, WX.idxAt(d, iso)); if (!s) continue;
      if (state.overlay === 'wind') {
        const a = WX.assess({ ...s, wave: null });
        feats.push(pt(p.lon, p.lat, { dir: s.dir, mag: s.wind, lvl: a.lvl, label: `${Math.round(s.wind)}–${Math.round(s.gust)}` }));
      } else if (s.wave != null) {
        const S = C.safety, lvl = s.wave >= S.waveDanger ? 2 : s.wave >= S.waveCaution ? 1 : 0;
        feats.push(pt(p.lon, p.lat, { dir: s.waveDir ?? 0, mag: Math.min(25, s.wave * 20), lvl, label: `${nf(s.wave)} m` }));
      }
    }
    map.getSource('wx').setData(fc(feats));
  }
  function setOverlay(v) {
    state.overlay = v;
    $$('input[name="ov"]').forEach((i) => (i.checked = i.value === v));
    const bar = $('[data-timebar]'); bar.hidden = v === 'none';
    if (v !== 'none') { renderTimebar(); scheduleWxGrid(); }
    refreshLayers();
  }
  function renderTimebar() {
    const days = dayList();
    state.wxDay = state.wxDay && days.includes(state.wxDay) ? state.wxDay : days[0];
    if (state.wxHour == null) state.wxHour = Math.min(21, Math.max(6, localNow().h));
    $('[data-tb-days]').innerHTML = days.map((d, i) => `<button type="button" role="tab" data-tbday="${d}" aria-selected="${d === state.wxDay}">${esc(dayLabel(d, i))} ${+d.slice(8)}.</button>`).join('');
    const r = $('[data-tb-hour]'); r.value = state.wxHour;
    $('[data-tb-out]').textContent = `${String(state.wxHour).padStart(2, '0')}:00`;
    $('[data-tb-legend]').innerHTML = state.overlay === 'wind'
      ? `<span>${t('wind')}–${t('gust')} (${t('kn')})</span><span><i style="background:#06324f"></i>${t('lvlShort')[0]}</span><span><i style="background:#d08a00"></i>${t('lvlShort')[1]}</span><span><i style="background:#c9361f"></i>${t('lvlShort')[2]}</span>`
      : `<span>${t('waves')} (m)</span><span><i style="background:#06324f"></i>&lt; ${nf(C.safety.waveCaution)}</span><span><i style="background:#d08a00"></i>${nf(C.safety.waveCaution)}–${nf(C.safety.waveDanger)}</span><span><i style="background:#c9361f"></i>≥ ${nf(C.safety.waveDanger)}</span>`;
  }
  $('[data-tb-hour]').addEventListener('input', (e) => { state.wxHour = +e.target.value; $('[data-tb-out]').textContent = `${String(state.wxHour).padStart(2, '0')}:00`; drawWxGrid(); });
  $('[data-tb-days]').addEventListener('click', (e) => { const b = e.target.closest('[data-tbday]'); if (!b) return; state.wxDay = b.dataset.tbday; renderTimebar(); drawWxGrid(); });

  /* Layers dialog */
  const layersEl = $('[data-layers]');
  function openLayers() {
    $('[data-cats]').innerHTML = TYPES.map((ty) => `<button class="chip" type="button" data-cat="${ty}" aria-pressed="${state.cats.has(ty)}">${svgIco(ty)}${t('types')[ty]}</button>`).join('');
    layersEl.hidden = false;
    $('input[name="mode"][value="' + state.mode + '"]').focus({ preventScroll: true });
  }
  const closeLayers = () => { layersEl.hidden = true; $('[data-open-layers]').focus({ preventScroll: true }); };
  $('[data-open-layers]').addEventListener('click', openLayers);
  $$('[data-close-layers]').forEach((b) => b.addEventListener('click', closeLayers));
  layersEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });
  layersEl.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (!c) return;
    const ty = c.dataset.cat; state.cats.has(ty) ? state.cats.delete(ty) : state.cats.add(ty);
    c.setAttribute('aria-pressed', String(state.cats.has(ty))); refreshLayers();
  });
  layersEl.addEventListener('change', async (e) => {
    if (e.target.name === 'mode') {
      state.mode = e.target.value;
      if (state.mode === 'all' && !allData) {
        try {
          const j = await (await fetch('../data/pois-all.json')).json();
          const fid = new Set(featured.map((p) => p.osm).filter(Boolean));
          allData = j.items.filter((r) => !fid.has(r[4])).map((r) => ({ type: r[0], lon: r[1], lat: r[2], name: r[3], osm: r[4], id: 'o:' + r[4] }));
        } catch (err) { toast(t('wxError')); }
      }
      refreshLayers();
      if (state.mode === 'all' && mapReady && map.getZoom() > 9) map.easeTo({ zoom: 8, duration: reduceMotion.matches ? 0 : 500 });
    }
    if (e.target.name === 'ov') setOverlay(e.target.value);
    if (e.target.matches('[data-seamarks]')) { state.seamarks = e.target.checked; refreshLayers(); }
  });

  /* Location */
  let watchId = null;
  $('[data-locate]').addEventListener('click', () => {
    const btn = $('[data-locate]');
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; state.me = null; btn.removeAttribute('data-active'); if (mapReady) map.getSource('me').setData(fc([])); if (state.tab === 'explore') render.explore(); return; }
    if (!navigator.geolocation) return toast(t('locateFail'));
    let first = true;
    watchId = navigator.geolocation.watchPosition((pos) => {
      state.me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      btn.setAttribute('data-active', '');
      if (mapReady) map.getSource('me').setData(fc([pt(state.me.lon, state.me.lat, {})]));
      if (first) { first = false; toast(t('located')); if (mapReady) map.easeTo({ center: [state.me.lon, state.me.lat], zoom: Math.max(map.getZoom(), 11), padding: mapPadding(), duration: reduceMotion.matches ? 0 : 600 }); placeRoute = null; if (state.tab === 'explore') render.explore(); if (state.tab === 'place') render.place(); }
    }, () => { toast(t('locateFail')); watchId = null; }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  });

  /* Language */
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('appTitle');
    $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    $$('[data-t-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.tAria)));
    $$('[data-t-title]').forEach((el) => { el.title = t(el.dataset.tTitle); el.setAttribute('aria-label', t(el.dataset.tTitle)); });
    $('[data-lang]').textContent = lang === 'en' ? 'HR' : 'EN';
    $('[data-lang]').setAttribute('aria-label', lang === 'en' ? 'Hrvatski' : 'English');
    $('.top__brand').href = '../' + (lang === 'en' ? 'en/' : '');
    $$('[data-brand]').forEach((e) => (e.textContent = C.brand.name));
    updatePill();
    if (state.overlay !== 'none') renderTimebar();
    render[state.tab]();
  }
  $('[data-lang]').addEventListener('click', () => { lang = lang === 'en' ? 'hr' : 'en'; ls.set('g:lang', lang); applyLang(); });

  /* Boot */
  async function boot() {
    applyLangStatic();
    try {
      const j = await (await fetch('../data/featured.json')).json();
      featured = j.places.map((p) => ({ ...p, desc: { hr: p.hr, en: p.en } }));
      // Dev only: ?data=worst adds realistic worst-case places at the data boundary (see break-ui pass).
      if (params.get('data') === 'worst') featured.push(
        { id: 'w-long', type: 'anchorage', name: 'Uvala Sveti Nikola pod Velikim Bokom, sjeverozapadna strana otoka Kornat', lon: 15.31, lat: 43.80, tags: ['np', 'pp'], desc: { hr: 'Bove za goste u sezoni (lipanj–rujan); izvan sezone sidrenje na pijesku 6–8 m, dobro držanje, otvoreno prema jugozapadu i lebićadi.', en: '' } },
        { id: 'w-empty', type: 'restaurant', name: '', lon: 15.44, lat: 43.94, desc: {} },
        { id: 'w-short', type: 'sight', name: 'Ž', lon: 15.29, lat: 43.88 },
      );
      places = new Map(featured.map((p) => [p.id, p]));
      routesDef = j.routes;
    } catch (e) { toast(t('wxError')); }
    plan.stops = plan.stops.filter((id) => places.has(id));
    updateBadge();
    applyLang();
    refreshLayers();
    loadHomeWeather();
    setInterval(loadHomeWeather, 30 * 60 * 1000);
    const m = location.hash.match(/^#p=(.+)$/);
    if (m) openPlace(decodeURIComponent(m[1]));
    if ('serviceWorker' in navigator && !EMBED && location.protocol !== 'file:') navigator.serviceWorker.register('../sw.js').catch(() => {});
  }
  function applyLangStatic() { $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t))); }
  function render(tab) { return render[tab](); }
  render.explore = renderExplore;
  boot();
})();
