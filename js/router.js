// Loads the land/sea masks and talks to the routing worker.
// Usage: const r = await SeaRouter.create(baseUrl); const res = await r.route([[lon,lat], ...]);
(function () {
  async function loadMask(base, name) {
    const meta = await (await fetch(`${base}data/mask-${name}.json`)).json();
    const img = new Image();
    img.decoding = 'async';
    img.src = `${base}data/mask-${name}.png`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = meta.cols; c.height = meta.rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, meta.cols, meta.rows).data;
    const sea = new Uint8Array(meta.cols * meta.rows);
    for (let i = 0, j = 0; i < sea.length; i++, j += 4) sea[i] = px[j] > 127 ? 1 : 0;
    return { meta, sea };
  }

  async function create(base = './') {
    const worker = new Worker(`${base}js/router-worker.js`);
    let seq = 0;
    const pending = new Map();
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
    };
    const call = (msg, transfer) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer || []);
    });
    const send = async (name) => {
      const { meta, sea } = await loadMask(base, name);
      await call({ type: 'grid', name, meta, sea: sea.buffer }, [sea.buffer]);
    };
    // The detailed grid is required; the Adriatic grid is loaded alongside but may be missing.
    const ready = Promise.all([send('fine'), send('coarse').catch(() => null)]);
    return {
      ready,
      async route(points) { await ready; return call({ type: 'route', points }); },
    };
  }

  window.SeaRouter = { create };
})();
