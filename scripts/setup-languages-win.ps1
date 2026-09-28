<#
.SYNOPSIS
    CodeGO ExamGuard - Script de Instalación de Lenguajes Académicos para Windows
    Permite seleccionar e instalar compiladores y dependencias para entornos de examen offline.
    Lenguajes: Python 3, C/C++ (MinGW-w64), Java (Microsoft OpenJDK), JavaScript (Node.js LTS), R
#>

param(
    [switch]$All,
    [switch]$Python,
    [switch]$Cpp,
    [switch]$Java,
    [switch]$JavaScript,
    [switch]$R,
    [string]$OfflineSourceDir = ""
)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   CodeGO ExamGuard - Instalador de Lenguajes Windows " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Configurando compiladores y runtimes para exámenes..." -ForegroundColor Gray

# Verificar si se ejecuta como Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Se recomienda ejecutar este script como Administrador para configurar variables de entorno del sistema."
}

# Selección de lenguajes
if ($All) {
    $Python = $true
    $Cpp = $true
    $Java = $true
    $JavaScript = $true
    $R = $true
} elseif (-not ($Python -or $Cpp -or $Java -or $JavaScript -or $R)) {
    # Modo interactivo
    $resPy = Read-Host "¿Instalar/Verificar Python 3 y librerías científicas? (S/N) [S]"
    $Python = ($resPy -ne "N" -and $resPy -ne "n")

    $resCpp = Read-Host "¿Instalar/Verificar C / C++ (MinGW-w64 GCC/G++)? (S/N) [S]"
    $Cpp = ($resCpp -ne "N" -and $resCpp -ne "n")

    $resJava = Read-Host "¿Instalar/Verificar Java (OpenJDK Compiler & Runtime)? (S/N) [S]"
    $Java = ($resJava -ne "N" -and $resJava -ne "n")

    $resJs = Read-Host "¿Instalar/Verificar JavaScript (Node.js LTS)? (S/N) [S]"
    $JavaScript = ($resJs -ne "N" -and $resJs -ne "n")

    $resR = Read-Host "¿Instalar/Verificar R para análisis estadístico? (S/N) [S]"
    $R = ($resR -ne "N" -and $resR -ne "n")
}

function Install-WithWingetOrChoco {
    param([string]$WingetId, [string]$ChocoId, [string]$DisplayName)

    Write-Host "-> Instalando $DisplayName..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id $WingetId --accept-package-agreements --accept-source-agreements --silent
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install $ChocoId -y
    } else {
        Write-Warning "Ni winget ni choco están instalados. Descarga e instala $DisplayName manualmente."
    }
}

# 1. Python
if ($Python) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Install-WithWingetOrChoco -WingetId "Python.Python.3.13" -ChocoId "python3" -DisplayName "Python 3.13"
    }
    Write-Host "-> Verificando librerías esenciales de Python..." -ForegroundColor Green
    python -m pip install --upgrade pip --quiet
    python -m pip install numpy pandas matplotlib pyserial esptool requests --quiet
}

# 2. C / C++
if ($Cpp) {
    if (-not (Get-Command gcc -ErrorAction SilentlyContinue)) {
        Install-WithWingetOrChoco -WingetId "MSYS2.MSYS2" -ChocoId "mingw" -DisplayName "MinGW-w64 (GCC/G++)"
    }
}

# 3. Java
if ($Java) {
    if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
        Install-WithWingetOrChoco -WingetId "Microsoft.OpenJDK.21" -ChocoId "openjdk" -DisplayName "Microsoft OpenJDK 21"
    }
}

# 4. JavaScript
if ($JavaScript) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Install-WithWingetOrChoco -WingetId "OpenJS.NodeJS.LTS" -ChocoId "nodejs-lts" -DisplayName "Node.js LTS"
    }
}

# 5. R
if ($R) {
    if (-not (Get-Command Rscript -ErrorAction SilentlyContinue)) {
        Install-WithWingetOrChoco -WingetId "RProject.R" -ChocoId "r.project" -DisplayName "R Project"
    }
}

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "   ¡Verificación y Configuración Completada!          " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green

Write-Host "Compiladores y runtimes detectados:" -ForegroundColor Gray
if (Get-Command python -ErrorAction SilentlyContinue) { Write-Host "  🐍 Python:     $(python --version)" -ForegroundColor Green } else { Write-Host "  🐍 Python:     No detectado" -ForegroundColor Red }
if (Get-Command gcc -ErrorAction SilentlyContinue) { Write-Host "  ⚙️ C/C++:      $(gcc --version | Select-Object -First 1)" -ForegroundColor Green } else { Write-Host "  ⚙️ C/C++:      No detectado" -ForegroundColor Red }
if (Get-Command javac -ErrorAction SilentlyContinue) { Write-Host "  ☕ Java:       $(javac --version 2>&1)" -ForegroundColor Green } else { Write-Host "  ☕ Java:       No detectado" -ForegroundColor Red }
if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "  🟨 JavaScript: $(node --version)" -ForegroundColor Green } else { Write-Host "  🟨 JavaScript: No detectado" -ForegroundColor Red }
if (Get-Command Rscript -ErrorAction SilentlyContinue) { Write-Host "  📊 R:          $(Rscript --version 2>&1)" -ForegroundColor Green } else { Write-Host "  📊 R:          No detectado" -ForegroundColor Red }

Write-Host "`nCodeGO ExamGuard está preparado para exámenes en Windows sin conexión a internet.`n"
