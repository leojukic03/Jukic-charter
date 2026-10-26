// Booking rules shared by the website (dynamic import) and the server (Pages Functions).
// Multi-day bareboat rental: a start date and a number of days. Pure functions over data/booking.json;
// the server always recomputes the price.

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
// Today's date in the charter's timezone, as YYYY-MM-DD.
export function todayIn(tz, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export const endOf = (start, days) => addDays(start, days - 1);
export function datesOf(start, days) {
  const out = [];
  for (let i = 0; i < days; i++) out.push(addDays(start, i));
  return out;
}

// "1 osoba, 2 osobe, 5 osoba" / "1 guest, 2 guests"
export function guestsLabel(n, lang) {
  if (lang === 'en') return `${n} ${n === 1 ? 'guest' : 'guests'}`;
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'osobe' : 'osoba'}`;
}
// "1 dan, 3 dana, 21 dan" / "1 day, 3 days"
export function daysLabel(n, lang) {
  if (lang === 'en') return `${n} ${n === 1 ? 'day' : 'days'}`;
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana'}`;
}

export function seasonFor(rules, iso) {
  const md = iso.slice(5, 10);
  return rules.seasons.find((s) => s.ranges.some(([a, b]) => md >= a && md <= b)) || null;
}

export function bookableRange(rules, today) {
  return { from: addDays(today, rules.minDaysAhead), to: addMonths(today, rules.maxMonthsAhead) };
}

// Fiscal invoices state a net price with two decimals and add VAT on top. Not every gross amount can be
// written that way (at 13 % about one whole-euro amount in eight cannot), so the advance is nudged to the
// nearest euro that can, and the invoice then matches the card charge to the cent.
export function netForGross(grossCents, vatPct) {
  const r = 1 + vatPct / 100;
  const base = Math.round(grossCents / r);
  for (const d of [0, -1, 1, -2, 2, -3, 3]) if (Math.round((base + d) * r) === grossCents) return base + d;
  return base;
}
export const grossReachable = (grossCents, vatPct) => Math.round(netForGross(grossCents, vatPct) * (1 + vatPct / 100)) === grossCents;

// Price of a rental. Each day is charged at its own season's rate; from `weeklyFromDays` on,
// the weekly rate (perWeek / 7 per day) applies. Returns null if any day is outside the seasons.
export function quote(rules, { date, days }) {
  if (!date || !Number.isInteger(days) || days < 1) return null;
  const weekly = days >= rules.weeklyFromDays;
  let rental = 0;
  const bySeason = new Map();
  for (const d of datesOf(date, days)) {
    const s = seasonFor(rules, d);
    if (!s) return null;
    rental += weekly ? s.perWeek / 7 : s.perDay;
    bySeason.set(s.id, (bySeason.get(s.id) || 0) + 1);
  }
  rental = Math.round(rental);
  const cleaning = rules.cleaningFee || 0;
  const total = rental + cleaning;
  const advance = rules.payment.mode === 'advance';
  let payNow = advance ? Math.round((total * rules.payment.advancePercent) / 100) : total;
  const vat = rules.invoice && rules.invoice.vatRate;
  if (advance && vat) {
    for (const d of [0, 1, -1, 2, -2, 3, -3]) if (grossReachable((payNow + d) * 100, vat)) { payNow += d; break; }
  }
  return { days, end: endOf(date, days), weekly, rental, cleaning, total, payNow, payLater: total - payNow,
    totalCents: total * 100, payNowCents: payNow * 100, seasons: [...bySeason.keys()] };
}

// Validates a booking request. Returns { ok, errors: [field codes], value } with normalised fields.
export function validate(rules, input, today) {
  const errors = [];
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const value = {
    date: s(input.date, 10),
    days: Number.parseInt(input.days, 10),
    guests: Number.parseInt(input.guests, 10),
    license: input.license === true,
    name: s(input.name, 120),
    email: s(input.email, 200).toLowerCase(),
    phone: s(input.phone, 40),
    note: s(input.note, 1000),
    lang: input.lang === 'en' ? 'en' : 'hr',
  };
  const range = bookableRange(rules, today);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(value.date) && !Number.isNaN(Date.parse(value.date + 'T00:00:00Z'));
  if (!validDate || value.date < range.from) errors.push('date');
  if (!Number.isInteger(value.days) || value.days < rules.minDays || value.days > rules.maxDays) errors.push('days');
  else if (validDate && endOf(value.date, value.days) > range.to) errors.push('date');
  if (!Number.isInteger(value.guests) || value.guests < 1 || value.guests > rules.maxGuests) errors.push('guests');
  if (!value.license) errors.push('license'); // bareboat only: a licence is required
  if (value.name.length < 2) errors.push('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) errors.push('email');
  if (!errors.includes('date') && !errors.includes('days') && !quote(rules, value)) errors.push('season');
  return { ok: errors.length === 0, errors, value };
}

// Expands taken ranges [{date, end_date}] and blocked days [{date}] into sorted unique dates within [from, to].
export function takenDates(rows, from, to) {
  const set = new Set();
  for (const r of rows) {
    const end = r.end_date || r.date;
    for (let d = r.date < from ? from : r.date; d <= end && d <= to; d = addDays(d, 1)) set.add(d);
  }
  return [...set].sort();
}

// Longest free run (in days) starting at `start`, up to maxDays, counting only in-season, untaken days.
export function freeRun(rules, start, taken, lastBookable) {
  let n = 0;
  for (let d = start; n < rules.maxDays && d <= lastBookable && !taken.has(d) && seasonFor(rules, d); d = addDays(d, 1)) n++;
  return n;
}
