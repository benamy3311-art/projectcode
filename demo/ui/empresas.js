// ============================================================
// COTIZACIÓN PARA EMPRESAS (documento A4 / PDF corporativo)
// ============================================================
// Segundo modo del panel de cotización. El documento normal está pensado
// para pantalla y WhatsApp; este está pensado desde el A4 hacia afuera,
// para áreas de compras que piden PDF formal: bloque emisor/cliente con
// NIT, numeración de líneas, subtotal e IVA desglosados, valor en letras,
// condiciones comerciales y datos para el pago.
//
// El modo se elige en la barra de pestañas (Normal | Empresas) y decide
// qué se ve en pantalla Y qué sale al exportar a PDF: el vendedor no manda
// dos hojas de condiciones por una pasta térmica.
//
// Globales que expone (window.*):
//   setQuoteMode(m)       — 'normal' | 'empresas'; re-renderiza
//   renderEmpresaDoc()    — HTML de las hojas A4 (lo llama generateQuote)
//   setEmpCliente(k, el)  — guarda un campo del cliente y re-renderiza
//   empresaDefaults()     — textos por defecto de las condiciones
//
// Depende de: domain.js (esc, fmtCOP, numeroALetras, parseComboComponents),
//   storage.js (loadCfg), state.js (S, items, setState, notifyQuote),
//   services.js (calcEngine, applyDisc, getCat)
// Requiere DOM: #qWrap, #qmodeSeg, #notasCot
// ============================================================
(function () {

  // Cuántos ítems caben por hoja. Medido sobre A4 con el encabezado
  // completo (hoja 1) y con el encabezado de continuación (hoja N).
  var ITEMS_P1 = 12;
  var ITEMS_PN = 22;
  // Con pocos ítems el cierre cabe en la misma hoja y la cotización
  // queda en una sola página, que es lo que uno espera de 2 o 3 líneas.
  // Medido sobre el documento real en A4: el cierre (condiciones + datos de
  // pago + nota legal) con 3 ítems llega a 294mm de los 297 de la hoja; con
  // el cuarto se pasa y la impresión saca media hoja suelta.
  var CIERRE_INLINE_MAX = 3;

  var LS_MODE = 'sl_quote_mode';

  // Textos por defecto. Son solo el punto de partida: se editan desde
  // Configuración → "Cotización para empresas" y se guardan en sl_cfg.
  var DEFAULTS = {
    empFormaPago: '100% anticipado · transferencia o consignación',
    empEntrega: '3 a 5 días hábiles desde la confirmación del pago',
    empEnvio: 'No incluido · flete a cargo del comprador, se paga a la transportadora al recibir',
    empRegimen: 'Responsable de IVA',
    empObservaciones: 'Somos Grandes Contribuyentes de Impuestos Distritales en la ciudad de '
      + 'Bogotá, según Resolución DDI 029334 de 31 de octubre de 2025.',
    empNotaLegal: 'Este documento es una cotización y no constituye factura de venta. '
      + 'Los precios están sujetos a cambios y a disponibilidad de inventario.',
    // Razón social y NIT: salen de Configuración → "Datos de la Empresa"
    // (cfg.empresa / cfg.nit). Sin respaldo a propósito — el encabezado
    // identifica legalmente a quien emite la cotización, así que un valor
    // por defecto acá haría que el PDF saliera con los datos de otra
    // empresa. Vacío = el encabezado y el pie omiten esas líneas (ver
    // logoBlock y pieHoja).
    empresa: '',
    nit: ''
  };

  window.empresaDefaults = function () {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    return o;
  };

  function cfgTxt(cfg, key) {
    var v = cfg && cfg[key];
    return (v === undefined || v === null || v === '') ? DEFAULTS[key] : v;
  }

  // ── Estado ────────────────────────────────────────────────
  function cliente() {
    if (!S.empresaCliente) S.empresaCliente = {};
    return S.empresaCliente;
  }

  window.setEmpCliente = function (key, el) {
    cliente()[key] = el.value;
    if (typeof notifyQuote === 'function') notifyQuote();
  };

  // body.empresa-mode: lo usa el @media print para no sumar el padding
  // del documento normal encima del margen propio de la hoja A4.
  function paintMode(on) {
    document.body.classList.toggle('empresa-mode', on);
    var seg = document.getElementById('qmodeSeg');
    if (!seg) return;
    seg.querySelectorAll('.qmode-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === (on ? 'empresas' : 'normal'));
    });
  }

  window.setQuoteMode = function (m) {
    var on = (m === 'empresas');
    setState('empresaMode', on);
    try { localStorage.setItem(LS_MODE, on ? 'empresas' : 'normal'); } catch (_e) { }
    paintMode(on);
    if (typeof generateQuote === 'function' && items.length) generateQuote(true);
  };

  // Restaurar el modo elegido en la sesión anterior (por dispositivo, no
  // por usuario: es una preferencia de "cómo quiero ver esto", no un dato
  // de la cuenta).
  document.addEventListener('DOMContentLoaded', function () {
    var saved = null;
    try { saved = localStorage.getItem(LS_MODE); } catch (_e) { }
    setState('empresaMode', saved === 'empresas');
    paintMode(saved === 'empresas');
  });

  // ── Piezas del documento ──────────────────────────────────

  function ico(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }

  function logoBlock(cfg) {
    // El logo puede venir de Firestore (config/branding.logoUrl): validado con
    // safeImgSrc (domain.js) y escapado, igual que en el documento normal.
    var src = (typeof T !== 'undefined' && T.brandLogoSrc) ? safeImgSrc(T.brandLogoSrc()) : '';
    // Razón social y NIT salen de Configuración → "Datos de la Empresa".
    // Si están vacíos el bloque sale sin ellos y no se sustituyen por la
    // marca de _slBranding: este documento es formal y debe mostrar la
    // razón social legal, no el nombre comercial.
    var nombre = cfgTxt(cfg, 'empresa');
    var nit = cfgTxt(cfg, 'nit');
    // Sin logo cargado, el lugar de la marca lo ocupa la razón social y, si
    // tampoco hay, el nombre comercial. Antes caía a la palabra "Logo": un
    // marcador de posición impreso en una cotización que va a un área de
    // compras se lee como documento a medio hacer. Mejor vacío que eso.
    var marcaTxt = nombre || (window._slBranding || {}).brandName || '';
    var marca = src
      ? '<img class="emp-logo-img" src="' + esc(src) + '" alt="">'
      : (marcaTxt ? '<span class="emp-logo-txt">' + esc(marcaTxt) + '</span>' : '');
    var lineas = [];
    if (nombre) lineas.push('<b>' + esc(nombre) + '</b>');
    if (nit) lineas.push('NIT ' + esc(nit));
    if (cfg.dir) lineas.push(esc(cfg.dir));
    var contacto = [];
    if (cfg.tel) contacto.push(esc(cfg.tel));
    if (cfg.email) contacto.push(esc(cfg.email));
    if (contacto.length) lineas.push(contacto.join(' · '));
    return '<div class="emp-hd-logo">' + marca
      + (lineas.length ? '<div class="emp-emisor">' + lineas.join('<br>') + '</div>' : '')
      + '</div>';
  }

  function headerP1(cfg, numCot, fecha, valida) {
    return '<div class="emp-hd">'
      + logoBlock(cfg)
      + '<div class="emp-hd-doc">'
      + '<div class="emp-t">Cotización</div>'
      + '<div class="emp-n">N.º ' + esc(numCot) + '</div>'
      + '<dl><dt>Fecha</dt><dd>' + esc(fecha) + '</dd>'
      + '<dt>Válida hasta</dt><dd>' + esc(valida) + '</dd>'
      + '<dt>Moneda</dt><dd>COP</dd></dl>'
      + '</div></div>';
  }

  function headerCont(cfg, numCot, fecha) {
    return '<div class="emp-hd emp-hd-cont">'
      + logoBlock(cfg)
      + '<div class="emp-hd-doc"><div class="emp-t emp-t-sm">Cotización ' + esc(numCot) + '</div>'
      + '<div class="emp-cont-tag">Continuación · ' + esc(fecha) + '</div></div>'
      + '</div>';
  }

  function partiesBlock(cfg, asesor, wa) {
    var c = cliente();
    function fila(dt, dd, strong) {
      if (!dd) return '';
      return '<dt>' + dt + '</dt><dd>' + (strong ? '<b>' + esc(dd) + '</b>' : esc(dd)) + '</dd>';
    }
    var destNombre = c.razonSocial || '—';
    return '<div class="emp-parties">'
      + '<div class="emp-party">'
      + '<h3>Elaborada por</h3>'
      + '<div class="emp-nm">' + esc(asesor || '—') + '</div>'
      + '<dl>' + fila('Cargo', 'Asesor comercial')
      + fila('WhatsApp', wa || cfg.tel, true)
      + fila('Correo', cfg.email) + '</dl>'
      + '</div>'
      + '<div class="emp-party dest">'
      + '<h3>Dirigida a</h3>'
      + '<div class="emp-nm">' + esc(destNombre) + '</div>'
      + '<dl>' + fila('NIT', c.nit, true)
      + fila('Contacto', c.contacto)
      + fila('Correo', c.email)
      + fila('Ciudad', c.ciudad) + '</dl>'
      + '</div></div>';
  }

  // Ficha técnica en cápsulas — misma pieza visual que .qspec del
  // documento normal (T.quoteSpecChips), pero como <div> en vez de <tr>
  // porque acá vive dentro de una sola <td>, no de una tabla de 6
  // columnas. El valor es contenteditable y escribe en el mismo
  // _comboEdits vía saveComboEdit(): editar en un modo se ve en el otro.
  function empSpecCapsules(comps, idx, edits) {
    var rows = '';
    for (var ci = 1; ci < comps.length; ci++) {
      var val = (edits && edits[ci] !== undefined) ? edits[ci] : comps[ci].value;
      if (!val) continue;
      var lbl = comboChipLabel(comps[ci].label);
      var editable = (idx != null)
        ? ' contenteditable="true" oninput="saveComboEdit(' + idx + ',' + ci + ',this)" onblur="notifyQuote()" title="Clic para editar"'
        : '';
      rows += '<div class="emp-spec' + (COMBO_CHIP_HERO[lbl] ? ' hero' : '') + '">'
        + (lbl ? '<b>' + esc(lbl) + '</b>' : '<b class="emp-spec-nolabel"></b>')
        + '<i' + editable + '>' + esc(val) + '</i></div>';
    }
    return rows ? '<div class="emp-specs">' + rows + '</div>' : '';
  }

  // Fila de producto. Mismo criterio que generateQuote() en services.js
  // para el documento normal: el desglose solo sale si el vendedor lo
  // desplegó con "Ver componentes" (it._showComponents) — acá se
  // replica esa misma condición y el mismo recorte de la descripción a
  // la referencia (comps[0].value), para que ambos modos coincidan
  // exactamente en qué se ve y cuándo.
  // idx = índice real en `items` (no en la página) — habilita reemplazar
  // y eliminar el producto, igual que en el documento normal. Reusa
  // openSwapPicker()/removeQuoteItem() tal cual: ambos ya terminan en
  // dispatch() → notifyQuote(), que re-renderiza #quoteDoc sin importar
  // el modo (ver generateQuote en services.js).
  function itemRow(it, n, unitD, lineT, showIva, idx) {
    var cat = it._cat || getCat(it.name);
    var specs = '';
    var displayName = it.name;
    if (it._showComponents && typeof isEnsamblado === 'function' && isEnsamblado(it)) {
      var comps = parseComboComponents(it.name, it._cat);
      if (comps && comps.length > 1) {
        displayName = (it._comboEdits && it._comboEdits[0] !== undefined ? it._comboEdits[0] : comps[0].value) || it.name;
        specs = empSpecCapsules(comps, idx, it._comboEdits);
      }
    }
    var excl = (showIva && it.iva === false) ? '<span class="emp-excl">Excluido de IVA</span>' : '';
    var nota = it.note ? '<div class="emp-it-nota">' + esc(it.note) + '</div>' : '';
    var acciones = (idx != null)
      ? '<td class="no-print emp-it-actions">'
      + '<button class="emp-act-btn" onclick="openSwapPicker(' + idx + ')" title="Reemplazar producto">' + ico('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>') + '</button>'
      + '<button class="emp-act-btn emp-act-rm" onclick="removeQuoteItem(' + idx + ')" title="Eliminar">' + ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') + '</button>'
      + '</td>'
      : '<td class="no-print"></td>';
    return '<tr>'
      + acciones
      + '<td class="emp-it-n">' + n + '</td>'
      + '<td class="emp-it-sku">' + esc(it.sku) + '</td>'
      + '<td><div class="emp-it-desc">' + esc(displayName) + '</div>' + specs + nota
      + '<span class="emp-it-cat">' + esc(cat) + '</span>' + excl + '</td>'
      + '<td class="c emp-it-qty">' + it.qty + '</td>'
      + '<td class="r emp-it-vu">' + fmtCOP(unitD) + '</td>'
      + '<td class="r emp-it-tot">' + fmtCOP(lineT) + '</td>'
      + '</tr>';
  }

  function tablaBlock(rows, conThead) {
    // Columna de acciones (swap/eliminar): no-print, solo para editar en
    // pantalla antes de exportar — el documento en A4 va sin ella. Va de
    // primera para que quede del mismo lado que en el documento normal,
    // donde los botones salen sobre la celda de cantidad.
    var thead = conThead
      ? '<thead><tr><th class="no-print" style="width:15mm"></th>'
      + '<th style="width:7mm">#</th><th style="width:16mm">SKU</th>'
      + '<th>Descripción</th><th class="c" style="width:12mm">Cant</th>'
      + '<th class="r" style="width:25mm">V. unitario</th>'
      + '<th class="r" style="width:27mm">Valor total</th></tr></thead>'
      : '';
    return '<table class="emp-items">' + thead + '<tbody>' + rows + '</tbody></table>';
  }

  function totalesBlock(calc, showIva, dOn, dPct) {
    var filas = '';
    if (showIva && calc.totalGravado > 0) {
      var base = calc.totalGravado - calc.ivaAmount;
      filas += '<div class="emp-sum-row"><span class="l">Subtotal gravado</span><span class="v">' + fmtCOP(base) + '</span></div>';
      if (calc.totalExcluido > 0) {
        filas += '<div class="emp-sum-row"><span class="l">Excluido de IVA</span><span class="v">' + fmtCOP(calc.totalExcluido) + '</span></div>';
      }
      filas += '<div class="emp-sum-row"><span class="l">IVA 19%</span><span class="v">' + fmtCOP(calc.ivaAmount) + '</span></div>';
    }
    if (dOn && dPct > 0) {
      filas += '<div class="emp-sum-row desc"><span class="l">Descuento pago anticipado (−' + dPct + '%)</span>'
        + '<span class="v">−' + fmtCOP(calc.discountSaved) + '</span></div>';
    }
    filas += '<div class="emp-sum-row total"><span class="l">Total</span><span class="v">' + fmtCOP(calc.totalConIva) + '</span></div>';
    if (S.reteOn) {
      filas += '<div class="emp-sum-row"><span class="l">Retefuente 2.5%</span><span class="v">−' + fmtCOP(calc.reteAmount) + '</span></div>';
      filas += '<div class="emp-sum-row neto"><span class="l">Neto a pagar</span><span class="v">' + fmtCOP(calc.netoAPagar) + '</span></div>';
    }
    var letras = numeroALetras(S.reteOn ? calc.netoAPagar : calc.totalConIva);
    return '<div class="emp-sum-wrap"><div class="emp-sum">' + filas + '</div></div>'
      + '<div class="emp-letras">Son: <b>' + letras + ' PESOS M/CTE.</b>'
      + ' &nbsp;·&nbsp; Valores en pesos colombianos.</div>';
  }

  // notas = el campo libre "Condiciones / Notas" de la barra lateral
  // (#notasCot), el mismo que usa el documento normal. Es por-cotización,
  // a diferencia del resto de este bloque que sale de Configuración, así
  // que va con su propio rótulo y no mezclado entre las condiciones fijas.
  function cierreBlock(cfg, garantiaHtml, validaTxt, notas) {
    function cond(icoPath, k, v, small) {
      return '<div class="emp-cond">' + ico(icoPath) + '<div><span class="k">' + k + '</span>'
        + '<span class="v">' + esc(v) + (small ? ' <small>' + esc(small) + '</small>' : '') + '</span></div></div>';
    }
    function condHtml(icoPath, k, vHtml) {
      return '<div class="emp-cond">' + ico(icoPath) + '<div><span class="k">' + k + '</span>'
        + '<span class="v">' + vHtml + '</span></div></div>';
    }
    var conds = ''
      + condHtml('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-5"/>', 'Garantía', garantiaHtml)
      + cond('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/>', 'Validez de la oferta', validaTxt)
      + cond('<rect x="1" y="7" width="14" height="10" rx="1.5"/><path d="M15 10h3.5L21 13.5V17h-6"/><circle cx="6" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/>', 'Envío', cfgTxt(cfg, 'empEnvio'))
      + cond('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/>', 'Forma de pago', cfgTxt(cfg, 'empFormaPago'))
      + cond('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 'Tiempo de entrega', cfgTxt(cfg, 'empEntrega'));

    var cuenta = [];
    if (cfg.banco) cuenta.push('Banco: <span>' + esc(cfg.banco) + '</span>');
    if (cfg.cuenta) cuenta.push('Cuenta ' + esc((cfg.tipoCuenta || '').toLowerCase()) + ': <span>' + esc(cfg.cuenta) + '</span>');
    if (cfg.titular) cuenta.push('Titular: <span>' + esc(cfg.titular) + '</span>');

    // El número de cotización ya está arriba en el encabezado (N.º XX) —
    // repetirlo aquí como "Referenciar" era redundante. En su lugar va
    // el régimen tributario y una observación libre (p. ej. la condición
    // de Gran Contribuyente), ambos editables en Configuración.
    var radicar = [];
    var correoOC = cfg.empRadicar || cfg.email;
    if (correoOC) radicar.push('Orden de compra a: <span>' + esc(correoOC) + '</span>');
    radicar.push('Régimen: <span>' + esc(cfgTxt(cfg, 'empRegimen')) + '</span>');
    var obsTxt = cfgTxt(cfg, 'empObservaciones');
    if (obsTxt) radicar.push('Observaciones: <span>' + esc(obsTxt) + '</span>');

    var pago = (cuenta.length || radicar.length)
      ? '<div class="emp-pago">'
      + (cuenta.length ? '<div><h4>Datos para el pago</h4><p>' + cuenta.join('<br>') + '</p></div>' : '')
      + '<div><h4>Para radicar</h4><p>' + radicar.join('<br>') + '</p></div>'
      + '</div>'
      : '';

    var legal = cfgTxt(cfg, 'empNotaLegal');
    var legalHtml = legal ? '<p class="emp-legal">' + esc(legal) + '</p>' : '';

    var notasHtml = notas
      ? '<div class="emp-notas"><h4>Notas</h4><p>' + esc(notas) + '</p></div>'
      : '';

    // Este documento NO lleva QR (la cotización normal de WhatsApp sí).
    // Es un PDF formal para un área de compras y hoy nada lo lee: el
    // lector por foto se quitó en v1.8.5 y "Actualizar cotización" busca
    // por número. Prometía "escanéala para regenerarla" sin poder
    // cumplirlo, así que se quitó del todo en vez de solo ocultarlo.

    return '<div class="emp-sect">'
      + '<div class="emp-sect-h">Condiciones comerciales</div>'
      + '<div class="emp-cond-grid">' + conds + '</div>'
      + '</div>'
      + notasHtml
      + pago
      + (legalHtml ? '<div class="emp-legal-row">' + legalHtml + '</div>' : '');
  }

  function pieHoja(cfg, numCot, pag, total) {
    var izq = [];
    var nombre = cfgTxt(cfg, 'empresa'), nit = cfgTxt(cfg, 'nit');
    if (nombre) izq.push('<b>' + esc(nombre) + '</b>');
    if (nit) izq.push('NIT ' + esc(nit));
    if (cfg.email) izq.push(esc(cfg.email));
    if (cfg.tel) izq.push(esc(cfg.tel));
    return '<div class="emp-ft"><span>' + izq.join(' · ') + '</span>'
      + '<span class="pg">Cotización ' + esc(numCot) + ' · Página ' + pag + ' de ' + total + '</span></div>';
  }

  // ── Formulario de datos del cliente (no se imprime) ───────
  // Usa onchange (no oninput) a propósito: el re-render reemplaza el
  // formulario, y con oninput se perdería el foco en cada tecla.
  function clienteForm() {
    var c = cliente();
    function f(key, label, ph, ancho) {
      return '<label class="empf-field" style="flex:' + (ancho || '1 1 180px') + '">'
        + '<span>' + label + '</span>'
        + '<input type="text" value="' + esc(c[key] || '') + '" placeholder="' + ph + '"'
        + ' onchange="setEmpCliente(\'' + key + '\',this)">'
        + '</label>';
    }
    return '<div class="empf no-print">'
      + '<div class="empf-h">' + ico('<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/>')
      + ' Datos del cliente <small>— aparecen en el bloque "Dirigida a" del PDF</small></div>'
      + '<div class="empf-row">'
      + f('razonSocial', 'Razón social', 'Empresa S.A.S.', '2 1 260px')
      + f('nit', 'NIT', '901.000.000-0', '1 1 150px')
      + '</div><div class="empf-row">'
      + f('contacto', 'Contacto', 'Área de compras')
      + f('email', 'Correo', 'compras@empresa.co')
      + f('ciudad', 'Ciudad', 'Bogotá D.C.', '1 1 140px')
      + '</div></div>';
  }

  // ── Documento completo ────────────────────────────────────
  window.renderEmpresaDoc = function () {
    var cfg = loadCfg();
    var calc = calcEngine();
    var sorted = calc.sorted;
    var asesor = document.getElementById('asesor').value.toUpperCase();
    // Prefijo con la inicial del asesor (ver domain.js:quoteDisplayNum) —
    // el consecutivo de #numCot es por asesor, así que el mismo número
    // puro se repite entre ellos. Solo para mostrar en el documento.
    var numCot = quoteDisplayNum(document.getElementById('numCot').value, asesor);
    // El WhatsApp del asesor es por-cotización (mismo campo que usa el
    // documento normal), no el teléfono general de la empresa — por eso
    // va aparte de cfg.tel.
    var wa = document.getElementById('whatsapp').value;
    var validezDias = document.getElementById('validez').value;
    var garantia = (document.getElementById('garantia') || {}).value || '12 meses';
    // Mismo campo que lee generateQuote() para el documento normal: lo que
    // el vendedor escribe en "Condiciones / Notas" tiene que salir en los
    // dos modos — antes solo aparecía en el de pantalla.
    var notas = ((document.getElementById('notasCot') || {}).value || '').trim();

    var now = new Date();
    var fecha = now.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    var dias = parseInt(validezDias, 10);
    var hasta = new Date(now.getTime() + (isNaN(dias) ? 1 : dias) * 86400000);
    var validaTxt = hasta.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

    // Garantía: reusa el mismo agrupamiento del documento normal.
    var grupos = (typeof computeWarrantyGroups === 'function')
      ? computeWarrantyGroups(sorted, garantia, cfg) : [{ term: garantia, byMaker: false }];
    var garantiaHtml = grupos.length === 1
      ? esc(grupos[0].term) + (grupos[0].byMaker ? ', directamente con el fabricante' : ' por defectos de fabricación')
      : '<span class="emp-wgroups">' + grupos.map(function (g) {
          var note = g.byMaker ? ' (con el fabricante)' : ' por defectos de fabricación';
          return '<span class="emp-wrow">' + esc(g.label) + ': ' + esc(g.term) + note + '</span>';
        }).join('') + '</span>';

    // Repartir ítems en hojas
    var paginas = [];
    var i = 0, n = 0;
    while (i < sorted.length) {
      var cupo = paginas.length === 0 ? ITEMS_P1 : ITEMS_PN;
      paginas.push(sorted.slice(i, i + cupo));
      i += cupo;
    }
    if (!paginas.length) paginas.push([]);

    var ultima = paginas[paginas.length - 1];
    // Las notas son texto libre: pueden ser un renglón o un párrafo entero.
    // La caja pesa ~14mm (margen incluido) más ~3.6mm por renglón, contra
    // los ~15mm que ocupa una fila de producto: se descuentan del cupo los
    // ítems equivalentes, así el cierre se va a su propia hoja antes de
    // desbordar el A4.
    var notasRenglones = notas
      ? Math.ceil(notas.length / 95) + (notas.match(/\n/g) || []).length : 0;
    var notasEnItems = notas ? Math.ceil((14 + 3.6 * notasRenglones) / 15) : 0;
    var cupoCierre = Math.max(0, CIERRE_INLINE_MAX - notasEnItems);
    var cierreAparte = ultima.length > cupoCierre;
    var totalHojas = paginas.length + (cierreAparte ? 1 : 0);

    var html = '';
    for (var p = 0; p < paginas.length; p++) {
      var esPrimera = (p === 0);
      var esUltimaItems = (p === paginas.length - 1);
      var filas = '';
      for (var k = 0; k < paginas[p].length; k++) {
        var it = paginas[p][k];
        n++;
        var unitD = applyDisc(it.price) * 1000;
        var idx = items.indexOf(it);
        filas += itemRow(it, n, unitD, unitD * it.qty, S.showIvaInQuote, idx >= 0 ? idx : null);
      }
      html += '<div class="emp-sheet">'
        + (esPrimera ? headerP1(cfg, numCot, fecha, validaTxt) + partiesBlock(cfg, asesor, wa)
          : headerCont(cfg, numCot, fecha))
        + tablaBlock(filas, true)
        + (esUltimaItems ? totalesBlock(calc, S.showIvaInQuote, S.discountOn, S.discountPct) : '')
        + (esUltimaItems && !cierreAparte ? cierreBlock(cfg, garantiaHtml, validaTxt, notas) : '')
        + pieHoja(cfg, numCot, p + 1, totalHojas)
        + '</div>';
    }
    if (cierreAparte) {
      html += '<div class="emp-sheet">' + headerCont(cfg, numCot, fecha)
        + cierreBlock(cfg, garantiaHtml, validaTxt, notas)
        + pieHoja(cfg, numCot, totalHojas, totalHojas)
        + '</div>';
    }

    return '<div class="emp-doc" id="quoteDoc">' + clienteForm() + html + '</div>';
  };

})();
