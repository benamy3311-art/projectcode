// ============================================================
// CONFIGURACIÓN DE LA EMPRESA ("Mi empresa")
// ============================================================
// Lo que cambia de una tienda a otra sin tocar el código: si cobra IVA y a
// qué tarifa, y con qué medios de pago le pagan. Lo edita el jefe en
// ui/mi-empresa.js; vive en Firestore en config/empresa (cada empresa tiene
// su propio proyecto de Firebase) y lo carga infrastructure/empresa-config.js.
//
// Regla de oro: sin configuración, la app funciona exactamente como antes
// (IVA 19 % y los seis medios de pago de siempre). Todo lo que llega de
// Firestore pasa por normalizar(), así un documento raro nunca rompe un
// cálculo.
//
// Globales que expone (window.*):
//   Empresa.porDefecto()        — configuración de fábrica
//   Empresa.normalizar(raw)     — configuración segura a partir de cualquier cosa
//   Empresa.validar(cfg)        — { ok, errores } para el editor
//   Empresa.tasaIva(cfg)        — 0 si no es responsable de IVA
//   Empresa.usar(cfg)           — fija la configuración activa
//   Empresa.actual()            — copia de la configuración activa
//   Empresa.cobraIva()          — ¿la activa cobra IVA?
//   Empresa.tarifaIva()         — tarifa activa en % (0 si no cobra)
//   Empresa.factorIva()         — 1 + tarifa/100 (1.19 por defecto)
//   Empresa.mediosPago()        — nombres de los medios activos
//   Empresa.mensaje(clave, d)   — texto listo de pedirDatos / datosPago
//
// Depende de: nada (se prueba en tests/empresa.test.js)
// ============================================================
(function (root) {
  'use strict';

  var VERSION = 1;
  var MEDIOS_POR_DEFECTO = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'Nequi', 'Daviplata'];
  var MAX_MEDIOS = 20;
  var MAX_NOMBRE = 40;
  var TARIFA_MAX = 30;
  var MAX_MENSAJE = 600;

  // Mensajes que el asesor manda con un clic desde el chat (ui/ficha-cliente.js).
  // {nombre} se cambia por el primer nombre del cliente.
  var MENSAJES_POR_DEFECTO = {
    pedirDatos: 'Hola {nombre}, para hacer tu factura y el envío, envíame por favor en un solo mensaje:\n- Nombre completo\n- Cédula o NIT\n- Dirección de envío (con ciudad)\n- Correo para la factura',
    datosPago: ''
  };

  function porDefecto() {
    return { version: VERSION, iva: { responsable: true, tarifa: 19 }, mediosPago: MEDIOS_POR_DEFECTO.slice(), mensajes: { pedirDatos: MENSAJES_POR_DEFECTO.pedirDatos, datosPago: MENSAJES_POR_DEFECTO.datosPago } };
  }

  // Texto de mensaje: se conservan los saltos de línea, sin espacios de sobra.
  function limpiarMensaje(s) {
    return String(s == null ? '' : s).replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_MENSAJE);
  }

  function limpiar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  // La tarifa se guarda con un decimal como mucho (19, 5, 8.5).
  function tarifaValida(t) {
    var n = Number(t);
    return isFinite(n) && n > 0 && n <= TARIFA_MAX && Math.round(n * 10) === n * 10;
  }

  // Lista limpia: sin vacíos, sin repetidos (sin importar mayúsculas), con tope.
  function limpiarMedios(lista) {
    var vistos = {}, out = [];
    (Array.isArray(lista) ? lista : []).forEach(function (m) {
      var n = limpiar(typeof m === 'string' ? m : (m && m.nombre)).slice(0, MAX_NOMBRE);
      var k = n.toLowerCase();
      if (!n || vistos[k] || out.length >= MAX_MEDIOS) return;
      vistos[k] = true;
      out.push(n);
    });
    return out;
  }

  function normalizar(raw) {
    var d = porDefecto();
    if (!raw || typeof raw !== 'object') return d;
    var iva = raw.iva && typeof raw.iva === 'object' ? raw.iva : {};
    if (iva.responsable === false) d.iva.responsable = false;
    if (tarifaValida(iva.tarifa)) d.iva.tarifa = Number(iva.tarifa);
    var medios = limpiarMedios(raw.mediosPago);
    if (medios.length) d.mediosPago = medios; // sin medios no se puede vender: se quedan los de fábrica
    var men = raw.mensajes && typeof raw.mensajes === 'object' ? raw.mensajes : {};
    if (typeof men.pedirDatos === 'string' && limpiarMensaje(men.pedirDatos)) d.mensajes.pedirDatos = limpiarMensaje(men.pedirDatos);
    if (typeof men.datosPago === 'string') d.mensajes.datosPago = limpiarMensaje(men.datosPago);
    return d;
  }

  // Para el editor: dice qué está mal en lugar de arreglarlo en silencio.
  function validar(cfg) {
    var errores = [];
    cfg = cfg || {};
    var iva = cfg.iva || {};
    if (typeof iva.responsable !== 'boolean') errores.push('Indica si la empresa es responsable de IVA.');
    if (iva.responsable && !tarifaValida(iva.tarifa)) errores.push('La tarifa de IVA debe estar entre 0,1 y ' + TARIFA_MAX + ' %.');
    var lista = Array.isArray(cfg.mediosPago) ? cfg.mediosPago : [];
    var vistos = {};
    lista.forEach(function (m) {
      var n = limpiar(m);
      if (!n) { errores.push('Hay un medio de pago sin nombre.'); return; }
      if (n.length > MAX_NOMBRE) errores.push('«' + n.slice(0, 20) + '…» es muy largo (máximo ' + MAX_NOMBRE + ' letras).');
      var k = n.toLowerCase();
      if (vistos[k]) errores.push('«' + n + '» está repetido.');
      vistos[k] = true;
    });
    if (!lista.length) errores.push('Deja al menos un medio de pago.');
    var men = cfg.mensajes || {};
    if (String(men.pedirDatos || '').length > MAX_MENSAJE || String(men.datosPago || '').length > MAX_MENSAJE) errores.push('Cada mensaje puede tener hasta ' + MAX_MENSAJE + ' letras.');
    if (lista.length > MAX_MEDIOS) errores.push('Máximo ' + MAX_MEDIOS + ' medios de pago.');
    return { ok: errores.length === 0, errores: errores };
  }

  function tasaIva(cfg) {
    var c = normalizar(cfg);
    return c.iva.responsable ? c.iva.tarifa : 0;
  }

  // Lo que se guarda en Firestore: solo los campos conocidos.
  function paraGuardar(cfg) {
    var c = normalizar(cfg);
    return { version: VERSION, iva: { responsable: c.iva.responsable, tarifa: c.iva.tarifa }, mediosPago: c.mediosPago.slice(), mensajes: { pedirDatos: c.mensajes.pedirDatos, datosPago: c.mensajes.datosPago } };
  }

  // ── Configuración activa ──────────────────────────────
  var _actual = porDefecto();

  function copia(c) { return { version: c.version, iva: { responsable: c.iva.responsable, tarifa: c.iva.tarifa }, mediosPago: c.mediosPago.slice(), mensajes: { pedirDatos: c.mensajes.pedirDatos, datosPago: c.mensajes.datosPago } }; }

  root.Empresa = {
    VERSION: VERSION,
    MAX_MEDIOS: MAX_MEDIOS,
    MAX_NOMBRE: MAX_NOMBRE,
    TARIFA_MAX: TARIFA_MAX,
    MEDIOS_POR_DEFECTO: MEDIOS_POR_DEFECTO.slice(),
    porDefecto: porDefecto,
    normalizar: normalizar,
    validar: validar,
    tasaIva: tasaIva,
    paraGuardar: paraGuardar,
    usar: function (cfg) { _actual = normalizar(cfg); return copia(_actual); },
    actual: function () { return copia(_actual); },
    cobraIva: function () { return tasaIva(_actual) > 0; },
    tarifaIva: function () { return tasaIva(_actual); },
    factorIva: function () { return 1 + tasaIva(_actual) / 100; },
    mediosPago: function () { return _actual.mediosPago.slice(); },
    MAX_MENSAJE: MAX_MENSAJE,
    // Mensaje listo para enviar: {nombre} → primer nombre del cliente.
    mensaje: function (clave, datos) {
      var t = (_actual.mensajes && _actual.mensajes[clave]) || '';
      var nombre = String((datos && datos.nombre) || '').trim().split(/\s+/)[0] || '';
      return t.replace(/\{nombre\}/g, nombre).replace(/\s+,/g, ',').replace(/Hola\s+,/g, 'Hola,');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
