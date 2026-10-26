// GET /api/calendar.ics?token=ICAL_TOKEN — subscribe from Google/Apple Calendar to see every paid rental
// and every closed day. The token is separate from ADMIN_TOKEN because calendar URLs get shared.
import { nowIso, loadRules } from '../../server/http.js';
import { listBookings, listBlocks } from '../../server/db.js';
import { todayIn, addDays } from '../../shared/booking-rules.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// iCalendar lines longer than 75 octets must be folded.
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
const hhmm = (t) => t.replace(':', '') + '00';

export async function onRequestGet(context) {
  const { env, request } = context;
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!env.ICAL_TOKEN || env.ICAL_TOKEN.length < 16 || token !== env.ICAL_TOKEN) return new Response('Not found', { status: 404 });
  const rules = await loadRules(context);
  const from = addDays(todayIn(rules.timezone), -30);
  const stamp = nowIso().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const tz = rules.timezone;
  const ev = [];
  const d = (iso) => iso.replace(/-/g, '');
  for (const b of await listBookings(env.DB, from)) {
    if (b.status !== 'confirmed') continue;
    ev.push('BEGIN:VEVENT', `UID:${b.id}@booking`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${tz}:${d(b.date)}T${hhmm(rules.checkIn)}`, `DTEND;TZID=${tz}:${d(b.end_date)}T${hhmm(rules.checkOut)}`,
      fold(`SUMMARY:${esc(`${b.name} · ${b.days} dana · ${b.guests} os.`)}`),
      fold(`DESCRIPTION:${esc(`${b.email}\n${b.phone || ''}\nPlaćeno ${(b.paid_cents / 100).toFixed(2)} od ${(b.total_cents / 100).toFixed(2)} ${b.currency}; ostatak ${((b.total_cents - b.paid_cents) / 100).toFixed(2)} pri preuzimanju${b.note ? '\n' + b.note : ''}`)}`),
      'END:VEVENT');
  }
  for (const k of await listBlocks(env.DB, from)) {
    ev.push('BEGIN:VEVENT', `UID:${k.date}@block`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(k.date)}`, `DTEND;VALUE=DATE:${d(addDays(k.date, 1))}`,
      fold(`SUMMARY:${esc(`Zatvoreno${k.note ? ': ' + k.note : ''}`)}`), 'END:VEVENT');
  }
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//charter//booking//HR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Rezervacije broda', `X-WR-TIMEZONE:${tz}`, ...ev, 'END:VCALENDAR'].join('\r\n');
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } });
}
