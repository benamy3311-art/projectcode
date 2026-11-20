// ============================================================
// CAPA "FUTURO" (PC): fluidez entre secciones
// ============================================================
// - Píldora de la barra que viaja de una sección a otra.
// - Relevo suave al cambiar de sección (View Transitions, donde existe).
//   Solo cuando el cambio sale de un clic o un toque: lo que se lanza con el
//   teclado cambia al instante (TACTO.md §3).
// Estilos: styles/futuro.css. Se carga al final: envuelve el switchTab que
// ya envolvieron riel.js, seguimiento.js, mi-empresa.js y panel-jefe.js.
//
// Depende de: riel.js (.barra-nav, .barra-btn.on), ui.js (switchTab)
// ============================================================
(function () {
  'use strict';

  var PC = window.matchMedia ? window.matchMedia('(min-width: 1025px)') : { matches: true };
  var reducido = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  // ── Píldora de la barra ──────────────────────────────────
  // La sección activa lleva una píldora en tinta que viaja de un botón a otro
  // (muelle medio). Si la barra se redibuja, sale desde donde estaba.
  var _x = null, _w = null;

  function colocarIndicador() {
    var nav = document.querySelector('.barra .barra-nav');
    if (!nav) return;
    var on = nav.querySelector('.barra-btn.on');
    var ind = nav.querySelector('.barra-ind');
    if (!on) { if (ind) ind.classList.remove('listo'); return; }
    if (!ind) {
      ind = document.createElement('span');
      ind.className = 'barra-ind';
      ind.setAttribute('aria-hidden', 'true');
      nav.insertBefore(ind, nav.firstChild);
      nav.classList.add('con-ind');
      if (_x !== null) { ind.style.transition = 'none'; ind.style.width = _w + 'px'; ind.style.transform = 'translateX(' + _x + 'px)'; void ind.offsetWidth; ind.style.transition = ''; }
    }
    var x = on.offsetLeft, w = on.offsetWidth;
    if (_x === null || reducido()) { ind.style.transition = 'none'; ind.style.width = w + 'px'; ind.style.transform = 'translateX(' + x + 'px)'; void ind.offsetWidth; ind.style.transition = ''; }
    else { ind.style.width = w + 'px'; ind.style.transform = 'translateX(' + x + 'px)'; }
    _x = x; _w = w;
    ind.classList.add('listo');
  }

  function vigilarRiel() {
    var barra = document.querySelector('.barra');
    if (!barra) { setTimeout(vigilarRiel, 300); return; }
    var pend = false;
    new MutationObserver(function () {
      if (pend) return;
      pend = true;
      requestAnimationFrame(function () { pend = false; colocarIndicador(); });
    }).observe(barra, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    colocarIndicador();
    window.addEventListener('resize', colocarIndicador);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(colocarIndicador);
  }

  // ── Relevo entre secciones ───────────────────────────────
  var _ultimoPuntero = 0;
  document.addEventListener('pointerdown', function () { _ultimoPuntero = Date.now(); }, true);

  if (typeof window.switchTab === 'function' && document.startViewTransition) {
    var original = window.switchTab;
    var envuelta = function (t) {
      var self = this, args = arguments;
      var vista = document.body.getAttribute('data-vista');
      var desdePuntero = Date.now() - _ultimoPuntero < 800;
      if (!PC.matches || reducido() || !desdePuntero || vista === t || document.hidden) return original.apply(self, args);
      var r;
      document.startViewTransition(function () { r = original.apply(self, args); });
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigilarRiel);
  else vigilarRiel();
})();
