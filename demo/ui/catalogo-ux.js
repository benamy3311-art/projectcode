// ============================================================
// CATÁLOGO — atajos del buscador (rediseño, paso 3)
// ============================================================
// El buscador es la forma principal de encontrar un producto. Tres
// atajos para que el asesor no suelte el teclado (REDISENO.md):
//   - Al abrir el catálogo con mouse y teclado, el foco va al buscador.
//   - «/» enfoca el buscador desde cualquier lado del catálogo
//     (convención de GitHub, YouTube, Slack).
//   - Enter añade el producto cuando la búsqueda dejó uno solo; Esc
//     borra la búsqueda.
// No cambia ningún comportamiento existente: envuelve switchTab().
//
// Globales que expone (window.*): ninguna nueva (envuelve switchTab)
// Depende de: ui.js (switchTab), services.js (filterCat, addFromCat, filtered)
// Requiere DOM: #catSearch, #panel-c
// ============================================================
(function () {
  var conCursor = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var buscador = function () { return document.getElementById('catSearch'); };
  var enCatalogo = function () { var p = document.getElementById('panel-c'); return p && p.style.display !== 'none' && p.offsetParent !== null; };

  var original = window.switchTab;
  if (typeof original === 'function') {
    window.switchTab = function (t) {
      var r = original.apply(this, arguments);
      if (t === 'c' && conCursor) {
        var b = buscador();
        if (b) setTimeout(function () { b.focus({ preventScroll: true }); b.select(); }, 30);
      }
      return r;
    };
  }

  document.addEventListener('keydown', function (e) {
    var b = buscador();
    if (!b) return;
    var escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if (e.key === '/' && !escribiendo && enCatalogo()) {
      e.preventDefault();
      b.focus(); b.select();
      return;
    }
    if (e.target !== b) return;
    if (e.key === 'Escape' && b.value) {
      e.preventDefault();
      b.value = '';
      if (typeof filterCat === 'function') filterCat();
    }
    if (e.key === 'Enter') {
      // Solo con un resultado: con varios, Enter no adivina cuál quería.
      if (typeof filtered !== 'undefined' && filtered.length === 1 && typeof addFromCat === 'function') {
        e.preventDefault();
        addFromCat(0);
      }
    }
  });
})();
