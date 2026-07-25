@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ==========================================
echo  CIENCIA EM MOVIMENTO - INSTALACAO
ECHO ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale a versao LTS de https://nodejs.org e execute novamente.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto erro
call npm run check
if errorlevel 1 goto erro
echo.
echo Instalacao concluida. Use EXECUTAR_WINDOWS.bat.
pause
exit /b 0
:erro
echo.
echo Ocorreu um erro durante a instalacao.
pause
exit /b 1
