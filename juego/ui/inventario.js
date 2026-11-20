// ============================================================
// INVENTARIO — existencias, entradas, conteos y copia de seguridad
// ============================================================
// Muestra cada producto del catálogo activo (y los propios de la tienda)
// con sus existencias y su precio. Las existencias no se escriben a mano:
// salen del libro de movimientos (infrastructure/tienda-db.js). Para
// cambiarlas hay dos caminos, y los dos dejan rastro:
//   - Entrada: llegó mercancía (suma).
//   - Conteo: se contó lo que hay en el estante; se registra la diferencia.
// Cada producto tiene su historial (kardex) con quién, cuándo y por qué.
//
// Abajo, la configuración de esta caja y la copia de seguridad: descargar
// un archivo con TODO (clientes, ventas, inventario) y restaurarlo en otro
// equipo. Restaurar solo agrega; nunca borra.
//
// Globales que expone (window.*):
//   TiendaInventario.montar()
// Depende de: ui/tienda-app.js, domain/tienda.js, ui.js (showToast)
// Requiere DOM: #invRaiz
// ============================================================
(function () {
  var A = window.TiendaApp, T = window.Tienda;
  if (!A || !T) return;
  var esc = A.esc, fmt = A.fmt;
  var db = null, raiz = null, montado = false;
  var filtro = { texto: '', estado: 'todos' };
  var abierto = { sku: '', modo: '' }; // fila desplegada: entrada | conteo | historial
  var LIMITE = 150;
  var mostrar = LIMITE;

  function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'success'); }

  function montar() {
    raiz = document.getElementById('invRaiz');
    if (!raiz) return;
    if (montado) { pintarTabla(); pintarResumen(); return; }
    montado = true;
    raiz.innerHTML = '<div class="tv-cargando">Abriendo la base de la tienda…</div>';
    A.listo.then(function (base) {
      db = base;
      raiz.innerHTML =
        '<header class="tv-cab"><div><h2>Inventario</h2><p class="tv-mini">Existencias de esta tienda. Los precios salen de la lista activa del catálogo.</p></div>' +
          '<div class="tv-cab-acc"><button type="button" class="tv-btn tv-btn-suave" data-acc="producto-nuevo">Producto propio</button><button type="button" class="tv-btn tv-btn-suave" data-acc="ajustes">Caja y copia de seguridad</button></div></header>' +
        '<dl class="tv-kpis" id="invResumen"></dl>' +
        '<div class="tv-filtros">' +
          '<label class="tv-buscar"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="invBuscar" placeholder="Buscar producto o código" autocomplete="off" aria-label="Buscar en el inventario"></label>' +
          '<div class="tv-seg" id="invEstados">' + [['todos', 'Todos'], ['con', 'Con existencias'], ['sin', 'Sin existencias'], ['revisar', 'Revisar']].map(function (o) { return '<button type="button" data-acc="estado" data-estado="' + o[0] + '" aria-pressed="' + (filtro.estado === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
        '</div>' +
        '<div class="tv-panel-extra" id="invExtra" hidden></div>' +
        '<ul class="tv-inv" id="invLista"></ul>';
      raiz.addEventListener('click', alClic);
      raiz.addEventListener('input', alEscribir);
      raiz.addEventListener('keydown', alTecla);
      raiz.addEventListener('submit', function (e) { e.preventDefault(); });
      db.alCambiar(function () { pintarTabla(); pintarResumen(); });
      if (window.TiendaSync) TiendaSync.alCambiar(pintarResumen);
      pintarTabla(); pintarResumen();
    }, function (err) {
      raiz.innerHTML = '<div class="tv-error-grande"><b>No se pudo abrir la base de la tienda.</b><span>' + esc(err.message) + '</span></div>';
    });
  }

  function pintarResumen() {
    var el = document.getElementById('invResumen');
    if (!el || !db) return;
    var prods = A.productos(), stock = db.stock();
    var refs = 0, unidades = 0, valor = 0, revisar = 0;
    prods.forEach(function (p) {
      if (p.noInventariable) return;
      var n = stock[p.sku] || 0;
      if (n > 0) { refs++; unidades += n; valor += n * p.precio; }
      if (n < 0) revisar++;
    });
    var s = window.TiendaSync ? TiendaSync.estado() : { pendientes: 0, conServidor: false };
    el.innerHTML = '<div><dt>Referencias con existencias</dt><dd>' + refs + '</dd></div>' +
      '<div><dt>Unidades</dt><dd>' + unidades.toLocaleString('es-CO') + '</dd></div>' +
      '<div><dt>Valor a precio de venta</dt><dd>' + fmt(valor) + '</dd></div>' +
      (revisar ? '<div class="tv-kpi-alerta"><dt>Para revisar</dt><dd>' + revisar + '</dd></div>' : '') +
      '<div><dt>Guardado</dt><dd class="tv-kpi-txt">' + (s.conServidor ? (s.pendientes ? s.pendientes + ' por enviar' : 'Al día') : 'En este equipo') + '</dd></div>';
  }

  function lista() {
    var q = T.textoBusqueda(filtro.texto).split(' ').filter(Boolean);
    var stock = db.stock();
    return A.productos().filter(function (p) {
      for (var j = 0; j < q.length; j++) if (p._busq.indexOf(q[j]) < 0) return false;
      var n = stock[p.sku] || 0;
      if (filtro.estado === 'con') return n > 0;
      if (filtro.estado === 'sin') return n === 0 && !p.noInventariable;
      if (filtro.estado === 'revisar') return n < 0;
      return true;
    });
  }

  function pintarTabla() {
    var ul = document.getElementById('invLista');
    if (!ul || !db) return;
    var l = lista(), stock = db.stock();
    if (!l.length) { ul.innerHTML = '<li class="tv-vacio-grande">' + (A.productos().length ? 'Nada coincide con el filtro.' : 'El catálogo aún no carga. Abre la pestaña Catálogo para cargar la lista de precios.') + '</li>'; return; }
    ul.innerHTML = l.slice(0, mostrar).map(function (p) {
      var n = stock[p.sku] || 0;
      var est = p.noInventariable ? 'tv-chip' : n > 0 ? 'tv-chip tv-chip-menta' : n < 0 ? 'tv-chip tv-chip-rosa' : 'tv-chip tv-chip-durazno';
      var abiertoAqui = abierto.sku === p.sku;
      return '<li class="tv-inv-fila' + (abiertoAqui ? ' tv-abierta' : '') + '" data-sku="' + esc(p.sku) + '">' +
        '<div class="tv-inv-prod"><b>' + esc(p.nombre) + '</b><small>' + esc(p.sku) + ' · ' + esc(p.categoria) + (p.propio ? ' · propio' : '') + '</small></div>' +
        '<span class="tv-inv-precio">' + fmt(p.precio) + '</span>' +
        '<span class="tv-inv-n"><span class="' + est + '">' + (p.noInventariable ? 'Servicio' : n) + '</span></span>' +
        (p.noInventariable ? '<span></span>' : '<div class="tv-inv-acc">' +
          '<button type="button" class="tv-btn tv-btn-suave tv-btn-chico" data-acc="abrir" data-modo="entrada">Entrada</button>' +
          '<button type="button" class="tv-btn tv-btn-suave tv-btn-chico" data-acc="abrir" data-modo="conteo">Contar</button>' +
          '<button type="button" class="tv-btn tv-btn-suave tv-btn-chico" data-acc="abrir" data-modo="historial">Historial</button></div>') +
        (abiertoAqui ? '<div class="tv-inv-panel" id="invPanel">' + panelFila(p, n) + '</div>' : '') +
      '</li>';
    }).join('') + (l.length > mostrar ? '<li class="tv-mas-fila"><button type="button" class="tv-btn tv-btn-suave" data-acc="mas">Mostrar ' + Math.min(LIMITE, l.length - mostrar) + ' más de ' + (l.length - mostrar) + '</button></li>' : '');
    if (abierto.modo === 'historial' && abierto.sku) cargarHistorial(abierto.sku);
  }

  function panelFila(p, n) {
    if (abierto.modo === 'entrada') {
      return '<form class="tv-inv-form" data-form="entrada"><div class="tv-f"><label for="invCant">Unidades que llegaron</label><input id="invCant" inputmode="numeric" autocomplete="off" placeholder="0"></div>' +
        '<div class="tv-f tv-f-ancho"><label for="invNota">Proveedor o factura</label><input id="invNota" autocomplete="off" placeholder="Opcional: de dónde vino"></div>' +
        '<button type="submit" class="tv-btn tv-btn-tinta" data-acc="guardar-entrada">Sumar al inventario</button><button type="button" class="tv-link" data-acc="cerrar">Cancelar</button>' +
        '<small class="tv-ayuda">Hoy hay ' + n + '. Queda registrado quién y cuándo.</small></form>';
    }
    if (abierto.modo === 'conteo') {
      return '<form class="tv-inv-form" data-form="conteo"><div class="tv-f"><label for="invCant">Unidades contadas en tienda</label><input id="invCant" inputmode="numeric" autocomplete="off" placeholder="' + Math.max(0, n) + '"></div>' +
        '<div class="tv-f tv-f-ancho"><label for="invNota">Motivo</label><input id="invNota" autocomplete="off" placeholder="Ej: conteo de fin de mes, producto averiado"></div>' +
        '<button type="submit" class="tv-btn tv-btn-tinta" data-acc="guardar-conteo">Guardar conteo</button><button type="button" class="tv-link" data-acc="cerrar">Cancelar</button>' +
        '<small class="tv-ayuda">El libro dice ' + n + '. Se registra solo la diferencia.</small></form>';
    }
    return '<div class="tv-kardex" id="invKardex">Cargando historial…</div>';
  }

  var MOTIVO_TXT = { entrada: 'Entrada', venta: 'Venta', ajuste: 'Ajuste por conteo', anulacion: 'Anulación', devolucion: 'Devolución', inicial: 'Inventario inicial' };
  function cargarHistorial(sku) {
    db.kardex(sku).then(function (movs) {
      var el = document.getElementById('invKardex');
      if (!el) return;
      if (!movs.length) { el.innerHTML = '<p class="tv-mini">Sin movimientos todavía.</p>'; return; }
      var saldo = movs.reduce(function (a, m) { return a + m.delta; }, 0);
      el.innerHTML = '<table class="tv-tabla"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th class="tv-r">Cant.</th><th class="tv-r">Queda</th></tr></thead><tbody>' +
        movs.slice(0, 60).map(function (m) {
          var fila = '<tr><td>' + esc(A.fechaHora(m.fecha)) + '</td><td>' + esc(MOTIVO_TXT[m.motivo] || m.motivo) + '</td><td>' + esc([m.nota, m.usuario].filter(Boolean).join(' · ')) + '</td><td class="tv-r ' + (m.delta > 0 ? 'tv-sube' : 'tv-baja') + '">' + (m.delta > 0 ? '+' : '') + m.delta + '</td><td class="tv-r">' + saldo + '</td></tr>';
          saldo -= m.delta;
          return fila;
        }).join('') + '</tbody></table>';
    });
  }

  // ── Configuración y copia de seguridad ─────────────
  function pintarAjustes() {
    var el = document.getElementById('invExtra');
    var c = db.config();
    el.hidden = false;
    el.innerHTML = '<div class="tv-ajustes">' +
      '<section><h4>Esta caja</h4>' +
        '<div class="tv-f"><label for="invCaja">Código de caja</label><input id="invCaja" maxlength="4" value="' + esc(c.caja) + '" autocomplete="off"><small class="tv-ayuda">Va en el número de cada documento (RC-' + esc(c.caja) + '-000123). Usa uno distinto en cada computador que venda, para que dos cajas nunca repitan número.</small></div>' +
        '<div class="tv-f"><label for="invSede">Sede</label><input id="invSede" value="' + esc(c.sede || '') + '" autocomplete="off" placeholder="Ej: Sede Norte"></div>' +
        '<label class="tv-check"><input type="checkbox" id="invSinExist"' + (c.permitirSinExistencias ? ' checked' : '') + '><span>Permitir vender productos sin existencias registradas (avisa, pero no bloquea). Desactívalo cuando el inventario esté completo.</span></label>' +
        '<button type="button" class="tv-btn tv-btn-tinta" data-acc="guardar-ajustes">Guardar</button>' +
      '</section>' +
      '<section><h4>Copia de seguridad</h4>' +
        '<p class="tv-mini">Mientras no haya servidor, los datos viven en este computador. Descarga una copia al cerrar cada día y guárdala fuera del equipo (correo, Drive o USB).</p>' +
        '<p class="tv-mini" id="invAlmac">Revisando el almacenamiento…</p>' +
        '<div class="tv-acciones"><button type="button" class="tv-btn tv-btn-tinta" data-acc="exportar">Descargar copia</button>' +
        '<label class="tv-btn tv-btn-suave">Restaurar copia<input type="file" id="invImportar" accept="application/json,.json" hidden></label></div>' +
        '<small class="tv-ayuda">Restaurar solo agrega o actualiza: nunca borra lo que ya hay en este equipo.</small>' +
      '</section>' +
      '<button type="button" class="tv-x" data-acc="cerrar-ajustes" aria-label="Cerrar">×</button></div>';
    db.estadoAlmacenamiento().then(function (s) {
      var p = document.getElementById('invAlmac'); if (!p) return;
      var usado = s.usado != null ? (s.usado / 1048576).toFixed(1) + ' MB usados' : '';
      p.innerHTML = (s.persistente ? '<span class="tv-chip tv-chip-menta">Protegido</span> El navegador no borrará estos datos por falta de espacio.' : '<span class="tv-chip tv-chip-durazno">Sin protección</span> El navegador podría borrarlos si se queda sin espacio. <button type="button" class="tv-link" data-acc="proteger">Protegerlos</button>') + (usado ? ' · ' + usado : '');
    });
    document.getElementById('invImportar').addEventListener('change', importar);
  }

  function exportar() {
    db.exportar().then(function (copia) {
      var blob = new Blob([JSON.stringify(copia)], { type: 'application/json' });
      var a = document.createElement('a');
      var d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = 'tienda-' + (db.config().caja || 'caja') + '-' + d.toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('Copia descargada: ' + copia.datos.ventas.length + ' ventas, ' + copia.datos.clientes.length + ' clientes', 'success');
    }, function (e) { toast('No se pudo crear la copia: ' + e.message, 'error'); });
  }

  function importar(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var copia;
      try { copia = JSON.parse(r.result); } catch (_) { toast('El archivo no es una copia válida', 'error'); return; }
      if (!confirm('¿Restaurar la copia del ' + String(copia.exportado || '').slice(0, 10) + '? Se agregan sus datos a los de este equipo; no se borra nada.')) return;
      db.importar(copia).then(function (n) { toast('Copia restaurada: ' + n.ventas + ' ventas, ' + n.clientes + ' clientes, ' + n.movimientos + ' movimientos', 'success'); },
        function (er) { toast(er.message, 'error'); });
    };
    r.readAsText(f);
  }

  function pintarProductoNuevo() {
    var el = document.getElementById('invExtra');
    el.hidden = false;
    el.innerHTML = '<form class="tv-ajustes tv-ajustes-una" data-form="producto"><section><h4>Producto propio</h4>' +
      '<p class="tv-mini">Para lo que no viene en la lista del proveedor: servicios, usados, accesorios propios. Si el código existe en el catálogo, este lo reemplaza en la venta.</p>' +
      '<div class="tv-grid3"><div class="tv-f"><label for="invPSku">Código</label><input id="invPSku" autocomplete="off" placeholder="Ej: SERV-01"></div>' +
      '<div class="tv-f tv-f-ancho"><label for="invPNombre">Nombre</label><input id="invPNombre" autocomplete="off" placeholder="Ej: Instalación de Windows"></div>' +
      '<div class="tv-f"><label for="invPPrecio">Precio de venta (IVA incluido)</label><input id="invPPrecio" inputmode="numeric" autocomplete="off" placeholder="$ 0"></div></div>' +
      '<label class="tv-check"><input type="checkbox" id="invPIva" checked><span>Lleva IVA del 19 %</span></label>' +
      '<label class="tv-check"><input type="checkbox" id="invPServ"><span>Es un servicio (no lleva existencias)</span></label>' +
      '<div class="tv-acciones"><button type="submit" class="tv-btn tv-btn-tinta" data-acc="guardar-producto">Guardar producto</button><button type="button" class="tv-link" data-acc="cerrar-ajustes">Cancelar</button></div>' +
      '</section></form>';
    setTimeout(function () { var x = document.getElementById('invPSku'); if (x) x.focus(); }, 20);
  }

  // ── Eventos ────────────────────────────────────────
  function alClic(e) {
    var b = e.target.closest('[data-acc]');
    if (!b) return;
    var fila = b.closest('[data-sku]');
    var sku = fila ? fila.dataset.sku : '';
    var acc = b.dataset.acc;
    if (acc === 'estado') { filtro.estado = b.dataset.estado; raiz.querySelectorAll('#invEstados button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); mostrar = LIMITE; pintarTabla(); }
    else if (acc === 'abrir') { abierto = (abierto.sku === sku && abierto.modo === b.dataset.modo) ? { sku: '', modo: '' } : { sku: sku, modo: b.dataset.modo }; pintarTabla(); var c = document.getElementById('invCant'); if (c) c.focus(); }
    else if (acc === 'cerrar') { abierto = { sku: '', modo: '' }; pintarTabla(); }
    else if (acc === 'guardar-entrada' || acc === 'guardar-conteo') guardarFila(acc === 'guardar-entrada' ? 'entrada' : 'conteo');
    else if (acc === 'mas') { mostrar += LIMITE; pintarTabla(); }
    else if (acc === 'ajustes') pintarAjustes();
    else if (acc === 'producto-nuevo') pintarProductoNuevo();
    else if (acc === 'cerrar-ajustes') { var x = document.getElementById('invExtra'); x.hidden = true; x.innerHTML = ''; }
    else if (acc === 'exportar') exportar();
    else if (acc === 'proteger') db.pedirPersistencia().then(function (ok) { toast(ok ? 'Datos protegidos en este navegador' : 'El navegador no lo permitió. Descarga copias con frecuencia.', ok ? 'success' : 'warn'); pintarAjustes(); });
    else if (acc === 'guardar-ajustes') {
      var caja = (document.getElementById('invCaja').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      db.guardarConfig({ caja: caja, sede: T.limpiarEspacios(document.getElementById('invSede').value), permitirSinExistencias: document.getElementById('invSinExist').checked })
        .then(function () { toast('Configuración guardada', 'success'); pintarAjustes(); }, function (er) { toast(er.message, 'error'); });
    } else if (acc === 'guardar-producto') {
      db.guardarProducto({ sku: document.getElementById('invPSku').value, nombre: document.getElementById('invPNombre').value, precio: Number(String(document.getElementById('invPPrecio').value).replace(/\D/g, '')), iva: document.getElementById('invPIva').checked, noInventariable: document.getElementById('invPServ').checked })
        .then(function (p) { toast('Producto ' + p.sku + ' guardado', 'success'); var x = document.getElementById('invExtra'); x.hidden = true; x.innerHTML = ''; }, function (er) { toast(er.message, 'error'); });
    }
  }

  function guardarFila(modo) {
    var cant = Number(String(document.getElementById('invCant').value).replace(/\D/g, ''));
    var nota = document.getElementById('invNota').value;
    var campo = document.getElementById('invCant');
    if (document.getElementById('invCant').value.trim() === '' || !Number.isInteger(cant) || (modo === 'entrada' && cant <= 0)) { campo.focus(); campo.closest('.tv-f').setAttribute('data-error', ''); if (window.TactoApp) TactoApp.fallo(campo.closest('.tv-f')); return; }
    var sku = abierto.sku;
    var p = modo === 'entrada'
      ? db.registrarMovimientos([{ sku: sku, delta: cant, motivo: 'entrada', nota: nota }], { usuario: A.usuario() })
      : db.ajustarConteo(sku, cant, nota, { usuario: A.usuario() });
    p.then(function (r) {
      toast(modo === 'entrada' ? '+' + cant + ' unidades de ' + sku : (r ? 'Conteo guardado: ' + (r.delta > 0 ? '+' : '') + r.delta : 'El conteo coincide con el libro'), 'success');
      abierto = { sku: sku, modo: 'historial' };
      pintarTabla();
    }, function (er) { toast(er.message, 'error'); });
  }

  var tBus = null;
  function alEscribir(e) {
    if (e.target.id === 'invBuscar') { filtro.texto = e.target.value; mostrar = LIMITE; clearTimeout(tBus); tBus = setTimeout(pintarTabla, 80); }
  }
  function alTecla(e) {
    if (e.key === 'Escape' && abierto.sku) { abierto = { sku: '', modo: '' }; pintarTabla(); }
  }

  window.TiendaInventario = { montar: montar };
})();
