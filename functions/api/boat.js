// GET /api/boat → { details, photos } for the website's boat section. Empty until the owner adds content in /admin/.
import { json } from '../../server/http.js';
import { getSetting, listPhotos } from '../../server/db.js';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ error: 'not_configured' }, 503);
  const [details, photos] = await Promise.all([getSetting(env.DB, 'boat'), listPhotos(env.DB)]);
  return json({
    details,
    photos: photos.map((p) => ({ id: p.id, url: `/api/photos/${p.id}.${p.ext}`, width: p.width, height: p.height, alt_hr: p.alt_hr, alt_en: p.alt_en })),
  }, 200, { 'Cache-Control': 'public, max-age=60' });
}
