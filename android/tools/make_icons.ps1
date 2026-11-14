<#
.SYNOPSIS
    Generate the TGM Stocks launcher icons from the supplied square source PNG.

.DESCRIPTION
    Writes, inside android/app/src/main/res:

      mipmap-mdpi .. mipmap-xxxhdpi / ic_launcher.png, ic_launcher_round.png
      drawable-nodpi/ic_launcher_foreground.png
      values/ic_launcher_background.xml
      mipmap-anydpi-v26/ic_launcher.xml, ic_launcher_round.xml

    The source artwork sits in the lower-left of the square, so the script crops
    to the artwork's bounding box and scales that into the adaptive-icon safe
    zone (66 of 108 dp) instead of shrinking the whole square.

    Only Windows PowerShell with System.Drawing is required.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File android/tools/make_icons.ps1 -Source android/tools/E2.png
#>
param(
    [Parameter(Mandatory = $true)][string]$Source
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resDir = Join-Path (Split-Path -Parent $toolsDir) 'app\src\main\res'
$sourcePath = (Resolve-Path $Source).Path

$src = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
    $w = $src.Width
    $h = $src.Height

    # Background colour: the most common colour along the top edge.
    $counts = @{}
    for ($x = 0; $x -lt $w; $x += 4) {
        $c = $src.GetPixel($x, 1)
        $key = '{0},{1},{2}' -f $c.R, $c.G, $c.B
        if ($counts.ContainsKey($key)) { $counts[$key]++ } else { $counts[$key] = 1 }
    }
    $bgKey = ($counts.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
    $bgParts = $bgKey.Split(',')
    $bgColor = [System.Drawing.Color]::FromArgb(255, [int]$bgParts[0], [int]$bgParts[1], [int]$bgParts[2])

    # Bounding box of everything that differs from the background.
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $h; $y += 2) {
        for ($x = 0; $x -lt $w; $x += 2) {
            $p = $src.GetPixel($x, $y)
            if ([Math]::Abs($p.R - $bgColor.R) + [Math]::Abs($p.G - $bgColor.G) + [Math]::Abs($p.B - $bgColor.B) -gt 24) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { throw "No artwork found in $sourcePath (image is a single colour)." }
    $cropX = [Math]::Max(0, $minX - 8)
    $cropY = [Math]::Max(0, $minY - 8)
    $cropW = [Math]::Min($w - $cropX, ($maxX - $minX) + 16)
    $cropH = [Math]::Min($h - $cropY, ($maxY - $minY) + 16)
    $cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)

    function New-Canvas([int]$size, [System.Drawing.Color]$fill, [bool]$transparent) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        if (-not $transparent) { $g.Clear($fill) }
        else { $g.Clear([System.Drawing.Color]::Transparent) }
        return @($bmp, $g)
    }

    function Draw-Cropped($g, [System.Drawing.Rectangle]$dest, [System.Drawing.Drawing2D.GraphicsPath]$clip) {
        if ($clip) { $g.SetClip($clip) }
        $g.DrawImage($src, $dest, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
        $g.ResetClip()
    }

    function Save-Png($bmp, [string]$path) {
        $dir = Split-Path -Parent $path
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }

    # Legacy launcher icons: square with background, artwork filling the square.
    $densities = [ordered]@{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
    foreach ($entry in $densities.GetEnumerator()) {
        $size = $entry.Value
        $dir = Join-Path $resDir ('mipmap-' + $entry.Key)

        $square = New-Canvas $size $bgColor $false
        Draw-Cropped $square[1] (New-Object System.Drawing.Rectangle(0, 0, $size, $size)) $null
        Save-Png $square[0] (Join-Path $dir 'ic_launcher.png')
        $square[1].Dispose(); $square[0].Dispose()

        $round = New-Canvas $size $bgColor $false
        $circle = New-Object System.Drawing.Drawing2D.GraphicsPath
        $circle.AddEllipse(0, 0, $size - 1, $size - 1)
        Draw-Cropped $round[1] (New-Object System.Drawing.Rectangle(0, 0, $size, $size)) $circle
        Save-Png $round[0] (Join-Path $dir 'ic_launcher_round.png')
        $circle.Dispose(); $round[1].Dispose(); $round[0].Dispose()
    }

    # Adaptive foreground: 108 dp canvas at xxxhdpi (432 px); artwork inside the
    # 66 dp safe zone (264 px) so no launcher mask clips the character.
    $canvas = 432
    $safe = [int]($canvas * 66 / 108)
    $fg = New-Canvas $canvas $bgColor $true
    $offset = [int](($canvas - $safe) / 2)
    Draw-Cropped $fg[1] (New-Object System.Drawing.Rectangle($offset, $offset, $safe, $safe)) $null
    Save-Png $fg[0] (Join-Path $resDir 'drawable-nodpi\ic_launcher_foreground.png')
    $fg[1].Dispose(); $fg[0].Dispose()

    # Adaptive background colour.
    $hex = '{0:X2}{1:X2}{2:X2}' -f $bgColor.R, $bgColor.G, $bgColor.B
    $valuesDir = Join-Path $resDir 'values'
    if (-not (Test-Path $valuesDir)) { New-Item -ItemType Directory -Force -Path $valuesDir | Out-Null }
    $colorXml = @"
<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by android/tools/make_icons.ps1 from the icon source. -->
<resources>
    <color name="ic_launcher_background">#$hex</color>
</resources>
"@
    Set-Content -Path (Join-Path $valuesDir 'ic_launcher_background.xml') -Value $colorXml -Encoding UTF8

    # Adaptive icon definitions.
    $anydpi = Join-Path $resDir 'mipmap-anydpi-v26'
    if (-not (Test-Path $anydpi)) { New-Item -ItemType Directory -Force -Path $anydpi | Out-Null }
    foreach ($name in @('ic_launcher', 'ic_launcher_round')) {
        $adaptiveXml = @"
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
"@
        Set-Content -Path (Join-Path $anydpi ($name + '.xml')) -Value $adaptiveXml -Encoding UTF8
    }

    Write-Output ("Background #{0}; artwork crop {1}x{2} at ({3},{4})" -f $hex, $cropW, $cropH, $cropX, $cropY)
    Write-Output "Wrote launcher icons to $resDir"
}
finally {
    $src.Dispose()
}
