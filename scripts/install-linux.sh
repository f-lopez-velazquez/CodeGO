#!/usr/bin/env bash
# Instalación local de CodeGO para distribuciones Linux de 64 bits.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

VERSION=$(node -p "require('./package.json').version")
echo "=== Instalando CodeGO ExamGuard v${VERSION} ==="

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons"

# 1. Limpiar versión anterior
rm -f "$HOME/.local/share/applications/codego-examguard.desktop"
rm -f "$HOME/.local/bin/codego"
rm -f "$HOME/CodeGO.AppImage"

# 2. Copiar nuevo binario AppImage
APPIMAGE="$DIR/dist/CodeGO-${VERSION}-linux-x86_64.AppImage"

if [ ! -f "$APPIMAGE" ]; then
    echo "Compilando nueva versión de AppImage..."
    npx electron-builder --linux AppImage
fi

chmod +x "$APPIMAGE"
cp "$APPIMAGE" "$HOME/.local/bin/codego"
chmod +x "$HOME/.local/bin/codego"
ln -sf "$HOME/.local/bin/codego" "$HOME/CodeGO.AppImage"
cp "$DIR/build/icon.png" "$HOME/.local/share/icons/codego.png"

# 3. Registrar acceso directo en el sistema
cat > "$HOME/.local/share/applications/codego-examguard.desktop" <<EOF
[Desktop Entry]
Name=CodeGO ExamGuard
Comment=Entorno Académico de Programación y Evaluación en Python
Exec=$HOME/.local/bin/codego
Icon=$DIR/build/icon.png
Terminal=false
Type=Application
Categories=Education;Development;IDE;
StartupWMClass=CodeGO ExamGuard
EOF

chmod +x "$HOME/.local/share/applications/codego-examguard.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

# 4. Configurar permisos de hardware para Arduino, ESP32, Raspberry Pi y periféricos
if [ "$(id -u)" -ne 0 ] && command -v sudo &> /dev/null; then
    if sudo -n true 2>/dev/null; then
        echo "Configurando permisos de hardware serial para Arduino, ESP32 y periféricos..."
        serial_groups=()
        for candidate in dialout uucp tty; do
            if getent group "$candidate" >/dev/null 2>&1; then
                serial_groups+=("$candidate")
            fi
        done
        if [ "${#serial_groups[@]}" -gt 0 ]; then
            serial_group_list=$(IFS=,; echo "${serial_groups[*]}")
            sudo usermod -a -G "$serial_group_list" "$USER" 2>/dev/null || true
        fi
        if [ -d "/etc/udev/rules.d" ]; then
            serial_group="tty"
            for candidate in dialout uucp; do
                if getent group "$candidate" >/dev/null 2>&1; then
                    serial_group="$candidate"
                    break
                fi
            done
            printf 'KERNEL=="ttyUSB*", MODE="0660", GROUP="%s"\nKERNEL=="ttyACM*", MODE="0660", GROUP="%s"\n' "$serial_group" "$serial_group" | sudo tee /etc/udev/rules.d/99-codego-serial.rules >/dev/null 2>&1 || true
            sudo udevadm control --reload-rules 2>/dev/null || true
            sudo udevadm trigger 2>/dev/null || true
        fi
    else
        echo "Los permisos para Arduino y otros dispositivos se solicitarán cuando sean necesarios."
    fi
fi

echo "✓ CodeGO ExamGuard v${VERSION} instalado correctamente:"
echo "  • Menú de aplicaciones del sistema (busca 'CodeGO')"
echo "  • Comando de terminal: codego"
echo "  • Acceso directo: ~/CodeGO.AppImage"
echo "  • Soporte de hardware para Arduino / ESP32 / Raspberry Pi configurado ✓"
