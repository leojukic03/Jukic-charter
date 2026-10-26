// Minimal Stripe REST client for Workers (no SDK): Checkout Sessions and webhook signatures.
const API = 'https://api.stripe.com/v1';

// Stripe expects form encoding with bracketed keys: line_items[0][price_data][currency]=eur
function form(obj, prefix, out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(env, method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: params ? form(params).toString() : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${path}: ${res.status} ${json.error ? json.error.message : ''}`);
  return json;
}

export const createCheckout = (env, params) => call(env, 'POST', '/checkout/sessions', params);
export const expireCheckout = (env, id) => call(env, 'POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`);

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Verifies the Stripe-Signature header (HMAC-SHA256 of "t.payload") and returns the parsed event, or null.
export async function verifyWebhook(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return null;
  let t = null; const sigs = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=');
    if (k === 't') t = Number(v);
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  if (!sigs.some((s) => same(s, expected))) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

// For tests: produce a valid header for a payload.
export async function signForTest(payload, secret, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `t=${t},v1=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)))}`;
}
