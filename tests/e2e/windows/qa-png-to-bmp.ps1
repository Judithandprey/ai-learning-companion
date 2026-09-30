# Converts every PNG in -Folder to a 32-bit BMP next to it (for analysis without an image library).
param([Parameter(Mandatory = $true)][string]$Folder)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Get-ChildItem -Path $Folder -Filter '*.png' -File | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
    $g.Dispose()
    $bmp.Save(($_.FullName -replace '\.png$', '.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp.Dispose()
  } finally { $img.Dispose() }
}
