<#
  Агент листа сборки на локации: каждый день забирает готовый лист с сервера,
  СОХРАНЯЕТ его в локальную папку (PDF + XLSX) и (по желанию) печатает.

  Настройка — переменные окружения (или правка значений ниже):
    MOISKLAD_URL      базовый URL сервера (напр. https://aqua.kimprod.ru)
    MOISKLAD_SECRET   секрет (= CRON_SECRET на сервере:
                      docker exec aqua_web printenv CRON_SECRET)
    MOISKLAD_SAVE_DIR куда класть файлы (по умолчанию: Документы\Листы сборки).
                      Можно указать и сетевой диск, напр. Z:\Листы.
    MOISKLAD_PRINT    1 = печатать (по умолчанию), 0 = только сохранять
    MOISKLAD_PRINTER  имя принтера (пусто = принтер по умолчанию)
    SUMATRA_PATH      путь к SumatraPDF.exe (если не в стандартных местах)

  Тест вручную:
    powershell -ExecutionPolicy Bypass -File print-sheet.ps1
#>

$ErrorActionPreference = 'Stop'

# Локальная конфигурация (URL/секрет/папка) — лежит рядом со скриптом и в git НЕ коммитится.
$cfg = Join-Path $PSScriptRoot 'config.local.ps1'
if (Test-Path $cfg) { . $cfg }

$AppUrl  = if ($env:MOISKLAD_URL)     { $env:MOISKLAD_URL }    else { 'https://aqua.kimprod.ru' }
$Secret  = if ($env:MOISKLAD_SECRET)  { $env:MOISKLAD_SECRET } else { '' }
$SaveDir = if ($env:MOISKLAD_SAVE_DIR){ $env:MOISKLAD_SAVE_DIR } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Листы сборки' }
$DoPrint = $env:MOISKLAD_PRINT -ne '0'
$Printer = if ($env:MOISKLAD_PRINTER) { $env:MOISKLAD_PRINTER } else { '' }

$logDir = Join-Path $env:LOCALAPPDATA 'moisklad-print'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'print.log'
function Log($m) { "$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))  $m" | Tee-Object -FilePath $log -Append }

if (-not $Secret) { Log 'ОШИБКА: MOISKLAD_SECRET не задан'; exit 1 }

# --- Edge (встроен в Windows) ---
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { Log 'ОШИБКА: не найден msedge.exe'; exit 1 }

$base  = "$AppUrl/api/print/sheet?secret=$Secret"
$date  = [DateTime]::Now.ToString('yyyy-MM-dd')
$tmpPdf = Join-Path $env:TEMP "moisklad-sheet-$date.pdf"

# --- предпроверка: есть ли лист (204 = нет, напр. воскресенье) ---
try {
  $resp = Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 60
  if ($resp.StatusCode -eq 204 -or -not $resp.Content) { Log 'Листа нет (204) — пропуск'; exit 0 }
} catch { Log "ОШИБКА запроса листа: $($_.Exception.Message)"; exit 1 }

# --- HTML -> PDF через Edge headless ---
if (Test-Path $tmpPdf) { Remove-Item $tmpPdf -Force }
& $edge '--headless=new' '--disable-gpu' '--no-pdf-header-footer' `
  '--run-all-compositor-stages-before-draw' '--virtual-time-budget=20000' `
  "--print-to-pdf=$tmpPdf" $base | Out-Null
Start-Sleep -Seconds 2
if (-not (Test-Path $tmpPdf)) { Log 'ОШИБКА: Edge не создал PDF'; exit 1 }

# --- сохранить в локальную папку: PDF + исходный XLSX ---
try {
  New-Item -ItemType Directory -Force -Path $SaveDir | Out-Null
  $pdfOut  = Join-Path $SaveDir "Лист сборки $date.pdf"
  $xlsxOut = Join-Path $SaveDir "Лист сборки $date.xlsx"
  Copy-Item $tmpPdf $pdfOut -Force
  Invoke-WebRequest -Uri "$base&format=xlsx" -OutFile $xlsxOut -UseBasicParsing -TimeoutSec 120
  Log "Сохранено: $pdfOut  и  $xlsxOut"
} catch { Log "ОШИБКА сохранения в папку: $($_.Exception.Message)" }

# --- печать (по желанию) ---
if ($DoPrint) {
  $sumatra = if ($env:SUMATRA_PATH -and (Test-Path $env:SUMATRA_PATH)) { $env:SUMATRA_PATH } else {
    @("$env:ProgramFiles\SumatraPDF\SumatraPDF.exe",
      "${env:ProgramFiles(x86)}\SumatraPDF\SumatraPDF.exe",
      "$env:LOCALAPPDATA\SumatraPDF\SumatraPDF.exe",
      (Join-Path $PSScriptRoot 'SumatraPDF.exe')) | Where-Object { Test-Path $_ } | Select-Object -First 1
  }
  if (-not $sumatra) { Log 'Печать пропущена: не найден SumatraPDF.exe'; exit 0 }
  try {
    if ($Printer) { & $sumatra -print-to "$Printer" -silent $tmpPdf; Log "Печать на '$Printer'" }
    else { & $sumatra -print-to-default -silent $tmpPdf; Log 'Печать на принтер по умолчанию' }
  } catch { Log "ОШИБКА печати: $($_.Exception.Message)" }
}

# --- чистка: храним только последнюю неделю (старше 7 дней — удаляем) ---
try {
  $cutoff = (Get-Date).AddDays(-7)
  Get-ChildItem -Path $SaveDir -File -Filter 'Лист сборки *' -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.pdf', '.xlsx' -and $_.LastWriteTime -lt $cutoff } |
    ForEach-Object { Remove-Item $_.FullName -Force; Log "Удалён старый файл: $($_.Name)" }
} catch { Log "ОШИБКА чистки старых файлов: $($_.Exception.Message)" }

Log 'Готово'
