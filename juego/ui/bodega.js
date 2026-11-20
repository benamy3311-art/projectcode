// ============================================================
// BODEGA (encargado de bodega y dueño, PC)
// ============================================================
// El panel administrativo de la bodega, en cinco partes:
//   Resumen     — unidades y valor del inventario, agotados con pedidos,
//                 garantías abiertas, y QUÉ PEDIRLE A CADA PROVEEDOR
//                 (compras sugeridas: lo que se cotiza y se vende contra lo
//                 que hay, más lo que buscan y no está en el catálogo).
//   Ingresos    — registrar mercancía que llega (producto, cantidad,
//                 proveedor, factura, costo) y ver las últimas entradas.
//   Agotados    — sin existencias o por debajo del mínimo, ordenados por
//                 cuánto se piden.
//   Proveedores — quién surte qué, contacto y días de entrega; pedido por
//                 WhatsApp con lo sugerido ya escrito.
//   Garantías   — lo que traen los clientes, por estado (recibido, en
//                 revisión, con el proveedor, listo, entregado) y aviso al
//                 cliente por WhatsApp.
//
// Datos: inventario local (infrastructure/tienda-db.js, igual que Vender e
// Inventario), cotizaciones del equipo (quotes-sync.js), búsquedas fallidas,
// proveedores y garantías en Firestore (reglas: bodega o jefe editan).
// Cliente, teléfono y falla de una garantía van cifrados si la empresa
// activó el cifrado (PiiCrypto).
//
// Globales que expone (window.*):
//   Bodega.abrir(parte?)
//
// Depende de: ui/tienda-app.js (TiendaApp), quotes-sync.js (_slQuotesSync),
//             firebase-auth.js (_slDb, _slAuth, _slUserRol), pii-crypto.js,
//             domain.js (esc, fmtCOP), ui.js (switchTab, showToast)
// Estilos: styles/bodega.css
// ============================================================
(function () {
  'use strict';

  var DIA = 86400000;
  var MINIMO = 2;               // existencias mínimas por producto (por ahora fijo)
  var CAMPOS_PII = [{ path: 'cliente' }, { path: 'telefono' }, { path: 'falla' }];
  var ESTADOS = [
    ['recibido', 'Recibido', 'cie', ''],
    ['revision', 'En revisión', 'lav', 'Pasar a revisión'],
    ['proveedor', 'Con el proveedor', 'dur', 'Enviar al proveedor'],
    ['listo', 'Listo para entregar', 'men', 'Marcar listo'],
    ['entregado', 'Entregado', 'gris', 'Entregar al cliente'],
    ['rechazada', 'No aplica', 'ros', 'No aplica']
  ];

  var _parte = 'resumen';
  var _db = null;
  var _movs = [];
  var _demanda = { porSku: {}, tasaCierre: 0.3 }, _demandaAt = 0, _fallidas = [];
  var _proveedores = [], _garantias = [];
  var _escuchando = false;
  var _form = null;            // formulario abierto: { tipo, ... }
  var _sel = '';               // producto elegido en un formulario
  var _filtroGar = 'abiertas';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }
  function corto(n) { n = Math.round(Number(n) || 0); return n >= 1e6 ? '$ ' + (n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M' : pesos(n); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2600); }
  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? +v : (typeof v === 'number' ? v : 0); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function correo() { var u = window._slAuth && window._slAuth.currentUser; return u ? String(u.email || '').toLowerCase() : ''; }
  function usuario() { return window.TiendaApp && window.TiendaApp.usuario ? window.TiendaApp.usuario() : correo(); }
  function visible() { var p = $('panel-bodega'); return !!p && p.style.display !== 'none'; }
  function hace(t) { if (!t) return 'ahora'; var d = Math.floor((Date.now() - t) / DIA); return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'; }
  function pii() { return window.PiiCrypto || null; }

  // ── Datos ────────────────────────────────────────────────
  function productos() { return window.TiendaApp && window.TiendaApp.productos ? window.TiendaApp.productos() : []; }
  function stockDe(sku) { return _db ? Math.max(0, Number(_db.existencias(String(sku))) || 0) : 0; }

  function cargarDemanda() {
    if (Date.now() - _demandaAt < 5 * 60000) return;
    _demandaAt = Date.now();
    var desde = Date.now() - 30 * DIA;
    var cotizaciones = [], ventas = [];
    var pasos = [];
    var qs = window._slQuotesSync;
    if (qs && qs.fetchAllVendors) {
      pasos.push(qs.fetchAllVendors(500).then(function (docs) { cotizaciones = docs || []; }, function () {}));
    }
    if (_db && _db.ventas) {
      pasos.push(_db.ventas({ desde: desde, limite: 2000 }).then(function (vs) { ventas = vs || []; }, function () {}));
    }
    if (window._slDb) {
      pasos.push(window._slDb.collection('failed_searches').orderBy('createdAt', 'desc').limit(300).get().then(function (s) {
        var c = {};
        s.forEach(function (d) {
          var x = d.data() || {};
          if (ms(x.createdAt) < desde) return;
          var k = String(x.query || '').trim().toLowerCase();
          if (k.length >= 2) c[k] = (c[k] || 0) + 1;
        });
        _fallidas = Object.keys(c).map(function (k) { return [k, c[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
      }, function () { _fallidas = []; }));
    }
    Promise.all(pasos).then(function () {
      _demanda = window.Compras ? Compras.demanda({ cotizaciones: cotizaciones, ventas: ventas, desde: desde }) : { porSku: {}, tasaCierre: 0.3 };
      if (visible()) pintar();
    });
  }

  function escuchar() {
    if (_escuchando || !window._slDb) return;
    _escuchando = true;
    window._slDb.collection('proveedores').onSnapshot(function (s) {
      _proveedores = [];
      s.forEach(function (d) { var x = d.data() || {}; x.id = d.id; _proveedores.push(x); });
      _proveedores.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre)); });
      if (visible()) pintar();
    }, function () {});
    window._slDb.collection('garantias').orderBy('creadoAt', 'desc').limit(300).onSnapshot(function (s) {
      var docs = [];
      s.forEach(function (d) { var x = d.data() || {}; x.id = d.id; docs.push(x); });
      var P = pii();
      Promise.all(docs.map(function (x) { return P ? P.reveal('garantias', x.id, x, CAMPOS_PII).catch(function () { return x; }) : x; }))
        .then(function (l) { _garantias = l; if (visible()) pintar(); });
    }, function () {});
  }

  function cargarMovs() {
    if (!_db || !_db.movimientosRecientes) return;
    _db.movimientosRecientes(150).then(function (l) { _movs = l; if (visible()) pintar(); }, function () {});
  }

  // Lo que hay que pedir (domain/compras.js): cubre la entrega del proveedor
  // más dos semanas al ritmo de los últimos 30 días.
  function sugeridos() {
    if (!window.Compras) return [];
    return Compras.sugerir({
      demanda: _demanda, productos: productos(), existencias: stockDe, minimo: MINIMO,
      entregaDias: function (p) { var pr = proveedorPara(p.categoria); return pr ? pr.entregaDias : null; }
    });
  }
  function demandaDe(sku) { return _demanda.porSku[String(sku)] || { vendidas: 0, cotizadas: 0 }; }
  function textoDemanda(x) {
    var p = [];
    if (x.vendidas) p.push(x.vendidas + (x.vendidas === 1 ? ' vendido' : ' vendidos'));
    if (x.cotizadas) p.push(x.cotizadas + (x.cotizadas === 1 ? ' cotizado' : ' cotizados'));
    return p.join(' · ') || 'Sin pedidos';
  }

  function proveedorPara(categoria) {
    var c = norm(categoria);
    return _proveedores.filter(function (p) { return (p.categorias || []).some(function (x) { var n = norm(x); return n && (c.indexOf(n) >= 0 || n.indexOf(c) >= 0); }); })[0] || null;
  }

  // ── Pintar ───────────────────────────────────────────────
  function panel() {
    var p = $('panel-bodega');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-bodega';
    p.className = 'ivapanel bd';
    p.style.display = 'none';
    pv.appendChild(p);
    enlazar(p);
    return p;
  }

  function kpi(eti, cifra, nota, arte, tono) {
    return '<div class="bd-kpi' + (arte ? ' bd-arte' : '') + '"><small>' + esc(eti) + '</small><b>' + esc(cifra) + '</b><span' + (tono ? ' class="bd-' + tono + '"' : '') + '>' + esc(nota) + '</span></div>';
  }
  function etiqueta(hay) {
    return hay <= 0 ? '<span class="ex ex-no">Agotado</span>' : hay < MINIMO ? '<span class="ex ex-poco">Quedan ' + hay + '</span>' : '<span class="ex ex-ok">' + hay + ' en bodega</span>';
  }

  function resumenHtml() {
    var prods = productos();
    var unidades = 0, valor = 0;
    prods.forEach(function (p) { var h = stockDe(p.sku); if (h > 0) { unidades += h; valor += h * (Number(p.precio) || 0); } });
    var sug = sugeridos();
    var agotadosDem = sug.filter(function (s) { return s.hay === 0; }).length;
    var abiertas = _garantias.filter(function (g) { return ['entregado', 'rechazada'].indexOf(g.estado) < 0; }).length;
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var ingHoy = _movs.filter(function (m) { return m.motivo === 'entrada' && m.fecha >= hoy.getTime(); }).reduce(function (s, m) { return s + (Number(m.delta) || 0); }, 0);

    // Compras sugeridas, agrupadas por proveedor
    var grupos = {};
    sug.forEach(function (s) { var pr = proveedorPara(s.categoria); var k = pr ? pr.id : ''; (grupos[k] = grupos[k] || { prov: pr, items: [] }).items.push(s); });
    var comprar = Object.keys(grupos).sort(function (a, b) { return a === '' ? 1 : b === '' ? -1 : 0; }).map(function (k) {
      var g = grupos[k];
      return '<div class="bd-grupo"><header><b>' + esc(g.prov ? g.prov.nombre : 'Sin proveedor asignado') + '</b>'
        + (g.prov && g.prov.telefono ? '<button type="button" class="bd-btn bd-btn-chico" data-bd-pedir="' + esc(g.prov.id) + '">Pedir por WhatsApp</button>' : (g.prov ? '' : '<button type="button" class="bd-link" data-bd-ir="proveedores">Asignar proveedor</button>'))
        + '</header>' + g.items.slice(0, 8).map(function (s) {
          return '<div class="bd-fila"><span class="bd-nom">' + esc(s.nombre) + '</span>' + etiqueta(s.hay) + '<span class="bd-dem">' + esc(textoDemanda(s)) + '</span><b>Pedir ' + s.pedir + '</b></div>';
        }).join('') + (g.items.length > 8 ? '<p class="bd-nota">y ' + (g.items.length - 8) + ' más</p>' : '') + '</div>';
    }).join('') || '<p class="bd-vacio">Nada urgente: lo que se cotiza y se vende tiene existencias.</p>';

    var movHoy = _movs.slice(0, 8).map(function (m) {
      var p = prods.filter(function (x) { return String(x.sku) === String(m.sku); })[0];
      var txt = m.motivo === 'entrada' ? 'Entraron ' + m.delta : m.motivo === 'venta' ? 'Salió en venta ' + Math.abs(m.delta) : m.motivo === 'ajuste' ? 'Ajuste ' + (m.delta > 0 ? '+' : '') + m.delta : m.motivo + ' ' + m.delta;
      return '<div class="bd-fila"><span class="bd-nom">' + esc(p ? p.nombre : m.sku) + '</span><span class="bd-dem">' + esc(txt) + '</span><span class="bd-dem">' + esc(hace(m.fecha)) + '</span></div>';
    }).join('') || '<p class="bd-vacio">Todavía no hay movimientos registrados en este computador.</p>';

    return '<div class="bd-kpis">'
      + kpi('Para pedir', String(sug.length), agotadosDem ? agotadosDem + ' agotados que los clientes piden' : 'Productos que se están acabando', true)
      + kpi('Unidades en bodega', unidades.toLocaleString('es-CO'), ingHoy ? 'Entraron ' + ingHoy + ' hoy' : 'Sin ingresos hoy')
      + kpi('Valor del inventario', corto(valor), 'A precio de venta')
      + kpi('Garantías abiertas', String(abiertas), abiertas ? 'Clientes esperando su equipo' : 'Ninguna pendiente', false, abiertas ? 'atencion' : '')
      + '</div>'
      + '<div class="bd-rej">'
      + '<section class="bd-tarjeta"><h2>Para pedirle al proveedor</h2><p class="bd-nota">Para cubrir la entrega del proveedor y dos semanas más, al ritmo de los últimos 30 días. De cada cotización abierta cuenta el ' + Math.round(_demanda.tasaCierre * 100) + ' %, tu tasa de cierre.</p>' + comprar + '</section>'
      + '<section class="bd-tarjeta"><h2>Últimos movimientos</h2>' + movHoy
      + (_fallidas.length ? '<h2 class="bd-h2">Buscan y no lo tenemos</h2>' + _fallidas.map(function (f) { return '<div class="bd-fila"><span class="bd-nom">' + esc(f[0]) + '</span><span class="ex ex-no">' + f[1] + (f[1] === 1 ? ' vez' : ' veces') + '</span></div>'; }).join('') : '')
      + '</section></div>';
  }

  function buscadorProducto(id, conStock) {
    var elegido = _sel ? productos().filter(function (p) { return String(p.sku) === _sel; })[0] : null;
    var extra = '';
    if (elegido && conStock) {
      var s = sugeridos().filter(function (x) { return x.sku === String(elegido.sku); })[0];
      extra = ' · ' + etiqueta(stockDe(elegido.sku)) + (s ? ' · se sugirió pedir ' + s.pedir : '');
    }
    return '<div class="bd-campo bd-ancho">'
      + (elegido ? '<span>Producto</span><div class="bd-elegido"><b>' + esc(elegido.nombre) + '</b><span>SKU ' + esc(elegido.sku) + extra + '</span><button type="button" class="bd-link" data-bd-cambiar-prod>Cambiar</button></div>'
        : '<label for="' + id + '">Producto</label><input id="' + id + '" data-bd-buscar' + (conStock ? ' data-bd-stock' : '') + ' autocomplete="off" placeholder="Nombre o SKU del producto"><div class="bd-resultados" id="' + id + 'Res"></div>')
      + '</div>';
  }

  function ingresosHtml() {
    var provs = '<option value="">Sin proveedor</option>' + _proveedores.map(function (p) { return '<option value="' + esc(p.nombre) + '">' + esc(p.nombre) + '</option>'; }).join('');
    var lista = _movs.filter(function (m) { return m.motivo === 'entrada'; }).slice(0, 30);
    var prods = productos();
    return '<div class="bd-rej">'
      + '<section class="bd-tarjeta"><h2>Registrar mercancía que llega</h2><div class="bd-form">'
        + buscadorProducto('bdIngProd', true)
        + '<label class="bd-campo"><span>Cantidad</span><input id="bdIngCant" inputmode="numeric" value="1"></label>'
        + '<label class="bd-campo"><span>Costo por unidad (opcional)</span><input id="bdIngCosto" inputmode="numeric" placeholder="$ 0"></label>'
        + '<label class="bd-campo"><span>Proveedor</span><select id="bdIngProv">' + provs + '</select></label>'
        + '<label class="bd-campo"><span>Factura o remisión del proveedor</span><input id="bdIngDoc" maxlength="40" placeholder="Opcional"></label>'
        + '<div class="bd-acciones bd-ancho"><button type="button" class="bd-btn bd-btn-tinta" data-bd-acc="ingreso">Registrar ingreso</button></div>'
      + '</div></section>'
      + '<section class="bd-tarjeta"><h2>Últimos ingresos</h2>' + (lista.length ? lista.map(function (m) {
          var p = prods.filter(function (x) { return String(x.sku) === String(m.sku); })[0];
          return '<div class="bd-fila"><span class="bd-nom">' + esc(p ? p.nombre : m.sku) + '<small>' + esc(m.nota || '') + '</small></span><b>+' + m.delta + '</b><span class="bd-dem">' + esc(hace(m.fecha)) + (m.usuario ? ' · ' + esc(m.usuario) : '') + '</span></div>';
        }).join('') : '<p class="bd-vacio">Todavía no hay ingresos registrados.</p>') + '</section>'
      + '</div>';
  }

  function agotadosHtml() {
    var lista = productos().filter(function (p) { return !p.noInventariable; }).map(function (p) {
      var d = demandaDe(p.sku);
      return { p: p, hay: stockDe(p.sku), d: d, dem: d.vendidas + d.cotizadas * _demanda.tasaCierre };
    }).filter(function (x) { return x.hay < MINIMO && (x.dem > 0 || x.hay > 0 || (_db && _db.stock()[String(x.p.sku)] !== undefined)); })
      .sort(function (a, b) { return a.hay - b.hay || b.dem - a.dem; });
    return '<section class="bd-tarjeta"><h2>Agotados y por acabarse</h2><p class="bd-nota">Ordenados por existencias y por cuánto se venden y cotizan (últimos 30 días).</p>'
      + (lista.length ? lista.slice(0, 80).map(function (x) {
          var pr = proveedorPara(x.p.categoria);
          return '<div class="bd-fila bd-fila-ag"><span class="bd-nom">' + esc(x.p.nombre) + '<small>SKU ' + esc(x.p.sku) + ' · ' + esc(x.p.categoria || '') + (pr ? ' · ' + esc(pr.nombre) : '') + '</small></span>'
            + etiqueta(x.hay) + '<span class="bd-dem">' + esc(textoDemanda(x.d)) + '</span>'
            + '<button type="button" class="bd-btn bd-btn-chico" data-bd-ingresar="' + esc(x.p.sku) + '">Registrar ingreso</button></div>';
        }).join('') : '<p class="bd-vacio">No hay productos agotados ni por debajo del mínimo.</p>')
      + '</section>';
  }

  function proveedoresHtml() {
    var f = _form && _form.tipo === 'proveedor' ? _form : null;
    var cats = {};
    productos().forEach(function (p) { if (p.categoria) cats[p.categoria] = true; });
    var catLista = Object.keys(cats).sort();
    var formHtml = f ? '<section class="bd-tarjeta"><h2>' + (f.id ? 'Editar proveedor' : 'Nuevo proveedor') + '</h2><div class="bd-form">'
        + '<label class="bd-campo"><span>Nombre</span><input id="bdPrNom" maxlength="80" value="' + esc(f.nombre || '') + '"></label>'
        + '<label class="bd-campo"><span>Contacto</span><input id="bdPrCon" maxlength="80" value="' + esc(f.contacto || '') + '" placeholder="Quién atiende"></label>'
        + '<label class="bd-campo"><span>WhatsApp</span><input id="bdPrTel" maxlength="30" inputmode="tel" value="' + esc(f.telefono || '') + '"></label>'
        + '<label class="bd-campo"><span>Correo</span><input id="bdPrCor" maxlength="120" value="' + esc(f.correo || '') + '"></label>'
        + '<label class="bd-campo"><span>Entrega en (días)</span><input id="bdPrDias" inputmode="numeric" value="' + esc(String(f.entregaDias == null ? 2 : f.entregaDias)) + '"></label>'
        + '<div class="bd-campo bd-ancho"><span>Qué categorías surte</span><div class="bd-chips">' + catLista.map(function (c) {
            var on = (f.categorias || []).indexOf(c) >= 0;
            return '<button type="button" class="bd-chip' + (on ? ' on' : '') + '" data-bd-cat="' + esc(c) + '" aria-pressed="' + on + '">' + esc(c) + '</button>';
          }).join('') + '</div></div>'
        + '<label class="bd-campo bd-ancho"><span>Notas</span><input id="bdPrNotas" maxlength="500" value="' + esc(f.notas || '') + '" placeholder="Condiciones, cupo, horario…"></label>'
        + '<div class="bd-acciones bd-ancho"><button type="button" class="bd-btn" data-bd-acc="cancelar">Cancelar</button><button type="button" class="bd-btn bd-btn-tinta" data-bd-acc="guardar-proveedor">Guardar proveedor</button></div>'
      + '</div></section>' : '';
    var lista = _proveedores.map(function (p) {
      return '<div class="bd-prov"><div><b>' + esc(p.nombre) + '</b><span>' + esc([p.contacto, p.telefono, p.correo].filter(Boolean).join(' · ')) + '</span>'
        + '<div class="bd-chips">' + (p.categorias || []).map(function (c) { return '<span class="bd-chip bd-chip-ver">' + esc(c) + '</span>'; }).join('') + '</div></div>'
        + '<span class="bd-dem">Entrega en ' + (p.entregaDias || 0) + ' días</span>'
        + '<div class="bd-acciones">' + (p.telefono ? '<button type="button" class="bd-btn bd-btn-chico" data-bd-pedir="' + esc(p.id) + '">Pedir por WhatsApp</button>' : '')
        + '<button type="button" class="bd-btn bd-btn-chico" data-bd-editar-prov="' + esc(p.id) + '">Editar</button></div></div>';
    }).join('') || '<p class="bd-vacio">Agrega a tus proveedores: así la app sabe a quién pedirle cada cosa.</p>';
    return formHtml + '<section class="bd-tarjeta"><header class="bd-cab-sec"><h2>Proveedores</h2>' + (f ? '' : '<button type="button" class="bd-btn bd-btn-tinta bd-btn-chico" data-bd-acc="nuevo-proveedor">Nuevo proveedor</button>') + '</header>' + lista + '</section>';
  }

  function garantiasHtml() {
    var f = _form && _form.tipo === 'garantia' ? _form : null;
    var provs = '<option value="">Sin proveedor</option>' + _proveedores.map(function (p) { return '<option>' + esc(p.nombre) + '</option>'; }).join('');
    var formHtml = f ? '<section class="bd-tarjeta"><h2>Nueva garantía</h2><div class="bd-form">'
        + '<label class="bd-campo"><span>Cliente</span><input id="bdGaCli" maxlength="120"></label>'
        + '<label class="bd-campo"><span>WhatsApp del cliente</span><input id="bdGaTel" inputmode="tel" maxlength="20"></label>'
        + buscadorProducto('bdGaProd')
        + '<label class="bd-campo"><span>Serial</span><input id="bdGaSerial" maxlength="80"></label>'
        + '<label class="bd-campo"><span>Venta o factura</span><input id="bdGaVenta" maxlength="40" placeholder="RC-N1-000123"></label>'
        + '<label class="bd-campo"><span>Fecha de compra</span><input id="bdGaFecha" type="date"></label>'
        + '<label class="bd-campo"><span>Proveedor</span><select id="bdGaProv">' + provs + '</select></label>'
        + '<label class="bd-campo bd-ancho"><span>Qué falla</span><input id="bdGaFalla" maxlength="1000" placeholder="Lo que cuenta el cliente"></label>'
        + '<div class="bd-acciones bd-ancho"><button type="button" class="bd-btn" data-bd-acc="cancelar">Cancelar</button><button type="button" class="bd-btn bd-btn-tinta" data-bd-acc="guardar-garantia">Recibir garantía</button></div>'
      + '</div></section>' : '';
    var lista = _garantias.filter(function (g) { return _filtroGar === 'todas' || ['entregado', 'rechazada'].indexOf(g.estado) < 0; });
    var filas = lista.map(function (g) {
      var e = ESTADOS.filter(function (x) { return x[0] === g.estado; })[0] || ESTADOS[0];
      var i = ESTADOS.indexOf(e);
      var sig = i < 4 ? ESTADOS[i + 1] : null;
      return '<div class="bd-gar"><div class="bd-gar-a"><b>' + esc(g._piiLocked ? 'Datos cifrados' : (g.cliente || 'Sin nombre')) + '</b><span>' + esc(g.producto) + (g.serial ? ' · S/N ' + esc(g.serial) : '') + '</span>'
        + '<small>' + esc(g._piiLocked ? '' : (g.falla || '')) + '</small></div>'
        + '<span class="bd-est bd-est-' + e[2] + '">' + e[1] + '</span>'
        + '<span class="bd-dem">' + esc(hace(ms(g.creadoAt))) + (g.proveedor ? ' · ' + esc(g.proveedor) : '') + '</span>'
        + '<div class="bd-acciones">' + (sig ? '<button type="button" class="bd-btn bd-btn-chico" data-bd-estado="' + esc(g.id) + '" data-valor="' + sig[0] + '">' + sig[3] + '</button>' : '')
        + (i >= 1 && i <= 2 ? '<button type="button" class="bd-link" data-bd-estado="' + esc(g.id) + '" data-valor="rechazada">No aplica</button>' : '')
        + (g.telefono && !g._piiLocked ? '<button type="button" class="bd-btn bd-btn-chico" data-bd-avisar="' + esc(g.id) + '">Avisar al cliente</button>' : '') + '</div></div>';
    }).join('') || '<p class="bd-vacio">' + (_filtroGar === 'todas' ? 'Todavía no hay garantías.' : 'No hay garantías abiertas.') + '</p>';
    return formHtml + '<section class="bd-tarjeta"><header class="bd-cab-sec"><h2>Garantías</h2><div class="bd-seg"><button type="button" class="' + (_filtroGar === 'abiertas' ? 'on' : '') + '" data-bd-gfil="abiertas">Abiertas</button><button type="button" class="' + (_filtroGar === 'todas' ? 'on' : '') + '" data-bd-gfil="todas">Todas</button></div>'
      + (f ? '' : '<button type="button" class="bd-btn bd-btn-tinta bd-btn-chico" data-bd-acc="nueva-garantia">Recibir garantía</button>') + '</header>' + filas + '</section>';
  }

  var PARTES = [['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['agotados', 'Agotados'], ['proveedores', 'Proveedores'], ['garantias', 'Garantías']];

  // Lo escrito en un formulario sobrevive a cada repintado (llega un cambio de
  // Firestore, se elige un producto...): sin esto se borraba al teclear.
  function leerCampos(p) {
    var v = {};
    p.querySelectorAll('input[id], select[id]').forEach(function (el) { v[el.id] = el.value; });
    var a = document.activeElement;
    return { v: v, foco: a && p.contains(a) && a.id ? a.id : '', pos: a && typeof a.selectionStart === 'number' ? a.selectionStart : null };
  }
  function ponerCampos(p, g) {
    Object.keys(g.v).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && p.contains(el)) { el.value = g.v[id]; if (el.hasAttribute('data-bd-buscar') && el.value) buscar(el); }
    });
    var f = g.foco && document.getElementById(g.foco);
    if (f && p.contains(f)) { f.focus(); if (g.pos != null) try { f.setSelectionRange(g.pos, g.pos); } catch (e) {} }
  }
  // El proveedor del producto elegido queda puesto, si no se eligió otro.
  function proveedorDelElegido() {
    var p = _sel ? productos().filter(function (x) { return String(x.sku) === _sel; })[0] : null;
    var pr = p ? proveedorPara(p.categoria) : null;
    ['bdIngProv', 'bdGaProv'].forEach(function (id) { var s = $(id); if (s && !s.value && pr) s.value = pr.nombre; });
  }

  function pintar(limpio) {
    var p = panel();
    if (!p) return;
    var guardado = limpio ? null : leerCampos(p);
    if (['jefe', 'admin', 'bodega'].indexOf(window._slUserRol) < 0) { p.innerHTML = '<div class="bd-in"><p class="bd-sub">La bodega es para el encargado de bodega y el jefe.</p></div>'; return; }
    escuchar(); cargarDemanda();
    var sug = sugeridos();
    var abiertas = _garantias.filter(function (g) { return ['entregado', 'rechazada'].indexOf(g.estado) < 0; }).length;
    var titulo = sug.length ? sug.length + (sug.length === 1 ? ' producto para pedir' : ' productos para pedir') + (abiertas ? ' · ' + abiertas + (abiertas === 1 ? ' garantía abierta' : ' garantías abiertas') : '') : 'Bodega al día';
    var cuerpo = _parte === 'ingresos' ? ingresosHtml() : _parte === 'agotados' ? agotadosHtml() : _parte === 'proveedores' ? proveedoresHtml() : _parte === 'garantias' ? garantiasHtml() : resumenHtml();
    p.innerHTML = '<div class="bd-in">'
      + '<header class="bd-cab"><div><p class="bd-eti">Bodega</p><h1>' + esc(titulo) + '</h1><p class="bd-sub">Ingresos, agotados, proveedores y garantías. El inventario baja solo con cada venta registrada en Vender.</p></div></header>'
      + '<nav class="bd-seg bd-partes" aria-label="Partes de la bodega">' + PARTES.map(function (x) { return '<button type="button" class="' + (x[0] === _parte ? 'on' : '') + '" data-bd-parte="' + x[0] + '"' + (x[0] === _parte ? ' aria-current="page"' : '') + '>' + x[1] + '</button>'; }).join('') + '</nav>'
      + cuerpo + '</div>';
    if (guardado) ponerCampos(p, guardado);
  }

  // ── Acciones ─────────────────────────────────────────────
  function val(id) { var el = $(id); return el ? String(el.value || '').trim() : ''; }

  function registrarIngreso() {
    if (!_db) { toast('La base de la tienda todavía no abrió', 'warn'); return; }
    var cant = parseInt(val('bdIngCant'), 10);
    if (!_sel) { toast('Elige el producto que llegó', 'warn'); return; }
    if (!(cant > 0)) { toast('Escribe cuántas unidades llegaron', 'warn'); return; }
    var costo = Number(val('bdIngCosto').replace(/\D/g, '')) || 0;
    var nota = [val('bdIngProv'), val('bdIngDoc') ? 'Fact. ' + val('bdIngDoc') : '', costo ? 'Costo ' + pesos(costo) : ''].filter(Boolean).join(' · ');
    _db.registrarMovimientos([{ sku: _sel, delta: cant, motivo: 'entrada', nota: nota }], { usuario: usuario() }).then(function () {
      toast('Ingreso registrado: +' + cant, 'success');
      if (window.tacto) tacto.sentir('exito');
      _sel = '';
      cargarMovs();
      pintar(true);
    }, function (e) { toast(e && e.message ? e.message : 'No se pudo registrar el ingreso', 'warn'); });
  }

  function guardarProveedor() {
    var f = _form || {};
    var nombre = val('bdPrNom');
    if (!nombre) { toast('Escribe el nombre del proveedor', 'warn'); return; }
    var datos = {
      nombre: nombre.slice(0, 80), contacto: val('bdPrCon').slice(0, 80), telefono: val('bdPrTel').replace(/[^\d+ ]/g, '').slice(0, 30),
      correo: val('bdPrCor').slice(0, 120), categorias: (f.categorias || []).slice(0, 20),
      entregaDias: Math.min(90, Math.max(0, parseInt(val('bdPrDias'), 10) || 0)), notas: val('bdPrNotas').slice(0, 500),
      actualizadoPor: correo(), actualizadoAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var ref = f.id ? window._slDb.collection('proveedores').doc(f.id) : window._slDb.collection('proveedores').doc();
    ref.set(datos).then(function () { _form = null; toast('Proveedor guardado', 'success'); pintar(true); },
      function (e) { toast(e && e.code === 'permission-denied' ? 'Solo bodega o el jefe editan proveedores (o faltan las reglas nuevas).' : 'No se pudo guardar', 'warn'); });
  }

  function guardarGarantia() {
    var p = _sel ? productos().filter(function (x) { return String(x.sku) === _sel; })[0] : null;
    if (!val('bdGaCli')) { toast('Escribe el nombre del cliente', 'warn'); return; }
    if (!p) { toast('Elige el producto', 'warn'); return; }
    var ref = window._slDb.collection('garantias').doc();
    var datos = {
      cliente: val('bdGaCli').slice(0, 120), telefono: val('bdGaTel').replace(/\D/g, '').slice(-10), producto: String(p.nombre).slice(0, 200), sku: String(p.sku).slice(0, 40),
      serial: val('bdGaSerial').slice(0, 80), venta: val('bdGaVenta').slice(0, 40), fechaCompra: val('bdGaFecha').slice(0, 10), falla: val('bdGaFalla').slice(0, 1000),
      proveedor: val('bdGaProv').slice(0, 80), estado: 'recibido', diagnostico: '',
      creadoPor: correo(), creadoAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    var P = pii();
    (P ? P.protect('garantias', ref.id, datos, CAMPOS_PII) : Promise.resolve(datos)).then(function (d) { return ref.set(d); }).then(function () {
      _form = null; _sel = ''; toast('Garantía recibida', 'success'); pintar(true);
    }, function (e) { toast(e && e.piiLocked ? 'Los datos del cliente van cifrados y este equipo no tiene la llave de la empresa.' : 'No se pudo guardar la garantía', 'warn'); });
  }

  function cambiarEstado(id, estado) {
    window._slDb.collection('garantias').doc(id).update({ estado: estado, actualizadoPor: correo(), actualizadoAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(function () { toast('Garantía: ' + (ESTADOS.filter(function (x) { return x[0] === estado; })[0] || [])[1], 'success'); },
        function (e) { toast(e && e.code === 'permission-denied' ? 'Solo bodega o el jefe cambian el estado.' : 'No se pudo cambiar', 'warn'); });
  }

  function avisarCliente(id) {
    var g = _garantias.filter(function (x) { return x.id === id; })[0];
    if (!g || !g.telefono) return;
    var nom = String(g.cliente || '').split(' ')[0];
    var msj = {
      recibido: 'recibimos tu ' + g.producto + ' para garantía. Te aviso apenas tengamos el diagnóstico.',
      revision: 'tu ' + g.producto + ' está en revisión técnica. Te aviso apenas sepamos qué tiene.',
      proveedor: 'tu ' + g.producto + ' está con el proveedor para la garantía. Te aviso apenas lo devuelvan.',
      listo: 'tu ' + g.producto + ' ya está listo. Puedes pasar a recogerlo.',
      entregado: 'gracias por recoger tu ' + g.producto + '. Cualquier cosa, aquí estamos.',
      rechazada: 'revisamos tu ' + g.producto + ' y la garantía no aplica. Escríbeme y te explico las opciones.'
    }[g.estado] || '';
    window.open('https://wa.me/57' + encodeURIComponent(g.telefono) + '?text=' + encodeURIComponent('Hola' + (nom ? ' ' + nom : '') + ', ' + msj), '_blank', 'noopener');
  }

  // Pedido al proveedor por WhatsApp con lo sugerido ya escrito
  function pedirA(id) {
    var pr = _proveedores.filter(function (x) { return x.id === id; })[0];
    if (!pr || !pr.telefono) return;
    var items = sugeridos().filter(function (s) { var p2 = proveedorPara(s.categoria); return p2 && p2.id === id; });
    var tel = String(pr.telefono).replace(/\D/g, '');
    if (tel.length === 10) tel = '57' + tel;
    var texto = 'Hola' + (pr.contacto ? ' ' + String(pr.contacto).split(' ')[0] : '') + ', quiero hacer un pedido:\n'
      + (items.length ? items.map(function (s) { return '- ' + s.pedir + ' x ' + s.nombre + ' (SKU ' + s.sku + ')'; }).join('\n') : '- ')
      + '\n¿Me confirmas disponibilidad y precio? Gracias.';
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
  }

  function buscar(input) {
    var q = norm(input.value).trim();
    var res = $(input.id + 'Res');
    if (!res) return;
    if (q.length < 2) { res.innerHTML = ''; return; }
    var ws = q.split(/\s+/);
    var l = productos().filter(function (p) { var n = norm(p.nombre + ' ' + p.sku); return ws.every(function (w) { return n.indexOf(w) >= 0; }); }).slice(0, 7);
    var conStock = input.hasAttribute('data-bd-stock');
    res.innerHTML = l.map(function (p) { return '<button type="button" class="bd-res" data-bd-prod="' + esc(p.sku) + '"><span>' + esc(p.nombre) + '</span>' + (conStock ? etiqueta(stockDe(p.sku)) : '<small>SKU ' + esc(p.sku) + '</small>') + '</button>'; }).join('') || '<p class="bd-nota">No está en el catálogo.</p>';
  }

  function enlazar(p) {
    p.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.hasAttribute('data-bd-parte')) { _parte = t.getAttribute('data-bd-parte'); _form = null; _sel = ''; pintar(true); if (_parte === 'ingresos') cargarMovs(); return; }
      if (t.hasAttribute('data-bd-ir')) { _parte = t.getAttribute('data-bd-ir'); pintar(); return; }
      if (t.hasAttribute('data-bd-prod')) { _sel = t.getAttribute('data-bd-prod'); pintar(); proveedorDelElegido(); var sig = $('bdIngCant') || $('bdGaSerial'); if (sig) sig.focus(); return; }
      if (t.hasAttribute('data-bd-cambiar-prod')) { _sel = ''; pintar(); return; }
      if (t.hasAttribute('data-bd-ingresar')) { _parte = 'ingresos'; _sel = t.getAttribute('data-bd-ingresar'); pintar(true); proveedorDelElegido(); var c = $('bdIngCant'); if (c) { c.focus(); c.select(); } return; }
      if (t.hasAttribute('data-bd-pedir')) { pedirA(t.getAttribute('data-bd-pedir')); return; }
      if (t.hasAttribute('data-bd-editar-prov')) { var pr = _proveedores.filter(function (x) { return x.id === t.getAttribute('data-bd-editar-prov'); })[0]; _form = Object.assign({ tipo: 'proveedor' }, pr || {}); _form.categorias = (pr && pr.categorias || []).slice(); pintar(true); return; }
      if (t.hasAttribute('data-bd-cat')) { var cat = t.getAttribute('data-bd-cat'); var cs = _form.categorias = _form.categorias || []; var i = cs.indexOf(cat); if (i >= 0) cs.splice(i, 1); else cs.push(cat); t.classList.toggle('on'); t.setAttribute('aria-pressed', String(i < 0)); return; }
      if (t.hasAttribute('data-bd-estado')) { cambiarEstado(t.getAttribute('data-bd-estado'), t.getAttribute('data-valor')); return; }
      if (t.hasAttribute('data-bd-avisar')) { avisarCliente(t.getAttribute('data-bd-avisar')); return; }
      if (t.hasAttribute('data-bd-gfil')) { _filtroGar = t.getAttribute('data-bd-gfil'); pintar(); return; }
      var a = t.getAttribute('data-bd-acc');
      if (a === 'ingreso') registrarIngreso();
      else if (a === 'nuevo-proveedor') { _form = { tipo: 'proveedor', categorias: [] }; pintar(true); var n = $('bdPrNom'); if (n) n.focus(); }
      else if (a === 'guardar-proveedor') guardarProveedor();
      else if (a === 'nueva-garantia') { _form = { tipo: 'garantia' }; _sel = ''; pintar(true); var c2 = $('bdGaCli'); if (c2) c2.focus(); }
      else if (a === 'guardar-garantia') guardarGarantia();
      else if (a === 'cancelar') { _form = null; _sel = ''; pintar(true); }
    });
    p.addEventListener('input', function (e) { if (e.target && e.target.hasAttribute('data-bd-buscar')) buscar(e.target); });
  }

  if (window.TiendaApp && window.TiendaApp.listo) {
    window.TiendaApp.listo.then(function (db) {
      _db = db;
      if (db.alCambiar) db.alCambiar(function (tipo) { if (tipo === 'inventario' || tipo === 'ventas') { cargarMovs(); if (visible() && !_form) pintar(); } });
      cargarMovs();
    }, function () {});
  }

  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      if (t === 'bodega') panel();
      var r = original.apply(this, arguments);
      if (t === 'bodega') pintar();
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  window.Bodega = { abrir: function (parte) { if (parte) _parte = parte; switchTab('bodega'); } };
})();
