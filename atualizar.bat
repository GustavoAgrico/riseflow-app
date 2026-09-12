@echo off
chcp 65001 >nul
title Atualizar Riseframe
cd /d "%~dp0"

echo.
echo ==========================================
echo    ATUALIZANDO O RISEFRAME
echo ==========================================
echo.

echo [1/4] Baixando a versao mais nova...
git pull origin master
if errorlevel 1 goto erro

cd riseframe
if errorlevel 1 goto erro

echo.
echo [2/4] Instalando dependencias...
call npm install
if errorlevel 1 goto erro

echo.
echo [3/4] Reconstruindo o app...
call npm run build
if errorlevel 1 goto erro

echo.
echo [4/4] Liberando a porta 4000 e iniciando o servidor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo.
echo ==========================================
echo    PRONTO! O servidor esta rodando.
echo    Abra no navegador:  http://localhost:4000
echo    NAO feche esta janela enquanto estiver usando.
echo ==========================================
echo.
call npm run start

echo.
echo (O servidor foi encerrado.)
pause
exit /b 0

:erro
echo.
echo ******************************************
echo   DEU UM ERRO. Tire um print desta tela
echo   inteira e me mande que eu resolvo.
echo ******************************************
echo.
pause
exit /b 1
