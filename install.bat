@echo off
setlocal
chcp 65001 >nul

rem Установка плагина в глобальный каталог OpenCode:
rem   %USERPROFILE%\.config\opencode\plugins\mcp-classify\
rem Это каталог глобальных плагинов OpenCode V2 (и серверных, и TUI).
rem Если у тебя задан XDG_CONFIG_HOME, поправь CONFIG_DIR ниже.

set "SRC=%~dp0plugin"
set "CONFIG_DIR=%USERPROFILE%\.config\opencode"
set "DST=%CONFIG_DIR%\plugins\mcp-classify"

if not exist "%SRC%\tui.tsx" (
  echo [ERROR] Не найден "%SRC%\tui.tsx". Запусти install.bat из корня репозитория.
  pause
  exit /b 1
)

if not exist "%DST%" mkdir "%DST%"

xcopy "%SRC%\index.js" "%DST%\" /Y >nul
xcopy "%SRC%\tui.tsx" "%DST%\" /Y >nul
xcopy "%SRC%\classes.js" "%DST%\" /Y >nul
xcopy "%SRC%\package.json" "%DST%\" /Y >nul

echo [OK] Плагин установлен в: %DST%
echo.
echo ВАЖНО: чтобы не было дублирования, отключи встроенную плоскую секцию MCP.
echo Добавь в "%CONFIG_DIR%\cli.json" (CLI-конфиг, НЕ opencode.json):
echo.
echo   "plugins": ["-opencode.sidebar.mcp"]
echo.
echo После установки перезапусти сервис: opencode service restart
echo и заново открой OpenCode (TUI подхватывает плагин при запуске).
echo.

pause
