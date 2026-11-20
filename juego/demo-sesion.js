// ============================================================
// SESIÓN DE DEMO — la app real, sin servidor
// ============================================================
// Lo carga SOLO la copia de demostración que arma tools/exportar-demo.mjs
// para la página comercial (projectcode/demo/). Nunca se carga en la app
// publicada: index.html no lo referencia.
//
// - Reemplaza Firebase: una sesión de ejemplo aprobada (Pro, con IA) y un
//   Firestore en memoria "en vivo": lo que se guarda aparece en las listas,
//   los oyentes (onSnapshot) se enteran de cada cambio, y entiende where,
//   orderBy, limit, increment y la hora del servidor. No habla con nadie.
// - /api/ai responde con la misma respuesta de prueba de api/ai.js
//   (AI_STUB); el juego (juego.js) puede contestar la lectura de
//   comprobantes y la respuesta sugerida.
// - /api/facturar responde en modo de prueba, como el servidor sin activar.
// - Modo juego (?juego o window.PC_JUEGO): arranca el día desde cero.
// - Salta la presentación inicial y marca la página como demo.
// ============================================================
(function () {
  if (window.firebase) return;

  var JUEGO = !!window.PC_JUEGO || /[?&]juego\b/.test(location.search);
  window.PC_JUEGO = JUEGO;

  try {
    if (JUEGO) {
      // Un día nuevo: nada de partidas anteriores (solo en el origen de la demo)
      var guia = localStorage.getItem('pc_juego_guia');
      localStorage.clear();
      if (guia !== null) localStorage.setItem('pc_juego_guia', guia);
      try { sessionStorage.clear(); } catch (e) {}
      if (window.indexedDB) indexedDB.deleteDatabase('projectcode-tienda');
    }
    localStorage.setItem('sl_asesor_personal', '1');
    localStorage.setItem('sl_asesor', localStorage.getItem('sl_asesor') || 'ANA');
    localStorage.setItem('sl_tour_done', '1');
  } catch (e) {}
  document.documentElement.classList.add('modo-demo');

  // Marcas de FieldValue: se resuelven al escribir
  var INC = '__demoInc', UNION = '__demoUnion', QUITAR = '__demoQuitar', BORRAR = '__demoBorrar', AHORA = '__demoAhora';

  // ── Hora del servidor (con toMillis, como Firestore) ─────
  function TS(ms) { ms = Number(ms) || Date.now(); return { seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: function () { return ms; }, toDate: function () { return new Date(ms); }, valueOf: function () { return ms; } }; }
  function esTS(v) { return v && typeof v === 'object' && typeof v.toMillis === 'function'; }
  function valor(v) { return esTS(v) ? v.toMillis() : (v instanceof Date ? +v : v); }
  function clon(v) {
    if (v == null || typeof v !== 'object' || esTS(v)) return v;
    if (v instanceof Date) return TS(+v);
    if (Array.isArray(v)) return v.map(clon);
    if (AHORA in v) return TS(Date.now());
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = clon(v[k]); });
    return o;
  }

  function aplicar(base, cambios) {
    var out = Object.assign({}, base || {});
    Object.keys(cambios || {}).forEach(function (k) {
      var v = cambios[k];
      if (v && typeof v === 'object' && !esTS(v)) {
        if (INC in v) { out[k] = (Number(out[k]) || 0) + v[INC]; return; }
        if (UNION in v) { var a = Array.isArray(out[k]) ? out[k].slice() : []; v[UNION].forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); out[k] = a; return; }
        if (QUITAR in v) { out[k] = (Array.isArray(out[k]) ? out[k] : []).filter(function (x) { return v[QUITAR].indexOf(x) < 0; }); return; }
        if (BORRAR in v) { delete out[k]; return; }
        if (AHORA in v) { out[k] = TS(Date.now()); return; }
      }
      out[k] = clon(v);
    });
    return out;
  }

  // ── Firestore en memoria ─────────────────────────────────
  var USER = { email: 'asesor@tutienda.co', displayName: 'Ana Norte', uid: 'demo', photoURL: '', getIdToken: function () { return Promise.resolve('demo'); } };
  var mem = {};
  var oyentes = {};   // ruta de colección → [fn]
  var oyentesDoc = {}; // ruta de documento → [fn]
  function padre(ruta) { return ruta.slice(0, ruta.lastIndexOf('/')); }
  function avisar(ruta) {
    setTimeout(function () {
      (oyentes[padre(ruta)] || []).slice().forEach(function (f) { f(); });
      (oyentesDoc[ruta] || []).slice().forEach(function (f) { f(); });
    }, 15);
  }

  function datos(ruta) {
    if (mem[ruta]) return mem[ruta];
    if (/^approved_users\//.test(ruta)) return { premium: true, ia: true, letra: 'A', sede: 'Sede Norte', nombre: USER.displayName.split(' ')[0], rol: 'asesor' };
    if (/^legal|terms|legal_acceptances/.test(ruta)) return { version: 999, aceptado: true };
    return null;
  }
  function snapDoc(ruta) {
    var d = datos(ruta), id = ruta.split('/').pop();
    return { id: id, exists: !!d, data: function () { return d ? clon(d) : undefined; }, get: function (k) { return d ? clon(d[k]) : undefined; }, ref: docRef(ruta) };
  }

  function cumple(d, f) {
    var v = valor(d[f.campo]), w = valor(f.valor);
    switch (f.op) {
      case '==': return v === w;
      case '!=': return v !== w;
      case '>': return v > w;
      case '>=': return v >= w;
      case '<': return v < w;
      case '<=': return v <= w;
      case 'in': return Array.isArray(w) && w.indexOf(v) >= 0;
      case 'array-contains': return Array.isArray(d[f.campo]) && d[f.campo].indexOf(f.valor) >= 0;
      default: return true;
    }
  }
  function resultados(ruta, spec) {
    var docs = Object.keys(mem).filter(function (k) { return padre(k) === ruta; }).map(function (k) { return { id: k.slice(ruta.length + 1), ruta: k, d: mem[k] }; });
    docs = docs.filter(function (x) { return spec.filtros.every(function (f) { return cumple(x.d, f); }); });
    if (spec.orden.length) {
      docs.sort(function (a, b) {
        for (var i = 0; i < spec.orden.length; i++) {
          var o = spec.orden[i], va = valor(a.d[o.campo]), vb = valor(b.d[o.campo]);
          if (va === vb) continue;
          if (va === undefined) return 1;
          if (vb === undefined) return -1;
          return (va < vb ? -1 : 1) * (o.dir === 'desc' ? -1 : 1);
        }
        return 0;
      });
    }
    if (spec.limite) docs = docs.slice(0, spec.limite);
    if (spec.ultimos) docs = docs.slice(-spec.ultimos);
    return docs;
  }
  function snapQuery(ruta, spec, previos) {
    var lista = resultados(ruta, spec);
    var docs = lista.map(function (x) { return snapDoc(x.ruta); });
    var ids = lista.map(function (x) { return x.id; });
    var cambios = [];
    if (previos) {
      lista.forEach(function (x, i) { cambios.push({ type: previos.indexOf(x.id) < 0 ? 'added' : 'modified', doc: docs[i] }); });
      previos.forEach(function (id) { if (ids.indexOf(id) < 0) cambios.push({ type: 'removed', doc: { id: id, exists: false, data: function () { return undefined; } } }); });
    } else {
      docs.forEach(function (d) { cambios.push({ type: 'added', doc: d }); });
    }
    return { snap: { empty: !docs.length, size: docs.length, docs: docs, forEach: function (f) { docs.forEach(f); }, docChanges: function () { return cambios; } }, ids: ids };
  }
  function query(ruta, spec) {
    spec = spec || { filtros: [], orden: [], limite: 0, ultimos: 0 };
    var con = function (cambio) { var s = { filtros: spec.filtros.slice(), orden: spec.orden.slice(), limite: spec.limite, ultimos: spec.ultimos }; cambio(s); return query(ruta, s); };
    var q = {
      where: function (campo, op, v) { return con(function (s) { s.filtros.push({ campo: campo, op: op, valor: v }); }); },
      orderBy: function (campo, dir) { return con(function (s) { s.orden.push({ campo: campo, dir: dir || 'asc' }); }); },
      limit: function (n) { return con(function (s) { s.limite = n; }); },
      limitToLast: function (n) { return con(function (s) { s.ultimos = n; }); },
      startAfter: function () { return q; },
      get: function () { return Promise.resolve(snapQuery(ruta, spec).snap); },
      onSnapshot: function (cb, err) {
        var fn = typeof cb === 'function' ? cb : cb.next;
        var previos = null, vivo = true;
        var correr = function () { if (!vivo) return; var r = snapQuery(ruta, spec, previos); previos = r.ids; try { fn(r.snap); } catch (e) { console.error(e); } };
        (oyentes[ruta] = oyentes[ruta] || []).push(correr);
        setTimeout(correr, 30);
        return function () { vivo = false; oyentes[ruta] = (oyentes[ruta] || []).filter(function (f) { return f !== correr; }); };
      },
      doc: function (id) { return docRef(ruta + '/' + (id || ('auto' + Math.random().toString(36).slice(2, 12)))); },
      add: function (v) { var r = ruta + '/auto' + Math.random().toString(36).slice(2, 12); mem[r] = aplicar({}, v); avisar(r); return Promise.resolve(docRef(r)); }
    };
    return q;
  }
  function docRef(ruta) {
    return {
      id: ruta.split('/').pop(), path: ruta,
      get: function () { return Promise.resolve(snapDoc(ruta)); },
      set: function (v, o) { mem[ruta] = aplicar(o && o.merge ? (mem[ruta] || {}) : {}, v); avisar(ruta); return Promise.resolve(); },
      update: function (v) { mem[ruta] = aplicar(mem[ruta] || {}, v); avisar(ruta); return Promise.resolve(); },
      delete: function () { delete mem[ruta]; avisar(ruta); return Promise.resolve(); },
      onSnapshot: function (cb) {
        var fn = typeof cb === 'function' ? cb : cb.next, vivo = true;
        var correr = function () { if (vivo) fn(snapDoc(ruta)); };
        (oyentesDoc[ruta] = oyentesDoc[ruta] || []).push(correr);
        setTimeout(correr, 30);
        return function () { vivo = false; };
      },
      collection: function (c) { return query(ruta + '/' + c); }
    };
  }
  var db = {
    collection: function (c) { return query(c); }, doc: function (r) { return docRef(r); },
    batch: function () {
      var ops = [];
      var b = { set: function (r, v, o) { ops.push(function () { return r.set(v, o); }); return b; }, update: function (r, v) { ops.push(function () { return r.update(v); }); return b; }, delete: function (r) { ops.push(function () { return r.delete(); }); return b; }, commit: function () { ops.forEach(function (f) { f(); }); return Promise.resolve(); } };
      return b;
    },
    runTransaction: function (fn) { return fn({ get: function (r) { return r.get(); }, set: function (r, v, o) { r.set(v, o); }, update: function (r, v) { r.update(v); }, delete: function (r) { r.delete(); } }); },
    enablePersistence: function () { return Promise.resolve(); }, settings: function () {}
  };
  var auth = {
    currentUser: USER,
    onAuthStateChanged: function (cb) { setTimeout(function () { cb(USER); }, 50); return function () {}; },
    signInWithPopup: function () { return Promise.resolve({ user: USER }); },
    getRedirectResult: function () { return Promise.resolve({ user: null }); },
    signInWithRedirect: function () { return Promise.resolve(); },
    signOut: function () { return Promise.resolve(); },
    setPersistence: function () { return Promise.resolve(); }
  };
  var firestore = function () { return db; };
  firestore.FieldValue = {
    serverTimestamp: function () { var o = {}; o[AHORA] = 1; return o; },
    increment: function (n) { var o = {}; o[INC] = Number(n) || 0; return o; },
    arrayUnion: function () { var o = {}; o[UNION] = [].slice.call(arguments); return o; },
    arrayRemove: function () { var o = {}; o[QUITAR] = [].slice.call(arguments); return o; },
    delete: function () { var o = {}; o[BORRAR] = 1; return o; }
  };
  firestore.Timestamp = { now: function () { return TS(Date.now()); }, fromDate: function (d) { return TS(+d); }, fromMillis: function (ms) { return TS(ms); } };
  var authFn = function () { return auth; };
  authFn.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; this.addScope = function () {}; };
  authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  window.firebase = { initializeApp: function () { return {}; }, apps: [{}], app: function () { return {}; }, auth: authFn, firestore: firestore };
  // Para el juego: la hora de Firestore y el usuario de la demo
  window.PC_DEMO = { TS: TS, usuario: USER };

  // ── Servidor de prueba: /api/ai y /api/facturar ──────────
  function json(r, ms) { return new Promise(function (ok) { setTimeout(function () { ok(new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })); }, ms || 400); }); }
  var fetchReal = window.fetch;
  window.fetch = function (url, op) {
    if (typeof url === 'string' && /\/api\/ai(\?|$)/.test(url)) {
      var p = {};
      try { p = JSON.parse((op && op.body) || '{}'); } catch (e) {}
      var msgs = p.messages || [], ultimo = msgs[msgs.length - 1] || {};
      // El juego sabe qué dice cada comprobante y qué conviene responder
      if (p.perfil === 'leer' && window.PC_JUEGO_IA && window.PC_JUEGO_IA.leer) return json({ texto: JSON.stringify(window.PC_JUEGO_IA.leer()), llamadas: [], fin: 'fin', uso: { entrada: 0, salida: 0 }, modelo: 'demo' }, 900);
      if (p.perfil === 'texto' && window.PC_JUEGO_IA && window.PC_JUEGO_IA.sugerir) return json({ texto: window.PC_JUEGO_IA.sugerir(String(ultimo.texto || '')), llamadas: [], fin: 'fin', uso: { entrada: 0, salida: 0 }, modelo: 'demo' }, 700);
      var r;
      if (ultimo.rol === 'herramienta') {
        var prods = (ultimo.resultado || {}).productos || [];
        r = { texto: prods.length ? 'Esto es lo que hay en el catálogo:\n' + prods.slice(0, 3).map(function (x) { return '- ' + x.nombre + ' (SKU ' + x.sku + ')'; }).join('\n') : 'No encontré nada así en el catálogo de la tienda.', llamadas: [], fin: 'fin', uso: { entrada: 0, salida: 0 }, modelo: 'demo' };
      } else {
        r = { texto: '', llamadas: [{ id: 'demo-1', nombre: 'buscar_productos', args: { consulta: String(ultimo.texto || '').slice(0, 80) } }], fin: 'herramientas', uso: { entrada: 0, salida: 0 }, modelo: 'demo' };
      }
      return json(r, 600);
    }
    if (typeof url === 'string' && /\/api\/facturar(\?|$)/.test(url)) {
      var F = window.FacturaElectronica;
      if (!op || !op.method || op.method === 'GET') return json({ proveedor: 'alegra', modo: 'prueba', listo: false }, 200);
      var fac = {};
      try { fac = JSON.parse(op.body).factura; } catch (e) {}
      var ids = { clienteId: '(id del cliente)', itemId: '(ítem genérico)', impuestos: { 19: '(id IVA 19 %)' }, numeracionId: '(numeración DIAN)' };
      return json({ ok: true, modo: 'prueba', proveedor: 'alegra', contacto: F ? F.contactoAlegra(fac) : {}, cuerpo: F ? F.paraAlegra(fac, ids) : {} }, 600);
    }
    return fetchReal.apply(this, arguments);
  };

  // ── Aviso discreto: es una demo ──
  document.addEventListener('DOMContentLoaded', function () {
    if (/cuadre\.html$/.test(location.pathname)) return; // va dentro de la app: el aviso ya está fuera
    if (JUEGO) return; // el juego tiene su propio tablero
    var a = document.createElement('div');
    a.className = 'aviso-demo';
    a.textContent = 'Demo con datos de ejemplo · nada sale de tu navegador';
    document.body.appendChild(a);
  });
})();
