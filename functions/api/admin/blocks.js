// Owner only. Close or reopen days by hand (phone bookings, other platforms, service, own use).
// POST   /api/admin/blocks { from, to, note }   (to optional; at most 92 days at once)
// DELETE /api/admin/blocks { from, to }
import { json, nowIso, isAdmin } from '../../../server/http.js';
import { addBlocks, removeBlocks } from '../../../server/db.js';
import { addDays } from '../../../shared/booking-rules.js';

async function input(context) {
  let b = {};
  try { b = await context.request.json(); } catch { /* empty */ }
  const ok = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = ok(b.from) ? b.from : null;
  const to = ok(b.to) ? b.to : from;
  if (!from || to < from) return null;
  const dates = [];
  for (let d = from; d <= to && dates.length < 92; d = addDays(d, 1)) dates.push(d);
  return { dates, note: typeof b.note === 'string' ? b.note.slice(0, 200) : '' };
}

export async function onRequestPost(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  const v = await input(context);
  if (!v) return json({ error: 'bad_request' }, 400);
  await addBlocks(context.env.DB, v.dates, v.note, nowIso());
  return json({ ok: true, days: v.dates.length });
}

export async function onRequestDelete(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  const v = await input(context);
  if (!v) return json({ error: 'bad_request' }, 400);
  return json({ ok: (await removeBlocks(context.env.DB, v.dates)) > 0 });
}
