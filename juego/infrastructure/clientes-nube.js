// ============================================================
// FICHA DEL CLIENTE EN LA NUBE (clientes/{número})
// ============================================================
// La ficha del chat (ui/ficha-cliente.js: datos para la factura, en qué paso
// va, venta, pago, recordatorios) vivía solo en el navegador de quien la
// llenó. Aquí se sube a Firestore para que siga al cliente: si mañana lo
// atiende otra asesora, o el mismo asesor desde otro computador, abre el
// chat y ya está todo.
//
// - El id es el número de WhatsApp (57 + 10 dígitos), el mismo de
//   wa_conversations: no se expone nada que no estuviera ya.
// - Nombre, documento, dirección, correo y teléfono van cifrados si la
//   empresa activó el cifrado (PiiCrypto). Si este equipo no tiene la llave,
//   se sube solo el avance (paso, venta, pago), nunca los datos en claro.
// - Gana la última escritura: cada guardado lleva su hora (t) y al abrir un
//   chat se usa la versión más nueva entre la local y la de la nube.
// - Lo enviado (con miniaturas) se queda en este navegador.
// - pagoEstado aquí es un reflejo para la ficha; el pago lo aprueba el jefe
//   en comprobantes/ (regla aparte), no se aprueba desde aquí.
//
// Globales que expone (window.*):
//   ClientesNube.subir(waId, ficha)  — guarda (con espera de 1,5 s por cliente)
//   ClientesNube.traer(waId)         — Promise<ficha | null>
//
// Depende de: firebase-auth.js (_slDb, _slAuth), pii-crypto.js (opcional)
// ============================================================
(function () {
  'use strict';

  var COL = 'clientes';
  var CAMPOS = ['pedidoAt', 'datosAt', 'ventaNumero', 'ventaTotal', 'ventaAt', 'pagoAt', 'pagoEstado', 'pagoNota', 'pagoAprobadoAt', 'recordado', 'factura'];
  var DATOS = ['nombre', 'tipoDoc', 'documento', 'direccion', 'correo', 'telefono'];
  var PII = [{ path: 'datos.nombre' }, { path: 'datos.documento' }, { path: 'datos.direccion' }, { path: 'datos.correo' }, { path: 'datos.telefono' }];
  var _pend = {};

  function idDe(waId) {
    var d = String(waId || '').replace(/\D/g, '');
    if (d.length === 10 && d.charAt(0) === '3') d = '57' + d;
    return /^\d{8,15}$/.test(d) ? d : '';
  }
  function correo() { var u = window._slAuth && window._slAuth.currentUser; return u ? String(u.email || '').toLowerCase() : ''; }

  function paraNube(f) {
    var doc = { t: Number(f._t) || Date.now() };
    CAMPOS.forEach(function (k) {
      var v = f[k];
      if (v == null || v === '') return;
      if (k === 'recordado') { if (typeof v === 'object') doc.recordado = v; return; }
      if (k === 'factura') {
        if (typeof v === 'object' && v.numero) doc.factura = { proveedor: String(v.proveedor || '').slice(0, 20), numero: String(v.numero).slice(0, 40), cufe: String(v.cufe || '').slice(0, 120), estado: String(v.estado || '').slice(0, 40), at: Number(v.at) || 0 };
        return;
      }
      if (k === 'ventaNumero' || k === 'pagoEstado') doc[k] = String(v).slice(0, 40);
      else if (k === 'pagoNota') doc[k] = String(v).slice(0, 300);
      else if (typeof v === 'number') doc[k] = v;
    });
    var d = f.datos || {};
    var datos = {};
    DATOS.forEach(function (k) { if (d[k]) datos[k] = String(d[k]).slice(0, 300); });
    if (Object.keys(datos).length) doc.datos = datos;
    return doc;
  }

  function subirYa(id, f) {
    var db = window._slDb;
    if (!db || !window.firebase || !correo()) return Promise.resolve();
    var doc = paraNube(f);
    var P = window.PiiCrypto;
    var cifrar = P && doc.datos ? P.protect(COL, id, doc, PII).catch(function () { var sin = Object.assign({}, doc); delete sin.datos; return sin; }) : Promise.resolve(doc);
    return cifrar.then(function (d) {
      d.actualizadoPor = correo();
      d.actualizadoAt = firebase.firestore.FieldValue.serverTimestamp();
      return db.collection(COL).doc(id).set(d);
    }).catch(function (e) {
      // Reglas sin publicar o sin conexión: la ficha local sigue funcionando.
      if (!subirYa._avisado) { subirYa._avisado = true; console.warn('[clientes] no se pudo guardar en la nube:', e && (e.code || e.message)); }
    });
  }

  function subir(waId, f) {
    var id = idDe(waId);
    if (!id || !f) return;
    clearTimeout(_pend[id]);
    _pend[id] = setTimeout(function () { delete _pend[id]; subirYa(id, f); }, 1500);
  }

  function traer(waId) {
    var id = idDe(waId);
    var db = window._slDb;
    if (!id || !db) return Promise.resolve(null);
    return db.collection(COL).doc(id).get().then(function (snap) {
      if (!snap.exists) return null;
      var x = snap.data() || {};
      var P = window.PiiCrypto;
      return (P && x.datos ? P.reveal(COL, id, x, PII).catch(function () { return x; }) : Promise.resolve(x)).then(function (r) {
        var f = { _t: Number(r.t) || 0, _nube: true };
        CAMPOS.forEach(function (k) { if (r[k] != null) f[k] = r[k]; });
        if (r.datos && !r._piiLocked) {
          f.datos = {};
          DATOS.forEach(function (k) { if (r.datos[k]) f.datos[k] = r.datos[k]; });
        }
        if (r.actualizadoPor) f._por = r.actualizadoPor;
        return f;
      });
    }).catch(function () { return null; });
  }

  window.ClientesNube = { subir: subir, traer: traer, _paraNube: paraNube, _idDe: idDe };
})();
