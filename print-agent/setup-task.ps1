<#
  Разовая настройка на ноуте локации. Запусти ОТ ИМЕНИ АДМИНИСТРАТОРА:
    powershell -ExecutionPolicy Bypass -File setup-task.ps1

  Делает:
   - не давать засыпать от сети (экран гаснуть может);
   - задачу в Планировщике «MoiSklad-PrintSheet» на 11:10 ежедневно
     (будит из сна, догоняет пропуск, не стопорится на батарее).
  Печать/сохранение настраиваются в config.local.ps1.
#>
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'print-sheet.ps1'
if (-not (Test-Path $script)) { Write-Error "Нет $script"; exit 1 }

# Не спать от сети (монитор гасить разрешаем — это не сон).
powercfg /change standby-timeout-ac 0   | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null

$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At 11:10
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'MoiSklad-PrintSheet' -Action $action -Trigger $trigger `
  -Settings $settings -RunLevel Highest -Description 'Лист сборки: сохранение и печать' -Force | Out-Null

Write-Host 'Готово: задача MoiSklad-PrintSheet создана (ежедневно 11:10), сон от сети отключён.'
Write-Host 'Проверить разово:  powershell -ExecutionPolicy Bypass -File "' -NoNewline; Write-Host "$script`""
