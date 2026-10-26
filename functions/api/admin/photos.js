// Owner only (Authorization: Bearer ADMIN_TOKEN). Boat photos.
// POST   multipart/form-data: file, width, height, alt_hr, alt_en  → { ok, photo }
// PATCH  JSON { order: [ids] } or { id, alt_hr, alt_en }
// DELETE JSON { id }
import { json, nowIso, isAdmin } from '../../../server/http.js';
import { addPhoto, countPhotos, photoById, updatePhotoAlt, reorderPhotos, deletePhoto } from '../../../server/db.js';
import { sniffImage } from '../../../server/boat.js';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 40;
const ready = (env) => env.DB && env.PHOTOS;

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  if (!ready(env)) return json({ error: 'not_configured' }, 503);
  let form;
  try { form = await request.formData(); } catch { return json({ error: 'bad_request' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no_file' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'too_large' }, 413);
  if ((await countPhotos(env.DB)) >= MAX_PHOTOS) return json({ error: 'too_many' }, 409);
  const bytes = await file.arrayBuffer();
  const kind = sniffImage(bytes);
  if (!kind) return json({ error: 'not_an_image' }, 415);
  const id = crypto.randomUUID();
  const int = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 && n < 20000 ? n : null; };
  const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 160) : '');
  await env.PHOTOS.put(`boat/${id}.${kind.ext}`, bytes, { httpMetadata: { contentType: kind.type } });
  const photo = { id, ext: kind.ext, type: kind.type, width: int(form.get('width')), height: int(form.get('height')), alt_hr: text(form.get('alt_hr')), alt_en: text(form.get('alt_en')) };
  await addPhoto(env.DB, photo, nowIso());
  return json({ ok: true, photo: { ...photo, url: `/api/photos/${id}.${kind.ext}` } });
}

export async function onRequestPatch(context) {
  const { env } = context;
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  if (!ready(env)) return json({ error: 'not_configured' }, 503);
  let b = {};
  try { b = await context.request.json(); } catch { /* empty */ }
  if (Array.isArray(b.order)) {
    const ids = b.order.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)).slice(0, MAX_PHOTOS);
    await reorderPhotos(env.DB, ids);
    return json({ ok: true });
  }
  if (typeof b.id === 'string') {
    const t = (v) => (typeof v === 'string' ? v.trim().slice(0, 160) : '');
    const r = await updatePhotoAlt(env.DB, b.id, t(b.alt_hr), t(b.alt_en));
    return json({ ok: r.meta.changes === 1 });
  }
  return json({ error: 'bad_request' }, 400);
}

export async function onRequestDelete(context) {
  const { env } = context;
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  if (!ready(env)) return json({ error: 'not_configured' }, 503);
  let b = {};
  try { b = await context.request.json(); } catch { /* empty */ }
  const p = typeof b.id === 'string' ? await photoById(env.DB, b.id) : null;
  if (!p) return json({ ok: false }, 404);
  await env.PHOTOS.delete(`boat/${p.id}.${p.ext}`);
  await deletePhoto(env.DB, p.id);
  return json({ ok: true });
}
