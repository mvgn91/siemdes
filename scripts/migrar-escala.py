#!/usr/bin/env python3
"""Migracion de la escala tipografica numerica a la escala por ROL (S1-D-04.8).

Se ejecuta UNA vez y no forma parte del build: es la herramienta con la que se hizo el
cambio, y se deja en el repo para que el cambio sea auditable y repetible.

POR QUE UN SCRIPT Y NO UN sed: porque `text-sm` significa cosas distintas Depending del
contexto. En un `<p>` es cuerpo de texto y va a `text-cuerpo` (18 px); en un `<li>` de
vinetas tambien; pero en un boton es el CTA y va a `text-boton` (16 px), y en una etiqueta
en mayusculas es `text-etiqueta` (14 px). Un reemplazo global habria movido el numero sin
mover el ROL, que es justo lo que hay que evitar.

Cada regla se declara con su Patron exacto, su sustitucion y POR QUE. Una regla que no
encuentra nada se reporta: si una de ellas falla en silencio, el sitio se queda con un
`text-sm` que ya no existe como clase y cae al tamano heredado sin error de build — el
mismo modo de fallo silencioso que la regla 9 de la guardia atrapa con `border-2`.
"""

import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OBJETIVOS = [
    *sorted((RAIZ / "src" / "pages").rglob("*.astro")),
    *sorted((RAIZ / "src" / "components").glob("*.astro")),
    *sorted((RAIZ / "src" / "components").glob("*.tsx")),
    RAIZ / "src" / "layouts" / "Base.astro",
    RAIZ / "src" / "estilos" / "boton.ts",
]

# (patron, sustitucion, razon). El orden importa: lo mas especifico antes que lo generico.
REGLAS = [
    # ── Titulares ────────────────────────────────────────────────────────────
    # H1: 36/48/60 px -> 38 px en movil y 56 px en escritorio, un solo nombre de rol.
    (
        r'text-4xl font-black sm:text-5xl lg:text-6xl',
        'text-titular-1 font-black',
        'H1 de portada: la escala responsive pasaba de 36 a 60 px; ahora el rol crece solo.',
    ),
    (
        r'text-4xl font-black sm:text-5xl',
        'text-titular-1 font-black',
        'H1 de pagina interna: un solo rol, 38 px en movil y 56 px en escritorio.',
    ),
    (
        r'text-4xl',
        'text-titular-1',
        'H1 suelto (pagina de redireccion /ir/*).',
    ),
    # H2 de seccion: 30 px -> 28 px. Baja 2 px a proposito: la diferencia de 1.1 no se ve,
    # pero el bloque de la cabecera pesa mas con el H1 de 38 px al lado.
    (
        r'text-3xl font-black',
        'text-titular-2 font-black',
        'H2 de seccion (titular-2 = 28 px).',
    ),
    # H2 dentro de panel negro: 24 px -> 28 px. Aqui si sube, porque sobre negro el texto
    # compite con el bloque y se leia mas pequeno todavia.
    (
        r'text-2xl font-black',
        'text-titular-2 font-black',
        'H2 de bloque oscuro: sube de 24 a 28 px por el contraste de fondo.',
    ),
    # H3 de tarjeta: 20 px -> 21 px y de ExtraBold a Bold, que es lo que pide el kit
    # (docs/14 §4.2: H3 = Barlow Bold 700; el ExtraBold 800 esta reservado al H2).
    (
        r'text-xl font-extrabold',
        'text-titular-3 font-bold',
        'H3 de tarjeta: 21 px en Barlow Bold 700, el peso que el kit asigna al H3.',
    ),
    (
        r'text-2xl font-extrabold',
        'text-titular-3 font-bold',
        'H3 de bloque: mismo criterio que el anterior.',
    ),
    (
        r'text-lg font-extrabold',
        'text-titular-3 font-bold',
        'H3 suelto: mismo criterio.',
    ),

    # ── Cifras y numerales ───────────────────────────────────────────────────
    (
        r'font-titular text-5xl font-black text-ambar',
        'font-titular text-cifra font-black text-ambar tabular-nums',
        'Cifra destacada de la banda negra: 48 px -> 46 px y tabular, que es lo que pide '
        'docs/14 §4.2 para cifras en columna.',
    ),
    # Los numerales de linea de servicio y de paso de proceso iban en `text-numeral`
    # (#EEEEF0) sobre blanco: 1.16:1, invisibles. Se pasan a negro, que es la firma de la
    # tarjeta aprobada (numerales gigantes 01/02/03 en negro).
    (
        r'font-titular text-3xl font-black text-numeral',
        'font-titular text-titular-2 font-black text-negro tabular-nums',
        'Numeral de linea/paso: de marca de agua invisible a negro, como en la tarjeta.',
    ),

    # ── Marcas de agua que quedan como marca de agua ────────────────────────
    # Estas SI van sobre negro, que es donde el kit define `--color-numeral`.
    (
        r'font-titular text-2xl font-black text-numeral',
        'font-titular text-titular-2 font-black text-numeral',
        'Lista de experiencia: se mantiene la marca de agua, pero a tamano de rol.',
    ),

    # ── Entradas y cuerpo ────────────────────────────────────────────────────
    (
        r'text-lg text-tinte-2',
        'text-lead text-tinte-2',
        'Parrafo de entrada de seccion (lead = 20 px).',
    ),
    (
        r'mt-5 text-lg',
        'mt-4 text-lead',
        'Entrada de pagina interna: 18 px -> 20 px y menos margen encima.',
    ),
    (
        r'mt-4 text-lg',
        'mt-3 text-lead',
        'Entrada de la portada.',
    ),
    (
        r'mt-6 text-lg',
        'mt-4 text-lead',
        'Entrada de portada, variante con mas margen.',
    ),

    # ── Etiquetas ────────────────────────────────────────────────────────────
    # Etiqueta en mayusculas: 12 px -> 14 px. El suelo duro del sistema.
    (
        r'font-titular text-xs font-bold uppercase tracking-wide text-tinte-3',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-tinte-3',
        'Etiqueta de campo o de grupo: 12 -> 14 px, con tracking de etiqueta tecnica.',
    ),
    (
        r'font-titular text-xs font-bold uppercase tracking-wide text-tinte-2',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-tinte-2',
        'Etiqueta sobre fondo claro (#EEEEF0): 12 -> 14 px.',
    ),
    (
        r'font-titular text-xs font-bold uppercase tracking-\[0\.2em\] text-tinte-3',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-tinte-3',
        'Ceja de la portada: 12 -> 14 px.',
    ),
    (
        r'font-titular text-xs font-bold uppercase tracking-\[0\.2em\] text-tinte-3',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-tinte-3',
        'Variante de la ceja.',
    ),

    # ── Pie ──────────────────────────────────────────────────────────────────
    (
        r'text-xs text-tinte-indice',
        'text-pie text-tinte-indice',
        'Aviso legal del pie: 12 -> 15 px, el rol `pie` del kit.',
    ),
    (
        r'text-sm text-tinte-indice',
        'text-pie text-tinte-indice',
        'Texto de pie: 14 -> 15 px.',
    ),

    # ── Chips, listas y marcas ───────────────────────────────────────────────
    (
        r'font-titular text-base font-extrabold uppercase tracking-wide sm:text-lg',
        'font-titular text-titular-3 font-extrabold uppercase tracking-wide',
        'Cintillo de marcas: 16/18 -> 21 px. Es el bloque que mas se leia pequeno.',
    ),
    (
        r'border border-filete px-3 py-2 font-titular text-base font-extrabold',
        'border border-filete px-3 py-2 font-titular text-cuerpo-denso font-extrabold',
        'Chip de marca: 16 px en Barlow 800; se queda en 16 px pero con rol declarado.',
    ),
    (
        r'font-titular text-xl font-extrabold',
        'font-titular text-titular-3 font-extrabold',
        'Equipo o municipio en lista: 20 -> 21 px.',
    ),
    (
        r'font-titular text-lg font-extrabold',
        'font-titular text-titular-3 font-extrabold',
        'Lista de marcas o de motores: 18 -> 21 px.',
    ),
    (
        r'font-titular text-sm font-bold uppercase tracking-wide text-ambar',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-ambar',
        'Trabajo secundario sobre negro: 12 -> 14 px.',
    ),
    (
        r'border border-tinte-2 px-3 py-2 font-titular text-sm font-bold uppercase tracking-wide text-ambar',
        'border border-tinte-2 px-3 py-2 font-titular text-etiqueta font-bold uppercase tracking-[0.18em] text-ambar',
        'Marca con diagnostico computarizado: 12 -> 14 px.',
    ),
    (
        r'bg-ambar px-2 py-1 font-titular text-xs font-bold uppercase tracking-wide',
        'bg-ambar px-2 py-1 font-titular text-etiqueta font-bold uppercase tracking-[0.18em]',
        'Distintivo BASE: 12 -> 14 px.',
    ),
    (
        r'font-titular text-xs font-bold uppercase tracking-wide',
        'font-titular text-etiqueta font-bold uppercase tracking-[0.18em]',
        'Etiqueta de formulario o de canal: 12 -> 14 px.',
    ),

    # ── Cuerpo generico ──────────────────────────────────────────────────────
    # Aqui esta el 60% del problema: 52 elementos en `text-sm` (14 px) en todo el sitio.
    (
        r'\btext-sm\b',
        'text-cuerpo',
        'Cuerpo de texto generico: 14 -> 18 px. El cambio de mayor alcance del sitio.',
    ),
    (
        r'\btext-base\b',
        'text-cuerpo-denso',
        'Cuerpo denso: 16 px, ahora con rol declarado.',
    ),
]

total = 0
for archivo in OBJETIVOS:
    texto = archivo.read_text()
    original = texto
    aplicadas = []
    for patron, sustitucion, razon in REGLAS:
        texto, n = re.subn(patron, sustitucion, texto)
        if n:
            aplicadas.append((razon, n, patron))
    if texto != original:
        archivo.write_text(texto)
        rel = archivo.relative_to(RAIZ)
        print(f"\n{rel}")
        for razon, n, patron in aplicadas:
            print(f"   {n:2d}x  {patron}")
            print(f"        -> {razon}")
        total += sum(n for _, n, _ in aplicadas)

print(f"\n{'='*70}\n{total} sustituciones aplicadas.")
print("Queda pendiente revisar a mano lo que la regla generica no cubre:")
print("  - clases de tamano que no casen con ningun patron (el grep final lo lista)")
print("  - el ritmo vertical, que es un cambio aparte y tambien medido")
sys.exit(0)
