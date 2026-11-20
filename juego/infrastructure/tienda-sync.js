// ============================================================
// TIENDA — envío de la cola al servidor
// ============================================================
// Todo cambio de la tienda (venta, anulación, movimiento de inventario,
// cliente, producto) queda en la cola «outbox» de tienda-db.js en la MISMA
// transacción que el cambio. Este archivo la vacía hacia el servidor cuando
// haya uno: en orden, por lotes, con reintentos que esperan cada vez más, y
// marcando cada registro como enviado solo cuando el servidor lo confirma.
//
// Hoy no hay servidor contratado: sin adaptador configurado, la cola
// simplemente se acumula (y se puede ver cuántos registros esperan). Nada se
// pierde por eso: los datos ya están guardados localmente.
//
// Contrato del adaptador (TIENDA_DATOS.md tiene el detalle del servidor):
//   adaptador.enviar(lote) → Promise<{ aceptados: [id...], rechazados: [{id, error}] }>
//   - lote: registros de la cola { id, tipo, entidadId, payload, creado }
//   - El servidor DEBE tratar `id` como llave de idempotencia: si recibe un
//     id que ya procesó, responde aceptado sin aplicarlo otra vez.
//   - Un registro rechazado se reintenta en el siguiente ciclo; los
//     aceptados no vuelven a enviarse.
//
// Datos personales: antes de salir del navegador, los datos de clientes
// deben pasar por PiiCrypto.protect() si la tienda tiene el cifrado activo
// (regla del proyecto, CLAUDE.md). El adaptador HTTP de abajo lo hace con la
// opción `proteger`.
//
// Globales que expone (window.*):
//   TiendaSync.iniciar(db), .configurarAdaptador(a), .sincronizarAhora(), .estado()
//   TiendaSync.adaptadorHTTP({ url, token, proteger })
// Depende de: infrastructure/tienda-db.js
// ============================================================
(function (root) {
  'use strict';

  var LOTE = 50;
  var ESPERA_MIN = 15000;      // 15 s
  var ESPERA_MAX = 10 * 60000; // 10 min

  var db = null, adaptador = null, enCurso = false, espera = ESPERA_MIN, temporizador = null;
  var estado = { pendientes: 0, ultimoEnvio: null, ultimoError: '', conServidor: false };
  var oyentes = [];

  function avisar() { oyentes.forEach(function (fn) { try { fn(Object.assign({}, estado)); } catch (_) {} }); }
  function programar(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizarAhora, ms);
  }

  function actualizarConteo() {
    if (!db) return Promise.resolve();
    return db.contarPendientes().then(function (n) { estado.pendientes = n; avisar(); });
  }

  function sincronizarAhora() {
    if (!db || enCurso) return Promise.resolve(estado);
    if (!adaptador) return actualizarConteo().then(function () { return estado; });
    if (root.navigator && root.navigator.onLine === false) { programar(espera); return Promise.resolve(estado); }
    enCurso = true;
    return db.pendientes(LOTE).then(function (lote) {
      if (!lote.length) return { aceptados: [], rechazados: [] };
      return adaptador.enviar(lote.map(function (r) { return { id: r.id, tipo: r.tipo, entidadId: r.entidadId, payload: r.payload, creado: r.creado }; }));
    }).then(function (res) {
      var aceptados = (res && res.aceptados) || [];
      var rechazados = (res && res.rechazados) || [];
      return db.marcarEnviados(aceptados).then(function () {
        return Promise.all(rechazados.map(function (r) { return db.marcarError(r.id, r.error); }));
      }).then(function () {
        estado.ultimoEnvio = aceptados.length ? Date.now() : estado.ultimoEnvio;
        estado.ultimoError = rechazados.length ? String(rechazados[0].error || 'Rechazado por el servidor') : '';
        espera = rechazados.length ? Math.min(espera * 2, ESPERA_MAX) : ESPERA_MIN;
        // Si el lote vino lleno, puede haber más: seguir pronto.
        return aceptados.length === LOTE ? 500 : espera;
      });
    }, function (err) {
      estado.ultimoError = String(err && err.message || err || 'Sin conexión con el servidor');
      espera = Math.min(espera * 2, ESPERA_MAX);
      return espera;
    }).then(function (siguiente) {
      enCurso = false;
      programar(siguiente);
      return actualizarConteo().then(function () { return estado; });
    });
  }

  function iniciar(base) {
    db = base;
    db.alCambiar(function (tipo) { if (tipo !== 'sync') { actualizarConteo(); if (adaptador) programar(1500); } });
    if (root.addEventListener) root.addEventListener('online', function () { espera = ESPERA_MIN; sincronizarAhora(); });
    return sincronizarAhora();
  }

  function configurarAdaptador(a) {
    if (a && typeof a.enviar !== 'function') throw new Error('El adaptador necesita una función enviar(lote).');
    adaptador = a || null;
    estado.conServidor = !!adaptador;
    espera = ESPERA_MIN;
    avisar();
    return sincronizarAhora();
  }

  // Adaptador para un servidor HTTP propio (cuando se contrate). Envía el
  // lote como JSON; cada registro lleva su id como llave de idempotencia.
  // Respuesta esperada: { aceptados: [ids], rechazados: [{ id, error }] }.
  function adaptadorHTTP(opciones) {
    if (!opciones || !opciones.url) throw new Error('Falta la URL del servidor.');
    return {
      enviar: function (lote) {
        var preparar = opciones.proteger ? Promise.all(lote.map(opciones.proteger)) : Promise.resolve(lote);
        var token = opciones.token ? Promise.resolve(opciones.token()) : Promise.resolve('');
        return Promise.all([preparar, token]).then(function (r) {
          var headers = { 'Content-Type': 'application/json' };
          if (r[1]) headers.Authorization = 'Bearer ' + r[1];
          return fetch(opciones.url, { method: 'POST', headers: headers, body: JSON.stringify({ registros: r[0] }) });
        }).then(function (resp) {
          if (!resp.ok) throw new Error('El servidor respondió ' + resp.status);
          return resp.json();
        });
      }
    };
  }

  root.TiendaSync = {
    iniciar: iniciar,
    configurarAdaptador: configurarAdaptador,
    sincronizarAhora: sincronizarAhora,
    estado: function () { return Object.assign({}, estado); },
    alCambiar: function (fn) { oyentes.push(fn); },
    adaptadorHTTP: adaptadorHTTP
  };
})(typeof window !== 'undefined' ? window : globalThis);
