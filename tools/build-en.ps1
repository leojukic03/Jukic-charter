# Builds en/index.html from index.html: English <head> for search engines and sharing,
# relative URLs moved one folder up. Body text is switched to English by js/site.js.
# Run after every change to index.html:  powershell -File tools/build-en.ps1
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding $false
$h = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $utf8)

$h = $h.Replace('<html lang="hr">', '<html lang="en" data-base="../">')
$h = [regex]::Replace($h, '<title>.*?</title>', '<title>Bareboat rental in Biograd na Moru · Jukić Charter</title>')
$h = [regex]::Replace($h, '<meta name="description" content=".*?">', '<meta name="description" content="Rent a Jeanneau Merry Fisher 795 without a skipper in Biograd na Moru, from 3 days. The Kornati are an hour from the berth. Online booking with prices, plus a guest guide with coves, sea routes and the wind forecast.">')
$h = [regex]::Replace($h, '<meta property="og:title" content=".*?">', '<meta property="og:title" content="Jukić Charter: your own boat for the Kornati, three days or a whole week">')
$h = [regex]::Replace($h, '<meta property="og:description" content=".*?">', '<meta property="og:description" content="Bareboat rental from 3 days, with a guide to coves, routes and the wind forecast.">')
$h = $h.Replace('<meta property="og:locale" content="hr_HR">', '<meta property="og:locale" content="en_GB">')
$h = $h.Replace('<link rel="canonical" href="https://jukic-charter.pages.dev/">', '<link rel="canonical" href="https://jukic-charter.pages.dev/en/">')
# Bake English text into elements with data-i18n, so crawlers see English without running JS.
$i18n = [IO.File]::ReadAllText((Join-Path $root 'js\site-i18n.js'), $utf8)
$en = @{}
foreach ($m in [regex]::Matches($i18n, "'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'")) { if (-not $en.ContainsKey($m.Groups[1].Value)) { $en[$m.Groups[1].Value] = $m.Groups[2].Value.Replace("\'", "'") } }
$h = [regex]::Replace($h, 'data-i18n="([\w.]+)"([^>]*)>([^<]*)<', {
  param($m)
  $k = $m.Groups[1].Value
  if ($en.ContainsKey($k)) { 'data-i18n="' + $k + '"' + $m.Groups[2].Value + '>' + [Net.WebUtility]::HtmlEncode($en[$k]) + '<' } else { $m.Value }
})
$attrs = [ordered]@{
  'aria-label="Početak"' = 'aria-label="Home"'; 'aria-label="Glavna navigacija"' = 'aria-label="Main navigation"'
  'aria-label="Dan na brodu"' = 'aria-label="A day on the boat"'; 'aria-label="Prethodni mjesec"' = 'aria-label="Previous month"'
  'aria-label="Sljedeći mjesec"' = 'aria-label="Next month"'; 'aria-label="Manje"' = 'aria-label="Fewer"'; 'aria-label="Više"' = 'aria-label="More"'
  'aria-label="Pregled vodiča"' = 'aria-label="Guide preview"'; 'aria-label="Ilustracija broda Merry Fisher 795"' = 'aria-label="Illustration of the Merry Fisher 795"'
  'title="Vodič za goste"' = 'title="Guest guide"'; 'data-src="vodic/?embed=1"' = 'data-src="vodic/?embed=1&amp;lang=en"'
}
foreach ($k in $attrs.Keys) { $h = $h.Replace($k, $attrs[$k]) }
# Relative href/src/data-src → one level up (skip absolute, anchors, mail, phone).
$h = [regex]::Replace($h, '(\s(?:href|src|data-src))="(?!https?:|#|mailto:|tel:|/|\.\./)([^"]+)"', '$1="../$2"')

New-Item -ItemType Directory -Force (Join-Path $root 'en') | Out-Null
[IO.File]::WriteAllText((Join-Path $root 'en\index.html'), $h, $utf8)
'en/index.html written'
