// ============================================================
// EXISTENCIAS EN TODA LA APP
// ============================================================
// El inventario (infrastructure/tienda-db.js) ya se descuenta solo al vender.
// Esto lo lleva a donde se decide: al cotizar (cada producto dice cuántos
// hay), en la ficha del cliente (si se puede vender ya lo que pidió) y en el
// buscador. Si la tienda no lleva inventario en la app (no hay ningún
// movimiento), no se muestra nada: decir "sin existencias" de todo sería
// mentir.
//
// Globales que expone (window.*):
//   Existencias.activo()           — ¿la tienda lleva inventario aquí?
//   Existencias.de(sku)            — unidades, o null si no aplica
//   Existencias.etiqueta(sku, n)   — HTML corto: "3 en bodega" / "Solo 1" / "Sin existencias"
//   Existencias.faltantes(items)   — [{ nombre, pide, hay }] de una cotización
//   existenciasBadge(sku, qty)     — lo mismo que etiqueta, para templates.js
// Evento: 'sl:existencias' cuando cambia el inventario.
//
// Depende de: ui/tienda-app.js (TiendaApp.listo, .db), domain.js (esc)
// Estilos: styles/existencias.css
// ============================================================
(function () {
  'use strict';

  var _db = null;
  var NO_INVENTARIABLES = ['55002', 'CUSTOM'];

  function activo() {
    if (!_db) return false;
    var s = _db.stock();
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) return true;
    return false;
  }

  function de(sku) {
    if (!activo() || !sku || NO_INVENTARIABLES.indexOf(String(sku)) >= 0) return null;
    return Math.max(0, Number(_db.existencias(String(sku))) || 0);
  }

  function etiqueta(sku, pide) {
    var hay = de(sku);
    if (hay === null) return '';
    pide = Math.max(1, Number(pide) || 1);
    var cls = hay >= pide ? 'ex-ok' : hay > 0 ? 'ex-poco' : 'ex-no';
    var txt = hay >= pide ? hay + ' en bodega' : hay > 0 ? 'Solo ' + hay + ' en bodega' : 'Sin existencias';
    return '<span class="ex ' + cls + '" title="Inventario de la tienda">' + txt + '</span>';
  }

  function faltantes(items) {
    if (!activo()) return [];
    var out = [];
    (items || []).forEach(function (it) {
      var hay = de(it.sku);
      var pide = Number(it.qty) || 1;
      if (hay !== null && hay < pide) out.push({ nombre: it.name, pide: pide, hay: hay });
    });
    return out;
  }

  function avisar() {
    document.dispatchEvent(new CustomEvent('sl:existencias'));
    // La cotización abierta muestra las existencias en cada producto.
    try { if (typeof window.renderItems === 'function' && document.getElementById('itemsList')) window.renderItems(); } catch (e) {}
  }

  if (window.TiendaApp && window.TiendaApp.listo) {
    window.TiendaApp.listo.then(function (base) {
      _db = base;
      if (base.alCambiar) base.alCambiar(function (tipo) { if (tipo === 'inventario' || tipo === 'ventas' || tipo === 'importacion') avisar(); });
      avisar();
    }, function () {});
  }

  window.Existencias = { activo: activo, de: de, etiqueta: etiqueta, faltantes: faltantes };
  window.existenciasBadge = etiqueta;
})();
