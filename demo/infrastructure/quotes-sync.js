// ============================================================
// SYNC DE HISTORIAL DE COTIZACIONES A FIRESTORE
// ============================================================
// El historial local (localStorage 'cotHistory') se sincroniza a la
// colección `user_quotes` (1 doc por cotización, doc ID = id estable
// de newQuoteId). Fuente de verdad: Firestore cuando hay sesión;
// localStorage queda como caché de lectura y buffer offline.
//
//   user_quotes/{quoteId} — { email (dueño), asesor, num, cliente,
//     clienteTel, crmNotas, estado: 'enviada'|'negociando'|'vendida'|
//     'perdida', estadoUpdatedAt, followUpSnoozed (silencia el aviso de
//     "Nd sin respuesta" sin cambiar el estado real), total,
//     date (DD/MM/YYYY), time, dateKey (YYYY-MM-DD), items (slim),
//     priceList, wa, validez, garantia, reteOn, discountOn, discountPct,
//     showIva, createdAt, updatedAt }
//
//   metrics_agg/{YYYY-MM} — { counts: { email: n } }  (ranking mensual;
//     cada cliente solo incrementa SU clave, 1 vez por cotización nueva)
//
// Los campos CRM (estado/clienteTel/crmNotas) SOLO los escriben las
// funciones CRM (pushCrm) — el push de re-guardado usa merge y nunca
// los pisa. Todos los writes son soft-fail (try/catch + console.warn,
// patrón _logQuote): si las reglas no están desplegadas, la app sigue
// funcionando solo-local.
//
// Cifrado (infrastructure/pii-crypto.js): si la empresa lo activó, los datos
// del cliente (PiiCrypto.QUOTE_FIELDS) se cifran antes de cada write y se
// descifran al llegar, así que el resto de la app sigue viendo texto plano.
// Reglas que evitan perder datos:
//   - Sin la llave en este dispositivo NO se sube nada con datos de cliente
//     (la cotización queda local y sube cuando se ingresa la llave).
//   - Una entrada que llegó cifrada y no se pudo descifrar (_piiLocked) tiene
//     esos campos vacíos por falta de llave, no porque estén vacíos: nunca se
//     re-sube, o pisaría el dato real.
//
// Globales que expone (window.*):
//   _mountQuotesSync()  — inicia listener + migración (llamar tras login;
//                         no-op para usuarios Lite: ellos siguen solo-local)
//   _slQuotesSync       — { push, pushCrm, remove, removeAll,
//                           getCloudDocs, fetchAllVendors, findByNum, getById }
//
// Depende de: firebase-auth.js (_slDb, _slAuth, SUPER_ADMINS),
//             storage.js (_ls), services.js (getHist),
//             ui.js (updateHistBadge, renderHist)
// ============================================================
(function(){

  var _mounted = false;
  var _initialDone = false;   // primer snapshot procesado (habilita pushes directos)
  var _email = '';
  var _cloudDocs = [];        // docs de la nube en memoria (recientes primero)
  var _cloudIds = {};         // id → true (¿el próximo push es creación o actualización?)
  var _pendingPush = [];      // pushes que llegan antes del primer snapshot
  var _lastPushHash = {};     // id → JSON del último push (evita writes idénticos)

  var HIST_CACHE_MAX = 80;    // mismo cap que saveHist
  var CLOUD_LIMIT = 200;      // docs que trae el listener del vendedor

  function _db(){ return window._slDb; }
  function _canSync(){
    return _mounted && _db() && window._slAuth && window._slAuth.currentUser && !window._slUserIsLite;
  }
  function _warn(op, e){ console.warn('[qsync] ' + op + ' error:', e && (e.message || e.code || e)); }

  // ─── Cifrado de datos de cliente ──────────────────────────────
  // Si pii-crypto.js no está cargado, un stub que deja todo como estaba.
  var _PII_STUB = {
    init: function(){ return Promise.resolve(); },
    status: function(){ return { enabled: false, ready: false, fingerprint: '' }; },
    onChange: function(){ return function(){}; },
    protect: function(c, i, o){ return Promise.resolve(o); },
    reveal: function(c, i, o){ return Promise.resolve(o); },
    isSealed: function(){ return false; },
    QUOTE_FIELDS: []
  };
  function _pii(){ return window.PiiCrypto || _PII_STUB; }
  // Campos del historial local que corresponden a datos del cliente.
  var PII_HIST_KEYS = ['cliente', 'notas', 'clienteTel', 'crmNotas', 'empresaCliente'];

  function _revealQuote(d){
    return _pii().reveal('user_quotes', d._id, d, _pii().QUOTE_FIELDS).catch(function(e){
      // reveal() no debería fallar (atrapa cada campo), pero si pasa, nunca se
      // deja un sobre cifrado como si fuera el nombre del cliente.
      _warn('reveal', e);
      var x = Object.assign({}, d, { _piiLocked: true });
      PII_HIST_KEYS.forEach(function(k){ if (x[k] !== undefined) x[k] = (k === 'empresaCliente' ? null : ''); });
      return x;
    });
  }

  // Aviso a la UI (ui/cifrado.js lo muestra una vez): sin la llave no se
  // pueden guardar datos de clientes en la nube.
  function _notifyLocked(){
    try { document.dispatchEvent(new CustomEvent('pii:locked', { detail: { source: 'quotes' } })); } catch(e){}
  }

  function _todayKey(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function _monthKey(){ return _todayKey().slice(0, 7); }

  // DD/MM/YYYY → YYYY-MM-DD (mismo formato que la colección `quotes`)
  function _dateKeyFrom(dmy){
    var p = String(dmy || '').split('/');
    if (p.length === 3 && p[2].length === 4) return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
    return _todayKey();
  }

  // ─── Entrada de historial → payload de Firestore ─────────────
  // Cap de 120 items y strings truncados: un doc de Firestore admite
  // máx 1MiB y las cotizaciones nunca deberían acercarse.
  function _slimForCloud(entry){
    var items = (entry.items || []).slice(0, 120).map(function(it){
      var o = {
        sku: it.sku != null ? String(it.sku).slice(0, 80) : null,
        name: String(it.name || '').slice(0, 300),
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        _cat: it._cat || null,
        note: String(it.note || '').slice(0, 300),
        iva: it.iva !== undefined ? !!it.iva : true,
        source: it.source || null
      };
      // Ediciones manuales del desglose de un ENSAMBLADO — acotadas para no
      // inflar el doc (Firestore admite 1MiB por documento).
      if (it._comboEdits) {
        var ce = {};
        Object.keys(it._comboEdits).slice(0, 20).forEach(function(k){
          ce[String(k)] = String(it._comboEdits[k] == null ? '' : it._comboEdits[k]).slice(0, 200);
        });
        o._comboEdits = ce;
      }
      if (it._showComponents) o._showComponents = true;
      return o;
    });
    return {
      num: entry.num != null ? String(entry.num) : '',
      cliente: String(entry.cliente || '').slice(0, 120),
      asesor: String(entry.asesor || '').slice(0, 80),
      // Letra fija asignada por el admin en Usuarios (approved_users →
      // letra) — ver domain.js:quoteDisplayNum. Viaja con cada cotización
      // para que se pueda resolver sin leer approved_users de nadie más.
      letra: String(entry.letra || '').trim().charAt(0).toUpperCase(),
      total: Number(entry.total) || 0,
      date: entry.date || '',
      time: entry.time || '',
      dateKey: _dateKeyFrom(entry.date),
      items: items,
      priceList: entry.priceList || 'store',
      wa: entry.wa || '',
      validez: entry.validez || '',
      garantia: entry.garantia || '12 meses',
      notas: String(entry.notas || '').slice(0, 2000),
      reteOn: !!entry.reteOn,
      discountOn: !!entry.discountOn,
      discountPct: entry.discountPct || 2,
      showIva: entry.showIva !== false,
      // Datos de facturación del modo Empresas (razón social/NIT/contacto/
      // correo/ciudad — ver ui/empresas.js). Sin esto el sync a la nube los
      // descartaba: el próximo _rewriteCache() pisaba cotHistory con la
      // versión "de la nube" (sin estos campos) y el bloque "Dirigida a"
      // quedaba vacío al recargar, aun en el mismo dispositivo.
      empresaCliente: entry.empresaCliente ? {
        razonSocial: String(entry.empresaCliente.razonSocial || '').slice(0, 200),
        nit: String(entry.empresaCliente.nit || '').slice(0, 60),
        contacto: String(entry.empresaCliente.contacto || '').slice(0, 150),
        email: String(entry.empresaCliente.email || '').slice(0, 150),
        ciudad: String(entry.empresaCliente.ciudad || '').slice(0, 100)
      } : null
    };
  }

  // ─── Doc de la nube → entrada de historial local ─────────────
  function _docToHist(d){
    return {
      id: d._id,
      num: d.num, cliente: d.cliente || '', asesor: d.asesor || '', letra: d.letra || '',
      total: d.total || 0, date: d.date || '', time: d.time || '',
      items: d.items || [], priceList: d.priceList || 'store',
      wa: d.wa || '', validez: d.validez || '', garantia: d.garantia || '12 meses',
      notas: d.notas || '',
      reteOn: !!d.reteOn, discountOn: !!d.discountOn, discountPct: d.discountPct || 2,
      showIva: d.showIva !== false,
      empresaCliente: d.empresaCliente || undefined,
      // Campos CRM (F2): viajan en el caché para que el panel los pinte sin leer la nube
      estado: d.estado || 'enviada',
      clienteTel: d.clienteTel || '',
      crmNotas: d.crmNotas || '',
      followUpSnoozed: !!d.followUpSnoozed,
      estadoUpdatedAt: d.estadoUpdatedAt && d.estadoUpdatedAt.toMillis ? d.estadoUpdatedAt.toMillis() : null,
      _updatedMs: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : Date.now(),
      _synced: true // ya vive en la nube — la reconciliación no debe re-subirla
    };
  }

  // Milisegundos aproximados de una entrada (para ordenar el caché).
  // Las de nube traen _updatedMs exacto; las locales se estiman de date/time.
  function _entryMs(x){
    if (x._updatedMs) return x._updatedMs;
    try {
      var p = String(x.date || '').split('/');
      if (p.length !== 3) return 0;
      var ms = new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
      var t = String(x.time || '');
      var m = t.match(/(\d{1,2}):(\d{2})/);
      if (m) {
        var hh = +m[1];
        if (hh <= 12 && /p\.?\s?m/i.test(t)) hh = (hh % 12) + 12;
        else if (hh === 12 && /a\.?\s?m/i.test(t)) hh = 0;
        ms += hh * 3600000 + (+m[2]) * 60000;
      }
      return ms;
    } catch(e){ return 0; }
  }

  // ─── Escritura: entrada local → nube ─────────────────────────
  async function _doPush(entry){
    if (!entry || !entry.id) return;
    // Llegó cifrada y este dispositivo no la pudo abrir: sus datos de cliente
    // están vacíos por falta de llave. Subirla borraría los reales.
    if (entry._piiLocked) return;
    try {
      var data = _slimForCloud(entry);
      var hash = JSON.stringify(data);
      if (_lastPushHash[entry.id] === hash) return; // nada cambió desde el último push
      _lastPushHash[entry.id] = hash;

      try {
        data = await _pii().protect('user_quotes', entry.id, data, _pii().QUOTE_FIELDS);
      } catch(pe){
        delete _lastPushHash[entry.id];
        // Cifrado activo sin llave: no se sube texto plano. Queda local y
        // _migrateLocal la sube cuando se ingrese la llave.
        if (pe && pe.piiLocked) { _notifyLocked(); return; }
        throw pe;
      }

      var FV = firebase.firestore.FieldValue;
      data.email = _email;
      data.updatedAt = FV.serverTimestamp();
      var isNew = !_cloudIds[entry.id];
      if (isNew) {
        // Solo en creación — los pushes posteriores usan merge y no tocan el CRM
        data.estado = 'enviada';
        data.estadoUpdatedAt = FV.serverTimestamp();
        data.createdAt = FV.serverTimestamp();
        _cloudIds[entry.id] = true; // optimista: un re-push inmediato ya no es creación
      }
      await _db().collection('user_quotes').doc(entry.id).set(data, { merge: true });
      if (isNew) _bumpAgg(entry.id);
    } catch(e){ _warn('push', e); }
  }

  // Contador mensual para el ranking (F5). Guard local anti-doble-conteo:
  // los ids ya contados este mes se recuerdan en localStorage.
  async function _bumpAgg(id){
    try {
      var mk = _monthKey();
      var lsKey = 'sl_agg_counted_' + mk;
      var counted = [];
      try { counted = JSON.parse(localStorage.getItem(lsKey) || '[]'); } catch(e){}
      if (counted.indexOf(id) >= 0) return;
      counted.push(id);
      if (counted.length > 500) counted = counted.slice(-500);
      try { localStorage.setItem(lsKey, JSON.stringify(counted)); } catch(e){}
      // set + merge con objeto anidado: la clave email (con puntos) queda
      // literal — no hace falta FieldPath, y merge conserva las demás claves.
      var inc = {};
      inc[_email] = firebase.firestore.FieldValue.increment(1);
      await _db().collection('metrics_agg').doc(mk).set({ counts: inc }, { merge: true });
    } catch(e){ _warn('agg', e); }
  }

  // ─── Backfill de la letra en cotizaciones viejas ──────────────
  // Las guardadas antes de v1.8.4 no llevan `letra`, así que al mostrarlas
  // se cae a la inicial del campo Asesor: "ANDRES RAMIREZ" y
  // "ADMINISTRADOR PLAZA IMPERIAL" salen las dos como "A-66" aunque el
  // admin les haya asignado letras distintas.
  //
  // Cada vendedor rellena las SUYAS, no el admin las de todos: la regla de
  // Firestore deja escribir solo al dueño de cada cotización, así que por
  // este camino no hace falta abrir permisos ni que nadie toque las reglas.
  // Corre solo al entrar; a medida que cada uno abre la app, sus viejas se
  // van poniendo al día.
  //
  // Solo rellena las vacías — nunca pisa una letra ya puesta. El guard de
  // localStorage evita releer el historial completo en cada login, y como
  // incluye la letra, si el admin se la cambia vuelve a correr una vez.
  async function _backfillLetra(){
    var L = String(window._slAsesorLetter || '').trim().toUpperCase().charAt(0);
    if (!L) return;
    var flag = 'sl_letra_backfill_' + L;
    try { if (localStorage.getItem(flag) === '1') return; } catch(e){}
    function marcar(){ try { localStorage.setItem(flag, '1'); } catch(e){} }
    try {
      // Sin orderBy a propósito: con un solo where basta el índice de campo
      // simple que Firestore crea solo, sin pedir uno compuesto nuevo.
      var snap = await _db().collection('user_quotes')
        .where('email', '==', _email).limit(1000).get();
      var pend = snap.docs.filter(function(d){
        var v = (d.data() || {}).letra;
        return !v || !String(v).trim();
      });
      if (!pend.length) { marcar(); return; }
      var total = pend.length;
      while (pend.length) {
        var chunk = pend.splice(0, 400); // tope de operaciones por batch
        var batch = _db().batch();
        chunk.forEach(function(d){ batch.set(d.ref, { letra: L }, { merge: true }); });
        await batch.commit();
      }
      marcar();
      if (typeof window.showToast === 'function') {
        window.showToast('Se les puso la letra "' + L + '" a ' + total + ' cotizaciones tuyas anteriores', 'info');
      }
    } catch(e){ _warn('backfillLetra', e); } // sin marcar: reintenta al próximo login
  }

  // ─── Cifrar lo que quedó en texto plano de antes ──────────────
  // Al activar el cifrado, las cotizaciones viejas siguen legibles en la
  // nube. Cada vendedor cifra las SUYAS al entrar con la llave — misma razón
  // que _backfillLetra: la regla solo deja escribir al dueño. Corre a lo sumo
  // una vez por día por dispositivo, para cubrir también lo que haya escrito
  // en claro alguna pestaña que seguía con la versión vieja de la app abierta.
  async function _sealLegacy(){
    var P = _pii();
    var st = P.status();
    if (!st.enabled || !st.ready) return;
    var flag = 'sl_pii_legacy_' + st.fingerprint;
    try {
      if (Date.now() - (+(localStorage.getItem(flag) || 0)) < 86400000) return;
    } catch(e){}
    try {
      var snap = await _db().collection('user_quotes')
        .where('email', '==', _email).limit(1000).get();
      var pend = [];
      for (var i = 0; i < snap.docs.length; i++) {
        var doc = snap.docs[i];
        var d = doc.data() || {};
        var sealed = await P.protect('user_quotes', doc.id, d, P.QUOTE_FIELDS);
        var patch = {};
        PII_HIST_KEYS.forEach(function(k){ if (sealed[k] !== d[k]) patch[k] = sealed[k]; });
        if (Object.keys(patch).length) pend.push({ ref: doc.ref, patch: patch });
      }
      var total = pend.length;
      while (pend.length) {
        var chunk = pend.splice(0, 400); // tope de operaciones por batch
        var batch = _db().batch();
        chunk.forEach(function(p){ batch.set(p.ref, p.patch, { merge: true }); });
        await batch.commit();
      }
      try { localStorage.setItem(flag, String(Date.now())); } catch(e){}
      if (total && typeof window.showToast === 'function') {
        window.showToast('Se cifraron los datos de clientes de ' + total + ' cotizaciones tuyas anteriores', 'info');
      }
    } catch(e){ _warn('sealLegacy', e); } // sin marcar: reintenta al próximo login
  }

  // ─── Caché local: nube + entradas solo-locales ────────────────
  function _rewriteCache(){
    try {
      if (typeof _ls === 'undefined' || typeof getHist !== 'function') return;
      var inCloud = {};
      _cloudDocs.forEach(function(d){ inCloud[d._id] = 1; });
      var local = getHist();
      var localById = {};
      local.forEach(function(x){ if (x && x.id) localById[x.id] = x; });
      var localOnly = local.filter(function(x){
        if (!x) return false;
        if (!x.id) return true;          // formato viejo sin id: no se puede sincronizar
        if (inCloud[x.id]) return false; // ya viene de la nube (la versión nube manda)
        return !x._synced;               // _synced pero ya no está en nube → borrada remota
      });
      var merged = localOnly.concat(_cloudDocs.map(function(d){
        var h = _docToHist(d);
        if (d._piiLocked) {
          // Llegó cifrada y este dispositivo no tiene la llave. Si hay copia
          // local en claro (de antes, en este mismo dispositivo) se conserva;
          // si no, queda marcada para que nadie la abra ni la re-guarde vacía.
          var loc = localById[d._id];
          if (loc && !loc._piiLocked) {
            PII_HIST_KEYS.forEach(function(k){ if (loc[k] !== undefined) h[k] = loc[k]; });
          } else {
            h._piiLocked = true;
          }
        }
        return h;
      }));
      merged.sort(function(a, b){ return _entryMs(b) - _entryMs(a); });
      if (merged.length > HIST_CACHE_MAX) merged = merged.slice(0, HIST_CACHE_MAX);
      merged.forEach(function(x){ delete x._origIdx; });
      _ls.setJSON(histKey(), merged);

      if (typeof updateHistBadge === 'function') updateHistBadge();
      if (typeof updateFollowBadge === 'function') updateFollowBadge();
      var hp = document.getElementById('hpanel');
      if (hp && hp.classList.contains('on') && typeof renderHist === 'function') renderHist();
    } catch(e){ _warn('cache', e); }
  }

  // ─── Reconciliación local → nube ──────────────────────────────
  // Sube toda entrada local con id que no esté en la nube y no haya
  // estado nunca sincronizada (_synced). Cubre la migración inicial
  // Y lo cotizado offline con la pestaña cerrada. Idempotente por id.
  function _migrateLocal(){
    try {
      if (typeof getHist !== 'function') return;
      getHist().forEach(function(x){
        if (x && x.id && !_cloudIds[x.id] && !x._synced) _doPush(x);
      });
    } catch(e){ _warn('migrate', e); }
  }

  // ─── API pública ──────────────────────────────────────────────
  window._slQuotesSync = {
    /** Llamado desde saveHist — sube/actualiza la cotización en la nube. */
    push: function(entry){
      if (!_canSync() || !entry || !entry.id) return;
      if (!_initialDone) { _pendingPush.push(entry); return; } // aún no sabemos qué hay en la nube
      _doPush(entry);
    },

    /** Actualiza SOLO los campos CRM de una cotización (estado/tel/notas). */
    pushCrm: async function(id, fields){
      if (!_canSync() || !id || !fields) return;
      try {
        var FV = firebase.firestore.FieldValue;
        var data = { email: _email, updatedAt: FV.serverTimestamp() };
        if (fields.estado !== undefined)     { data.estado = String(fields.estado); data.estadoUpdatedAt = FV.serverTimestamp(); }
        if (fields.followUpSnoozed !== undefined) data.followUpSnoozed = !!fields.followUpSnoozed;
        var crm = {};
        if (fields.clienteTel !== undefined) crm.clienteTel = String(fields.clienteTel).slice(0, 40);
        if (fields.crmNotas !== undefined)   crm.crmNotas = String(fields.crmNotas).slice(0, 500);
        if (Object.keys(crm).length) {
          try {
            crm = await _pii().protect('user_quotes', id, crm, _pii().QUOTE_FIELDS);
            Object.keys(crm).forEach(function(k){ data[k] = crm[k]; });
          } catch(pe){
            if (!(pe && pe.piiLocked)) throw pe;
            // Sin llave: el estado sí se guarda; teléfono y notas no, porque
            // irían en texto plano.
            _notifyLocked();
          }
        }
        if (Object.keys(data).length <= 2) return; // solo email+updatedAt: no hay nada que guardar
        await _db().collection('user_quotes').doc(id).set(data, { merge: true });
      } catch(e){ _warn('pushCrm', e); }
    },

    remove: async function(id){
      if (!_canSync() || !id) return;
      try {
        await _db().collection('user_quotes').doc(id).delete();
        delete _cloudIds[id];
        delete _lastPushHash[id];
      } catch(e){ _warn('remove', e); }
    },

    /** Borra TODAS las cotizaciones propias de la nube (para clearHistory). */
    removeAll: async function(){
      if (!_canSync()) return;
      try {
        var snap = await _db().collection('user_quotes').where('email', '==', _email).get();
        var docs = snap.docs.slice();
        while (docs.length) {
          var chunk = docs.splice(0, 400);
          var batch = _db().batch();
          chunk.forEach(function(d){ batch.delete(d.ref); });
          await batch.commit();
        }
        _cloudIds = {}; _cloudDocs = []; _lastPushHash = {};
      } catch(e){ _warn('removeAll', e); }
    },

    /** Docs de la nube en memoria (para stats — 0 lecturas extra). */
    getCloudDocs: function(){ return _cloudDocs.slice(); },

    /**
     * Últimas cotizaciones de TODOS los vendedores (one-shot) — vista
     * admin "Todos los vendedores" en Historial, y respaldo de
     * lookupQuoteForUpdate (ui.js) cuando el número buscado no está en
     * el historial propio. Necesita la regla de FIRESTORE_RULES_CRM.md
     * que abre lectura de user_quotes a todo el equipo aprobado (antes
     * era solo admin) — si esa regla no está publicada, Firestore
     * deniega y esto se resuelve como lista vacía.
     */
    fetchAllVendors: async function(limit){
      var snap = await _db().collection('user_quotes')
        .orderBy('updatedAt', 'desc').limit(limit || 200).get();
      return Promise.all(snap.docs.map(function(d){ var x = d.data() || {}; x._id = d.id; return _revealQuote(x); }));
    },

    /**
     * Cotizaciones por su NÚMERO visible, sin importar la antigüedad.
     * Existe porque las otras dos vías tienen ventana corta: el historial
     * local guarda 80 entradas y fetchAllVendors trae las 200 más
     * recientes — una cotización de hace meses (ej. la #20 cuando el
     * consecutivo ya va en 300) no está en ninguna de las dos y se
     * reportaba como "no encontrada" aunque siguiera en la nube.
     * Consulta directa por el campo `num`, así que la lee sin importar
     * cuántas se hayan hecho después y sin traerse el historial entero.
     *
     * `num` se guarda como string (ver _slimForCloud), pero documentos
     * viejos pueden tenerlo como número — se piden ambos tipos en la
     * misma consulta para no perder esos.
     *
     * A diferencia de los otros métodos, este SÍ propaga el error: al
     * caller le sirve distinguir "no existe" de "las reglas de Firestore
     * no dejan leer cotizaciones de otros" (ver FIRESTORE_RULES_CRM.md).
     */
    findByNum: async function(num, limit){
      if (!_canSync() || num == null || num === '') return [];
      var s = String(num).trim();
      if (!s) return [];
      var vals = [s];
      var n = parseInt(s, 10);
      if (!isNaN(n)) {
        if (String(n) !== s) vals.push(String(n)); // "020" guardado como "20"
        vals.push(n);                              // guardado como número
      }
      var snap = await _db().collection('user_quotes')
        .where('num', 'in', vals.slice(0, 10)).limit(limit || 25).get();
      return Promise.all(snap.docs.map(function(d){ var x = d.data() || {}; x._id = d.id; return _revealQuote(x); }));
    },

    /**
     * Una cotización por su id interno (QR de la cabecera — ver
     * quote-qr.js). Lectura directa por doc id: mismas reglas que
     * fetchAllVendors — si no están publicadas, Firestore deniega la
     * lectura de cotizaciones ajenas y esto devuelve null (mismo
     * tratamiento que "no encontrada").
     */
    getById: async function(id){
      if (!_canSync() || !id) return null;
      try {
        var doc = await _db().collection('user_quotes').doc(String(id)).get();
        if (!doc.exists) return null;
        var x = doc.data() || {}; x._id = doc.id;
        return await _revealQuote(x);
      } catch(e){ _warn('getById', e); return null; }
    }
  };

  // ─── Montaje (idempotente, llamado tras login aprobado) ───────
  window._mountQuotesSync = function(){
    if (_mounted) return;
    if (!window._slDb || !window._slAuth || !window._slAuth.currentUser) return;
    if (window._slUserIsLite) return; // Lite sigue 100% local — sin listeners ni writes
    _email = (window._slAuth.currentUser.email || '').toLowerCase().trim();
    if (!_email) return;
    _mounted = true;

    // El cifrado arranca antes que el listener: reveal() y protect() esperan
    // a saber si está activo, así nunca se sube texto plano "por si acaso".
    _pii().init();

    // Si cambia el estado del cifrado (se ingresó la llave en este
    // dispositivo, o el admin lo activó), se vuelve a procesar lo que ya
    // llegó y se sube lo que había quedado esperando la llave.
    _pii().onChange(function(st){
      if (_lastRaw) _ingest(_lastRaw);
      if (st && st.ready && _initialDone) { _migrateLocal(); _sealLegacy(); }
    });

    // Listener del propio vendedor. Requiere índice compuesto
    // user_quotes(email ASC, updatedAt DESC) — Firestore da el link
    // de creación en la consola si falta.
    _db().collection('user_quotes')
      .where('email', '==', _email)
      .orderBy('updatedAt', 'desc')
      .limit(CLOUD_LIMIT)
      .onSnapshot(function(snap){
        var raw = [];
        snap.forEach(function(doc){
          var d = doc.data() || {};
          d._id = doc.id;
          raw.push(d);
          // Sincrónico a propósito: mientras se descifra, un push de esta
          // cotización no puede creerse "creación" y resetear su estado CRM.
          _cloudIds[doc.id] = true;
        });
        _lastRaw = raw;
        _ingest(raw);
      }, function(err){
        _warn('listener', err);
      });
  };

  // Descifra un snapshot y recién ahí lo aplica. Descifrar es asíncrono: si
  // llega un snapshot más nuevo mientras tanto, el viejo se descarta para no
  // pisar datos frescos con datos viejos.
  var _lastRaw = null;
  var _ingestSeq = 0;
  async function _ingest(raw){
    var seq = ++_ingestSeq;
    var docs = await Promise.all(raw.map(_revealQuote));
    if (seq !== _ingestSeq) return;
    _cloudDocs = docs;
    if (!_initialDone) {
      _initialDone = true;
      _migrateLocal();                          // sube lo local que falte en la nube
      _pendingPush.splice(0).forEach(_doPush);  // y lo que se cotizó mientras cargaba
      _backfillLetra();                         // pone la letra en las viejas que no la tienen
      _sealLegacy();                            // cifra las viejas en claro, si hay llave
    }
    _rewriteCache();
  }
})();
