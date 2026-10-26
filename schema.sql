-- Cloudflare D1 (SQLite). Apply once: wrangler d1 execute charter --remote --file=schema.sql
-- (or paste into the D1 console in the Cloudflare dashboard).
-- Multi-day bareboat rentals: a booking covers every day from `date` to `end_date` inclusive.

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,               -- random UUID
  date              TEXT NOT NULL,                  -- first day (pick-up), YYYY-MM-DD local (Europe/Zagreb)
  end_date          TEXT NOT NULL,                  -- last day (return), inclusive
  days              INTEGER NOT NULL,
  guests            INTEGER NOT NULL,
  license           INTEGER NOT NULL DEFAULT 1,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  note              TEXT,
  lang              TEXT NOT NULL DEFAULT 'hr',
  total_cents       INTEGER NOT NULL,               -- full price of the rental incl. cleaning
  paid_cents        INTEGER NOT NULL,               -- charged online (full price or advance)
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  source            TEXT NOT NULL DEFAULT 'web',
  stripe_session    TEXT,
  stripe_payment    TEXT,
  client_hash       TEXT,                           -- hashed IP, only to limit open holds per visitor
  created_at        TEXT NOT NULL,
  expires_at        TEXT,                           -- pending holds only
  confirmed_at      TEXT,
  invoice_id        TEXT,                           -- Solo invoice for the online payment (fiscalized)
  invoice_number    TEXT,
  invoice_pdf       TEXT,
  invoice_error     TEXT
);
CREATE INDEX IF NOT EXISTS bookings_range ON bookings (date, end_date, status);
CREATE INDEX IF NOT EXISTS bookings_session ON bookings (stripe_session);

-- Boat photos uploaded from /admin/ (files live in the R2 bucket bound as PHOTOS).
CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  ext        TEXT NOT NULL,
  type       TEXT NOT NULL,
  width      INTEGER,
  height     INTEGER,
  alt_hr     TEXT,
  alt_en     TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Editable content, e.g. key 'boat' = JSON with the boat's details shown on the website.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Days the owner closes by hand (booked by phone or elsewhere, service, own use).
CREATE TABLE IF NOT EXISTS blocks (
  date       TEXT PRIMARY KEY,
  note       TEXT,
  created_at TEXT NOT NULL
);
