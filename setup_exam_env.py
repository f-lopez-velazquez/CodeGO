#!/usr/bin/env python3
"""
CodeGO ExamGuard - Script de Verificación y Configuración de Entorno de Python
Analiza e instala librerías para exámenes de programación (Básico a Intermedio).
"""

import sys
import subprocess
import os

RECOMMENDED_LIBRARIES = [
    ("pygame", "Desarrollo de videojuegos y gráficos 2D"),
    ("numpy", "Cálculo numérico, matrices y álgebra lineal"),
    ("matplotlib", "Gráficas, diagramas y visualización de datos"),
    ("pandas", "Manipulación de datos tabulares y DataFrames"),
    ("requests", "Peticiones HTTP, APIs REST y consumo web"),
    ("PIL", "Procesamiento y manipulación de imágenes (Pillow)"),
    ("scipy", "Algoritmos científicos, cálculo y optimización"),
    ("seaborn", "Visualización y trazado estadístico avanzado"),
    ("openpyxl", "Lectura y escritura de libros de cálculo Excel"),
    ("sympy", "Matemáticas simbólicas, derivadas e integrales"),
    ("colorama", "Colores y estilos de texto en consola multiplataforma"),
]

STANDARD_MODULES = [
    ("math", "Módulo matemático estándar"),
    ("random", "Generación de números pseudoaleatorios"),
    ("json", "Manipulación de datos JSON"),
    ("datetime", "Manejo de fechas y tiempos"),
    ("sqlite3", "Base de datos SQL local integrada"),
    ("os", "Interacción con el sistema operativo"),
    ("sys", "Parámetros y funciones del sistema"),
    ("tkinter", "Interfaces gráficas de escritorio GUI"),
]

def check_all(auto_install=False):
    print("=" * 70)
    print("      CodeGO ExamGuard - Diagnóstico Completo de Entorno Python")
    print("=" * 70)
    print(f"Intérprete Python: {sys.version.split()[0]} ({sys.executable})")
    print(f"Sistema Operativo: {sys.platform}\n")

    print("[1] Módulos Estándar del Sistema:")
    for mod, desc in STANDARD_MODULES:
        try:
            __import__(mod)
            print(f"  [✓] {mod.ljust(15)} - {desc}")
        except ImportError:
            print(f"  [✗] {mod.ljust(15)} - FALTA")

    print("\n[2] Librerías Recomendadas para Exámenes (Básico a Intermedio):")
    missing = []
    for mod, desc in RECOMMENDED_LIBRARIES:
        try:
            m = __import__(mod)
            ver = getattr(m, "__version__", "instalado")
            print(f"  [✓] {mod.ljust(15)} (v{ver}) - {desc}")
        except ImportError:
            install_name = "pillow" if mod == "PIL" else mod
            print(f"  [✗] {mod.ljust(15)} - NO INSTALADO")
            missing.append(install_name)

    print("\n" + "=" * 70)

    if missing:
        print(f"  Aviso: Se encontraron {len(missing)} librerías faltantes: {', '.join(missing)}")
        if auto_install or "--install-all" in sys.argv:
            print("  Iniciando descarga e instalación automática...")
            for pkg in missing:
                print(f"  -> Instalando {pkg} con pip...")
                subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])
            print("\n  ¡Todas las librerías se han instalado correctamente!")
        else:
            print(f"  Para instalarlas automáticamente ejecuta:")
            print(f"    python3 setup_exam_env.py --install-all")
    else:
        print(f"  ¡EXCELENTE! Las {len(RECOMMENDED_LIBRARIES)} librerías recomendadas están instaladas y listas.")
    print("=" * 70)

if __name__ == "__main__":
    auto = "--install-all" in sys.argv or "-i" in sys.argv
    check_all(auto_install=auto)
