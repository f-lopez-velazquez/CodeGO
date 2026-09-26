#!/usr/bin/env bash
# ====================================================================
# CodeGO ExamGuard - Desinstalador Completo para Linux
# ====================================================================

set -e

echo "=== Desinstalando CodeGO ExamGuard ==="

# 1. Eliminar acceso directo de escritorio
rm -f "$HOME/.local/share/applications/codego-examguard.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

# 2. Eliminar ejecutables y enlaces
rm -f "$HOME/.local/bin/codego"
rm -f "$HOME/CodeGO.AppImage"

# 3. Opcional: preguntar si desea borrar datos y caché de usuario
if [ -d "$HOME/.config/codego-examguard" ]; then
    echo "Eliminando datos de sesión y caché local (~/.config/codego-examguard)..."
    rm -rf "$HOME/.config/codego-examguard"
fi

echo "✓ CodeGO ExamGuard ha sido desinstalado completamente de tu sistema."
