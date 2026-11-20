// ============================================================
// PAGOS: REVISIÓN DE COMPROBANTES (PC)
// ============================================================
// Los pantallazos de pago que mandan los clientes, en una sola lista:
//   - El asesor ve los suyos y en qué quedó cada uno.
//   - El jefe (o quien revise) ve los de todo el equipo, abre la imagen
//     grande, la copia con un clic y la aprueba o la rechaza con una nota.
// Un comprobante entra desde Vender (al registrar la venta, unido a ella) o
// desde aquí: "Subir comprobante" o pegando la imagen con Ctrl+V.
//
// Datos: infrastructure/comprobantes.js. Estilos: styles/pagos.css.
//
// Globales que expone (window.*):
//   Pagos.abrir()          — abre la vista
//   Pagos.contar()         — comprobantes por revisar (para el riel)
//   Pagos.nuevo(blob, d)   — abre el formulario con esa imagen y datos
//
// Depende de: infrastructure/comprobantes.js (Comprobantes),
//             domain/empresa.js (Empresa, medios de pago), ui.js
//             (switchTab, showToast), domain.js (esc, fmtCOP), riel.js
// ============================================================
(function () {
  'use strict';

  var _lista = [];
  var _cargado = false;
  var _cargando = false;
  var _sel = '';
  var _imagenes = {};   // id -> dataUrl (se piden una vez)
  var _nuevo = null;    // { imagen, miniatura, cliente, valor, medio, venta, nota }
  var _guardando = false;

  var ICO = {
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>',
    bajar: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    subir: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>'; }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2600); }
  function C() { return window.Comprobantes; }
  function revisor() { return C() && C().esRevisor(); }
  function visible() { var p = $('panel-pagos'); return !!p && p.style.display !== 'none'; }

  var ESTADOS = {
    pendiente: { txt: 'Por revisar', cls: 'pg-est-pend' },
    aprobado: { txt: 'Aprobado', cls: 'pg-est-ok' },
    rechazado: { txt: 'Rechazado', cls: 'pg-est-no' }
  };

  function hace(ms) {
    if (!ms) return 'ahora';
    var min = Math.floor((Date.now() - ms) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 1440) return 'hace ' + Math.floor(min / 60) + ' h';
    return new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  function fechaLarga(ms) {
    return ms ? new Date(ms).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).replace('.', '') : '—';
  }
  function miniSegura(s) { return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(s || '')) ? s : ''; }

  // ── Datos ────────────────────────────────────────────────
  function cargar() {
    if (_cargando || !C()) return;
    _cargando = true;
    C().listar().then(function (l) {
      _lista = l; _cargado = true; _cargando = false;
      if (_sel && !_lista.some(function (x) { return x.id === _sel; })) _sel = '';
      insignia();
      if (visible()) pintar();
    }, function (e) {
      _cargando = false; _cargado = true;
      _lista = [];
      _lista.error = e && e.code === 'permission-denied' ? 'permiso' : 'red';
      if (visible()) pintar();
    });
  }

  function pendientes() { return _lista.filter(function (x) { return x.estado === 'pendiente'; }); }

  function insignia() { if (window.Riel && window.Riel.insignias) window.Riel.insignias(); }

  // ── Pintar ───────────────────────────────────────────────
  function panel() {
    var p = $('panel-pagos');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-pagos';
    p.className = 'ivapanel pg';
    p.style.display = 'none';
    pv.appendChild(p);
    enlazar(p);
    return p;
  }

  function fila(x) {
    var e = ESTADOS[x.estado] || ESTADOS.pendiente;
    var mini = miniSegura(x.miniatura);
    var nombre = x._piiLocked ? 'Datos cifrados' : (x.cliente || 'Sin nombre');
    var r = window.Comprobante && (x.montoLeido || x.referencia) ? window.Comprobante.revisar({ esComprobante: true, monto: x.montoLeido || null, referencia: x.referencia || '' }, { valor: x.valor, id: x.id, otros: _lista }) : null;
    var ojo = r && (r.coincide === false || r.repetido) ? '<span class="pg-est pg-est-no" title="' + esc(r.avisos.filter(function (a) { return a.tipo === 'no'; }).map(function (a) { return a.texto; }).join(' ')) + '">Revisar con cuidado</span>' : '';
    return '<button type="button" class="pg-fila' + (x.id === _sel && !_nuevo ? ' on' : '') + '" data-pg="' + esc(x.id) + '">'
      + (mini ? '<img class="pg-mini" src="' + mini + '" alt="">' : '<span class="pg-mini pg-mini-vacia" aria-hidden="true"></span>')
      + '<span class="pg-fila-txt"><span class="pg-fila-a"><b>' + esc(nombre) + '</b><span>' + esc(pesos(x.valor)) + '</span></span>'
      + '<span class="pg-fila-b"><span>' + esc([x.medio, x.ventaNumero].filter(Boolean).join(' · ') || 'Sin venta') + ' · ' + esc(hace(x.creadoMs)) + '</span>'
      + (ojo && x.estado === 'pendiente' ? ojo : '<span class="pg-est ' + e.cls + '">' + e.txt + '</span>') + '</span></span></button>';
  }

  function lista() {
    if (_lista.error) {
      return '<p class="pg-vacio">' + (_lista.error === 'permiso'
        ? 'Faltan las reglas nuevas de Firestore para los comprobantes. Cuando se publiquen, aparecen aquí.'
        : 'No se pudo cargar la lista. Revisa la conexión.') + '</p>';
    }
    if (!_cargado) return '<div class="pg-hueso"></div><div class="pg-hueso"></div><div class="pg-hueso"></div>';
    var pend = pendientes();
    var resto = _lista.filter(function (x) { return x.estado !== 'pendiente'; });
    var html = '<h3 class="pg-grupo">Por revisar <span>' + pend.length + '</span></h3>'
      + (pend.length ? pend.map(fila).join('') : '<p class="pg-vacio">Nada por revisar.</p>');
    if (resto.length) html += '<h3 class="pg-grupo">Revisados <span>' + resto.length + '</span></h3>' + resto.slice(0, 60).map(fila).join('');
    var enCola = C() ? C().pendientesLocales() : 0;
    if (enCola) html += '<p class="pg-pie">' + enCola + (enCola === 1 ? ' comprobante espera' : ' comprobantes esperan') + ' conexión para subirse.</p>';
    return html;
  }

  // Lo que leyó la IA y sus avisos (domain/comprobante.js)
  function lecturaHtml(l, leyendo, o) {
    if (leyendo) return '<div class="pg-lectura pg-lectura-espera"><span class="pg-punto"></span>Leyendo el comprobante…</div>';
    if (!l || !window.Comprobante) return '';
    var datos = [l.monto ? pesos(l.monto) : '', l.referencia ? 'Ref. ' + l.referencia : '', l.banco || '', l.fecha || ''].filter(Boolean).join(' · ');
    var rev = window.Comprobante.revisar(l, o || {});
    return '<div class="pg-lectura"><b>Lo que dice el comprobante</b>' + (datos ? '<span>' + esc(datos) + '</span>' : '')
      + rev.avisos.map(function (a) { return '<p class="pg-aviso pg-aviso-' + a.tipo + '">' + esc(a.texto) + '</p>'; }).join('')
      + '<small>Leído con IA: confírmalo en el banco antes de aprobar.</small></div>';
  }

  function detalleVacio() {
    return '<div class="pg-vacio-det"><span class="pg-ico-grande" aria-hidden="true">' + svg('subir') + '</span>'
      + '<b>Pega aquí el pantallazo del pago</b>'
      + '<span>Copia la imagen en WhatsApp y presiona Ctrl+V (o Cmd+V), o súbela desde el computador.</span>'
      + '<button type="button" class="pg-btn pg-btn-tinta" data-pg-acc="elegir">Subir comprobante</button></div>';
  }

  function detalle(x) {
    var e = ESTADOS[x.estado] || ESTADOS.pendiente;
    var img = _imagenes[x.id];
    var nombre = x._piiLocked ? 'Datos cifrados' : (x.cliente || 'Sin nombre');
    var dato = function (k, v) { return v ? '<div><span>' + k + '</span><b>' + esc(v) + '</b></div>' : ''; };
    var acciones = '<button type="button" class="pg-btn' + (revisor() && x.estado === 'pendiente' ? '' : ' pg-btn-tinta') + '" data-pg-acc="copiar"' + (img ? '' : ' disabled') + '>' + svg('copiar') + 'Copiar imagen</button>'
      + '<button type="button" class="pg-btn" data-pg-acc="descargar"' + (img ? '' : ' disabled') + '>' + svg('bajar') + 'Descargar</button>';
    var revision = '';
    if (revisor()) {
      revision = x.estado === 'pendiente'
        ? '<div class="pg-revision"><input id="pgNota" maxlength="300" placeholder="Nota (opcional): ej. llegó completo a Bancolombia" aria-label="Nota de la revisión" autocomplete="off">'
          + '<div class="pg-revision-btns"><button type="button" class="pg-btn pg-btn-rosa" data-pg-acc="rechazar">Rechazar</button>'
          + '<button type="button" class="pg-btn pg-btn-tinta pg-btn-ancho" data-pg-acc="aprobar">Aprobar pago</button></div></div>'
        : '<div class="pg-revision"><button type="button" class="pg-btn" data-pg-acc="reabrir">Volver a "Por revisar"</button></div>';
    }
    return '<div class="pg-det-cab"><div><p class="pg-eti">Comprobante · ' + esc(fechaLarga(x.creadoMs)) + '</p><h2>' + esc(nombre) + '</h2></div>'
      + '<div class="pg-det-total"><b>' + esc(pesos(x.valor)) + '</b><span class="pg-est ' + e.cls + '">' + e.txt + '</span></div></div>'
      + '<div class="pg-imagen">' + (img ? '<img src="' + img + '" alt="Comprobante de pago de ' + esc(nombre) + '">' : '<div class="pg-hueso pg-hueso-img" aria-label="Cargando imagen"></div>') + '</div>'
      + '<div class="pg-acciones">' + acciones + '</div>'
      + (x.montoLeido || x.referencia ? lecturaHtml({ esComprobante: true, monto: x.montoLeido || null, referencia: x.referencia || '', banco: x.bancoLeido || '' }, false, { valor: x.valor, id: x.id, otros: _lista }) : '')
      + '<div class="pg-datos">'
        + dato('Medio de pago', x.medio) + dato('Venta', x.ventaNumero) + dato('Subido por', x.email)
        + (x.revisadoPor ? dato(x.estado === 'rechazado' ? 'Rechazado por' : 'Aprobado por', x.revisadoPor + ' · ' + fechaLarga(x.revisadoMs)) : '')
        + dato('Nota', x.nota)
      + '</div>'
      + revision;
  }

  function formulario() {
    var n = _nuevo;
    var medios = (window.Empresa ? window.Empresa.mediosPago() : ['Transferencia']).filter(function (m) { return !/^efectivo$/i.test(m); });
    if (!n.medio) n.medio = medios[0] || '';
    return '<div class="pg-det-cab"><div><p class="pg-eti">Nuevo comprobante</p><h2>¿De quién es este pago?</h2></div></div>'
      + '<div class="pg-form">'
        + '<div class="pg-imagen pg-imagen-chica"><img src="' + n.imagen + '" alt="Vista previa del comprobante"></div>'
        + '<div class="pg-campos">'
          + '<label>Cliente<input id="pgCliente" maxlength="120" value="' + esc(n.cliente || '') + '" autocomplete="off" placeholder="Nombre del cliente"></label>'
          + '<label>Valor<input id="pgValor" inputmode="numeric" value="' + (n.valor ? Math.round(n.valor).toLocaleString('es-CO') : '') + '" autocomplete="off" placeholder="$ 0"></label>'
          + '<label>Medio de pago<select id="pgMedio">' + medios.map(function (m) { return '<option' + (m === n.medio ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select></label>'
          + '<label>Venta o cotización<input id="pgVenta" maxlength="30" value="' + esc(n.venta || '') + '" autocomplete="off" placeholder="Opcional: RC-N1-000123 o #A-1047"></label>'
          + '<label class="pg-ancho">Nota<input id="pgNotaNueva" maxlength="300" value="' + esc(n.nota || '') + '" autocomplete="off" placeholder="Opcional"></label>'
        + '</div>'
      + '</div>'
      + lecturaHtml(n.lectura, n.leyendo, { valor: n.valor, otros: _lista })
      + '<p class="pg-error" id="pgError" role="alert"></p>'
      + '<div class="pg-acciones pg-acciones-fin"><button type="button" class="pg-btn" data-pg-acc="cancelar">Cancelar</button>'
      + '<button type="button" class="pg-btn pg-btn-tinta pg-btn-ancho" data-pg-acc="guardar"' + (_guardando ? ' disabled' : '') + '>' + (_guardando ? 'Guardando…' : 'Guardar comprobante') + '</button></div>';
  }

  function pintar() {
    var p = panel();
    if (!p) return;
    var pend = pendientes().length;
    var titulo = revisor()
      ? (pend ? pend + (pend === 1 ? ' pago por revisar' : ' pagos por revisar') : 'Pagos al día')
      : 'Tus comprobantes';
    var sub = revisor()
      ? 'Revisa cada comprobante antes de entregar. Cópialo con un clic para confirmarlo en el banco.'
      : 'Los pantallazos de pago que subiste y en qué quedó cada uno.';
    var actual = null;
    for (var i = 0; i < _lista.length; i++) if (_lista[i].id === _sel) actual = _lista[i];
    if (!actual && !_nuevo && _lista.length && !_lista.error) {
      actual = pendientes()[0] || _lista[0];
      _sel = actual.id;
    }
    p.innerHTML = '<div class="pg-in">'
      + '<header class="pg-cab"><div><p class="pg-eti">Pagos</p><h1>' + esc(titulo) + '</h1><p class="pg-sub">' + esc(sub) + '</p></div>'
      + '<button type="button" class="pg-btn pg-btn-tinta" data-pg-acc="elegir">' + svg('subir') + 'Subir comprobante</button>'
      + '<input type="file" id="pgArchivo" accept="image/*" hidden></header>'
      + '<div class="pg-cuerpo">'
        + '<section class="pg-lista" aria-label="Comprobantes">' + lista() + '</section>'
        + '<section class="pg-det" aria-live="polite">' + (_nuevo ? formulario() : (actual ? detalle(actual) : detalleVacio())) + '</section>'
      + '</div></div>';
    if (actual && !_nuevo && !_imagenes[actual.id]) pedirImagen(actual.id);
  }

  function pedirImagen(id) {
    C().imagen(id).then(function (url) {
      _imagenes[id] = url;
      if (visible() && _sel === id && !_nuevo) pintar();
    }, function (e) {
      if (_sel !== id) return;
      var box = document.querySelector('.pg-imagen');
      if (box) box.innerHTML = '<p class="pg-vacio">' + esc(e.message || 'No se pudo cargar la imagen.') + '</p>';
    });
  }

  // ── Acciones ─────────────────────────────────────────────
  function nuevo(blob, datos) {
    if (!C()) return;
    C().comprimir(blob).then(function (r) {
      _nuevo = Object.assign({ imagen: r.imagen, miniatura: r.miniatura, leyendo: !!C().leer }, datos || {});
      if (!visible()) switchTab('pagos'); else pintar();
      var c = $('pgCliente');
      if (c && !c.value) c.focus();
      // La IA lee valor, referencia y entidad mientras se escribe el resto.
      var este = _nuevo;
      C().leer(r.imagen).then(function (l) {
        if (_nuevo !== este) return;
        leerFormulario();
        este.leyendo = false;
        este.lectura = l;
        if (l && l.monto && !este.valor) este.valor = l.monto;
        if (l && l.banco && window.Comprobante && window.Empresa) {
          var m = window.Comprobante.medioPara(l.banco, window.Empresa.mediosPago());
          if (m && !/^efectivo$/i.test(m)) este.medio = m;
        }
        if (visible()) pintar();
      });
    }, function (e) { toast(e.message || 'No se pudo leer la imagen', 'warn'); });
  }

  // Lo escrito en el formulario pasa al borrador (antes de repintarlo).
  function leerFormulario() {
    if (!_nuevo || !$('pgCliente')) return;
    var val = function (id) { var el = $(id); return el ? el.value : ''; };
    var n = _nuevo;
    n.cliente = val('pgCliente').trim();
    n.valor = Number(String(val('pgValor')).replace(/\D/g, '')) || 0;
    n.medio = val('pgMedio');
    n.venta = val('pgVenta').trim();
    n.nota = val('pgNotaNueva').trim();
  }

  function guardarNuevo() {
    if (_guardando || !_nuevo) return;
    leerFormulario();
    var n = _nuevo;
    var err = $('pgError');
    if (!n.cliente) { if (err) err.textContent = 'Escribe de quién es el pago.'; if (window.TactoApp) TactoApp.fallo($('pgCliente')); return; }
    if (!n.valor) { if (err) err.textContent = 'Escribe el valor del pago.'; if (window.TactoApp) TactoApp.fallo($('pgValor')); return; }
    _guardando = true; pintar();
    C().subir({ ventaNumero: n.venta, cliente: n.cliente, medio: n.medio, valor: n.valor, nota: n.nota, imagen: n.imagen, miniatura: n.miniatura, lectura: n.lectura })
      .then(function (id) {
        _guardando = false; _nuevo = null; _sel = id;
        if (window.tacto) tacto.sentir('exito');
        toast('Comprobante guardado', 'success');
        cargar();
        pintar();
      }, function (e) {
        _guardando = false;
        if (e && e.enCola) { _nuevo = null; toast(e.message, 'warn'); pintar(); return; }
        pintar();
        var el = $('pgError');
        if (el) el.textContent = e.message || 'No se pudo guardar el comprobante.';
      });
  }

  function revisar(estado) {
    var x = null;
    for (var i = 0; i < _lista.length; i++) if (_lista[i].id === _sel) x = _lista[i];
    if (!x) return;
    var nota = $('pgNota') ? $('pgNota').value.trim() : undefined;
    if (estado === 'rechazado' && !nota) {
      var el = $('pgNota');
      if (el) { el.placeholder = 'Escribe por qué se rechaza'; el.focus(); if (window.TactoApp) TactoApp.fallo(el); }
      return;
    }
    C().revisar(x.id, estado, estado === 'pendiente' ? undefined : (nota || x.nota || '')).then(function () {
      x.estado = estado;
      x.revisadoPor = estado === 'pendiente' ? '' : (window._slAuth.currentUser || {}).email;
      x.revisadoMs = Date.now();
      if (nota) x.nota = nota;
      if (estado !== 'pendiente') {
        if (window.tacto) tacto.sentir(estado === 'aprobado' ? 'exito' : 'cambio');
        var sig = pendientes()[0];
        if (sig) _sel = sig.id;
        toast(estado === 'aprobado' ? 'Pago aprobado' : 'Pago rechazado', estado === 'aprobado' ? 'success' : 'info');
      }
      insignia();
      pintar();
    }, function (e) {
      toast(e && e.code === 'permission-denied' ? 'Solo el jefe puede revisar pagos.' : 'No se pudo guardar la revisión.', 'warn');
    });
  }

  function copiar() {
    var url = _imagenes[_sel];
    if (!url) return;
    C().copiar(url).then(function () {
      if (window.tacto) tacto.sentir('cambio');
      toast('Imagen copiada. Pégala donde la necesites.', 'success');
    }, function () {
      // El navegador solo deja copiar con la ventana enfocada y con permiso.
      toast('No se pudo copiar. Haz clic en la ventana y vuelve a intentarlo, o usa Descargar.', 'warn');
    });
  }

  function descargar() {
    var url = _imagenes[_sel];
    if (!url) return;
    var x = null;
    for (var i = 0; i < _lista.length; i++) if (_lista[i].id === _sel) x = _lista[i];
    var a = document.createElement('a');
    a.href = url;
    a.download = 'comprobante-' + String((x && (x.ventaNumero || x.cliente)) || _sel).replace(/[^\w-]+/g, '-').slice(0, 40) + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
  }

  function enlazar(p) {
    p.addEventListener('click', function (e) {
      var f = e.target.closest('[data-pg]');
      if (f) { _nuevo = null; _sel = f.getAttribute('data-pg'); pintar(); return; }
      var a = e.target.closest('[data-pg-acc]');
      if (!a || a.disabled) return;
      var acc = a.getAttribute('data-pg-acc');
      if (acc === 'elegir') { var inp = $('pgArchivo'); if (inp) inp.click(); }
      else if (acc === 'guardar') guardarNuevo();
      else if (acc === 'cancelar') { _nuevo = null; pintar(); }
      else if (acc === 'copiar') copiar();
      else if (acc === 'descargar') descargar();
      else if (acc === 'aprobar') revisar('aprobado');
      else if (acc === 'rechazar') revisar('rechazado');
      else if (acc === 'reabrir') revisar('pendiente');
    });
    p.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'pgArchivo' && e.target.files && e.target.files[0]) nuevo(e.target.files[0]);
    });
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && _nuevo && e.target && e.target.tagName === 'INPUT') { e.preventDefault(); guardarNuevo(); }
    });
    p.addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, 'Files') >= 0) { e.preventDefault(); p.classList.add('pg-soltar'); } });
    p.addEventListener('dragleave', function (e) { if (e.target === p) p.classList.remove('pg-soltar'); });
    p.addEventListener('drop', function (e) {
      p.classList.remove('pg-soltar');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) { e.preventDefault(); nuevo(f); }
    });
  }

  // Pegar una imagen con la vista abierta = nuevo comprobante.
  document.addEventListener('paste', function (e) {
    if (!visible()) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
        e.preventDefault();
        nuevo(items[i].getAsFile());
        return;
      }
    }
  });

  // ── Enganches ────────────────────────────────────────────
  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      if (t === 'pagos') panel();
      var r = original.apply(this, arguments);
      if (t === 'pagos') { pintar(); cargar(); }
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  document.addEventListener('sl:comprobantes', function () { cargar(); });
  // El jefe ve cuántos esperan desde que entra; después, al abrir la vista.
  document.addEventListener('sl:rol', function () { if (revisor()) setTimeout(cargar, 2500); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  window.Pagos = {
    abrir: function () { switchTab('pagos'); },
    contar: function () { return revisor() ? pendientes().length : 0; },
    nuevo: nuevo
  };
})();
