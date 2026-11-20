// ============================================================
// FACTURA ELECTRÓNICA: DE LA VENTA AL PROVEEDOR (Alegra, Siigo)
// ============================================================
// La DIAN no recibe la factura de la app: la emite un proveedor autorizado
// (Alegra, Siigo...) con la numeración y el certificado de cada empresa.
// Este archivo solo traduce, sin llamar a nadie:
//
//   desdeVenta(venta)        → factura neutra (cliente, líneas sin IVA, pagos)
//   validar(factura)         → { ok, errores } antes de enviarla
//   paraAlegra(factura, ids) → cuerpo de POST /invoices de Alegra
//   paraSiigo(factura, ids)  → cuerpo de POST /v1/invoices de Siigo
//   contactoAlegra(factura)  → cuerpo de POST /contacts de Alegra
//   clienteSiigo(factura)    → cuerpo de POST /v1/customers de Siigo
//   dvNit(nit)               → dígito de verificación de la DIAN
//
// Las llamadas (credenciales, ids de impuestos, numeración) las hace el
// servidor en api/facturar.js. Los precios de la tienda incluyen IVA; los
// proveedores piden el precio ANTES de IVA, así que se despeja por línea.
//
// Qué está confirmado y qué no (20-11-2026):
//   Alegra: campos tomados de su referencia oficial (developer.alegra.com):
//     client, items[{id, price, quantity, tax[{id}], description, reference}],
//     numberTemplate, status, paymentForm CASH/CREDIT, stamp.generateStamp,
//     contactos con identificationObject {type, number, dv}, kindOfPerson,
//     regime, nameObject. Los códigos de paymentMethod distintos de CASH
//     no aparecen en la referencia: por confirmar en la cuenta de pruebas.
//   Siigo: su documentación bloquea la lectura automática; los nombres vienen
//     de su SDK oficial y de su API pública (document, customer, items,
//     payments, stamp, mail). Por confirmar en la cuenta de pruebas antes de
//     emitir en real (api/facturar.js arranca en modo de prueba).
//
// Depende de: nada (se prueba en tests/factura-electronica.test.js)
// ============================================================
(function (root) {
  'use strict';

  var PRIMOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  var CONSUMIDOR_FINAL = '222222222222';

  function dvNit(nit) {
    var d = String(nit || '').replace(/\D/g, '');
    if (!d || d.length > 15) return '';
    var s = 0;
    for (var i = 0; i < d.length; i++) s += Number(d.charAt(d.length - 1 - i)) * PRIMOS[i];
    var r = s % 11;
    return String(r > 1 ? 11 - r : r);
  }

  function dos(n) { return Math.round(Number(n) * 100) / 100; }
  function limpio(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 200); }

  function fechaLocal(ms) {
    // Fecha de Colombia (UTC-5, sin horario de verano)
    var d = new Date(Number(ms || Date.now()) - 5 * 3600000);
    return d.toISOString().slice(0, 10);
  }
  function masDias(fecha, n) {
    var d = new Date(fecha + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // "Daniela Vargas Ruiz" → nombres "Daniela", apellidos "Vargas Ruiz"
  function partirNombre(nombre) {
    var p = limpio(nombre, 120).split(' ').filter(Boolean);
    if (p.length <= 1) return { nombres: p[0] || '', apellidos: '' };
    if (p.length === 2) return { nombres: p[0], apellidos: p[1] };
    if (p.length === 3) return { nombres: p[0], apellidos: p[1] + ' ' + p[2] };
    return { nombres: p.slice(0, p.length - 2).join(' '), apellidos: p.slice(-2).join(' ') };
  }

  function ciudadDe(direccion) {
    var d = limpio(direccion, 200);
    return d.indexOf(',') > 0 ? limpio(d.split(',').pop(), 60) : '';
  }

  // Medio de pago de la tienda → forma de pago para la factura
  function medioDe(m) {
    var k = String(m || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/efectivo/.test(k)) return 'efectivo';
    if (/debito/.test(k)) return 'debito';
    if (/credito/.test(k) && /tarjeta/.test(k)) return 'credito';
    return 'transferencia';
  }

  function desdeVenta(v) {
    v = v || {};
    var c = v.cliente || {};
    var tipo = String(c.tipoDoc || 'CC').toUpperCase();
    var doc = String(c.documento || '').replace(/[^\dA-Za-z]/g, '');
    var juridica = tipo === 'NIT';
    var n = partirNombre(c.nombre);
    var fecha = fechaLocal(v.fecha);
    var lineas = (v.items || []).map(function (it) {
      var cant = Math.max(1, Number(it.cantidad) || 1);
      var total = Math.round(Number(it.total) || 0);
      var pct = Number(it.ivaPct) || 0;
      var base = it.base != null ? Number(it.base) : (pct ? total / (1 + pct / 100) : total);
      return { sku: limpio(it.sku, 40), nombre: limpio(it.nombre, 150), cantidad: cant, precioSinIva: dos(base / cant), ivaPct: pct, total: total };
    });
    var saldo = Math.max(0, Math.round(Number(v.saldo) || 0));
    return {
      referencia: limpio(v.numero, 40),
      fecha: fecha,
      vence: saldo > 0 ? masDias(fecha, 30) : fecha,
      formaPago: saldo > 0 ? 'credito' : 'contado',
      cliente: {
        tipoDoc: doc ? tipo : 'CC',
        documento: doc || CONSUMIDOR_FINAL,
        dv: juridica ? dvNit(doc) : '',
        persona: juridica ? 'juridica' : 'natural',
        nombre: limpio(c.nombre, 120) || 'Consumidor final',
        nombres: n.nombres, apellidos: n.apellidos,
        correo: limpio(c.correo, 120), telefono: limpio(c.telefono, 20),
        direccion: limpio(c.direccion, 160), ciudad: ciudadDe(c.direccion)
      },
      lineas: lineas,
      pagos: (v.pagos || []).map(function (p) { return { medio: medioDe(p.medio), nombre: limpio(p.medio, 40), valor: Math.round(Number(p.valor) || 0) }; }).filter(function (p) { return p.valor > 0; }),
      totales: { base: Math.round(Number(v.base) || 0), iva: Math.round(Number(v.iva) || 0), total: Math.round(Number(v.total) || 0) },
      notas: limpio(v.notas, 400)
    };
  }

  function validar(f) {
    var e = [];
    if (!f || !f.cliente) return { ok: false, errores: ['Falta la venta.'] };
    if (!f.lineas || !f.lineas.length) e.push('La venta no tiene productos.');
    if (f.lineas && f.lineas.length > 200) e.push('Máximo 200 líneas por factura.');
    (f.lineas || []).forEach(function (l, i) {
      if (!l.nombre) e.push('La línea ' + (i + 1) + ' no tiene nombre.');
      if (!(l.precioSinIva >= 0)) e.push('La línea ' + (i + 1) + ' tiene un precio inválido.');
    });
    if (f.cliente.documento !== CONSUMIDOR_FINAL && !f.cliente.correo) e.push('Falta el correo del cliente: ahí le llega la factura electrónica.');
    if (f.cliente.tipoDoc === 'NIT' && !f.cliente.dv) e.push('Revisa el NIT del cliente.');
    if (!(f.totales && f.totales.total > 0)) e.push('El total de la venta es cero.');
    return { ok: e.length === 0, errores: e };
  }

  // ── Alegra ───────────────────────────────────────────────
  var TIPO_ALEGRA = { CC: 'CC', NIT: 'NIT', CE: 'CE', TI: 'TI', PAS: 'PP', PPT: 'PP' };
  // Solo CASH aparece en la referencia de Alegra; los demás, por confirmar.
  var MEDIO_ALEGRA = { efectivo: 'CASH', debito: 'DEBIT_CARD', credito: 'CREDIT_CARD', transferencia: 'TRANSFER' };

  function contactoAlegra(f) {
    var c = f.cliente;
    var o = {
      identificationObject: { type: TIPO_ALEGRA[c.tipoDoc] || 'CC', number: c.documento },
      kindOfPerson: c.persona === 'juridica' ? 'LEGAL_ENTITY' : 'PERSON_ENTITY',
      regime: c.persona === 'juridica' ? 'COMMON_REGIME' : 'SIMPLIFIED_REGIME',
      type: ['client']
    };
    if (c.dv) o.identificationObject.dv = c.dv;
    if (c.persona === 'juridica') o.name = c.nombre;
    else o.nameObject = { firstName: c.nombres || c.nombre, lastName: c.apellidos || '' };
    if (c.correo) o.email = c.correo;
    if (c.telefono) o.phonePrimary = c.telefono;
    if (c.direccion) o.address = { address: c.direccion, city: c.ciudad || '' };
    return o;
  }

  // ids: { clienteId, itemId (genérico) | items {sku: id}, impuestos {pct: id}, numeracionId }
  function paraAlegra(f, ids) {
    ids = ids || {};
    var principal = (f.pagos[0] && f.pagos[0].medio) || 'efectivo';
    var cuerpo = {
      date: f.fecha,
      dueDate: f.vence,
      client: { id: String(ids.clienteId || '') },
      items: f.lineas.map(function (l) {
        var it = { id: String((ids.items && ids.items[l.sku]) || ids.itemId || ''), price: l.precioSinIva, quantity: l.cantidad, description: l.nombre, reference: l.sku };
        if (l.ivaPct && ids.impuestos && ids.impuestos[l.ivaPct]) it.tax = [{ id: String(ids.impuestos[l.ivaPct]) }];
        return it;
      }),
      status: 'open',
      paymentForm: f.formaPago === 'credito' ? 'CREDIT' : 'CASH',
      paymentMethod: MEDIO_ALEGRA[principal] || 'CASH',
      anotation: ('Venta ' + f.referencia + (f.notas ? ' · ' + f.notas : '')).slice(0, 500),
      stamp: { generateStamp: true }
    };
    if (ids.numeracionId) cuerpo.numberTemplate = { id: String(ids.numeracionId) };
    return cuerpo;
  }

  // ── Siigo (por confirmar en la cuenta de pruebas) ────────
  var TIPO_SIIGO = { CC: '13', NIT: '31', CE: '22', TI: '12', PAS: '41', PPT: '47' };

  function clienteSiigo(f) {
    var c = f.cliente;
    var o = {
      type: 'Customer',
      person_type: c.persona === 'juridica' ? 'Company' : 'Person',
      id_type: TIPO_SIIGO[c.tipoDoc] || '13',
      identification: c.documento,
      name: c.persona === 'juridica' ? [c.nombre] : [c.nombres || c.nombre, c.apellidos || ''],
      fiscal_responsibilities: [{ code: 'R-99-PN' }],
      address: { address: c.direccion || 'Sin dirección' },
      contacts: c.correo ? [{ first_name: c.nombres || c.nombre, last_name: c.apellidos || '', email: c.correo }] : []
    };
    if (c.dv) o.check_digit = c.dv;
    if (c.telefono) o.phones = [{ number: c.telefono }];
    return o;
  }

  // ids: { documentoId, vendedorId, impuestos {pct: id}, pagos {medio: id}, pagoPorDefecto }
  function paraSiigo(f, ids) {
    ids = ids || {};
    var pagos = f.pagos.length ? f.pagos : [{ medio: 'efectivo', valor: f.totales.total }];
    return {
      document: { id: Number(ids.documentoId) || 0 },
      date: f.fecha,
      customer: { identification: f.cliente.documento, branch_office: 0 },
      seller: Number(ids.vendedorId) || 0,
      observations: ('Venta ' + f.referencia + (f.notas ? ' · ' + f.notas : '')).slice(0, 500),
      items: f.lineas.map(function (l) {
        var it = { code: l.sku || 'VENTA', description: l.nombre, quantity: l.cantidad, price: l.precioSinIva };
        if (l.ivaPct && ids.impuestos && ids.impuestos[l.ivaPct]) it.taxes = [{ id: Number(ids.impuestos[l.ivaPct]) }];
        return it;
      }),
      payments: pagos.map(function (p) { return { id: Number((ids.pagos && ids.pagos[p.medio]) || ids.pagoPorDefecto) || 0, value: p.valor, due_date: f.vence }; }),
      stamp: { send: true },
      mail: { send: !!f.cliente.correo }
    };
  }

  root.FacturaElectronica = {
    CONSUMIDOR_FINAL: CONSUMIDOR_FINAL,
    dvNit: dvNit, desdeVenta: desdeVenta, validar: validar,
    contactoAlegra: contactoAlegra, paraAlegra: paraAlegra,
    clienteSiigo: clienteSiigo, paraSiigo: paraSiigo,
    _partirNombre: partirNombre
  };
})(typeof window !== 'undefined' ? window : globalThis);
