// ============================================================
// COMPRAS SUGERIDAS (qué pedirle al proveedor)
// ============================================================
// Cuántas unidades pedir de cada producto para no quedarse sin existencias
// mientras llega el siguiente pedido:
//
//   ritmo diario = (vendidas + cotizadas abiertas x tasa de cierre) / días
//   objetivo     = ritmo x (días de entrega del proveedor + días de cobertura)
//                  y nunca menos del mínimo por producto
//   pedir        = objetivo - lo que hay
//
// Una cotización no es una venta: solo cuenta la parte que se suele cerrar
// (la tasa de cierre real de la tienda en esos días, entre 10 % y 60 %).
// Lo vendido sale de las ventas registradas y de las cotizaciones marcadas
// "vendida"; por producto se toma el mayor de los dos para no contar dos
// veces la misma venta.
//
// Globales que expone (window.*):
//   Compras.demanda({ cotizaciones, ventas, desde })  → { porSku, tasaCierre }
//   Compras.sugerir({ demanda, productos, existencias, entregaDias, ... }) → [...]
//
// Depende de: nada (se prueba en tests/compras.test.js)
// ============================================================
(function (root) {
  'use strict';

  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0); }

  // cotizaciones: [{ items:[{sku, qty}], estado, updatedAt|createdAt }]
  // ventas:       [{ items:[{sku, cantidad}], estado, fecha }]
  function demanda(o) {
    o = o || {};
    var desde = o.desde || 0;
    var porSku = {}, vendQ = {}, vendV = {};
    var total = 0, cerradas = 0;
    var fila = function (sku) { return porSku[sku] || (porSku[sku] = { vendidas: 0, cotizadas: 0 }); };
    (o.cotizaciones || []).forEach(function (q) {
      var t = ms(q.updatedAt) || ms(q.createdAt) || ms(q.fecha);
      if (t && t < desde) return;
      total++;
      var vendida = q.estado === 'vendida';
      if (vendida) cerradas++;
      (q.items || []).forEach(function (it) {
        var sku = String(it.sku || '');
        if (!sku) return;
        var n = Math.max(1, Number(it.qty) || 1);
        if (vendida) vendQ[sku] = (vendQ[sku] || 0) + n;
        else fila(sku).cotizadas += n;
      });
    });
    (o.ventas || []).forEach(function (v) {
      if (v.estado === 'anulada') return;
      if (ms(v.fecha) && ms(v.fecha) < desde) return;
      (v.items || []).forEach(function (it) {
        var sku = String(it.sku || '');
        if (sku) vendV[sku] = (vendV[sku] || 0) + Math.max(1, Number(it.cantidad) || 1);
      });
    });
    Object.keys(vendQ).concat(Object.keys(vendV)).forEach(function (sku) {
      fila(sku).vendidas = Math.max(vendQ[sku] || 0, vendV[sku] || 0);
    });
    var tasa = total >= 10 ? cerradas / total : 0.3;
    return { porSku: porSku, tasaCierre: Math.min(0.6, Math.max(0.1, tasa)) };
  }

  // productos:   [{ sku, nombre, categoria, noInventariable }]
  // existencias: function (sku) → unidades
  // entregaDias: function (producto) → días que tarda el proveedor (o null)
  function sugerir(o) {
    o = o || {};
    var d = o.demanda || { porSku: {}, tasaCierre: 0.3 };
    var dias = o.dias || 30, minimo = o.minimo == null ? 2 : o.minimo, cobertura = o.cobertura == null ? 14 : o.cobertura;
    var hayDe = o.existencias || function () { return 0; };
    var entregaDe = o.entregaDias || function () { return null; };
    var out = [];
    (o.productos || []).forEach(function (p) {
      if (!p || p.noInventariable) return;
      var sku = String(p.sku);
      var x = d.porSku[sku];
      if (!x || (!x.vendidas && !x.cotizadas)) return;
      var hay = Math.max(0, Number(hayDe(sku)) || 0);
      var entrega = entregaDe(p);
      entrega = entrega == null ? 3 : Math.max(0, Number(entrega) || 0);
      var ritmo = (x.vendidas + x.cotizadas * d.tasaCierre) / dias;
      var objetivo = Math.max(minimo, Math.ceil(ritmo * (entrega + cobertura) - 1e-9));
      var pedir = objetivo - hay;
      if (pedir <= 0) return;
      out.push({ sku: sku, nombre: p.nombre, categoria: p.categoria || '', hay: hay, vendidas: x.vendidas, cotizadas: x.cotizadas,
        objetivo: objetivo, pedir: pedir, ritmo: Math.round(ritmo * 100) / 100 });
    });
    // Primero lo agotado, después lo que más se mueve
    return out.sort(function (a, b) { return (a.hay === 0 ? 0 : 1) - (b.hay === 0 ? 0 : 1) || b.ritmo - a.ritmo; });
  }

  root.Compras = { demanda: demanda, sugerir: sugerir };
})(typeof window !== 'undefined' ? window : globalThis);
