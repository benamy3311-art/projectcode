// ============================================================
// COMPROBANTES DE PAGO — Firestore
// ============================================================
// El pantallazo que manda el cliente (transferencia, Nequi, QR...) queda
// guardado en la nube, unido a su venta, para que el encargado lo revise
// desde cualquier equipo y lo copie con un clic.
//
// Dos documentos por comprobante, para que la lista no descargue imágenes
// enteras:
//   comprobantes/{id}          datos + miniatura (~10 KB)
//   comprobantes/{id}/imagen/0 la imagen completa (se pide al abrirla)
//
// Cliente, miniatura e imagen son datos personales: pasan por PiiCrypto si la
// empresa activó el cifrado (regla del proyecto, CLAUDE.md).
//
// Si no hay conexión al registrar la venta, el comprobante queda en este
// navegador y se reintenta solo (al volver la conexión o al abrir la app).
//
// Reglas (firestore.rules, match /comprobantes): crea cualquier usuario
// aprobado a su nombre; lee el que lo subió y el jefe; revisa solo el jefe.
//
// Globales que expone (window.*):
//   Comprobantes.comprimir(blob)   — Promise<{ imagen, miniatura }> (JPEG data URL)
//   Comprobantes.subir(datos)      — Promise<id>
//   Comprobantes.listar()          — Promise<[comprobante]>, recientes primero
//   Comprobantes.imagen(id)        — Promise<dataUrl>
//   Comprobantes.revisar(id, estado, nota) — Promise
//   Comprobantes.copiar(dataUrl)   — Promise; copia la imagen al portapapeles
//   Comprobantes.leer(dataUrl)     — Promise<lectura|null>: valor, referencia y
//                                    entidad leídos con IA (domain/comprobante.js)
// Eventos: 'sl:pago-revisado' { id, estado, nota, ventaNumero, ... } cuando el
// jefe aprueba o rechaza (escucha en vivo desde que la cuenta entra).
//   Comprobantes.pendientesLocales() — cuántos esperan conexión
//   Comprobantes.esRevisor()       — jefe o admin
// Evento: 'sl:comprobantes' en document cuando algo cambia.
//
// Depende de: firebase-auth.js (_slDb, _slAuth, _slUserRol),
//             pii-crypto.js (PiiCrypto, opcional)
// ============================================================
(function () {
  'use strict';

  var COL = 'comprobantes';
  var LS_PEND = 'pc_comprobantes_pend';
  var MAX_LADO = 1600;      // px del lado mayor de la imagen guardada
  var MAX_DATAURL = 700000; // caracteres; Firestore admite 1 MB por documento
  var MINI_LADO = 240;
  var LIMITE = 150;

  var CAMPOS_META = [{ path: 'cliente' }, { path: 'miniatura', bin: true }];
  var CAMPOS_IMG = [{ path: 'imagen', bin: true }];

  function db() { return window._slDb; }
  function correo() {
    var u = window._slAuth && window._slAuth.currentUser;
    return u ? String(u.email || '').toLowerCase() : '';
  }
  function esRevisor() { return ['jefe', 'admin'].indexOf(window._slUserRol) >= 0; }
  function avisar() { document.dispatchEvent(new CustomEvent('sl:comprobantes')); }
  function pii() { return window.PiiCrypto || null; }

  function nuevoId() {
    var a = new Uint8Array(10);
    crypto.getRandomValues(a);
    return 'cp_' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // ── Imagen ───────────────────────────────────────────────
  function cargarImagen(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  function aJpeg(img, lado, calidad) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var k = Math.min(1, lado / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // los PNG con transparencia no quedan negros
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', calidad);
  }

  // Siempre se recomprime: así lo que se guarda es un JPEG limpio (sin datos
  // de ubicación de la foto) y de tamaño conocido.
  function comprimir(blob) {
    if (!blob || !/^image\//.test(blob.type || '')) return Promise.reject(new Error('Eso no es una imagen.'));
    return cargarImagen(blob).then(function (img) {
      var lado = MAX_LADO, q = 0.8, imagen = aJpeg(img, lado, q);
      while (imagen.length > MAX_DATAURL && lado > 700) { lado = Math.round(lado * 0.8); q = Math.max(0.6, q - 0.05); imagen = aJpeg(img, lado, q); }
      if (imagen.length > MAX_DATAURL) throw new Error('La imagen es demasiado grande.');
      return { imagen: imagen, miniatura: aJpeg(img, MINI_LADO, 0.6) };
    });
  }

  // ── Subir ────────────────────────────────────────────────
  function limpiarTexto(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

  function escribir(c) {
    var FV = firebase.firestore.FieldValue;
    var meta = {
      email: correo(),
      creadoAt: FV.serverTimestamp(),
      estado: 'pendiente',
      ventaId: limpiarTexto(c.ventaId, 60),
      ventaNumero: limpiarTexto(c.ventaNumero, 30),
      cliente: limpiarTexto(c.cliente, 120),
      medio: limpiarTexto(c.medio, 40),
      valor: Math.max(0, Math.round(Number(c.valor) || 0)),
      nota: limpiarTexto(c.nota, 300),
      miniatura: c.miniatura
    };
    // Lo que leyó la IA del comprobante (domain/comprobante.js): valor,
    // referencia y entidad. La referencia va legible para detectar pagos
    // reciclados (no es un dato personal del cliente).
    var l = c.lectura;
    if (l && l.referencia) meta.referencia = limpiarTexto(l.referencia, 60);
    if (l && l.monto) meta.montoLeido = Math.max(0, Math.round(Number(l.monto) || 0));
    if (l && l.banco) meta.bancoLeido = limpiarTexto(l.banco, 40);
    var img = { email: meta.email, imagen: c.imagen };
    var P = pii();
    var protegido = P
      ? Promise.all([P.protect(COL, c.id, meta, CAMPOS_META), P.protect(COL + '_imagen', c.id, img, CAMPOS_IMG)])
      : Promise.resolve([meta, img]);
    return protegido.then(function (par) {
      var ref = db().collection(COL).doc(c.id);
      var b = db().batch();
      b.set(ref, par[0]);
      b.set(ref.collection('imagen').doc('0'), par[1]);
      return b.commit();
    });
  }

  function leerPend() { try { return JSON.parse(localStorage.getItem(LS_PEND) || '[]'); } catch (e) { return []; } }
  function guardarPend(a) {
    try { localStorage.setItem(LS_PEND, JSON.stringify(a)); return true; }
    catch (e) { return false; } // sin espacio: el aviso lo da subir()
  }

  function subir(datos) {
    if (!db() || !correo()) return Promise.reject(new Error('Inicia sesión para guardar el comprobante.'));
    var c = Object.assign({}, datos, { id: datos.id || nuevoId() });
    return escribir(c).then(function () { avisar(); return c.id; }, function (e) {
      // Sin llave de cifrado: no se guarda nada en texto plano ni se reintenta.
      if (e && e.piiLocked) throw e;
      var p = leerPend();
      p.push(c);
      if (!guardarPend(p)) throw new Error('No se pudo subir el comprobante y no hay espacio para guardarlo en este equipo.');
      avisar();
      var err = new Error('Sin conexión: el comprobante quedó en este equipo y se sube solo.');
      err.enCola = true;
      throw err;
    });
  }

  var _reintentando = false;
  function reintentar() {
    if (_reintentando || !db() || !correo()) return;
    var p = leerPend();
    if (!p.length) return;
    _reintentando = true;
    var quedan = [];
    p.reduce(function (cadena, c) {
      return cadena.then(function () { return escribir(c).catch(function () { quedan.push(c); }); });
    }, Promise.resolve()).then(function () {
      guardarPend(quedan);
      _reintentando = false;
      if (quedan.length !== p.length) avisar();
    });
  }

  // ── Leer ─────────────────────────────────────────────────
  function aMs(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0); }

  function listar() {
    if (!db() || !correo()) return Promise.resolve([]);
    var q = esRevisor()
      ? db().collection(COL).orderBy('creadoAt', 'desc').limit(LIMITE)
      : db().collection(COL).where('email', '==', correo()).limit(LIMITE);
    return q.get().then(function (snap) {
      var docs = [];
      snap.forEach(function (d) { var x = d.data() || {}; x.id = d.id; docs.push(x); });
      var P = pii();
      return Promise.all(docs.map(function (x) { return P ? P.reveal(COL, x.id, x, CAMPOS_META).catch(function () { return x; }) : x; }));
    }).then(function (docs) {
      docs.forEach(function (x) { x.creadoMs = aMs(x.creadoAt); x.revisadoMs = aMs(x.revisadoAt); });
      docs.sort(function (a, b) { return b.creadoMs - a.creadoMs; });
      return docs;
    });
  }

  function imagen(id) {
    return db().collection(COL).doc(id).collection('imagen').doc('0').get().then(function (d) {
      var x = d.exists ? d.data() : null;
      if (!x) throw new Error('No se encontró la imagen.');
      var P = pii();
      return P ? P.reveal(COL + '_imagen', id, x, CAMPOS_IMG) : x;
    }).then(function (x) {
      if (x._piiLocked || !x.imagen) throw new Error('La imagen está cifrada y este equipo no tiene la llave de la empresa.');
      // Solo data URL de imagen con base64: nada que pueda escaparse del src.
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x.imagen)) throw new Error('Imagen no válida.');
      return x.imagen;
    });
  }

  function revisar(id, estado, nota) {
    var FV = firebase.firestore.FieldValue;
    var cambios = { estado: estado, revisadoPor: correo(), revisadoAt: FV.serverTimestamp() };
    if (nota !== undefined) cambios.nota = limpiarTexto(nota, 300);
    return db().collection(COL).doc(id).update(cambios).then(avisar);
  }

  // ── Leer el comprobante con IA ───────────────────────────
  // Una copia más chica de la imagen va al proxy (api/ai.js, perfil 'leer').
  // Si no hay IA (plan, sin conexión, sin configurar), devuelve null y todo
  // sigue a mano.
  function reducir(dataUrl, lado, calidad) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { try { resolve(aJpeg(img, lado, calidad)); } catch (e) { reject(e); } };
      img.onerror = function () { reject(new Error('imagen')); };
      img.src = dataUrl;
    });
  }
  function leer(dataUrl) {
    if (!window.AI || !window.AI.chat || !window.Comprobante || (window.AI.disponible && !window.AI.disponible())) return Promise.resolve(null);
    return reducir(dataUrl, 1100, 0.72).then(function (chica) {
      var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(chica);
      if (!m) return null;
      return window.AI.chat({
        perfil: 'leer', json: true, max_tokens: 300,
        system: window.Comprobante.PROMPT,
        messages: [{ rol: 'usuario', texto: 'Lee este comprobante de pago.', imagen: { mime: m[1], base64: m[2] } }]
      }).then(function (r) { return window.Comprobante.interpretar(r && r.texto); });
    }).catch(function () { return null; });
  }

  // ── Revisiones en vivo ───────────────────────────────────
  // Cuando el jefe aprueba o rechaza, el asesor se entera al instante y la
  // ficha del cliente avanza (evento 'sl:pago-revisado').
  var _estados = {}, _escuchando = false;
  function escuchar() {
    if (_escuchando || !db() || !correo()) return;
    _escuchando = true;
    var q = esRevisor()
      ? db().collection(COL).orderBy('creadoAt', 'desc').limit(60)
      : db().collection(COL).where('email', '==', correo()).limit(60);
    var primera = true;
    q.onSnapshot(function (snap) {
      var cambio = false;
      snap.forEach(function (d) {
        var x = d.data() || {};
        var antes = _estados[d.id];
        _estados[d.id] = x.estado;
        if (!primera && antes !== x.estado) {
          cambio = true;
          if (antes && x.estado !== 'pendiente') {
            document.dispatchEvent(new CustomEvent('sl:pago-revisado', { detail: { id: d.id, estado: x.estado, nota: x.nota || '', ventaNumero: x.ventaNumero || '', ventaId: x.ventaId || '', valor: x.valor || 0, email: x.email || '' } }));
          }
        }
        if (antes === undefined && !primera) cambio = true;
      });
      primera = false;
      if (cambio) avisar();
    }, function () { _escuchando = false; });
  }

  // ── Copiar ───────────────────────────────────────────────
  // El portapapeles de los navegadores acepta PNG, no JPEG: se convierte.
  function copiar(dataUrl) {
    if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error('Este navegador no deja copiar imágenes. Usa Descargar.'));
    var png = new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('No se pudo preparar la imagen.')); }, 'image/png');
      };
      img.onerror = function () { reject(new Error('No se pudo preparar la imagen.')); };
      img.src = dataUrl;
    });
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  }

  document.addEventListener('sl:rol', function () { setTimeout(reintentar, 1500); setTimeout(escuchar, 2000); });
  window.addEventListener('online', reintentar);

  window.Comprobantes = {
    comprimir: comprimir,
    subir: subir,
    listar: listar,
    imagen: imagen,
    revisar: revisar,
    copiar: copiar,
    leer: leer,
    reintentar: reintentar,
    pendientesLocales: function () { return leerPend().length; },
    esRevisor: esRevisor
  };
})();
