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

6. **Планировщик задач** — ежедневно в 11:10 (МСК = локальное время ноута):
   ```powershell
   $action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
     -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\moisklad-print\print-sheet.ps1"'
   $trigger = New-ScheduledTaskTrigger -Daily -At 11:10
   Register-ScheduledTask -TaskName 'MoiSklad-PrintSheet' -Action $action -Trigger $trigger `
     -Description 'Авто-печать листа сборки' -RunLevel Highest
   ```
   Секрет и настройки можно прописать в саму задачу через `$env:` в `-Argument`,
   либо задать их как системные переменные среды.

## Диагностика
- Лог: `%LOCALAPPDATA%\moisklad-print\print.log`.
- «204 — печать пропущена» — листа нет (воскресенье или ещё не собран).
- Нет PDF — проверь, что Edge на месте и URL/секрет верны (открой URL в браузере).
- Печатает не туда — задай `MOISKLAD_PRINTER` точным именем из `Get-Printer`.

## Печать за конкретный день (вручную)
Добавь `&id=<N>` к URL (id листа) — напечатает его. Без `id` — последний авто-лист.
