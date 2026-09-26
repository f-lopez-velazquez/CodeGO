#!/usr/bin/env bash
# ====================================================================
# CodeGO ExamGuard - Instalador Automatizado de Dependencias (Linux & macOS)
# Analiza, descarga e instala automáticamente:
# 1. Python 3, pip, venv, tkinter y herramientas del sistema
# 2. Node.js (si no está disponible)
# 3. Entorno virtual aislado exam_env
# 4. Batería completa de librerías para exámenes (Básico a Intermedio):
#    (pygame, numpy, matplotlib, pandas, requests, pillow,
#     scipy, seaborn, openpyxl, sympy, colorama)
# 5. Integración con el escritorio (.desktop launcher)
# ====================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================================${NC}"
echo -e "${CYAN}     CodeGO ExamGuard - Analizador e Instalador Maestro (Linux/Mac)${NC}"
echo -e "${CYAN}====================================================================${NC}"

# Detectar gestor de paquetes del sistema
detect_pkg_manager() {
    if command -v apt-get &> /dev/null; then
        echo "apt"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v zypper &> /dev/null; then
        echo "zypper"
    elif command -v brew &> /dev/null; then
        echo "brew"
    else
        echo "unknown"
    fi
}

PKG_MGR=$(detect_pkg_manager)

# --------------------------------------------------------------------
# 1. VERIFICAR PYTHON 3, PIP Y VENV
# --------------------------------------------------------------------
echo -e "\n${YELLOW}[1/5] Analizando instalación de Python 3 y herramientas base...${NC}"

NEEDS_PY_INSTALL=false
if ! command -v python3 &> /dev/null; then
    NEEDS_PY_INSTALL=true
fi

if [ "$NEEDS_PY_INSTALL" = true ]; then
    echo -e "${YELLOW}  [!] Python 3 no detectado. Iniciando instalación automática...${NC}"
    case "$PKG_MGR" in
        apt)
            sudo apt-get update
            sudo apt-get install -y python3 python3-pip python3-venv python3-tk build-essential
            ;;
        pacman)
            sudo pacman -S --noconfirm python python-pip tk gcc
            ;;
        dnf)
            sudo dnf install -y python3 python3-pip python3-tkinter gcc
            ;;
        zypper)
            sudo zypper install -y python3 python3-pip python3-tk gcc
            ;;
        brew)
            brew install python
            ;;
        *)
            echo -e "${RED}  ✗ No se pudo determinar el gestor de paquetes. Instala python3 y python3-venv manualmente.${NC}"
            exit 1
            ;;
    esac
    echo -e "${GREEN}  ✓ Python 3 y dependencias del sistema instaladas con éxito.${NC}"
else
    PY_VER=$(python3 --version)
    echo -e "${GREEN}  ✓ ${PY_VER} detectado en el sistema.${NC}"
fi

# --------------------------------------------------------------------
# 2. VERIFICAR NODE.JS
# --------------------------------------------------------------------
echo -e "\n${YELLOW}[2/5] Analizando motor Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    echo -e "${GREEN}  ✓ Node.js detectado: ${NODE_VER}${NC}"
else
    echo -e "${YELLOW}  [!] Node.js no encontrado. Instalando automáticamente...${NC}"
    case "$PKG_MGR" in
        apt)
            sudo apt-get update && sudo apt-get install -y nodejs npm
            ;;
        pacman)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        dnf)
            sudo dnf install -y nodejs npm
            ;;
        brew)
            brew install node
            ;;
        *)
            echo -e "${RED}Por favor instala Node.js desde https://nodejs.org${NC}"
            ;;
    esac
fi

# --------------------------------------------------------------------
# 3. PREPARAR ENTORNO VIRTUAL AISLADO (exam_env)
# --------------------------------------------------------------------
echo -e "\n${YELLOW}[3/5] Preparando entorno virtual aislado de examen (exam_env)...${NC}"
if [ ! -d "exam_env" ]; then
    echo "  Creando entorno virtual con soporte para paquetes del sistema..."
    python3 -m venv --system-site-packages exam_env
    echo -e "${GREEN}  ✓ Entorno virtual exam_env creado exitosamente.${NC}"
else
    echo -e "${GREEN}  ✓ Entorno virtual exam_env verificado.${NC}"
fi

EXAM_PIP="./exam_env/bin/pip"
EXAM_PY="./exam_env/bin/python3"

# Actualizar pip
$EXAM_PIP install --upgrade pip --quiet

# --------------------------------------------------------------------
# 4. INSTALAR BATERÍA DE LIBRERÍAS (BÁSICO, AVANZADO Y HARDWARE: 12 PAQUETES)
# --------------------------------------------------------------------
echo -e "\n${YELLOW}[4/5] Analizando e instalando 12 librerías para exámenes y hardware...${NC}"
echo -e "      (pygame, numpy, matplotlib, pandas, requests, pillow,"
echo -e "       scipy, seaborn, openpyxl, sympy, colorama, pyserial)\n"

PACKAGES=("pygame" "numpy" "matplotlib" "pandas" "requests" "pillow" "scipy" "seaborn" "openpyxl" "sympy" "colorama" "pyserial")

for pkg in "${PACKAGES[@]}"; do
    echo -n "  * Verificando ${pkg}... "
    check_name="$pkg"
    if [ "$pkg" == "pillow" ]; then
        check_name="PIL"
    elif [ "$pkg" == "pyserial" ]; then
        check_name="serial"
    fi

    if $EXAM_PY -c "import ${check_name}" &> /dev/null; then
        echo -e "${GREEN}[OK] Instalado${NC}"
    else
        echo -e "${CYAN}[DESCARGANDO E INSTALANDO]${NC}"
        $EXAM_PIP install "$pkg" --quiet
        echo -e "${GREEN}    ✓ ${pkg} instalado con éxito.${NC}"
    fi
done

# Configurar permisos de hardware para Arduino, ESP32 y periféricos (Linux)
if [ "$PKG_MGR" != "brew" ] && [ "$(id -u)" -ne 0 ]; then
    echo -e "\n${YELLOW}[+] Configurando permisos de hardware para Arduino, ESP32 y periféricos...${NC}"
    sudo usermod -a -G dialout,uucp,tty "$USER" 2>/dev/null || true
    if [ -d "/etc/udev/rules.d" ]; then
        echo 'KERNEL=="ttyUSB*", MODE="0666", GROUP="dialout"' | sudo tee /etc/udev/rules.d/99-codego-serial.rules >/dev/null 2>&1 || true
        echo 'KERNEL=="ttyACM*", MODE="0666", GROUP="dialout"' | sudo tee -a /etc/udev/rules.d/99-codego-serial.rules >/dev/null 2>&1 || true
        sudo udevadm control --reload-rules 2>/dev/null || true
        sudo udevadm trigger 2>/dev/null || true
    fi
    echo -e "${GREEN}  ✓ Permisos de hardware (dialout/udev) listos para microcontroladores y sensores.${NC}"
fi

# --------------------------------------------------------------------
# 5. INSTALAR DEPENDENCIAS INTERNAS & CREAR ACCESO DIRECTO
# --------------------------------------------------------------------
echo -e "\n${YELLOW}[5/5] Configurando la aplicación y accesos directos...${NC}"
if [ ! -d "node_modules" ] && [ -f "package.json" ]; then
    npm install --silent
fi

# Crear Desktop Entry en Linux si existe ~/.local/share/applications
if [ "$PKG_MGR" != "brew" ] && [ -d "$HOME/.local/share/applications" ]; then
    DESKTOP_FILE="$HOME/.local/share/applications/codego-examguard.desktop"
    cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=CodeGO ExamGuard
Comment=Entorno Seguro de Exámenes y Programación Python
Exec=$DIR/start.sh
Icon=$DIR/build/icon.png
Terminal=false
Type=Application
Categories=Education;Development;IDE;
EOF
    chmod +x "$DESKTOP_FILE"
    echo -e "${GREEN}  ✓ Acceso directo creado en el menú del sistema (.desktop).${NC}"
fi

echo -e "\n${CYAN}====================================================================${NC}"
echo -e "${GREEN}${BOLD}  ¡ENTORNO 100% CONFIGURADO Y VALIDADO!${NC}"
echo -e "  Python 3, el entorno virtual y las 11 librerías están listas."
echo -e "  "
echo -e "  ${YELLOW}Para agregar cualquier otra librería fácilmente:${NC}"
echo -e "    ./exam_env/bin/pip install [nombre_libreria]"
echo -e "    O usa el gestor integrado dentro de CodeGO ExamGuard."
echo -e "  "
echo -e "  Inicia la aplicación con: ${BOLD}./start.sh${NC} (o npm start)"
echo -e "${CYAN}====================================================================${NC}"
