@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale a versao LTS de https://nodejs.org e execute novamente.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo ERRO: pasta dist em falta.
  pause
  exit /b 1
)
start "Servidor Ciência em Movimento" /min node scripts\static-server.mjs
ping 127.0.0.1 -n 3 >nul
start "" "http://localhost:4173/?demo=1"
