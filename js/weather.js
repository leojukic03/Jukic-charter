// Open-Meteo forecast + marine data, cached for offline use, and a small-boat safety assessment.
(function () {
  const C = window.CHARTER;
  const W = C.weather;
  const key = W.apiKey ? `&apikey=${encodeURIComponent(W.apiKey)}` : '';
  const FC = W.apiKey ? W.customerForecastUrl : W.forecastUrl;
  const MA = W.apiKey ? W.customerMarineUrl : W.marineUrl;
  const TTL = 30 * 60 * 1000;
  const mem = new Map();

  const r3 = (v) => Math.round(v * 1000) / 1000;
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota or private mode */ } }
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // points: [{lat, lon}] → [{time:[], wind:[], gust:[], dir:[], temp:[], wave:[], waveDir:[], period:[], sst:[], sunset:{date:time}}]
  async function fetchPoints(points, days = 7) {
    const out = new Array(points.length);
    const need = [];
    points.forEach((p, i) => {
      const k = `wx:${r3(p.lat)},${r3(p.lon)},${days}`;
      const m = mem.get(k);
      if (m && Date.now() - m.t < TTL) out[i] = m.d;
      else need.push({ i, k, p });
    });
    for (let s = 0; s < need.length; s += 50) {
      const chunk = need.slice(s, s + 50);
      const lat = chunk.map((c) => r3(c.p.lat)).join(','), lon = chunk.map((c) => r3(c.p.lon)).join(',');
      const q = `latitude=${lat}&longitude=${lon}&timezone=Europe%2FZagreb&forecast_days=${days}${key}`;
      try {
        const [f, m] = await Promise.all([
          getJson(`${FC}?${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&daily=sunrise,sunset&wind_speed_unit=kn`),
          getJson(`${MA}?${q}&hourly=wave_height,wave_direction,wave_period,sea_surface_temperature&cell_selection=sea`).catch(() => null),
        ]);
        const fa = Array.isArray(f) ? f : [f];
        const ma = m ? (Array.isArray(m) ? m : [m]) : [];
        chunk.forEach((c, j) => {
          const fj = fa[j], mj = ma[j];
          const d = {
            time: fj.hourly.time,
            wind: fj.hourly.wind_speed_10m, gust: fj.hourly.wind_gusts_10m, dir: fj.hourly.wind_direction_10m, temp: fj.hourly.temperature_2m,
            wave: mj ? mj.hourly.wave_height : [], waveDir: mj ? mj.hourly.wave_direction : [], period: mj ? mj.hourly.wave_period : [], sst: mj ? mj.hourly.sea_surface_temperature : [],
            sunset: Object.fromEntries(fj.daily.time.map((t, k) => [t, fj.daily.sunset[k]])),
            sunrise: Object.fromEntries(fj.daily.time.map((t, k) => [t, fj.daily.sunrise[k]])),
            fetched: Date.now(),
          };
          mem.set(c.k, { t: Date.now(), d });
          if (points.length <= 3) store(c.k, d); // keep the home forecast for offline use
          out[c.i] = d;
        });
      } catch (err) {
        // Offline or blocked: fall back to whatever was saved last time.
        chunk.forEach((c) => { const old = load(c.k); if (old) { out[c.i] = Object.assign(old, { stale: true }); } });
        if (chunk.some((c) => !out[c.i])) throw err;
      }
    }
    return out;
  }

  const idxAt = (d, isoHour) => d.time.indexOf(isoHour);

  function windType(dir) {
    if (dir == null) return null;
    if (dir >= 10 && dir <= 90) return 'bura';
    if (dir >= 100 && dir <= 170) return 'jugo';
    if (dir >= 280 && dir <= 340) return 'maestral';
    return null;
  }

  // Level 0 calm, 1 caution, 2 danger, with reasons.
  function assess(w) {
    const S = C.safety;
    const reasons = []; let lvl = 0;
    const bump = (l, r) => { if (l > lvl) lvl = l; if (r && !reasons.includes(r)) reasons.push(r); };
    const type = windType(w.dir);
    if (w.wind >= S.windDanger) bump(2, 'wind'); else if (w.wind >= S.windCaution) bump(1, 'wind');
    if (w.gust >= S.gustDanger) bump(2, 'gust'); else if (w.gust >= S.gustCaution) bump(1, 'gust');
    if (w.wave != null) { if (w.wave >= S.waveDanger) bump(2, 'wave'); else if (w.wave >= S.waveCaution) bump(1, 'wave'); }
    if (type === 'bura' && w.gust >= S.buraGustDanger) bump(2, 'bura'); else if (type === 'bura' && w.gust >= 12) bump(1, 'bura');
    if (type === 'jugo' && w.wind >= S.jugoWindDanger) bump(2, 'jugo'); else if (type === 'jugo' && w.wind >= 10) bump(1, 'jugo');
    return { lvl, reasons, type };
  }

  function sample(d, i) {
    if (!d || i < 0) return null;
    return { time: d.time[i], wind: d.wind[i], gust: d.gust[i], dir: d.dir[i], temp: d.temp[i], wave: d.wave[i] ?? null, waveDir: d.waveDir[i] ?? null, period: d.period[i] ?? null, sst: d.sst[i] ?? null };
  }

  window.Weather = { fetchPoints, assess, sample, idxAt, windType };
})();
