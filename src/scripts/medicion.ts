// Medicion de clics a contacto — S1-D-06.3 / S1-G-02
//
// Un solo mecanismo para TODO el sitio: los enlaces de contacto llevan data-cta="wa-<lugar>"
// (cabecera, hero, cierre, pie, flotante, isla de contacto) y este script escucha por
// delegacion. Asi no hay que enganchar un manejador por boton, ni tocar las paginas cuando
// se agregue GA4: solo se carga gtag y los eventos empiezan a salir.
//
// GA4 todavia NO esta instalado (falta el aviso de privacidad, B-05). Por eso, si `gtag`
// no existe, el script no hace nada: ni error, ni carga, ni dato.

interface ConGtag extends Window {
  gtag?: (comando: string, nombre: string, parametros: Record<string, string>) => void;
}

document.addEventListener('click', (evento) => {
  const objetivo = evento.target;
  if (!(objetivo instanceof Element)) return;

  const enlace = objetivo.closest('[data-cta]');
  if (!enlace) return;

  const identificador = enlace.getAttribute('data-cta') ?? 'sin-identificador';
  const gtag = (window as ConGtag).gtag;
  if (typeof gtag !== 'function') return;

  gtag('event', 'clic_contacto', {
    identificador,
    canal: identificador.includes('wa-') ? 'whatsapp' : 'otro',
    // Astro.url no existe en el navegador: la ruta se toma del propio documento.
    pagina: window.location.pathname,
  });
});
