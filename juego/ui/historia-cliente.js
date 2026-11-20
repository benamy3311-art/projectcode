// ============================================================
// HISTORIA DEL CLIENTE EN EL CHAT
// ============================================================
// Mientras se le habla a un cliente, la ficha (ui/ficha-cliente.js) muestra
// su historia con la tienda: cuánto ha comprado, cuántas veces, qué cotizó y
// no compró, qué le interesa, cómo paga y una sugerencia. Este archivo junta
// los datos y los entrega ya calculados (domain/historia-cliente.js).
//
// De dónde sale (y por qué puede no estar completo):
//   - Cotizaciones: las propias (historial local) y las de todo el equipo
//     (user_quotes en la nube, las 500 más recientes; quotes-sync.js).
//   - Ventas: las registradas en Vender en ESTE computador (la base de la
//     tienda es local hasta que haya servidor; TIENDA_DATOS.md).
//   - Pagos: los comprobantes que esta cuenta puede ver (los propios; el
//     jefe, todos).
// El cliente se reconoce por celular (el del chat), cédula (la de su ficha)
// o nombre completo.
//
// Globales que expone (window.*):
//   HistoriaChat.de(conv, datos)   — historia calculada (con lo que ya cargó)
//   HistoriaChat.resumenHtml(h), HistoriaChat.detalleHtml(h)
// Evento: 'sl:historia' cuando terminan de llegar datos nuevos.
//
// Depende de: domain/historia-cliente.js, services.js (getHist,
//             quoteDisplayNum, fmtCOP), quotes-sync.js (_slQuotesSync),
//             ui/tienda-app.js (TiendaApp), infrastructure/comprobantes.js
// Estilos: styles/ficha-cliente.css (sección .fc-hist)
// ============================================================
(function () {
  'use strict';

  var VIDA = 5 * 60000;
  var _equipo = [], _equipoAt = 0, _equipoCargando = false;
  var _ventas = [], _ventasListas = false;
  var _pagos = [], _pagosAt = 0, _pagosCargando = false;
  var _abierto = {}; // waId -> ¿"Ver todo" en movimientos?

  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }
  function corto(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1e6) return '$ ' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return '$ ' + Math.round(n / 1e3).toLocaleString('es-CO') + ' mil';
    return pesos(n);
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function diez(s) { var d = String(s || '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; }
  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0); }
  function avisar() { document.dispatchEvent(new CustomEvent('sl:historia')); }
  function hace(t) {
    if (!t) return 'hoy'; // recién guardado: la hora del servidor aún no llega
    var d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d < 30 ? 'hace ' + d + ' días' : d < 365 ? 'hace ' + Math.round(d / 30) + ' meses' : 'hace ' + Math.round(d / 365) + (Math.round(d / 365) === 1 ? ' año' : ' años');
  }

  // ── Carga (con caché) ────────────────────────────────────
  function cargarEquipo() {
    var qs = window._slQuotesSync;
    if (_equipoCargando || !qs || !qs.fetchAllVendors || Date.now() - _equipoAt < VIDA) return;
    _equipoCargando = true;
    qs.fetchAllVendors(500).then(function (docs) {
      _equipo = docs || []; _equipoAt = Date.now(); _equipoCargando = false; avisar();
    }, function () { _equipoCargando = false; _equipoAt = Date.now(); });
  }

  function cargarPagos() {
    if (_pagosCargando || !window.Comprobantes || Date.now() - _pagosAt < VIDA) return;
    _pagosCargando = true;
    window.Comprobantes.listar().then(function (l) {
      _pagos = l || []; _pagosAt = Date.now(); _pagosCargando = false; avisar();
    }, function () { _pagosCargando = false; _pagosAt = Date.now(); });
  }

  function cargarVentas(db) {
    if (!db || !db.ventas) return;
    db.ventas({ limite: 2000 }).then(function (l) { _ventas = l || []; _ventasListas = true; avisar(); }, function () {});
  }
  if (window.TiendaApp && window.TiendaApp.listo) {
    window.TiendaApp.listo.then(function (db) {
      cargarVentas(db);
      if (db.alCambiar) db.alCambiar(function (tipo) { if (tipo === 'ventas' || tipo === 'importacion') cargarVentas(db); });
    }, function () {});
  }
  document.addEventListener('sl:comprobantes', function () { _pagosAt = 0; });

  // ── Este cliente ─────────────────────────────────────────
  function fechaCot(x) {
    var t = x._updatedMs || x.estadoUpdatedAt || ms(x.updatedAt) || ms(x.createdAt);
    if (t) return t;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(x.date || ''));
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
  }
  function numCot(x) { return typeof quoteDisplayNum === 'function' ? quoteDisplayNum(x.num, x.asesor, x.letra) : String(x.num || ''); }

  function de(conv, datos) {
    if (!window.HistoriaCliente || !conv) return null;
    cargarEquipo(); cargarPagos();
    datos = datos || {};
    var tel = diez(conv.id);
    var doc = String(datos.documento || '').replace(/\D/g, '');
    var nombres = [norm(conv.nombre), norm(datos.nombre)].filter(function (n) { return n && n.split(' ').length >= 2; });
    var esNombre = function (n) { n = norm(n); return !!n && nombres.indexOf(n) >= 0; };

    // Cotizaciones propias + del equipo, sin repetir
    var vistas = {};
    var propias = typeof getHist === 'function' ? getHist() : [];
    var cotizaciones = propias.concat(_equipo).filter(function (x) {
      var id = x.id || x._id;
      if (!x || x._piiLocked || vistas[id]) return false;
      var es = (tel && diez(x.clienteTel) === tel) || esNombre(x.cliente);
      if (es) vistas[id] = true;
      return es;
    }).map(function (x) {
      return {
        id: x.id || x._id, num: numCot(x), total: Number(x.total) || 0, estado: x.estado || 'enviada', fecha: fechaCot(x),
        items: (x.items || []).map(function (it) { return { nombre: it.name, cantidad: Number(it.qty) || 1, precio: Math.round(Number(it.price) * 1000) || 0, categoria: it._cat || '' }; })
      };
    });

    var ventas = _ventas.filter(function (v) {
      var c = v.cliente || {};
      return (tel && diez(c.telefono) === tel) || (doc && String(c.documento || '') === doc) || esNombre(c.nombre);
    }).map(function (v) {
      return {
        id: v.id, numero: v.numero, total: v.total, fecha: v.fecha, estado: v.estado, referencia: (v.orden && v.orden.numero) || '',
        medios: (v.pagos || []).map(function (p) { return p.medio; }),
        items: (v.items || []).map(function (it) { return { nombre: it.nombre, cantidad: it.cantidad, total: it.total, categoria: it.categoria || '' }; })
      };
    });
    var numerosVenta = ventas.map(function (v) { return v.numero; });

    var pagos = _pagos.filter(function (p) {
      return (p.ventaNumero && numerosVenta.indexOf(p.ventaNumero) >= 0) || esNombre(p.cliente);
    }).map(function (p) { return { estado: p.estado, medio: p.medio, valor: p.valor, fecha: p.creadoMs || 0 }; });

    return window.HistoriaCliente.calcular({ cotizaciones: cotizaciones, ventas: ventas, pagos: pagos, primerContacto: ms(conv.creadoAt) });
  }

  // ── Pintar ───────────────────────────────────────────────
  var TIPOS = {
    nuevo: ['Cliente nuevo', 'cie'],
    prospecto: ['Todavía no compra', 'gris'],
    recurrente: ['Ya te compró', 'men'],
    frecuente: ['Cliente frecuente', 'lav'],
    dormido: ['Hace tiempo no compra', 'dur']
  };

  function resumenHtml(h) {
    if (!h) return '';
    var t = TIPOS[h.tipo] || TIPOS.nuevo;
    return '<div class="fc-hist" aria-label="Historia del cliente">'
      + '<div class="fc-cifras">'
        + '<div><b>' + esc(h.comprado ? corto(h.comprado) : '$ 0') + '</b><span>comprado</span></div>'
        + '<div><b>' + h.compras + '</b><span>' + (h.compras === 1 ? 'compra' : 'compras') + '</span></div>'
        + '<div title="Cotizaciones enviadas o en negociación"><b>' + esc(h.valorAbierto ? corto(h.valorAbierto) : '0') + '</b><span>' + h.abiertas + ' sin cerrar</span></div>'
      + '</div>'
      + '<div class="fc-hist-pie"><span class="fc-tipo fc-tipo-' + t[1] + '">' + t[0] + '</span>'
        + (h.ultimaCompra ? '<span>Última compra ' + esc(hace(h.ultimaCompra.fecha)) + '</span>' : (h.cotizaciones ? '<span>' + h.cotizaciones + (h.cotizaciones === 1 ? ' cotización' : ' cotizaciones') + '</span>' : ''))
      + '</div>'
      + (h.sugerencia ? '<p class="fc-sug">' + esc(h.sugerencia) + '</p>' : '')
      + '</div>';
  }

  function detalleHtml(h, waId) {
    if (!h || (!h.linea.length && !h.noCompro.length)) return '';
    var datos = [];
    if (h.ticket) datos.push(['Compra promedio', corto(h.ticket)]);
    if (h.ultimaCompra && h.ultimaCompra.que) datos.push(['Lo último que compró', h.ultimaCompra.que]);
    if (h.medioFrecuente) datos.push(['Suele pagar con', h.medioFrecuente]);
    if (h.cierre !== null && h.cotizaciones >= 2) datos.push(['Cotizaciones que cerró', h.cierre + ' %']);
    if (h.intereses.length) datos.push(['Le interesa', h.intereses.map(function (c) { return c.charAt(0) + c.slice(1).toLowerCase(); }).join(', ')]);
    var todo = !!_abierto[waId];
    var lineas = todo ? h.linea : h.linea.slice(0, 5);
    return '<section class="fc-sec fc-hist-det">'
      + (datos.length ? '<div class="fc-hist-datos">' + datos.map(function (d) { return '<div><span>' + esc(d[0]) + '</span><b>' + esc(d[1]) + '</b></div>'; }).join('') + '</div>' : '')
      + (h.noCompro.length ? '<h4>Cotizó y no compró</h4><ul class="fc-nocompro">' + h.noCompro.map(function (x) {
          return '<li><span>' + esc(x.nombre) + '</span><em>' + (x.veces > 1 ? x.veces + ' veces · ' : '') + esc(corto(x.precio)) + '</em></li>';
        }).join('') + '</ul>' : '')
      + (h.linea.length ? '<h4>Movimientos</h4><ol class="fc-linea">' + lineas.map(function (l) {
          return '<li class="fc-l-' + l.tipo + '"><i></i><span>' + esc(l.texto) + '</span><em>' + (l.total ? esc(corto(l.total)) + ' · ' : '') + esc(hace(l.fecha)) + '</em></li>';
        }).join('') + '</ol>' + (h.linea.length > 5 ? '<button type="button" class="fc-alt fc-ver-todo" data-fc-hist="' + esc(waId) + '">' + (todo ? 'Ver menos' : 'Ver los ' + h.linea.length + ' movimientos') + '</button>' : '') : '')
      + '<p class="fc-nota-gris">Cotizaciones de todo el equipo; ventas registradas en este computador.</p>'
      + '</section>';
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-fc-hist]');
    if (!b) return;
    var id = b.getAttribute('data-fc-hist');
    _abierto[id] = !_abierto[id];
    avisar();
  });

  window.HistoriaChat = { de: de, resumenHtml: resumenHtml, detalleHtml: detalleHtml, corto: corto };
})();
