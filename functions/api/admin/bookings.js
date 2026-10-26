// Owner only (Authorization: Bearer ADMIN_TOKEN).
// GET  /api/admin/bookings          → { bookings, blocks } from yesterday on
// POST /api/admin/bookings { action: 'cancel', id } → marks a booking cancelled (refund it in Stripe)
import { json, nowIso, isAdmin, loadRules } from '../../../server/http.js';
import { listBookings, listBlocks, cancelBooking, byId, setInvoice } from '../../../server/db.js';
import { issueInvoice } from '../../../server/invoice.js';
import { todayIn, addDays } from '../../../shared/booking-rules.js';

export async function onRequestGet(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  const rules = await loadRules(context);
  const from = addDays(todayIn(rules.timezone), -1);
  const now = nowIso();
  // Lapsed holds are noise for the owner; open holds show as "waiting for payment".
  const bookings = (await listBookings(context.env.DB, from)).filter((b) => b.status !== 'pending' || b.expires_at > now);
  return json({ bookings, blocks: await listBlocks(context.env.DB, from), now });
}

export async function onRequestPost(context) {
  if (!isAdmin(context)) return json({ error: 'unauthorized' }, 401);
  let body = {};
  try { body = await context.request.json(); } catch { /* empty */ }
  if (body.action === 'cancel' && typeof body.id === 'string') {
    const r = await cancelBooking(context.env.DB, body.id);
    return json({ ok: r.meta.changes === 1 });
  }
  if (body.action === 'invoice' && typeof body.id === 'string') {
    // Re-try the fiscalized invoice for a paid booking (e.g. Solo was down or not yet configured).
    const b = await byId(context.env.DB, body.id);
    if (!b || b.status !== 'confirmed' || b.invoice_id) return json({ ok: false, error: 'not_applicable' }, 409);
    const inv = await issueInvoice(context.env, b, await loadRules(context));
    await setInvoice(context.env.DB, b.id, inv);
    return json({ ok: !inv.error, invoice: inv });
  }
  return json({ error: 'bad_request' }, 400);
}
