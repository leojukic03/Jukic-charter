// Fiscalized invoice for the online card payment, issued through Solo (https://solo.com.hr/api-dokumentacija).
// Card payments count as cash for Croatian fiscalization, and Stripe does not fiscalize, so every paid
// booking gets a Solo invoice (Solo fiscalizes it with FINA automatically). The rest paid at pick-up is
// invoiced by the owner on the spot (Solo app or POS), referring to this advance invoice.
//
// Env: SOLO_TOKEN (Postavke → API), SOLO_TIP_RACUNA (invoice type id for an advance invoice, see README),
//      SOLO_TIP_USLUGE (service type id, default 1), SOLO_TIP_RACUNA_FULL (type id when the full price is paid online).
import { daysLabel, netForGross } from '../shared/booking-rules.js';

export { netForGross };
const API = 'https://api.solo.com.hr/racun';

export const invoiceConfigured = (env) => !!(env.SOLO_TOKEN && env.SOLO_TIP_RACUNA);
const dec = (cents) => (cents / 100).toFixed(2).replace('.', ',');

export function invoiceParams(env, b, rules) {
  const lang = b.lang === 'en' ? 'en' : 'hr';
  const vat = rules.invoice ? rules.invoice.vatRate : 25;
  const advance = b.paid_cents < b.total_cents;
  const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString(lang === 'en' ? 'en-GB' : 'hr-HR', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const period = `${fmt(b.date)} – ${fmt(b.end_date)}, ${daysLabel(b.days, lang)}`;
  const pct = rules.payment ? rules.payment.advancePercent : '';
  const desc = lang === 'en'
    ? `${advance ? `Advance payment (${pct}%) for b` : 'B'}areboat rental of Merry Fisher 795, ${period}`
    : `${advance ? `Predujam (${pct} %) za n` : 'N'}ajam broda Merry Fisher 795 bez skipera, ${period}`;
  const rest = b.total_cents - b.paid_cents;
  const notes = lang === 'en'
    ? `Paid by card online (Stripe ${b.stripe_payment || ''}).${advance ? ` Rental total ${dec(b.total_cents)} EUR; remaining ${dec(rest)} EUR is invoiced at pick-up.` : ''}`
    : `Plaćeno karticom online (Stripe ${b.stripe_payment || ''}).${advance ? ` Ukupna cijena najma ${dec(b.total_cents)} EUR; ostatak ${dec(rest)} EUR fakturira se pri preuzimanju.` : ''}`;
  return {
    token: env.SOLO_TOKEN,
    tip_usluge: env.SOLO_TIP_USLUGE || '1',
    tip_racuna: advance ? env.SOLO_TIP_RACUNA : (env.SOLO_TIP_RACUNA_FULL || env.SOLO_TIP_RACUNA),
    tip_kupca: '1', // B2C: guests are private persons
    kupac_naziv: b.name.slice(0, 100),
    usluga: '1',
    opis_usluge_1: desc.slice(0, 500),
    kolicina_1: '1',
    cijena_1: dec(netForGross(b.paid_cents, vat)),
    popust_1: '0',
    porez_stopa_1: String(vat),
    nacin_placanja: '3', // kartice
    jezik_racuna: lang === 'en' ? '2' : '1',
    napomene: notes.slice(0, 1000),
  };
}

// Returns { id, number, pdf } or { error }.
export async function issueInvoice(env, b, rules, { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (!invoiceConfigured(env)) return { error: 'Solo nije postavljen (SOLO_TOKEN, SOLO_TIP_RACUNA).' };
  const body = new URLSearchParams(invoiceParams(env, b, rules)).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    let j;
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      j = await res.json();
    } catch (e) {
      return { error: 'Solo nije dostupan: ' + (e && e.message) };
    }
    if (j && j.status === 0 && j.racun) return { id: j.racun.id, number: j.racun.broj_racuna, pdf: j.racun.pdf || null };
    if (j && j.status === 100 && attempt === 0) { await wait(11000); continue; } // Solo allows one new invoice per 10 s
    return { error: `Solo ${j ? j.status : '?'}: ${j && j.message ? j.message : 'nepoznata greška'}` };
  }
  return { error: 'Solo: previše zahtjeva' };
}
