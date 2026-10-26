# Minimal static file server for local preview on Windows: powershell -File tools/serve.ps1 [-Port 8123] [-MockApi]
# -MockApi answers /api/* with the canned responses in tools/mock-api.json, so the booking UI and admin
# can be clicked through without Cloudflare/Stripe. On a Mac use tools/serve.py.
param([int]$Port = 8123, [switch]$MockApi)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.webmanifest'='application/manifest+json';
  '.xml'='application/xml'; '.txt'='text/plain'; '.ico'='image/x-icon'; '.webp'='image/webp'; '.woff2'='font/woff2' }
$mock = @{}
if ($MockApi) {
  $j = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'mock-api.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($prop in $j.PSObject.Properties) { $mock[$prop.Name] = ($prop.Value | ConvertTo-Json -Depth 10 -Compress) }
}
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($MockApi -and $path -match '(^|/)api/(.+)$' -and $mock.ContainsKey($Matches[2])) {
      $bytes = [Text.Encoding]::UTF8.GetBytes($mock[$Matches[2]])
      $ctx.Response.ContentType = 'application/json'
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close(); continue
    }
    $file = Join-Path $root $path
    if ((Test-Path -LiteralPath $file -PathType Container)) { $file = Join-Path $file 'index.html' }
    if ((Test-Path -LiteralPath $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file).StartsWith($root))) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $ctx.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
