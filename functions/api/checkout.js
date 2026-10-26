// POST /api/checkout  { date, days, guests, license, name, email, phone, note, lang }
// Holds the dates, opens a Stripe Checkout page for the amount computed here, returns { url }.
import { json, loadRules, siteUrl, hashClient } from '../../server/http.js';
import { insertHold, openHoldsFor, setSession, deleteHold } from '../../server/db.js';
import { createCheckout } from '../../server/stripe.js';
import { validate, quote, todayIn, guestsLabel, daysLabel } from '../../shared/booking-rules.js';

const MAX_OPEN_HOLDS = 3;

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB || !env.STRIPE_SECRET_KEY) return json({ error: 'not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const rules = await loadRules(context);
  const { ok, errors, value: b } = validate(rules, body || {}, todayIn(rules.timezone));
  if (!ok) return json({ error: 'invalid', fields: errors }, 422);
  const q = quote(rules, b);

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const holdMin = Math.max(30, rules.holdMinutes || 30); // Stripe's minimum session lifetime is 30 min
  const clientHash = await hashClient(request, env.ADMIN_TOKEN || '');
  if ((await openHoldsFor(env.DB, clientHash, nowIso)) >= MAX_OPEN_HOLDS) return json({ error: 'too_many' }, 429);

  const id = crypto.randomUUID();
  const held = await insertHold(env.DB, {
    ...b, id, end_date: q.end, total_cents: q.totalCents, paid_cents: q.payNowCents, currency: rules.currency, client_hash: clientHash,
    // The hold outlives the Stripe session by a few minutes, so a payment made at the last second still finds it.
    expires_at: new Date(now + (holdMin + 5) * 60000).toISOString(),
  }, nowIso);
  if (!held) return json({ error: 'taken' }, 409);

  const L = b.lang;
  const site = siteUrl(context);
  const page = L === 'en' ? `${site}/en/` : `${site}/`;
  const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString(L === 'en' ? 'en-GB' : 'hr-HR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const money = (v) => new Intl.NumberFormat(L === 'en' ? 'en-GB' : 'hr-HR', { style: 'currency', currency: rules.currency, maximumFractionDigits: 0 }).format(v);
  const when = `${fmt(b.date)} ${rules.checkIn} – ${fmt(q.end)} ${rules.checkOut}`;
  const parts = L === 'en'
    ? `${daysLabel(b.days, 'en')}, ${guestsLabel(b.guests, 'en')}. Total ${money(q.total)}${q.cleaning ? ` incl. ${money(q.cleaning)} final cleaning` : ''}.`
    : `${daysLabel(b.days, 'hr')}, ${guestsLabel(b.guests, 'hr')}. Ukupno ${money(q.total)}${q.cleaning ? `, uključeno završno čišćenje ${money(q.cleaning)}` : ''}.`;
  const advance = q.payLater > 0
    ? (L === 'en' ? ` This is the ${rules.payment.advancePercent}% advance; ${money(q.payLater)} is paid at pick-up.` : ` Ovo je predujam od ${rules.payment.advancePercent} %; ${money(q.payLater)} plaća se pri preuzimanju broda.`)
    : '';

  try {
    const session = await createCheckout(env, {
      mode: 'payment',
      locale: L === 'en' ? 'en' : 'hr',
      customer_email: b.email,
      client_reference_id: id,
      metadata: { booking_id: id, date: b.date, end_date: q.end, days: b.days },
      payment_intent_data: { metadata: { booking_id: id }, description: `${rules.productName[L]} · ${b.date} – ${q.end}` },
      expires_at: Math.floor(now / 1000) + holdMin * 60,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: rules.currency.toLowerCase(),
          unit_amount: q.payNowCents,
          product_data: { name: rules.productName[L], description: `${when}. ${parts}${advance}` },
        },
      }],
      custom_text: {
        submit: {
          message: L === 'en'
            ? `Payment confirms the booking. ${q.payLater > 0 ? `The remaining ${money(q.payLater)}, the security deposit and fuel are settled at pick-up.` : 'Security deposit and fuel are settled at pick-up.'} Bareboat only: bring your boat licence. Terms: ${site}/uvjeti/`
            : `Plaćanjem je rezervacija potvrđena. ${q.payLater > 0 ? `Ostatak od ${money(q.payLater)}, polog i gorivo plaćaju se pri preuzimanju.` : 'Polog i gorivo plaćaju se pri preuzimanju.'} Najam je bez skipera: ponesi dozvolu voditelja brodice. Uvjeti: ${site}/uvjeti/`,
        },
      },
      success_url: `${page}?booking=success&session_id={CHECKOUT_SESSION_ID}#rezervacija`,
      cancel_url: `${page}?booking=cancel&b=${id}#rezervacija`,
    });
    await setSession(env.DB, id, session.id);
    return json({ url: session.url, id });
  } catch (err) {
    await deleteHold(env.DB, id);
    console.error(err && err.message);
    return json({ error: 'payment_unavailable' }, 502);
  }
}
