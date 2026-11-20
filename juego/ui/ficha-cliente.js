// ============================================================
// FICHA DEL CLIENTE (columna derecha de Chats, PC)
// ============================================================
// Todo lo de un cliente en el mismo lugar donde se le habla, y siempre el
// siguiente paso a la vista con un solo botón:
//
//   Cotización  →  Datos  →  Venta  →  Pago
//
//   1. Sin cotización: "Cotizar para Laura" (nombre ya puesto).
//   2. Con cotización, sin datos: "Pedir datos por WhatsApp" abre su chat
//      con el mensaje de siempre (Mi empresa → Mensajes rápidos).
//   3. Cuando responde, la app LEE sus mensajes (domain/extraer-datos.js) y
//      llena nombre, cédula, dirección y correo sola. Si respondió por otro
//      lado, "Pegar su respuesta" hace lo mismo con el texto pegado.
//   4. "Crear la venta": Vender se abre con el cliente y los productos de su
//      cotización (TiendaVender.prellenar). Se revisa y se registra.
//   5. "Adjuntar comprobante" cuando mande el pantallazo (ui/pagos.js).
//
// Todo lo detectado se puede corregir en la misma ficha. La ficha se guarda
// en este navegador (pc_ficha:<número>) y se borra al cerrar sesión
// (firebase-auth.js), como el resto de datos de clientes.
//
// Globales que expone (window.*):
//   FichaCliente.pintar(contenedor, conversacion, mensajes)
//
// Depende de: domain/extraer-datos.js (ExtraerDatos), domain/empresa.js
//             (Empresa.mensaje), domain/tienda.js (Tienda.validarCliente),
//             services.js (getHist, histKey, loadHist, quoteDisplayNum,
//             fmtCOP), ui/vender.js (TiendaVender.prellenar), ui/pagos.js
//             (Pagos.nuevo), quotes-sync.js (pushCrm), ui.js (switchTab)
// Estilos: styles/ficha-cliente.css
// ============================================================
(function () {
  'use strict';

  var LS = 'pc_ficha:';
  var _ctx = null, _conv = null, _mensajes = [];
  var _pegar = false;
  var _editar = false; // datos para la factura: filas limpias o campos para corregir
  var _ventaDesde = ''; // waId de la venta que se armó desde la ficha
  var _ultimoPaso = ''; // para animar la tarjeta solo cuando el paso cambia

  var ICO = {
    wa: '<path d="M21 11.5a8.4 8.4 0 01-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1121 11.5z"/>',
    cotizar: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h4"/>',
    venta: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    pago: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M8.5 15l2 2 4-4"/>',
    leer: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    abrir: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>'; }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2600); }
  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0); }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  function diez(s) { var d = digitos(s); return d.length > 10 ? d.slice(-10) : d; }
  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function primerNombre(s) { var p = String(s || '').trim().split(/\s+/)[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; }
  function hace(t) {
    if (!t) return 'hace un momento'; // recién guardado: la hora del servidor aún no llega
    var m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'hace un momento' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.floor(m / 60) + ' h' : 'hace ' + Math.floor(m / 1440) + ' días';
  }
  function hora(t) { return new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); }

  // ── Ficha guardada ───────────────────────────────────────
  function leer(id) { try { return JSON.parse(localStorage.getItem(LS + id) || 'null') || {}; } catch (e) { return {}; } }
  function guardarLocal(id, f) { try { localStorage.setItem(LS + id, JSON.stringify(f)); } catch (e) {} }
  // Cada guardado lleva su hora y sube a la nube (infrastructure/clientes-nube.js)
  function guardar(id, f) {
    f._t = Date.now();
    guardarLocal(id, f);
    if (window.ClientesNube) window.ClientesNube.subir(id, f);
  }
  // Al abrir un chat: si la nube tiene una versión más nueva (otro asesor,
  // otro computador), se usa esa. Una vez por cliente y sesión.
  var _traidos = {};
  function traerNube(id) {
    if (!window.ClientesNube || _traidos[id]) return;
    _traidos[id] = true;
    window.ClientesNube.traer(id).then(function (n) {
      if (!n) return;
      var f = leer(id);
      if ((f._t || 0) >= (n._t || 0)) return;
      var nuevo = Object.assign({}, f, n);
      delete nuevo._nube;
      guardarLocal(id, nuevo);
      avisarCambio();
      if (_conv && _conv.id === id) repintar(false);
    });
  }
  function ficha() { return _conv ? leer(_conv.id) : {}; }
  // Otras pantallas (la lista de chats, Seguimiento) muestran la etapa: se
  // les avisa cuando la ficha cambia.
  var _avisoT = null;
  function avisarCambio() {
    clearTimeout(_avisoT);
    _avisoT = setTimeout(function () { document.dispatchEvent(new CustomEvent('sl:ficha')); }, 50);
  }
  function cambiar(fn) { if (!_conv) return; var f = ficha(); fn(f); guardar(_conv.id, f); avisarCambio(); }

  // ── Datos del cliente: lo guardado, o lo que se lee de sus mensajes ──
  function datosDeMensajes() {
    if (!window.ExtraerDatos) return null;
    for (var i = _mensajes.length - 1; i >= 0; i--) {
      var m = _mensajes[i];
      if (m && m.texto && ExtraerDatos.pareceDatos(m.texto)) {
        var r = ExtraerDatos.cliente(m.texto);
        return { id: m.id, at: ms(m.at), datos: r };
      }
    }
    return null;
  }

  function datos() {
    var f = ficha();
    var d = f.datos || {};
    var tel = _conv ? diez(_conv.id) : '';
    return {
      nombre: d.nombre || '', tipoDoc: d.tipoDoc || 'CC', documento: d.documento || '',
      direccion: d.direccion || '', correo: d.correo || '', telefono: d.telefono || tel
    };
  }

  // Si llegó un mensaje con datos y el asesor no ha editado a mano, se usan solos.
  function sincronizarDetectados() {
    var det = datosDeMensajes();
    if (!det) return null;
    var f = ficha();
    if (f.datosMsgId === det.id) return det;
    if (f.editado) return det; // la pantalla ofrece "usar estos" sin pisar lo escrito
    cambiar(function (x) { aplicar(x, det.datos, det.id, det.at); });
    avisarCambio();
    return det;
  }

  function aplicar(f, r, msgId, at) {
    f.datos = f.datos || {};
    f.origen = {};
    ['nombre', 'documento', 'direccion', 'correo', 'telefono'].forEach(function (k) {
      if (r[k]) { f.datos[k] = r[k]; f.origen[k] = r.origen[k] || 'patron'; }
    });
    if (r.documento) f.datos.tipoDoc = r.tipoDoc;
    f.datosMsgId = msgId || '';
    f.datosAt = at || Date.now();
    f.editado = false;
  }

  function datosOk(d) {
    if (!window.Tienda || !Tienda.validarCliente) return !!(d.nombre && d.documento);
    return Tienda.validarCliente(d).ok;
  }

  // ── Lo que pidió en el chat (domain/detectar-productos.js) ──
  var _ix = null, _ixClave = '';
  function catalogoActivo() {
    if (typeof S !== 'undefined' && S.activePriceList === 'lago' && Array.isArray(S.catalogLago) && S.catalogLago.length) return S.catalogLago;
    return typeof CATALOG !== 'undefined' && Array.isArray(CATALOG) ? CATALOG : [];
  }
  function indiceCatalogo() {
    if (!window.DetectarProductos) return null;
    var cat = catalogoActivo();
    var clave = (typeof S !== 'undefined' ? S.activePriceList : '') + ':' + cat.length;
    if (!_ix || _ixClave !== clave) { _ix = window.DetectarProductos.indice(cat); _ixClave = clave; }
    return _ix;
  }
  // Productos que el cliente nombró en sus últimos mensajes (los más nuevos primero).
  function pedidos() {
    var ix = indiceCatalogo();
    if (!ix || !ix.prods.length) return [];
    var vistos = {}, out = [], revisados = 0;
    for (var i = _mensajes.length - 1; i >= 0 && revisados < 6; i--) {
      var m = _mensajes[i];
      if (!m || !m.texto || m.saliente) continue;
      revisados++;
      if (window.ExtraerDatos && window.ExtraerDatos.pareceDatos(m.texto)) continue; // sus datos no son un pedido
      window.DetectarProductos.en(m.texto, ix, 3).forEach(function (r) {
        if (vistos[r.sku] || out.length >= 4) return;
        vistos[r.sku] = true;
        out.push(r);
      });
    }
    return out;
  }
  function productoCatalogo(sku) {
    var cat = catalogoActivo();
    for (var i = 0; i < cat.length; i++) if (String(cat[i].sku) === String(sku)) return cat[i];
    return null;
  }

  // ── Cotizaciones de este cliente ─────────────────────────
  function cotizaciones() {
    if (typeof getHist !== 'function' || !_conv) return [];
    var tel = diez(_conv.id);
    var nombres = [normal(_conv.nombre), normal(datos().nombre)].filter(Boolean);
    return getHist().map(function (x, i) { return { x: x, i: i }; }).filter(function (p) {
      var x = p.x;
      if (x._piiLocked) return false;
      if (tel && diez(x.clienteTel) === tel) return true;
      var n = normal(x.cliente);
      return !!n && nombres.indexOf(n) >= 0;
    }).sort(function (a, b) { return marcaTiempo(b.x) - marcaTiempo(a.x); });
  }
  function marcaTiempo(x) { return x._updatedMs || x.estadoUpdatedAt || 0; }

  function cotizacionElegida(lista) {
    var f = ficha();
    if (f.cotId) for (var i = 0; i < lista.length; i++) if (lista[i].x.id === f.cotId) return lista[i];
    return lista[0] || null;
  }

  // La cotización hecha desde el chat queda con el número del cliente: así
  // Seguimiento puede escribirle sin preguntar el teléfono.
  function vincularTelefono(p) {
    if (!p || !_conv || p.x.clienteTel || p.x._piiLocked) return;
    var h = getHist(), x = h[p.i];
    if (!x || x.id !== p.x.id) return;
    x.clienteTel = diez(_conv.id);
    try { _ls.setJSON(histKey(), h); } catch (e) { return; }
    if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { clienteTel: x.clienteTel });
  }

  function numCot(x) { return typeof quoteDisplayNum === 'function' ? quoteDisplayNum(x.num, x.asesor, x.letra) : String(x.num || ''); }

  // ── Mensajes por WhatsApp ────────────────────────────────
  // ── Factura electrónica (api/facturar.js) ────────────────
  // El servidor dice si hay proveedor (Alegra o Siigo) y si está en modo de
  // prueba; sin proveedor, la sección no aparece.
  var _fe = null, _fePrueba = {}, _feEnviando = false;
  function estadoFactura() {
    if (_fe !== null) return _fe;
    _fe = false;
    var u = window._slAuth && window._slAuth.currentUser;
    if (!u || !window.fetch) return _fe;
    u.getIdToken().then(function (tok) { return fetch('/api/facturar', { headers: { Authorization: 'Bearer ' + tok } }); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { _fe = j && j.proveedor ? j : false; if (_fe && _conv) repintar(false); }, function () { _fe = false; });
    return _fe;
  }
  function ventaPorNumero(numero) {
    if (!window.TiendaApp || !TiendaApp.listo) return Promise.resolve(null);
    return TiendaApp.listo.then(function (db) { return db.ventas({ limite: 1000 }); })
      .then(function (vs) { return (vs || []).filter(function (v) { return v.numero === numero; })[0] || null; });
  }
  function emitirFactura() {
    var f = ficha();
    if (!f.ventaNumero || _feEnviando || !window.FacturaElectronica) return;
    var id = _conv.id;
    _feEnviando = true; repintar(false);
    var fin = function () { _feEnviando = false; if (_conv && _conv.id === id) repintar(false); };
    ventaPorNumero(f.ventaNumero).then(function (v) {
      if (!v) throw new Error('No encontré la venta ' + f.ventaNumero + ' en este computador.');
      var fac = FacturaElectronica.desdeVenta(v);
      var val = FacturaElectronica.validar(fac);
      if (!val.ok) throw new Error(val.errores[0]);
      return window._slAuth.currentUser.getIdToken().then(function (tok) {
        return fetch('/api/facturar', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ factura: fac }) });
      });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || 'No se pudo emitir'); return j; });
    }).then(function (j) {
      if (j.modo === 'prueba') { _fePrueba[id] = j; toast('Modo de prueba: revisa lo que se enviaría a ' + nombreProv(j.proveedor), 'info'); }
      else {
        var g = leer(id);
        g.factura = { proveedor: j.proveedor, numero: String(j.numero || ''), cufe: String(j.cufe || ''), estado: String(j.estado || ''), id: String(j.id || ''), at: Date.now() };
        guardar(id, g);
        toast('Factura ' + (j.numero || '') + ' emitida', 'success');
        if (window.tacto) tacto.sentir('exito');
      }
      fin();
    }).catch(function (e) { toast(e && e.message ? e.message : 'No se pudo emitir la factura', 'warn'); fin(); });
  }
  function nombreProv(p) { return p === 'siigo' ? 'Siigo' : p === 'alegra' ? 'Alegra' : 'el proveedor'; }
  function facturaHtml(f) {
    if (!f.ventaNumero) return '';
    var st = estadoFactura();
    if (f.factura && f.factura.numero) {
      return '<section class="fc-sec"><header><h3>Factura electrónica</h3></header><div class="fc-envio fc-fe-ok"><div><span>Factura ' + esc(f.factura.numero) + '</span><small>' + esc(nombreProv(f.factura.proveedor)) + (f.factura.estado ? ' · ' + esc(f.factura.estado) : '') + '</small></div></div>'
        + (f.factura.cufe ? '<p class="fc-nota fc-cufe">CUFE ' + esc(f.factura.cufe) + '</p>' : '') + '</section>';
    }
    if (!st) return '';
    var prueba = _fePrueba[_conv.id];
    return '<section class="fc-sec"><header><h3>Factura electrónica</h3>' + (st.modo === 'prueba' ? '<span class="fc-cab-der">Modo de prueba</span>' : '') + '</header>'
      + '<p class="fc-nota">Venta ' + esc(f.ventaNumero) + '. ' + (st.modo === 'prueba' ? 'Todavía no se envía a la DIAN: verás exactamente lo que recibiría ' + esc(nombreProv(st.proveedor)) + '.' : 'Se emite con ' + esc(nombreProv(st.proveedor)) + ' y le llega al cliente por correo.') + '</p>'
      + '<div class="fc-fila-btn"><button type="button" class="fc-btn-tinta" data-fc="facturar"' + (_feEnviando ? ' disabled' : '') + '>' + (_feEnviando ? 'Enviando…' : st.modo === 'prueba' ? 'Probar la factura' : 'Emitir factura electrónica') + '</button></div>'
      + (prueba ? '<details class="fc-fe-prueba"><summary>Lo que se enviaría a ' + esc(nombreProv(prueba.proveedor)) + '</summary><pre>' + esc(JSON.stringify({ cliente: prueba.contacto, factura: prueba.cuerpo }, null, 2)) + '</pre></details>' : '')
      + '</section>';
  }

  // ── Envío estimado (domain/envio.js) ─────────────────────
  // La ciudad sale de la dirección leída ("Calle 134 # 19-45, Bogotá").
  var RE_ENVIO = /^ENV[IÍ]O\b/i;
  function ciudadDe(d) {
    var dir = String((d && d.direccion) || '');
    var c = dir.indexOf(',') > 0 ? dir.split(',').pop().trim() : '';
    return c && c.length <= 30 ? c : '';
  }
  function envioDe(cot, d) {
    if (!window.Envio || !cot) return null;
    var ciudad = ciudadDe(d);
    if (!ciudad) return null;
    var todos = cot.x.items || [];
    var its = todos.filter(function (it) { return !RE_ENVIO.test(String(it.name || '')); });
    var pesosEnv = window.Envio.actual().pesos;
    var e = window.Envio.estimar({ ciudad: ciudad, items: its.map(function (it) {
      // La categoría guardada si es una conocida; si no, la del nombre (getCat).
      var cat = String(it._cat || '').toUpperCase();
      if (!(cat in pesosEnv)) cat = typeof getCat === 'function' ? getCat(String(it.name || '')) : 'ADICIONAL';
      return { categoria: cat, cantidad: it.qty, precio: Math.round(Number(it.price) * 1000) };
    }) });
    if (e) e.yaSumado = its.length !== todos.length;
    return e;
  }

  function textoMensaje(clave) {
    var d = datos();
    var nom = primerNombre(d.nombre || (_conv && _conv.nombre));
    var hola = 'Hola' + (nom ? ' ' + nom : '');
    if (clave === 'pedirDatos' || clave === 'datosPago') return window.Empresa ? Empresa.mensaje(clave, { nombre: nom }) : '';
    if (clave === 'envio') {
      var ce = cotizacionElegida(cotizaciones());
      var e = envioDe(ce, d);
      if (!e) return '';
      return hola + ', el envío a ' + e.ciudad + ' te sale aproximadamente entre ' + pesos(e.desde) + ' y ' + pesos(e.hasta) + (e.dias ? ' y llega en ' + e.dias : '') + '. Te confirmo el valor exacto cuando generemos la guía con la transportadora.';
    }
    if (clave === 'pagoRecibido') return hola + ', recibimos tu pago. Gracias por tu compra. Te aviso cuando tu pedido esté en camino.';
    if (clave === 'seguimiento') {
      var c = cotizacionElegida(cotizaciones());
      return hola + ', ¿cómo estás? ¿Pudiste revisar la cotización' + (c ? ' #' + numCot(c.x) : '') + '? Cuéntame si quieres que le cambiemos algo.';
    }
    if (clave === 'cotizacion') {
      var q = cotizacionElegida(cotizaciones());
      if (!q) return '';
      var lineas = (q.x.items || []).map(function (it) {
        var n = Number(it.qty) || 1;
        return '- ' + (n > 1 ? n + ' x ' : '') + it.name + ': ' + pesos(Math.round(Number(it.price) * 1000) * n);
      });
      return hola + ', esta es tu cotización #' + numCot(q.x) + ':\n' + lineas.join('\n') + '\nTotal: ' + pesos(q.x.total) + (q.x.validez ? '\nValidez: ' + q.x.validez : '');
    }
    return '';
  }

  function enviar(clave) {
    var t = textoMensaje(clave);
    if (!t) {
      if (clave === 'datosPago') toast('Escribe tus datos de pago en Mi empresa → Mensajes rápidos', 'warn');
      return;
    }
    window.open('https://wa.me/' + encodeURIComponent(_conv.id) + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
    registrarEnviado(_conv.id, t);
    if (clave === 'pedirDatos') cambiar(function (f) { f.pedidoAt = Date.now(); });
    if (window.tacto) tacto.sentir('cambio');
    repintar(true);
  }

  // ── Pasos ────────────────────────────────────────────────
  function etapa(cot, d, f) {
    if (f.pagoAt) return 4;
    if (f.ventaNumero) return 3;
    if (datosOk(d)) return 2;
    if (cot) return 1;
    return 0;
  }

  function proximo(cot, d, f, det) {
    var nom = primerNombre(d.nombre || _conv.nombre) || 'el cliente';
    if (f.pagoEstado === 'aprobado') return { eti: 'Listo', titulo: 'Pago aprobado', txt: 'Venta ' + (f.ventaNumero || '') + (f.pagoNota ? ' · ' + f.pagoNota : '') + '. Avísale que recibimos su pago.', btn: ['msg:pagoRecibido', 'wa', 'Avisar que recibimos el pago'], alt: ['ver-pagos', 'Ver el comprobante'] };
    if (f.pagoEstado === 'rechazado') return { eti: 'Hay que resolverlo', titulo: 'Pago rechazado', txt: (f.pagoNota ? f.pagoNota + '. ' : '') + 'Pídele otro comprobante o vuelve a mandarle los datos para pagar.', btn: ['comprobante', 'pago', 'Adjuntar otro comprobante'], alt: ['msg:datosPago', 'Enviar datos para pagar'] };
    if (f.pagoAt) return { eti: 'En revisión', titulo: 'Pago en revisión', txt: 'Venta ' + (f.ventaNumero || '') + '. El jefe revisa el comprobante en Pagos; te aviso aquí apenas lo apruebe.', btn: ['ver-pagos', 'pago', 'Ver en Pagos'], alt: ['msg:pagoRecibido', 'Avisar que recibimos el pago'] };
    if (f.ventaNumero) return { eti: 'Siguiente paso', titulo: 'Espera el pago', txt: 'Venta ' + f.ventaNumero + '. Cuando te mande el pantallazo, adjúntalo y queda unido a la venta.', btn: ['comprobante', 'pago', 'Adjuntar comprobante'], alt: ['msg:datosPago', 'Enviar datos para pagar'] };
    if (datosOk(d)) {
      var pedTodo = cot ? [] : pedidos();
      var resumen = cot ? (cot.x.items || []).length + ' productos · ' + pesos(cot.x.total)
        : pedTodo.length ? 'Sin cotización: la venta lleva lo que pidió (' + pedTodo.map(function (x) { return x.nombre.split(' ').slice(0, 4).join(' '); }).join(', ') + ')'
        : 'Sin cotización: agregas los productos en Vender';
      // Inventario: si algo no alcanza, se dice antes de vender.
      var faltan = cot && window.Existencias ? window.Existencias.faltantes(cot.x.items) : [];
      if (faltan.length) resumen += '. Ojo: ' + faltan.map(function (x) { return x.nombre.split(' ').slice(0, 4).join(' ') + ' (hay ' + x.hay + ')'; }).join(', ');
      return { eti: 'Siguiente paso', titulo: 'Todo listo para vender', txt: (det && f.datosMsgId === det.id ? 'Leí sus datos del mensaje de las ' + hora(det.at) + '. ' : '') + resumen + '.', btn: ['vender', 'venta', 'Crear la venta'], alt: ['msg:datosPago', 'Enviar datos para pagar'] };
    }
    if (!cot) {
      var ped = pedidos();
      if (ped.length) return { eti: 'Siguiente paso', titulo: 'Pidió ' + ped[0].nombre.split(' ').slice(0, 5).join(' ') + (ped.length > 1 ? ' y ' + (ped.length - 1) + ' más' : ''), txt: 'Arma la cotización con lo que pidió y mándale la imagen de siempre: queda copiada para pegarla en su WhatsApp.', btn: ['cotizar-enviar', 'cotizar', 'Cotizar y enviar la imagen'], alt: ['cotizar', 'Armarla a mano en Cotizar'] };
      return { eti: 'Siguiente paso', titulo: 'Cotízale lo que pidió', txt: 'Se abre Cotizar con el nombre de ' + nom + ' ya puesto. Si ya tiene una cotización, elígela abajo.', btn: ['cotizar', 'cotizar', 'Cotizar para ' + nom], alt: null };
    }
    if (f.pedidoAt) return { eti: 'Esperando al cliente', titulo: 'Esperando sus datos', txt: 'Se los pediste ' + hace(f.pedidoAt) + '. Cuando responda por aquí, la app los lee sola.', btn: ['pegar', 'leer', 'Pegar su respuesta'], alt: ['msg:pedirDatos', 'Volver a pedir'] };
    return { eti: 'Siguiente paso', titulo: 'Pídele sus datos', txt: 'Un solo mensaje con todo: nombre, cédula, dirección de envío y correo para la factura.', btn: ['msg:pedirDatos', 'wa', 'Pedir datos por WhatsApp'], alt: ['pegar', 'Ya me los mandó: pegarlos'] };
  }

  // ── Pintar ───────────────────────────────────────────────
  function campo(k, etiqueta, valor, f, extra) {
    var o = f.origen && f.origen[k];
    return '<label class="fc-campo' + (o ? ' fc-det' : '') + '"><span>' + etiqueta + (o === 'patron' ? '<em>Revisar</em>' : '') + '</span>'
      + (extra || '') + '<input data-fc-dato="' + k + '" value="' + esc(valor) + '" autocomplete="off"' + (k === 'correo' ? ' type="email"' : '') + (k === 'telefono' || k === 'documento' ? ' inputmode="numeric"' : '') + '></label>';
  }

  function html() {
    var c = _conv, f = ficha(), d = datos();
    var det = sincronizarDetectados();
    f = ficha(); d = datos();
    var lista = cotizaciones();
    var cot = cotizacionElegida(lista);
    if (cot) vincularTelefono(cot);
    var paso = etapa(cot, d, f);
    var p = proximo(cot, d, f, det);
    // Su historia con la tienda (ui/historia-cliente.js): cifras arriba,
    // detalle después del siguiente paso.
    var hist = window.HistoriaChat ? window.HistoriaChat.de(c, d) : null;
    var nombre = d.nombre || c.nombre || 'Cliente sin nombre';
    var ini = String(nombre).split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();

    var pasos = ['Cotización', 'Datos', 'Venta', 'Pago'].map(function (n, i) {
      return '<li class="' + (i < paso ? 'hecho' : i === paso ? 'ahora' : '') + '"><i></i><span>' + n + '</span></li>';
    }).join('');

    var btn = p.btn;
    var accion = '<button type="button" class="fc-principal" data-fc="' + btn[0] + '">' + svg(btn[1]) + esc(btn[2]) + '</button>';
    var alt = p.alt ? '<button type="button" class="fc-alt" data-fc="' + p.alt[0] + '">' + esc(p.alt[1]) + '</button>' : '';

    var nuevoDet = det && f.editado && f.datosMsgId !== det.id
      ? '<div class="fc-aviso"><span>Llegó un mensaje con datos (' + esc(hora(det.at)) + ').</span><button type="button" class="fc-alt" data-fc="usar-detectados">Usar estos</button></div>' : '';

    var tipos = ['CC', 'NIT', 'CE', 'TI', 'PPT', 'PAS'].map(function (t) { return '<option' + (t === d.tipoDoc ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    // Como en la maqueta aprobada: filas limpias (etiqueta a la izquierda,
    // valor a la derecha). "Editar" las vuelve campos para corregir.
    var leidosChat = f.datosAt && f.origen && Object.keys(f.origen).length;
    var completos = datosOk(d);
    var editando = _editar || _pegar || (!completos && !leidosChat && (d.documento || d.direccion || d.correo));
    var fila = function (k, eti, valor) {
      var o = f.origen && f.origen[k];
      return '<div class="fc-fila' + (o ? ' fc-leido' : '') + '"><span>' + eti + (o === 'patron' ? '<em>Revisar</em>' : '') + '</span>'
        + (valor ? '<b>' + esc(valor) + '</b>' : '<b class="fc-falta">Falta</b>') + '</div>';
    };
    var docTxt = d.documento ? (d.tipoDoc || 'CC') + ' ' + (window.Tienda && Tienda.formatearDocumento ? Tienda.formatearDocumento(d.tipoDoc || 'CC', d.documento) : d.documento) : '';
    var filasHtml = '<div class="fc-filas">'
      + fila('nombre', 'Nombre', d.nombre)
      + fila('documento', d.tipoDoc === 'NIT' ? 'NIT' : 'Cédula', docTxt)
      + fila('direccion', 'Dirección', d.direccion)
      + fila('correo', 'Correo', d.correo)
      + (d.telefono && d.telefono !== diez(c.id) ? fila('telefono', 'Teléfono', d.telefono) : '')
      + '</div>';
    var datosHtml = '<section class="fc-sec"><header><h3>Datos para la factura</h3>'
      + (editando ? '<button type="button" class="fc-link" data-fc="pegar">' + svg('leer') + 'Leer de un mensaje</button>'
        : '<span class="fc-cab-der">' + (leidosChat ? (f.datosMsgId ? 'Leídos del chat' : 'Leídos del texto pegado') + ' · ' : '') + '<button type="button" class="fc-link fc-link-plano" data-fc="editar">' + (d.nombre || d.documento ? 'Editar' : 'Agregar') + '</button></span>')
      + '</header>'
      + nuevoDet
      + (_pegar ? '<div class="fc-pegar"><textarea id="fcPegar" rows="4" placeholder="Pega aquí la respuesta del cliente"></textarea><div class="fc-fila-btn"><button type="button" class="fc-alt" data-fc="cerrar-pegar">Cancelar</button><button type="button" class="fc-btn-tinta" data-fc="leer">Leer datos</button></div></div>' : '')
      + (editando ? '<div class="fc-campos">'
        + campo('nombre', 'Nombre', d.nombre, f)
        + campo('documento', 'Documento', d.documento, f, '<select data-fc-dato="tipoDoc" aria-label="Tipo de documento">' + tipos + '</select>')
        + campo('direccion', 'Dirección de envío', d.direccion, f)
        + campo('correo', 'Correo', d.correo, f)
        + campo('telefono', 'Teléfono', d.telefono, f)
        + '</div>' + (_editar ? '<div class="fc-fila-btn"><button type="button" class="fc-btn-tinta" data-fc="listo-editar">Listo</button></div>' : '')
        : filasHtml)
      + '</section>';

    var cotHtml;
    if (cot) {
      var its = (cot.x.items || []);
      cotHtml = '<section class="fc-sec"><header><h3>Cotización #' + esc(numCot(cot.x)) + '</h3><button type="button" class="fc-link fc-link-plano" data-fc="abrir-cot">Abrir</button></header>'
        + '<div class="fc-cot"><ul>' + its.slice(0, 5).map(function (it) {
            var n = Number(it.qty) || 1;
            var ex = window.Existencias ? window.Existencias.etiqueta(it.sku, n) : '';
            // Solo se avisa lo que no alcanza: lo demás queda limpio.
            if (ex.indexOf('ex-ok') >= 0) ex = '';
            return '<li><span><i class="fc-cot-nom">' + (n > 1 ? n + ' × ' : '') + esc(it.name) + '</i>' + ex + '</span><b>' + esc(pesos(Math.round(Number(it.price) * 1000) * n)) + '</b></li>';
          }).join('')
        + (its.length > 5 ? '<li class="fc-mas"><span>y ' + (its.length - 5) + ' más</span></li>' : '') + '</ul>'
        + '<div class="fc-cot-total"><span>Total</span><b>' + esc(pesos(cot.x.total)) + '</b></div></div>'
        + (function () {
            var e = envioDe(cot, d);
            if (!e) return ciudadDe(d) || !window.Envio ? '' : '<p class="fc-nota">Con la ciudad en la dirección te digo cuánto sale el envío.</p>';
            return '<div class="fc-envio"><div><span>Envío estimado a ' + esc(e.ciudad) + '</span><small>' + e.kg + ' kg · ' + esc(e.zona) + (e.dias ? ' · ' + esc(e.dias) : '') + '</small></div><b>' + esc(pesos(e.desde)) + ' a ' + esc(pesos(e.hasta)) + '</b></div>'
              + '<div class="fc-fila-btn">' + (e.yaSumado ? '<span class="fc-nota">El envío ya está en la cotización.</span>' : '<button type="button" class="fc-alt" data-fc="sumar-envio">Sumar ' + esc(pesos(e.total)) + ' a la cotización</button>')
              + '<button type="button" class="fc-alt" data-fc="msg:envio">Decírselo</button></div>';
          })()
        + (lista.length > 1 ? '<label class="fc-otra"><span>Otra cotización de este cliente</span><select data-fc-cot>' + lista.map(function (q) { return '<option value="' + esc(q.x.id) + '"' + (q.x.id === cot.x.id ? ' selected' : '') + '>#' + esc(numCot(q.x)) + ' · ' + esc(pesos(q.x.total)) + '</option>'; }).join('') + '</select></label>' : '')
        + '</section>';
    } else {
      var recientes = (typeof getHist === 'function' ? getHist() : []).map(function (x) { return x; }).filter(function (x) { return !x._piiLocked; }).slice(0, 10);
      cotHtml = '<section class="fc-sec"><header><h3>Cotización</h3></header>'
        + (recientes.length ? '<label class="fc-otra"><span>¿Ya le cotizaste? Elígela</span><select data-fc-cot><option value="">Elegir de tus cotizaciones recientes</option>' + recientes.map(function (x) { return '<option value="' + esc(x.id) + '">#' + esc(numCot(x)) + ' · ' + esc(x.cliente || 'Sin nombre') + ' · ' + esc(pesos(x.total)) + '</option>'; }).join('') + '</select></label>' : '<p class="fc-nota">Todavía no tiene cotización.</p>')
        + '</section>';
    }

    // Los mensajes rápidos van abajo del chat, junto al cuadro de texto
    // (ui/whatsapp-inbox.js), como en la Dirección 1.
    var rapidos = '';

    // Bajo el nombre (maqueta aprobada: "Cliente nueva · Bogotá"): qué tipo
    // de cliente es, cuánto ha comprado y su ciudad.
    var sub = [];
    if (hist) {
      var tiposCliente = { nuevo: 'Cliente nuevo', prospecto: 'Todavía no compra', recurrente: 'Ya te compró', frecuente: 'Cliente frecuente', dormido: 'Hace tiempo no compra' };
      sub.push(tiposCliente[hist.tipo] || 'Cliente');
      if (hist.compras) sub.push(hist.compras + (hist.compras === 1 ? ' compra' : ' compras') + ' · ' + (window.HistoriaChat.corto ? window.HistoriaChat.corto(hist.comprado) : pesos(hist.comprado)));
    }
    var ciudad = d.direccion && d.direccion.indexOf(',') > 0 ? d.direccion.split(',').pop().trim() : '';
    if (ciudad && ciudad.length <= 24) sub.push(ciudad);
    if (!sub.length) sub.push('+' + c.id);

    // Lo que pidió en el chat, con precio y existencias (si no está ya en su cotización)
    var ped = pedidos().filter(function (r) { return !cot || !(cot.x.items || []).some(function (it) { return String(it.sku) === r.sku; }); });
    var pedHtml = ped.length ? '<section class="fc-sec fc-pedido"><header><h3>Pidió en el chat</h3></header><ul>'
      + ped.map(function (r) {
          var ex = window.Existencias ? window.Existencias.etiqueta(r.sku, 1) : '';
          return '<li><label><input type="checkbox" data-fc-ped="' + esc(r.sku) + '" checked><span>' + esc(r.nombre) + '</span></label><b>' + esc(pesos(r.precio)) + '</b>' + (ex ? '<i>' + ex + '</i>' : '') + '</li>';
        }).join('') + '</ul>'
      + '<div class="fc-fila-btn"><button type="button" class="fc-alt" data-fc="cotizar-pedido">' + (cot ? 'Agregar a una cotización nueva' : 'Solo cotizar') + '</button><button type="button" class="fc-btn-tinta" data-fc="cotizar-enviar">Cotizar y enviar la imagen</button></div></section>' : '';

    var out = '<div class="fc">'
      + '<div class="fc-quien"><span class="fc-av ' + (window.tonoAvatar ? window.tonoAvatar(c.nombre || c.id) : '') + '">' + esc(ini) + '</span><div><b>' + esc(nombre) + '</b><span>' + esc(sub.join(' · ')) + '</span></div>'
      + '<button type="button" class="fc-ico" data-fc="copiar-num" aria-label="Copiar número +' + esc(c.id) + '" title="Copiar número +' + esc(c.id) + '">' + svg('copiar') + '</button></div>'
      + '<ol class="fc-pasos" aria-label="Avance de la venta">' + pasos + '</ol>'
      + '<div class="fc-proximo fc-arte' + (_ultimoPaso !== c.id + p.titulo ? ' fc-cambia' : '') + '"><p>' + esc(p.eti) + '</p><h2>' + esc(p.titulo) + '</h2><span>' + esc(p.txt) + '</span>' + accion + alt + '</div>'
      + pedHtml + datosHtml + cotHtml + facturaHtml(f)
      // Su historia con la tienda (ui/historia-cliente.js): cifras,
      // sugerencia y detalle, debajo de lo que se usa para vender.
      + (hist ? '<section class="fc-sec fc-hist-sec"><header><h3>Su historia con la tienda</h3></header>' + window.HistoriaChat.resumenHtml(hist) + '</section>' + window.HistoriaChat.detalleHtml(hist, c.id) : '')
      + rapidos
      + '</div>';
    _ultimoPaso = c.id + p.titulo;
    return out;
  }

  function repintar(forzar) {
    if (!_ctx || !_conv) return;
    // No se redibuja mientras se escribe en la ficha (se perdería el cursor).
    if (!forzar && _ctx.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    _ctx.innerHTML = html();
  }

  // ── Acciones ─────────────────────────────────────────────
  function crearVenta() {
    if (!window.TiendaVender || !TiendaVender.prellenar) { toast('Vender no está disponible en este plan', 'warn'); return; }
    var d = datos(), f = ficha();
    var cot = cotizacionElegida(cotizaciones());
    _ventaDesde = _conv.id;
    // Con qué dijo que paga ("ya transferí por Nequi"), en sus últimos mensajes
    var medio = '';
    if (window.ExtraerDatos && ExtraerDatos.medioPago && window.Empresa) {
      for (var i = _mensajes.length - 1; i >= 0 && i >= _mensajes.length - 10 && !medio; i--) {
        if (_mensajes[i] && _mensajes[i].texto) medio = ExtraerDatos.medioPago(_mensajes[i].texto, Empresa.mediosPago());
      }
    }
    // Sin cotización (compra directa): lo que pidió en el chat entra a la venta
    var items = cot ? cot.x.items || [] : pedidos().map(function (r) {
      var p = productoCatalogo(r.sku) || {};
      return { sku: r.sku, name: p.name || r.nombre, price: p.price != null ? p.price : r.precio / 1000, _cat: p._cat || r.categoria || null, qty: 1 };
    });
    TiendaVender.prellenar({
      cliente: d,
      detectados: f.origen || {},
      items: items,
      referencia: cot ? 'Cot. ' + numCot(cot.x) : '',
      medio: medio
    }).then(function (ok) {
      if (ok) toast(datosOk(d) ? 'Venta armada con el cliente y su cotización: revisa y registra' : 'Completa los datos que faltan y registra', 'success');
    });
  }

  // Arma la cotización con lo que pidió (los marcados) y, si se pide, manda
  // la imagen de siempre a su WhatsApp (ui/cotizacion-imagen.js).
  function cotizarPedido(yEnviar) {
    if (!window.CotizacionImagen) return;
    var marcados = [].slice.call(_ctx.querySelectorAll('[data-fc-ped]')).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-fc-ped'); });
    var lista = pedidos().filter(function (r) { return !marcados.length || marcados.indexOf(r.sku) >= 0; });
    if (!lista.length) { toast('Marca al menos un producto', 'warn'); return; }
    var d = datos();
    var productos = lista.map(function (r) {
      var p = productoCatalogo(r.sku) || {};
      return { sku: r.sku, name: p.name || r.nombre, price: p.price != null ? p.price : r.precio / 1000, _cat: p._cat || null, qty: 1, source: p._listSource };
    });
    var id = window.CotizacionImagen.armar({ cliente: d.nombre || _conv.nombre || '', tel: _conv.id, productos: productos });
    if (!id) { toast('No se pudo armar la cotización', 'warn'); return; }
    cambiar(function (f) { f.cotId = id; });
    repintar(true);
    if (yEnviar) enviarImagen(); else toast('Cotización armada: queda en Cotizar y en su ficha', 'success');
  }

  function enviarImagen() {
    var cot = cotizacionElegida(cotizaciones());
    if (!cot || !window.CotizacionImagen) { toast('Este cliente todavía no tiene cotización', 'warn'); return; }
    if (!window.CotizacionImagen.abrir(cot.x.id)) { toast('No se pudo abrir la cotización', 'warn'); return; }
    var nom = primerNombre(datos().nombre || _conv.nombre);
    var texto = 'Hola' + (nom ? ' ' + nom : '') + ', te envío tu cotización #' + numCot(cot.x) + '.';
    var id = _conv.id;
    if (window.showToast) showToast('Preparando la imagen de la cotización…', 'info', null, 1500);
    window.CotizacionImagen.enviar({ waId: id, texto: texto, alListo: function (r) {
      registrarEnviado(id, texto, r.miniatura);
      if (window.tacto) tacto.sentir('exito');
    } }).catch(function (e) { toast(e.message || 'No se pudo generar la imagen', 'warn'); });
  }

  // Respuesta sugerida por la IA con el catálogo real: lo que pidió, precio y
  // existencias. Queda en el cuadro de texto para revisarla antes de enviar.
  function sugerirRespuesta() {
    if (!window.AI || !window.AI.chat) return Promise.reject(new Error('La IA no está disponible en este plan'));
    var d = datos();
    var nom = primerNombre(d.nombre || (_conv && _conv.nombre));
    var ultimos = _mensajes.filter(function (m) { return m && m.texto; }).slice(-6).map(function (m) { return (m.saliente ? 'Asesor: ' : 'Cliente: ') + m.texto; }).join('\n');
    var prods = pedidos().map(function (r) {
      var ex = window.Existencias ? window.Existencias.de(r.sku) : null;
      return '- ' + r.nombre + ' | ' + pesos(r.precio) + (ex === null ? '' : ' | ' + (ex > 0 ? ex + ' en bodega' : 'agotado'));
    }).join('\n');
    var cot = cotizacionElegida(cotizaciones());
    var yo = String(((window._slAuth && window._slAuth.currentUser) || {}).displayName || '').split(' ')[0];
    var sistema = 'Eres asesor de ventas de una tienda de tecnología en Colombia y respondes por WhatsApp. Escribe UNA respuesta corta (máximo 3 frases), cálida y concreta, en español de Colombia, sin emojis. '
      + 'Usa solo los productos, precios y existencias que te doy; si algo está agotado dilo y ofrece la alternativa de la lista. No inventes precios ni productos. '
      + 'Si falta información para cotizar, haz una sola pregunta. Devuelve solo el texto del mensaje.';
    var usuario = 'Cliente: ' + (nom || 'sin nombre') + (yo ? '\nAsesor: ' + yo : '')
      + '\n\nConversación reciente:\n' + (ultimos || '(sin mensajes)')
      + '\n\nProductos del catálogo que coinciden con lo que pide:\n' + (prods || '(ninguno)')
      + (cot ? '\n\nYa tiene la cotización #' + numCot(cot.x) + ' por ' + pesos(cot.x.total) + '.' : '');
    return window.AI.chat({ perfil: 'texto', system: sistema, messages: [{ rol: 'usuario', texto: usuario }], max_tokens: 300 })
      .then(function (r) { return String((r && r.texto) || '').trim(); });
  }

  function adjuntar() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.addEventListener('change', function () {
      if (!inp.files || !inp.files[0] || !window.Pagos) return;
      var f = ficha(), d = datos();
      Pagos.nuevo(inp.files[0], { cliente: d.nombre, valor: f.ventaTotal || 0, venta: f.ventaNumero || '' });
      cambiar(function (x) { x.pagoAt = Date.now(); });
    });
    inp.click();
  }

  function alClic(e) {
    var b = e.target.closest('[data-fc]');
    if (!b || !_conv) return;
    var a = b.getAttribute('data-fc');
    if (a.indexOf('msg:') === 0) { enviar(a.slice(4)); return; }
    if (a === 'cotizar-enviar' || a === 'cotizar-pedido') { cotizarPedido(a === 'cotizar-enviar'); return; }
    if (a === 'enviar-imagen') { enviarImagen(); return; }
    if (a === 'facturar') { emitirFactura(); return; }
    if (a === 'sumar-envio') {
      var qc = cotizacionElegida(cotizaciones());
      var en = envioDe(qc, datos());
      if (!qc || !en || !window.CotizacionImagen || !CotizacionImagen.agregar) return;
      var okEnv = CotizacionImagen.agregar(qc.x.id, { name: 'ENVÍO A ' + en.ciudad.toUpperCase(), price: en.total / 1000 });
      if (okEnv) { toast('Envío a ' + en.ciudad + ' sumado: ' + pesos(en.total), 'success'); if (window.tacto) tacto.sentir('encaje'); }
      else toast('No pude abrir la cotización para sumar el envío', 'warn');
      repintar(true);
      return;
    }
    if (a === 'cotizar') {
      var cli = document.getElementById('cliente');
      var nom = datos().nombre || _conv.nombre || '';
      if (cli && nom) { cli.value = nom; cli.dispatchEvent(new Event('input', { bubbles: true })); }
      var t = document.getElementById('tab-q'); if (t) t.click(); else switchTab('q');
      toast('Cotización para ' + (nom || '+' + _conv.id), 'info');
    } else if (a === 'vender') crearVenta();
    else if (a === 'comprobante') adjuntar();
    else if (a === 'ver-pagos') { if (window.Pagos) Pagos.abrir(); }
    else if (a === 'pegar') {
      _pegar = true; repintar(true);
      var ta = document.getElementById('fcPegar');
      if (ta) {
        ta.focus();
        if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (txt) { if (txt && !ta.value) ta.value = txt; }, function () {});
      }
    } else if (a === 'cerrar-pegar') { _pegar = false; repintar(true); }
    else if (a === 'editar') { _editar = true; repintar(true); var pc = _ctx.querySelector('[data-fc-dato="nombre"]'); if (pc) pc.focus(); }
    else if (a === 'listo-editar') { _editar = false; repintar(true); }
    else if (a === 'leer') {
      var tx = document.getElementById('fcPegar');
      var r = tx && window.ExtraerDatos ? ExtraerDatos.cliente(tx.value) : null;
      if (!r || (!r.encontrados && !r.telefono)) { toast('No encontré datos en ese texto', 'warn'); return; }
      cambiar(function (f) { aplicar(f, r, '', Date.now()); f.editado = true; });
      _pegar = false; repintar(true);
      if (window.tacto) tacto.sentir('encaje');
      toast(r.faltan.length ? 'Datos leídos. Falta: ' + r.faltan.join(', ') : 'Datos leídos', r.faltan.length ? 'info' : 'success');
    } else if (a === 'usar-detectados') {
      var det = datosDeMensajes();
      if (det) cambiar(function (f) { aplicar(f, det.datos, det.id, det.at); });
      repintar(true);
    } else if (a === 'abrir-cot') {
      var c = cotizacionElegida(cotizaciones());
      if (c && typeof loadHist === 'function') { loadHist(c.i); var tq = document.getElementById('tab-q'); if (tq) tq.click(); else switchTab('q'); }
    } else if (a === 'copiar-num') {
      var num = '+' + _conv.id;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(num).then(function () { toast('Número copiado', 'success'); }, function () { toast(num); });
    }
  }

  var _guardarT = null;
  function alEscribir(e) {
    var el = e.target, k = el && el.getAttribute('data-fc-dato');
    if (!k || !_conv) return;
    clearTimeout(_guardarT);
    var valor = el.value;
    _guardarT = setTimeout(function () {
      cambiar(function (f) {
        f.datos = f.datos || {};
        f.datos[k] = valor;
        f.editado = true;
        if (f.origen) delete f.origen[k];
      });
    }, 250);
  }

  function alCambiar(e) {
    var el = e.target;
    if (el && el.hasAttribute('data-fc-cot')) {
      var id = el.value;
      if (!id) return;
      cambiar(function (f) { f.cotId = id; });
      // Si se eligió de la lista general, queda unida a este cliente.
      var h = getHist();
      for (var i = 0; i < h.length; i++) if (h[i].id === id) { vincularTelefono({ x: h[i], i: i }); break; }
      repintar(true);
      return;
    }
    if (el && el.getAttribute('data-fc-dato') === 'tipoDoc') cambiar(function (f) { f.datos = f.datos || {}; f.datos.tipoDoc = el.value; f.editado = true; });
    if (el && el.hasAttribute('data-fc-dato')) setTimeout(function () { repintar(false); }, 300); // el siguiente paso puede cambiar
  }

  // Al salir de la ficha con el teclado o el ratón, se pone al día el paso.
  function alSalir() {
    setTimeout(function () { if (_ctx && !_ctx.contains(document.activeElement)) repintar(false); }, 0);
  }

  // Venta registrada en Vender que salió de una ficha: la ficha avanza sola.
  document.addEventListener('sl:venta', function (e) {
    var det = e.detail || {};
    if (!_ventaDesde || !det.venta) return;
    var id = _ventaDesde;
    _ventaDesde = '';
    var f = leer(id);
    f.ventaNumero = det.venta.numero || '';
    f.ventaId = det.venta.id || '';
    f.ventaTotal = det.venta.total || 0;
    f.ventaAt = Date.now();
    if (det.comprobantes) f.pagoAt = Date.now();
    guardar(id, f);
    avisarCambio(); // la lista de chats cambia la etiqueta a "Venta · espera el pago"
    if (_conv && _conv.id === id) repintar(true);
  });

  // Lo que el asesor mandó desde la app (se abrió en WhatsApp con el texto):
  // se guarda en la ficha para mostrarlo en el hilo (los últimos 30).
  function registrarEnviado(id, texto, imagen) {
    var f = leer(id);
    var e = { texto: String(texto).slice(0, 2000), at: Date.now() };
    if (imagen && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(imagen) && imagen.length < 60000) e.imagen = imagen;
    f.enviados = (f.enviados || []).concat([e]).slice(-30);
    if (window.WaInbox && window.WaInbox.marcarRespondido) window.WaInbox.marcarRespondido(id);
    guardar(id, f);
    avisarCambio();
  }

  // Etapa de cualquier chat para la lista (sin abrirlo): lo guardado en su
  // ficha y sus cotizaciones. [texto, tono] para la etiqueta.
  function etapaDe(conv) {
    if (!conv) return null;
    var guardado = _conv;
    _conv = conv;
    try {
      var f = ficha(), d = datos();
      var lista = cotizaciones();
      if (f.pagoEstado === 'aprobado') return ['Pagado', 'men'];
      if (f.pagoEstado === 'rechazado') return ['Pago rechazado', 'ros'];
      if (f.pagoAt) return ['Pago en revisión', 'dur'];
      if (f.ventaNumero) return ['Venta · espera el pago', 'ros'];
      if (datosOk(d)) return ['Datos listos para vender', 'lav'];
      if (f.pedidoAt) return ['Datos pedidos', 'gris'];
      if (lista.length) return ['Cotizado · esperando', 'gris'];
      return ['Nuevo · por cotizar', 'cie'];
    } finally { _conv = guardado; }
  }

  document.addEventListener('sl:existencias', function () { if (_conv) repintar(false); });
  document.addEventListener('sl:historia', function () { if (_conv) repintar(false); });

  // El jefe aprobó o rechazó un comprobante (infrastructure/comprobantes.js):
  // la ficha de ese cliente avanza sola y el asesor se entera.
  document.addEventListener('sl:pago-revisado', function (e) {
    var d = e.detail || {};
    if (!d.ventaNumero) return;
    var yo = ((window._slAuth && window._slAuth.currentUser) || {}).email || '';
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf(LS) !== 0) return;
      var f = leer(k.slice(LS.length));
      if (f.ventaNumero !== d.ventaNumero) return;
      f.pagoEstado = d.estado; f.pagoNota = d.nota || ''; f.pagoAt = f.pagoAt || Date.now();
      if (d.estado === 'aprobado') f.pagoAprobadoAt = f.pagoAprobadoAt || Date.now();
      guardar(k.slice(LS.length), f);
      if (String(d.email).toLowerCase() === String(yo).toLowerCase() && window.showToast) {
        showToast(d.estado === 'aprobado' ? 'Pago aprobado: venta ' + d.ventaNumero : 'Pago rechazado: venta ' + d.ventaNumero + (d.nota ? ' · ' + d.nota : ''), d.estado === 'aprobado' ? 'success' : 'warn', null, 5000);
      }
    });
    avisarCambio();
    if (_conv) repintar(false);
  });

  window.FichaCliente = {
    etapa: etapaDe,
    registrarEnviado: registrarEnviado,
    enviarImagen: function () { if (_conv) enviarImagen(); },
    sugerirRespuesta: sugerirRespuesta,
    enviados: function (id) { return (leer(id).enviados || []).slice(); },
    // Todas las fichas de este navegador, para los recordatorios (Seguimiento)
    todas: function () {
      var out = [];
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(LS) === 0) out.push({ id: k.slice(LS.length), f: leer(k.slice(LS.length)) }); });
      return out;
    },
    // Recordatorio enviado o pospuesto: no vuelve hasta dentro de 24 h
    recordado: function (id, tipo, texto) {
      var f = leer(id);
      f.recordado = f.recordado || {};
      f.recordado[tipo] = Date.now();
      guardar(id, f);
      if (texto) registrarEnviado(id, texto);
      avisarCambio();
    },
    // Texto listo de un mensaje rápido para el chat abierto ('' si no aplica)
    texto: function (clave) { return _conv ? textoMensaje(clave) : ''; },
    // El asesor lo mandó: la ficha avanza (p. ej. "Esperando sus datos")
    enviado: function (clave) {
      if (clave === 'pedirDatos') { cambiar(function (f) { f.pedidoAt = Date.now(); }); repintar(true); }
    },
    cotizacionDe: function (conv) {
      var guardado = _conv; _conv = conv;
      try { var c = cotizacionElegida(cotizaciones()); return c ? { num: numCot(c.x), total: c.x.total } : null; }
      finally { _conv = guardado; }
    },
    pintar: function (ctx, conv, mensajes) {
      var otra = !_conv || !conv || _conv.id !== conv.id;
      _ctx = ctx; _conv = conv; _mensajes = mensajes || [];
      if (otra) { _pegar = false; _editar = false; traerNube(conv.id); }
      if (!ctx.dataset.fc) {
        ctx.dataset.fc = '1';
        ctx.addEventListener('click', alClic);
        ctx.addEventListener('input', alEscribir);
        ctx.addEventListener('change', alCambiar);
        ctx.addEventListener('focusout', alSalir);
      }
      repintar(otra);
    }
  };
})();
