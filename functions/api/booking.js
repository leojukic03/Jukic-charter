// GET /api/booking?session_id=cs_... → status for the "thank you" message after Stripe.
// The Checkout Session id is the guest's secret; only trip details are returned, no contact data.
import { json } from '../../server/http.js';
import { bySession } from '../../server/db.js';

export async function onRequestGet(context) {
  const sid = new URL(context.request.url).searchParams.get('session_id') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid) || !context.env.DB) return json({ error: 'not_found' }, 404);
  const b = await bySession(context.env.DB, sid);
  if (!b) return json({ error: 'not_found' }, 404);
  return json({
    status: b.status, date: b.date, end_date: b.end_date, days: b.days, guests: b.guests,
    total_cents: b.total_cents, paid_cents: b.paid_cents, currency: b.currency,
  });
}
