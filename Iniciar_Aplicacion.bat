@echo off
title Concurso de Auxiliares - Cabildo de Tenerife
chcp 65001 >nul
echo ======================================================================
echo   APLICACION DE BAREMACION Y ADJUDICACION - CABILDO DE TENERIFE
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se ha detectado Node.js en este ordenador.
    echo Para ejecutar la aplicacion se necesita Node.js instalado.
    echo Puedes descargarlo e instalarlo gratis desde: https://nodejs.org
    echo.
    pause
    exit /b
)

echo Iniciando el servidor local del concurso en el puerto 3000...
echo Abriendo la aplicacion en tu navegador web...
echo.
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
node server.js
pause
