// POST /api/stripe-webhook — Stripe events. Configure in Stripe → Developers → Webhooks with:
// checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed, checkout.session.expired
import { json, nowIso, loadRules } from '../../server/http.js';
import { confirm, expire, extendHold, byId, setInvoice } from '../../server/db.js';
import { verifyWebhook } from '../../server/stripe.js';
import { notifyConfirmed } from '../../server/mail.js';
import { issueInvoice, invoiceConfigured } from '../../server/invoice.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const payload = await request.text();
  const event = await verifyWebhook(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!event) return new Response('invalid signature', { status: 400 });

  const s = event.data && event.data.object;
  const id = s && (s.client_reference_id || (s.metadata && s.metadata.booking_id));
  if (!id || !env.DB) return json({ received: true });

  switch (event.type) {
    case 'checkout.session.completed':
      if (s.payment_status !== 'paid') {
        // Delayed payment method: keep the slot for three days while the payment settles.
        await extendHold(env.DB, id, new Date(Date.now() + 3 * 86400000).toISOString());
        break;
      }
    // fall through: paid immediately
    case 'checkout.session.async_payment_succeeded': {
      const first = await confirm(env.DB, id, s.payment_intent, nowIso());
      if (first) {
        // After answering Stripe: fiscalized invoice first, then e-mails that link to it.
        const work = (async () => {
          const rules = await loadRules(context);
          let booking = await byId(env.DB, id);
          if (invoiceConfigured(env)) {
            const inv = await issueInvoice(env, booking, rules);
            await setInvoice(env.DB, id, inv);
            if (inv.error) console.error('invoice', inv.error);
            booking = await byId(env.DB, id);
          }
          await notifyConfirmed(env, booking, rules);
        })().catch((e) => console.error('after payment', e && e.message));
        if (context.waitUntil) context.waitUntil(work); else await work;
      }
      break;
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await expire(env.DB, id);
      break;
    default:
      break;
  }
  return json({ received: true });
}
