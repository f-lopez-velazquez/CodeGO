#!/usr/bin/env bash
# ====================================================================
# CodeGO ExamGuard - Lanzador Inteligente para Linux y macOS
# ====================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=== Iniciando CodeGO ExamGuard ==="

# Si el entorno de examen no existe, invocar instalador automatizado
if [ ! -d "exam_env" ]; then
    echo "Entorno no configurado previamente. Ejecutando instalador maestro..."
    chmod +x install_dependencies.sh
    ./install_dependencies.sh
    exit 0
fi

# Si node_modules no existe, instalar dependencias de la app
if [ ! -d "node_modules" ]; then
    echo "Instalando módulos de la aplicación..."
    npm install --silent
fi

echo "Lanzando entorno seguro de examen..."
npm start
