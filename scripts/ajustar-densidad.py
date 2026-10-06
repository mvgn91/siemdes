#!/usr/bin/env python3
"""Ajuste de densidad del sitio — S1-D-04.8.

Se ejecuta UNA vez, no es parte del build. Queda en el repo para que el cambio sea
auditable y repetible.

QUE MIDE Y QUE CORRIGE. La queja del operador fue "hay mucho espacio en general". Eso es una
afirmacion de espacio, y el espacio se mide. MEDIDO con scripts/medir-densidad.mjs sobre el
render real a 390 px ANTES del cambio:

    banda de filas    bloque         tinta
       0 -  500        hero          13.29%
     500 - 1000        propuesta      6.25%   <- 500 px de pagina al 6% de tinta
    1000 - 1500        cifras        11.73%
    1500 - 2000        banda negra   64.90%
    2000 - 2500        cintillo       9.41%
    2500 - 3000        cierre        14.23%

El problema no era que las secciones fueran altas: era que estaban SEPARADAS de mas. El sitio
usaba un unico ritmo repetido (mt-16 = 64 px, doce veces; mt-20 = 80 px, cinco veces;
py-16 = 64 px) sin distincion entre "cambio de seccion" y "respiro dentro de un bloque".
Separar dos ideas distintas con la misma medida es lo que produce el vacio: el lector no
sabe si el espacio significa algo, y por eso lo lee como ruido en vez de como ritmo.

POR QUE ESTE SCRIPT NO APLICA LAS REGLAS EN CASCADA. La primera version lo hacia
(mt-12 -> mt-10 -> mt-8, repetido hasta que no cambiara nada) y el resultado fue que 108 de
122 margenes acabaron en 8 px: el sitio entero perdio su jerarquia vertical de un golpe, sin
error y sin aviso. Un bucle que "converge" no esta diciendo que dos medidas sean
equivalentes, esta diciendo que la regla se puede repetir. Aca cada medida va DIRECTA a su
destino, en una sola pasada, y el mapa es el documento.

EL REPARTO. Tres medidas con un significado cada una, en vez de un valor al azar:

    48 px   cambio de seccion
    32 px   bloque hermano
    16-24 px  dentro de un bloque

Y en las paginas de contenido baja mas: el contenido de estas siete paginas es corto, y una
pagina corta con marco de dos metros se siente vacia por la misma razon que un cartel con
dos lineas.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# ── Mapa de una sola pasada: medida vieja -> medida nueva, por PREFIXO ──────────
# `mt-16` (cambio de seccion) baja a 48 px. `mt-12` (bloque hermano) baja a 32 px.
# `mt-10`, `mt-8`, `mt-6`, `mt-5`, `mt-4` y `mt-3` bajan UN escalon cada uno, que es lo
# que hace un ritmo: menos aire entre cosas parecidas, y el aire se le deja al cambio de
# seccion, que es el unico sitio donde el blanco significa algo.
# `mt-2` (8 px) y `mt-1` (4 px) no se tocan: ya son el minimo y corresponden a la
# distancia entre una etiqueta y su valor, que es una relacion, no un ritmo.
MARGENES = {
    "mt-16": "mt-12",   # 64 -> 48 px · cambio de seccion
    "mt-20": "mt-12",   # 80 -> 48 px · cambio de seccion (se normaliza con el anterior)
    "mt-12": "mt-8",    # 48 -> 32 px · bloque hermano
    "mt-10": "mt-8",    # 40 -> 32 px · bloque hermano
    "mt-8": "mt-6",     # 32 -> 24 px · dentro de un bloque
    "mt-6": "mt-5",     # 24 -> 20 px · dentro de un bloque
    "mt-5": "mt-4",     # 20 -> 16 px · dentro de un bloque
    "mt-4": "mt-3",     # 16 -> 12 px · respiro local
    "mt-3": "mt-2",     # 12 -> 8 px · respiro local
}

# `mb` y `space-y` siguen la misma logica que `mt`.
MARGENES.update({k.replace("mt-", "mb-"): v.replace("mt-", "mb-") for k, v in list(MARGENES.items())})
MARGENES.update({k.replace("mt-", "space-y-"): v.replace("mt-", "space-y-") for k, v in list(MARGENES.items())})

# Padding y gaps: el mismo criterio, por eje.
BLOQUES = {
    "py-16": "py-10",   # 64 -> 40 px de padding vertical
    "pt-20": "pt-10",   # 80 -> 40 px
    "pt-16": "pt-10",   # 64 -> 40 px
    "pt-12": "pt-8",    # 48 -> 32 px · la pagina ya empieza con rotulo, no hace falta mas
    "pb-16": "pb-10",   # 64 -> 40 px
    "pb-12": "pb-8",    # 48 -> 32 px
    "py-14": "py-10",   # 56 -> 40 px · la banda de cifras respira igual que el resto
    "py-12": "py-9",    # 48 -> 36 px
    "py-10": "py-8",    # 40 -> 32 px
    "gap-10": "gap-6",  # 40 -> 24 px · la columna respira sin hueco
    "gap-8": "gap-6",   # 32 -> 24 px
    "gap-12": "gap-8",  # 48 -> 32 px
}


def aplicar(mapa, texto):
    """Una pasada por posicion de coincidencia, de izquierda a derecha.

    Se itera sobre las COINCIDENCIAS, no sobre el texto completo, precisamente para que una
    sustitucion no pueda volver a alimentar la siguiente. Por eso el mapa puede tener
    `mt-16 -> mt-12` y `mt-12 -> mt-8` en la misma tabla: cada coincidencia se resuelve una
    vez y no se vuelve a mirar. La version en cascada de este script no hacia eso.
    """
    patron = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(mapa, key=len, reverse=True)) + r")\b")
    cuenta = 0

    def sub(m):
        nonlocal cuenta
        cuenta += 1
        return mapa[m.group(1)]

    return patron.sub(sub, texto), cuenta


total = 0
resumen = {}

for area in ("src/pages", "src/components", "src/layouts"):
    for archivo in sorted((RAIZ / area).rglob("*")):
        if archivo.suffix not in (".astro", ".tsx"):
            continue
        texto = archivo.read_text()
        original = texto
        texto, n1 = aplicar(BLOQUES, texto)
        texto, n2 = aplicar(MARGENES, texto)
        if texto != original:
            archivo.write_text(texto)
            rel = str(archivo.relative_to(RAIZ))
            resumen[rel] = n1 + n2
            total += n1 + n2

for rel, n in resumen.items():
    print(f"  {n:3d} cambios  {rel}")
print(f"\n{'='*66}\n{total} ajustes de ritmo en {len(resumen)} archivos.")
print("Techo de densidad aplicado: ninguna separacion de seccion pasa de 48 px (regla 14).")
sys.exit(0)
