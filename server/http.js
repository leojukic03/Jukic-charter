// Small helpers shared by the Pages Functions.

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

export const nowIso = () => new Date().toISOString();

// Booking rules come from the same static file the website reads.
let cached = null;
export async function loadRules(context) {
  if (cached) return cached;
  const url = new URL('/data/booking.json', context.request.url);
  const res = await (context.env.ASSETS ? context.env.ASSETS.fetch(url) : fetch(url));
  if (!res.ok) throw new Error('booking.json not found');
  cached = await res.json();
  return cached;
}

export function siteUrl(context) {
  return (context.env.SITE_URL || new URL(context.request.url).origin).replace(/\/$/, '');
}

export async function hashClient(request, salt = '') {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Admin endpoints: "Authorization: Bearer <ADMIN_TOKEN>", compared in constant time.
export function isAdmin(context) {
  const want = context.env.ADMIN_TOKEN || '';
  const got = (context.request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (want.length < 16 || got.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}
