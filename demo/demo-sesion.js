// ============================================================
// SESIÓN DE DEMO — la app real, sin servidor
// ============================================================
// Lo carga SOLO la copia de demostración que arma tools/exportar-demo.mjs
// para la página comercial (projectcode/demo/). Nunca se carga en la app
// publicada: index.html no lo referencia.
//
// - Reemplaza Firebase: una sesión de ejemplo aprobada (Pro, con IA),
//   Firestore vacío y en memoria. No habla con ningún servidor.
// - /api/ai responde con la misma respuesta de prueba de api/ai.js
//   (AI_STUB): busca en el catálogo de ejemplo sin llamar a un modelo.
// - Salta la presentación inicial y marca la página como demo.
// ============================================================
(function () {
  if (window.firebase) return;

  try {
    localStorage.setItem('sl_asesor_personal', '1');
    localStorage.setItem('sl_asesor', 'ANA');
    localStorage.setItem('sl_tour_done', '1');
  } catch (e) {}
  document.documentElement.classList.add('modo-demo');

  // ── Firebase de mentira ───────────────────────────────────
  var USER = { email: 'asesor@tutienda.co', displayName: 'Ana Norte', uid: 'demo', photoURL: '', getIdToken: function () { return Promise.resolve('demo'); } };
  var mem = {};
  function datos(ruta) {
    if (mem[ruta]) return mem[ruta];
    if (/^approved_users\//.test(ruta)) return { premium: true, ia: true, letra: 'A', sede: 'Sede Norte', nombre: 'Ana' };
    if (/^legal|terms|legal_acceptances/.test(ruta)) return { version: 999, aceptado: true };
    return null;
  }
  function snapDoc(ruta) {
    var d = datos(ruta), id = ruta.split('/').pop();
    return { id: id, exists: !!d, data: function () { return d ? JSON.parse(JSON.stringify(d)) : undefined; }, get: function (k) { return d ? d[k] : undefined; }, ref: docRef(ruta) };
  }
  function snapQuery() { return { empty: true, size: 0, docs: [], forEach: function () {}, docChanges: function () { return []; } }; }
  function query(ruta) {
    var q = {
      where: function () { return q; }, orderBy: function () { return q; }, limit: function () { return q; }, startAfter: function () { return q; }, limitToLast: function () { return q; },
      get: function () { return Promise.resolve(snapQuery()); },
      onSnapshot: function (cb) { setTimeout(function () { (typeof cb === 'function' ? cb : cb.next)(snapQuery()); }, 30); return function () {}; },
      doc: function (id) { return docRef(ruta + '/' + (id || ('auto' + Math.random().toString(36).slice(2)))); },
      add: function (v) { var r = ruta + '/auto' + Math.random().toString(36).slice(2); mem[r] = v; return Promise.resolve(docRef(r)); }
    };
    return q;
  }
  function docRef(ruta) {
    return {
      id: ruta.split('/').pop(), path: ruta,
      get: function () { return Promise.resolve(snapDoc(ruta)); },
      set: function (v, o) { mem[ruta] = Object.assign(o && o.merge ? (mem[ruta] || {}) : {}, v); return Promise.resolve(); },
      update: function (v) { mem[ruta] = Object.assign(mem[ruta] || {}, v); return Promise.resolve(); },
      delete: function () { delete mem[ruta]; return Promise.resolve(); },
      onSnapshot: function (cb) { setTimeout(function () { (typeof cb === 'function' ? cb : cb.next)(snapDoc(ruta)); }, 30); return function () {}; },
      collection: function (c) { return query(ruta + '/' + c); }
    };
  }
  var db = {
    collection: function (c) { return query(c); }, doc: function (r) { return docRef(r); },
    batch: function () { var b = { set: function () { return b; }, update: function () { return b; }, delete: function () { return b; }, commit: function () { return Promise.resolve(); } }; return b; },
    runTransaction: function (fn) { return fn({ get: function (r) { return r.get(); }, set: function () {}, update: function () {} }); },
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
  firestore.FieldValue = { serverTimestamp: function () { return new Date(); }, increment: function (n) { return n; }, arrayUnion: function () { return []; }, arrayRemove: function () { return []; }, delete: function () { return null; } };
  firestore.Timestamp = { now: function () { var d = new Date(); return { toDate: function () { return d; }, toMillis: function () { return +d; }, seconds: Math.floor(d / 1000) }; }, fromDate: function (d) { return { toDate: function () { return d; }, toMillis: function () { return +d; } }; } };
  var authFn = function () { return auth; };
  authFn.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; this.addScope = function () {}; };
  authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  window.firebase = { initializeApp: function () { return {}; }, apps: [{}], app: function () { return {}; }, auth: authFn, firestore: firestore };

  // ── /api/ai de prueba (misma lógica que respuestaDePrueba en api/ai.js) ──
  var fetchReal = window.fetch;
  window.fetch = function (url, op) {
    if (typeof url === 'string' && /\/api\/ai(\?|$)/.test(url)) {
      var p = {};
      try { p = JSON.parse((op && op.body) || '{}'); } catch (e) {}
      var msgs = p.messages || [], ultimo = msgs[msgs.length - 1] || {};
      var r;
      if (ultimo.rol === 'herramienta') {
        var prods = (ultimo.resultado || {}).productos || [];
        r = { texto: prods.length ? 'Esto es lo que hay en el catálogo:\n' + prods.slice(0, 3).map(function (x) { return '- ' + x.nombre + ' (SKU ' + x.sku + ')'; }).join('\n') : 'No encontré nada así en el catálogo de la tienda.', llamadas: [], fin: 'fin', uso: { entrada: 0, salida: 0 }, modelo: 'demo' };
      } else {
        r = { texto: '', llamadas: [{ id: 'demo-1', nombre: 'buscar_productos', args: { consulta: String(ultimo.texto || '').slice(0, 80) } }], fin: 'herramientas', uso: { entrada: 0, salida: 0 }, modelo: 'demo' };
      }
      return new Promise(function (ok) { setTimeout(function () { ok(new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } })); }, 600); });
    }
    return fetchReal.apply(this, arguments);
  };

  // ── Aviso discreto: es una demo ──
  document.addEventListener('DOMContentLoaded', function () {
    var a = document.createElement('div');
    a.className = 'aviso-demo';
    a.textContent = 'Demo con datos de ejemplo · nada sale de tu navegador';
    document.body.appendChild(a);
  });
})();
