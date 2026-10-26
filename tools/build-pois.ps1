# Converts Overpass exports into data/pois-all.json for the guide's "Sve" (all places) layer.
# Usage: powershell -File tools/build-pois.ps1 -OsmDir <folder with poi_adriatic.json and poi_food_fine.json>
param([Parameter(Mandatory)][string]$OsmDir)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$inv = [Globalization.CultureInfo]::InvariantCulture

function Read-Elements($file) { (Get-Content -Raw -Encoding UTF8 (Join-Path $OsmDir $file) | ConvertFrom-Json).elements }

$items = New-Object System.Collections.Generic.List[object]
foreach ($x in (Read-Elements 'poi_adriatic.json') + (Read-Elements 'poi_food_fine.json')) {
  $t = $x.tags
  if ($null -eq $t) { continue }
  $lat = if ($x.lat) { $x.lat } else { $x.center.lat }
  $lon = if ($x.lon) { $x.lon } else { $x.center.lon }
  if ($null -eq $lat) { continue }
  $type = $null
  if ($t.amenity -eq 'restaurant') { $type = 'restaurant' }
  elseif ($t.amenity -eq 'fuel' -and ($t.boat -eq 'yes' -or $t.'seamark:type' -or $t.waterway -eq 'fuel')) { $type = 'fuel' }
  elseif ($t.waterway -eq 'fuel' -or $t.'seamark:type' -eq 'small_craft_facility') { $type = 'fuel' }
  elseif ($t.leisure -eq 'marina') { $type = 'marina' }
  elseif ($t.'seamark:type' -eq 'anchorage') { $type = 'anchorage' }
  elseif ($t.'seamark:type' -eq 'mooring' -and $t.name) { $type = 'anchorage' }
  elseif ($t.natural -eq 'bay' -and $t.name) { $type = 'bay' }
  elseif ($t.natural -eq 'beach' -and $t.name) { $type = 'beach' }
  if (-not $type) { continue }
  $name = if ($t.'name:hr') { $t.'name:hr' } elseif ($t.name) { $t.name } else { '' }
  $items.Add([pscustomobject]@{ type = $type; lon = [math]::Round([double]$lon, 5); lat = [math]::Round([double]$lat, 5); name = $name.Trim(); id = "$($x.type[0])$($x.id)" })
}

# Drop duplicates: same type and name within ~300 m (e.g. a marina mapped as node and area).
$seen = @{}
$out = New-Object System.Collections.Generic.List[string]
foreach ($i in $items | Sort-Object type, name, id) {
  $key = "$($i.type)|$($i.name)|$([math]::Round($i.lat * 300))|$([math]::Round($i.lon * 220))"
  if ($i.name -and $seen.ContainsKey($key)) { continue }
  $seen[$key] = 1
  $n = $i.name.Replace('\', '\\').Replace('"', '\"')
  $out.Add([string]::Format($inv, '["{0}",{1},{2},"{3}","{4}"]', $i.type, $i.lon, $i.lat, $n, $i.id))
}
$json = '{"attribution":"© OpenStreetMap contributors, ODbL 1.0","fields":["type","lon","lat","name","osm"],"items":[' + "`n" + ($out -join ",`n") + "`n]}"
[IO.File]::WriteAllText((Join-Path $root 'data\pois-all.json'), $json, (New-Object Text.UTF8Encoding $false))
$items | Group-Object type | ForEach-Object { "$($_.Name): $($_.Count)" }
"written: $($out.Count)"
