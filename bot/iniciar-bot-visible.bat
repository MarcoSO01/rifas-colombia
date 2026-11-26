@echo off
title Bot WhatsApp (visible) - Inistare Sorteos
cd /d "%~dp0"
chcp 65001 >nul
set SHOW_BROWSER=1
if not exist node_modules (
  echo Instalando el bot por primera vez. Espera unos minutos...
  call npm install
)
node index.js
echo.
echo El bot se cerro.
pause
