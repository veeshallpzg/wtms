$src = "d:\wtmslocal\dist\win-unpacked\resources\app"
$dst = "C:\Program Files\WTMS\resources\app"

$files = @(
    "server.js",
    "electron-main.js",
    "database\init.js",
    "public\dashboard.html",
    "public\chart.umd.min.js"
)

foreach ($f in $files) {
    $s = Join-Path $src $f
    $d = Join-Path $dst $f
    Copy-Item -Force -Path $s -Destination $d
    Write-Host "Copied: $f"
}
Write-Host "Deploy done."
