// ============================================================
// BARRA DE NAVEGACIÓN (PC) Y ROLES ASESOR / JEFE — Dirección 1
// ============================================================
// En pantallas de 1025 px o más reemplaza la fila de pestañas por una barra
// arriba con los nombres de cada sección (no solo íconos: así cualquiera la
// entiende el primer día). Lo de uso diario va a la vista; lo demás, en
// "Más". Lo que aparece depende del rol (approved_users.rol, leído en
// firebase-auth.js → window._slUserRol):
//   asesor: Chats, Seguimiento, Pagos, Cotizar, Vender + Más
//   jefe y admin: Panel primero, lo mismo, y en Más: Inventario, Cuadre,
//   Mi empresa, Administración
// El formulario de cotización (aside.sb) y la barra de Historial/PDF solo se
// ven en Cotizar; el resto de pantallas usa todo el ancho.
//
// No reemplaza la lógica de pestañas: cada botón hace clic en la pestaña de
// siempre (#tab-x), así se conservan sus permisos y efectos. Un botón solo
// aparece si su pestaña existe y no está oculta (plan, reglas, WhatsApp).
// En celular no hace nada: ahí sigue el chrome de mobile-nav.js.
//
// (El archivo conserva el nombre riel.js y la global Riel por compatibilidad:
// futuro.js, seguimiento.js, pagos.js y mi-empresa.js la usan.)
//
// Globales que expone (window.*):
//   Riel.pintar()     — vuelve a dibujar la barra (p. ej. tras cambiar el plan)
//   Riel.insignias()  — actualiza los contadores
//
// Depende de: ui.js (switchTab, clearAll, openSettings),
//             firebase-auth.js (_slUserRol, _slAuth), domain.js (esc),
//             ui/buscar.js (Buscar.abrir, opcional)
// Requiere DOM: .app, #tab-* de la fila de pestañas
// Estilos: styles/riel.css
// ============================================================
(function () {
  'use strict';

  var PC = window.matchMedia ? window.matchMedia('(min-width: 1025px)') : { matches: true, addEventListener: function () {} };

  var ICO = {
    panel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chats: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
    seguimiento: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/>',
    pagos: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M8.5 15l2 2 4-4"/>',
    cotizar: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h4"/>',
    catalogo: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    vender: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    inventario: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    recogidas: '<path d="M3 7h13v10H3zM16 10h3l2 3v4h-5"/><circle cx="7" cy="18" r="1.6"/><circle cx="17.5" cy="18" r="1.6"/>',
    cuadre: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    empresa: '<path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 9h4a1 1 0 011 1v11M2 21h20M8 8h3M8 12h3M8 16h3"/>',
    admin: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"/>',
    iva: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/>',
    comparar: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
    cambios: '<path d="M9 2h6a1 1 0 011 1v1h1a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1z"/><path d="M9 12h6M9 16h4"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    abajo: '<path d="M6 9l6 6 6-6"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>'
  };

  // [vista, ícono, texto, quién la ve, dónde: 'barra' | 'mas']
  // Quién: 'todos' · 'venta' (asesor y jefe) · 'asesor' · 'jefe' (jefe y
  // admin) · 'bodega' (solo el encargado de bodega). Cada rol tiene su
  // pantalla: el asesor vende, el dueño mira el negocio, bodega cuida el
  // inventario.
  var ITEMS = [
    ['jefe', 'panel', 'Panel', 'jefe', 'barra'],
    ['bodega', 'inventario', 'Bodega', 'bodega', 'barra'],
    ['inv', 'inventario', 'Inventario', 'bodega', 'barra'],
    ['rem', 'recogidas', 'Recogidas', 'bodega', 'barra'],
    ['c', 'catalogo', 'Catálogo', 'bodega', 'barra'],
    ['wa', 'chats', 'Chats', 'venta', 'barra'],
    ['seg', 'seguimiento', 'Seguimiento', 'venta', 'barra'],
    ['pagos', 'pagos', 'Pagos', 'venta', 'barra'],
    ['q', 'cotizar', 'Cotizar', 'venta', 'barra'],
    ['ven', 'vender', 'Vender', 'venta', 'barra'],
    ['jefe', 'panel', 'Mi panel', 'asesor', 'barra'],
    ['c', 'catalogo', 'Catálogo', 'venta', 'mas'],
    ['bodega', 'inventario', 'Bodega', 'jefe', 'mas'],
    ['inv', 'inventario', 'Inventario', 'jefe', 'mas'],
    ['rem', 'recogidas', 'Recogidas', 'venta', 'mas'],
    ['supervision', 'chats', 'Supervisar chats', 'jefe', 'mas'],
    ['cuadre', 'cuadre', 'Cuadre de caja', 'jefe', 'mas'],
    ['empresa', 'empresa', 'Mi empresa', 'jefe', 'mas'],
    ['adminhub', 'admin', 'Administración', 'jefe', 'mas'],
    ['i', 'iva', 'Calculadora IVA', 'todos', 'mas'],
    ['cmp', 'comparar', 'Comparar', 'todos', 'mas'],
    ['cambios', 'cambios', 'Cambios de precios', 'todos', 'mas']
  ];
  var SIN_PESTANA = ['jefe', 'seg', 'empresa', 'pagos', 'supervision', 'bodega'];

  var _nav = null;
  var _masAbierto = false;
  var _inicioPuesto = false;

  function rol() { return window._slUserRol || ''; }
  function esJefe() { return rol() === 'jefe' || rol() === 'admin'; }
  function esc2(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }

  function svg(n, cls) {
    return '<svg class="' + (cls || 'barra-ico') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>';
  }

  // ¿La pestaña original se puede usar? (existe y nadie la escondió por plan,
  // por reglas o porque WhatsApp aún no está activo)
  function pestanaDisponible(vista) {
    if (vista === 'jefe') return !!rol() && rol() !== 'bodega';
    if (vista === 'bodega') return (esJefe() || rol() === 'bodega') && !!window.Bodega;
    if (vista === 'seg') return !!window.Seguimiento;
    if (vista === 'empresa') return esJefe() && !!window.MiEmpresa;
    if (vista === 'pagos') return !!window.Pagos && !!rol() && !window._slUserIsLite;
    if (vista === 'supervision') return esJefe() && !!window.Supervisar && pestanaDisponible('wa');
    // La calculadora de IVA sobra si la empresa no cobra IVA (Mi empresa).
    if (vista === 'i' && typeof window.cobraIva === 'function' && !window.cobraIva()) return false;
    var t = document.getElementById('tab-' + vista);
    if (!t || t.hidden) return false;
    var cs = window.getComputedStyle(t);
    // En PC la fila .tabs está oculta por riel.css: se mira la regla propia
    // de la pestaña, no si se ve en pantalla.
    return t.style.display !== 'none' && cs.display !== 'none';
  }

  function visibles() {
    var r = rol();
    return ITEMS.filter(function (it) {
      var quien = it[3];
      if (quien === 'jefe' && !esJefe()) return false;
      if (quien === 'asesor' && (esJefe() || r === 'bodega')) return false;
      if (quien === 'venta' && r === 'bodega') return false;
      if (quien === 'bodega' && r !== 'bodega') return false;
      // inventario: para bodega va con el resto; para el jefe va en Más
      if (it[0] === 'inv' && quien === 'bodega' && r !== 'bodega') return false;
      return pestanaDisponible(it[0]);
    });
  }

  function iniciales() {
    var u = window._slAuth && window._slAuth.currentUser;
    var n = (u && (u.displayName || u.email)) || '';
    var p = String(n).trim().split(/[\s@._-]+/).filter(Boolean);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }
  function nombreRol() { return rol() === 'admin' ? 'Administrador' : rol() === 'jefe' ? 'Jefe' : rol() === 'bodega' ? 'Bodega' : 'Asesor'; }

  function marca() {
    var t = document.getElementById('sidebarBrandText');
    var logo = document.getElementById('sidebarLogo');
    var nombre = (t && t.textContent.trim()) || 'ProjectCode';
    var img = logo && logo.getAttribute('src') && logo.style.display !== 'none' ? logo.getAttribute('src') : '';
    return (img && /^(https:|data:image\/|assets\/)/.test(img) ? '<img class="barra-logo" src="' + esc2(img) + '" alt="">' : '<span class="barra-orbe" aria-hidden="true"></span>')
      + '<b>' + esc2(nombre) + '</b>';
  }

  function badge(vista) {
    if (vista === 'wa') return '<span class="barra-n" data-riel-badge="wa" hidden></span>';
    if (vista === 'seg') return '<span class="barra-n barra-n-suave" data-riel-badge="seg" hidden></span>';
    if (vista === 'pagos') return '<span class="barra-n barra-n-suave" data-riel-badge="pagos" hidden></span>';
    if (vista === 'rem') return '<span class="barra-n barra-n-suave" data-riel-badge="rem" hidden></span>';
    return '';
  }

  function pintar() {
    if (!_nav) return;
    var lista = visibles();
    var enBarra = lista.filter(function (it) { return it[4] === 'barra'; });
    var enMas = lista.filter(function (it) { return it[4] === 'mas'; });
    var activa = document.body.getAttribute('data-vista') || 'q';
    var activaEnMas = enMas.filter(function (it) { return it[0] === activa; })[0];

    var html = '<div class="barra-marca">' + marca() + '</div>'
      + '<div class="barra-nav" role="navigation" aria-label="Secciones">';
    enBarra.forEach(function (it) {
      html += '<button type="button" class="barra-btn" data-vista="' + it[0] + '">' + esc2(it[2]) + badge(it[0]) + '</button>';
    });
    if (enMas.length) {
      html += '<button type="button" class="barra-btn barra-mas' + (activaEnMas ? ' on' : '') + '" data-accion="mas" aria-haspopup="true" aria-expanded="' + _masAbierto + '">'
        + esc2(activaEnMas ? activaEnMas[2] : 'Más') + svg('abajo', 'barra-flecha') + '</button>';
    }
    html += '</div>';
    if (enMas.length) {
      html += '<div class="barra-menu" role="menu"' + (_masAbierto ? '' : ' hidden') + '>'
        + enMas.map(function (it) {
          return '<button type="button" role="menuitem" class="barra-menu-item' + (it[0] === activa ? ' on' : '') + '" data-vista="' + it[0] + '">' + svg(it[1]) + '<span>' + esc2(it[2]) + '</span>' + (it[0] === 'rem' ? badge('rem') : '') + '</button>';
        }).join('') + '</div>';
    }
    html += '<button type="button" class="barra-buscar" data-accion="buscar" aria-label="Buscar cliente, producto o venta (Ctrl K)">' + svg('buscar') + '<span>Buscar cliente, producto o venta</span><kbd>Ctrl K</kbd></button>'
      // Bodega no cotiza: su acción principal es registrar lo que llega
      + (rol() === 'bodega' ? '<button type="button" class="barra-nueva" data-accion="ingreso">Registrar ingreso</button>' : '<button type="button" class="barra-nueva" data-accion="nueva">Nueva cotización</button>')
      + '<button type="button" class="barra-ajustes" data-accion="ajustes" aria-label="Configuración" title="Configuración">' + svg('ajustes') + '</button>'
      + '<button type="button" class="barra-yo" data-accion="ajustes" aria-label="' + esc2(nombreRol()) + '" title="' + esc2(nombreRol()) + '"><span>' + esc2(iniciales()) + '</span></button>';
    _nav.innerHTML = html;
    marcarActiva(activa);
    copiarInsignias();
  }

  function marcarActiva(vista) {
    if (!_nav) return;
    var bs = _nav.querySelectorAll('.barra-nav .barra-btn[data-vista]');
    var alguna = false;
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-vista') === vista;
      if (on) alguna = true;
      bs[i].classList.toggle('on', on);
      if (on) bs[i].setAttribute('aria-current', 'page'); else bs[i].removeAttribute('aria-current');
    }
    var mas = _nav.querySelector('.barra-mas');
    if (mas) {
      var it = ITEMS.filter(function (x) { return x[0] === vista && x[4] === 'mas'; })[0];
      mas.classList.toggle('on', !alguna && !!it);
      var txt = mas.firstChild;
      if (txt && txt.nodeType === 3) txt.nodeValue = !alguna && it ? it[2] : 'Más';
    }
    var items = _nav.querySelectorAll('.barra-menu-item');
    for (var j = 0; j < items.length; j++) items[j].classList.toggle('on', items[j].getAttribute('data-vista') === vista);
  }

  // Los contadores de chats y recogidas los mantienen sus módulos en la fila
  // de pestañas (#waBadge, #remBadge); Seguimiento y Pagos dan el suyo.
  function copiarInsignias() {
    if (!_nav) return;
    var poner = function (clave, n) {
      var els = _nav.querySelectorAll('[data-riel-badge="' + clave + '"]');
      for (var i = 0; i < els.length; i++) { els[i].hidden = !n; els[i].textContent = n ? (n > 99 ? '99+' : String(n)) : ''; }
    };
    [['wa', 'waBadge'], ['rem', 'remBadge']].forEach(function (par) {
      var src = document.getElementById(par[1]);
      var txt = src ? String(src.textContent || '').trim() : '';
      var visible = !!src && !src.hidden && src.style.display !== 'none' && txt !== '' && txt !== '0';
      poner(par[0], visible ? (parseInt(txt, 10) || txt) : 0);
    });
    if (window.Seguimiento) poner('seg', window.Seguimiento.contar());
    if (window.Pagos) poner('pagos', window.Pagos.contar());
  }

  function ir(vista) {
    cerrarMas();
    if (SIN_PESTANA.indexOf(vista) >= 0) { switchTab(vista); return; }
    var t = document.getElementById('tab-' + vista);
    if (t) t.click(); else switchTab(vista);
  }

  function abrirMas() {
    _masAbierto = true;
    var m = _nav.querySelector('.barra-menu'), b0 = _nav.querySelector('.barra-mas');
    if (m && b0) { var r = b0.getBoundingClientRect(), rn = _nav.getBoundingClientRect(); m.style.left = Math.round(r.left - rn.left) + 'px'; }
    if (m) m.hidden = false; var b = _nav.querySelector('.barra-mas'); if (b) b.setAttribute('aria-expanded', 'true'); var p = m && m.querySelector('.barra-menu-item'); if (p) p.focus(); }
  function cerrarMas() { _masAbierto = false; if (!_nav) return; var m = _nav.querySelector('.barra-menu'); if (m) m.hidden = true; var b = _nav.querySelector('.barra-mas'); if (b) b.setAttribute('aria-expanded', 'false'); }

  // Primera pantalla según el rol, una sola vez por sesión y solo en PC:
  // el jefe abre su panel; el asesor, los chats si WhatsApp está activo.
  function ponerInicio() {
    if (_inicioPuesto || !PC.matches) return;
    _inicioPuesto = true;
    if (esJefe()) { ir('jefe'); return; }
    if (rol() === 'bodega') { setTimeout(function () { if (window.Bodega) ir('bodega'); }, 300); return; }
    setTimeout(function () { if (pestanaDisponible('wa')) ir('wa'); }, 900);
  }

  function montar() {
    var app = document.querySelector('.app');
    if (!app || _nav) return;
    _nav = document.createElement('header');
    _nav.className = 'riel barra';
    app.insertBefore(_nav, app.firstChild);
    document.body.classList.add('con-riel');
    if (!document.body.getAttribute('data-vista')) document.body.setAttribute('data-vista', 'q');

    _nav.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vista],[data-accion]');
      if (!b) return;
      var acc = b.getAttribute('data-accion');
      if (acc === 'mas') { if (_masAbierto) cerrarMas(); else abrirMas(); return; }
      if (acc === 'ajustes') { cerrarMas(); if (window.openSettings) openSettings(); return; }
      if (acc === 'buscar') { cerrarMas(); if (window.Buscar) window.Buscar.abrir(); return; }
      if (acc === 'ingreso') { cerrarMas(); if (window.Bodega) window.Bodega.abrir('ingresos'); return; }
      if (acc === 'nueva') {
        cerrarMas();
        // Nueva cotización: la actual ya quedó en el historial (se guarda
        // sola); Cotizar queda limpio y con el cursor en el cliente.
        if (typeof items !== 'undefined' && items.length && typeof clearAll === 'function') { clearAll(); if (window.showToast) showToast('La cotización anterior quedó en el historial', 'success'); }
        ir('q');
        setTimeout(function () { var c = document.getElementById('cliente'); if (c) c.focus(); }, 350);
        return;
      }
      ir(b.getAttribute('data-vista'));
    });
    document.addEventListener('click', function (e) { if (_masAbierto && _nav && !_nav.contains(e.target)) cerrarMas(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && _masAbierto) { cerrarMas(); var b = _nav.querySelector('.barra-mas'); if (b) b.focus(); } });

    // Las insignias y la visibilidad de las pestañas cambian solas
    // (mensajes nuevos, WhatsApp que se activa, plan): repintar con calma.
    var pend = null;
    var obs = new MutationObserver(function () {
      if (pend) return;
      pend = setTimeout(function () { pend = null; if (!_masAbierto) pintar(); else copiarInsignias(); }, 250);
    });
    var tabs = document.querySelector('.tabs');
    if (tabs) obs.observe(tabs, { subtree: true, attributes: true, attributeFilter: ['hidden', 'style'], childList: true, characterData: true });
    var marcaTxt = document.getElementById('sidebarBrandText');
    if (marcaTxt) obs.observe(marcaTxt, { childList: true, characterData: true, subtree: true });

    pintar();
    // Varias pestañas aparecen después del login (WhatsApp, Cuadre, Admin)
    // y no siempre con un cambio que el observador alcance a ver.
    setTimeout(pintar, 1500);
    setTimeout(pintar, 5000);
  }

  // switchTab: además de lo de siempre, deja la vista en <body data-vista>
  // (riel.css esconde el formulario fuera de Cotizar) y marca el botón.
  if (typeof window.switchTab === 'function' && !window.switchTab._riel) {
    var original = window.switchTab;
    var envuelta = function (t) {
      var r = original.apply(this, arguments);
      var activa = document.querySelector('.tabs .tab.active');
      var vista = t;
      // Vistas sin pestaña propia (jefe, seg, empresa, pagos): la vista es la pedida.
      if (document.getElementById('tab-' + t) && activa && activa.id && activa.id.indexOf('tab-') === 0) vista = activa.id.slice(4);
      if (t === 'jefe' && rol()) vista = 'jefe';
      document.body.setAttribute('data-vista', vista);
      marcarActiva(vista);
      return r;
    };
    envuelta._riel = true;
    window.switchTab = envuelta;
  }

  document.addEventListener('sl:rol', function () { pintar(); ponerInicio(); });
  document.addEventListener('sl:empresa', function () { pintar(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();

  window.Riel = { pintar: pintar, insignias: copiarInsignias };
})();
