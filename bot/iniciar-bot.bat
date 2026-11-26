@echo off
title Bot WhatsApp - Inistare Sorteos
cd /d "%~dp0"
chcp 65001 >nul
if not exist node_modules (
  echo Instalando el bot por primera vez. Espera unos minutos...
  call npm install
)
:inicio
node index.js
echo.
echo El bot se cerro. Se vuelve a abrir en 10 segundos. Cierra esta ventana para detenerlo.
timeout /t 10 >nul
goto inicio
