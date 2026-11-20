// ============================================================
// SEGUIMIENTO DE COTIZACIONES (PC)
// ============================================================
// Una sola lista con lo que el asesor tiene que retomar hoy, para que ningún
// cliente se enfríe ni se vaya con otra tienda:
//   - Cotizaciones enviadas o en negociación sin movimiento hace 2 días o más
//     (la misma regla de siempre: _histNeedsFollowUp en services.js).
//   - Chats de WhatsApp que llegaron y nadie ha abierto.
//   - Recordatorios del chat (domain/recordatorios.js): datos pedidos sin
//     respuesta, venta sin pago, pago rechazado y "¿cómo te llegó?".
//
// Para cada cotización hay un mensaje listo según cuántas veces se le ha
// escrito (qué le pareció → ajustarla → precio especial → último aviso). El
// asesor puede cambiarlo y con un clic se abre WhatsApp con el texto escrito;
// solo falta darle Enviar. Al hacerlo, el seguimiento queda anotado en las
// notas de la cotización y el aviso vuelve en 2 días si no pasa nada.
//
// Envío automático por la API de WhatsApp: llega con la fase 2 del buzón
// (necesita una plantilla aprobada por Meta, porque pasadas 24 h desde el
// último mensaje del cliente no se puede escribir texto libre).
//
// No usa campos nuevos en Firestore: estado, estadoUpdatedAt, clienteTel y
// crmNotas ya existen en user_quotes (pushCrm de quotes-sync.js).
//
// Globales que expone (window.*):
//   Seguimiento.contar()   — pendientes (cotizaciones + chats sin abrir)
//   Seguimiento.abrir()    — abre la vista
//
// Depende de: services.js (getHist, histKey, _histNeedsFollowUp,
//             setHistEstado, loadHist, quoteDisplayNum, fmtCOP),
//             storage.js (_ls), quotes-sync.js (_slQuotesSync),
//             whatsapp-inbox.js (WaInbox, opcional), riel.js (Riel),
//             ui.js (switchTab, showToast), domain.js (esc)
// Estilos: styles/seguimiento.css
// ============================================================
(function () {
  'use strict';

  var DIA = 86400000;
  var CHAT_ESPERA_MIN = 15; // minutos sin abrir para que un chat cuente como pendiente

  var _sel = '';            // id de la cotización elegida
  var _selRec = '';         // recordatorio elegido: "<waId>|<tipo>"
  var _tipoMsg = {};        // id -> tipo de mensaje elegido a mano
  var _textoMsg = {};       // id -> texto editado a mano

  var MENSAJES = [
    ['gusto', 'Qué le pareció'],
    ['ajustar', 'Ajustarla'],
    ['descuento', 'Precio especial'],
    ['ultimo', 'Último aviso']
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2400); }

  // ── Datos ────────────────────────────────────────────────
  function hist() { return (typeof getHist === 'function') ? getHist() : []; }

  function pendientes() {
    if (typeof _histNeedsFollowUp !== 'function') return [];
    var out = [];
    hist().forEach(function (x, i) { if (_histNeedsFollowUp(x)) out.push({ x: x, i: i }); });
    // Lo que más vale primero; a igual valor, lo más reciente (está más tibio).
    out.sort(function (a, b) { return (b.x.total || 0) - (a.x.total || 0) || (b.x.estadoUpdatedAt || 0) - (a.x.estadoUpdatedAt || 0); });
    return out;
  }

  // Cotizaciones vivas que todavía no cumplen los 2 días: "mañana vienen N".
  function proximas() {
    var n = 0, ahora = Date.now();
    hist().forEach(function (x) {
      var est = x.estado || 'enviada';
      if (x.followUpSnoozed || !x.estadoUpdatedAt) return;
      if (est !== 'enviada' && est !== 'negociando') return;
      var edad = ahora - x.estadoUpdatedAt;
      if (edad < 2 * DIA && edad >= 1 * DIA) n++;
    });
    return n;
  }

  // Recordatorios a partir de las fichas de los clientes (ui/ficha-cliente.js)
  function recordatorios() {
    if (!window.Recordatorios || !window.FichaCliente || !window.FichaCliente.todas) return [];
    var convs = {};
    (window.WaInbox ? window.WaInbox.convs() : []).forEach(function (c) { convs[c.id] = c; });
    var fichas = window.FichaCliente.todas().map(function (x) {
      var c = convs[x.id] || {};
      return { id: x.id, f: x.f, nombre: (x.f.datos && x.f.datos.nombre) || c.nombre || '', ultimoClienteAt: ms(c.ultimoAt) };
    });
    return window.Recordatorios.de({ fichas: fichas });
  }
  function claveRec(r) { return r.id + '|' + r.tipo; }

  function chatsEsperando() {
    if (!window.WaInbox) return [];
    var ahora = Date.now();
    return window.WaInbox.convs().filter(function (c) {
      var t = ms(c.ultimoAt);
      return c.noLeidos > 0 && t && (ahora - t) >= CHAT_ESPERA_MIN * 60000;
    });
  }

  function ms(v) {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    return typeof v === 'number' ? v : 0;
  }

  function buscar(id) {
    var h = hist();
    for (var i = 0; i < h.length; i++) if (h[i].id === id) return { x: h[i], i: i, h: h };
    return null;
  }

  function dias(x) { return x.estadoUpdatedAt ? Math.floor((Date.now() - x.estadoUpdatedAt) / DIA) : 0; }

  // Seguimientos ya hechos: las líneas que esta vista deja en las notas.
  function vecesEscrito(x) {
    var m = String(x.crmNotas || '').match(/Seguimiento \d/g);
    return m ? m.length : 0;
  }

  function soloDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  // Número para wa.me: los celulares de Colombia vienen de 10 dígitos.
  function numeroWa(tel) {
    var d = soloDigitos(tel);
    if (d.length === 10 && d.charAt(0) === '3') return '57' + d;
    return d.length >= 11 ? d : '';
  }

  // Si la cotización no tiene teléfono, se busca un chat de WhatsApp con el
  // mismo nombre (pasa al cotizar desde un chat: el nombre viene de ahí).
  function telDeChat(x) {
    if (!window.WaInbox || !x.cliente) return null;
    var n = String(x.cliente).trim().toLowerCase();
    if (!n) return null;
    var cs = window.WaInbox.convs();
    for (var i = 0; i < cs.length; i++) {
      if (String(cs[i].nombre || '').trim().toLowerCase() === n) return cs[i];
    }
    return null;
  }

  // "SARA" o "sara" → "Sara": el mensaje lo lee el cliente.
  function primerNombre(s) {
    var p = String(s || '').trim().split(/\s+/)[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
  }

  function tienda() {
    var b = window._slBranding;
    return (window._slIsBranded && window._slIsBranded() && b && b.brandName) ? b.brandName : '';
  }

  function tipoSugerido(x) {
    var n = vecesEscrito(x);
    return n === 0 ? 'gusto' : n === 1 ? 'ajustar' : n === 2 ? 'descuento' : 'ultimo';
  }

  function textoMensaje(tipo, x) {
    var nom = x._piiLocked ? '' : primerNombre(x.cliente);
    var hola = 'Hola' + (nom ? ' ' + nom : '');
    var num = (typeof quoteDisplayNum === 'function') ? quoteDisplayNum(x.num, x.asesor, x.letra) : String(x.num || '');
    var yo = primerNombre(x.asesor);
    var de = tienda();
    var firma = yo ? ' Te escribe ' + yo + (de ? ' de ' + de : '') + '.' : '';
    if (tipo === 'ajustar') return hola + ', ¿cómo vas?' + firma + ' Si quieres, ajustamos la cotización #' + num + ': podemos cambiar productos o buscar opciones que se acomoden mejor a lo que necesitas.';
    if (tipo === 'descuento') return hola + ', ¿cómo estás?' + firma + ' Si cierras esta semana la cotización #' + num + ', te puedo dar un precio especial. ¿Te la aparto?';
    if (tipo === 'ultimo') return hola + ', ¿cómo estás?' + firma + ' Te escribo por la cotización #' + num + ': los precios pueden cambiar en estos días. Si todavía te interesa, te la dejo apartada.';
    return hola + ', ¿cómo estás?' + firma + ' ¿Qué te pareció la cotización #' + num + '? Cuéntame si tienes alguna duda o si quieres que le cambiemos algo.';
  }

  function fechaCorta(t) {
    return new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '').replace(' de ', ' ');
  }

  // ── Acciones ─────────────────────────────────────────────
  // Deja el seguimiento anotado y reinicia el reloj de 2 días. Mismo camino
  // que el resto del CRM: local primero, nube con pushCrm.
  function anotar(id, linea) {
    var r = buscar(id);
    if (!r) return;
    var x = r.x;
    x.estadoUpdatedAt = Date.now();
    var push = { estado: x.estado || 'enviada' };
    if (linea && !x._piiLocked) {
      var notas = String(x.crmNotas || '');
      var nuevas = (notas ? notas + '\n' : '') + linea;
      if (nuevas.length <= 500) { x.crmNotas = nuevas; push.crmNotas = nuevas; }
    }
    _ls.setJSON(histKey(), r.h);
    if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, push);
  }

  function siguiente(idActual) {
    // El que estaba debajo en la lista: así se avanza en orden, sin saltos.
    var todos = pendientes();
    var pos = 0;
    for (var i = 0; i < todos.length; i++) if (todos[i].x.id === idActual) { pos = i; break; }
    var lista = todos.filter(function (p) { return p.x.id !== idActual; });
    var sig = lista.length ? lista[Math.min(pos, lista.length - 1)].x : null;
    _sel = sig ? sig.id : '';
    return sig;
  }

  function enviar(id) {
    var r = buscar(id);
    if (!r) return;
    var x = r.x;
    var num = numeroWa(x.clienteTel);
    if (!num) { toast('Falta el WhatsApp del cliente', 'warn'); return; }
    var ta = $('sgTexto');
    var texto = (ta ? ta.value : textoMensaje(_tipoMsg[id] || tipoSugerido(x), x)).trim();
    if (!texto) { toast('Escribe el mensaje', 'warn'); return; }
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
    var tipo = _tipoMsg[id] || tipoSugerido(x);
    var etiqueta = { gusto: 'qué le pareció', ajustar: 'ajustarla', descuento: 'precio especial', ultimo: 'último aviso' }[tipo] || 'mensaje';
    var sig = siguiente(id); // antes de anotar: después ya no está en la lista
    anotar(id, 'Seguimiento ' + (vecesEscrito(x) + 1) + ' (' + fechaCorta(Date.now()) + '): ' + etiqueta);
    delete _tipoMsg[id]; delete _textoMsg[id];
    refrescarTodo();
    toast(sig ? 'Listo. Sigue ' + (primerNombre(sig.cliente) || 'el próximo cliente') : 'Listo. Estás al día', 'success');
  }

  function marcar(id, estado) {
    var r = buscar(id);
    if (!r) return;
    var sig = siguiente(id);
    if (typeof setHistEstado === 'function') setHistEstado(r.i, estado);
    refrescarTodo();
    if (!sig) toast('Estás al día', 'success');
  }

  function despues(id) {
    var r = buscar(id);
    if (!r) return;
    siguiente(id);
    anotar(id, '');
    refrescarTodo();
    toast('Te lo recordamos en 2 días', 'info');
  }

  function guardarTel(id, valor) {
    var r = buscar(id);
    if (!r) return;
    if (r.x._piiLocked) { toast('Los datos de este cliente están cifrados. Ingresa la llave de la empresa en Configuración.', 'warn'); return; }
    var d = soloDigitos(valor);
    if (d.length < 10) { toast('Escribe un número de 10 dígitos', 'warn'); return; }
    r.x.clienteTel = d.length === 12 && d.indexOf('57') === 0 ? d.slice(2) : d;
    _ls.setJSON(histKey(), r.h);
    if (r.x.id && window._slQuotesSync) _slQuotesSync.pushCrm(r.x.id, { clienteTel: r.x.clienteTel });
    pintar();
    toast('Número guardado', 'success');
  }

  function abrirCotizacion(id) {
    var r = buscar(id);
    if (!r || typeof loadHist !== 'function') return;
    loadHist(r.i);
    var t = $('tab-q');
    if (t) t.click(); else switchTab('q');
  }

  function abrirChat(waId) {
    if (window.WaInbox) window.WaInbox.abrir(waId);
  }

  // ── Pintar ───────────────────────────────────────────────
  function panel() {
    var p = $('panel-seg');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-seg';
    p.className = 'ivapanel sg';
    p.style.display = 'none';
    pv.appendChild(p);
    enlazar(p);
    return p;
  }

  function fila(p) {
    var x = p.x;
    var d = dias(x);
    var veces = vecesEscrito(x);
    var nombre = x._piiLocked ? 'Datos cifrados' : (x.cliente || 'Sin nombre');
    return '<button type="button" class="sg-fila' + (x.id === _sel ? ' on' : '') + '" data-sg="' + esc(x.id) + '">'
      + '<span class="sg-fila-a"><b>' + esc(nombre) + '</b><span>' + esc(fmtCOP(x.total || 0)) + '</span></span>'
      + '<span class="sg-fila-b"><span class="sg-dias' + (d >= 5 ? ' sg-frio' : '') + '">' + d + (d === 1 ? ' día' : ' días') + ' sin respuesta</span>'
      + (veces ? '<span class="sg-veces">' + veces + (veces === 1 ? ' mensaje' : ' mensajes') + '</span>' : '')
      + '</span></button>';
  }

  function filaRec(r) {
    var k = claveRec(r);
    var tono = r.tipo === 'rechazado' ? ' sg-frio' : '';
    return '<button type="button" class="sg-fila' + (k === _selRec ? ' on' : '') + '" data-sg-rec="' + esc(k) + '">'
      + '<span class="sg-fila-a"><b>' + esc(r.nombre) + '</b></span>'
      + '<span class="sg-fila-b"><span class="sg-dias' + tono + '">' + esc(r.titulo) + '</span></span></button>';
  }

  function detalleRec(r) {
    var k = 'r:' + claveRec(r);
    var texto = _textoMsg[k] !== undefined ? _textoMsg[k] : r.texto;
    return '<div class="sg-det-cab"><div><p class="sg-eti">Recordatorio · ' + esc(r.titulo) + '</p><h2>' + esc(r.nombre) + '</h2>'
        + '<span class="sg-tel">+' + esc(String(r.id).slice(0, 2)) + ' ' + esc(String(r.id).slice(2)) + '</span></div></div>'
      + '<p class="sg-sub">' + esc(r.detalle) + '</p>'
      + '<div class="sg-msg">'
        + '<div class="sg-msg-cab"><b>Mensaje</b><span>Puedes cambiarlo antes de enviar</span></div>'
        + '<textarea id="sgTextoRec" rows="4" aria-label="Texto del recordatorio">' + esc(texto) + '</textarea>'
        + '<button type="button" class="sg-enviar" data-sg-racc="enviar">Enviar por WhatsApp</button>'
        + '<p class="sg-ayuda">Se abre WhatsApp con el mensaje escrito; solo dale Enviar. Cuando conectemos la API de WhatsApp, este recordatorio sale solo.</p>'
      + '</div>'
      + '<div class="sg-acciones">'
        + '<button type="button" class="sg-btn" data-sg-racc="chat">Abrir el chat</button>'
        + '<button type="button" class="sg-btn" data-sg-racc="posponer">' + (r.tipo === 'entrega' ? 'No hace falta' : 'Recordar mañana') + '</button>'
      + '</div>';
  }

  function enviarRec(r) {
    var ta = $('sgTextoRec');
    var texto = ta ? ta.value.trim() : r.texto;
    if (!texto) { toast('Escribe el mensaje', 'warn'); return; }
    window.open('https://wa.me/' + encodeURIComponent(r.id) + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
    window.FichaCliente.recordado(r.id, r.tipo, texto);
    delete _textoMsg['r:' + claveRec(r)];
    toast('Recordatorio enviado a ' + r.nombre.split(' ')[0], 'success');
    _selRec = '';
    refrescarTodo();
  }

  function filaChat(c) {
    var nom = c.nombre || ('+' + c.id);
    var min = Math.floor((Date.now() - ms(c.ultimoAt)) / 60000);
    var hace = min < 60 ? 'hace ' + min + ' min' : min < 1440 ? 'hace ' + Math.floor(min / 60) + ' h' : 'hace ' + Math.floor(min / 1440) + ' d';
    return '<button type="button" class="sg-fila sg-fila-chat" data-sg-chat="' + esc(c.id) + '">'
      + '<span class="sg-fila-a"><b>' + esc(nom) + '</b><span>' + esc(hace) + '</span></span>'
      + '<span class="sg-fila-b"><span class="sg-txt">' + esc(c.ultimoTexto || 'Mensaje nuevo') + '</span></span></button>';
  }

  function detalle(x, hayPendientes) {
    if (!x && !hayPendientes) {
      return '<div class="sg-vacio-det"><b>Nada por retomar</b><span>Cuando una cotización lleve 2 días sin respuesta, aparece aquí con el mensaje listo para enviar.</span></div>';
    }
    if (!x) {
      return '<div class="sg-vacio-det"><b>Elige un cliente</b><span>Aquí ves su cotización y el mensaje listo para enviar.</span></div>';
    }
    var id = x.id;
    var tipo = _tipoMsg[id] || tipoSugerido(x);
    var texto = _textoMsg[id] !== undefined ? _textoMsg[id] : textoMensaje(tipo, x);
    var num = numeroWa(x.clienteTel);
    var veces = vecesEscrito(x);
    var prods = Array.isArray(x.items) ? x.items : [];
    var lista = prods.slice(0, 4).map(function (it) {
      // price viene en miles, como el catálogo
      return '<li><span>' + esc(it.name || '') + '</span><b>' + (it.qty > 1 ? it.qty + ' × ' : '') + esc(fmtCOP(Math.round(Number(it.price || 0) * 1000))) + '</b></li>';
    }).join('') + (prods.length > 4 ? '<li class="sg-mas">y ' + (prods.length - 4) + ' más</li>' : '');
    var nombre = x._piiLocked ? 'Datos cifrados' : (x.cliente || 'Sin nombre');
    var numTxt = (typeof quoteDisplayNum === 'function') ? quoteDisplayNum(x.num, x.asesor, x.letra) : x.num;

    var tel;
    if (num) {
      tel = '<span class="sg-tel">+' + esc(num.slice(0, 2)) + ' ' + esc(num.slice(2)) + '</span>';
    } else {
      var chat = telDeChat(x);
      tel = '<div class="sg-sin-tel"><span>Falta el WhatsApp del cliente.</span>'
        + (chat ? '<button type="button" class="sg-chip on" data-sg-usar="' + esc(chat.id) + '">Usar el de su chat: +' + esc(chat.id) + '</button>' : '')
        + '<div class="sg-tel-form"><input id="sgTel" inputmode="tel" autocomplete="off" placeholder="300 123 4567" aria-label="WhatsApp del cliente">'
        + '<button type="button" class="sg-btn" data-sg-acc="tel">Guardar</button></div></div>';
    }

    var chips = MENSAJES.map(function (m) {
      return '<button type="button" class="sg-chip' + (m[0] === tipo ? ' on' : '') + '" data-sg-tipo="' + m[0] + '" aria-pressed="' + (m[0] === tipo) + '">' + m[1] + '</button>';
    }).join('');

    return '<div class="sg-det-cab">'
        + '<div><p class="sg-eti">Cotización #' + esc(numTxt) + ' · ' + esc(x.date || '') + '</p><h2>' + esc(nombre) + '</h2>' + tel + '</div>'
        + '<div class="sg-total">' + esc(fmtCOP(x.total || 0)) + '</div>'
      + '</div>'
      + (lista ? '<ul class="sg-prods">' + lista + '</ul>' : '')
      + (x.crmNotas ? '<div class="sg-notas">' + esc(x.crmNotas) + '</div>' : '')
      + '<div class="sg-msg">'
        + '<div class="sg-msg-cab"><b>Mensaje</b><span>' + (veces ? 'Ya le escribiste ' + veces + (veces === 1 ? ' vez' : ' veces') : 'Primer seguimiento') + '</span></div>'
        + '<div class="sg-chips" role="group" aria-label="Tipo de mensaje">' + chips + '</div>'
        + '<textarea id="sgTexto" rows="4" aria-label="Texto del mensaje">' + esc(texto) + '</textarea>'
        + '<button type="button" class="sg-enviar" data-sg-acc="enviar"' + (num ? '' : ' disabled') + '>Enviar por WhatsApp</button>'
        + '<p class="sg-ayuda">Se abre WhatsApp con el mensaje escrito; solo dale Enviar. Queda anotado en la cotización.</p>'
      + '</div>'
      + '<div class="sg-acciones">'
        + '<button type="button" class="sg-btn" data-sg-acc="vendida">Ya compró</button>'
        + '<button type="button" class="sg-btn" data-sg-acc="perdida">No va a comprar</button>'
        + '<button type="button" class="sg-btn" data-sg-acc="despues">Recordar en 2 días</button>'
        + '<button type="button" class="sg-btn" data-sg-acc="abrir">Abrir cotización</button>'
      + '</div>';
  }

  function pintar() {
    var p = panel();
    if (!p) return;
    var ps = pendientes();
    var chats = chatsEsperando();
    var recs = recordatorios();
    if (_selRec && !recs.some(function (r) { return claveRec(r) === _selRec; })) _selRec = '';
    if (_sel && !ps.some(function (q) { return q.x.id === _sel; })) _sel = '';
    if (!_sel && !_selRec) { if (recs.length) _selRec = claveRec(recs[0]); else if (ps.length) _sel = ps[0].x.id; }
    var recActual = _selRec ? recs.filter(function (r) { return claveRec(r) === _selRec; })[0] : null;
    var actual = _sel && !recActual ? buscar(_sel) : null;
    var total = ps.reduce(function (s, q) { return s + (q.x.total || 0); }, 0);
    var prox = proximas();

    var manana = prox ? ' Mañana te recordamos ' + prox + '.' : '';
    var titulo, sub;
    var n = ps.length + recs.length;
    if (n) {
      titulo = n + (n === 1 ? ' cliente espera' : ' clientes esperan') + ' tu mensaje';
      sub = ps.length ? 'Hay ' + fmtCOP(total) + ' en cotizaciones sin respuesta. Escríbeles antes de que compren en otro lado.'
        : 'Datos, pagos y entregas pendientes. Un mensaje a tiempo cierra la venta.';
    } else if (chats.length) {
      titulo = chats.length + (chats.length === 1 ? ' chat sin abrir' : ' chats sin abrir');
      sub = 'No hay cotizaciones sin respuesta. Abre los chats para que nadie se quede esperando.' + manana;
    } else {
      titulo = 'Estás al día';
      sub = 'No hay cotizaciones sin respuesta ni chats sin abrir.' + manana;
    }

    var listaHtml = '';
    if (recs.length) {
      listaHtml += '<h3 class="sg-grupo">Recordatorios <span>' + recs.length + '</span></h3>' + recs.map(filaRec).join('');
    }
    if (chats.length) {
      listaHtml += '<h3 class="sg-grupo">Chats sin abrir <span>' + chats.length + '</span></h3>' + chats.map(filaChat).join('');
    }
    listaHtml += '<h3 class="sg-grupo">Cotizaciones para retomar <span>' + ps.length + '</span></h3>'
      + (ps.length ? ps.map(fila).join('') : '<p class="sg-vacio">Nada por ahora.</p>');
    if (prox && ps.length) listaHtml += '<p class="sg-pie">Mañana se suman ' + prox + '.</p>';

    p.innerHTML = '<div class="sg-in">'
      + '<header class="sg-cab"><p class="sg-eti">Seguimiento</p><h1>' + esc(titulo) + '</h1><p class="sg-sub">' + esc(sub) + '</p></header>'
      + '<div class="sg-cuerpo">'
        + '<section class="sg-lista" aria-label="Pendientes">' + listaHtml + '</section>'
        + '<section class="sg-det" aria-live="polite">' + (recActual ? detalleRec(recActual) : detalle(actual && actual.x, ps.length > 0)) + '</section>'
      + '</div></div>';
  }

  function refrescarTodo() {
    if (typeof updateFollowBadge === 'function') updateFollowBadge();
    insignia();
    if (visible()) pintar();
  }

  function visible() { var p = $('panel-seg'); return !!p && p.style.display !== 'none'; }

  function insignia() { if (window.Riel && window.Riel.insignias) window.Riel.insignias(); }

  function enlazar(p) {
    p.addEventListener('click', function (e) {
      var f = e.target.closest('[data-sg]');
      if (f) { guardarBorrador(); _sel = f.getAttribute('data-sg'); _selRec = ''; pintar(); return; }
      var rf = e.target.closest('[data-sg-rec]');
      if (rf) { guardarBorrador(); _selRec = rf.getAttribute('data-sg-rec'); _sel = ''; pintar(); return; }
      var ra = e.target.closest('[data-sg-racc]');
      if (ra && _selRec) {
        var r = recordatorios().filter(function (x) { return claveRec(x) === _selRec; })[0];
        if (!r) return;
        var acc2 = ra.getAttribute('data-sg-racc');
        if (acc2 === 'enviar') enviarRec(r);
        else if (acc2 === 'chat') abrirChat(r.id);
        else if (acc2 === 'posponer') { window.FichaCliente.recordado(r.id, r.tipo); _selRec = ''; refrescarTodo(); }
        return;
      }
      var c = e.target.closest('[data-sg-chat]');
      if (c) { abrirChat(c.getAttribute('data-sg-chat')); return; }
      var t = e.target.closest('[data-sg-tipo]');
      if (t && _sel) {
        _tipoMsg[_sel] = t.getAttribute('data-sg-tipo');
        delete _textoMsg[_sel];
        pintar();
        return;
      }
      var u = e.target.closest('[data-sg-usar]');
      if (u && _sel) { guardarTel(_sel, u.getAttribute('data-sg-usar')); return; }
      var a = e.target.closest('[data-sg-acc]');
      if (!a || !_sel) return;
      var acc = a.getAttribute('data-sg-acc');
      if (acc === 'enviar') enviar(_sel);
      else if (acc === 'vendida' || acc === 'perdida') marcar(_sel, acc);
      else if (acc === 'despues') despues(_sel);
      else if (acc === 'abrir') abrirCotizacion(_sel);
      else if (acc === 'tel') guardarTel(_sel, ($('sgTel') || {}).value);
    });
    p.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'sgTexto' && _sel) _textoMsg[_sel] = e.target.value;
      if (e.target && e.target.id === 'sgTextoRec' && _selRec) _textoMsg['r:' + _selRec] = e.target.value;
    });
    p.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'sgTel' && e.key === 'Enter' && _sel) guardarTel(_sel, e.target.value);
      // Cmd/Ctrl + Enter en el mensaje = enviar
      if (e.target && e.target.id === 'sgTexto' && e.key === 'Enter' && (e.metaKey || e.ctrlKey) && _sel) { e.preventDefault(); enviar(_sel); }
    });
  }

  function guardarBorrador() {
    var ta = $('sgTexto');
    if (ta && _sel) _textoMsg[_sel] = ta.value;
    var tr = $('sgTextoRec');
    if (tr && _selRec) _textoMsg['r:' + _selRec] = tr.value;
  }

  // ── Enganches ────────────────────────────────────────────
  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      if (t === 'seg') panel();
      var r = original.apply(this, arguments);
      if (t === 'seg') pintar();
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  // El contador del historial cambia con cada estado o cotización nueva: el
  // del riel lo sigue.
  if (typeof window.updateFollowBadge === 'function') {
    var origBadge = window.updateFollowBadge;
    window.updateFollowBadge = function () { var r = origBadge.apply(this, arguments); insignia(); return r; };
  }

  document.addEventListener('sl:wa-convs', function () { insignia(); if (visible()) { guardarBorrador(); pintar(); } });
  document.addEventListener('sl:ficha', function () { insignia(); if (visible()) { guardarBorrador(); pintar(); } });
  // Los días cuentan solos: repasar cada 5 minutos.
  setInterval(function () { insignia(); if (visible()) { guardarBorrador(); pintar(); } }, 300000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  window.Seguimiento = {
    contar: function () { return pendientes().length + chatsEsperando().length + recordatorios().length; },
    abrir: function () { switchTab('seg'); }
  };
})();
