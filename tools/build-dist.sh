#!/usr/bin/env bash
# Cloudflare Pages build command: copies only the public website into dist/.
# Server code (functions/, server/), dev tools, schema and docs stay out of the published site;
# Pages still compiles functions/ from the repository root.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist
for f in index.html en vodic admin uvjeti css js fonts img data shared sw.js manifest.webmanifest robots.txt sitemap.xml _headers; do
  cp -R "$f" dist/
done
echo "dist/ ready: $(find dist -type f | wc -l) files"
