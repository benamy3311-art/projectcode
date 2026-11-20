// ============================================================
// HISTORIA DE UN CLIENTE (para la ficha del chat)
// ============================================================
// Junta lo que el cliente ha hecho con la tienda (cotizaciones de todo el
// equipo, ventas registradas en Vender, comprobantes de pago) y lo vuelve
// algo que el asesor lee en dos segundos mientras le habla:
//   cuánto ha comprado y cuántas veces, qué cotizó y no compró, qué le
//   interesa, cómo suele pagar, y una sugerencia concreta.
//
// No adivina datos: si algo no está, no aparece. Una cotización marcada como
// vendida que además se registró en Vender (la venta dice "Cot. #A-1047")
// cuenta una sola vez.
//
// Globales que expone (window.*):
//   HistoriaCliente.calcular({ cotizaciones, ventas, pagos, primerContacto, ahora })
//
// Entradas (ya filtradas para ESTE cliente):
//   cotizaciones: [{ id, num, total, estado, fecha, items: [{ nombre, cantidad, precio, categoria }] }]
//   ventas:       [{ id, numero, total, fecha, estado, referencia, medios: [..], items: [{ nombre, cantidad, total, categoria }] }]
//   pagos:        [{ estado, medio, valor, fecha }]
//
// Depende de: nada (se prueba en tests/historia-cliente.test.js)
// ============================================================
(function (root) {
  'use strict';

  var DIA = 86400000;

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function corto(nombre, palabras) { var p = String(nombre || '').trim().split(/\s+/); return p.slice(0, palabras || 4).join(' ') + (p.length > (palabras || 4) ? '…' : ''); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function calcular(o) {
    o = o || {};
    var ahora = o.ahora || Date.now();
    var cots = (o.cotizaciones || []).filter(Boolean);
    var ventas = (o.ventas || []).filter(function (v) { return v && v.estado !== 'anulada'; });
    var pagos = (o.pagos || []).filter(Boolean);

    // Cotizaciones vendidas que ya están como venta en Vender: no se cuentan dos veces.
    var refs = ventas.map(function (v) { return norm(v.referencia); }).join(' | ');
    var vendidasSueltas = cots.filter(function (c) {
      return c.estado === 'vendida' && !(c.num && refs.indexOf(norm(c.num)) >= 0);
    });

    var compras = ventas.map(function (v) {
      return { fecha: num(v.fecha), total: num(v.total), items: v.items || [], ref: v.numero || '', origen: 'venta', medios: v.medios || [] };
    }).concat(vendidasSueltas.map(function (c) {
      return { fecha: num(c.fecha), total: num(c.total), items: c.items || [], ref: c.num ? '#' + c.num : '', origen: 'cotizacion', medios: [] };
    })).sort(function (a, b) { return b.fecha - a.fecha; });

    var comprado = compras.reduce(function (s, c) { return s + c.total; }, 0);
    var ultima = compras[0] || null;

    // Lo comprado (por nombre) para saber qué NO ha comprado de lo que cotizó.
    var compradoNombres = {};
    compras.forEach(function (c) { c.items.forEach(function (it) { compradoNombres[norm(it.nombre)] = true; }); });

    var abiertas = cots.filter(function (c) { return c.estado === 'enviada' || c.estado === 'negociando' || !c.estado; })
      .sort(function (a, b) { return num(b.fecha) - num(a.fecha); });
    var perdidas = cots.filter(function (c) { return c.estado === 'perdida'; });

    var noCompro = {};
    abiertas.concat(perdidas).forEach(function (c) {
      (c.items || []).forEach(function (it) {
        var k = norm(it.nombre);
        if (!k || compradoNombres[k]) return;
        var x = noCompro[k] || (noCompro[k] = { nombre: it.nombre, veces: 0, ultima: 0, precio: 0 });
        x.veces++;
        if (num(c.fecha) >= x.ultima) { x.ultima = num(c.fecha); x.precio = num(it.precio); }
      });
    });
    var noComproLista = Object.keys(noCompro).map(function (k) { return noCompro[k]; })
      .sort(function (a, b) { return b.veces - a.veces || b.ultima - a.ultima; });

    // Intereses: categorías de lo cotizado y lo comprado.
    var cats = {};
    cots.forEach(function (c) { (c.items || []).forEach(function (it) { if (it.categoria) cats[it.categoria] = (cats[it.categoria] || 0) + 1; }); });
    compras.forEach(function (c) { c.items.forEach(function (it) { if (it.categoria) cats[it.categoria] = (cats[it.categoria] || 0) + 2; }); });
    var intereses = Object.keys(cats).filter(function (k) { return k !== 'ADICIONAL'; }).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 3);

    // Cómo suele pagar
    var medios = {};
    ventas.forEach(function (v) { (v.medios || []).forEach(function (m) { if (m) medios[m] = (medios[m] || 0) + 1; }); });
    pagos.forEach(function (p) { if (p.medio) medios[p.medio] = (medios[p.medio] || 0) + 1; });
    var medioFrecuente = Object.keys(medios).sort(function (a, b) { return medios[b] - medios[a]; })[0] || '';

    var nCot = cots.length;
    var nVendidas = cots.filter(function (c) { return c.estado === 'vendida'; }).length;
    var cierre = nCot ? Math.round(100 * nVendidas / nCot) : null;

    var diasSinComprar = ultima ? Math.floor((ahora - ultima.fecha) / DIA) : null;
    var tipo = !compras.length ? (nCot ? 'prospecto' : 'nuevo')
      : diasSinComprar > 180 ? 'dormido'
      : compras.length >= 3 ? 'frecuente' : 'recurrente';

    // Línea de tiempo (lo más reciente primero)
    var linea = [];
    compras.forEach(function (c) {
      var n = c.items.length;
      linea.push({ tipo: 'compra', fecha: c.fecha, total: c.total, texto: 'Compró ' + (n ? corto(c.items[0].nombre) + (n > 1 ? ' y ' + (n - 1) + ' más' : '') : 'una venta') + (c.ref ? ' · ' + c.ref : '') });
    });
    abiertas.concat(perdidas).forEach(function (c) {
      var n = (c.items || []).length;
      linea.push({ tipo: c.estado === 'perdida' ? 'perdida' : 'cotizacion', fecha: num(c.fecha), total: num(c.total), texto: 'Cotizó ' + (n ? corto(c.items[0].nombre) + (n > 1 ? ' y ' + (n - 1) + ' más' : '') : '') + (c.num ? ' · #' + c.num : '') + (c.estado === 'perdida' ? ' · no compró' : ' · sin cerrar') });
    });
    pagos.forEach(function (p) {
      linea.push({ tipo: 'pago', fecha: num(p.fecha), total: num(p.valor), texto: 'Pago ' + (p.estado === 'aprobado' ? 'aprobado' : p.estado === 'rechazado' ? 'rechazado' : 'en revisión') + (p.medio ? ' por ' + p.medio : '') });
    });
    if (o.primerContacto) linea.push({ tipo: 'contacto', fecha: num(o.primerContacto), total: 0, texto: 'Escribió por primera vez' });
    linea.sort(function (a, b) { return b.fecha - a.fecha; });

    // Una sugerencia, la más útil
    var sugerencia = '';
    var repetido = noComproLista.filter(function (x) { return x.veces >= 2; })[0];
    if (repetido) sugerencia = 'Cotizó ' + repetido.veces + ' veces ' + corto(repetido.nombre, 5) + ' y no lo compró: ofrécele un precio especial.';
    else if (abiertas[0] && ahora - num(abiertas[0].fecha) >= 2 * DIA) sugerencia = 'Tiene la cotización ' + (abiertas[0].num ? '#' + abiertas[0].num + ' ' : '') + 'sin respuesta hace ' + Math.floor((ahora - num(abiertas[0].fecha)) / DIA) + ' días.';
    else if (tipo === 'dormido') sugerencia = 'No compra hace ' + Math.round(diasSinComprar / 30) + ' meses' + (intereses[0] ? ': muéstrale lo nuevo de ' + intereses[0].toLowerCase() + '.' : '.');
    else if (tipo === 'frecuente') sugerencia = 'Cliente frecuente: ' + compras.length + ' compras. Atiéndelo primero.';
    else if (tipo === 'nuevo') sugerencia = 'Primera vez que escribe: preséntate y pregúntale qué necesita.';

    return {
      tipo: tipo,
      comprado: comprado,
      compras: compras.length,
      ticket: compras.length ? Math.round(comprado / compras.length) : 0,
      ultimaCompra: ultima ? { fecha: ultima.fecha, total: ultima.total, que: ultima.items[0] ? ultima.items[0].nombre : '', ref: ultima.ref } : null,
      diasSinComprar: diasSinComprar,
      cotizaciones: nCot,
      abiertas: abiertas.length,
      valorAbierto: abiertas.reduce(function (s, c) { return s + num(c.total); }, 0),
      cierre: cierre,
      noCompro: noComproLista.slice(0, 5),
      intereses: intereses,
      medioFrecuente: medioFrecuente,
      linea: linea,
      sugerencia: sugerencia
    };
  }

  root.HistoriaCliente = { calcular: calcular };
})(typeof window !== 'undefined' ? window : globalThis);
