// GET /api/availability → { booked: [taken dates], from, to, minDays }
import { json, nowIso, loadRules } from '../../server/http.js';
import { takenBetween } from '../../server/db.js';
import { bookableRange, todayIn, takenDates } from '../../shared/booking-rules.js';

export async function onRequestGet(context) {
  if (!context.env.DB) return json({ error: 'not_configured' }, 503);
  const rules = await loadRules(context);
  const range = bookableRange(rules, todayIn(rules.timezone));
  const rows = await takenBetween(context.env.DB, range.from, range.to, nowIso());
  return json({ booked: takenDates(rows, range.from, range.to), from: range.from, to: range.to, minDays: rules.minDays });
}
