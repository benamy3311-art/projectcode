// ============================================================
// VENDER — cliente, productos del inventario, pago y documento
// ============================================================
// El recorrido de una venta, pensado para atender rápido y sin soltar el
// teclado:
//   1. Cliente. Un solo campo: cédula o nombre. Si ya compró, aparece y se
//      elige con Enter. Si no, el mismo texto pasa al formulario (los
//      números al documento, las letras al nombre). Nombre y documento son
//      obligatorios; teléfono, correo y dirección, opcionales.
//   2. Productos. Se abre solo cuando el cliente está completo. Busca en el
//      inventario con existencias y precios; Enter añade el primero. Se
//      puede traer la cotización actual entera.
//   3. Pago y documento. Recibo de compra o remisión; uno o varios medios
//      de pago; Ctrl+Enter registra. La venta se guarda en una sola
//      transacción (infrastructure/tienda-db.js) y aparece el documento
//      listo para imprimir o mandar por WhatsApp.
// El borrador vive en sessionStorage: si la página se recarga a mitad de
// una venta, se recupera.
//
// Globales que expone (window.*):
//   TiendaVender.montar(), .desdeCotizacion(), .venderA(cliente)
// Depende de: ui/tienda-app.js, domain/tienda.js, ui.js (switchTab, showToast)
// Requiere DOM: #venRaiz
// ============================================================
(function () {
  var A = window.TiendaApp, T = window.Tienda;
  if (!A || !T) return;
  var esc = A.esc, fmt = A.fmt;
  var db = null, raiz = null, montado = false;
  var CLAVE_BORRADOR = 'tienda:borrador';

  function borradorNuevo() {
    return {
      id: T.nuevoId(),
      clienteModo: 'buscar',          // buscar | nuevo | listo
      cliente: null,
      form: { tipoDoc: 'CC', documento: '', nombre: '', telefono: '', correo: '', direccion: '', autorizaDatos: false },
      items: [],
      tipo: 'recibo',
      pagos: [{ medio: T.mediosPago()[0], valor: 0 }], // medios de "Mi empresa" (domain/empresa.js)
      pagosAuto: true,
      descuentoPct: 0,
      orden: { numero: '', entrega: '' },
      notas: '',
      recibido: '',
      mostrarIva: false
    };
  }
  var v = borradorNuevo();
  var vista = 'nueva';
  var guardando = false;

  // El comprobante (_comp, una imagen) no va al borrador: pesa demasiado
  // para sessionStorage y se adjunta otra vez si se recarga la página.
  function guardarBorrador() { try { sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(v, function (k, val) { return k === '_comp' ? undefined : val; })); } catch (_) {} }
  function leerBorrador() { try { var b = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || 'null'); if (b && b.id && Array.isArray(b.items)) v = Object.assign(borradorNuevo(), b); } catch (_) {} }
  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'success'); }
  function $(sel) { return raiz.querySelector(sel); }

  // ── Armazón ────────────────────────────────────────
  function montar() {
    raiz = document.getElementById('venRaiz');
    if (!raiz) return;
    if (montado) { pintarTodo(); enfocarInicio(); return; }
    montado = true;
    raiz.innerHTML = '<div class="tv-cargando">Abriendo la base de la tienda…</div>';
    A.listo.then(function (base) {
      db = base;
      leerBorrador();
      raiz.innerHTML =
        '<header class="tv-cab">' +
          '<div><h2>Vender</h2><p class="tv-estado-guardado" id="venGuardado"></p></div>' +
          '<div class="tv-seg" role="tablist" aria-label="Vistas de ventas">' +
            '<button type="button" data-vista="nueva">Nueva venta</button>' +
            '<button type="button" data-vista="ventas">Ventas</button>' +
            '<button type="button" data-vista="clientes">Clientes</button>' +
          '</div>' +
        '</header>' +
        '<div class="tv-cuerpo" id="venCuerpo"></div>' +
        '<div class="tv-modal" id="venModal" hidden></div>';
      raiz.addEventListener('click', alClic);
      raiz.addEventListener('input', alEscribir);
      raiz.addEventListener('change', alCambiar);
      raiz.addEventListener('keydown', alTecla);
      document.addEventListener('paste', function (e) { if (raiz && raiz.offsetParent !== null) alPegar(e); });
      raiz.addEventListener('submit', function (e) { e.preventDefault(); });
      db.alCambiar(function (tipo) { if (vista !== 'nueva') pintarVista(); else if (tipo === 'inventario' || tipo === 'ventas' || tipo === 'importacion') pintarResultados(); pintarGuardado(); });
      if (window.TiendaSync) TiendaSync.alCambiar(pintarGuardado);
      pintarTodo();
      enfocarInicio();
    }, function (err) {
      raiz.innerHTML = '<div class="tv-error-grande"><b>No se pudo abrir la base de la tienda.</b><span>' + esc(err.message) + '</span><span>Revisa que el navegador permita guardar datos de este sitio (no en modo incógnito).</span></div>';
    });
  }

  function pintarTodo() {
    raiz.querySelectorAll('.tv-seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vista === vista)); });
    pintarVista();
    pintarGuardado();
  }

  function pintarGuardado() {
    var el = document.getElementById('venGuardado');
    if (!el || !db) return;
    var s = window.TiendaSync ? TiendaSync.estado() : { pendientes: 0, conServidor: false };
    var hoyCaja = 'Caja ' + esc(db.config().caja);
    el.innerHTML = '<span class="tv-punto"></span>Guardado en este equipo · ' + hoyCaja +
      (s.conServidor ? (s.pendientes ? ' · ' + s.pendientes + ' por enviar' : ' · al día con el servidor') : '');
  }

  function pintarVista() {
    var c = document.getElementById('venCuerpo');
    if (vista === 'nueva') {
      c.innerHTML =
        '<div class="tv-nueva">' +
          '<div class="tv-col">' +
            '<section class="tv-paso" id="venPasoCliente"></section>' +
            '<section class="tv-paso" id="venPasoProd"></section>' +
          '</div>' +
          '<aside class="tv-resumen" id="venResumen"></aside>' +
        '</div>';
      pintarCliente(); pintarProductos(); pintarResumen();
    } else if (vista === 'ventas') pintarVentas();
    else pintarClientes();
  }

  // ── 1. Cliente ─────────────────────────────────────
  function pintarCliente() {
    var s = document.getElementById('venPasoCliente');
    if (!s) return;
    var cab = '<header class="tv-paso-cab"><span class="tv-num">1</span><h3>Cliente</h3>' + (v.clienteModo === 'listo' ? '<button type="button" class="tv-link" data-acc="cambiar-cliente">Cambiar</button>' : '') + '</header>';
    if (v.clienteModo === 'listo' && v.cliente) {
      var c = v.cliente;
      s.innerHTML = cab + '<div class="tv-cliente-listo">' +
        '<span class="tv-avatar" data-esfera="' + esc(esferaDe(c.nombre)) + '">' + esc(iniciales(c.nombre)) + '</span>' +
        '<div><b>' + esc(c.nombre) + '</b><span>' + esc(c.tipoDoc) + ' ' + esc(T.formatearDocumento(c.tipoDoc, c.documento)) + '</span>' +
        '<small>' + [c.telefono, c.correo, c.direccion].filter(Boolean).map(esc).join(' · ') + '</small></div>' +
        (c.autorizaDatos ? '<span class="tv-chip tv-chip-menta">En el directorio</span>' : '<span class="tv-chip">Solo para esta venta</span>') +
        '</div>';
      s.removeAttribute('data-abierto');
      return;
    }
    s.setAttribute('data-abierto', '');
    if (v.clienteModo === 'buscar') {
      s.innerHTML = cab +
        '<label class="tv-buscar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '<input id="venBuscaCli" placeholder="Cédula o nombre del cliente" autocomplete="off" aria-label="Buscar cliente por cédula o nombre"></label>' +
        '<ul class="tv-lista-cli" id="venCliRes"></ul>' +
        '<p class="tv-ayuda">Enter elige el primero. Si no está, se abre el formulario con lo que escribiste.</p>' +
        '<div class="tv-acciones"><button type="button" class="tv-btn tv-btn-suave" data-acc="cliente-nuevo">Cliente nuevo</button>' +
        (window.ExtraerDatos ? '<button type="button" class="tv-btn tv-btn-suave" data-acc="pegar-datos">Pegar mensaje del cliente</button>' : '') + '</div>' +
        pegarHtml();
      pintarResultadosCliente('');
      return;
    }
    var f = v.form;
    var det = v._det || {};
    var marca = function (k) { return det[k] ? ' data-det="' + det[k] + '"' : ''; };
    var opts = Object.keys(T.TIPOS_DOC).map(function (k) { return '<option value="' + k + '"' + (f.tipoDoc === k ? ' selected' : '') + '>' + k + '</option>'; }).join('');
    s.innerHTML = cab +
      '<form class="tv-form" id="venCliForm" novalidate>' +
        (Object.keys(det).length ? '<p class="tv-leido">Datos leídos del mensaje del cliente. Lo marcado salió del texto: revísalo y continúa.</p>' : '') +
        '<div class="tv-f tv-f-doc"' + marca('documento') + '><label for="venCliDoc">Documento <em>obligatorio</em></label><div class="tv-doc"><select id="venCliTipo" aria-label="Tipo de documento">' + opts + '</select><input id="venCliDoc" inputmode="numeric" autocomplete="off" value="' + esc(f.documento) + '" placeholder="1.020.304.050"></div><small class="tv-err" data-err="documento"></small></div>' +
        '<div class="tv-f tv-f-nombre"' + marca('nombre') + '><label for="venCliNombre">Nombre completo <em>obligatorio</em></label><input id="venCliNombre" autocomplete="off" value="' + esc(f.nombre) + '" placeholder="Nombre y apellidos o razón social"><small class="tv-err" data-err="nombre"></small></div>' +
        '<div class="tv-f"' + marca('telefono') + '><label for="venCliTel">Teléfono</label><input id="venCliTel" type="tel" inputmode="tel" autocomplete="off" value="' + esc(f.telefono) + '" placeholder="300 123 4567"><small class="tv-err" data-err="telefono"></small></div>' +
        '<div class="tv-f"' + marca('correo') + '><label for="venCliCorreo">Correo</label><input id="venCliCorreo" type="email" autocomplete="off" value="' + esc(f.correo) + '" placeholder="cliente@correo.com"><small class="tv-err" data-err="correo"></small></div>' +
        '<div class="tv-f tv-f-dir"' + marca('direccion') + '><label for="venCliDir">Dirección</label><input id="venCliDir" autocomplete="off" value="' + esc(f.direccion) + '" placeholder="Para la remisión o el domicilio"><small class="tv-err" data-err="direccion"></small></div>' +
        '<label class="tv-check"><input type="checkbox" id="venCliAut"' + (f.autorizaDatos ? ' checked' : '') + '><span>El cliente autoriza guardar sus datos para futuras compras (Ley 1581 de 2012). Sin esto, sus datos quedan solo en el documento de esta venta.</span></label>' +
        '<div class="tv-acciones"><button type="submit" class="tv-btn tv-btn-tinta" data-acc="cliente-listo">Continuar</button><button type="button" class="tv-btn tv-btn-suave" data-acc="cliente-buscar">Buscar otro</button>' +
        (window.ExtraerDatos ? '<button type="button" class="tv-btn tv-btn-suave" data-acc="pegar-datos">Pegar mensaje del cliente</button>' : '') + '</div>' +
      '</form>' + pegarHtml();
  }

  // Esfera de vidrio del cliente (ui/esferas.js): la misma siempre para el mismo nombre
  function esferaDe(nombre) { return window.Esferas ? Esferas.de(nombre) : ''; }
  function iniciales(n) { return String(n || '').split(' ').filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase(); }

  function pintarResultadosCliente(texto) {
    var ul = document.getElementById('venCliRes');
    if (!ul) return;
    var lista = db.buscarClientes(texto, 6);
    if (!lista.length) { ul.innerHTML = texto ? '<li class="tv-vacio">No hay clientes con «' + esc(texto) + '». Enter para crearlo.</li>' : ''; return; }
    ul.innerHTML = lista.map(function (c, i) {
      return '<li><button type="button" class="tv-cli' + (i === 0 && texto ? ' tv-cli-primero' : '') + '" data-acc="elegir-cliente" data-id="' + esc(c.id) + '">' +
        '<span class="tv-avatar" data-esfera="' + esc(esferaDe(c.nombre)) + '">' + esc(iniciales(c.nombre)) + '</span><span><b>' + esc(c.nombre) + '</b><small>' + esc(c.tipoDoc) + ' ' + esc(T.formatearDocumento(c.tipoDoc, c.documento)) + (c.telefono ? ' · ' + esc(c.telefono) : '') + '</small></span></button></li>';
    }).join('');
  }

  function leerForm() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    v.form = { tipoDoc: g('venCliTipo') || 'CC', documento: g('venCliDoc'), nombre: g('venCliNombre'), telefono: g('venCliTel'), correo: g('venCliCorreo'), direccion: g('venCliDir'), autorizaDatos: !!(document.getElementById('venCliAut') || {}).checked };
  }

  function confirmarCliente() {
    leerForm();
    var r = T.validarCliente(v.form);
    raiz.querySelectorAll('.tv-err').forEach(function (el) { el.textContent = r.errores[el.dataset.err] || ''; el.closest('.tv-f').toggleAttribute('data-error', !!r.errores[el.dataset.err]); });
    if (!r.ok) {
      var primero = r.errores.documento ? 'venCliDoc' : r.errores.nombre ? 'venCliNombre' : r.errores.telefono ? 'venCliTel' : r.errores.correo ? 'venCliCorreo' : 'venCliDir';
      document.getElementById(primero).focus();
      if (window.TactoApp) TactoApp.fallo(document.getElementById(primero).closest('.tv-f'));
      return;
    }
    // Si ese documento ya está en el directorio, se usa ese registro (y se
    // completa con lo nuevo que se haya escrito al guardar la venta).
    var existe = db.clientePorDocumento(r.cliente.tipoDoc, r.cliente.documento);
    v.cliente = Object.assign({}, existe || {}, r.cliente, { autorizaDatos: r.cliente.autorizaDatos || !!(existe && existe.autorizaDatos) });
    if (v.tipo === 'remision' && !v.orden.entrega && v.cliente.direccion) v.orden.entrega = v.cliente.direccion;
    v.clienteModo = 'listo';
    v._det = null;
    guardarBorrador();
    pintarCliente(); pintarProductos(); pintarResumen();
    enfocar('venBuscaProd');
  }

  function elegirCliente(id) {
    var c = db.clientes().filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    v.cliente = Object.assign({}, c, { autorizaDatos: true });
    v.form = { tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.nombre, telefono: c.telefono || '', correo: c.correo || '', direccion: c.direccion || '', autorizaDatos: true };
    v.clienteModo = 'listo';
    guardarBorrador();
    pintarCliente(); pintarProductos(); pintarResumen();
    enfocar('venBuscaProd');
  }

  // ── Datos pegados del mensaje del cliente ──────────
  // El cliente manda "nombre, cédula, dirección y correo" en un mensaje; se
  // pega aquí (o en cualquier campo del cliente) y domain/extraer-datos.js
  // llena el formulario. Lo leído queda marcado para revisarlo.
  var _pegarAbierto = false;
  function pegarHtml() {
    if (!_pegarAbierto) return '';
    return '<div class="tv-pegar"><label for="venPegarTxt">Pega aquí el mensaje del cliente</label>' +
      '<textarea id="venPegarTxt" rows="4" placeholder="Nombre: ...&#10;Cédula: ...&#10;Dirección: ...&#10;Correo: ..."></textarea>' +
      '<div class="tv-acciones"><button type="button" class="tv-btn tv-btn-tinta" data-acc="leer-datos">Leer datos</button><button type="button" class="tv-btn tv-btn-suave" data-acc="cerrar-pegar">Cancelar</button></div></div>';
  }
  function aplicarDatos(texto) {
    if (!window.ExtraerDatos) return false;
    var r = ExtraerDatos.cliente(texto);
    if (!r.encontrados && !r.telefono) { toast('No encontré datos de cliente en ese texto', 'warn'); return false; }
    var f = v.clienteModo === 'nuevo' ? Object.assign({}, v.form) : borradorNuevo().form;
    var det = {};
    ['nombre', 'documento', 'telefono', 'correo', 'direccion'].forEach(function (k) { if (r[k]) { f[k] = r[k]; det[k] = r.origen[k] || 'patron'; } });
    if (r.documento) f.tipoDoc = r.tipoDoc;
    v.form = f; v._det = det; v.clienteModo = 'nuevo'; _pegarAbierto = false;
    guardarBorrador();
    pintarCliente();
    var falta = !f.documento ? 'venCliDoc' : !f.nombre ? 'venCliNombre' : null;
    if (falta) enfocar(falta); else { var b = raiz.querySelector('[data-acc="cliente-listo"]'); if (b) b.focus(); }
    if (window.tacto) tacto.sentir('encaje');
    var nombres = { nombre: 'nombre', documento: 'documento', direccion: 'dirección', correo: 'correo' };
    toast(r.faltan.length ? 'Datos leídos. Falta: ' + r.faltan.map(function (k) { return nombres[k]; }).join(', ') : 'Datos leídos: revisa y continúa', r.faltan.length ? 'info' : 'success');
    return true;
  }
  function pegarDatos() {
    // Primero el portapapeles (un clic); si el navegador no lo deja, un recuadro.
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (txt) {
        if (txt && window.ExtraerDatos && (ExtraerDatos.pareceDatos(txt) || ExtraerDatos.cliente(txt).encontrados >= 2)) aplicarDatos(txt);
        else abrirPegar();
      }, abrirPegar);
    } else abrirPegar();
  }
  function abrirPegar() { _pegarAbierto = true; pintarCliente(); enfocar('venPegarTxt'); }

  // Venta armada desde otro lado (la ficha del cliente en Chats): cliente y
  // productos de la cotización de una vez. Todo queda editable.
  //   o: { cliente: {nombre, tipoDoc, documento, telefono, correo, direccion},
  //        detectados: {campo: origen}, items: [ítems de cotización], referencia }
  function prellenar(o) {
    o = o || {};
    irAVender();
    return A.listo.then(function (base) {
      // El cambio de sección puede llegar un instante después (relevo
      // animado): la venta se arma ya, y se pinta cuando la pantalla exista.
      db = db || base;
      var recienMontado = !montado;
      if (recienMontado) { leerBorrador(); montar(); }
      if (v.items.length && !confirm('Ya hay una venta a medio hacer. ¿Reemplazarla por la del chat?')) return false;
      vista = 'nueva';
      v = borradorNuevo();
      var c = o.cliente || {};
      v.form = { tipoDoc: c.tipoDoc || 'CC', documento: c.documento || '', nombre: c.nombre || '', telefono: c.telefono || '', correo: c.correo || '', direccion: c.direccion || '', autorizaDatos: false };
      v._det = o.detectados || {};
      var r = T.validarCliente(v.form);
      if (r.ok) {
        var existe = db.clientePorDocumento(r.cliente.tipoDoc, r.cliente.documento);
        v.cliente = Object.assign({}, existe || {}, r.cliente, { autorizaDatos: !!(existe && existe.autorizaDatos) });
        v.clienteModo = 'listo';
      } else {
        v.clienteModo = 'nuevo';
      }
      var catalogo = A.productos();
      (o.items || []).forEach(function (it) {
        var cat = it._cat || 'ADICIONAL';
        // Producto escrito a mano en la cotización (sin código): se busca por
        // nombre en el catálogo; si no está, va como producto manual que no
        // mueve inventario, con un código estable sacado del nombre.
        var sku = it.sku && String(it.sku) !== 'CUSTOM' ? String(it.sku) : ''; // 'CUSTOM' = producto manual de Cotizar
        var prod = sku ? catalogo.filter(function (p) { return p.sku === sku; })[0] : catalogo.filter(function (p) { return T.textoBusqueda(p.nombre) === T.textoBusqueda(it.name); })[0];
        if (!sku && prod) sku = prod.sku;
        var manual = !sku;
        if (manual) sku = 'MAN-' + codigoDe(it.name);
        v.items.push({ sku: sku, nombre: it.name, categoria: cat, cantidad: Number(it.qty) || 1, precioUnit: Math.round(Number(it.price) * 1000), iva: it.iva !== false, garantia: (prod || {}).garantia || '', noInventariable: manual || sku === '55002' });
      });
      if (o.referencia) v.orden.numero = String(o.referencia).slice(0, 40);
      // El medio que el cliente nombró en el chat (si la empresa lo tiene)
      if (o.medio && T.mediosPago().indexOf(o.medio) >= 0) v.pagos[0].medio = o.medio;
      if (v.cliente && v.cliente.direccion) v.orden.entrega = v.cliente.direccion;
      guardarBorrador();
      var listoPintar = function () {
        if (!document.getElementById('venCuerpo')) { setTimeout(listoPintar, 60); return; }
        pintarTodo();
        if (v.clienteModo === 'nuevo') enfocar(!v.form.documento ? 'venCliDoc' : 'venCliNombre');
        else { var b = raiz.querySelector('[data-acc="registrar"]'); if (b) b.focus(); }
      };
      if (recienMontado) setTimeout(listoPintar, 60); else listoPintar();
      return true;
    });
  }

  // Código corto y estable a partir de un nombre (mismo nombre, mismo código).
  function codigoDe(nombre) {
    var h = 0, s = T.textoBusqueda(nombre);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(36).toUpperCase().slice(0, 6);
  }

  function abrirFormularioCon(texto) {
    var t = T.limpiarEspacios(texto);
    var f = borradorNuevo().form;
    if (/^[\d.\s-]+$/.test(t)) f.documento = t.replace(/\D/g, ''); else f.nombre = t;
    if (!f.nombre) { var q = document.getElementById('cliente'); if (q && q.value.trim()) f.nombre = q.value.trim(); }
    v.form = f;
    v.clienteModo = 'nuevo';
    pintarCliente();
    enfocar(!f.documento ? 'venCliDoc' : 'venCliNombre');
  }

  // ── 2. Productos ───────────────────────────────────
  function pintarProductos() {
    var s = document.getElementById('venPasoProd');
    if (!s) return;
    var bloqueado = v.clienteModo !== 'listo';
    s.toggleAttribute('data-bloqueado', bloqueado);
    var cot = (typeof items !== 'undefined' && items.length) ? items.length : 0;
    s.innerHTML = '<header class="tv-paso-cab"><span class="tv-num">2</span><h3>Productos</h3>' +
      (cot && !bloqueado ? '<button type="button" class="tv-link" data-acc="traer-cotizacion">Traer la cotización (' + cot + ')</button>' : '') + '</header>' +
      (bloqueado ? '<p class="tv-bloqueo">Primero el nombre y el documento del cliente.</p>' :
        '<label class="tv-buscar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        '<input id="venBuscaProd" placeholder="Buscar en el inventario: nombre o código" autocomplete="off" aria-label="Buscar producto en el inventario"></label>' +
        '<ul class="tv-lista-prod" id="venProdRes"></ul>' +
        '<ul class="tv-carrito" id="venCarrito"></ul>');
    if (!bloqueado) { pintarResultados(); pintarCarrito(); }
  }

  var ultimaBusqueda = '';
  function buscarProductos(texto) {
    var fichas = T.textoBusqueda(texto).split(' ').filter(Boolean);
    var todos = A.productos();
    if (!fichas.length) return [];
    var out = [];
    for (var i = 0; i < todos.length && out.length < 40; i++) {
      var p = todos[i], ok = true;
      for (var j = 0; j < fichas.length; j++) if (p._busq.indexOf(fichas[j]) < 0) { ok = false; break; }
      if (ok) out.push(p);
    }
    var q = T.textoBusqueda(texto);
    out.sort(function (a, b) { return (b.sku.toLowerCase() === q) - (a.sku.toLowerCase() === q) || ((db.existencias(b.sku) > 0) - (db.existencias(a.sku) > 0)); });
    return out.slice(0, 8);
  }

  function chipStock(p) {
    if (p.noInventariable) return '<span class="tv-chip">Servicio</span>';
    var n = db.existencias(p.sku);
    if (n > 0) return '<span class="tv-chip tv-chip-menta">' + n + ' en tienda</span>';
    return '<span class="tv-chip ' + (n < 0 ? 'tv-chip-rosa' : 'tv-chip-durazno') + '">' + (n < 0 ? n + ' (revisar)' : 'Sin existencias') + '</span>';
  }

  function pintarResultados() {
    var ul = document.getElementById('venProdRes');
    if (!ul) return;
    var lista = buscarProductos(ultimaBusqueda);
    if (!ultimaBusqueda) { ul.innerHTML = ''; return; }
    if (!lista.length) { ul.innerHTML = '<li class="tv-vacio">Nada con «' + esc(ultimaBusqueda) + '» en el inventario.</li>'; return; }
    ul.innerHTML = lista.map(function (p, i) {
      return '<li><button type="button" class="tv-prod' + (i === 0 ? ' tv-prod-primero' : '') + '" data-acc="agregar" data-sku="' + esc(p.sku) + '">' +
        '<span class="tv-prod-nombre"><b>' + esc(p.nombre) + '</b><small>' + esc(p.sku) + ' · ' + esc(p.categoria) + '</small></span>' +
        chipStock(p) + '<span class="tv-prod-precio">' + fmt(p.precio) + '</span><span class="tv-mas" aria-hidden="true">+</span></button></li>';
    }).join('');
  }

  function agregar(sku, cantidad) {
    var p = A.productos().filter(function (x) { return x.sku === sku; })[0];
    if (!p) return;
    var ya = v.items.filter(function (x) { return x.sku === sku; })[0];
    if (ya) ya.cantidad += cantidad || 1;
    else v.items.push({ sku: p.sku, nombre: p.nombre, categoria: p.categoria, cantidad: cantidad || 1, precioUnit: p.precio, iva: p.iva, garantia: p.garantia, noInventariable: p.noInventariable });
    if (!p.noInventariable && db.existencias(p.sku) < (ya ? ya.cantidad : (cantidad || 1))) toast('Sin existencias suficientes de ' + p.nombre + ' en el inventario', 'warn');
    guardarBorrador();
    pintarCarrito(); pintarResumen();
  }

  function pintarCarrito() {
    var ul = document.getElementById('venCarrito');
    if (!ul) return;
    if (!v.items.length) { ul.innerHTML = '<li class="tv-carrito-vacio">Busca un producto y presiona Enter para añadirlo.</li>'; return; }
    ul.innerHTML = v.items.map(function (it, i) {
      var l = T.calcularLinea({ cantidad: it.cantidad, precioUnit: it.precioUnit, iva: it.iva });
      return '<li class="tv-linea" data-i="' + i + '">' +
        '<span class="tv-linea-nombre"><b>' + esc(it.nombre) + '</b><small>' + esc(it.sku) + (it.garantia ? ' · Garantía ' + esc(it.garantia) : '') + (it.iva || !T.tasaIva() ? '' : ' · Excl. IVA') + '</small></span>' +
        '<span class="tv-cant" role="group" aria-label="Cantidad"><button type="button" data-acc="menos" aria-label="Quitar uno">−</button><input data-campo="cantidad" inputmode="numeric" value="' + it.cantidad + '" aria-label="Cantidad de ' + esc(it.nombre) + '"><button type="button" data-acc="mas" aria-label="Agregar uno">+</button></span>' +
        '<label class="tv-precio"><span>c/u</span><input data-campo="precio" inputmode="numeric" value="' + it.precioUnit.toLocaleString('es-CO') + '" aria-label="Precio unitario de ' + esc(it.nombre) + '"></label>' +
        '<b class="tv-linea-total">' + fmt(l.total) + '</b>' +
        '<button type="button" class="tv-quitar" data-acc="quitar" aria-label="Quitar ' + esc(it.nombre) + '">×</button>' +
      '</li>';
    }).join('');
  }

  function traerCotizacion() {
    if (typeof items === 'undefined' || !items.length) return;
    var n = 0;
    items.forEach(function (it) {
      var cat = it._cat || 'ADICIONAL';
      var existe = v.items.filter(function (x) { return x.sku === String(it.sku); })[0];
      if (existe) { existe.cantidad += Number(it.qty) || 1; n++; return; }
      v.items.push({ sku: String(it.sku), nombre: it.name, categoria: cat, cantidad: Number(it.qty) || 1, precioUnit: Math.round(Number(it.price) * 1000), iva: it.iva !== false, garantia: (A.productos().filter(function (p) { return p.sku === String(it.sku); })[0] || {}).garantia || '', noInventariable: String(it.sku) === '55002' });
      n++;
    });
    var num = document.getElementById('numCot');
    if (num && num.value && !v.orden.numero && typeof quoteDisplayNum === 'function') v.orden.numero = 'Cot. ' + quoteDisplayNum(num.value, (document.getElementById('asesor') || {}).value, window._slAsesorLetter);
    guardarBorrador();
    pintarCarrito(); pintarResumen();
    toast(n + (n === 1 ? ' producto traído' : ' productos traídos') + ' de la cotización', 'success');
  }

  // ── 3. Pago y documento ────────────────────────────
  function calculo() { return T.calcularVenta(v.items, { descuentoPct: v.descuentoPct }); }

  function pintarResumen() {
    var s = document.getElementById('venResumen');
    if (!s) return;
    var c = calculo();
    if (v.pagosAuto && v.pagos.length === 1) v.pagos[0].valor = v.tipo === 'recibo' ? c.total : v.pagos[0].valor;
    var medios = function (sel) { return T.mediosPago().map(function (m) { return '<option' + (m === sel ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join(''); };
    var pagado = v.pagos.reduce(function (a, p) { return a + (Math.round(Number(p.valor)) || 0); }, 0);
    var dif = c.total - pagado;
    var unEfectivo = v.tipo === 'recibo' && v.pagos.length === 1 && v.pagos[0].medio === 'Efectivo' && c.total > 0;
    var recibido = Math.round(Number(String(v.recibido).replace(/\D/g, ''))) || 0;
    s.innerHTML =
      '<header class="tv-paso-cab"><span class="tv-num">3</span><h3>Pago y documento</h3></header>' +
      '<div class="tv-seg tv-seg-ancho" role="radiogroup" aria-label="Documento">' +
        '<button type="button" data-acc="tipo" data-tipo="recibo" aria-pressed="' + (v.tipo === 'recibo') + '">Recibo de compra</button>' +
        '<button type="button" data-acc="tipo" data-tipo="remision" aria-pressed="' + (v.tipo === 'remision') + '">Remisión</button>' +
      '</div>' +
      '<div class="tv-f"><label for="venOrden">Orden de compra / referencia</label><input id="venOrden" data-campo="orden" autocomplete="off" value="' + esc(v.orden.numero) + '" placeholder="Opcional: N.º de orden del cliente o cotización"></div>' +
      (v.tipo === 'remision' ? '<div class="tv-f"><label for="venEntrega">Dirección de entrega</label><input id="venEntrega" data-campo="entrega" autocomplete="off" value="' + esc(v.orden.entrega) + '" placeholder="Dónde se entrega la mercancía"></div>' : '') +
      // Empresa no responsable de IVA: ni interruptor ni base/IVA.
      (T.tasaIva() ? '<button type="button" class="tv-interruptor" data-acc="mostrar-iva" role="switch" aria-checked="' + !!v.mostrarIva + '"><span>Mostrar IVA en el documento</span><i aria-hidden="true"></i></button>' : '') +
      '<dl class="tv-totales">' +
        (v.mostrarIva && T.tasaIva() ? '<div><dt>Base</dt><dd>' + fmt(c.base) + '</dd></div><div><dt>IVA</dt><dd>' + fmt(c.iva) + '</dd></div>' : '') +
        '<div class="tv-desc"><dt><label for="venDesc">Descuento</label></dt><dd><input id="venDesc" data-campo="descuento" inputmode="decimal" value="' + (v.descuentoPct || '') + '" placeholder="0" aria-label="Descuento en porcentaje"><span>%</span>' + (c.descuento ? '<em>−' + fmt(c.descuento) + '</em>' : '') + '</dd></div>' +
        '<div class="tv-total"><dt>Total</dt><dd>' + fmt(c.total) + '</dd></div>' +
      '</dl>' +
      '<div class="tv-pagos"><p class="tv-mini">' + (v.tipo === 'recibo' ? 'Cómo paga' : 'Abono (opcional)') + '</p>' +
        v.pagos.map(function (p, i) {
          return '<div class="tv-pago" data-i="' + i + '"><select data-campo="medio" aria-label="Medio de pago">' + medios(p.medio) + '</select>' +
            '<input data-campo="valor" inputmode="numeric" value="' + (p.valor ? Math.round(p.valor).toLocaleString('es-CO') : '') + '" placeholder="$ 0" aria-label="Valor">' +
            (v.pagos.length > 1 ? '<button type="button" class="tv-quitar" data-acc="quitar-pago" aria-label="Quitar este pago">×</button>' : '') +
            compHtml(p) + '</div>';
        }).join('') +
        '<button type="button" class="tv-link" data-acc="otro-pago">+ Otro medio de pago</button>' +
        (v.tipo === 'recibo' && dif !== 0 && c.total > 0 ? '<p class="tv-dif">' + (dif > 0 ? 'Falta registrar ' + fmt(dif) : 'Sobran ' + fmt(-dif)) + '</p>' : '') +
        (v.tipo === 'remision' && c.total > 0 ? '<p class="tv-dif tv-dif-suave">Saldo pendiente: ' + fmt(Math.max(0, c.total - pagado)) + '</p>' : '') +
        (unEfectivo ? '<div class="tv-cambio"><label for="venRecibido">Con cuánto paga</label><input id="venRecibido" data-campo="recibido" inputmode="numeric" value="' + (recibido ? recibido.toLocaleString('es-CO') : '') + '" placeholder="$ 0">' + (recibido >= c.total ? '<b>Cambio ' + fmt(recibido - c.total) + '</b>' : '') + '</div>' : '') +
      '</div>' +
      '<div class="tv-f"><label for="venNotas">Notas</label><input id="venNotas" data-campo="notas" autocomplete="off" value="' + esc(v.notas) + '" placeholder="Opcional: aparece en el documento"></div>' +
      '<p class="tv-error" id="venError" role="alert"></p>' +
      '<button type="button" class="tv-btn tv-btn-tinta tv-registrar" data-acc="registrar"' + (guardando ? ' disabled' : '') + '>' +
        (guardando ? 'Guardando…' : 'Registrar ' + (v.tipo === 'recibo' ? 'venta' : 'remisión') + '<kbd>Ctrl Enter</kbd>') + '</button>' +
      '<button type="button" class="tv-link tv-descartar" data-acc="descartar">Descartar esta venta</button>';
  }

  // ── Comprobante de pago ────────────────────────────
  // Pantallazo del pago (transferencia, Nequi, QR...) unido a la venta. Se
  // sube al registrarla (infrastructure/comprobantes.js) y el jefe lo revisa
  // en Pagos (ui/pagos.js). Efectivo no lleva comprobante.
  var _compIdx = -1;
  function pideComprobante(p) { return !!p && !/^efectivo$/i.test(String(p.medio || '')); }
  function compHtml(p) {
    if (!window.Comprobantes || !pideComprobante(p)) return '';
    var mini = p._comp && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p._comp.miniatura) ? p._comp.miniatura : '';
    // Lo que leyó la IA del comprobante: el valor se compara con el del pago.
    var l = p._comp && p._comp.lectura;
    var nota = p._comp && p._comp.leyendo ? 'Leyendo el comprobante…'
      : l && l.monto ? (Math.abs(l.monto - (Math.round(Number(p.valor)) || 0)) <= 1 ? 'Valor verificado: ' + fmt(l.monto) : 'Ojo: el comprobante dice ' + fmt(l.monto)) : '';
    var malo = l && l.monto && Math.abs(l.monto - (Math.round(Number(p.valor)) || 0)) > 1;
    return mini
      ? '<div class="tv-comp tv-comp-listo' + (malo ? ' tv-comp-ojo' : '') + '"><img src="' + mini + '" alt=""><span>Comprobante adjunto' + (nota ? '<small>' + esc(nota) + '</small>' : '') + '</span>' +
        (malo ? '<button type="button" class="tv-link" data-acc="usar-monto-comp">Usar ' + fmt(l.monto) + '</button>' : '') +
        '<button type="button" class="tv-link" data-acc="quitar-comp">Quitar</button></div>'
      : '<div class="tv-comp"><button type="button" class="tv-link" data-acc="comprobante">Adjuntar comprobante</button><small>o pega la imagen con Ctrl+V</small></div>';
  }
  function adjuntarComprobante(i, blob) {
    if (!window.Comprobantes || !v.pagos[i]) return;
    Comprobantes.comprimir(blob).then(function (r) {
      var pago = v.pagos[i];
      if (!pago) return;
      r.leyendo = !!Comprobantes.leer;
      pago._comp = r;
      pintarResumen();
      if (window.tacto) tacto.sentir('encaje');
      // La IA lee valor y referencia mientras tanto (si hay IA en el plan).
      Comprobantes.leer(r.imagen).then(function (l) {
        if (pago._comp !== r) return;
        r.leyendo = false;
        r.lectura = l;
        refrescarResumenSinFoco(document.activeElement);
      });
    }, function (e) { toast(e.message || 'No se pudo leer la imagen', 'warn'); });
  }
  function archivoComprobante() {
    var inp = document.getElementById('venCompArchivo');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.hidden = true; inp.id = 'venCompArchivo';
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) adjuntarComprobante(_compIdx, inp.files[0]); inp.value = ''; });
      raiz.appendChild(inp);
    }
    inp.click();
  }
  // Pegar una imagen en Vender: va al primer pago que la pide y no la tiene.
  function alPegar(e) {
    if (!window.Comprobantes || vista !== 'nueva') return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    var f = null;
    for (var k = 0; k < items.length; k++) if (items[k].kind === 'file' && /^image\//.test(items[k].type)) { f = items[k].getAsFile(); break; }
    if (!f) {
      // Texto con los datos del cliente: se lee aunque se pegue en un solo campo.
      var txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (txt && window.ExtraerDatos && v.clienteModo !== 'listo' && e.target && e.target.id !== 'venPegarTxt' && ExtraerDatos.pareceDatos(txt)) {
        e.preventDefault();
        aplicarDatos(txt);
      }
      return;
    }
    e.preventDefault();
    var i = -1;
    v.pagos.forEach(function (p, j) { if (i < 0 && pideComprobante(p) && !p._comp) i = j; });
    if (i < 0) v.pagos.forEach(function (p, j) { if (pideComprobante(p)) i = j; });
    if (i < 0) { toast('Elige primero el medio de pago (transferencia, Nequi...) y pega de nuevo', 'warn'); return; }
    adjuntarComprobante(i, f);
  }
  function subirComprobantes(venta, pagos) {
    var con = pagos.filter(function (p) { return p._comp && Number(p.valor) > 0; });
    if (!con.length || !window.Comprobantes) return;
    Promise.all(con.map(function (p) {
      return Comprobantes.subir({ ventaId: venta.id, ventaNumero: venta.numero, cliente: (venta.cliente || {}).nombre || '', medio: p.medio, valor: p.valor, imagen: p._comp.imagen, miniatura: p._comp.miniatura, lectura: p._comp.lectura || null });
    })).then(function () {
      toast(con.length === 1 ? 'Comprobante guardado para revisión' : con.length + ' comprobantes guardados para revisión');
    }, function (e) { toast(e.message || 'No se pudo guardar el comprobante', 'warn'); });
  }

  // La venta que sale de una cotización ("Cot. A-1105") la deja como vendida:
  // el panel del dueño y el del asesor la cuentan sin que nadie lo haga a
  // mano, y Seguimiento deja de pedir que se retome.
  function marcarCotizacionVendida(ref) {
    var m = /^Cot\.\s*(.+)$/.exec(String(ref || '').trim());
    if (!m || typeof getHist !== 'function') return;
    var h = getHist();
    for (var i = 0; i < h.length; i++) {
      var x = h[i];
      var num = typeof quoteDisplayNum === 'function' ? quoteDisplayNum(x.num, x.asesor, x.letra) : x.num;
      if (String(num) !== m[1].trim()) continue;
      if (x.estado === 'vendida') return;
      x.estado = 'vendida';
      x.estadoUpdatedAt = Date.now();
      try { _ls.setJSON(histKey(), h); } catch (e) { return; }
      if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { estado: 'vendida' });
      if (typeof updateFollowBadge === 'function') updateFollowBadge();
      return;
    }
  }

  function registrar() {
    if (guardando) return;
    var err = document.getElementById('venError');
    if (v.clienteModo !== 'listo' || !v.cliente) { if (err) err.textContent = 'Primero el nombre y el documento del cliente.'; if (window.TactoApp) TactoApp.fallo(err); return; }
    var borrador = {
      id: v.id, tipo: v.tipo, cliente: v.cliente,
      items: v.items, pagos: v.pagos, descuentoPct: v.descuentoPct,
      orden: { numero: T.limpiarEspacios(v.orden.numero), entrega: T.limpiarEspacios(v.orden.entrega) },
      notas: v.notas, mostrarIva: !!v.mostrarIva, guardarCliente: true
    };
    var previa = T.validarVenta(borrador, { stock: db.stock(), permitirSinExistencias: db.config().permitirSinExistencias, noInventariables: v.items.reduce(function (o, i) { if (i.noInventariable) o[i.sku] = true; return o; }, {}) });
    if (!previa.ok) { if (err) err.textContent = previa.errores[0]; if (window.TactoApp) TactoApp.fallo(err); return; }
    guardando = true; pintarResumen();
    var pagosConComp = v.pagos.slice();
    db.registrarVenta(borrador, { usuario: A.usuario() }).then(function (r) {
      guardando = false;
      var venta = r.venta;
      subirComprobantes(venta, pagosConComp);
      // Para la ficha del cliente (ui/ficha-cliente.js): la venta avanza su paso.
      document.dispatchEvent(new CustomEvent('sl:venta', { detail: { venta: venta, comprobantes: pagosConComp.filter(function (p) { return p._comp; }).length } }));
      marcarCotizacionVendida(venta.orden && venta.orden.numero);
      v = borradorNuevo();
      try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch (_) {}
      pintarVista();
      mostrarDocumento(venta, true);
      if (window.tacto) tacto.sentir('exito');
      if (r.avisos && r.avisos.length) toast('Vendido sin existencias registradas: revisa el inventario', 'warn');
    }, function (e) {
      guardando = false;
      pintarResumen();
      var el = document.getElementById('venError');
      if (el) el.textContent = (e.errores && e.errores[0]) || e.message || 'No se pudo guardar la venta.';
    });
  }

  // ── Documento ──────────────────────────────────────
  function mostrarDocumento(venta, recien) {
    var m = document.getElementById('venModal');
    var tel = String((venta.cliente || {}).telefono || '').replace(/\D/g, '');
    m.innerHTML = '<div class="tv-modal-caja" role="dialog" aria-modal="true" aria-label="' + esc((T.TIPOS_VENTA[venta.tipo] || {}).nombre) + ' ' + esc(venta.numero) + '">' +
      '<header class="tv-modal-cab">' + (recien ? '<span class="tv-ok"><svg class="tacto-marca" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path pathLength="1" d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Venta guardada</span>' : '<b>' + esc(venta.numero) + '</b>') +
        '<button type="button" class="tv-x" data-acc="cerrar-modal" aria-label="Cerrar">×</button></header>' +
      '<div class="tv-modal-doc">' + A.documentoHTML(venta) + '</div>' +
      '<footer class="tv-modal-pie">' +
        '<button type="button" class="tv-btn tv-btn-suave" data-acc="imprimir" data-id="' + esc(venta.id) + '">Imprimir o PDF</button>' +
        '<a class="tv-btn tv-btn-menta" href="' + esc(A.enlaceWhatsApp(venta)) + '" target="_blank" rel="noopener">' + (tel ? 'Enviar por WhatsApp' : 'Compartir por WhatsApp') + '</a>' +
        (venta.estado !== 'anulada' && !recien ? '<button type="button" class="tv-btn tv-btn-rosa" data-acc="anular" data-id="' + esc(venta.id) + '">Anular</button>' : '') +
        (recien ? '<button type="button" class="tv-btn tv-btn-tinta" data-acc="cerrar-modal">Nueva venta</button>' : '') +
      '</footer>' +
      '<div class="tv-anular" id="venAnular" hidden><label for="venMotivo">Motivo de la anulación</label><input id="venMotivo" placeholder="Ej: el cliente cambió de producto"><button type="button" class="tv-btn tv-btn-rosa" data-acc="confirmar-anular" data-id="' + esc(venta.id) + '">Anular venta</button><small>No se borra: queda marcada como anulada y el inventario se devuelve.</small></div>' +
    '</div>';
    m.hidden = false;
    m._venta = venta;
    var b = m.querySelector('[data-acc="cerrar-modal"].tv-btn') || m.querySelector('.tv-x');
    if (b) b.focus();
  }
  function cerrarModal() {
    var m = document.getElementById('venModal');
    m.hidden = true; m.innerHTML = '';
    if (vista === 'nueva') enfocarInicio();
  }

  // ── Ventas registradas ─────────────────────────────
  var filtroVentas = { texto: '', rango: 'hoy' };
  function pintarVentas() {
    var c = document.getElementById('venCuerpo');
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var desde = filtroVentas.rango === 'hoy' ? hoy.getTime() : filtroVentas.rango === '7' ? hoy.getTime() - 6 * 864e5 : 0;
    c.innerHTML = '<div class="tv-ventas"><div class="tv-filtros">' +
      '<label class="tv-buscar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="venFiltroVentas" value="' + esc(filtroVentas.texto) + '" placeholder="Cliente, documento o número" autocomplete="off" aria-label="Buscar ventas"></label>' +
      '<div class="tv-seg">' + [['hoy', 'Hoy'], ['7', '7 días'], ['todo', 'Todas']].map(function (o) { return '<button type="button" data-acc="rango" data-rango="' + o[0] + '" aria-pressed="' + (filtroVentas.rango === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '</div><div id="venVentasRes" class="tv-cargando">Cargando…</div></div>';
    db.ventas({ desde: desde || undefined, limite: 500 }).then(function (lista) {
      var q = T.textoBusqueda(filtroVentas.texto), qd = filtroVentas.texto.replace(/\D/g, '');
      if (q) lista = lista.filter(function (x) { return T.textoBusqueda(x.cliente.nombre + ' ' + x.numero).indexOf(q) >= 0 || (qd.length >= 3 && x.cliente.documento.indexOf(qd) >= 0); });
      var validas = lista.filter(function (x) { return x.estado !== 'anulada'; });
      var total = validas.reduce(function (a, x) { return a + x.total; }, 0);
      var porMedio = {};
      validas.forEach(function (x) { x.pagos.forEach(function (p) { porMedio[p.medio] = (porMedio[p.medio] || 0) + p.valor; }); });
      var el = document.getElementById('venVentasRes');
      if (!el) return;
      el.className = '';
      el.innerHTML = '<dl class="tv-kpis"><div><dt>Ventas</dt><dd>' + validas.length + '</dd></div><div><dt>Total vendido</dt><dd>' + fmt(total) + '</dd></div>' +
        Object.keys(porMedio).map(function (m) { return '<div><dt>' + esc(m) + '</dt><dd>' + fmt(porMedio[m]) + '</dd></div>'; }).join('') + '</dl>' +
        (lista.length ? '<ul class="tv-lista-ventas">' + lista.map(function (x) {
          return '<li><button type="button" class="tv-venta' + (x.estado === 'anulada' ? ' tv-venta-anulada' : '') + '" data-acc="ver-venta" data-id="' + esc(x.id) + '">' +
            '<span class="tv-venta-num">' + esc(x.numero) + '</span>' +
            '<span class="tv-venta-cli"><b>' + esc(x.cliente.nombre) + '</b><small>' + esc(A.fechaHora(x.fecha)) + ' · ' + x.items.length + ' prod. · ' + esc(x.usuario || '') + '</small></span>' +
            (x.estado === 'anulada' ? '<span class="tv-chip tv-chip-rosa">Anulada</span>' : x.saldo ? '<span class="tv-chip tv-chip-durazno">Saldo ' + fmt(x.saldo) + '</span>' : '<span class="tv-chip">' + esc((T.TIPOS_VENTA[x.tipo] || {}).nombre) + '</span>') +
            '<b class="tv-venta-total">' + fmt(x.total) + '</b></button></li>';
        }).join('') + '</ul>' : '<p class="tv-vacio-grande">No hay ventas en este periodo.</p>');
    });
  }

  // ── Clientes ───────────────────────────────────────
  var filtroClientes = '';
  function pintarClientes() {
    var c = document.getElementById('venCuerpo');
    var lista = filtroClientes ? db.buscarClientes(filtroClientes, 200) : db.clientes().slice(0, 200);
    c.innerHTML = '<div class="tv-clientes"><div class="tv-filtros">' +
      '<label class="tv-buscar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="venFiltroCli" value="' + esc(filtroClientes) + '" placeholder="Cédula o nombre" autocomplete="off" aria-label="Buscar clientes"></label>' +
      '<span class="tv-mini">' + db.clientes().length + ' clientes en el directorio</span></div>' +
      (lista.length ? '<ul class="tv-lista-clientes">' + lista.map(function (x) {
        return '<li class="tv-cliente-card"><span class="tv-avatar" data-esfera="' + esc(esferaDe(x.nombre)) + '">' + esc(iniciales(x.nombre)) + '</span>' +
          '<div><b>' + esc(x.nombre) + '</b><span>' + esc(x.tipoDoc) + ' ' + esc(T.formatearDocumento(x.tipoDoc, x.documento)) + '</span>' +
          '<small>' + [x.telefono, x.correo, x.direccion].filter(Boolean).map(esc).join(' · ') + '</small>' +
          (x.ultimaCompra ? '<small>Última compra: ' + esc(A.fechaHora(x.ultimaCompra)) + '</small>' : '') + '</div>' +
          '<div class="tv-cliente-acc"><button type="button" class="tv-btn tv-btn-tinta" data-acc="vender-a" data-id="' + esc(x.id) + '">Vender</button>' +
          '<button type="button" class="tv-btn tv-btn-suave" data-acc="compras" data-id="' + esc(x.id) + '">Compras</button></div></li>';
      }).join('') + '</ul>' : '<p class="tv-vacio-grande">' + (filtroClientes ? 'Nadie con «' + esc(filtroClientes) + '».' : 'Aún no hay clientes guardados. Se guardan solos al vender, si autorizan sus datos.') + '</p>') + '</div>';
  }

  function verCompras(id) {
    var x = db.clientes().filter(function (c) { return c.id === id; })[0];
    if (!x) return;
    db.ventasDeCliente(x.tipoDoc, x.documento).then(function (lista) {
      var m = document.getElementById('venModal');
      m.innerHTML = '<div class="tv-modal-caja tv-modal-chica" role="dialog" aria-modal="true" aria-label="Compras de ' + esc(x.nombre) + '"><header class="tv-modal-cab"><b>Compras de ' + esc(x.nombre) + '</b><button type="button" class="tv-x" data-acc="cerrar-modal" aria-label="Cerrar">×</button></header>' +
        (lista.length ? '<ul class="tv-lista-ventas">' + lista.map(function (v2) {
          return '<li><button type="button" class="tv-venta' + (v2.estado === 'anulada' ? ' tv-venta-anulada' : '') + '" data-acc="ver-venta" data-id="' + esc(v2.id) + '"><span class="tv-venta-num">' + esc(v2.numero) + '</span><span class="tv-venta-cli"><b>' + esc(A.fechaHora(v2.fecha)) + '</b><small>' + v2.items.map(function (i) { return esc(i.nombre); }).join(', ') + '</small></span><b class="tv-venta-total">' + fmt(v2.total) + '</b></button></li>';
        }).join('') + '</ul>' : '<p class="tv-vacio-grande">Sin compras registradas.</p>') + '</div>';
      m.hidden = false;
    });
  }

  // ── Eventos ────────────────────────────────────────
  function alClic(e) {
    var b = e.target.closest('[data-acc], [data-vista]');
    var m = document.getElementById('venModal');
    if (e.target === m) { cerrarModal(); return; }
    if (!b) return;
    if (b.dataset.vista) { vista = b.dataset.vista; pintarTodo(); if (vista === 'nueva') enfocarInicio(); return; }
    var acc = b.dataset.acc, li = b.closest('[data-i]'), i = li ? Number(li.dataset.i) : -1;
    switch (acc) {
      case 'cliente-nuevo': abrirFormularioCon((document.getElementById('venBuscaCli') || {}).value || ''); break;
      case 'cliente-buscar': v.clienteModo = 'buscar'; pintarCliente(); enfocar('venBuscaCli'); break;
      case 'cliente-listo': confirmarCliente(); break;
      case 'cambiar-cliente': v.clienteModo = v.cliente ? 'nuevo' : 'buscar'; pintarCliente(); pintarProductos(); enfocar('venCliNombre'); break;
      case 'elegir-cliente': elegirCliente(b.dataset.id); break;
      case 'agregar': agregar(b.dataset.sku); var bp = document.getElementById('venBuscaProd'); if (bp) { bp.select(); bp.focus(); } break;
      case 'traer-cotizacion': traerCotizacion(); break;
      case 'mas': v.items[i].cantidad++; guardarBorrador(); pintarCarrito(); pintarResumen(); break;
      case 'menos': if (v.items[i].cantidad > 1) v.items[i].cantidad--; else v.items.splice(i, 1); guardarBorrador(); pintarCarrito(); pintarResumen(); break;
      case 'quitar': v.items.splice(i, 1); guardarBorrador(); pintarCarrito(); pintarResumen(); break;
      case 'tipo': v.tipo = b.dataset.tipo; if (v.tipo === 'remision') { v.pagosAuto = false; if (v.pagos.length === 1) v.pagos[0].valor = 0; if (!v.orden.entrega && v.cliente && v.cliente.direccion) v.orden.entrega = v.cliente.direccion; } else { v.pagosAuto = v.pagos.length === 1; } guardarBorrador(); pintarResumen(); break;
      case 'mostrar-iva': v.mostrarIva = !v.mostrarIva; guardarBorrador(); pintarResumen(); break;
      case 'otro-pago': {
        var c = calculo(); var pagado = v.pagos.reduce(function (a, p) { return a + (Number(p.valor) || 0); }, 0);
        v.pagosAuto = false; var libre = T.mediosPago().filter(function (m) { return !v.pagos.some(function (p) { return p.medio === m; }); })[0] || T.mediosPago()[0];
        v.pagos.push({ medio: libre, valor: Math.max(0, c.total - pagado) }); guardarBorrador(); pintarResumen(); break;
      }
      case 'comprobante': _compIdx = i; archivoComprobante(); break;
      case 'pegar-datos': pegarDatos(); break;
      case 'leer-datos': { var tx = document.getElementById('venPegarTxt'); if (tx && tx.value.trim()) aplicarDatos(tx.value); break; }
      case 'cerrar-pegar': _pegarAbierto = false; pintarCliente(); break;
      case 'quitar-comp': if (v.pagos[i]) { delete v.pagos[i]._comp; pintarResumen(); } break;
      case 'usar-monto-comp': { var pc = v.pagos[i], lc = pc && pc._comp && pc._comp.lectura; if (lc && lc.monto) { pc.valor = lc.monto; v.pagosAuto = false; guardarBorrador(); pintarResumen(); } break; }
      case 'quitar-pago': v.pagos.splice(i, 1); if (v.pagos.length === 1 && v.tipo === 'recibo') v.pagosAuto = true; guardarBorrador(); pintarResumen(); break;
      case 'registrar': registrar(); break;
      case 'descartar': if (!v.items.length && v.clienteModo === 'buscar' || confirm('¿Descartar esta venta? No se guardó nada todavía.')) { v = borradorNuevo(); try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch (_) {} pintarVista(); enfocarInicio(); } break;
      case 'cerrar-modal': cerrarModal(); break;
      case 'imprimir': A.imprimir(m._venta); break;
      case 'anular': document.getElementById('venAnular').hidden = false; enfocar('venMotivo'); break;
      case 'confirmar-anular':
        db.anularVenta(b.dataset.id, (document.getElementById('venMotivo') || {}).value, { usuario: A.usuario() }).then(function (venta) {
          toast('Venta ' + venta.numero + ' anulada; el inventario se devolvió', 'success'); mostrarDocumento(venta, false);
        }, function (er) { toast(er.message, 'error'); });
        break;
      case 'ver-venta': db.venta(b.dataset.id).then(function (x) { if (x) mostrarDocumento(x, false); }); break;
      case 'rango': filtroVentas.rango = b.dataset.rango; pintarVentas(); break;
      case 'vender-a': { var cli = db.clientes().filter(function (x) { return x.id === b.dataset.id; })[0]; if (cli) venderA(cli); break; }
      case 'compras': verCompras(b.dataset.id); break;
    }
  }

  var tCli = null;
  function alEscribir(e) {
    var t = e.target;
    if (t.id === 'venBuscaCli') { clearTimeout(tCli); var val = t.value; tCli = setTimeout(function () { pintarResultadosCliente(val); }, 60); return; }
    if (t.id === 'venBuscaProd') { ultimaBusqueda = t.value; pintarResultados(); return; }
    if (t.id === 'venFiltroVentas') { filtroVentas.texto = t.value; clearTimeout(tCli); tCli = setTimeout(pintarVentas, 150); return; }
    if (t.id === 'venFiltroCli') { filtroClientes = t.value; clearTimeout(tCli); tCli = setTimeout(function () { pintarClientes(); var f = document.getElementById('venFiltroCli'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 120); return; }
    if (t.closest('#venCliForm')) { leerForm(); guardarBorrador(); return; }
    var campo = t.dataset.campo;
    if (!campo) return;
    var li = t.closest('[data-i]'), i = li ? Number(li.dataset.i) : -1;
    var num = function () { return Math.round(Number(String(t.value).replace(/\D/g, ''))) || 0; };
    if (campo === 'cantidad') { var q = num(); if (q > 0) { v.items[i].cantidad = q; actualizarLinea(i); } }
    else if (campo === 'precio') { v.items[i].precioUnit = num(); actualizarLinea(i); }
    else if (campo === 'valor') { v.pagosAuto = false; v.pagos[i].valor = num(); refrescarResumenSinFoco(t); }
    else if (campo === 'descuento') { v.descuentoPct = Math.max(0, Math.min(50, Number(String(t.value).replace(',', '.')) || 0)); refrescarResumenSinFoco(t); }
    else if (campo === 'recibido') { v.recibido = t.value; refrescarResumenSinFoco(t); }
    else if (campo === 'orden') v.orden.numero = t.value;
    else if (campo === 'entrega') v.orden.entrega = t.value;
    else if (campo === 'notas') v.notas = t.value;
    guardarBorrador();
  }
  function alCambiar(e) {
    var t = e.target;
    if (t.dataset.campo === 'medio') { var i = Number(t.closest('[data-i]').dataset.i); v.pagos[i].medio = t.value; guardarBorrador(); pintarResumen(); }
    if (t.dataset.campo === 'precio' || t.dataset.campo === 'cantidad') pintarCarrito();
    if (t.id === 'venCliTipo') { leerForm(); guardarBorrador(); }
  }
  function actualizarLinea(i) {
    var li = raiz.querySelector('.tv-linea[data-i="' + i + '"]');
    if (li) { var it = v.items[i]; li.querySelector('.tv-linea-total').textContent = fmt(T.calcularLinea({ cantidad: it.cantidad, precioUnit: it.precioUnit, iva: it.iva }).total); }
    var foco = document.activeElement;
    refrescarResumenSinFoco(foco);
  }
  // Repinta el resumen sin perder el campo donde se está escribiendo.
  function refrescarResumenSinFoco(campo) {
    var id = campo && campo.id, campoData = campo && campo.dataset && campo.dataset.campo, li = campo && campo.closest && campo.closest('.tv-pago'), pos = campo && campo.selectionStart;
    if (campo && campo.closest && campo.closest('#venResumen')) {
      pintarResumen();
      var nuevo = id ? document.getElementById(id) : (li ? raiz.querySelector('.tv-pago[data-i="' + li.dataset.i + '"] [data-campo="' + campoData + '"]') : null);
      if (nuevo) { nuevo.focus(); try { nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); } catch (_) {} }
    } else pintarResumen();
  }

  function alTecla(e) {
    var t = e.target;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && vista === 'nueva') { e.preventDefault(); registrar(); return; }
    if (e.key === 'Escape' && !document.getElementById('venModal').hidden) { e.preventDefault(); cerrarModal(); return; }
    if (e.key !== 'Enter') return;
    if (t.id === 'venBuscaCli') {
      e.preventDefault();
      var primero = db.buscarClientes(t.value, 1)[0];
      if (primero && T.limpiarEspacios(t.value)) elegirCliente(primero.id); else abrirFormularioCon(t.value);
    } else if (t.closest && t.closest('#venCliForm') && t.tagName === 'INPUT' && t.type !== 'checkbox') {
      // Enter avanza al siguiente campo. En un campo opcional vacío (o en el
      // último), confirma: lo más rápido son tres Enter (cédula, nombre, Enter).
      e.preventDefault();
      var orden = ['venCliDoc', 'venCliNombre', 'venCliTel', 'venCliCorreo', 'venCliDir'];
      var pos = orden.indexOf(t.id);
      var opcional = pos >= 2;
      if ((opcional && !t.value.trim()) || pos === orden.length - 1) { confirmarCliente(); return; }
      enfocar(orden[pos + 1]);
    } else if (t.id === 'venBuscaProd') {
      e.preventDefault();
      var p = buscarProductos(t.value)[0];
      if (p) { agregar(p.sku); t.select(); }
    } else if (t.dataset && (t.dataset.campo === 'cantidad' || t.dataset.campo === 'precio')) {
      e.preventDefault(); pintarCarrito(); enfocar('venBuscaProd');
    }
  }

  function enfocar(id) { setTimeout(function () { var el = document.getElementById(id); if (el) { el.focus(); if (el.select) el.select(); } }, 20); }
  function enfocarInicio() {
    if (vista !== 'nueva') return;
    if (v.clienteModo === 'buscar') enfocar('venBuscaCli');
    else if (v.clienteModo === 'nuevo') enfocar(v.form.documento ? 'venCliNombre' : 'venCliDoc');
    else enfocar('venBuscaProd');
  }

  // ── Desde afuera ───────────────────────────────────
  function irAVender() { if (typeof switchTab === 'function') switchTab('ven'); }
  function venderA(cliente) {
    vista = 'nueva';
    v.cliente = Object.assign({}, cliente, { autorizaDatos: !!cliente.autorizaDatos || !!cliente.id });
    v.form = { tipoDoc: cliente.tipoDoc, documento: cliente.documento, nombre: cliente.nombre, telefono: cliente.telefono || '', correo: cliente.correo || '', direccion: cliente.direccion || '', autorizaDatos: v.cliente.autorizaDatos };
    v.clienteModo = 'listo';
    guardarBorrador();
    irAVender();
    pintarTodo(); enfocar('venBuscaProd');
  }
  function desdeCotizacion() {
    irAVender();
    A.listo.then(function () {
      setTimeout(function () {
        if (v.clienteModo === 'listo') { traerCotizacion(); return; }
        // Primero el cliente; la cotización se trae sola cuando esté completo.
        var q = document.getElementById('cliente');
        if (v.clienteModo === 'buscar' && q && q.value.trim()) {
          var b = document.getElementById('venBuscaCli'); if (b) { b.value = q.value.trim(); pintarResultadosCliente(b.value); }
        }
        pendienteTraer = true;
        toast('Completa el cliente: la cotización se pasa sola a la venta', 'info');
      }, 60);
    });
  }
  var pendienteTraer = false;
  var confirmarOriginal = confirmarCliente, elegirOriginal = elegirCliente;
  confirmarCliente = function () { confirmarOriginal(); if (pendienteTraer && v.clienteModo === 'listo') { pendienteTraer = false; traerCotizacion(); } };
  elegirCliente = function (id) { elegirOriginal(id); if (pendienteTraer && v.clienteModo === 'listo') { pendienteTraer = false; traerCotizacion(); } };

  window.TiendaVender = { montar: montar, desdeCotizacion: desdeCotizacion, venderA: venderA, prellenar: prellenar };
})();
