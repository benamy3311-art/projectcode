// ============================================================
// CARGA DE "MI EMPRESA" — config/empresa en Firestore
// ============================================================
// Trae la configuración de la empresa (domain/empresa.js) y la aplica a toda
// la app: cálculo de cotizaciones (domain.js), ventas (domain/tienda.js) y
// pantallas. Se guarda una copia en el navegador para que el primer cálculo
// al abrir ya use la de la empresa, sin esperar a Firestore.
//
// Leer: cualquier usuario aprobado. Escribir: jefe o admin (firestore.rules,
// match /config/empresa).
//
// Globales que expone (window.*):
//   EmpresaConfig.guardar(cfg)  — Promise; valida, guarda y aplica
//   EmpresaConfig.cargada()     — ¿ya llegó de Firestore?
//   EmpresaConfig.guardarEnvios(cfg) — Promise; tarifas de envío (config/envios)
// Eventos: 'sl:empresa' y 'sl:envios' en document cada vez que cambian.
//
// Depende de: domain/empresa.js (Empresa), domain/tienda.js (Tienda),
//             firebase-auth.js (_slDb, _slAuth, evento sl:rol),
//             ui.js (renderUI), opcional
// ============================================================
(function () {
  'use strict';

  var LS = 'pc_empresa_cfg';
  var LS_ENV = 'pc_envios_cfg';
  var _cargada = false;
  var _escuchando = false;

  function leerCache() {
    try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
  }
  function escribirCache(cfg) {
    try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* sin almacenamiento: se usa la de Firestore igual */ }
  }

  function aplicar(raw) {
    if (!window.Empresa) return;
    var c = window.Empresa.usar(raw);
    if (window.Tienda && window.Tienda.configurar) {
      window.Tienda.configurar({ mediosPago: c.mediosPago, tasaIva: window.Empresa.tarifaIva() });
    }
    document.dispatchEvent(new CustomEvent('sl:empresa', { detail: c }));
    // Repintar la cotización abierta con el IVA nuevo (sin romper si la UI
    // todavía no terminó de cargar).
    try { if (typeof window.renderUI === 'function' && document.getElementById('itemsList')) window.renderUI(); } catch (e) {}
  }

  // ── Envíos (domain/envio.js) ─────────────────────────────
  function aplicarEnvios(raw) {
    if (!window.Envio) return;
    var c = window.Envio.usar(raw);
    document.dispatchEvent(new CustomEvent('sl:envios', { detail: c }));
  }
  function cacheEnvios(cfg) { try { if (cfg) localStorage.setItem(LS_ENV, JSON.stringify(cfg)); else localStorage.removeItem(LS_ENV); } catch (e) {} }

  function guardarEnvios(cfg) {
    if (!window._slDb || !window.Envio) return Promise.reject(new Error('Sin conexión con la base de datos.'));
    var u = window._slAuth && window._slAuth.currentUser;
    var data = window.Envio.paraGuardar(cfg);
    data.actualizadoPor = u ? String(u.email || '').toLowerCase() : '';
    data.actualizadoAt = firebase.firestore.FieldValue.serverTimestamp();
    return window._slDb.collection('config').doc('envios').set(data).then(function () {
      var limpio = window.Envio.paraGuardar(cfg);
      cacheEnvios(limpio);
      aplicarEnvios(limpio);
    });
  }

  function escuchar() {
    if (_escuchando || !window._slDb) return;
    _escuchando = true;
    window._slDb.collection('config').doc('envios').onSnapshot(function (snap) {
      var d = snap.exists ? snap.data() : null;
      cacheEnvios(d && window.Envio ? window.Envio.paraGuardar(d) : null);
      aplicarEnvios(d);
    }, function (err) { console.warn('[empresa] no se pudo leer config/envios:', err && (err.code || err.message)); });
    window._slDb.collection('config').doc('empresa').onSnapshot(function (snap) {
      var d = snap.exists ? snap.data() : null;
      _cargada = true;
      if (d) escribirCache(window.Empresa.paraGuardar(d)); else { try { localStorage.removeItem(LS); } catch (e) {} }
      aplicar(d);
    }, function (err) {
      // Reglas sin publicar o sin permiso: se queda la copia local o la de fábrica.
      console.warn('[empresa] no se pudo leer config/empresa:', err && (err.code || err.message));
    });
  }

  function guardar(cfg) {
    var E = window.Empresa;
    var v = E.validar(cfg);
    if (!v.ok) return Promise.reject(Object.assign(new Error(v.errores[0]), { errores: v.errores }));
    if (!window._slDb) return Promise.reject(new Error('Sin conexión con la base de datos.'));
    var u = window._slAuth && window._slAuth.currentUser;
    var data = E.paraGuardar(cfg);
    data.actualizadoPor = u ? String(u.email || '').toLowerCase() : '';
    data.actualizadoAt = firebase.firestore.FieldValue.serverTimestamp();
    return window._slDb.collection('config').doc('empresa').set(data).then(function () {
      var limpio = E.paraGuardar(cfg);
      escribirCache(limpio);
      aplicar(limpio);
    });
  }

  // Primero la copia local (instantáneo); después, la de Firestore al
  // confirmarse que la cuenta está aprobada (firebase-auth.js → sl:rol).
  aplicar(leerCache());
  try { aplicarEnvios(JSON.parse(localStorage.getItem(LS_ENV) || 'null')); } catch (e) { aplicarEnvios(null); }
  document.addEventListener('sl:rol', escuchar);

  window.EmpresaConfig = { guardar: guardar, guardarEnvios: guardarEnvios, cargada: function () { return _cargada; } };
})();
