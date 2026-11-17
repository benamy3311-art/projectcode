// ============================================================
// TIENDA — piezas comunes de Vender e Inventario
// ============================================================
// Abre la base de datos local una sola vez, arranca el envío al servidor
// (cuando exista) y arma la lista de productos vendibles: el catálogo de la
// lista activa (precios del proveedor) más los productos propios de la
// tienda. También dibuja el documento de venta (recibo o remisión), que
// usan las dos pantallas.
//
// Globales que expone (window.*):
//   TiendaApp.listo            — Promise que resuelve con la base abierta
//   TiendaApp.productos()      — [{ sku, nombre, categoria, precio, iva, garantia, noInventariable }]
//   TiendaApp.usuario()        — nombre del asesor
//   TiendaApp.documentoHTML(v) — hoja del recibo o la remisión
//   TiendaApp.textoWhatsApp(v), .imprimir(v), .fmt(n), .fechaHora(ms)
// Depende de: domain/tienda.js, infrastructure/tienda-db.js,
//   infrastructure/tienda-sync.js, domain.js (esc, safeImgSrc),
//   templates.js (T.brandLogoSrc), storage.js (loadCfg), state.js (CATALOG, S)
// ============================================================
(function () {
  var db = null;
  var listo = (window.TiendaDB ? TiendaDB.abrir() : Promise.reject(new Error('Falta tienda-db.js'))).then(function (base) {
    db = base;
    if (window.TiendaSync) TiendaSync.iniciar(base);
    // Pedirle al navegador que no borre estos datos cuando le falte espacio.
    base.pedirPersistencia().catch(function () {});
    return base;
  });
  listo.catch(function (e) { console.error('[tienda] No se pudo abrir la base local:', e); });

  var e = function (s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var fmt = function (n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var fecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  var hora = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' });
  function fechaHora(ms) { var d = new Date(ms); return fecha.format(d) + ' · ' + hora.format(d); }

  function cfg() { try { return typeof loadCfg === 'function' ? loadCfg() : {}; } catch (_) { return {}; } }
  function garantiaDe(nombre, cat) {
    var c = cfg();
    if (cat === 'MONITOR') return /xiaomi/i.test(nombre) ? (c.warrantyMonitorXiaomi || '12 meses') : (c.warrantyMonitor || '36 meses');
    if (cat === 'PORTÁTIL') return c.warrantyPortatil || '12 meses';
    var g = document.getElementById('garantia');
    return (g && g.value.trim()) || '12 meses';
  }

  // Catálogo de la lista activa + productos propios. Se recalcula solo
  // cuando cambia el catálogo o los productos (memo por tamaño y lista).
  var memo = { clave: '', lista: [] };
  function productos() {
    var lista = (typeof S !== 'undefined' && S.activePriceList === 'lago' && S.catalogLago && S.catalogLago.length) ? S.catalogLago : (typeof CATALOG !== 'undefined' ? CATALOG : []);
    var propios = db ? db.productos() : {};
    var clave = (typeof S !== 'undefined' ? S.activePriceList : '') + ':' + lista.length + ':' + Object.keys(propios).length + ':' + (db ? db.config().caja : '');
    if (clave === memo.clave) return memo.lista;
    var vistos = {}, out = [];
    Object.keys(propios).forEach(function (sku) {
      var p = propios[sku];
      vistos[sku] = true;
      out.push({ sku: sku, nombre: p.nombre, categoria: p.categoria || 'ADICIONAL', precio: p.precio, iva: p.iva !== false, garantia: garantiaDe(p.nombre, p.categoria), noInventariable: !!p.noInventariable, propio: true });
    });
    lista.forEach(function (p) {
      if (!p || !p.sku || vistos[p.sku]) return;
      vistos[p.sku] = true;
      var cat = p._cat || 'ADICIONAL';
      out.push({ sku: String(p.sku), nombre: p.name, categoria: cat, precio: Math.round(Number(p.price) * 1000), iva: cat !== 'PORTÁTIL', garantia: garantiaDe(p.name, cat), noInventariable: String(p.sku) === '55002' });
    });
    out.forEach(function (p) { p._busq = Tienda.textoBusqueda(p.nombre + ' ' + p.sku + ' ' + p.categoria); });
    memo = { clave: clave, lista: out };
    return out;
  }

  function usuario() {
    var a = document.getElementById('asesor');
    return (a && a.value.trim()) || (function () { try { return localStorage.getItem('sl_asesor') || ''; } catch (_) { return ''; } })();
  }

  // ── Documento de venta ─────────────────────────────
  // Sencillo a propósito: lo que el cliente necesita leer y guardar. Sin
  // firmas ni total en letras. El IVA solo aparece si el vendedor lo pidió
  // (v.mostrarIva), igual que en la cotización.
  function documentoHTML(v) {
    var c = cfg();
    var tipo = Tienda.TIPOS_VENTA[v.tipo] || Tienda.TIPOS_VENTA.recibo;
    var marca = (window._slBranding && window._slBranding.brandName) || c.empresa || 'Tu tienda';
    var logo = (window.T && typeof T.brandLogoSrc === 'function' && typeof safeImgSrc === 'function') ? safeImgSrc(T.brandLogoSrc()) : '';
    var cli = v.cliente || {};
    var orden = v.orden || {};
    var conIva = !!v.mostrarIva;
    var lin = function (xs) { return xs.filter(Boolean).map(function (x) { return '<span>' + e(x) + '</span>'; }).join(''); };
    var filas = (v.items || []).map(function (it) {
      return '<tr><td class="td-desc"><b>' + e(it.nombre) + '</b>' +
          (it.garantia ? '<small>Garantía ' + e(it.garantia) + '</small>' : '') +
          (conIva && !it.ivaPct ? '<small>Excluido de IVA</small>' : '') + '</td>' +
        '<td class="td-c">' + it.cantidad + '</td><td class="td-r">' + fmt(it.precioUnit) + '</td><td class="td-r td-t">' + fmt(it.total) + '</td></tr>';
    }).join('');
    var pagos = (v.pagos || []).filter(function (p) { return p.valor > 0; }).map(function (p) {
      return '<div class="tdoc-fila"><span>' + (v.tipo === 'remision' ? 'Abono · ' : 'Pagado con ') + e(p.medio) + '</span><b>' + fmt(p.valor) + '</b></div>';
    }).join('');
    var nota = v.tipo === 'remision'
      ? 'Mercancía entregada a satisfacción. La garantía se hace válida con este documento.'
      : 'La garantía cubre defectos de fábrica y se hace válida con este recibo.';
    return '<article class="tdoc' + (v.estado === 'anulada' ? ' tdoc-anulada' : '') + '">' +
      (v.estado === 'anulada' ? '<div class="tdoc-sello">ANULADA</div>' : '') +
      '<header class="tdoc-cab">' +
        '<div class="tdoc-tienda">' + (logo ? '<img src="' + e(logo) + '" alt="">' : '') +
          '<div><b>' + e(marca) + '</b>' + lin([c.nit ? 'NIT ' + c.nit : '', c.tel ? 'Tel. ' + c.tel : '']) + '</div></div>' +
        '<div class="tdoc-num"><small>' + e(tipo.nombre) + '</small><b>' + e(v.numero) + '</b><span>' + e(fechaHora(v.fecha)) + '</span></div>' +
      '</header>' +
      '<section class="tdoc-cli">' +
        '<div><small>Cliente</small><b>' + e(cli.nombre) + '</b>' +
          lin([(cli.tipoDoc || 'CC') + ' ' + Tienda.formatearDocumento(cli.tipoDoc, cli.documento), cli.telefono ? 'Tel. ' + cli.telefono : '']) + '</div>' +
        '<div class="tdoc-cli-der">' + lin([
          v.usuario ? 'Atendió ' + v.usuario : '',
          orden.numero ? 'Orden ' + orden.numero : '',
          v.tipo === 'remision' && orden.entrega ? 'Entrega: ' + orden.entrega : ''
        ]) + '</div>' +
      '</section>' +
      '<table class="tdoc-tabla"><thead><tr><th>Producto</th><th class="td-c">Cant.</th><th class="td-r">Valor</th><th class="td-r">Total</th></tr></thead><tbody>' + filas + '</tbody></table>' +
      '<section class="tdoc-sumas">' +
        (conIva ? '<div class="tdoc-fila"><span>Subtotal</span><b>' + fmt(v.base) + '</b></div><div class="tdoc-fila"><span>IVA</span><b>' + fmt(v.iva) + '</b></div>' : '') +
        (v.descuento ? '<div class="tdoc-fila tdoc-ahorro"><span>Descuento ' + v.descuentoPct + ' %</span><b>−' + fmt(v.descuento) + '</b></div>' : '') +
        '<div class="tdoc-total"><span>Total</span><b>' + fmt(v.total) + '</b></div>' +
        pagos +
        (v.saldo ? '<div class="tdoc-fila tdoc-saldo"><span>Saldo pendiente</span><b>' + fmt(v.saldo) + '</b></div>' : '') +
      '</section>' +
      (v.notas ? '<p class="tdoc-notas">' + e(v.notas) + '</p>' : '') +
      '<footer class="tdoc-final"><span>' + e(nota) + '</span><span>No reemplaza la factura electrónica.</span></footer>' +
    '</article>';
  }

  function textoWhatsApp(v) {
    var tipo = (Tienda.TIPOS_VENTA[v.tipo] || {}).nombre || 'Documento';
    var primer = String((v.cliente || {}).nombre || '').split(' ')[0];
    var lineas = (v.items || []).map(function (it) { return '• ' + it.cantidad + ' × ' + it.nombre + ': ' + fmt(it.total).replace(/ /g, ' ') + (it.garantia ? ' (garantía ' + it.garantia + ')' : ''); });
    var out = ['Hola' + (primer ? ' ' + primer : '') + ', gracias por tu compra.', '', '*' + tipo + ' ' + v.numero + '*', fechaHora(v.fecha), ''].concat(lineas).concat(['', '*Total: ' + fmt(v.total).replace(/ /g, ' ') + '*']);
    (v.pagos || []).forEach(function (p) { out.push(p.medio + ': ' + fmt(p.valor).replace(/ /g, ' ')); });
    if (v.saldo) out.push('Saldo pendiente: ' + fmt(v.saldo).replace(/ /g, ' '));
    out.push('', 'Guarda este mensaje: con él haces válida la garantía.');
    return out.join('\n');
  }

  function enlaceWhatsApp(v) {
    var tel = String((v.cliente || {}).telefono || '').replace(/\D/g, '');
    var destino = tel.length === 10 ? '57' + tel : tel;
    return 'https://wa.me/' + destino + '?text=' + encodeURIComponent(textoWhatsApp(v));
  }

  function imprimir(v) {
    var host = document.getElementById('tiendaImpresion');
    if (!host) { host = document.createElement('div'); host.id = 'tiendaImpresion'; document.body.appendChild(host); }
    host.innerHTML = documentoHTML(v);
    document.documentElement.classList.add('imprimiendo-tienda');
    var limpiar = function () { document.documentElement.classList.remove('imprimiendo-tienda'); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    setTimeout(function () { window.print(); setTimeout(limpiar, 1500); }, 60);
  }

  window.TiendaApp = {
    listo: listo,
    db: function () { return db; },
    productos: productos,
    usuario: usuario,
    documentoHTML: documentoHTML,
    textoWhatsApp: textoWhatsApp,
    enlaceWhatsApp: enlaceWhatsApp,
    imprimir: imprimir,
    fmt: fmt,
    fechaHora: fechaHora,
    esc: e
  };
})();
