// Boat details the owner edits in /admin/. Only known fields are kept, each trimmed to a sane length.
const TEXT = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const NUM = (v, min, max) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null; };
const LIST = (v, maxItems, maxLen) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
  .map((s) => TEXT(s, maxLen)).filter(Boolean).slice(0, maxItems);

export function cleanBoat(input = {}) {
  return {
    model: TEXT(input.model, 80),
    year: NUM(input.year, 1950, 2100),
    lengthM: NUM(input.lengthM, 1, 40),
    beamM: NUM(input.beamM, 0.5, 15),
    engine: TEXT(input.engine, 80),
    maxGuests: NUM(input.maxGuests, 1, 20),
    berths: NUM(input.berths, 0, 20),
    fuelTankL: NUM(input.fuelTankL, 0, 5000),
    waterTankL: NUM(input.waterTankL, 0, 5000),
    description_hr: TEXT(input.description_hr, 1200),
    description_en: TEXT(input.description_en, 1200),
    features_hr: LIST(input.features_hr, 30, 80),
    features_en: LIST(input.features_en, 30, 80),
  };
}

// Recognises the image by its first bytes, not by what the browser claims.
export function sniffImage(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' };
  return null;
}
