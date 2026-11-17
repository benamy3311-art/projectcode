// ════════════════════════════════════════════════════════════════════
// SPEEDLOGIC · NAVEGACIÓN MÓVIL NATIVA
// ────────────────────────────────────────────────────────────────────
// Cablea la barra inferior "liquid glass", la hoja "Más" y la cabecera
// nativa. Reutiliza la navegación existente (switchTab, toggleSidebar,
// openHist, etc.) — no duplica lógica de negocio.
//
// En escritorio/tablet (≥769px) el chrome móvil está oculto por CSS, así
// que estas funciones no tienen efecto visible; solo mantienen el estado
// sincronizado por si la ventana se reduce.
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Título nativo por pantalla (coincide con las pestañas de escritorio)
  var TITLES = {
    q: 'Cotización',
    c: 'Catálogo',
    ven: 'Vender',
    inv: 'Inventario',
    i: 'Calculadora IVA',
    cmp: 'Comparar',
    rem: 'Recogidas',
    cuadre: 'Cuadre de Caja',
    cambios: 'Cambios',
    adminhub: 'Administración',
    pdf: 'Parser PDF',
    admin: 'Usuarios',
    metrics: 'Métricas'
  };

  // Qué destino de la barra inferior queda activo para cada pestaña.
  // Todo lo que no esté aquí resalta "Más".
  var NAV_FOR_TAB = { q: 'q', c: 'c', ven: 'ven' };

  function $(id) { return document.getElementById(id); }

  // ── Sincroniza barra inferior + título de la cabecera ──────────────
  function syncNav(tab) {
    var target = NAV_FOR_TAB[tab] || 'more';
    var items = document.querySelectorAll('.mobnav-item[data-nav]');
    for (var i = 0; i < items.length; i++) {
      var nav = items[i].getAttribute('data-nav');
      items[i].classList.toggle('active', nav === target);
    }
    var title = $('mtbTitle');
    if (title && TITLES[tab]) title.textContent = TITLES[tab];
  }

  // ── Envolver switchTab para reflejar el cambio en el chrome móvil ──
  function wrapSwitchTab() {
    if (typeof window.switchTab !== 'function' || window.switchTab._mobWrapped) return;
    var orig = window.switchTab;
    var wrapped = function (t) {
      var r = orig.apply(this, arguments);
      try { syncNav(t); } catch (e) {}
      return r;
    };
    wrapped._mobWrapped = true;
    window.switchTab = wrapped;
  }

  // ── "Copiar imagen" en móvil: el documento se muestra como tarjetas,
  //    pero la IMAGEN que se envía al cliente debe ser la tabla de siempre.
  //    Añadimos .qexport al #quoteDoc antes de renderizar (desactiva el
  //    layout de tarjetas — ver mobile-app.css) y lo quitamos al terminar.
  function wrapCopyImg() {
    if (typeof window.copyImg !== 'function' || window.copyImg._mobWrapped) return;
    var orig = window.copyImg;
    var wrapped = async function () {
      var isMobile = window.matchMedia('(max-width:768px)').matches;
      var doc = isMobile ? document.getElementById('quoteDoc') : null;
      if (doc) doc.classList.add('qexport');
      try {
        return await orig.apply(this, arguments);
      } finally {
        // html2canvas ya capturó los píxeles cuando orig() resuelve
        if (doc) doc.classList.remove('qexport');
      }
    };
    wrapped._mobWrapped = true;
    window.copyImg = wrapped;
  }

  // ── Banner superior: mientras se muestra, marcamos el body para que el
  //    CSS oculte la cabecera móvil (si no, el banner la tapaba). ─────
  function wrapTopNotice() {
    if (typeof window.showTopNotice === 'function' && !window.showTopNotice._mobWrapped) {
      var origShow = window.showTopNotice;
      var wShow = function () {
        var r = origShow.apply(this, arguments);
        document.body.classList.add('sl-topnotice');
        return r;
      };
      wShow._mobWrapped = true;
      window.showTopNotice = wShow;
    }
    if (typeof window.hideTopNotice === 'function' && !window.hideTopNotice._mobWrapped) {
      var origHide = window.hideTopNotice;
      var wHide = function () {
        var r = origHide.apply(this, arguments);
        document.body.classList.remove('sl-topnotice');
        return r;
      };
      wHide._mobWrapped = true;
      window.hideTopNotice = wHide;
    }
  }

  // ── Acciones de la barra inferior ─────────────────────────────────
  window._mobGo = function (id) {
    closeSheet();
    if (document.querySelector('.sb.open')) { try { closeSidebar(); } catch (e) {} }
    // "Cotización": igual que la pestaña de escritorio (generateQuote+switchTab).
    // Sin esto, #quoteDoc nunca se crea en móvil (la barra inferior solo hacía
    // switchTab) y la cotización se queda en el estado de bienvenida aunque haya
    // productos agregados. generateQuote(true) es silencioso y se auto-protege
    // si el carrito está vacío; una vez creado #quoteDoc, cada nuevo producto
    // ya refresca solo vía _scheduleQuoteRefresh.
    if (id === 'q' && typeof generateQuote === 'function'
        && typeof items !== 'undefined' && items.length) {
      try { generateQuote(true); } catch (e) {}
    }
    try { switchTab(id); } catch (e) {}
  };

  // Botón central "＋ Cotizar": abre/cierra el formulario (cajón lateral)
  window._mobOpenForm = function () {
    closeSheet();
    try { toggleSidebar(); } catch (e) {}
  };

  // ── Hoja "Más" ────────────────────────────────────────────────────
  function openSheet() {
    var sheet = $('mobSheet'), bd = $('mobSheetBackdrop');
    if (!sheet) return;
    refreshSheetVisibility();
    if (bd) bd.classList.add('on');
    // rAF para que la transición de entrada corra desde translateY(105%)
    requestAnimationFrame(function () { sheet.classList.add('on'); });
    if (bd) bd.setAttribute('aria-hidden', 'false');
    sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    var sheet = $('mobSheet'), bd = $('mobSheetBackdrop');
    if (sheet) { sheet.classList.remove('on'); sheet.setAttribute('aria-hidden', 'true'); }
    if (bd) { bd.classList.remove('on'); bd.setAttribute('aria-hidden', 'true'); }
  }

  window._mobToggleSheet = function () {
    var sheet = $('mobSheet');
    if (sheet && sheet.classList.contains('on')) closeSheet(); else openSheet();
  };
  window._mobCloseSheet = closeSheet;

  // Oculta los ítems de la hoja cuyo origen (pestaña/botón) no es visible
  // para el rol actual → espeja el gating de permisos sin duplicar CSS.
  function refreshSheetVisibility() {
    var items = document.querySelectorAll('.mobsheet-item[data-mirror]');
    for (var i = 0; i < items.length; i++) {
      var sel = items[i].getAttribute('data-mirror');
      var src = null;
      try { src = document.querySelector(sel); } catch (e) {}
      var visible = !!src && !isHidden(src);
      if (visible) items[i].removeAttribute('hidden');
      else items[i].setAttribute('hidden', '');
    }
  }

  function isHidden(el) {
    if (!el) return true;
    // offsetParent es null cuando el elemento (o un ancestro) está display:none
    if (el.offsetParent === null) {
      var cs = window.getComputedStyle(el);
      return cs.display === 'none' || cs.visibility === 'hidden';
    }
    return false;
  }

  // ── Despacho de acciones de la hoja ───────────────────────────────
  // act = "tab:<id>"  o  una clave de acción global.
  window._mobSheet = function (act) {
    closeSheet();
    // Deja arrancar la animación de cierre antes de navegar/abrir modales
    setTimeout(function () { dispatch(act); }, 60);
  };

  function dispatch(act) {
    if (act.indexOf('tab:') === 0) {
      var id = act.slice(4);
      try { switchTab(id); } catch (e) {}
      if (id === 'cuadre' && window._mountCuadre) window._mountCuadre();
      if (id === 'cambios' && window.PatchNotes && window.PatchNotes.onOpen) window.PatchNotes.onOpen();
      return;
    }
    switch (act) {
      case 'hist': if (window.openHist) openHist(); break;
      case 'stats': if (window._openVendorStats) _openVendorStats(); break;
      case 'copy': if (window.copyImg) copyImg(); break;
      case 'pdf':
        if (window.closeCurrentQuote) closeCurrentQuote();
        window.print();
        break;
      case 'siigo': if (window.openSiigo) openSiigo(); break;
      case 'lang': if (window._toggleAppLang) _toggleAppLang(); break;
      case 'settings': if (window.openSettings) openSettings(); break;
      case 'logout': if (window._logout) _logout(); break;
    }
  }

  // ── Espejar badges (Recogidas y Historial) al chrome móvil ────────
  function mirrorRemBadge() {
    var src = $('remBadge'), dst = $('mobRemBadge');
    if (!dst) return;
    var show = src && src.style.display !== 'none' && (src.textContent || '').trim() !== '';
    if (show) { dst.textContent = src.textContent; dst.style.display = 'flex'; }
    else dst.style.display = 'none';
  }

  function mirrorHistBadge() {
    var src = $('histBadge'), dst = $('mtbHistBadge');
    if (!dst) return;
    var n = src ? parseInt((src.textContent || '0').trim(), 10) : 0;
    if (n > 0) { dst.textContent = n; dst.style.display = 'flex'; }
    else dst.style.display = 'none';
  }

  function observe(id, cb) {
    var el = $(id);
    if (!el || !window.MutationObserver) return;
    var mo = new MutationObserver(cb);
    mo.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    wrapSwitchTab();
    wrapCopyImg();
    wrapTopNotice();
    syncNav('q');
    mirrorRemBadge();
    mirrorHistBadge();
    observe('remBadge', mirrorRemBadge);
    observe('histBadge', mirrorHistBadge);
    // Cerrar la hoja con Escape (teclados físicos / iPad)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSheet();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
