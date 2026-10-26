// POST /api/release { id } — the guest left Stripe without paying: close the session and free the slot now
// instead of waiting for the hold to run out.
import { json } from '../../server/http.js';
import { byId, expire } from '../../server/db.js';
import { expireCheckout } from '../../server/stripe.js';

export async function onRequestPost(context) {
  const { env } = context;
  let id = '';
  try { id = String((await context.request.json()).id || ''); } catch { /* empty body */ }
  if (!/^[0-9a-f-]{36}$/.test(id) || !env.DB) return json({ error: 'bad_request' }, 400);
  const b = await byId(env.DB, id);
  if (!b || b.status !== 'pending') return json({ status: b ? b.status : 'unknown' });
  if (b.stripe_session && env.STRIPE_SECRET_KEY) {
    try { await expireCheckout(env, b.stripe_session); }
    catch { return json({ status: 'pending' }); } // already paid or closed: let the webhook decide
  }
  await expire(env.DB, id);
  return json({ status: 'expired' });
}
