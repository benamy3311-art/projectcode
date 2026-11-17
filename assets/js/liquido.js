/* ═══════════════════════════════════════════════════
   Líquido — el comportamiento del vidrio
   ═══════════════════════════════════════════════════
   - La cabecera se oscurece mientras pasa sobre el escenario de noche.
   - Las superficies de vidrio reciben --mx/--my para el brillo que sigue
     al cursor (solo con mouse; en táctil no hay cursor que seguir).
═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var cab = document.querySelector('.cabecera');
  var esc = document.querySelector('.escenario');
  if (cab && esc && 'IntersectionObserver' in window) {
    var alto = function () { return Math.round(cab.getBoundingClientRect().bottom); };
    var io;
    var observar = function () {
      if (io) io.disconnect();
      io = new IntersectionObserver(function (e) {
        cab.setAttribute('data-tono', e[0].isIntersecting ? 'noche' : 'dia');
      }, { rootMargin: '-' + alto() + 'px 0px -100% 0px' });
      io.observe(esc);
    };
    cab.setAttribute('data-tono', 'noche');
    observar();
    window.addEventListener('resize', observar);
  }

  var SEL = '.vidrio, .vidrio-marco, .tarjeta, .calculadora';
  var ultimo = null, esperando = false;
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    ultimo = e;
    if (esperando) return;
    esperando = true;
    requestAnimationFrame(function () {
      esperando = false;
      var el = ultimo.target.closest && ultimo.target.closest(SEL);
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (ultimo.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--my', (ultimo.clientY - r.top).toFixed(0) + 'px');
    });
  }, { passive: true });
})();

/* Tacto: imágenes que llegan con un fundido y fila de teléfonos que avisa si hay más. */
(function () {
  'use strict';
  document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('llega');
    var listo = function () { (img.decode ? img.decode() : Promise.resolve()).catch(function () {}).then(function () { img.classList.add('llego'); img.classList.remove('llega'); }); };
    img.addEventListener('load', listo, { once: true });
    img.addEventListener('error', function () { img.classList.remove('llega'); }, { once: true });
  });
  var fila = document.querySelector('.moviles-fila');
  if (fila) {
    var revisar = function () { fila.toggleAttribute('data-final', fila.scrollLeft + fila.clientWidth >= fila.scrollWidth - 4); };
    fila.addEventListener('scroll', revisar, { passive: true });
    window.addEventListener('resize', revisar);
    revisar();
  }
})();
