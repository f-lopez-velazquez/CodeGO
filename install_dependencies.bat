@echo off
setlocal enabledelayedexpansion

REM ====================================================================
REM CodeGO ExamGuard - Instalador Automatizado de Dependencias (Windows)
REM Analiza, descarga e instala automáticamente:
REM 1. Microsoft Visual C++ 2015-2022 Redistributable (x64)
REM 2. Python 3.12 Oficial (64-bit con pip y PATH configurado)
REM 3. Entorno Aislado exam_env
REM 4. Batería completa de librerías de nivel básico a intermedio:
REM    (pygame, numpy, matplotlib, pandas, requests, pillow,
REM     scipy, seaborn, openpyxl, sympy, colorama)
REM ====================================================================

title CodeGO ExamGuard - Analizador e Instalador Maestro de Entorno

echo ====================================================================
echo      CodeGO ExamGuard - Analizador e Instalador de Entorno
echo ====================================================================
echo.

REM --------------------------------------------------------------------
REM 1. VERIFICAR MICROSOFT VISUAL C++ REDISTRIBUTABLE (Crítico para Pygame / NumPy)
REM --------------------------------------------------------------------
echo [1/5] Analizando Microsoft Visual C++ 2015-2022 Redistributable (x64)...
set "VCREDIST_INSTALLED=0"

reg query "HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" /v Installed >nul 2>nul
if %errorlevel% equ 0 (
    set "VCREDIST_INSTALLED=1"
) else (
    if exist "%SystemRoot%\System32\vcruntime140.dll" (
        set "VCREDIST_INSTALLED=1"
    )
)

if "!VCREDIST_INSTALLED!"=="0" (
    echo   [!] Visual C++ 2015-2022 no detectado en el sistema.
    echo   [+] Descargando vc_redist.x64.exe directamente desde Microsoft...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'Continue'; Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile '%TEMP%\vc_redist.x64.exe'"
    if exist "%TEMP%\vc_redist.x64.exe" (
        echo   [+] Instalando Visual C++ de forma silenciosa y automática...
        start /wait "" "%TEMP%\vc_redist.x64.exe" /install /quiet /norestart
        echo   [OK] Microsoft Visual C++ 2015-2022 instalado con éxito.
    ) else (
        echo   [!] Error al descargar Visual C++. Continuando con Python...
    )
) else (
    echo   [OK] Visual C++ 2015-2022 Redistributable ya instalado y verificado.
)

REM --------------------------------------------------------------------
REM 2. VERIFICAR PYTHON 3
REM --------------------------------------------------------------------
echo.
echo [2/5] Analizando instalación de Python 3 en el sistema...
set "PYTHON_FOUND=0"

where python >nul 2>nul
if %errorlevel% equ 0 (
    set "PYTHON_FOUND=1"
) else (
    where py >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_FOUND=1"
    )
)

if "!PYTHON_FOUND!"=="0" (
    echo   [!] Python 3 no encontrado en el sistema.
    echo   [+] Descargando instalador oficial de Python 3.12.8 (64-bit)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'Continue'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' -OutFile '%TEMP%\python_installer.exe'"
    if exist "%TEMP%\python_installer.exe" (
        echo   [+] Instalando Python 3 automáticamente (habilitando pip y agregando al PATH)...
        start /wait "" "%TEMP%\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1
        echo   [OK] Python 3.12.8 instalado con éxito.
    ) else (
        echo   [ERROR] No se pudo descargar el instalador de Python.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('python --version 2^>nul') do echo   [OK] %%v detectado en el sistema.
)

REM Actualizar rutas del PATH en la sesión actual
set "PATH=%PATH%;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;C:\Python312;C:\Python312\Scripts"

REM --------------------------------------------------------------------
REM 3. VERIFICAR NODE.JS (Para modo desarrollo / ejecución)
REM --------------------------------------------------------------------
echo.
echo [3/5] Analizando motor Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   [!] Node.js no encontrado. Descargando instalador oficial LTS...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\node_installer.msi'"
    if exist "%TEMP%\node_installer.msi" (
        echo   [+] Instalando Node.js de forma silenciosa...
        start /wait msiexec /i "%TEMP%\node_installer.msi" /quiet /norestart
        set "PATH=%PATH%;C:\Program Files\nodejs"
        echo   [OK] Node.js instalado.
    )
) else (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do echo   [OK] Node.js detectado: %%v
)

REM --------------------------------------------------------------------
REM 4. CONFIGURAR ENTORNO VIRTUAL AISLADO (exam_env)
REM --------------------------------------------------------------------
echo.
echo [4/5] Configurando entorno virtual aislado para exámenes (exam_env)...
if not exist "exam_env" (
    echo   [+] Creando entorno virtual exam_env con herencia de paquetes del sistema...
    python -m venv --system-site-packages exam_env
) else (
    echo   [OK] Entorno virtual exam_env ya presente.
)

set "EXAM_PIP=exam_env\Scripts\pip.exe"
set "EXAM_PY=exam_env\Scripts\python.exe"

if not exist "!EXAM_PIP!" (
    set "EXAM_PIP=pip"
    set "EXAM_PY=python"
)

echo   [+] Actualizando gestor de paquetes pip...
"!EXAM_PIP!" install --upgrade pip --quiet

REM --------------------------------------------------------------------
REM 5. INSTALAR BATERÍA COMPLETA DE LIBRERÍAS (BÁSICO, AVANZADO Y HARDWARE: 12 PAQUETES)
REM --------------------------------------------------------------------
echo.
echo [5/5] Analizando e instalando librerías para exámenes y hardware (12 paquetes)...
echo       (pygame, numpy, matplotlib, pandas, requests, pillow,
echo        scipy, seaborn, openpyxl, sympy, colorama, pyserial)
echo.

set PACKAGES=pygame numpy matplotlib pandas requests pillow scipy seaborn openpyxl sympy colorama pyserial

for %%p in (!PACKAGES!) do (
    <nul set /p="  * Verificando %%p... "
    "!EXAM_PY!" -c "import %%p" >nul 2>nul
    if !errorlevel! equ 0 (
        echo [OK] Ya instalada.
    ) else (
        if "%%p"=="pillow" (
            "!EXAM_PY!" -c "import PIL" >nul 2>nul
            if !errorlevel! equ 0 (
                echo [OK] PIL ya instalada.
            ) else (
                echo [DESCARGANDO]
                "!EXAM_PIP!" install %%p --quiet
                echo     ✓ %%p instalada correctamente.
            )
        ) else if "%%p"=="pyserial" (
            "!EXAM_PY!" -c "import serial" >nul 2>nul
            if !errorlevel! equ 0 (
                echo [OK] serial ya instalada.
            ) else (
                echo [DESCARGANDO]
                "!EXAM_PIP!" install %%p --quiet
                echo     ✓ %%p instalada correctamente.
            )
        ) else (
            echo [DESCARGANDO]
            "!EXAM_PIP!" install %%p --quiet
            echo     ✓ %%p instalada correctamente.
        )
    )
)

if not exist node_modules (
    if exist package.json (
        echo.
        echo [+] Instalando dependencias internas de la aplicación...
        call npm install
    )
)

echo.
echo ====================================================================
echo  [✓] ENTORNO 100%% CONFIGURADO Y VALIDADO.
echo      Visual C++, Python 3 y todas las 11 librerías están listas.
echo      Para agregar cualquier otra librería simplemente ejecuta:
echo        exam_env\Scripts\pip.exe install [nombre_libreria]
echo      o usa el botón "Gestionar Librerías" dentro de CodeGO ExamGuard.
echo ====================================================================
echo.
echo Iniciando CodeGO ExamGuard...
call npm start
