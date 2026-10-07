# Авто-печать листа сборки на локации

Ноут на локации (есть доступ к серверу и к принтеру) каждый день автоматически
печатает лист сборки. Сервер готовит лист в 11:05, агент печатает ~11:10.

## Как работает
`print-sheet.ps1` → качает печатную HTML-версию листа с сервера
(`/api/print/sheet`, под A4-альбомную) → **Microsoft Edge** (встроен в Windows)
рендерит её в PDF → **SumatraPDF** тихо печатает на принтер. В воскресенье лист не
собирается — сервер отдаёт пустой ответ (204), агент просто ничего не печатает.

## Установка на ноуте (один раз)

1. **SumatraPDF** — лёгкий просмотрщик с тихой печатью из CLI.
   Скачать портативную версию: https://www.sumatrapdfreader.org/download-free-pdf-viewer
   Поставить в `C:\Program Files\SumatraPDF\` (или положить `SumatraPDF.exe` рядом со
   скриптом, или задать путь в `SUMATRA_PATH`).
   Edge уже есть в Windows 10/11 — ставить не нужно.

2. Скопировать папку `print-agent` на ноут, напр. в `C:\moisklad-print\`.

3. Узнать секрет на сервере (значение `CRON_SECRET`) — в чат не выводить:
   ```
   docker exec aqua_web printenv CRON_SECRET
   ```

4. Настроить переменные (в задаче планировщика или в System → Переменные среды):
   - `MOISKLAD_URL`     = `https://aqua.kimprod.ru`
   - `MOISKLAD_SECRET`  = `<значение CRON_SECRET с сервера>`
   - `MOISKLAD_PRINTER` = точное имя принтера (необязательно; пусто = принтер по умолчанию).
     Имена принтеров: `Get-Printer | Select Name`.

5. **Проверить вручную**:
   ```
   powershell -ExecutionPolicy Bypass -File C:\moisklad-print\print-sheet.ps1
   ```
   Должен выехать лист. Лог: `%LOCALAPPDATA%\moisklad-print\print.log`.

6. **Планировщик задач** — ежедневно в 11:10 (МСК = локальное время ноута), с
   «живучими» настройками (будит из сна, догоняет пропуск, не стопорится на батарее):
   ```powershell
   $action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
     -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\moisklad-print\print-sheet.ps1"'
   $trigger  = New-ScheduledTaskTrigger -Daily -At 11:10
   $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
     -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
     -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
   Register-ScheduledTask -TaskName 'MoiSklad-PrintSheet' -Action $action -Trigger $trigger `
     -Settings $settings -RunLevel Highest -Description 'Авто-печать листа сборки'
   ```
   Задача регистрируется под текущим пользователем и идёт «только когда пользователь
   вошёл» — это нужно, чтобы видеть принтер. Секрет/настройки — через системные
   переменные среды или `$env:` в `-Argument`.

## Сон, пароль, выключение — чтобы печать не срывалась
- **Заблокированный экран (пароль после сна) печати НЕ мешает**: задача «только когда
  вошёл» работает и в залокированной сессии. Пароль нужен только человеку, не задаче.
- **Проще всего — не давать спать от сети** (экран гаснуть может, это не сон):
  ```powershell
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  powercfg /change monitor-timeout-ac 10
  ```
  И «Электропитание → при закрытии крышки → Не выполнять никаких действий».
- Если ноут всё же засыпает — `-WakeToRun` разбудит его к 11:10 (плюс в плане
  электропитания включить «Разрешить таймеры пробуждения»).
- **Не делать «Выход из системы» (Sign out) и выключение** — это закрывает сессию, и
  задача не пойдёт до следующего входа (её догонит `-StartWhenAvailable` при включении).
  Блокировка (Win+L) — норм.
- По желанию (для удобства людей, на печать не влияет): убрать запрос пароля при
  пробуждении — Параметры → Учётные записи → Варианты входа → «Требовать вход… →
  Никогда», и/или настроить автологин.

## Диагностика
- Лог: `%LOCALAPPDATA%\moisklad-print\print.log`.
- «204 — печать пропущена» — листа нет (воскресенье или ещё не собран).
- Нет PDF — проверь, что Edge на месте и URL/секрет верны (открой URL в браузере).
- Печатает не туда — задай `MOISKLAD_PRINTER` точным именем из `Get-Printer`.

## Печать за конкретный день (вручную)
Добавь `&id=<N>` к URL (id листа) — напечатает его. Без `id` — последний авто-лист.
