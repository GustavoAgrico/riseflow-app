@echo off
REM Riseframe Desktop - Build Script (Windows)

echo.
echo ========================================
echo   Riseframe Desktop Build
echo ========================================
echo.

REM Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js nao encontrado
    echo Instale de https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo OK: Node.js %NODE_VERSION%

REM FFmpeg vem embutido (ffmpeg-static): nao precisa instalar.

REM Instalar dependencias
echo.
echo [1/2] Instalando dependencias...
call npm install
if errorlevel 1 goto erro

REM Build web + desktop (build:desktop ja builda o site antes)
echo.
echo [2/2] Buildando o site e o aplicativo desktop...
call npm run build:desktop
if errorlevel 1 goto erro

echo.
echo ========================================
echo   BUILD COMPLETO!
echo ========================================
echo.
echo Arquivos em: dist/builds/
echo.
echo Instalador: "Riseframe Setup X.Y.Z.exe"  ^|  Sem instalar: "Riseframe X.Y.Z.exe"
dir /b dist\builds\*.exe 2>nul

pause
exit /b 0

:erro
echo.
echo DEU UM ERRO no build. Tire um print desta tela e mande para o suporte.
pause
exit /b 1
