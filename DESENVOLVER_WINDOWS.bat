@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo ERRO: npm nao foi encontrado. Instale Node.js LTS.
  pause
  exit /b 1
)
call npm install --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto erro
call npm run setup
if errorlevel 1 goto erro
call npm run build
if errorlevel 1 goto erro
node scripts\static-server.mjs
exit /b 0
:erro
echo.
echo Nao foi possivel preparar o ambiente de desenvolvimento.
echo A versao executavel incluída continua a poder ser usada sem npm install.
pause
exit /b 1
