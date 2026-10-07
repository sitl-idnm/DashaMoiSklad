<#
  Агент авто-печати листа сборки на локации.
  Качает печатный HTML с сервера, рендерит его Edge-ом в PDF и тихо печатает.

  Настройка — через переменные окружения (или правкой значений ниже):
    MOISKLAD_URL     базовый URL сервера (напр. https://aqua.kimprod.ru)
    MOISKLAD_SECRET  секрет (= CRON_SECRET на сервере; узнать:
                     docker exec aqua_web printenv CRON_SECRET)
    MOISKLAD_PRINTER имя принтера (пусто = принтер по умолчанию)
    SUMATRA_PATH     путь к SumatraPDF.exe (если не в стандартных местах)

  Запуск вручную для теста:
    powershell -ExecutionPolicy Bypass -File print-sheet.ps1
#>

$ErrorActionPreference = 'Stop'

$AppUrl  = if ($env:MOISKLAD_URL)     { $env:MOISKLAD_URL }     else { 'https://aqua.kimprod.ru' }
$Secret  = if ($env:MOISKLAD_SECRET)  { $env:MOISKLAD_SECRET }  else { '' }
$Printer = if ($env:MOISKLAD_PRINTER) { $env:MOISKLAD_PRINTER } else { '' }

$logDir = Join-Path $env:LOCALAPPDATA 'moisklad-print'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'print.log'
function Log($m) { "$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))  $m" | Tee-Object -FilePath $log -Append }

if (-not $Secret) { Log 'ОШИБКА: MOISKLAD_SECRET не задан'; exit 1 }

# --- найти Edge ---
$edge = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Log 'ОШИБКА: не найден msedge.exe'; exit 1 }

# --- найти SumatraPDF ---
$sumatra = if ($env:SUMATRA_PATH -and (Test-Path $env:SUMATRA_PATH)) { $env:SUMATRA_PATH } else {
  @(
    "$env:ProgramFiles\SumatraPDF\SumatraPDF.exe",
    "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe",
    "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe",
    (Join-Path $PSScriptRoot 'SumatraPDF.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $sumatra) { Log 'ОШИБКА: не найден SumatraPDF.exe (установите или положите рядом со скриптом)'; exit 1 }

$url = "$AppUrl/api/print/sheet?secret=$Secret"
$pdf = Join-Path $env:TEMP ("moisklad-sheet-{0}.pdf" -f ([DateTime]::Now.ToString('yyyyMMdd')))

# --- предпроверка: есть ли лист (204 = нет, напр. воскресенье) ---
try {
  $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60
  if ($resp.StatusCode -eq 204 -or -not $resp.Content) { Log 'Листа нет (204) — печать пропущена'; exit 0 }
} catch {
  Log "ОШИБКА запроса листа: $($_.Exception.Message)"; exit 1
}

# --- HTML -> PDF через Edge headless ---
if (Test-Path $pdf) { Remove-Item $pdf -Force }
$edgeArgs = @(
  '--headless=new','--disable-gpu','--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw','--virtual-time-budget=20000',
  "--print-to-pdf=$pdf", $url
)
Log "Рендер PDF через Edge…"
& $edge @edgeArgs | Out-Null
Start-Sleep -Seconds 2
if (-not (Test-Path $pdf)) { Log 'ОШИБКА: Edge не создал PDF'; exit 1 }

# --- тихая печать PDF ---
if ($Printer) {
  Log "Печать на '$Printer'…"
  & $sumatra -print-to "$Printer" -silent $pdf
} else {
  Log 'Печать на принтер по умолчанию…'
  & $sumatra -print-to-default -silent $pdf
}
Log "Готово: отправлено на печать ($pdf)"
