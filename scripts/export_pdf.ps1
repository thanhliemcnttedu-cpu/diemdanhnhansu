$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$html = "C:\Users\THANH_LIEM_PRO\Downloads\Web LOP HOC HANH PHUC\docs_export\spec.html"
$pdf = "C:\Users\THANH_LIEM_PRO\Downloads\Web LOP HOC HANH PHUC\docs_export\LOP_HOC_HANH_PHUC_TAI_LIEU_MO_TA_CHI_TIET.pdf"
$userData = "C:\Users\THANH_LIEM_PRO\AppData\Local\Temp\edge_pdf_profile"

if (!(Test-Path $userData)) {
    New-Item -ItemType Directory -Force -Path $userData | Out-Null
}

$proc = Start-Process -FilePath $edge -ArgumentList "--headless", "--disable-gpu", "--no-first-run", "--user-data-dir=`"$userData`"", "--print-to-pdf=`"$pdf`"", "`"$html`"" -PassThru

$proc.WaitForExit(15000)

Start-Sleep -Seconds 1

if (Test-Path $pdf) {
    $info = Get-Item $pdf
    Write-Host "SUCCESS! File created: $($info.FullName), Size: $($info.Length) bytes"
} else {
    Write-Host "Not created via standard edge. Let's inspect."
}
