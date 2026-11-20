// ============================================================
// QUÉ PRODUCTOS PIDE EL CLIENTE EN EL CHAT
// ============================================================
// "Buenas, ¿tienen el portátil Lenovo IdeaPad 5 con 16 GB? Lo necesito para
// mañana" → los productos del catálogo que más se parecen, para que la ficha
// del cliente ofrezca "Cotizar y enviar la imagen" sin buscarlos a mano.
//
// Cómo decide (sin IA, instantáneo y sin costo):
//   - Quita palabras de relleno (saludos, "tienen", "para", "mañana"...).
//   - Junta "16 GB" en "16gb" en el mensaje y en el catálogo.
//   - Cada palabra pesa según qué tan rara es en el catálogo: "4060" o
//     "ideapad" dicen mucho; "portátil" dice poco.
//   - Exige al menos una palabra distintiva (con números o poco común) para
//     no sugerir cualquier portátil cuando solo dicen "portátil".
// Devuelve pocos candidatos (los que están cerca del mejor) y nunca inventa.
//
// Globales que expone (window.*):
//   DetectarProductos.indice(catalogo)        — índice reutilizable (pesado una vez)
//   DetectarProductos.en(texto, indice, max?) — [{ sku, nombre, precio, categoria, puntaje, palabras }]
//
// catalogo: [{ sku, name, price, _cat }] como el de la app (precio en miles)
// o [{ sku, nombre, precio_cop, categoria }].
//
// Depende de: nada (se prueba en tests/detectar-productos.test.js)
// ============================================================
(function (root) {
  'use strict';

  var RELLENO = ('hola buenas buenos buen dia dias tardes noches gracias por favor porfa quiero queria quisiera necesito '
    + 'necesitaba tienen tiene tienes tendran hay habra disponible disponibles el la los las un una unos unas de del al a en '
    + 'con sin para por que q cual cuales cuanto cuanta cuesta cuestan vale valen precio precios valor me te se le lo mi '
    + 'su y o e es son esta estan este esto ese esa eso como cuando donde si no ya mas muy tambien pero porque pues '
    + 'manana hoy ayer pronto urgente favor info informacion cotizar cotizacion cotizame mandame envia enviame pasame '
    + 'saber preguntar pregunta ver mirar comprar compro llevo llevar algo alguno alguna otro otra referencia ref modelo '
    + 'producto productos equipo equipos busco buscando interesa interesado interesada dame hacer hacen hace va van vez').split(' ');
  var VACIAS = {};
  RELLENO.forEach(function (w) { VACIAS[w] = true; });

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(\d+)[.,](\d+)/g, '$1$2')            // 15,6 → 156 (pulgadas) y 2.349 → 2349
      .replace(/(\d+)\s*(?:pulgadas|pulg|")/g, '$1')          // 27" y 27 pulgadas → 27
      .replace(/(\d+)\s*(gb|tb|mb|hz|w|mah)\b/g, '$1$2')
      .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function palabras(s) {
    return norm(s).split(' ').filter(function (w) { return w && (w.length >= 2 || /\d/.test(w)) && !VACIAS[w]; });
  }

  function indice(catalogo) {
    var prods = [], df = {};
    (catalogo || []).forEach(function (p) {
      if (!p) return;
      var nombre = String(p.name || p.nombre || '').trim();
      if (!nombre) return;
      var precio = p.precio_cop != null ? Number(p.precio_cop) : Math.round(Number(p.price) * 1000);
      var ws = palabras(nombre);
      var set = {};
      ws.forEach(function (w) { set[w] = true; });
      Object.keys(set).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
      prods.push({ sku: String(p.sku == null ? '' : p.sku), nombre: nombre, precio: precio, categoria: String(p._cat || p.categoria || p.category || ''), set: set, n: Object.keys(set).length });
    });
    var N = prods.length || 1;
    var idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + N / df[w]); });
    return { prods: prods, idf: idf, N: N };
  }

  function distintiva(w, ix) {
    // Con números (4060, 16gb, b650m) o rara en el catálogo
    // Un número suelto de uno o dos dígitos ("IdeaPad 5", "27") no basta solo.
    if (/\d/.test(w)) return w.length >= 3 && (ix.idf[w] || 0) > 0;
    return (ix.idf[w] || 0) >= Math.log(1 + ix.N / Math.max(2, ix.N * 0.12));
  }

  function mejor(ix, palabrasMsg, excluir) {
    var top = null;
    ix.prods.forEach(function (p) {
      if (excluir[p.sku]) return;
      var s = 0, hits = [], dist = 0;
      palabrasMsg.forEach(function (w) {
        if (p.set[w]) { s += ix.idf[w]; hits.push(w); if (distintiva(w, ix)) dist++; }
      });
      if (!dist) return;
      // Poco a favor de nombres cortos: "RTX 4060 8GB" le gana a un PC armado
      // que trae una RTX 4060 entre veinte piezas.
      var puntaje = s / Math.sqrt(Math.max(4, p.n));
      if (!top || puntaje > top.s || (puntaje === top.s && p.precio < top.p.precio)) top = { p: p, s: puntaje, hits: hits };
    });
    return top;
  }

  // Un mensaje puede nombrar varias cosas ("la RTX 4060 con una fuente de
  // 550 W"): se toma la mejor coincidencia, se quitan las palabras que ya
  // explicó y se busca otra con lo que queda.
  function en(texto, ix, max) {
    if (!ix || !ix.prods.length) return [];
    max = max || 3;
    var restantes = [];
    palabras(texto).forEach(function (w) { if (ix.idf[w] && restantes.indexOf(w) < 0) restantes.push(w); });
    var out = [], excluir = {};
    while (out.length < max && restantes.some(function (w) { return distintiva(w, ix); })) {
      var m = mejor(ix, restantes, excluir);
      if (!m) break;
      excluir[m.p.sku] = true;
      out.push({ sku: m.p.sku, nombre: m.p.nombre, precio: m.p.precio, categoria: m.p.categoria, puntaje: Math.round(m.s * 100) / 100, palabras: m.hits });
      restantes = restantes.filter(function (w) { return m.hits.indexOf(w) < 0; });
    }
    return out;
  }

  root.DetectarProductos = { indice: indice, en: en, _norm: norm };
})(typeof window !== 'undefined' ? window : globalThis);
