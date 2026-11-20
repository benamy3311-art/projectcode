// ============================================================
// CLIENTE DEL PROXY DE IA — infrastructure/ai-provider.js
// ============================================================
// Todo lo que la app le pide a un modelo pasa por acá, y de acá sale a
// /api/ai (ver api/ai.js). En el navegador no hay ninguna key ni el nombre de
// ningún proveedor: cambiar de modelo es una variable de entorno en Vercel.
//
// Globales que expone (window.*):
//   AI.chat({ perfil, system, messages, tools, max_tokens, json, signal, onRetry })
//        -> { texto, llamadas: [{id, nombre, args}], fin, uso, modelo }
//        perfil: 'chat' (por defecto) | 'texto' | 'armar'. Cada uno puede
//        apuntar a otro proveedor desde las variables de entorno (api/ai.js).
//   AI.disponible()  — hay sesión para poder llamar
//
// El formato de messages es el de api/ai.js:
//   { rol: 'usuario', texto }
//   { rol: 'asistente', texto, llamadas }
//   { rol: 'herramienta', id, nombre, resultado }
//
// Depende de: firebase-auth.js (window._slAuth) para el ID token.
// Requiere DOM: nada.
// ============================================================
(function () {
  'use strict';

  var RUTA = '/api/ai';
  var TIEMPO_MAXIMO = 90000; // 90 s: un armado con varias búsquedas tarda

  function sesion() {
    try { return (window._slAuth && window._slAuth.currentUser) || null; } catch (e) { return null; }
  }

  function token() {
    var u = sesion();
    if (!u || typeof u.getIdToken !== 'function') return Promise.resolve('');
    return u.getIdToken().catch(function () { return ''; });
  }

  function errorAmable(estado, mensaje) {
    if (mensaje) return mensaje;
    if (estado === 401) return 'Tu sesión venció. Vuelve a entrar.';
    if (estado === 403) return 'Tu cuenta todavía no tiene acceso al asistente.';
    if (estado === 429) return 'Vas muy rápido. Espera un momento.';
    if (estado === 0) return 'Sin conexión con el asistente.';
    return 'El asistente no pudo responder. Intenta de nuevo.';
  }

  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  window.AI = {
    disponible: function () { return !!sesion(); },

    /**
     * Reintenta cuando el proveedor está saturado (429) o se cae un momento
     * (502). Es lo que hacía _aiFetch antes de que todo pasara por el proxy:
     * sin esto, un pico de tráfico del proveedor se ve como un error de la app.
     */
    chat: function (peticion, intento) {
      var self = this;
      intento = intento || 0;
      return this._una(peticion).catch(function (e) {
        var reintentable = e && (e.estado === 429 || e.estado === 502);
        if (!reintentable || intento >= 2) throw e;
        if (typeof peticion.onRetry === 'function') peticion.onRetry(intento + 1, 2);
        return esperar(1500 * (intento + 1)).then(function () { return self.chat(peticion, intento + 1); });
      });
    },

    _una: function (peticion) {
      peticion = peticion || {};
      // Un solo controlador: el del reloj y el de quien llama terminan en el
      // mismo abort, para poder distinguir "se demoró" de "lo cancelaron".
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var porTiempo = false;
      var reloj = setTimeout(function () { porTiempo = true; if (ctrl) ctrl.abort(); }, TIEMPO_MAXIMO);
      if (peticion.signal && ctrl) {
        if (peticion.signal.aborted) ctrl.abort();
        else peticion.signal.addEventListener('abort', function () { ctrl.abort(); });
      }

      return token().then(function (tk) {
        var cabeceras = { 'Content-Type': 'application/json' };
        if (tk) cabeceras.Authorization = 'Bearer ' + tk;
        return fetch(RUTA, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify({
            modo: peticion.modo || 'asesor',
            perfil: peticion.perfil || 'chat',
            json: !!peticion.json,
            system: peticion.system || '',
            messages: peticion.messages || [],
            tools: peticion.tools || [],
            max_tokens: peticion.max_tokens || 1024
          }),
          signal: ctrl ? ctrl.signal : undefined
        });
      }).then(function (r) {
        return r.text().then(function (txt) {
          var datos = null;
          try { datos = JSON.parse(txt); } catch (e) { datos = null; }
          if (!r.ok) {
            var err = new Error(errorAmable(r.status, datos && datos.error));
            err.estado = r.status;
            err.amable = true;
            err.friendly = true;   // _friendlyAiError (services.js) mira este
            throw err;
          }
          if (!datos) throw new Error('El asistente respondió algo que no se entiende.');
          datos.llamadas = datos.llamadas || [];
          datos.texto = datos.texto || '';
          return datos;
        });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') {
          if (!porTiempo) throw e;  // lo cortó la persona: que la UI diga "cancelado"
          var t = new Error('El asistente se demoró demasiado. Intenta con algo más corto.');
          t.amable = true;
          t.friendly = true;
          throw t;
        }
        if (e && e.amable) throw e;
        var g = new Error(errorAmable(0, ''));
        g.amable = true;
        g.friendly = true;
        g.causa = e;
        throw g;
      }).finally(function () { clearTimeout(reloj); });
    }
  };
})();
