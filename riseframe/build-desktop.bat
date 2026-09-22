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

REM Verificar FFmpeg
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo Error: FFmpeg nao encontrado
    echo Instale com: choco install ffmpeg
    pause
    exit /b 1
)

echo OK: FFmpeg instalado

REM Instalar dependencias
echo.
echo [1/4] Instalando dependencias...
call npm install
call npm --workspace server install
call npm --workspace web install

REM Build web
echo.
echo [2/4] Buildando web...
call npm run build

REM Build desktop
echo.
echo [3/4] Buildando aplicativo desktop...
call npm run build:desktop

echo.
echo ========================================
echo   BUILD COMPLETO!
echo ========================================
echo.
echo Arquivos em: dist/builds/
echo.
dir dist\builds\*.exe dist\builds\*.dmg dist\builds\*.AppImage 2>nul || echo Nenhum arquivo encontrado

pause
