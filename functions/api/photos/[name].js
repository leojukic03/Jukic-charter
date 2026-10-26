// GET /api/photos/<id>.<ext> — serves an uploaded boat photo from R2. File names are random and never reused,
// so browsers and the CDN may keep them for a year.
export async function onRequestGet(context) {
  const { env, params } = context;
  const name = String(params.name || '');
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name) || !env.PHOTOS) return new Response('Not found', { status: 404 });
  const obj = await env.PHOTOS.get(`boat/${name}`);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata && obj.httpMetadata.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
