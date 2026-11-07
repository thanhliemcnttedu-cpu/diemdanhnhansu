Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\THANH_LIEM_PRO\.gemini\antigravity-ide\brain\cd14b995-0e24-40fb-a29b-d5825ba867a1\.user_uploaded\media_1790840066379.png"
$img = [System.Drawing.Image]::FromFile($srcPath)
Write-Output ("Loaded image: " + $img.Width + "x" + $img.Height)

# Crop the circular logo at top-left
$cropX = 33
$cropY = 37
$cropW = 156
$cropH = 156

$rect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$cropped = New-Object System.Drawing.Bitmap($cropW, $cropH)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$destRect = New-Object System.Drawing.Rectangle(0, 0, $cropW, $cropH)
$g.DrawImage($img, $destRect, $rect, [System.Drawing.GraphicsUnit]::Pixel)

$dstPath = "public\assets\school_db_logo.png"
$cropped.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$cropped.Dispose()
$img.Dispose()
Write-Output "Successfully saved cropped logo to $dstPath"
