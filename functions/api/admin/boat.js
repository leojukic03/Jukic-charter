// Owner only. GET current boat details, PUT new ones (shown in the website's boat section).
import { json, nowIso, isAdmin } from '../../../server/http.js';
import { getSetting, putSetting } from '../../../server/db.js';
import { cleanBoat } from '../../../server/boat.js';

export async function onRequestGet(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  return json({ details: await getSetting(context.env.DB, 'boat') });
}

export async function onRequestPut(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  let b = {};
  try { b = await context.request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const details = cleanBoat(b.details || {});
  await putSetting(context.env.DB, 'boat', details, nowIso());
  return json({ ok: true, details });
}
