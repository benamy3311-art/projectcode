// ============================================================
// BUZÓN DE WHATSAPP (fase 1: solo lectura)
// ============================================================
// Muestra en tiempo real los mensajes que los clientes mandan al WhatsApp de
// la tienda. Los escribe el webhook (api/whatsapp.js); acá solo se leen y se
// marca la conversación como leída. Responder llega en la fase 2. Diseño en
// WHATSAPP_FASE1.md.
//
// Un mensaje de WhatsApp lo escribe un desconocido: TODO lo que viene de
// Firestore se pinta con esc(). Los clics van por delegación de eventos con
// data-*, sin onclick inline (nada de texto del cliente dentro de un
// manejador).
//
// Globales que expone (window.*):
//   _mountWhatsApp()   — inicia los listeners (llamar tras login, aprobados
//                        no Lite; firebase-auth.js)
//   WaInbox            — { convs(), abrir(waId) } para ui/seguimiento.js
//
// Depende de: domain/whatsapp.js (WhatsApp), domain.js (esc),
//             firebase-auth.js (_slDb, _slAuth, _slUserIsLite),
//             ui.js (showToast, switchTab), pii-crypto.js (aviso si el
//             cifrado está activo)
// Requiere DOM: #tab-wa, #waBadge, #panel-wa
// ============================================================
(function () {
  'use strict';

  var LIMITE_LISTA = 50;
  var LIMITE_HILO = 100;

  var _montado = false;
  var _convs = [];            // [{id, ...datos}] en orden de ultimoAt desc
  var _sel = '';              // waId abierto
  var _cancelarHilo = null;   // unsubscribe del listener del hilo
  var _mensajes = [];
  var _vistos = {};           // wamid -> true, para animar solo lo nuevo
  var _primeraLista = true;
  var _ultimoPorConv = {};    // waId -> ultimoAt ms, para detectar mensajes nuevos
  var _filtro = 'todos';      // 'sinleer' | 'todos' (filtro de la lista en PC)
  var _busqueda = '';         // texto del buscador de la lista

  var ICO = {
    wa: '<path d="M21 11.5a8.4 8.4 0 01-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1121 11.5z"/>',
    back: '<polyline points="15 18 9 12 15 6"/>',
    ext: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    cotizar: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h4"/>',
    copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>'
  };
  function ico(n, size) {
    return '<svg class="wa-ico" viewBox="0 0 24 24" style="width:' + (size || 16) + 'px;height:' + (size || 16) + 'px">' + ICO[n] + '</svg>';
  }

  function $(id) { return document.getElementById(id); }

  function ms(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number') return v;
    return 0;
  }

  // 573001234567 -> +57 300 123 4567 (solo formato; si no es de Colombia, +número)
  function telefono(waId) {
    var s = String(waId || '');
    var m = /^57(\d{3})(\d{3})(\d{4})$/.exec(s);
    return m ? '+57 ' + m[1] + ' ' + m[2] + ' ' + m[3] : '+' + s;
  }

  function horaCorta(t) {
    if (!t) return '';
    var d = new Date(t);
    var hoy = new Date();
    var mismoDia = d.toDateString() === hoy.toDateString();
    var hh = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    if (mismoDia) return hh;
    var ayer = new Date(hoy.getTime() - 86400000);
    if (d.toDateString() === ayer.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  function inicial(c) {
    var p = String(c.nombre || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '#';
    return (p[0].charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  }
  // Avatar pastel (dos iniciales) con el mismo color siempre para el mismo
  // cliente: lavanda, durazno, menta, cielo o rosa (maqueta aprobada).
  function tonoAvatar(nombre) {
    var s = String(nombre || ''), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 'av-p' + (h % 5);
  }
  window.tonoAvatar = tonoAvatar;
  function avatar(c, extra) {
    return '<span class="wa-av ' + tonoAvatar(c.nombre || c.id) + (extra ? ' ' + extra : '') + '">' + window.esc(inicial(c)) + '</span>';
  }

  function toast(msg, tipo) {
    if (typeof window.showToast === 'function') window.showToast(msg, tipo || 'info');
  }

  // Chime de dos tonos (mismo estilo que remisiones), sin archivos.
  function chime() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!window._slAudioCtx) window._slAudioCtx = new Ctx();
      var ctx = window._slAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      [[659.25, 0], [987.77, 0.12]].forEach(function (t) {
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = t[0];
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t[1]);
        g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + t[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t[1] + 0.45);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(ctx.currentTime + t[1]); osc.stop(ctx.currentTime + t[1] + 0.5);
      });
    } catch (e) { /* best-effort */ }
  }

  // ── Estructura del panel ────────────────────────────────────
  function panelHtml() {
    return '' +
      '<div class="wa-box" id="waBox">' +
        '<aside class="wa-list">' +
          '<div class="wa-list-hdr">' +
            '<div class="wa-list-title"><span>Chats</span></div>' +
            '<span class="wa-live" id="waEsperan" title="Chats con mensajes sin leer · se actualiza en vivo"><span class="wa-live-dot"></span>En vivo</span>' +
          '</div>' +
          '<div class="wa-aviso" id="waAvisoCifrado" hidden>' + ico('lock', 14) +
            '<span>Los mensajes de WhatsApp no van cifrados con la llave de la empresa: los guarda el servidor.</span></div>' +
          // Buscador y filtros: en celular los esconde styles/chats-pc.css
          '<label class="wa-buscar">' + ico('buscar', 16) +
            '<input id="waBuscar" type="search" placeholder="Buscar cliente o número" autocomplete="off" aria-label="Buscar cliente o número"></label>' +
          '<div class="wa-filtros" id="waFiltros" role="tablist" aria-label="Filtrar chats"></div>' +
          '<div class="wa-convs" id="waConvs"><div class="wa-vacio">Cargando conversaciones…</div></div>' +
        '</aside>' +
        '<section class="wa-hilo" id="waHilo">' +
          '<div class="wa-hilo-vacio">' + ico('wa', 40) +
            '<p>Elige una conversación</p><span>Los mensajes nuevos aparecen solos, sin recargar.</span></div>' +
        '</section>' +
        '<aside class="wa-ctx" id="waCtx" aria-label="Datos del cliente"></aside>' +
      '</div>';
  }

  // ── Lista de conversaciones ─────────────────────────────────
  function renderLista() {
    var cont = $('waConvs');
    if (!cont) return;
    if (!_convs.length) {
      cont.innerHTML = '<div class="wa-vacio">Todavía no hay mensajes.<br>Cuando un cliente escriba al WhatsApp de la tienda, aparece acá al instante.</div>';
      return;
    }
    var esc = window.esc;
    renderFiltros();
    var q = _busqueda.trim().toLowerCase();
    var qNum = q.replace(/\D/g, '');
    var visibles = _convs.filter(function (c) {
      if (_filtro === 'sinleer' && (!(c.noLeidos > 0) || (c.asignado && !esMio(c) && !sinRespuesta(c) && !soyJefe())) && c.id !== _sel) return false;
      if (_filtro === 'mios' && !esMio(c) && c.id !== _sel) return false;
      if (!q) return true;
      return String(c.nombre || '').toLowerCase().indexOf(q) >= 0 || (qNum && String(c.id).indexOf(qNum) >= 0);
    });
    if (!visibles.length) {
      cont.innerHTML = '<div class="wa-vacio">' + (q ? 'Ningún chat coincide con «' + esc(_busqueda.trim()) + '».' : 'No hay chats sin leer.') + '</div>';
      return;
    }
    cont.innerHTML = visibles.map(function (c) {
      var nl = c.noLeidos > 0 && c.id !== _sel ? c.noLeidos : 0;
      // Etapa de la venta con este cliente (ui/ficha-cliente.js)
      var et = window.FichaCliente && window.FichaCliente.etapa ? window.FichaCliente.etapa(c) : null;
      return '<button type="button" class="wa-conv' + (c.id === _sel ? ' sel' : '') + (nl ? ' nuevo' : '') +
          (c._flash ? ' flash' : '') + '" data-wa="' + esc(c.id) + '">' +
        avatar(c) +
        '<span class="wa-conv-main">' +
          '<span class="wa-conv-top"><b>' + esc(c.nombre || telefono(c.id)) + '</b>' +
            '<time>' + esc(horaCorta(ms(c.ultimoAt))) + '</time></span>' +
          '<span class="wa-conv-bot"><span class="wa-conv-txt">' + esc(c.ultimoTexto || '') + '</span></span>' +
          (et || nl || c.asignado ? '<span class="wa-conv-tags">' + (et ? '<span class="wa-etapa wa-et-' + et[1] + '">' + esc(et[0]) + '</span>' : '') +
            (sinRespuesta(c) ? '<span class="wa-etapa wa-et-ros" title="Lo atiende ' + esc(c.asignadoNombre || '') + '">Sin respuesta</span>' : (c.asignado && !esMio(c) ? '<span class="wa-atiende">' + esc(c.asignadoNombre || 'Otro asesor') + '</span>' : '')) +
            (nl ? '<span class="wa-nl">' + (nl > 99 ? '99+' : nl) + '</span>' : '') + '</span>' : '') +
        '</span>' +
      '</button>';
    }).join('');
    _convs.forEach(function (c) { c._flash = false; });
  }

  function renderFiltros() {
    var f = $('waFiltros');
    if (!f) return;
    var sinLeer = _convs.filter(function (c) { return c.noLeidos > 0 && c.id !== _sel; }).length;
    var esp = $('waEsperan');
    if (esp) esp.innerHTML = '<span class="wa-live-dot"></span>' + (sinLeer ? sinLeer + (sinLeer === 1 ? ' espera respuesta' : ' esperan respuesta') : 'Al día');
    var b = function (val, txt) {
      return '<button type="button" role="tab" class="wa-filtro' + (_filtro === val ? ' on' : '') + '" data-filtro="' + val + '" aria-selected="' + (_filtro === val) + '">' + txt + '</button>';
    };
    var mios = _convs.filter(esMio).length;
    f.innerHTML = b('sinleer', 'Por atender' + (sinLeer ? ' <span>' + sinLeer + '</span>' : '')) + (soyJefe() ? '' : b('mios', 'Míos' + (mios ? ' <span>' + mios + '</span>' : ''))) + b('todos', 'Todos <span>' + _convs.length + '</span>');
  }

  // Columna derecha (PC): quién es el cliente y qué hacer con él.
  // Responder desde la app llega en la fase 2; mientras, las acciones son
  // cotizarle, copiar el número y abrir el chat en WhatsApp.
  function pintarContexto() {
    var ctx = $('waCtx');
    if (!ctx) return;
    var c = convSel();
    var esc = window.esc;
    if (!c) {
      ctx.innerHTML = '<div class="wa-ctx-vacio">Elige un chat para ver los datos del cliente.</div>';
      return;
    }
    // Ficha completa del cliente (ui/ficha-cliente.js): siguiente paso,
    // datos leídos de sus mensajes, cotización y venta con un clic.
    if (window.FichaCliente) { window.FichaCliente.pintar(ctx, c, _mensajes); return; }
    var hasta = ms(c.ventanaHasta);
    var abierta = window.WhatsApp && window.WhatsApp.ventanaAbierta(hasta, Date.now());
    var primera = ms(c.creadoAt);
    ctx.innerHTML =
      '<div class="wa-ctx-quien"><span class="wa-av wa-av-xl">' + esc(inicial(c)) + '</span>' +
        '<b>' + esc(c.nombre || 'Sin nombre en WhatsApp') + '</b><span>' + esc(telefono(c.id)) + '</span></div>' +
      '<div class="wa-ctx-datos">' +
        '<div><span>Ventana de respuesta</span><b>' + (abierta ? 'Abierta hasta ' + esc(new Date(hasta).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })) : 'Cerrada') + '</b></div>' +
        (primera ? '<div><span>Escribió por primera vez</span><b>' + esc(new Date(primera).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })) + '</b></div>' : '') +
        '<div><span>Último mensaje</span><b>' + esc(horaCorta(ms(c.ultimoAt))) + '</b></div>' +
      '</div>' +
      '<div class="wa-ctx-acciones">' +
        '<button type="button" class="wa-ctx-btn wa-ctx-principal" data-accion="cotizar">' + ico('cotizar', 16) + 'Cotizar para este cliente</button>' +
        '<button type="button" class="wa-ctx-btn" data-accion="copiar-num">' + ico('copiar', 16) + 'Copiar número</button>' +
        '<a class="wa-ctx-btn" href="https://wa.me/' + encodeURIComponent(c.id) + '" target="_blank" rel="noopener noreferrer">' + ico('ext', 16) + 'Abrir en WhatsApp</a>' +
      '</div>';
  }

  // Lleva al cliente a una cotización nueva: nombre y WhatsApp prellenados.
  function cotizarParaCliente() {
    var c = convSel();
    if (!c) return;
    var cli = $('cliente');
    if (cli && c.nombre && !cli.value) { cli.value = c.nombre; cli.dispatchEvent(new Event('input', { bubbles: true })); }
    var tab = $('tab-q');
    if (tab) tab.click(); else if (window.switchTab) switchTab('q');
    toast('Cotización para ' + (c.nombre || telefono(c.id)), 'info');
  }

  function copiarNumero() {
    var c = convSel();
    if (!c) return;
    var num = '+' + c.id;
    var ok = function () { toast('Número copiado: ' + telefono(c.id), 'success'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(num).then(ok, function () { toast(num, 'info'); });
    else toast(num, 'info');
  }

  function renderBadge() {
    var b = $('waBadge');
    if (!b) return;
    var total = 0;
    _convs.forEach(function (c) { if (c.id !== _sel) total += c.noLeidos > 0 ? c.noLeidos : 0; });
    b.textContent = total > 99 ? '99+' : String(total);
    b.hidden = !total;
  }

  function escucharLista() {
    window._slDb.collection('wa_conversations')
      .orderBy('ultimoAt', 'desc').limit(LIMITE_LISTA)
      .onSnapshot(function (snap) {
        var nuevas = [];
        _convs = [];
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          d.id = doc.id;
          var t = ms(d.ultimoAt);
          var antes = _ultimoPorConv[d.id];
          if (!_primeraLista && (antes === undefined || t > antes)) {
            d._flash = true;
            nuevas.push(d);
          }
          _ultimoPorConv[d.id] = t;
          _convs.push(d);
        });
        // La primera vez, si hay chats sin leer, la lista abre filtrada en
        // ellos: lo pendiente es lo primero que ve el asesor.
        if (_primeraLista && _convs.some(function (c) { return c.noLeidos > 0; })) _filtro = 'sinleer';
        _primeraLista = false;
        renderLista();
        renderBadge();
        if (_sel) { pintarCabecera(); pintarContexto(); }
        if (nuevas.length) avisarNuevas(nuevas);
        document.dispatchEvent(new CustomEvent('sl:wa-convs'));
      }, function (err) {
        // Sin permiso = reglas sin publicar o cuenta sin acceso: la pestaña se
        // esconde para el equipo y solo la ve el admin, con el motivo.
        var em = ((window._slAuth.currentUser || {}).email || '').toLowerCase();
        var esAdmin = (window.SUPER_ADMINS || []).indexOf(em) >= 0;
        if (err && err.code === 'permission-denied' && !esAdmin) {
          var tab = $('tab-wa');
          if (tab) tab.hidden = true;
          return;
        }
        var cont = $('waConvs');
        if (cont) cont.innerHTML = '<div class="wa-vacio">No se pudo leer el buzón' +
          (err && err.code === 'permission-denied' ? ' (faltan las reglas de Firestore o permisos de tu cuenta).' : '.') + '</div>';
      });
  }

  function avisarNuevas(nuevas) {
    chime();
    var visible = $('panel-wa') && $('panel-wa').style.display !== 'none';
    var c = nuevas[0];
    if (c.id === _sel && visible) return; // ya lo está viendo
    var quien = c.nombre || telefono(c.id);
    toast('WhatsApp de ' + quien + ': ' + (c.ultimoTexto || ''), 'info');
  }

  // ── Hilo ────────────────────────────────────────────────────
  function convSel() {
    for (var i = 0; i < _convs.length; i++) if (_convs[i].id === _sel) return _convs[i];
    return null;
  }

  function pintarCabecera() {
    var hdr = $('waHiloHdr');
    var c = convSel();
    if (!hdr || !c) return;
    var esc = window.esc;
    var hasta = ms(c.ventanaHasta);
    var abierta = window.WhatsApp && window.WhatsApp.ventanaAbierta(hasta, Date.now());
    // Texto largo en escritorio, corto en móvil (styles.css decide cuál se ve).
    var ventana = abierta
      ? '<span class="wa-ventana ok" title="WhatsApp deja escribirle libremente hasta 24 h después de su último mensaje">' +
          '<span class="wa-v-largo">Puedes responder hasta las </span><span class="wa-v-corto">Hasta </span>' +
          esc(new Date(hasta).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })) + '</span>'
      : '<span class="wa-ventana" title="Pasaron más de 24 h desde el último mensaje del cliente">' +
          '<span class="wa-v-largo">Pasaron 24 h: escríbele por WhatsApp</span><span class="wa-v-corto">24 h</span></span>';
    var cot = window.FichaCliente && window.FichaCliente.cotizacionDe ? window.FichaCliente.cotizacionDe(c) : null;
    hdr.innerHTML =
      '<button type="button" class="wa-volver" data-accion="volver" aria-label="Volver a la lista">' + ico('back', 18) + '</button>' +
      avatar(c) +
      '<div class="wa-hilo-quien"><b>' + esc(c.nombre || telefono(c.id)) + '</b><span>' + esc(telefono(c.id)) + (cot ? ' · cotización #' + esc(cot.num) : '') + '</span></div>' +
      (c.asignado && !esMio(c)
        ? '<span class="wa-atiende-cab">Lo atiende ' + esc(c.asignadoNombre || 'otro asesor') + (sinRespuesta(c) || soyJefe() ? ' · <button type="button" class="wa-tomar" data-accion="tomar">Tomarlo</button>' : '') + '</span>'
        : (!c.asignado ? '<span class="wa-atiende-cab">Sin asignar · <button type="button" class="wa-tomar" data-accion="tomar">Atenderlo</button></span>' : '')) +
      ventana;
  }

  function burbujaHtml(m, nueva) {
    var esc = window.esc;
    // Lo que el asesor mandó desde aquí (se abrió en WhatsApp con el texto):
    // burbuja verde a la derecha, como en la maqueta aprobada.
    if (m.saliente) {
      var img = m.imagen && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.imagen) ? '<img class="wa-msg-img" src="' + m.imagen + '" alt="Imagen de la cotización">' : '';
      return '<div class="wa-msg out" title="Abierto en WhatsApp para enviarlo">' + img +
        '<span class="wa-msg-txt">' + esc(m.texto) + '</span><time>' + esc(horaCorta(ms(m.at))) + '</time></div>';
    }
    var etiqueta = '';
    if (m.tipo && m.tipo !== 'text') {
      var res = window.WhatsApp ? window.WhatsApp.resumen({ tipo: m.tipo, texto: '' }) : '';
      etiqueta = '<span class="wa-tipo">' + esc(res) + '</span>';
    }
    // Mensaje con los datos para facturar: borde lavanda, etiqueta y lo que
    // la app leyó de él (la ficha ya los usó).
    var leidos = '', datos = false;
    if (m.texto && window.ExtraerDatos && window.ExtraerDatos.pareceDatos(m.texto)) {
      datos = true;
      etiqueta += '<span class="wa-tag-datos">Datos para la venta</span>';
      var r = window.ExtraerDatos.cliente(m.texto);
      var nombres = [['nombre', 'Nombre'], ['documento', r.tipoDoc === 'NIT' ? 'NIT' : 'Cédula'], ['direccion', 'Dirección'], ['correo', 'Correo'], ['telefono', 'Celular']];
      leidos = '<span class="wa-leidos">' + nombres.filter(function (n) { return r[n[0]]; }).map(function (n) { return '<span>' + n[1] + '</span>'; }).join('') + '</span>';
    }
    return '<div class="wa-msg in' + (datos ? ' wa-msg-datos' : '') + (nueva ? ' nueva' : '') + '">' + etiqueta +
      (m.texto ? '<span class="wa-msg-txt">' + esc(m.texto) + '</span>' : '') + leidos +
      '<time>' + esc(horaCorta(ms(m.at))) + '</time></div>';
  }

  function renderHilo() {
    var cuerpo = $('waMsgs');
    if (!cuerpo) return;
    var abajo = cuerpo.scrollHeight - cuerpo.scrollTop - cuerpo.clientHeight < 80;
    // Mensajes del cliente + los que el asesor mandó desde la ficha, en orden.
    var salientes = window.FichaCliente && window.FichaCliente.enviados ? window.FichaCliente.enviados(_sel) : [];
    var todos = _mensajes.concat(salientes.map(function (s, k) { return { id: 'out-' + s.at + '-' + k, saliente: true, texto: s.texto, at: s.at, imagen: s.imagen }; }))
      .sort(function (a, b) { return ms(a.at) - ms(b.at); });
    cuerpo.innerHTML = todos.length
      ? todos.map(function (m) {
          var nueva = !_vistos[m.id];
          _vistos[m.id] = true;
          return burbujaHtml(m, nueva && cuerpo.dataset.listo === '1');
        }).join('')
      : '<div class="wa-vacio">Sin mensajes.</div>';
    cuerpo.dataset.listo = '1';
    if (abajo || !cuerpo.dataset.bajado) { cuerpo.scrollTop = cuerpo.scrollHeight; cuerpo.dataset.bajado = '1'; }
  }

  function marcarLeida() {
    var c = convSel();
    if (!c || !(c.noLeidos > 0)) return;
    window._slDb.collection('wa_conversations').doc(_sel).update({ noLeidos: 0 })
      .catch(function () { /* sin permiso: se queda el contador, no rompe nada */ });
  }

  function abrir(waId) {
    if (!waId || waId === _sel && _cancelarHilo) return;
    if (_cancelarHilo) { _cancelarHilo(); _cancelarHilo = null; }
    _sel = waId;
    var cAbre = convSel();
    if (cAbre && !cAbre.asignado && !soyJefe()) tomar(cAbre, false);
    _mensajes = [];
    _vistos = {};
    var hilo = $('waHilo');
    var box = $('waBox');
    if (box) box.classList.add('con-hilo');
    var waEnc = encodeURIComponent(waId);
    hilo.innerHTML =
      '<header class="wa-hilo-hdr" id="waHiloHdr"></header>' +
      '<div class="wa-msgs" id="waMsgs"><div class="wa-vacio">Cargando…</div></div>' +
      // Redactor (Dirección 1): mensajes rápidos que llenan el cuadro y
      // "Enviar", que abre su chat de WhatsApp con el texto escrito. Cuando
      // llegue la fase 2 (envío por la API), este mismo botón lo mandará.
      '<footer class="wa-hilo-pie wa-redactor">' +
        (window.FichaCliente ? '<div class="wa-rapidos" role="group" aria-label="Mensajes rápidos">' +
          [['pedirDatos', 'Pedir datos'], ['datosPago', 'Datos para pagar'], ['pagoRecibido', 'Pago recibido'], ['imagen', 'Enviar cotización'], ['seguimiento', 'Seguimiento']].map(function (r) {
            return '<button type="button" class="wa-rapido" data-rapido="' + r[0] + '"' + (r[0] === 'imagen' ? ' title="La imagen de siempre: queda copiada para pegarla en su WhatsApp"' : '') + '>' + r[1] + '</button>';
          }).join('') +
          (window.AI && window.AI.chat ? '<button type="button" class="wa-rapido wa-rapido-ia" data-rapido="ia" title="La IA escribe una respuesta con tus productos, precios y existencias">Sugerir respuesta</button>' : '') +
          '</div>' : '') +
        '<div class="wa-caja"><textarea id="waTexto" rows="1" placeholder="Escribe un mensaje…" aria-label="Mensaje para el cliente"></textarea>' +
        '<button type="button" class="wa-enviar" data-accion="enviar" title="Se abre su chat de WhatsApp con el mensaje listo">' + ico('wa', 16) + 'Enviar</button></div>' +
      '</footer>';
    pintarCabecera();
    pintarContexto();
    renderLista();
    renderBadge();

    _cancelarHilo = window._slDb.collection('wa_conversations').doc(waId).collection('mensajes')
      .orderBy('at').limitToLast(LIMITE_HILO)
      .onSnapshot(function (snap) {
        if (_sel !== waId) return;
        _mensajes = [];
        snap.forEach(function (doc) { var d = doc.data() || {}; d.id = doc.id; _mensajes.push(d); });
        renderHilo();
        pintarContexto(); // la ficha lee los datos que el cliente acaba de mandar
        marcarLeida();
      }, function () {
        var cuerpo = $('waMsgs');
        if (cuerpo) cuerpo.innerHTML = '<div class="wa-vacio">No se pudieron leer los mensajes.</div>';
      });
    marcarLeida();
  }

  // ── Quién atiende cada chat ─────────────────────────────────
  // El asesor que abre un chat libre se lo queda. Si lo deja 10 minutos sin
  // responder desde el último mensaje del cliente, cualquiera lo puede tomar
  // (y al dueño le aparece en rojo en Supervisar chats). El dueño transfiere.
  var LIBERA_MS = 10 * 60000;
  function miCorreo() { var u = window._slAuth && window._slAuth.currentUser; return u ? String(u.email || '').toLowerCase() : ''; }
  function miNombre() {
    var u = window._slAuth && window._slAuth.currentUser;
    var n = (u && (u.displayName || u.email)) || '';
    n = String(n).split(/[\s@]/)[0];
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'Asesor';
  }
  function soyJefe() { return ['jefe', 'admin'].indexOf(window._slUserRol) >= 0; }
  function esMio(c) { return !!c && String(c.asignado || '').toLowerCase() === miCorreo(); }
  // ¿Lleva 10 minutos el cliente esperando respuesta de quien lo atiende?
  function sinRespuesta(c) {
    if (!c || !c.asignado) return false;
    var ult = ms(c.ultimoAt), resp = ms(c.respondidoAt) || ms(c.asignadoAt);
    return resp < ult && Date.now() - Math.max(ult, ms(c.asignadoAt)) > LIBERA_MS;
  }
  function tomar(c, avisar) {
    if (!c || !window._slDb || !window.firebase) return;
    var FV = firebase.firestore.FieldValue;
    window._slDb.collection('wa_conversations').doc(c.id).update({ asignado: miCorreo(), asignadoNombre: miNombre(), asignadoAt: FV.serverTimestamp() })
      .then(function () { if (avisar) toast('Ahora atiendes a ' + (c.nombre || telefono(c.id)), 'success'); }, function () { if (avisar) toast('No se pudo tomar el chat (otro asesor lo está atendiendo)', 'warn'); });
  }
  function marcarRespondido(waId) {
    var c = null;
    for (var i = 0; i < _convs.length; i++) if (_convs[i].id === waId) c = _convs[i];
    if (!c || !window._slDb || !window.firebase) return;
    if (!c.asignado && !soyJefe()) { tomar(c, false); return; }
    if (!esMio(c)) return;
    window._slDb.collection('wa_conversations').doc(waId).update({ respondidoAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
  }

  // ── Redactor ────────────────────────────────────────────────
  var _rapidoUsado = '';
  function usarRapido(clave) {
    if (clave === 'imagen') { if (window.FichaCliente) window.FichaCliente.enviarImagen(); return; }
    if (clave === 'ia') {
      var ta0 = $('waTexto'), b = document.querySelector('[data-rapido="ia"]');
      if (!window.FichaCliente || !ta0) return;
      if (b) { b.disabled = true; b.textContent = 'Pensando…'; }
      window.FichaCliente.sugerirRespuesta().then(function (t) {
        if (t) { ta0.value = t; _rapidoUsado = ''; autoAlto(ta0); ta0.focus(); }
      }, function (e) { toast(e && e.message ? e.message : 'No se pudo sugerir una respuesta', 'warn'); })
        .then(function () { var b2 = document.querySelector('[data-rapido="ia"]'); if (b2) { b2.disabled = false; b2.textContent = 'Sugerir respuesta'; } });
      return;
    }
    var t = window.FichaCliente ? window.FichaCliente.texto(clave) : '';
    if (!t) {
      toast(clave === 'datosPago' ? 'Escribe tus datos de pago en Mi empresa → Mensajes rápidos' : clave === 'cotizacion' ? 'Este cliente todavía no tiene cotización' : 'No hay texto para ese mensaje', 'warn');
      return;
    }
    var ta = $('waTexto');
    if (!ta) return;
    ta.value = t;
    _rapidoUsado = clave;
    autoAlto(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  function autoAlto(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; }
  function enviarTexto() {
    var c = convSel(); if (!c) return;
    var ta = $('waTexto');
    var t = ta ? ta.value.trim() : '';
    window.open('https://wa.me/' + encodeURIComponent(c.id) + (t ? '?text=' + encodeURIComponent(t) : ''), '_blank', 'noopener');
    if (t && window.FichaCliente && window.FichaCliente.registrarEnviado) window.FichaCliente.registrarEnviado(c.id, t);
    marcarRespondido(c.id);
    if (t && _rapidoUsado && window.FichaCliente) window.FichaCliente.enviado(_rapidoUsado);
    renderHilo();
    _rapidoUsado = '';
    if (ta) { ta.value = ''; autoAlto(ta); }
  }

  function volver() {
    var box = $('waBox');
    if (box) box.classList.remove('con-hilo');
  }

  // ── Eventos (delegación, sin onclick inline) ────────────────
  function enlazar(panel) {
    panel.addEventListener('click', function (ev) {
      var conv = ev.target.closest('[data-wa]');
      if (conv) { abrir(conv.getAttribute('data-wa')); return; }
      var rap = ev.target.closest('[data-rapido]');
      if (rap) { usarRapido(rap.getAttribute('data-rapido')); return; }
      var fil = ev.target.closest('[data-filtro]');
      if (fil) { _filtro = fil.getAttribute('data-filtro'); renderLista(); return; }
      var acc = ev.target.closest('[data-accion]');
      if (!acc) return;
      var a = acc.getAttribute('data-accion');
      if (a === 'volver') volver();
      else if (a === 'enviar') enviarTexto();
      else if (a === 'tomar') tomar(convSel(), true);
      else if (a === 'cotizar') cotizarParaCliente();
      else if (a === 'copiar-num') copiarNumero();
    });
    panel.addEventListener('input', function (ev) {
      if (ev.target && ev.target.id === 'waBuscar') { _busqueda = ev.target.value || ''; renderLista(); }
      if (ev.target && ev.target.id === 'waTexto') { autoAlto(ev.target); if (!ev.target.value) _rapidoUsado = ''; }
    });
    // Enter envía; Shift + Enter, salto de línea (como en WhatsApp Web).
    panel.addEventListener('keydown', function (ev) {
      if (ev.target && ev.target.id === 'waTexto' && ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviarTexto(); }
    });
  }

  function avisoCifrado() {
    var av = $('waAvisoCifrado');
    if (!av || !window.PiiCrypto) return;
    try { av.hidden = !window.PiiCrypto.status().enabled; } catch (e) {}
  }

  // ── Montaje ─────────────────────────────────────────────────
  window._mountWhatsApp = function () {
    if (_montado) return;
    if (!window._slDb || !window._slAuth || !window._slAuth.currentUser) return;
    if (window._slUserIsLite) return;
    var panel = $('panel-wa');
    var tab = $('tab-wa');
    if (!panel || !tab) return;
    _montado = true;

    tab.hidden = false;
    panel.innerHTML = panelHtml();
    enlazar(panel);
    pintarContexto();
    avisoCifrado();
    if (window.PiiCrypto && window.PiiCrypto.onChange) window.PiiCrypto.onChange(avisoCifrado);

    // Las horas relativas ("Ayer") y el estado de la ventana se refrescan solos.
    setInterval(function () { if (_convs.length) { renderLista(); if (_sel) pintarCabecera(); } }, 60000);

    escucharLista();
  };

  // La ficha del cliente cambió (datos leídos, venta, pago): la etiqueta de
  // etapa de la lista se pone al día.
  document.addEventListener('sl:ficha', function () { if (_montado) { renderLista(); if (_sel) renderHilo(); } });

  // Para ui/seguimiento.js: los chats que nadie ha abierto y abrir uno.
  window.WaInbox = {
    marcarRespondido: marcarRespondido,
    sinRespuesta: sinRespuesta,
    convs: function () { return _convs.slice(); },
    abrir: function (waId) {
      var tab = $('tab-wa');
      if (tab) tab.click(); else if (window.switchTab) switchTab('wa');
      abrir(waId);
    }
  };
})();
