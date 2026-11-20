// ============================================================
// PANEL DEL DUEÑO (jefe/admin) Y "MI PANEL" DEL ASESOR
// ============================================================
// Dueño: primera pantalla en PC. Abre en HOY: lo vendido (contra ayer), las
// cotizaciones, los chats, los pagos por revisar, el embudo completo
// (chats → cotizaciones → ventas → pagos aprobados) y cómo va cada asesor.
// Asesor: el mismo panel con SOLO sus datos (sus cotizaciones y ventas, lo
// que tiene para retomar y la plata que tiene en juego). El total de la
// empresa es solo del dueño.
//
// Fuentes (todas ya existen; nada nuevo se escribe):
//   user_quotes      — cotizaciones del equipo con su estado (vendida, etc.)
//   failed_searches  — búsquedas del catálogo que no encontraron nada
//   wa_conversations — chats de WhatsApp (si el buzón está activo)
// Las lee solo quien tiene rol jefe o admin (isJefe en firestore.rules).
// "Ventas" = cotizaciones marcadas como vendidas: las ventas registradas en
// Vender viven todavía en el navegador de cada equipo (TIENDA_DATOS.md).
//
// Globales que expone (window.*):
//   PanelJefe.abrir()   — carga los datos (una vez por minuto como máximo) y pinta
//
// Depende de: firebase-auth.js (_slDb, _slUserRol), domain.js (esc, fmtCOP),
//             ui.js (switchTab), riel.js (navegación)
// Requiere DOM: .pv (crea #panel-jefe dentro)
// Estilos: styles/panel-jefe.css
// ============================================================
(function () {
  'use strict';

  var _periodo = 'hoy'; // el dueño entra a ver el día
  function modo() { return ['jefe', 'admin'].indexOf(window._slUserRol) >= 0 ? 'empresa' : 'propio'; }
  function miCorreo() { var u = window._slAuth && window._slAuth.currentUser; return u ? String(u.email || '').toLowerCase() : ''; }
  function miNombre() { var u = window._slAuth && window._slAuth.currentUser; var n = (u && (u.displayName || u.email)) || ''; n = String(n).split(/[\s@]/)[0]; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''; }
  var _datos = null;          // { quotes: [], fallidas: [], chats: [] }
  var _cargadoAt = 0;
  var _cargando = false;

  var PERIODOS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function $(id) { return document.getElementById(id); }

  function panel() {
    var p = $('panel-jefe');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-jefe';
    p.className = 'ivapanel pj';
    p.style.display = 'none';
    pv.appendChild(p);
    p.addEventListener('click', function (e) {
      var b = e.target.closest('[data-periodo]');
      if (b) { _periodo = b.getAttribute('data-periodo'); pintar(); return; }
      var r = e.target.closest('[data-pj-recargar]');
      if (r) { _cargadoAt = 0; cargar(); }
    });
    return p;
  }

  // ── Fechas ───────────────────────────────────────────────
  function inicioDe(periodo, ahora) {
    var d = new Date(ahora);
    d.setHours(0, 0, 0, 0);
    if (periodo === 'semana') { var dia = d.getDay(); d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia)); }
    else if (periodo === 'mes') d.setDate(1);
    else if (periodo === 'anio') { d.setMonth(0, 1); }
    return d.getTime();
  }

  function msDe(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number') return v;
    return 0;
  }

  // dateKey 'YYYY-MM-DD' → ms del inicio de ese día (hora local)
  function msDeClave(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
  }

  function claveDia(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ── Carga ────────────────────────────────────────────────
  function cargar() {
    var db = window._slDb;
    if (!db || _cargando) return;
    if (_datos && Date.now() - _cargadoAt < 60000) { pintar(); return; }
    _cargando = true;
    pintar();
    var desdeAnio = new Date(new Date().getFullYear(), 0, 1);
    var TS = window.firebase && firebase.firestore && firebase.firestore.Timestamp;
    var qQuotes = db.collection('user_quotes')
      .where('updatedAt', '>=', TS ? TS.fromDate(desdeAnio) : desdeAnio)
      .orderBy('updatedAt', 'desc').limit(3000).get();
    var qFallidas = db.collection('failed_searches').orderBy('createdAt', 'desc').limit(500).get();
    var qChats = db.collection('wa_conversations').orderBy('ultimoAt', 'desc').limit(500).get();
    // El asesor no lee las búsquedas fallidas del equipo (reglas): ni se piden.
    if (modo() === 'propio') qFallidas = Promise.reject(new Error('no aplica'));
    Promise.all([
      qQuotes.then(function (s) { return s.docs.map(function (d) { return d.data(); }); }),
      qFallidas.then(function (s) { return s.docs.map(function (d) { return d.data(); }); }).catch(function () { return null; }),
      qChats.then(function (s) { return s.docs.map(function (d) { return d.data(); }); }).catch(function () { return null; }),
      window.Comprobantes ? window.Comprobantes.listar().catch(function () { return null; }) : Promise.resolve(null),
      // Ventas registradas en Vender en ESTE computador (tienda-db, local)
      window.TiendaApp && window.TiendaApp.listo ? window.TiendaApp.listo.then(function (tdb) { return tdb.ventas({ desde: desdeAnio.getTime(), limite: 3000 }); }).catch(function () { return []; }) : Promise.resolve([])
    ]).then(function (r) {
      var quotes = r[0];
      // Las ventas de Vender que NO salieron de una cotización se suman como
      // vendidas (las que sí, ya marcaron su cotización: ui/vender.js).
      var yoNombre = window.TiendaApp && TiendaApp.usuario ? String(TiendaApp.usuario()).trim().toUpperCase() : '';
      (r[4] || []).forEach(function (vt) {
        if (vt.estado === 'anulada' || /^Cot\./.test(String(vt.orden && vt.orden.numero || ''))) return;
        quotes.push({ estado: 'vendida', total: vt.total, estadoUpdatedAt: vt.fecha, dateKey: claveDia(vt.fecha), asesor: vt.usuario || yoNombre, email: miCorreo(), items: [], _venta: true });
      });
      // Mi panel: solo lo propio
      if (modo() === 'propio') { var yo = miCorreo(); quotes = quotes.filter(function (q) { return String(q.email || '').toLowerCase() === yo; }); }
      _datos = { quotes: quotes, fallidas: r[1], chats: r[2], pagos: r[3] };
      _cargadoAt = Date.now();
    }).catch(function (e) {
      console.warn('panel jefe:', e && (e.code || e.message));
      _datos = { error: (e && e.code === 'permission-denied') ? 'permiso' : 'red' };
    }).then(function () {
      _cargando = false;
      pintar();
    });
  }

  // ── Cálculos ─────────────────────────────────────────────
  function calcular() {
    var ahora = Date.now();
    var desde = inicioDe(_periodo, ahora);
    var quotes = _datos.quotes || [];

    // Las ventas de Vender sin cotización (_venta) cuentan como venta, no como cotización
    var cotizadas = quotes.filter(function (q) { return !q._venta && (msDeClave(q.dateKey) >= desde || (!q.dateKey && msDe(q.createdAt) >= desde)); });
    var vendidas = quotes.filter(function (q) {
      if (q.estado !== 'vendida') return false;
      var t = msDe(q.estadoUpdatedAt) || msDeClave(q.dateKey);
      return t >= desde;
    });
    var totalVendido = vendidas.reduce(function (a, q) { return a + (Number(q.total) || 0); }, 0);
    var totalCotizado = cotizadas.reduce(function (a, q) { return a + (Number(q.total) || 0); }, 0);

    // Ventas por día dentro del periodo (para la gráfica)
    var dias = {};
    var paso = 86400000;
    var inicioG = _periodo === 'hoy' ? inicioDe('semana', ahora) : desde;
    for (var t = inicioG; t <= ahora; t += paso) dias[claveDia(t)] = 0;
    quotes.forEach(function (q) {
      if (q.estado !== 'vendida') return;
      var k = claveDia(msDe(q.estadoUpdatedAt) || msDeClave(q.dateKey));
      if (k in dias) dias[k] += Number(q.total) || 0;
    });
    var serie = Object.keys(dias).sort().map(function (k) { return [k, dias[k]]; });
    if (_periodo === 'anio') {
      var porMes = {};
      serie.forEach(function (p) { var m = p[0].slice(0, 7); porMes[m] = (porMes[m] || 0) + p[1]; });
      serie = Object.keys(porMes).sort().map(function (m) { return [m, porMes[m]]; });
    }

    // Rendimiento por asesor
    var porAsesor = {};
    function a(q) {
      var k = String(q.asesor || q.email || 'Sin nombre').trim().toUpperCase();
      if (!porAsesor[k]) porAsesor[k] = { nombre: k, cot: 0, vend: 0, monto: 0 };
      return porAsesor[k];
    }
    cotizadas.forEach(function (q) { a(q).cot++; });
    vendidas.forEach(function (q) { var x = a(q); x.vend++; x.monto += Number(q.total) || 0; });
    var asesores = Object.keys(porAsesor).map(function (k) { return porAsesor[k]; })
      .sort(function (x, y) { return y.monto - x.monto || y.cot - x.cot; });

    // Lo más cotizado
    var productos = {};
    cotizadas.forEach(function (q) {
      (q.items || []).forEach(function (it) {
        var n = String(it && it.name || '').trim();
        if (!n) return;
        productos[n] = (productos[n] || 0) + (Number(it.qty) || 1);
      });
    });
    var top = Object.keys(productos).map(function (n) { return [n, productos[n]]; })
      .sort(function (x, y) { return y[1] - x[1]; }).slice(0, 7);

    // Buscado y no encontrado
    var fallidas = null;
    if (_datos.fallidas) {
      var cuenta = {};
      _datos.fallidas.forEach(function (f) {
        var t2 = msDe(f.createdAt) || msDeClave(f.dateKey);
        if (t2 < desde) return;
        var k = String(f.query || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (k.length < 2) return;
        cuenta[k] = (cuenta[k] || 0) + 1;
      });
      fallidas = Object.keys(cuenta).map(function (k) { return [k, cuenta[k]]; })
        .sort(function (x, y) { return y[1] - x[1]; }).slice(0, 5);
    }

    // Chats
    var chats = null;
    if (_datos.chats) {
      var base = _datos.chats;
      // Mi panel: solo los chats que atiende este asesor
      if (modo() === 'propio') { var yo2 = miCorreo(); base = base.filter(function (c) { return String(c.asignado || '').toLowerCase() === yo2; }); }
      var activos = base.filter(function (c) { return msDe(c.ultimoAt) >= desde; });
      chats = {
        total: activos.length,
        sinLeer: base.filter(function (c) { return (Number(c.noLeidos) || 0) > 0; }).length
      };
    }

    // Lo vendido ayer (para comparar en "Hoy")
    var inicioHoy = inicioDe('hoy', ahora), inicioAyer = inicioHoy - 86400000;
    var vendidoAyer = quotes.filter(function (q) {
      if (q.estado !== 'vendida') return false;
      var t3 = msDe(q.estadoUpdatedAt) || msDeClave(q.dateKey);
      return t3 >= inicioAyer && t3 < inicioHoy;
    }).reduce(function (s, q) { return s + (Number(q.total) || 0); }, 0);

    // Plata en juego: cotizaciones abiertas de los últimos 30 días
    var hace30 = ahora - 30 * 86400000;
    var abiertas = quotes.filter(function (q) {
      var est = q.estado || 'enviada';
      return (est === 'enviada' || est === 'negociando') && (msDeClave(q.dateKey) || msDe(q.updatedAt)) >= hace30;
    }).sort(function (x, y) { return (Number(y.total) || 0) - (Number(x.total) || 0); });

    // Pagos: aprobados en el periodo y por revisar ahora
    var pagos = _datos.pagos || null;
    var aprobados = pagos ? pagos.filter(function (x) { return x.estado === 'aprobado' && (x.revisadoMs || x.creadoMs) >= desde; }) : [];
    var porRevisar = pagos ? pagos.filter(function (x) { return x.estado === 'pendiente'; }).length : null;

    // Embudo: chats → cotizaciones → ventas → pagos aprobados
    var embudo = [
      ['Chats', chats ? chats.total : null],
      ['Cotizaciones', cotizadas.length],
      ['Ventas', vendidas.length],
      ['Pagos aprobados', pagos ? aprobados.length : null]
    ];

    return {
      vendidoAyer: vendidoAyer, abiertas: abiertas, porRevisar: porRevisar, embudo: embudo,
      vendido: totalVendido, nVendidas: vendidas.length,
      cotizado: totalCotizado, nCotizadas: cotizadas.length,
      cierre: cotizadas.length ? Math.round(100 * vendidas.length / cotizadas.length) : 0,
      serie: serie, asesores: asesores, top: top, fallidas: fallidas, chats: chats
    };
  }

  // ── Pintar ───────────────────────────────────────────────
  function millones(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-CO') + ' mil';
    return '$' + Math.round(n).toLocaleString('es-CO');
  }

  function grafica(serie) {
    var W = 600, H = 160, pad = 8;
    if (!serie.length) return '';
    var max = Math.max.apply(null, serie.map(function (p) { return p[1]; }));
    if (max <= 0) return '<p class="pj-vacio">Todavía no hay ventas marcadas en este periodo.</p>';
    var n = serie.length;
    var pts = serie.map(function (p, i) {
      var x = n === 1 ? W / 2 : pad + (W - 2 * pad) * i / (n - 1);
      var y = H - pad - (H - 2 * pad) * (p[1] / max);
      return [x, y];
    });
    var linea = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = linea + ' L' + pts[n - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
    var ult = pts[n - 1];
    var etiqueta = function (k) {
      if (k.length === 7) return MESES[+k.slice(5, 7) - 1].slice(0, 3);
      return String(+k.slice(8, 10));
    };
    return '<svg class="pj-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Ventas por día">'
      + '<defs><linearGradient id="pjArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".14"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'
      + '<g class="pj-grid"><line x1="0" y1="' + (H * .25) + '" x2="' + W + '" y2="' + (H * .25) + '"/><line x1="0" y1="' + (H * .5) + '" x2="' + W + '" y2="' + (H * .5) + '"/><line x1="0" y1="' + (H * .75) + '" x2="' + W + '" y2="' + (H * .75) + '"/></g>'
      + '<path d="' + area + '" fill="url(#pjArea)"/>'
      + '<path d="' + linea + '" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke"/>'
      + '<circle cx="' + ult[0].toFixed(1) + '" cy="' + ult[1].toFixed(1) + '" r="4" fill="currentColor"/>'
      + '</svg>'
      + '<div class="pj-ejes"><span>' + esc(etiqueta(serie[0][0])) + '</span><span>Máximo ' + esc(millones(max)) + '</span><span>' + esc(etiqueta(serie[n - 1][0])) + '</span></div>';
  }

  function titulo() {
    var d = new Date();
    if (modo() === 'propio') {
      var n = miNombre();
      return (_periodo === 'hoy' ? 'Así vas hoy' : _periodo === 'semana' ? 'Así vas esta semana' : _periodo === 'anio' ? 'Así vas en ' + d.getFullYear() : 'Así vas en ' + MESES[d.getMonth()]) + (n ? ', ' + n : '');
    }
    if (_periodo === 'hoy') {
      var dia = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      return 'Hoy, ' + dia;
    }
    if (_periodo === 'semana') return 'Así va la semana';
    if (_periodo === 'anio') return 'Así va ' + d.getFullYear();
    return 'Así va ' + MESES[d.getMonth()];
  }

  function pintar() {
    var p = panel();
    if (!p) return;
    var seg = '<div class="pj-seg" role="tablist" aria-label="Periodo">' + PERIODOS.map(function (x) {
      return '<button type="button" role="tab" data-periodo="' + x[0] + '" aria-selected="' + (x[0] === _periodo) + '" class="' + (x[0] === _periodo ? 'on' : '') + '">' + x[1] + '</button>';
    }).join('') + '</div>';
    var marca = (document.getElementById('sidebarBrandText') || {}).textContent || '';
    var cab = '<header class="pj-cab"><div><p class="pj-eti">' + (modo() === 'propio' ? 'Mi panel · solo tus datos' : 'Panel del dueño' + (marca ? ' · ' + esc(marca) : '')) + '</p>'
      + '<h1>' + esc(titulo()) + '</h1>'
      + '<p class="pj-sub">' + (_cargadoAt ? 'Actualizado a las ' + new Date(_cargadoAt).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) + ' · <button type="button" class="pj-link" data-pj-recargar>Actualizar</button>' : 'Cargando datos del equipo…') + '</p></div>'
      + seg + '</header>';

    // Mientras llegan los datos: la forma del panel, no un texto suelto.
    if (!_datos) {
      var hueso = function (cls) { return '<div class="pj-hueso ' + (cls || '') + '" aria-hidden="true"></div>'; };
      p.innerHTML = '<div class="pj" aria-busy="true">' + cab
        + '<div class="pj-kpis">' + hueso('pj-hueso-kpi pj-hueso-arte') + hueso('pj-hueso-kpi') + hueso('pj-hueso-kpi') + hueso('pj-hueso-kpi') + '</div>'
        + '<div class="pj-rej">' + hueso('pj-hueso-graf') + hueso('pj-hueso-lado') + hueso('pj-hueso-equipo') + '</div>'
        + '<span class="solo-lector">Cargando datos del equipo</span></div>';
      return;
    }
    if (_datos.error) {
      p.innerHTML = '<div class="pj">' + cab + '<div class="pj-tarjeta pj-aviso"><b>No se pudieron leer los datos del equipo.</b><span>'
        + (_datos.error === 'permiso'
          ? 'Faltan las reglas de Firestore con el rol de jefe. Publícalas desde la consola de Firebase y vuelve a intentar.'
          : 'Revisa la conexión a internet y vuelve a intentar.')
        + '</span><button type="button" class="pj-link" data-pj-recargar>Intentar de nuevo</button></div></div>';
      return;
    }

    var c = calcular();
    // La primera cifra (Ventas) es la que manda: va en la pieza de arte oscura.
    var nKpi = 0;
    var kpi = function (eti, cifra, nota, tono) {
      var k = 'k' + (nKpi++);
      return '<div class="pj-kpi' + (k === 'k0' ? ' pj-kpi-arte' : '') + '"><small>' + esc(eti) + '</small><div class="pj-cifra" data-k="' + k + '">' + esc(cifra) + '</div><div class="pj-nota' + (tono ? ' pj-' + tono : '') + '">' + esc(nota) + '</div></div>';
    };
    var propio = modo() === 'propio';
    var notaVentas = c.nVendidas + (c.nVendidas === 1 ? ' venta' : ' ventas')
      + (_periodo === 'hoy' ? ' · ayer ' + millones(c.vendidoAyer) : '');
    var enJuego = c.abiertas.reduce(function (s, q) { return s + (Number(q.total) || 0); }, 0);
    var retomar = window.Seguimiento ? window.Seguimiento.contar() : 0;
    var kpis = '<div class="pj-kpis">'
      + kpi(propio ? 'Mis ventas' : 'Vendido', millones(c.vendido), notaVentas)
      + kpi(propio ? 'Mis cotizaciones' : 'Cotizaciones', c.nCotizadas.toLocaleString('es-CO'), c.cierre + ' % se convirtió en venta')
      + (propio
        ? kpi('Para retomar', String(retomar), retomar ? 'Clientes que esperan tu mensaje' : 'Estás al día', retomar ? 'atencion' : '')
        : (c.chats ? kpi('Chats', c.chats.total.toLocaleString('es-CO'), c.chats.sinLeer ? c.chats.sinLeer + ' sin leer ahora' : 'Todo leído', c.chats.sinLeer ? 'atencion' : '') : kpi('Cotizado', millones(c.cotizado), 'Valor de todo lo cotizado')))
      + (propio
        ? kpi('En juego', millones(enJuego), c.abiertas.length + (c.abiertas.length === 1 ? ' cotización abierta' : ' cotizaciones abiertas'))
        : kpi('Pagos por revisar', c.porRevisar === null ? '—' : String(c.porRevisar), c.porRevisar ? 'Comprobantes esperando al jefe' : 'Nada pendiente', c.porRevisar ? 'atencion' : ''))
      + '</div>';

    // Embudo: de cada chat, cuántos terminan en pago
    var pasos = c.embudo.filter(function (e) { return e[1] !== null; });
    var embudo = pasos.length >= 2 ? '<section class="pj-tarjeta pj-embudo"><h2>' + (propio ? 'Tu embudo' : 'Embudo de ventas') + '</h2><div class="pj-embudo-fila">'
      + pasos.map(function (e, i) {
          var conv = i && pasos[i - 1][1] ? Math.round(100 * e[1] / pasos[i - 1][1]) : null;
          // Más de 100 % no es una conversión (ventas de cotizaciones de otros
          // días o sin cotización): se deja la flecha sola.
          if (conv !== null && conv > 100) conv = null;
          return (i ? '<span class="pj-flecha" aria-hidden="true">' + (conv !== null ? conv + ' %' : '') + '</span>' : '')
            + '<div class="pj-paso"><b>' + e[1].toLocaleString('es-CO') + '</b><span>' + e[0] + '</span></div>';
        }).join('') + '</div></section>' : '';

    var maxMonto = c.asesores.length ? Math.max(1, c.asesores[0].monto) : 1;
    var filas = c.asesores.slice(0, 8).map(function (x) {
      var pct = x.cot ? Math.round(100 * x.vend / x.cot) : 0;
      var ini = x.nombre.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2);
      return '<div class="pj-asesor"><span class="pj-av">' + esc(ini) + '</span><span class="pj-nom">' + esc(x.nombre) + '</span>'
        + '<span class="pj-barra"><i style="width:' + Math.max(2, Math.round(100 * x.monto / maxMonto)) + '%"></i></span>'
        + '<b>' + esc(millones(x.monto)) + '</b><span class="pj-det">' + x.cot + ' cotiz. · ' + pct + ' % cierre</span></div>';
    }).join('') || '<p class="pj-vacio">Sin cotizaciones en este periodo.</p>';

    var lista = function (arr, sufijo, tono) {
      if (!arr || !arr.length) return '<p class="pj-vacio">Nada en este periodo.</p>';
      return arr.map(function (x) {
        var suf = sufijo === ' veces' && x[1] === 1 ? ' vez' : sufijo;
        return '<div class="pj-fila"><span>' + esc(x[0]) + '</span>' + (tono ? '<span class="pj-chip">' + x[1] + suf + '</span>' : '<b>' + x[1] + '</b>') + '</div>';
      }).join('');
    };

    var abiertasHtml = c.abiertas.length ? c.abiertas.slice(0, 6).map(function (q) {
      var dias = Math.floor((Date.now() - (msDeClave(q.dateKey) || msDe(q.updatedAt))) / 86400000);
      return '<div class="pj-fila"><span>' + esc(q._piiLocked ? 'Datos cifrados' : (q.cliente || 'Sin nombre')) + '</span><b>' + esc(millones(Number(q.total) || 0)) + ' · ' + (dias <= 0 ? 'hoy' : dias + ' d') + '</b></div>';
    }).join('') : '<p class="pj-vacio">No tienes cotizaciones abiertas.</p>';

    p.innerHTML = '<div class="pj">' + cab + kpis + embudo
      + '<div class="pj-rej">'
      + '<section class="pj-tarjeta pj-graf"><h2>' + (_periodo === 'anio' ? 'Ventas por mes' : 'Ventas por día') + '</h2>' + grafica(c.serie) + '</section>'
      + '<section class="pj-tarjeta pj-lado"><h2>' + (propio ? 'Lo que más cotizas' : 'Lo más cotizado') + '</h2>' + lista(c.top, '', false)
      + (propio
        ? '<h2 class="pj-h2-2">Tus clientes sin cerrar</h2>' + abiertasHtml
        : '<h2 class="pj-h2-2">Buscado y no encontrado</h2>' + (c.fallidas ? lista(c.fallidas, ' veces', true) : '<p class="pj-vacio">Sin datos de búsquedas.</p>'))
      + '</section>'
      + (propio ? '' : '<section class="pj-tarjeta pj-equipo"><h2>' + (_periodo === 'hoy' ? 'Cómo van tus asesores hoy' : 'Rendimiento por asesor') + '</h2>' + filas + '</section>')
      + '</div>'
      + '<p class="pj-pie">' + (propio ? 'Solo tus cotizaciones y ventas. ' : '') + 'Ventas: cotizaciones vendidas (se marcan solas al registrar la venta en Vender) y ventas sin cotización registradas en este computador.</p>'
      + '</div>';
    rodarCifras(p);
  }

  // Al cambiar de periodo solo ruedan los dígitos que cambian (ui/tacto.js).
  var _cifrasAntes = {};
  function rodarCifras(p) {
    var els = p.querySelectorAll('.pj-cifra[data-k]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], k = el.getAttribute('data-k'), nuevo = el.textContent;
      var viejo = _cifrasAntes[k];
      _cifrasAntes[k] = nuevo;
      if (viejo === undefined || viejo === nuevo || !window.tacto || !window.tacto.cifra) continue;
      el.textContent = viejo;
      el.dataset.valor = viejo;
      window.tacto.cifra(el, nuevo, { enfasis: k === 'k0' });
    }
  }

  // Abrir el panel cada vez que se entra a la vista 'jefe'
  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      // El panel se crea ANTES de cambiar de vista: si el rol llega antes de
      // que la página termine de cargar, ui.js no tendría a quién mostrar.
      var esPanel = t === 'jefe' && !!window._slUserRol;
      if (esPanel) panel();
      var r = original.apply(this, arguments);
      if (esPanel) cargar();
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  // El panel tiene que existir antes del primer switchTab para que ui.js lo
  // muestre u oculte junto a los demás.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  document.addEventListener('sl:rol', function () { _datos = null; _cargadoAt = 0; });

  window.PanelJefe = { abrir: function () { panel(); cargar(); } };
})();
