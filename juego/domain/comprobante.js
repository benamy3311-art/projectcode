// ============================================================
// LECTURA DE UN COMPROBANTE DE PAGO
// ============================================================
// La IA mira el pantallazo (infrastructure/comprobantes.js → AI perfil
// 'leer') y responde un JSON. Aquí se limpia esa respuesta y se cruza con lo
// que la app ya sabe, para que el que revisa vea de un vistazo:
//   - si el valor del comprobante coincide con el de la venta,
//   - si la referencia ya apareció en otro comprobante (pago reciclado:
//     el fraude más común con pantallazos),
//   - con qué medio de pago de la empresa corresponde.
// La IA puede equivocarse: esto avisa, nunca aprueba ni rechaza solo.
//
// Globales que expone (window.*):
//   Comprobante.PROMPT                 — instrucciones para el modelo
//   Comprobante.interpretar(texto)     — { esComprobante, monto, referencia, banco, fecha, destinatario } | null
//   Comprobante.medioPara(banco, medios) — el medio de la empresa que corresponde
//   Comprobante.revisar(lectura, { valor, id, otros }) — avisos para quien revisa
//
// Depende de: nada (se prueba en tests/comprobante.test.js)
// ============================================================
(function (root) {
  'use strict';

  var PROMPT = 'Eres un lector de comprobantes de pago de Colombia (Nequi, Daviplata, Bancolombia, Davivienda, BBVA, '
    + 'Banco de Bogotá, transferencias, PSE, Bre-B, consignaciones). Mira la imagen y responde SOLO un objeto JSON con estas llaves: '
    + '{"es_comprobante": true|false, "monto": entero en pesos sin puntos ni signos o null, "referencia": "código del comprobante" o null, '
    + '"banco": "entidad o app desde donde se pagó" o null, "fecha": "AAAA-MM-DD" o null, "destinatario": "a quién se le pagó" o null}. '
    + 'No inventes: si un dato no se lee con claridad, pon null. Si la imagen no es un comprobante de pago, es_comprobante es false.';

  function limpio(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }

  // "$ 1.850.000", "1850000.00", 1850000 → 1850000
  function aPesos(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? Math.round(v) : null;
    var s = String(v == null ? '' : v).replace(/[^\d.,]/g, '');
    if (!s) return null;
    s = s.replace(/[.,]\d{2}$/, ''); // centavos
    var n = parseInt(s.replace(/[.,]/g, ''), 10);
    return n > 0 ? n : null;
  }

  function interpretar(texto) {
    if (texto && typeof texto === 'object') return normalizar(texto);
    var t = String(texto || '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return normalizar(JSON.parse(t.slice(a, b + 1))); } catch (e) { return null; }
  }

  function normalizar(j) {
    if (!j || typeof j !== 'object') return null;
    var ref = limpio(j.referencia, 60).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    var fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha || '')) ? String(j.fecha) : '';
    return {
      esComprobante: j.es_comprobante !== false,
      monto: aPesos(j.monto),
      referencia: ref.length >= 4 ? ref : '',
      banco: limpio(j.banco, 40),
      fecha: fecha,
      destinatario: limpio(j.destinatario, 80)
    };
  }

  function sinTildes(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Nequi → "Nequi" si la empresa lo tiene; un banco → "Transferencia".
  function medioPara(banco, medios) {
    var b = sinTildes(banco);
    medios = medios || [];
    if (!b) return '';
    for (var i = 0; i < medios.length; i++) {
      var m = sinTildes(medios[i]);
      if (m && (b.indexOf(m) >= 0 || m.indexOf(b) >= 0)) return medios[i];
    }
    var transf = medios.filter(function (m) { return /transfer/i.test(m); })[0];
    return transf || '';
  }

  // otros: [{ id, referencia, cliente, creadoMs }] de los comprobantes ya guardados
  function revisar(lectura, o) {
    o = o || {};
    var avisos = [];
    if (!lectura) return { avisos: avisos, coincide: null, repetido: null };
    if (!lectura.esComprobante) avisos.push({ tipo: 'no', texto: 'La imagen no parece un comprobante de pago.' });
    var coincide = null;
    if (lectura.monto && o.valor) {
      coincide = Math.abs(lectura.monto - o.valor) <= 1;
      avisos.push(coincide
        ? { tipo: 'ok', texto: 'El valor del comprobante coincide.' }
        : { tipo: 'no', texto: 'El comprobante dice ' + formato(lectura.monto) + ' y la venta es de ' + formato(o.valor) + '.' });
    }
    var repetido = null;
    if (lectura.referencia) {
      repetido = (o.otros || []).filter(function (x) { return x && x.id !== o.id && x.referencia && x.referencia === lectura.referencia; })[0] || null;
      if (repetido) avisos.push({ tipo: 'no', texto: 'Esta referencia ya se usó en otro comprobante' + (repetido.cliente ? ' (' + repetido.cliente + ')' : '') + '. Puede ser un pago reciclado.' });
    }
    return { avisos: avisos, coincide: coincide, repetido: repetido };
  }

  function formato(n) { return '$ ' + Math.round(n).toLocaleString('es-CO'); }

  root.Comprobante = { PROMPT: PROMPT, interpretar: interpretar, medioPara: medioPara, revisar: revisar, aPesos: aPesos };
})(typeof window !== 'undefined' ? window : globalThis);
