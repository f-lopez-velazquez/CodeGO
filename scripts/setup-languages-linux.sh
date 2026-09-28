#!/usr/bin/env bash
# ==============================================================================
# CodeGO ExamGuard - Script de Instalación de Lenguajes Académicos Offline/Online
# Lenguajes: Python 3, C/C++, Java (OpenJDK), JavaScript (Node.js), R
# ==============================================================================
set -e

COLOR_CYAN="\033[1;36m"
COLOR_GREEN="\033[1;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"
COLOR_RESET="\033[0m"

echo -e "${COLOR_CYAN}======================================================${COLOR_RESET}"
echo -e "${COLOR_CYAN}   CodeGO ExamGuard - Instalador de Lenguajes v1.2.0  ${COLOR_RESET}"
echo -e "${COLOR_CYAN}======================================================${COLOR_RESET}"
echo -e "Este asistente prepara y configura los compiladores y entornos"
echo -e "para exámenes y prácticas académicas en tu sistema Linux.\n"

# Detección de Gestor de Paquetes
PKG_MGR=""
if command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
elif command -v pacman &>/dev/null; then
    PKG_MGR="pacman"
else
    echo -e "${COLOR_RED}Error: No se detectó un gestor de paquetes compatible (apt, dnf, pacman).${COLOR_RESET}"
    exit 1
fi

# Parámetros o modo interactivo
INSTALL_PYTHON=true
INSTALL_CPP=true
INSTALL_JAVA=true
INSTALL_JS=true
INSTALL_R=true

if [ "$1" == "--all" ] || [ "$1" == "-y" ]; then
    echo -e "${COLOR_GREEN}Modo automático: Instalando los 5 lenguajes académicos...${COLOR_RESET}"
elif [ -n "$1" ]; then
    INSTALL_PYTHON=false
    INSTALL_CPP=false
    INSTALL_JAVA=false
    INSTALL_JS=false
    INSTALL_R=false
    for arg in "$@"; do
        case $arg in
            --python) INSTALL_PYTHON=true ;;
            --cpp|--c) INSTALL_CPP=true ;;
            --java) INSTALL_JAVA=true ;;
            --js|--javascript) INSTALL_JS=true ;;
            --r) INSTALL_R=true ;;
        esac
    done
else
    echo -e "${COLOR_YELLOW}Selecciona los lenguajes que deseas habilitar/instalar en este equipo:${COLOR_RESET}"
    read -p "¿Instalar/Verificar Python 3 y librerías científicas? (S/n): " ans_py
    [[ "$ans_py" =~ ^[Nn]$ ]] && INSTALL_PYTHON=false

    read -p "¿Instalar/Verificar C / C++ (GCC, G++, Make)? (S/n): " ans_cpp
    [[ "$ans_cpp" =~ ^[Nn]$ ]] && INSTALL_CPP=false

    read -p "¿Instalar/Verificar Java (OpenJDK Compiler & Runtime)? (S/n): " ans_java
    [[ "$ans_java" =~ ^[Nn]$ ]] && INSTALL_JAVA=false

    read -p "¿Instalar/Verificar JavaScript (Node.js runtime)? (S/n): " ans_js
    [[ "$ans_js" =~ ^[Nn]$ ]] && INSTALL_JS=false

    read -p "¿Instalar/Verificar R (Entorno estadístico y análisis numérico)? (S/n): " ans_r
    [[ "$ans_r" =~ ^[Nn]$ ]] && INSTALL_R=false
fi

SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
    echo -e "\n${COLOR_YELLOW}Se solicitarán privilegios de superusuario (sudo) para instalar paquetes.${COLOR_RESET}"
fi

PKGS_TO_INSTALL=()

# 1. Python 3
if [ "$INSTALL_PYTHON" = true ]; then
    echo -e "-> Verificando Python..."
    if [ "$PKG_MGR" == "apt" ]; then
        PKGS_TO_INSTALL+=(python3 python3-pip python3-venv python3-tk python3-dev)
    elif [ "$PKG_MGR" == "dnf" ]; then
        PKGS_TO_INSTALL+=(python3 python3-pip python3-tkinter python3-devel)
    elif [ "$PKG_MGR" == "pacman" ]; then
        PKGS_TO_INSTALL+=(python python-pip tk)
    fi
fi

# 2. C / C++
if [ "$INSTALL_CPP" = true ]; then
    echo -e "-> Verificando C / C++..."
    if [ "$PKG_MGR" == "apt" ]; then
        PKGS_TO_INSTALL+=(build-essential gcc g++ gdb make cmake)
    elif [ "$PKG_MGR" == "dnf" ]; then
        PKGS_TO_INSTALL+=(gcc gcc-c++ make gdb cmake)
    elif [ "$PKG_MGR" == "pacman" ]; then
        PKGS_TO_INSTALL+=(base-devel gcc gdb make cmake)
    fi
fi

# 3. Java
if [ "$INSTALL_JAVA" = true ]; then
    echo -e "-> Verificando Java..."
    if [ "$PKG_MGR" == "apt" ]; then
        PKGS_TO_INSTALL+=(default-jdk default-jre)
    elif [ "$PKG_MGR" == "dnf" ]; then
        PKGS_TO_INSTALL+=(java-latest-openjdk-devel java-latest-openjdk)
    elif [ "$PKG_MGR" == "pacman" ]; then
        PKGS_TO_INSTALL+=(jdk-openjdk jre-openjdk)
    fi
fi

# 4. JavaScript
if [ "$INSTALL_JS" = true ]; then
    echo -e "-> Verificando JavaScript (Node.js)..."
    if [ "$PKG_MGR" == "apt" ]; then
        PKGS_TO_INSTALL+=(nodejs npm)
    elif [ "$PKG_MGR" == "dnf" ]; then
        PKGS_TO_INSTALL+=(nodejs npm)
    elif [ "$PKG_MGR" == "pacman" ]; then
        PKGS_TO_INSTALL+=(nodejs npm)
    fi
fi

# 5. R
if [ "$INSTALL_R" = true ]; then
    echo -e "-> Verificando R..."
    if [ "$PKG_MGR" == "apt" ]; then
        PKGS_TO_INSTALL+=(r-base r-base-dev)
    elif [ "$PKG_MGR" == "dnf" ]; then
        PKGS_TO_INSTALL+=(R R-devel)
    elif [ "$PKG_MGR" == "pacman" ]; then
        PKGS_TO_INSTALL+=(r)
    fi
fi

# Instalación de paquetes
if [ ${#PKGS_TO_INSTALL[@]} -gt 0 ]; then
    echo -e "\n${COLOR_CYAN}Instalando paquetes seleccionados:${COLOR_RESET} ${PKGS_TO_INSTALL[*]}"
    if [ "$PKG_MGR" == "apt" ]; then
        $SUDO apt-get update -qq
        $SUDO apt-get install -y "${PKGS_TO_INSTALL[@]}"
    elif [ "$PKG_MGR" == "dnf" ]; then
        $SUDO dnf install -y "${PKGS_TO_INSTALL[@]}"
    elif [ "$PKG_MGR" == "pacman" ]; then
        $SUDO pacman -Sy --noconfirm "${PKGS_TO_INSTALL[@]}"
    fi
fi

# Librerías científicas y de hardware de Python para modo offline
if [ "$INSTALL_PYTHON" = true ]; then
    echo -e "\n${COLOR_CYAN}Verificando librerías esenciales de Python (numpy, matplotlib, pyserial)...${COLOR_RESET}"
    python3 -m pip install --upgrade pip --break-system-packages 2>/dev/null || true
    python3 -m pip install numpy pandas matplotlib pyserial esptool requests --break-system-packages 2>/dev/null || true
fi

echo -e "\n${COLOR_GREEN}======================================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}   ¡Entornos Académicos Preparados Exitosamente!      ${COLOR_RESET}"
echo -e "${COLOR_GREEN}======================================================${COLOR_RESET}"
echo -e "Resumen de herramientas detectadas:"
command -v python3 &>/dev/null && echo -e "  🐍 Python:     $(python3 --version)" || echo -e "  🐍 Python:     ${COLOR_RED}No instalado${COLOR_RESET}"
command -v gcc &>/dev/null && echo -e "  ⚙️ C/C++ (GCC): $(gcc --version | head -n1)" || echo -e "  ⚙️ C/C++:      ${COLOR_RED}No instalado${COLOR_RESET}"
command -v javac &>/dev/null && echo -e "  ☕ Java:       $(javac --version 2>&1)" || echo -e "  ☕ Java:       ${COLOR_RED}No instalado${COLOR_RESET}"
command -v node &>/dev/null && echo -e "  🟨 JavaScript: $(node --version)" || echo -e "  🟨 JavaScript: ${COLOR_RED}No instalado${COLOR_RESET}"
command -v Rscript &>/dev/null && echo -e "  📊 R:          $(Rscript --version 2>&1)" || echo -e "  📊 R:          ${COLOR_RED}No instalado${COLOR_RESET}"

echo -e "\nCodeGO ExamGuard está listo para ejecutar y evaluar exámenes sin conexión a internet.\n"
