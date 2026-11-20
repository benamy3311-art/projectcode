// ============================================================
// WHATSAPP — LÓGICA PURA (fase 1: recibir y mostrar)
// ============================================================
// Todo lo que hay que decidir sobre un mensaje de WhatsApp sin tocar red, DOM
// ni Firestore: verificar que el webhook viene de Meta, pasar el JSON de Meta
// a mensajes propios y calcular la ventana de 24 horas. Diseño completo en
// WHATSAPP_FASE1.md.
//
// Puro a propósito, como domain/agent-tools.js: lo carga la función de
// servidor (api/whatsapp.js) y, cuando exista el buzón, también el navegador
// (para la ventana y el resumen de cada mensaje). Un solo lugar donde se
// arreglan los errores, y con tests.
//
// Un mensaje de WhatsApp lo escribe un desconocido: es el dato menos confiable
// de toda la app. Acá se valida la FORMA (IDs que sirven como ID de documento
// de Firestore, largos máximos, tipos conocidos). Escaparlo al pintarlo sigue
// siendo trabajo de quien lo pinta (esc() en domain/domain.js).
//
// Globales que expone (window.* / globalThis.*):
//   WhatsApp.verificarSuscripcion(query, token) — GET de Meta: challenge o null
//   WhatsApp.verificarFirma(opts)               — POST de Meta: true/false
//   WhatsApp.normalizar(payload, opts)          — JSON de Meta -> {mensajes, estados, descartados}
//   WhatsApp.datosMensaje(m, recibidoAt)        — documento de .../mensajes/{wamid}
//   WhatsApp.datosConversacion(m)               — campos de wa_conversations/{waId}
//   WhatsApp.ventanaHasta(atMs)                 — fin de la ventana de 24 h
//   WhatsApp.ventanaAbierta(hastaMs, ahoraMs)   — ¿se puede responder libre?
//   WhatsApp.resumen(m)                         — texto corto para la lista
//
// Tiempos: todo en milisegundos desde 1970 (números). Convertirlos a
// Timestamp de Firestore es trabajo de quien escribe.
//
// Depende de: nada. La función HMAC la pone quien llama (node:crypto en el
// servidor), para que este archivo siga corriendo también en el navegador.
// ============================================================
(function (root) {
  'use strict';

  var VENTANA_MS = 24 * 60 * 60 * 1000;

  // Topes. WhatsApp permite hasta 4096 caracteres por mensaje de texto.
  var MAX_TEXTO = 4096;
  var MAX_NOMBRE = 100;
  var MAX_RESUMEN = 140;
  var MAX_MEDIA_ID = 128;
  var MAX_WAMID = 256;

  var TIPOS_MEDIA = { image: 1, audio: 1, video: 1, document: 1, sticker: 1 };

  // Etiqueta que ve el vendedor en la lista cuando el mensaje no trae texto.
  var ETIQUETAS = {
    image: '[imagen]',
    audio: '[audio]',
    video: '[video]',
    document: '[documento]',
    sticker: '[sticker]',
    location: '[ubicación]',
    contacts: '[contacto]',
    interactive: '[respuesta]',
    button: '[respuesta]',
    reaction: '[reacción]',
    otro: '[mensaje no soportado]'
  };

  // ── Utilidades ──────────────────────────────────────────────

  function str(v) {
    return typeof v === 'string' ? v : '';
  }

  // Corta sin partir un par sustituto (emoji) por la mitad.
  function cortar(s, max) {
    s = str(s);
    if (s.length <= max) return s;
    var c = s.slice(0, max);
    var ultimo = c.charCodeAt(c.length - 1);
    if (ultimo >= 0xd800 && ultimo <= 0xdbff) c = c.slice(0, -1);
    return c;
  }

  // Comparación en tiempo constante (respecto al contenido) de dos textos.
  // Para la firma: una comparación normal corta en el primer carácter distinto
  // y deja medir cuántos acertó quien está probando firmas.
  function igualSeguro(a, b) {
    a = str(a);
    b = str(b);
    if (a.length !== b.length) return false;
    var dif = 0;
    for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  // ── IDs que van a ser IDs de documento de Firestore ─────────

  // Número del cliente como lo manda Meta: solo dígitos, con código de país.
  // Es el ID de wa_conversations, así que nada que no sean dígitos entra.
  function waIdValido(v) {
    return typeof v === 'string' && /^\d{6,20}$/.test(v);
  }

  // ID del mensaje de Meta ("wamid.HBgM..."). Es el ID del documento del
  // mensaje: Firestore no admite '/', ni '.' o '..', ni __nombres__ reservados.
  function wamidValido(v) {
    return typeof v === 'string'
      && v.length > 0
      && v.length <= MAX_WAMID
      && v.indexOf('/') === -1
      && v !== '.' && v !== '..'
      && !/^__.*__$/.test(v)
      && /^[\x21-\x7e]+$/.test(v); // ASCII visible, sin espacios ni control
  }

  function mediaIdValido(v) {
    return typeof v === 'string' && v.length > 0 && v.length <= MAX_MEDIA_ID && /^[\w.-]+$/.test(v);
  }

  // Meta manda la hora como texto con segundos ("1700000000").
  function aMs(timestamp, ahora) {
    var n = typeof timestamp === 'number' ? timestamp : parseInt(str(timestamp), 10);
    if (!isFinite(n) || n <= 0) return ahora;
    return n * 1000;
  }

  // ── Verificación ────────────────────────────────────────────

  // GET de Meta al configurar el webhook. Devuelve el challenge que hay que
  // responder, o null si el token no coincide (se responde 403).
  function verificarSuscripcion(query, tokenEsperado) {
    query = query || {};
    if (!tokenEsperado || typeof tokenEsperado !== 'string') return null;
    if (query['hub.mode'] !== 'subscribe') return null;
    if (!igualSeguro(str(query['hub.verify_token']), tokenEsperado)) return null;
    var ch = str(query['hub.challenge']);
    return ch ? ch : null;
  }

  // POST de Meta. La cabecera X-Hub-Signature-256 trae "sha256=<hex>", el
  // HMAC-SHA256 del cuerpo CRUDO con el App Secret. Sin secreto configurado se
  // rechaza todo: mejor un webhook que no anda que uno que acepta cualquier
  // cosa.
  //
  //   opts.cuerpo     string|Buffer  el cuerpo tal como llegó, sin parsear
  //   opts.cabecera   string         valor de X-Hub-Signature-256
  //   opts.secreto    string         WA_APP_SECRET
  //   opts.hmacHex    function(secreto, cuerpo) -> hex en minúsculas
  function verificarFirma(opts) {
    opts = opts || {};
    if (typeof opts.hmacHex !== 'function') return false;
    if (!opts.secreto || typeof opts.secreto !== 'string') return false;
    if (opts.cuerpo == null) return false;
    var m = /^sha256=([0-9a-fA-F]{64})$/.exec(str(opts.cabecera).trim());
    if (!m) return false;
    var esperado;
    try { esperado = String(opts.hmacHex(opts.secreto, opts.cuerpo)).toLowerCase(); }
    catch (e) { return false; }
    return igualSeguro(m[1].toLowerCase(), esperado);
  }

  // ── Normalización ───────────────────────────────────────────

  // Un mensaje de Meta -> mensaje propio, o null si no sirve.
  function mensajeDe(msg, nombres, phoneNumberId, ahora) {
    if (!msg || typeof msg !== 'object') return null;
    if (!waIdValido(msg.from) || !wamidValido(msg.id)) return null;

    var tipoMeta = str(msg.type);
    var m = {
      wamid: msg.id,
      waId: msg.from,
      nombre: cortar(nombres[msg.from] || '', MAX_NOMBRE),
      phoneNumberId: phoneNumberId,
      tipo: 'otro',
      texto: '',
      at: aMs(msg.timestamp, ahora)
    };

    if (tipoMeta === 'text') {
      m.tipo = 'text';
      m.texto = str(msg.text && msg.text.body);
    } else if (TIPOS_MEDIA[tipoMeta]) {
      m.tipo = tipoMeta;
      var media = msg[tipoMeta] || {};
      if (mediaIdValido(media.id)) m.mediaId = media.id;
      // Imagen, video y documento pueden traer texto; el documento, nombre.
      m.texto = str(media.caption) || (tipoMeta === 'document' ? str(media.filename) : '');
    } else if (tipoMeta === 'location') {
      m.tipo = 'location';
      var loc = msg.location || {};
      var lugar = [str(loc.name), str(loc.address)].filter(Boolean).join(', ');
      var lat = typeof loc.latitude === 'number' ? loc.latitude : NaN;
      var lon = typeof loc.longitude === 'number' ? loc.longitude : NaN;
      m.texto = lugar || (isFinite(lat) && isFinite(lon) ? lat + ', ' + lon : '');
    } else if (tipoMeta === 'contacts') {
      m.tipo = 'contacts';
      var c = Array.isArray(msg.contacts) ? msg.contacts[0] : null;
      m.texto = str(c && c.name && c.name.formatted_name);
    } else if (tipoMeta === 'interactive') {
      m.tipo = 'interactive';
      var it = msg.interactive || {};
      var resp = it.button_reply || it.list_reply || {};
      m.texto = str(resp.title);
    } else if (tipoMeta === 'button') {
      m.tipo = 'button';
      m.texto = str(msg.button && msg.button.text);
    } else if (tipoMeta === 'reaction') {
      m.tipo = 'reaction';
      m.texto = str(msg.reaction && msg.reaction.emoji);
    }
    // Cualquier otro tipo ('unsupported', 'system', 'order'...) queda como
    // 'otro' sin texto: no se pierde el aviso de que el cliente escribió.

    m.texto = cortar(m.texto, MAX_TEXTO);
    return m;
  }

  function estadoDe(st, ahora) {
    if (!st || typeof st !== 'object' || !wamidValido(st.id)) return null;
    var e = str(st.status);
    if (['sent', 'delivered', 'read', 'failed'].indexOf(e) === -1) return null;
    return {
      wamid: st.id,
      waId: waIdValido(st.recipient_id) ? st.recipient_id : '',
      estado: e,
      at: aMs(st.timestamp, ahora)
    };
  }

  // El JSON que manda Meta al webhook -> mensajes y estados propios.
  //
  //   opts.phoneNumberId  si viene, se descarta lo que llegue para otro número
  //   opts.ahora          ms; hora de respaldo si un mensaje no trae hora
  //
  // Devuelve { mensajes: [...], estados: [...], descartados: n }. Los
  // mensajes salen en orden de llegada (`at` ascendente), para que quien
  // escriba deje como "último" al más nuevo.
  function normalizar(payload, opts) {
    opts = opts || {};
    var ahora = typeof opts.ahora === 'number' ? opts.ahora : Date.now();
    var fuera = { mensajes: [], estados: [], descartados: 0 };
    if (!payload || payload.object !== 'whatsapp_business_account') return fuera;
    var entradas = Array.isArray(payload.entry) ? payload.entry : [];

    entradas.forEach(function (en) {
      var cambios = en && Array.isArray(en.changes) ? en.changes : [];
      cambios.forEach(function (ch) {
        if (!ch || ch.field !== 'messages' || !ch.value) return;
        var v = ch.value;
        var pnid = str(v.metadata && v.metadata.phone_number_id);
        var msgs = Array.isArray(v.messages) ? v.messages : [];
        var sts = Array.isArray(v.statuses) ? v.statuses : [];

        if (opts.phoneNumberId && pnid !== opts.phoneNumberId) {
          fuera.descartados += msgs.length + sts.length;
          return;
        }

        var nombres = {};
        (Array.isArray(v.contacts) ? v.contacts : []).forEach(function (c) {
          if (c && waIdValido(c.wa_id)) nombres[c.wa_id] = str(c.profile && c.profile.name);
        });

        msgs.forEach(function (msg) {
          var m = mensajeDe(msg, nombres, pnid, ahora);
          if (m) fuera.mensajes.push(m); else fuera.descartados++;
        });
        sts.forEach(function (st) {
          var e = estadoDe(st, ahora);
          if (e) fuera.estados.push(e); else fuera.descartados++;
        });
      });
    });

    fuera.mensajes.sort(function (a, b) { return a.at - b.at; });
    return fuera;
  }

  // ── Documentos de Firestore ─────────────────────────────────

  // wa_conversations/{waId}/mensajes/{wamid}
  function datosMensaje(m, recibidoAt) {
    var d = {
      dir: 'in',
      tipo: m.tipo,
      texto: m.texto,
      at: m.at,
      recibidoAt: typeof recibidoAt === 'number' ? recibidoAt : m.at
    };
    if (m.mediaId) d.mediaId = m.mediaId;
    return d;
  }

  // Campos de wa_conversations/{waId} que actualiza un mensaje entrante.
  // `noLeidos` (+1) y `creadoAt` (solo la primera vez) no van acá: son
  // operaciones de Firestore (incremento y escritura condicional) que arma
  // quien escribe.
  function datosConversacion(m) {
    var d = {
      waId: m.waId,
      ultimoTexto: resumen(m),
      ultimoTipo: m.tipo,
      ultimoAt: m.at,
      ventanaHasta: ventanaHasta(m.at)
    };
    // Sin nombre en este mensaje, no se pisa el que ya estaba guardado.
    if (m.nombre) d.nombre = m.nombre;
    return d;
  }

  // ── Ventana de 24 h y resumen ───────────────────────────────

  // Mientras la ventana está abierta se puede responder con texto libre;
  // cerrada, solo con plantillas aprobadas (fase 2).
  function ventanaHasta(atMs) {
    return atMs + VENTANA_MS;
  }

  function ventanaAbierta(hastaMs, ahoraMs) {
    if (typeof hastaMs !== 'number' || !isFinite(hastaMs)) return false;
    var ahora = typeof ahoraMs === 'number' ? ahoraMs : Date.now();
    return ahora < hastaMs;
  }

  // Texto de una línea para la lista de conversaciones.
  function resumen(m) {
    var t = str(m && m.texto).replace(/\s+/g, ' ').trim();
    var etiqueta = ETIQUETAS[m && m.tipo] || '';
    if (m && m.tipo !== 'text' && etiqueta) t = t ? etiqueta + ' ' + t : etiqueta;
    return cortar(t, MAX_RESUMEN);
  }

  root.WhatsApp = {
    verificarSuscripcion: verificarSuscripcion,
    verificarFirma: verificarFirma,
    normalizar: normalizar,
    datosMensaje: datosMensaje,
    datosConversacion: datosConversacion,
    ventanaHasta: ventanaHasta,
    ventanaAbierta: ventanaAbierta,
    resumen: resumen,
    // Para los tests.
    _waIdValido: waIdValido,
    _wamidValido: wamidValido,
    _igualSeguro: igualSeguro,
    _cortar: cortar,
    VENTANA_MS: VENTANA_MS,
    MAX_TEXTO: MAX_TEXTO
  };
})(typeof window !== 'undefined' ? window : globalThis);
