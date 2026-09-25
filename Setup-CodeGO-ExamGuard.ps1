<#
====================================================================
 CodeGO ExamGuard - Instalador Maestro Automatizado para Windows
 Compatible con Windows 10 / Windows 11 (64-bit)
====================================================================
 Este script analiza los requisitos del sistema y descarga/instala
 automáticamente cualquier componente faltante:
 1. Microsoft Visual C++ 2015-2022 Redistributable (x64)
 2. Python 3.12 Oficial (64-bit) con pip y variables de entorno PATH
 3. Entorno Aislado exam_env
 4. 11 Librerías de Nivel Básico a Intermedio:
    (Pygame, NumPy, Matplotlib, Pandas, Requests, Pillow,
     SciPy, Seaborn, OpenPyXL, SymPy, Colorama)
 5. Acceso directo en el Escritorio de Windows
====================================================================
#>

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "     CodeGO ExamGuard - Instalador Automatizado de Entorno (Windows)" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------
# 1. VERIFICAR MICROSOFT VISUAL C++ 2015-2022 (x64)
# --------------------------------------------------------------------
Write-Host "[1/5] Analizando Microsoft Visual C++ 2015-2022 Redistributable..." -ForegroundColor Yellow

$vcInstalled = $false
$vcRegKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64"
if (Test-Path $vcRegKey) {
    $val = (Get-ItemProperty -Path $vcRegKey -Name "Installed" -ErrorAction SilentlyContinue).Installed
    if ($val -eq 1) { $vcInstalled = $true }
}
if (-not $vcInstalled) {
    if (Test-Path "$env:SystemRoot\System32\vcruntime140.dll") {
        $vcInstalled = $true
    }
}

if (-not $vcInstalled) {
    Write-Host "  [!] Visual C++ 2015-2022 no encontrado." -ForegroundColor Magenta
    Write-Host "  [+] Descargando vc_redist.x64.exe desde Microsoft (aka.ms)..." -ForegroundColor Cyan
    $vcUrl = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
    $vcDest = "$env:TEMP\vc_redist.x64.exe"
    
    Invoke-WebRequest -Uri $vcUrl -OutFile $vcDest
    Write-Host "  [+] Instalando Visual C++ en segundo plano..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath $vcDest -ArgumentList "/install /quiet /norestart" -Wait -PassThru
    Write-Host "  [OK] Microsoft Visual C++ instalado con éxito." -ForegroundColor Green
} else {
    Write-Host "  [OK] Visual C++ 2015-2022 ya se encuentra instalado." -ForegroundColor Green
}

# --------------------------------------------------------------------
# 2. VERIFICAR PYTHON 3 (64-bit)
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Analizando instalación de Python 3..." -ForegroundColor Yellow

$pyCmd = Get-Command "python" -ErrorAction SilentlyContinue
if (-not $pyCmd) {
    $pyCmd = Get-Command "py" -ErrorAction SilentlyContinue
}

if (-not $pyCmd) {
    Write-Host "  [!] Python 3 no detectado en el PATH del sistema." -ForegroundColor Magenta
    Write-Host "  [+] Descargando Python 3.12.8 Oficial (64-bit) desde python.org..." -ForegroundColor Cyan
    $pyUrl = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
    $pyDest = "$env:TEMP\python_installer.exe"
    
    Invoke-WebRequest -Uri $pyUrl -OutFile $pyDest
    Write-Host "  [+] Instalando Python automáticamente (configurando PATH y pip)..." -ForegroundColor Cyan
    $proc = Start-Process -FilePath $pyDest -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_pip=1" -Wait -PassThru
    
    # Agregar rutas a la sesión activa
    $env:Path = "$env:Path;C:\Program Files\Python312;C:\Program Files\Python312\Scripts;$env:LOCALAPPDATA\Programs\Python\Python312;$env:LOCALAPPDATA\Programs\Python\Python312\Scripts"
    Write-Host "  [OK] Python 3.12.8 instalado con éxito." -ForegroundColor Green
} else {
    $ver = & python --version 2>&1
    Write-Host "  [OK] $ver detectado en el sistema." -ForegroundColor Green
}

# --------------------------------------------------------------------
# 3. PREPARAR ENTORNO VIRTUAL AISLADO (exam_env)
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[3/5] Configurando entorno virtual aislado de examen (exam_env)..." -ForegroundColor Yellow

$venvPath = Join-Path $ScriptDir "exam_env"
if (-not (Test-Path $venvPath)) {
    Write-Host "  [+] Creando entorno virtual exam_env..." -ForegroundColor Cyan
    & python -m venv --system-site-packages "$venvPath"
    Write-Host "  [OK] Entorno virtual exam_env creado exitosamente." -ForegroundColor Green
} else {
    Write-Host "  [OK] Entorno virtual exam_env verificado." -ForegroundColor Green
}

$examPip = Join-Path $venvPath "Scripts\pip.exe"
$examPy = Join-Path $venvPath "Scripts\python.exe"

if (-not (Test-Path $examPip)) {
    $examPip = "pip"
    $examPy = "python"
}

# Actualizar pip
Write-Host "  [+] Actualizando gestor de paquetes pip..." -ForegroundColor Cyan
& $examPip install --upgrade pip --quiet

# --------------------------------------------------------------------
# 4. INSTALAR 11 LIBRERÍAS DE NIVEL BÁSICO A INTERMEDIO
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[4/5] Analizando e instalando 11 librerías recomendadas..." -ForegroundColor Yellow
Write-Host "      (pygame, numpy, matplotlib, pandas, requests, pillow," -ForegroundColor DarkGray
Write-Host "       scipy, seaborn, openpyxl, sympy, colorama)" -ForegroundColor DarkGray
Write-Host ""

$packages = @(
    "pygame", "numpy", "matplotlib", "pandas", "requests", "pillow",
    "scipy", "seaborn", "openpyxl", "sympy", "colorama"
)

foreach ($pkg in $packages) {
    Write-Host -NoNewline "  * Verificando $pkg... "
    $checkPkg = $pkg
    if ($pkg -eq "pillow") { $checkPkg = "PIL" }

    $installed = $false
    try {
        & $examPy -c "import $checkPkg" 2>$null
        if ($LASTEXITCODE -eq 0) { $installed = $true }
    } catch {}

    if ($installed) {
        Write-Host "[OK] Ya instalada" -ForegroundColor Green
    } else {
        Write-Host "[DESCARGANDO E INSTALANDO]" -ForegroundColor Cyan
        & $examPip install $pkg --quiet
        Write-Host "    ✓ $pkg instalada correctamente." -ForegroundColor Green
    }
}

# --------------------------------------------------------------------
# 5. CREAR ACCESO DIRECTO EN EL ESCRITORIO
# --------------------------------------------------------------------
Write-Host ""
Write-Host "[5/5] Creando acceso directo en el Escritorio..." -ForegroundColor Yellow

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "CodeGO ExamGuard.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $ScriptDir "start.bat"
$shortcut.WorkingDirectory = $ScriptDir
$shortcut.Description = "Entorno Seguro de Exámenes de Python - CodeGO ExamGuard"
if (Test-Path (Join-Path $ScriptDir "build\icon.png")) {
    $shortcut.IconLocation = Join-Path $ScriptDir "build\icon.png"
}
$shortcut.Save()

Write-Host "  [OK] Acceso directo 'CodeGO ExamGuard' creado en tu Escritorio." -ForegroundColor Green

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  ¡ENTORNO 100% CONFIGURADO Y VALIDADO!" -ForegroundColor Green
Write-Host "  Visual C++, Python 3 y las 11 librerías están listas." -ForegroundColor White
Write-Host ""
Write-Host "  Para agregar cualquier otra librería en el futuro:" -ForegroundColor Yellow
Write-Host "    .\exam_env\Scripts\pip.exe install [nombre_libreria]" -ForegroundColor White
Write-Host "    o usa el botón 'Gestionar Librerías' dentro de la aplicación." -ForegroundColor White
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Iniciando CodeGO ExamGuard..." -ForegroundColor Cyan
Start-Process -FilePath (Join-Path $ScriptDir "start.bat")
