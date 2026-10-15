#!/usr/bin/env bash
# Arma dist/cuartito.zip para subir como release. Los archivos van en la raíz del zip, como pide Lively;
# al descomprimirlo, Windows ya los mete en una carpeta "cuartito" para Wallpaper Engine.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/cuartito.zip
python3 - <<'PY'
import zipfile, pathlib
origen = pathlib.Path("docs")
with zipfile.ZipFile("dist/cuartito.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(origen.rglob("*")):
        # capturas.png es solo para el README
        if f.is_file() and f.name != "capturas.png":
            z.write(f, str(f.relative_to(origen)))
print("dist/cuartito.zip listo")
PY
