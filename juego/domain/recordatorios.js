// ============================================================
// RECORDATORIOS DEL CHAT (lo que se le olvida a cualquiera)
// ============================================================
// A partir de la ficha de cada cliente (ui/ficha-cliente.js) decide a quién
// hay que volver a escribirle y con qué mensaje:
//   datos      — se le pidieron los datos hace 4 h o más y no ha respondido
//   pago       — se registró la venta hace 24 h o más y no hay comprobante
//   rechazado  — el jefe rechazó su comprobante: pedir otro
//   entrega    — pago aprobado hace 3 a 10 días: preguntar cómo le llegó
// Cada uno se puede posponer (vuelve en 24 h) o dar por hecho; "entrega" se
// manda una sola vez.
//
// Hoy el asesor lo envía con un clic (WhatsApp con el texto escrito). Con la
// API de WhatsApp y plantillas aprobadas por Meta (fase 2) estos mismos
// recordatorios se pueden mandar solos.
//
// Globales que expone (window.*):
//   Recordatorios.de({ fichas, ahora }) → [{ id, tipo, nombre, titulo, detalle, texto, desde }]
//   Recordatorios.ESPERA                 — horas/días de cada regla
//
// fichas: [{ id, nombre, f, ultimoClienteAt }]
//   f: { pedidoAt, datosAt, ventaNumero, ventaAt, pagoAt, pagoEstado, pagoNota,
//        pagoAprobadoAt, recordado: { tipo: ms } }
// Depende de: nada (se prueba en tests/recordatorios.test.js)
// ============================================================
(function (root) {
  'use strict';

  var H = 3600000, DIA = 24 * H;
  var ESPERA = { datos: 4 * H, pago: DIA, entregaDesde: 3 * DIA, entregaHasta: 10 * DIA, posponer: DIA };
  var ORDEN = { rechazado: 0, pago: 1, datos: 2, entrega: 3 };

  function primerNombre(s) { var n = String(s || '').trim().split(/\s+/)[0] || ''; return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''; }
  function horas(ms) { var h = Math.floor(ms / H); return h < 24 ? h + (h === 1 ? ' hora' : ' horas') : Math.floor(h / 24) + (Math.floor(h / 24) === 1 ? ' día' : ' días'); }

  function textos(tipo, nombre, f) {
    var hola = 'Hola' + (nombre ? ' ' + nombre : '');
    if (tipo === 'datos') return hola + ', ¿pudiste ver mi mensaje? Para dejar lista tu factura y el envío solo me faltan tus datos: nombre completo, cédula o NIT, dirección con ciudad y correo.';
    if (tipo === 'pago') return hola + ', te escribo por tu pedido' + (f.ventaNumero ? ' (' + f.ventaNumero + ')' : '') + '. Cuando hagas el pago me mandas el pantallazo por aquí y lo despachamos de una.';
    if (tipo === 'rechazado') return hola + ', revisamos tu comprobante y no lo pudimos confirmar' + (f.pagoNota ? ' (' + String(f.pagoNota).toLowerCase() + ')' : '') + '. ¿Me lo puedes enviar de nuevo?';
    if (tipo === 'entrega') return hola + ', ¿cómo te llegó tu pedido? Cualquier cosa con el equipo, aquí estoy para ayudarte.';
    return '';
  }

  function de(o) {
    o = o || {};
    var ahora = o.ahora || Date.now();
    var out = [];
    (o.fichas || []).forEach(function (x) {
      var f = x && x.f;
      if (!f) return;
      var rec = f.recordado || {};
      var nombre = primerNombre(x.nombre || (f.datos && f.datos.nombre));
      var nombreCompleto = String(x.nombre || (f.datos && f.datos.nombre) || '').trim() || ('+' + x.id);
      var pospuesto = function (tipo) { return rec[tipo] && ahora - rec[tipo] < ESPERA.posponer; };
      var poner = function (tipo, titulo, detalle, desde) {
        if (pospuesto(tipo)) return;
        out.push({ id: x.id, tipo: tipo, nombre: nombreCompleto, titulo: titulo, detalle: detalle, texto: textos(tipo, nombre, f), desde: desde });
      };

      if (f.pagoEstado === 'rechazado') {
        poner('rechazado', 'Pago rechazado', 'Pídele otro comprobante' + (f.pagoNota ? ': ' + f.pagoNota : '') + '.', f.pagoAt || ahora);
        return;
      }
      if (f.pagoEstado === 'aprobado') {
        var t = f.pagoAprobadoAt || 0;
        if (t && !rec.entrega && ahora - t >= ESPERA.entregaDesde && ahora - t <= ESPERA.entregaHasta) {
          out.push({ id: x.id, tipo: 'entrega', nombre: nombreCompleto, titulo: '¿Cómo le llegó?', detalle: 'Pagó hace ' + horas(ahora - t) + '. Un mensaje después de la entrega trae la próxima compra.', texto: textos('entrega', nombre, f), desde: t });
        }
        return;
      }
      if (f.ventaNumero) {
        if (!f.pagoAt && f.ventaAt && ahora - f.ventaAt >= ESPERA.pago) {
          poner('pago', 'Venta sin pago', f.ventaNumero + ' · registrada hace ' + horas(ahora - f.ventaAt) + ' y no ha mandado el comprobante.', f.ventaAt);
        }
        return;
      }
      var tienenDatos = f.datosAt && f.pedidoAt && f.datosAt >= f.pedidoAt;
      var respondio = x.ultimoClienteAt && f.pedidoAt && x.ultimoClienteAt > f.pedidoAt;
      if (f.pedidoAt && !tienenDatos && !respondio && ahora - f.pedidoAt >= ESPERA.datos) {
        poner('datos', 'No ha mandado sus datos', 'Se los pediste hace ' + horas(ahora - f.pedidoAt) + '.', f.pedidoAt);
      }
    });
    return out.sort(function (a, b) { return ORDEN[a.tipo] - ORDEN[b.tipo] || a.desde - b.desde; });
  }

  root.Recordatorios = { de: de, ESPERA: ESPERA };
})(typeof window !== 'undefined' ? window : globalThis);
