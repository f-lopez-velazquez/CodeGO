@echo off
REM ====================================================================
REM CodeGO ExamGuard - Lanzador Inteligente para Microsoft Windows
REM ====================================================================

title CodeGO ExamGuard

echo === Iniciando CodeGO ExamGuard para Windows ===

REM Si el entorno virtual de examen o las librerias no estan configuradas,
REM invocar el instalador maestro automatizado
if not exist "exam_env" (
    echo Entorno de examen no detectado. Iniciando instalador automatizado...
    call install_dependencies.bat
    exit /b
)

if not exist node_modules (
    echo Instalando dependencias de la aplicacion por primera vez...
    call npm install
)

echo Lanzando aplicacion en modo seguro...
call npm start
