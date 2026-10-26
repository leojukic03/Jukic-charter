// Data access for bookings and blocks on Cloudflare D1.
// Taken = confirmed bookings, unexpired pending holds, and days the owner blocked.

const ACTIVE = `(status = 'confirmed' OR (status = 'pending' AND expires_at > ?))`;

// Rows overlapping [from, to]: bookings as {date, end_date}, blocks as {date}.
export async function takenBetween(db, from, to, nowIso) {
  const { results: b } = await db.prepare(
    `SELECT date, end_date FROM bookings WHERE date <= ? AND end_date >= ? AND ${ACTIVE}`,
  ).bind(to, from, nowIso).all();
  const { results: k } = await db.prepare('SELECT date FROM blocks WHERE date BETWEEN ? AND ?').bind(from, to).all();
  return [...b, ...k];
}

// Inserts a pending hold only if no day in the range is taken, in one statement so two guests
// can't pay for overlapping dates.
export async function insertHold(db, row, nowIso) {
  const res = await db.prepare(
    `INSERT INTO bookings (id, date, end_date, days, guests, license, name, email, phone, note, lang,
       total_cents, paid_cents, currency, status, source, client_hash, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web', ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE date <= ? AND end_date >= ? AND ${ACTIVE})
       AND NOT EXISTS (SELECT 1 FROM blocks WHERE date BETWEEN ? AND ?)`,
  ).bind(
    row.id, row.date, row.end_date, row.days, row.guests, row.license ? 1 : 0, row.name, row.email,
    row.phone || null, row.note || null, row.lang, row.total_cents, row.paid_cents, row.currency, row.client_hash || null,
    nowIso, row.expires_at,
    row.end_date, row.date, nowIso,
    row.date, row.end_date,
  ).run();
  return res.meta.changes === 1;
}

export async function openHoldsFor(db, clientHash, nowIso) {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE client_hash = ? AND status = 'pending' AND expires_at > ?`)
    .bind(clientHash, nowIso).first();
  return r ? r.n : 0;
}

export const setSession = (db, id, session) =>
  db.prepare('UPDATE bookings SET stripe_session = ? WHERE id = ?').bind(session, id).run();

export const deleteHold = (db, id) =>
  db.prepare(`DELETE FROM bookings WHERE id = ? AND status = 'pending'`).bind(id).run();

export const bySession = (db, session) =>
  db.prepare('SELECT * FROM bookings WHERE stripe_session = ?').bind(session).first();

export const byId = (db, id) =>
  db.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();

// Returns true only on the transition to confirmed, so notifications are sent once even if Stripe retries.
export async function confirm(db, id, payment, nowIso) {
  const r = await db.prepare(
    `UPDATE bookings SET status = 'confirmed', stripe_payment = ?, confirmed_at = ?, expires_at = NULL
     WHERE id = ? AND status IN ('pending', 'expired')`,
  ).bind(payment || null, nowIso, id).run();
  return r.meta.changes === 1;
}

// Payment methods that settle later (e.g. bank debit) keep the dates held until Stripe reports the result.
export const extendHold = (db, id, untilIso) =>
  db.prepare(`UPDATE bookings SET expires_at = ? WHERE id = ? AND status = 'pending'`).bind(untilIso, id).run();

export const expire = (db, id) =>
  db.prepare(`UPDATE bookings SET status = 'expired' WHERE id = ? AND status = 'pending'`).bind(id).run();

export async function listBookings(db, from) {
  const { results } = await db.prepare(
    `SELECT id, date, end_date, days, guests, license, name, email, phone, note, lang, total_cents, paid_cents,
            currency, status, source, stripe_payment, created_at, confirmed_at, expires_at, invoice_number, invoice_pdf, invoice_error
     FROM bookings WHERE end_date >= ? AND status IN ('confirmed', 'pending', 'cancelled') ORDER BY date`,
  ).bind(from).all();
  return results;
}

export const cancelBooking = (db, id) =>
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status IN ('confirmed', 'pending')`).bind(id).run();

export async function listBlocks(db, from) {
  const { results } = await db.prepare('SELECT date, note FROM blocks WHERE date >= ? ORDER BY date').bind(from).all();
  return results;
}

export async function addBlocks(db, dates, note, nowIso) {
  for (const d of dates) await db.prepare('INSERT OR REPLACE INTO blocks (date, note, created_at) VALUES (?, ?, ?)').bind(d, note || null, nowIso).run();
}

export async function removeBlocks(db, dates) {
  let n = 0;
  for (const d of dates) n += (await db.prepare('DELETE FROM blocks WHERE date = ?').bind(d).run()).meta.changes;
  return n;
}

/* ---------- Invoices ---------- */
export const setInvoice = (db, id, inv) =>
  db.prepare('UPDATE bookings SET invoice_id = ?, invoice_number = ?, invoice_pdf = ?, invoice_error = ? WHERE id = ?')
    .bind(inv.id || null, inv.number || null, inv.pdf || null, inv.error || null, id).run();

/* ---------- Photos and editable boat details ---------- */
export async function listPhotos(db) {
  const { results } = await db.prepare('SELECT id, ext, type, width, height, alt_hr, alt_en, sort FROM photos ORDER BY sort, created_at').all();
  return results;
}
export const photoById = (db, id) => db.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first();
export async function addPhoto(db, p, nowIso) {
  const r = await db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS next, COUNT(*) AS n FROM photos').first();
  await db.prepare('INSERT INTO photos (id, ext, type, width, height, alt_hr, alt_en, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(p.id, p.ext, p.type, p.width || null, p.height || null, p.alt_hr || null, p.alt_en || null, r.next, nowIso).run();
  return r.n + 1;
}
export const countPhotos = async (db) => (await db.prepare('SELECT COUNT(*) AS n FROM photos').first()).n;
export const updatePhotoAlt = (db, id, altHr, altEn) =>
  db.prepare('UPDATE photos SET alt_hr = ?, alt_en = ? WHERE id = ?').bind(altHr || null, altEn || null, id).run();
export async function reorderPhotos(db, ids) {
  for (let i = 0; i < ids.length; i++) await db.prepare('UPDATE photos SET sort = ? WHERE id = ?').bind(i, ids[i]).run();
}
export const deletePhoto = (db, id) => db.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();

export async function getSetting(db, key) {
  const r = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? JSON.parse(r.value) : null;
}
export const putSetting = (db, key, value, nowIso) =>
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(value), nowIso).run();
