import { guestsLabel, daysLabel } from '../shared/booking-rules.js';

// Optional e-mail via Resend (https://resend.com). Without RESEND_API_KEY nothing is sent:
// the guest still gets Stripe's payment receipt, and the owner sees the booking in Stripe and in /admin/.

const money = (cents, cur, lang) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'hr-HR', { style: 'currency', currency: cur }).format(cents / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function send(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, reply_to: env.NOTIFY_EMAIL || undefined }),
  });
  return res.ok;
}

export function bookingLines(b, rules, lang) {
  const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'hr-HR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    from: `${fmt(b.date)}, ${rules.checkIn}`, to: `${fmt(b.end_date)}, ${rules.checkOut}`, days: daysLabel(b.days, lang), guests: guestsLabel(b.guests, lang),
    paid: money(b.paid_cents, b.currency, lang), total: money(b.total_cents, b.currency, lang),
    rest: b.total_cents > b.paid_cents ? money(b.total_cents - b.paid_cents, b.currency, lang) : null,
  };
}

export async function notifyConfirmed(env, b, rules) {
  const g = bookingLines(b, rules, b.lang);
  const o = bookingLines(b, rules, 'hr');
  const guest = b.lang === 'en'
    ? `<p>Hello ${esc(b.name)},</p><p>your rental is confirmed: <b>${esc(g.from)}</b> to <b>${esc(g.to)}</b> (${g.days}, ${g.guests}).</p><p>Paid: ${g.paid}${g.rest ? `. Due at pick-up: ${g.rest}` : ''}. The security deposit and fuel are settled at pick-up. Please bring your boat licence.</p>${b.invoice_pdf ? `<p>Invoice for your payment: <a href="${esc(b.invoice_pdf)}">${esc(b.invoice_number || 'PDF')}</a></p>` : ''}<p>See you in Biograd.</p>`
    : `<p>Pozdrav ${esc(b.name)},</p><p>najam je potvrđen: od <b>${esc(g.from)}</b> do <b>${esc(g.to)}</b> (${g.days}, ${g.guests}).</p><p>Plaćeno: ${g.paid}${g.rest ? `. Ostatak pri preuzimanju: ${g.rest}` : ''}. Polog i gorivo rješavamo pri preuzimanju. Ponesi dozvolu voditelja brodice.</p>${b.invoice_pdf ? `<p>Račun za uplatu: <a href="${esc(b.invoice_pdf)}">${esc(b.invoice_number || 'PDF')}</a></p>` : ''}<p>Vidimo se u Biogradu.</p>`;
  const owner = `<p>Nova plaćena rezervacija.</p><ul><li>${esc(o.from)} → ${esc(o.to)} (${o.days})</li><li>${esc(b.name)} · ${esc(b.email)} · ${esc(b.phone || '-')}</li><li>${o.guests} · dozvola potvrđena</li><li>Plaćeno ${o.paid} od ${o.total}${o.rest ? `, naplatiti pri preuzimanju ${o.rest}` : ''}</li>${b.note ? `<li>Napomena: ${esc(b.note)}</li>` : ''}<li>Račun: ${b.invoice_number ? esc(b.invoice_number) : b.invoice_error ? 'NIJE IZDAN: ' + esc(b.invoice_error) : 'nije postavljeno izdavanje (Solo)'}</li></ul>`;
  await Promise.allSettled([
    send(env, b.email, b.lang === 'en' ? 'Your boat rental is confirmed' : 'Najam broda je potvrđen', guest),
    send(env, env.NOTIFY_EMAIL, `Rezervacija: ${o.from} → ${o.to}`, owner),
  ]);
}
