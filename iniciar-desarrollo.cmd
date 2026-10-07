@echo off
REM Levanta el entorno completo de GLAMOURS en desarrollo:
REM 1) Emulador de Firebase (usa Java portable si existe en .tools)
REM 2) App Vite en http://localhost:5173
REM Requisitos: firebase-tools instalados (npm i -g firebase-tools), Node 20+.

setlocal
cd /d "%~dp0"

REM Detectar un JRE portable dentro del repo (.tools\jdk*\jre\bin o \bin)
for /d %%J in (".tools\jdk*") do (
  if exist "%%~J\bin\java.exe" set "JAVA_HOME=%%~fJ"
  if exist "%%~J\jre\bin\java.exe" set "JAVA_HOME=%%~fJ\jre"
)

if not defined JAVA_HOME (
  if defined JAVA_HOME_ACTUAL set "JAVA_HOME=%JAVA_HOME_ACTUAL%"
)

if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

echo Usando JAVA_HOME=%JAVA_HOME%
java -version >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] No se encontro Java. Baja un JRE 21 portable desde:
  echo   https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse
  echo y descomprimilo dentro de .tools\ del proyecto, o define JAVA_HOME.
  pause
  exit /b 1
)

start "Emulador Firebase" cmd /k firebase emulators:start --project glamours-control
timeout /t 8 /nobreak >nul
start "App GLAMOURS" cmd /k npm run dev

echo.
echo Entorno iniciando...
echo   App:       http://localhost:5173
echo   Emulador:  http://localhost:4000
echo   Usuario:   admin@glamours.com / glamours123 (si no existe: node crear-admin-emulador.mjs)
echo.
echo Para detener todo: cerrar las dos ventanas que se abrieron.
pause
endlocal