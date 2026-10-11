@echo off
cd /d "%~dp0"
title Concurso de Auxiliares - Cabildo de Tenerife
chcp 65001 >nul

echo ======================================================================
echo   APLICACION DE BAREMACION Y ADJUDICACION - CABILDO DE TENERIFE
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] No se ha detectado Node.js en este ordenador.
    echo Puedes instalar Node.js gratis desde https://nodejs.org si deseas
    echo utilizar el servidor local y el analisis automatico de PDFs y Word.
    echo.
    echo Abriendo la aplicacion directamente en tu navegador web...
    start "" "public\index.html"
    echo.
    pause
    exit /b
)

echo Comprobando e iniciando servidor local...
start /b node server.js
timeout /t 2 /nobreak >nul

echo Abriendo la aplicacion en tu navegador...
start "" http://localhost:3000

echo.
echo ======================================================================
echo   La aplicacion esta activa en: http://localhost:3000
echo   Clave de acceso predeterminada: quemellevelalava
echo.
echo   (No cierres esta ventana mientras utilices la aplicacion)
echo ======================================================================
echo.
pause
