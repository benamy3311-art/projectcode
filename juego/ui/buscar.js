// ============================================================
// BUSCADOR GLOBAL (Ctrl K / Cmd K)
// ============================================================
// Un solo lugar para encontrar cualquier cosa sin saber en qué pantalla
// está: un cliente (por nombre, cédula o celular), su chat, una cotización
// (por número o cliente), un producto (con sus existencias) o una sección.
// Enter hace lo obvio con cada cosa:
//   chat → lo abre · cotización → la carga en Cotizar · producto → lo agrega
//   a la cotización · cliente → empieza una venta con él · sección → va.
// Flechas para moverse, Esc para cerrar.
//
// Globales que expone (window.*):
//   Buscar.abrir(texto?)
//
// Depende de: whatsapp-inbox.js (WaInbox), services.js (getHist, loadHist,
//             quoteDisplayNum, fmtCOP, addItem), state.js (CATALOG, S),
//             ui/tienda-app.js (TiendaApp.db), ui/vender.js (TiendaVender),
//             ui/existencias.js (Existencias), ui.js (switchTab)
// Estilos: styles/buscar.css
// ============================================================
(function () {
  'use strict';

  var _caja = null, _res = [], _i = 0, _antesFoco = null;

  var SECCIONES = [
    ['wa', 'Chats'], ['seg', 'Seguimiento'], ['pagos', 'Pagos'], ['q', 'Cotizar'], ['ven', 'Vender'],
    ['c', 'Catálogo'], ['inv', 'Inventario'], ['rem', 'Recogidas'], ['cuadre', 'Cuadre de caja'],
    ['jefe', 'Panel del jefe'], ['empresa', 'Mi empresa'], ['i', 'Calculadora IVA'], ['cambios', 'Cambios de precios']
  ];

  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }

  // Todas las palabras tienen que aparecer (en cualquier orden).
  function coincide(texto, q) {
    var t = norm(texto);
    return norm(q).split(/\s+/).filter(Boolean).every(function (w) { return t.indexOf(w) >= 0; });
  }

  function buscar(q) {
    q = String(q || '').trim();
    var out = [];
    var qd = digitos(q);
    var empieza = q.length >= 2;

    // Secciones (también con la caja vacía: es la forma rápida de ir)
    SECCIONES.forEach(function (s) {
      var disponible = s[0] === 'seg' ? !!window.Seguimiento : s[0] === 'pagos' ? !!window.Pagos : s[0] === 'empresa' ? !!window.MiEmpresa && ['jefe', 'admin'].indexOf(window._slUserRol) >= 0 : s[0] === 'jefe' ? ['jefe', 'admin'].indexOf(window._slUserRol) >= 0 : !!document.getElementById('tab-' + s[0]) && !document.getElementById('tab-' + s[0]).hidden;
      if (disponible && (!q || coincide(s[1], q))) out.push({ grupo: 'Ir a', tipo: 'seccion', id: s[0], titulo: s[1], sub: '' });
    });
    if (!empieza) return out.slice(0, 8);

    // Chats
    if (window.WaInbox) {
      window.WaInbox.convs().filter(function (c) { return coincide(c.nombre || '', q) || (qd.length >= 4 && String(c.id).indexOf(qd) >= 0); }).slice(0, 5).forEach(function (c) {
        out.push({ grupo: 'Chats', tipo: 'chat', id: c.id, titulo: c.nombre || '+' + c.id, sub: '+' + c.id + (c.ultimoTexto ? ' · ' + c.ultimoTexto : '') });
      });
    }

    // Clientes del directorio de Vender
    var db = window.TiendaApp && window.TiendaApp.db ? window.TiendaApp.db() : null;
    if (db && db.buscarClientes) {
      db.buscarClientes(q, 5).forEach(function (c) {
        out.push({ grupo: 'Clientes', tipo: 'cliente', id: c.id, titulo: c.nombre, sub: (c.tipoDoc || '') + ' ' + (c.documento || '') + (c.telefono ? ' · ' + c.telefono : ''), cliente: c });
      });
    }

    // Cotizaciones (número o cliente)
    if (typeof getHist === 'function') {
      var h = getHist();
      h.map(function (x, i) { return { x: x, i: i }; }).filter(function (p) {
        var num = typeof quoteDisplayNum === 'function' ? quoteDisplayNum(p.x.num, p.x.asesor, p.x.letra) : String(p.x.num || '');
        return !p.x._piiLocked && (coincide((p.x.cliente || '') + ' ' + num, q) || (qd.length >= 3 && digitos(num).indexOf(qd) >= 0) || (qd.length >= 7 && digitos(p.x.clienteTel).indexOf(qd) >= 0));
      }).slice(0, 5).forEach(function (p) {
        var num = typeof quoteDisplayNum === 'function' ? quoteDisplayNum(p.x.num, p.x.asesor, p.x.letra) : p.x.num;
        out.push({ grupo: 'Cotizaciones', tipo: 'cotizacion', id: p.x.id, i: p.i, titulo: '#' + num + ' · ' + (p.x.cliente || 'Sin nombre'), sub: pesos(p.x.total) + ' · ' + (p.x.estado || 'enviada') + (p.x.date ? ' · ' + p.x.date : '') });
      });
    }

    // Productos del catálogo activo (con existencias)
    var cat = typeof CATALOG !== 'undefined' && Array.isArray(CATALOG) ? CATALOG : [];
    if (typeof S !== 'undefined' && S.activePriceList === 'lago' && Array.isArray(S.catalogLago) && S.catalogLago.length) cat = S.catalogLago;
    var n = 0;
    for (var k = 0; k < cat.length && n < 6; k++) {
      var p = cat[k];
      if (coincide(p.name + ' ' + p.sku, q)) {
        n++;
        out.push({ grupo: 'Productos', tipo: 'producto', id: p.sku, titulo: p.name, sub: 'SKU ' + p.sku + ' · ' + pesos(Math.round(Number(p.price) * 1000)), prod: p, ex: window.Existencias ? window.Existencias.etiqueta(p.sku, 1) : '' });
      }
    }
    return out;
  }

  function pintar() {
    var lista = _caja.querySelector('.bq-res');
    if (!_res.length) {
      lista.innerHTML = '<p class="bq-vacio">Nada con eso. Prueba con el nombre, la cédula, el celular, un número de cotización o un producto.</p>';
      return;
    }
    var html = '', grupo = '';
    _res.forEach(function (r, k) {
      if (r.grupo !== grupo) { grupo = r.grupo; html += '<p class="bq-grupo">' + esc(grupo) + '</p>'; }
      var accion = { seccion: 'Ir', chat: 'Abrir chat', cliente: 'Venderle', cotizacion: 'Cargar', producto: 'Agregar a la cotización' }[r.tipo];
      html += '<button type="button" class="bq-item' + (k === _i ? ' on' : '') + '" data-k="' + k + '" role="option" aria-selected="' + (k === _i) + '">'
        + '<span class="bq-txt"><b>' + esc(r.titulo) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</span>'
        + (r.ex || '') + '<span class="bq-accion">' + accion + '</span></button>';
    });
    lista.innerHTML = html;
    var on = lista.querySelector('.bq-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function ejecutar(r) {
    if (!r) return;
    cerrar();
    if (r.tipo === 'seccion') {
      var t = document.getElementById('tab-' + r.id);
      if (['seg', 'pagos', 'empresa', 'jefe'].indexOf(r.id) >= 0 || !t) switchTab(r.id); else t.click();
    } else if (r.tipo === 'chat') {
      if (window.WaInbox) window.WaInbox.abrir(r.id);
    } else if (r.tipo === 'cotizacion') {
      if (typeof loadHist === 'function') { loadHist(r.i); var tq = document.getElementById('tab-q'); if (tq) tq.click(); else switchTab('q'); }
    } else if (r.tipo === 'producto') {
      if (typeof addItem === 'function') {
        var p = r.prod;
        var ok = addItem({ sku: p.sku, name: p.name, price: p.price, _cat: p._cat || null, note: '', source: p._listSource || (typeof S !== 'undefined' ? S.activePriceList : '') });
        if (ok && window.showToast) showToast('Agregado: ' + String(p.name).slice(0, 40), 'success');
        var tq2 = document.getElementById('tab-q'); if (tq2) tq2.click(); else switchTab('q');
      }
    } else if (r.tipo === 'cliente') {
      if (window.TiendaVender && window.TiendaVender.venderA) window.TiendaVender.venderA(r.cliente);
    }
  }

  function abrir(texto) {
    if (!_caja) armar();
    _antesFoco = document.activeElement;
    _caja.hidden = false;
    var inp = _caja.querySelector('input');
    inp.value = texto || '';
    _i = 0;
    _res = buscar(inp.value);
    pintar();
    inp.focus();
  }

  function cerrar() {
    if (!_caja || _caja.hidden) return;
    _caja.hidden = true;
    if (_antesFoco && _antesFoco.focus && document.contains(_antesFoco)) { try { _antesFoco.focus(); } catch (e) {} }
  }

  function armar() {
    _caja = document.createElement('div');
    _caja.className = 'bq';
    _caja.hidden = true;
    _caja.innerHTML = '<div class="bq-fondo" data-cerrar></div>'
      + '<div class="bq-caja" role="dialog" aria-modal="true" aria-label="Buscar">'
      + '<label class="bq-campo"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>'
      + '<input type="search" placeholder="Busca un cliente, celular, cotización, producto o sección" autocomplete="off" spellcheck="false" aria-label="Buscar" role="combobox" aria-expanded="true">'
      + '<kbd>Esc</kbd></label>'
      + '<div class="bq-res" role="listbox"></div>'
      + '<p class="bq-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd><kbd>K</kbd> desde cualquier pantalla</span></p>'
      + '</div>';
    document.body.appendChild(_caja);
    var inp = _caja.querySelector('input');
    inp.addEventListener('input', function () { _i = 0; _res = buscar(inp.value); pintar(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _i = Math.min(_res.length - 1, _i + 1); pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); _i = Math.max(0, _i - 1); pintar(); }
      else if (e.key === 'Enter') { e.preventDefault(); ejecutar(_res[_i]); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    });
    _caja.addEventListener('click', function (e) {
      if (e.target.hasAttribute('data-cerrar')) { cerrar(); return; }
      var b = e.target.closest('[data-k]');
      if (b) ejecutar(_res[Number(b.getAttribute('data-k'))]);
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      if (_caja && !_caja.hidden) cerrar(); else abrir('');
    }
  });

  window.Buscar = { abrir: abrir };
})();
