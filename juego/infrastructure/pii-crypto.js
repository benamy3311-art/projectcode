// ============================================================
// CIFRADO DE DATOS DE CLIENTES (cifrado en el navegador)
// ============================================================
// Los datos personales de los clientes finales (nombre, NIT, teléfono,
// correo, ciudad, notas y la foto de las recogidas) se cifran en el
// navegador ANTES de salir hacia Firestore. En la base queda texto
// ilegible: ni el proveedor de la app, ni Google, ni quien tenga acceso a
// la consola de Firebase puede leerlos. Solo los dispositivos que tienen la
// llave de la empresa.
//
// Cómo funciona:
//   - La llave la GENERA la app (160 bits aleatorios) cuando el administrador
//     activa el cifrado, y se le muestra una sola vez para que la guarde. No
//     se admiten contraseñas elegidas a mano: con una contraseña débil, quien
//     tenga la base podría adivinarla probando; con 160 bits aleatorios, no.
//   - De esa llave se deriva con HKDF-SHA256 una llave AES-GCM de 256 bits.
//     Cada campo se cifra con su propio IV aleatorio y con "datos adicionales
//     autenticados" (colección/documento#campo): un valor cifrado no se puede
//     mover a otro campo ni a otro documento sin que el descifrado falle.
//   - En Firestore (config/encryption) solo se guarda lo público: la sal, una
//     "prueba" cifrada para validar que una llave ingresada es la correcta, y
//     una huella corta para comparar dispositivos. Nada de eso permite
//     reconstruir la llave.
//   - En cada dispositivo la llave derivada se guarda en IndexedDB como
//     CryptoKey NO exportable: ni el propio código de la página puede leer
//     sus bytes, solo usarla para cifrar y descifrar.
//
// Apagado por defecto: mientras config/encryption no exista, protect() y
// reveal() devuelven los datos tal cual y la app se comporta como siempre.
//
// Qué NO protege (dicho sin rodeos): el código lo sirve el proveedor, así
// que un código modificado podría llevarse la llave del navegador. Protege
// la base de datos, no un despliegue comprometido. Para eso está que cada
// empresa grande tenga su propia instancia.
//
// Globales que expone (window.*):
//   PiiCrypto.init()                      — arranca (idempotente; tras login)
//   PiiCrypto.status()                    — { initialized, enabled, ready, fingerprint, error }
//   PiiCrypto.onChange(cb)                — avisa cambios de estado; devuelve unsubscribe
//   PiiCrypto.protect(col, id, obj, spec) — cifra los campos de spec (o lanza si falta la llave)
//   PiiCrypto.reveal(col, id, obj, spec)  — descifra; sin llave deja '' y marca _piiLocked
//   PiiCrypto.unlock(textoLlave)          — valida y guarda la llave en este dispositivo
//   PiiCrypto.prepareEnable()             — genera llave nueva; .commit() la activa para la empresa
//   PiiCrypto.forgetDevice()              — borra la llave de este dispositivo
//   PiiCrypto.QUOTE_FIELDS, REM_FIELDS    — qué campos se cifran en cada colección
//
// Depende de: firebase-auth.js (window._slDb) para config/encryption.
//   Las primitivas criptográficas (PiiCrypto._core) no dependen de nada.
// Requiere DOM: ninguno.
// ============================================================
(function () {
  'use strict';

  var PREFIX_TXT = 'pcenc:1:';   // pcenc:1:<iv>:<ct>
  var PREFIX_BIN = 'pcenc:1b:';  // pcenc:1b:<mime>:<iv>:<ct>  (imágenes)
  var CHECK_PLAINTEXT = 'projectcode-key-check-v1';
  var CHECK_AAD = 'config/encryption#check';
  var HKDF_INFO_AES = 'projectcode/pii/aes-gcm/v1';
  var HKDF_INFO_FP = 'projectcode/pii/fingerprint/v1';
  var SECRET_BYTES = 20;         // 160 bits → 32 caracteres base32
  var LS_CFG = 'pc_pii_cfg';     // último estado conocido de config/encryption
  var IDB_NAME = 'pc_pii';
  var IDB_STORE = 'keys';
  var INIT_TIMEOUT_MS = 8000;

  // Campos cifrados por colección. Productos, totales, estado, fechas y los
  // datos del vendedor quedan legibles: no son datos personales del cliente
  // y las métricas y consultas los necesitan.
  var QUOTE_FIELDS = [
    { path: 'cliente' },
    { path: 'notas' },
    { path: 'clienteTel' },
    { path: 'crmNotas' },
    { path: 'empresaCliente.razonSocial' },
    { path: 'empresaCliente.nit' },
    { path: 'empresaCliente.contacto' },
    { path: 'empresaCliente.email' },
    { path: 'empresaCliente.ciudad' }
  ];
  var REM_FIELDS = [
    { path: 'cliente' },
    { path: 'telefono' },
    { path: 'productos' },
    { path: 'notas' },
    { path: 'imagen', bin: true }
  ];

  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  // ── Codificaciones ────────────────────────────────────────
  function b64u(bytes) {
    var bin = '';
    var CH = 0x8000; // en tramos: fromCharCode.apply con arrays grandes revienta la pila
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unb64u(str) {
    var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Base32 de Crockford: sin I, L, O ni U, para que la llave se pueda dictar
  // o copiar a mano sin confundir 0/O ni 1/I/L.
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function toBase32(bytes) {
    var out = '', buffer = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      buffer = (buffer << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += B32[(buffer >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
    return out;
  }

  function fromBase32(str) {
    var s = String(str || '').toUpperCase()
      .replace(/[\s-]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');
    var out = [], buffer = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B32.indexOf(s[i]);
      if (v < 0) throw friendlyError('La llave tiene caracteres que no corresponden.');
      buffer = (buffer << 5) | v;
      bits += 5;
      if (bits >= 8) {
        out.push((buffer >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  function formatSecret(bytes) {
    return toBase32(bytes).match(/.{1,4}/g).join('-');
  }

  function parseSecret(text) {
    var clean = String(text || '').toUpperCase().replace(/[\s-]/g, '');
    if (clean.length !== 32) {
      throw friendlyError('La llave tiene que tener 32 caracteres (8 grupos de 4).');
    }
    var bytes = fromBase32(clean);
    if (bytes.length !== SECRET_BYTES) throw friendlyError('La llave no tiene el formato correcto.');
    return bytes;
  }

  function friendlyError(msg) {
    var e = new Error(msg);
    e.friendly = true;
    return e;
  }

  function randomBytes(n) {
    var b = new Uint8Array(n);
    // getRandomValues acepta hasta 65.536 bytes por llamada (lo dice el
    // estándar y el navegador lo hace cumplir): se llena por tramos.
    for (var i = 0; i < n; i += 65536) {
      crypto.getRandomValues(b.subarray(i, Math.min(i + 65536, n)));
    }
    return b;
  }

  // ── Derivación de llaves ──────────────────────────────────
  // HKDF y no PBKDF2: la llave ya tiene 160 bits aleatorios, no hace falta
  // una derivación lenta. La lentitud solo compensa secretos adivinables, y
  // justamente por eso no se admiten.
  async function hkdfBase(secretBytes) {
    return subtle.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey', 'deriveBits']);
  }

  async function deriveAesKey(secretBytes, saltBytes) {
    var base = await hkdfBase(secretBytes);
    return subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: enc.encode(HKDF_INFO_AES) },
      base,
      { name: 'AES-GCM', length: 256 },
      false, // NO exportable
      ['encrypt', 'decrypt']
    );
  }

  async function deriveFingerprint(secretBytes, saltBytes) {
    var base = await hkdfBase(secretBytes);
    var bits = new Uint8Array(await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: enc.encode(HKDF_INFO_FP) },
      base, 32
    ));
    var hex = '';
    for (var i = 0; i < bits.length; i++) hex += ('0' + bits[i].toString(16)).slice(-2);
    hex = hex.toUpperCase();
    return hex.slice(0, 4) + '-' + hex.slice(4, 8);
  }

  // ── Sobres cifrados ───────────────────────────────────────
  function isSealed(v) {
    return typeof v === 'string' && (v.indexOf(PREFIX_TXT) === 0 || v.indexOf(PREFIX_BIN) === 0);
  }

  async function sealText(key, text, aad) {
    var iv = randomBytes(12);
    var ct = new Uint8Array(await subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: enc.encode(aad) },
      key, enc.encode(String(text))
    ));
    return PREFIX_TXT + b64u(iv) + ':' + b64u(ct);
  }

  async function openText(key, envelope, aad) {
    if (String(envelope).indexOf(PREFIX_TXT) !== 0) throw new Error('No es un sobre de texto');
    var parts = String(envelope).slice(PREFIX_TXT.length).split(':');
    if (parts.length !== 2) throw new Error('Sobre mal formado');
    var pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: unb64u(parts[0]), additionalData: enc.encode(aad) },
      key, unb64u(parts[1])
    );
    return dec.decode(pt);
  }

  // Las imágenes se cifran como BYTES, no como la cadena "data:...base64".
  // Cifrar la cadena y volver a pasarla a base64 la agranda un 33%: una foto
  // de 900 KB (el tope que ya aplica remisiones.js) quedaría en 1,2 MB y
  // Firestore rechaza documentos de más de 1 MiB. Así queda del mismo tamaño.
  // El tipo de imagen viaja en claro dentro del sobre (hace falta para armar el
  // data URL), así que tiene que estar AUTENTICADO: va dentro de los datos
  // adicionales de AES-GCM. Sin eso, alguien sin la llave podía cambiar
  // "image/jpeg" por un texto con comillas y atributos, el descifrado seguía
  // funcionando y ese texto terminaba dentro de un src. Además solo se aceptan
  // tipos de imagen conocidos, al cifrar y al descifrar.
  var MIME_OK = /^image\/(png|jpeg|jpg|gif|webp)$/;

  function binAad(aad, mime) {
    return enc.encode(String(aad) + '|mime=' + mime);
  }

  async function sealBytes(key, bytes, mime, aad) {
    var m = String(mime || '').toLowerCase();
    if (!MIME_OK.test(m)) throw new Error('Tipo de archivo no permitido para cifrar: ' + m.slice(0, 40));
    var iv = randomBytes(12);
    var ct = new Uint8Array(await subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: binAad(aad, m) },
      key, bytes
    ));
    return PREFIX_BIN + m + ':' + b64u(iv) + ':' + b64u(ct);
  }

  async function openBytes(key, envelope, aad) {
    if (String(envelope).indexOf(PREFIX_BIN) !== 0) throw new Error('No es un sobre binario');
    var parts = String(envelope).slice(PREFIX_BIN.length).split(':');
    if (parts.length !== 3) throw new Error('Sobre mal formado');
    if (!MIME_OK.test(parts[0])) throw new Error('Tipo de archivo no permitido en el sobre');
    var pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: unb64u(parts[1]), additionalData: binAad(aad, parts[0]) },
      key, unb64u(parts[2])
    );
    return { mime: parts[0], bytes: new Uint8Array(pt) };
  }

  function dataUrlToBytes(dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(String(dataUrl));
    if (!m || !m[2]) return null; // solo data URLs en base64
    var bin = atob(m[3]);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return { mime: m[1] || 'application/octet-stream', bytes: out };
  }

  function bytesToDataUrl(mime, bytes) {
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return 'data:' + mime + ';base64,' + btoa(bin);
  }

  // ── Rutas de campos (copy-on-write) ───────────────────────
  // No se clona el objeto entero: los payloads llevan centinelas de Firestore
  // (FieldValue.serverTimestamp) que un clon JSON rompería. Solo se copian los
  // objetos del camino que se modifica; el resto conserva sus referencias.
  function getPath(obj, path) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPathCow(obj, path, value) {
    var parts = path.split('.');
    var root = Object.assign({}, obj);
    var cur = root;
    for (var i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = Object.assign({}, cur[parts[i]] || {});
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return root;
  }

  function aadFor(col, id, path) {
    return String(col) + '/' + String(id) + '#' + path;
  }

  // Versiones puras, con la llave explícita (son las que se prueban).
  async function protectWithKey(key, col, id, obj, spec) {
    var out = obj;
    for (var i = 0; i < spec.length; i++) {
      var f = spec[i];
      var v = getPath(out, f.path);
      if (v == null || v === '' || isSealed(v)) continue;
      var aad = aadFor(col, id, f.path);
      var sealed;
      if (f.bin) {
        var parsed = dataUrlToBytes(v);
        // No es una imagen en data URL de un tipo permitido: se deja como está.
        // La app nunca genera eso (las fotos se recomprimen a JPEG) y la vista
        // no lo dibuja (ver _imgSrc en remisiones.js).
        if (!parsed || !MIME_OK.test(String(parsed.mime).toLowerCase())) continue;
        sealed = await sealBytes(key, parsed.bytes, parsed.mime, aad);
      } else {
        sealed = await sealText(key, v, aad);
      }
      out = setPathCow(out, f.path, sealed);
    }
    return out;
  }

  async function revealWithKey(key, col, id, obj, spec) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = obj;
    var locked = false;
    for (var i = 0; i < spec.length; i++) {
      var f = spec[i];
      var v = getPath(out, f.path);
      if (!isSealed(v)) continue; // texto plano viejo o vacío: tal cual
      if (!key) { out = setPathCow(out, f.path, ''); locked = true; continue; }
      try {
        var aad = aadFor(col, id, f.path);
        var plain;
        if (v.indexOf(PREFIX_BIN) === 0) {
          var r = await openBytes(key, v, aad);
          plain = bytesToDataUrl(r.mime, r.bytes);
        } else {
          plain = await openText(key, v, aad);
        }
        out = setPathCow(out, f.path, plain);
      } catch (e) {
        // Llave equivocada o dato alterado: se trata igual que "sin llave".
        // Nunca se muestra el sobre crudo ni se deja re-guardar el documento.
        out = setPathCow(out, f.path, '');
        locked = true;
      }
    }
    if (locked) {
      out = Object.assign({}, out);
      out._piiLocked = true;
    }
    return out;
  }

  // ── IndexedDB: la llave de este dispositivo ───────────────
  function projectId() {
    try {
      if (window.firebase && firebase.apps && firebase.apps.length) return firebase.app().options.projectId || 'default';
    } catch (e) { }
    return 'default';
  }

  function idb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('Sin IndexedDB')); return; }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbTx(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, mode);
        var store = tx.objectStore(IDB_STORE);
        var result;
        Promise.resolve(fn(store)).then(function (r) { result = r; });
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function idbGet(id) {
    return idbTx('readonly', function (store) {
      return new Promise(function (resolve) {
        var r = store.get(id);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function idbPut(rec) {
    return idbTx('readwrite', function (store) { store.put(rec); });
  }

  function idbDelete(id) {
    return idbTx('readwrite', function (store) { store.delete(id); }).catch(function () { });
  }

  // ── Estado ────────────────────────────────────────────────
  var _cfg = { enabled: false, salt: '', check: '', fingerprint: '' };
  // Si el cifrado está activo lo dice SOLO la configuración (config/encryption,
  // que únicamente crea el admin y nadie modifica) o su copia local. Nunca los
  // datos: una versión anterior "fallaba cerrado" al ver cualquier campo con el
  // prefijo pcenc:, y como cualquier vendedor puede escribir un documento con
  // ese texto, una sola recogida falsa bloqueaba la sincronización de todos los
  // equipos de la empresa, para siempre.
  var _key = null;
  var _deviceRec = null;
  var _error = null;
  var _initialized = false;
  var _initPromise = null;
  var _listeners = [];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  function notify() {
    var s = status();
    _listeners.slice().forEach(function (cb) { try { cb(s); } catch (e) { console.warn('[pii]', e); } });
  }

  function status() {
    return {
      initialized: _initialized,
      enabled: !!_cfg.enabled,
      ready: !!_key && !!_cfg.enabled,
      fingerprint: _cfg.fingerprint || '',
      error: _error
    };
  }

  function applyConfig(data) {
    var d = data || {};
    _cfg = {
      enabled: !!d.enabled,
      salt: d.salt || '',
      check: d.check || '',
      fingerprint: d.fingerprint || ''
    };
    // Recordar lo último que se supo: si la próxima carga arranca sin red,
    // igual se sabe que el cifrado está activo y no se sube texto plano.
    lsSet(LS_CFG, JSON.stringify(_cfg));
    // La llave del dispositivo se usa si es de ESTA configuración. Si la
    // configuración desapareció (alguien borró config/encryption), se sigue
    // usando para DESCIFRAR lo que ya está cifrado: borrar la configuración no
    // puede volver ilegibles los datos. protect() igual deja de cifrar,
    // porque exige enabled.
    if (_deviceRec && (!_cfg.enabled || _deviceRec.fingerprint === _cfg.fingerprint)) {
      _key = _deviceRec.key;
    } else {
      _key = null;
    }
  }

  function init() {
    if (_initPromise) return _initPromise;
    _initPromise = new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        _initialized = true;
        resolve(status());
        notify();
      }

      // Estado conocido de antes (por si Firestore tarda o no hay red).
      try {
        var cached = JSON.parse(lsGet(LS_CFG) || 'null');
        if (cached) _cfg = cached;
      } catch (e) { }
      // Marca de la heurística vieja (ver arriba): se borra si quedó de una
      // versión de desarrollo, para que no deje un dispositivo bloqueado.
      try { localStorage.removeItem('pc_pii_seen'); } catch (e) { }

      idbGet(projectId()).then(function (rec) {
        _deviceRec = rec;
        applyConfig(_cfg); // misma regla que con config fresca de Firestore

        var db = window._slDb;
        if (!db) { finish(); return; }
        db.collection('config').doc('encryption').onSnapshot(function (snap) {
          _error = null;
          applyConfig(snap.exists ? snap.data() : null);
          if (!done) finish(); else notify();
        }, function (err) {
          // Sin permiso de lectura: se sigue con lo último conocido. Ver
          // FIRESTORE_RULES_CIFRADO.md — sin esa regla, un dispositivo nuevo
          // no puede enterarse de que el cifrado está activo.
          _error = (err && err.code) || 'error';
          console.warn('[pii] no se pudo leer config/encryption:', _error);
          finish();
        });
      });

      setTimeout(finish, INIT_TIMEOUT_MS);
    });
    return _initPromise;
  }

  function whenInitialized() {
    return _initPromise || Promise.resolve(status());
  }

  function lockedError() {
    var e = friendlyError('Los datos de clientes están cifrados y este dispositivo no tiene la llave de la empresa.');
    e.piiLocked = true;
    return e;
  }

  async function protect(col, id, obj, spec) {
    await whenInitialized();
    if (!_cfg.enabled) return obj;
    if (!_key) throw lockedError();
    return protectWithKey(_key, col, id, obj, spec);
  }

  // Descifrar no cambia ningún estado global: lo que traiga un documento (que
  // puede haber escrito cualquiera) solo afecta a ese documento.
  async function reveal(col, id, obj, spec) {
    await whenInitialized();
    return revealWithKey(_key, col, id, obj, spec);
  }

  async function unlock(text) {
    await whenInitialized();
    if (!_cfg.enabled || !_cfg.salt || !_cfg.check) throw friendlyError('El cifrado no está activado para esta empresa.');
    var secret = parseSecret(text);
    var salt = unb64u(_cfg.salt);
    var key = await deriveAesKey(secret, salt);
    var ok = false;
    try { ok = (await openText(key, _cfg.check, CHECK_AAD)) === CHECK_PLAINTEXT; } catch (e) { ok = false; }
    if (!ok) throw friendlyError('Esa llave no corresponde a la de esta empresa.');
    var fp = await deriveFingerprint(secret, salt);
    _deviceRec = { id: projectId(), key: key, fingerprint: fp, savedAt: Date.now() };
    try { await idbPut(_deviceRec); } catch (e) {
      console.warn('[pii] la llave queda solo en memoria (sin IndexedDB):', e && e.message);
    }
    _key = key;
    notify();
    return status();
  }

  // Dos pasos a propósito: prepareEnable() genera la llave y la devuelve para
  // mostrarla, SIN escribir nada. Recién commit(), cuando el administrador
  // confirmó que la guardó, la activa para toda la empresa. Si cancela, no
  // pasó nada.
  async function prepareEnable() {
    await whenInitialized();
    var secret = randomBytes(SECRET_BYTES);
    var salt = randomBytes(16);
    var key = await deriveAesKey(secret, salt);
    var check = await sealText(key, CHECK_PLAINTEXT, CHECK_AAD);
    var fp = await deriveFingerprint(secret, salt);
    var text = formatSecret(secret);
    secret.fill(0); // los bytes crudos no se quedan en memoria

    return {
      secretText: text,
      fingerprint: fp,
      commit: async function (byEmail) {
        var db = window._slDb;
        if (!db) throw friendlyError('Sin conexión con la base de datos.');
        var ref = db.collection('config').doc('encryption');
        // Transacción: si ya hay cifrado activo NO se pisa. Pisarlo cambiaría
        // la sal y dejaría ilegible todo lo que ya se cifró.
        await db.runTransaction(async function (t) {
          var snap = await t.get(ref);
          if (snap.exists && snap.data() && snap.data().enabled) {
            throw friendlyError('El cifrado ya estaba activado para esta empresa.');
          }
          t.set(ref, {
            enabled: true,
            v: 1,
            salt: b64u(salt),
            check: check,
            fingerprint: fp,
            enabledBy: String(byEmail || ''),
            enabledAt: (window.firebase && firebase.firestore) ? firebase.firestore.FieldValue.serverTimestamp() : Date.now()
          });
        });
        _deviceRec = { id: projectId(), key: key, fingerprint: fp, savedAt: Date.now() };
        try { await idbPut(_deviceRec); } catch (e) { }
        applyConfig({ enabled: true, salt: b64u(salt), check: check, fingerprint: fp });
        notify();
        return status();
      }
    };
  }

  async function forgetDevice() {
    await idbDelete(projectId());
    _deviceRec = null;
    _key = null;
    notify();
  }

  function onChange(cb) {
    _listeners.push(cb);
    return function () { _listeners = _listeners.filter(function (x) { return x !== cb; }); };
  }

  window.PiiCrypto = {
    init: init,
    status: status,
    onChange: onChange,
    protect: protect,
    reveal: reveal,
    unlock: unlock,
    prepareEnable: prepareEnable,
    forgetDevice: forgetDevice,
    isSealed: isSealed,
    QUOTE_FIELDS: QUOTE_FIELDS,
    REM_FIELDS: REM_FIELDS,
    // Primitivas puras, expuestas para los tests.
    _core: {
      toBase32: toBase32, fromBase32: fromBase32, formatSecret: formatSecret, parseSecret: parseSecret,
      deriveAesKey: deriveAesKey, deriveFingerprint: deriveFingerprint,
      sealText: sealText, openText: openText, sealBytes: sealBytes, openBytes: openBytes,
      dataUrlToBytes: dataUrlToBytes, bytesToDataUrl: bytesToDataUrl,
      getPath: getPath, setPathCow: setPathCow,
      protectWithKey: protectWithKey, revealWithKey: revealWithKey,
      randomBytes: randomBytes, b64u: b64u, unb64u: unb64u,
      CHECK_PLAINTEXT: CHECK_PLAINTEXT, CHECK_AAD: CHECK_AAD
    }
  };
})();
