@echo off
REM Levanta el entorno completo de GLAMOURS en desarrollo:
REM 1) Emulador de Firebase (usa Java portable, no requiere instalacion)
REM 2) App Vite en http://localhost:5173

set JAVA_HOME=C:\Users\EfectivoSi\jre21\jdk-21.0.12.1+1-jre
set PATH=%JAVA_HOME%\bin;%PATH%

start "Emulador Firebase" cmd /k firebase emulators:start
timeout /t 8 /nobreak >nul
start "App GLAMOURS" cmd /k npm run dev

echo.
echo Entorno iniciando...
echo   App:       http://localhost:5173
echo   Emulador:  http://localhost:4000
echo.
echo Para detener todo: cerrar las dos ventanas que se abrieron.
pause
