# Renders PNG app icons and the social sharing image (img/og.png) from the project's own assets.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$deep = [Drawing.Color]::FromArgb(6, 50, 79); $signal = [Drawing.Color]::FromArgb(242, 183, 5); $white = [Drawing.Color]::FromArgb(251, 252, 249)

function Icon([int]$size, [string]$out) {
  $b = New-Object Drawing.Bitmap $size, $size
  $g = [Drawing.Graphics]::FromImage($b); $g.SmoothingMode = 'AntiAlias'
  $g.Clear($deep)
  $s = $size / 64.0
  $tri = [Drawing.PointF[]]@((New-Object Drawing.PointF (18*$s), (34*$s)), (New-Object Drawing.PointF (32*$s), (15*$s)), (New-Object Drawing.PointF (46*$s), (34*$s)))
  $g.FillPolygon((New-Object Drawing.SolidBrush $signal), $tri)
  $pen = New-Object Drawing.Pen $white, (4*$s); $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $pts = for ($x = 10; $x -le 54; $x += 1) { New-Object Drawing.PointF ($x*$s), ((42 + 2*[math]::Cos(($x-10)/11*[math]::PI))*$s) }
  $g.DrawCurve($pen, [Drawing.PointF[]]$pts)
  $b.Save($out, [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()
}
Icon 192 (Join-Path $root 'img\icon-192.png')
Icon 512 (Join-Path $root 'img\icon-512.png')

# Social image: the real archipelago (hero-land.png) on Adriatic blue, with the day route from the homepage.
$W = 1200; $H = 630
$og = New-Object Drawing.Bitmap $W, $H
$g = [Drawing.Graphics]::FromImage($og); $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
$g.Clear($deep)
$land = [Drawing.Image]::FromFile((Join-Path $root 'img\hero-land.png'))
# Full image width, cropped vertically around the route, at the 1.91:1 sharing ratio.
$src = New-Object Drawing.Rectangle 0, 236, 1685, 885
$g.DrawImage($land, (New-Object Drawing.Rectangle 0, 0, $W, $H), $src, 'Pixel')
$route = @(@(15.4425,43.9395),@(15.4021,43.9687),@(15.3837,43.9787),@(15.2983,44.0078),@(15.2654,44.0226),@(15.2499,44.0132),@(15.232,43.9137),@(15.2265,43.8759),@(15.1861,43.8896),@(15.1589,43.8924),@(15.1716,43.8979),@(15.2021,43.8785),@(15.203,43.8418),@(15.23,43.8224),@(15.2475,43.8193),@(15.218,43.8364),@(15.2205,43.8756),@(15.2664,43.895),@(15.3268,43.8936),@(15.4111,43.8954),@(15.452,43.8853),@(15.458,43.8975),@(15.437,43.9381),@(15.4425,43.9395))
$sx = $W / $src.Width; $sy = $H / $src.Height
$pts = foreach ($p in $route) { $x = ($p[0] - 15.10) / 2.49248e-4; $y = (44.02 - $p[1]) / 1.79662e-4; New-Object Drawing.PointF (($x - $src.X) * $sx), (($y - $src.Y) * $sy) }
$pen = New-Object Drawing.Pen $signal, 6; $pen.LineJoin = 'Round'; $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
$g.DrawLines($pen, [Drawing.PointF[]]$pts)
$og.Save((Join-Path $root 'img\og.png'), [Drawing.Imaging.ImageFormat]::Png)
$land.Dispose(); $g.Dispose(); $og.Dispose()
'ok'
