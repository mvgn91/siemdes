// Sección activa del menú del header — R05.7 y R05.28 (D-D, landing única)
//
// Un solo mecanismo para TODO el sitio, como `medicion.ts`. En la landing marca el item de
// la sección en la que se está: el header deja de ser una lista de enlaces y pasa a ser el
// ÍNDICE del sitio (R05.28, orden del operador: "que sobre el menú ya existente se vea como
// SOLICITAR DIAGNÓSTICO… estoy en contacto y ahí se vería la tarjeta amarilla"). El marcado
// de esa tarjeta —ámbar con texto negro— vive en `marca.css` (`.seccion-activa`); aquí solo
// se decide QUÉ item se marca.
//
// Tres cosas que la versión anterior de R05.7 no hacía y sí hacía falta:
//
//  1. El mapa era `id -> un enlace`, y los anchors se repiten en el nav de escritorio y en el
//     desplegable móvil: el móvil escribía encima del de escritorio y en desktop no se
//     marcaba nada. Aquí cada id guarda TODOS sus enlaces.
//  2. Solo escuchaba las ENTRADAS del IntersectionObserver, así que al subir por encima de la
//     primera sección no llegaba ninguna y el menú se quedaba marcando la última sección
//     visitada. Ahora el estado se recalcula desde las posiciones reales en cada scroll: con
//     cinco secciones es lo mismo de barato y no puede quedar pegado.
//  3. Arriba del todo, en el hero, no hay ninguna sección todavía. Ahí marca "Inicio",
//     que es la sección en la que se está de verdad, y que el servidor ya había marcado
//     igual: sin JS el estado inicial es correcto y no hay que reconstruirlo a mano.
//
// El valor de `aria-current` es `page` (no `true`) porque es el que usa el servidor y el que
// exige la guardia (regla 12): el visitante tiene que poder saber en qué sección está sin
// depender del color.
//
// Sin JS los anchors saltan igual y no hay estado que marcar: el resaltado es mejora, no
// función.

/** id de sección -> enlaces que la llevan (uno en escritorio, otro en el desplegable móvil). */
const ANCLAS = new Map<string, HTMLAnchorElement[]>();
/** El item "Inicio" (`/`), que es la sección activa cuando aún no se ha entrado en ninguna. */
const INICIO: HTMLAnchorElement[] = [];

for (const enlace of document.querySelectorAll<HTMLAnchorElement>('header nav a')) {
  const href = enlace.getAttribute('href') ?? '';
  if (href === '/') {
    INICIO.push(enlace);
    continue;
  }
  if (!href.startsWith('/#')) continue;
  const id = href.slice(2);
  if (!id || !document.getElementById(id)) continue;
  enlace.dataset.seccion = id;
  ANCLAS.set(id, [...(ANCLAS.get(id) ?? []), enlace]);
}

// R05.29: la 02 Maquinaria ya tiene item (`NAVEGACION`), así que se marca como las demás.
// Antes no se podía marcar y por eso el filtro de abajo; ahora el filtro es solo el mapa
// `id -> enlaces`, que se arma de `NAVEGACION` y no depende de cuántas secciones haya.
if (window.location.pathname === '/' && (ANCLAS.size > 0 || INICIO.length > 0)) {
  const cabecera = document.querySelector('header');
  const secciones = [...document.querySelectorAll<HTMLElement>('main section')].filter(
    (seccion) => seccion.id && ANCLAS.has(seccion.id),
  );

  const marcar = (id: string | null) => {
    for (const enlace of INICIO) {
      const es = id === null;
      enlace.classList.toggle('seccion-activa', es);
      if (es) enlace.setAttribute('aria-current', 'page');
      else enlace.removeAttribute('aria-current');
    }
    for (const [clave, enlaces] of ANCLAS) {
      const es = clave === id;
      for (const enlace of enlaces) {
        enlace.classList.toggle('seccion-activa', es);
        if (es) enlace.setAttribute('aria-current', 'page');
        else enlace.removeAttribute('aria-current');
      }
    }
  };

  // La línea de lectura es el borde de abajo de la cabecera (más un pelo): la sección que la
  // haya cruzado es la que se está leyendo, y el contenido se lee por debajo de la cabecera.
  let pendiente = 0;
  const recalcular = () => {
    pendiente = 0;
    const linea = (cabecera?.offsetHeight ?? 0) + 12;
    let actual: string | null = null;
    for (const seccion of secciones) {
      if (seccion.getBoundingClientRect().top <= linea) actual = seccion.id;
    }
    marcar(actual);
  };
  const alDesplazar = () => {
    if (pendiente === 0) pendiente = requestAnimationFrame(recalcular);
  };

  addEventListener('scroll', alDesplazar, { passive: true });
  addEventListener('resize', alDesplazar);
  recalcular();
}
