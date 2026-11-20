// ============================================================
// TIENDA — reglas de ventas, clientes e inventario (lógica pura)
// ============================================================
// Todo lo que decide si una venta es válida y cuánto vale, sin DOM ni
// almacenamiento. Lo usan ui/vender.js, ui/inventario.js y
// infrastructure/tienda-db.js, y lo prueba tests/tienda.test.js cargando
// este mismo archivo. Diseño completo en TIENDA_DATOS.md.
//
// Reglas de oro (para que la información no se pierda ni se contradiga):
//   - Dinero en pesos enteros (COP completo, nunca miles ni decimales).
//   - El inventario NO se guarda como un número que se pisa: es la suma de
//     un libro de movimientos que solo crece (entradas, ventas, ajustes,
//     anulaciones). Así siempre se puede reconstruir y auditar.
//   - Nada se borra: una venta mal hecha se ANULA con movimientos inversos.
//   - Cada registro nace con un id único (uuid) que sirve de llave de
//     idempotencia: si el envío al servidor se repite, no se duplica.
//
// Globales que expone (window.*):
//   Tienda — objeto con las funciones de abajo
// Depende de: nada
// ============================================================
(function (root) {
  'use strict';

  var VERSION_ESQUEMA = 1;
  var IVA_GENERAL = 19;

  var TIPOS_DOC = {
    CC: 'Cédula de ciudadanía',
    NIT: 'NIT',
    CE: 'Cédula de extranjería',
    TI: 'Tarjeta de identidad',
    PPT: 'Permiso por protección temporal',
    PAS: 'Pasaporte'
  };
  var MEDIOS_PAGO = ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia', 'Nequi', 'Daviplata'];

  // Lo que cambia por empresa (domain/empresa.js, "Mi empresa"): los medios
  // de pago aceptados y la tarifa de IVA. 0 = no es responsable de IVA: los
  // precios son finales y no se despeja base ni IVA. Lo fija configurar();
  // sin llamarlo, queda como siempre.
  var _medios = MEDIOS_PAGO.slice();
  var _tasa = IVA_GENERAL;
  function configurar(c) {
    c = c || {};
    if (Array.isArray(c.mediosPago) && c.mediosPago.length) _medios = c.mediosPago.slice();
    if (typeof c.tasaIva === 'number' && c.tasaIva >= 0 && c.tasaIva <= 30) _tasa = c.tasaIva;
  }
  var TIPOS_VENTA = {
    recibo: { nombre: 'Recibo de compra', prefijo: 'RC' },
    remision: { nombre: 'Remisión', prefijo: 'RM' }
  };
  var MOTIVOS = ['entrada', 'venta', 'ajuste', 'anulacion', 'devolucion', 'inicial'];

  // ── Texto ──────────────────────────────────────────
  function limpiarEspacios(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function textoBusqueda(s) {
    return limpiarEspacios(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // ── Documentos de identidad ────────────────────────
  // Cédulas, NIT y tarjetas de identidad se guardan solo con dígitos (los
  // puntos y espacios de cómo lo escriba cada asesor no cambian la persona).
  // Pasaporte y PPT pueden llevar letras.
  function normalizarDocumento(tipo, doc) {
    var t = TIPOS_DOC[tipo] ? tipo : 'CC';
    var s = String(doc == null ? '' : doc).toUpperCase();
    if (t === 'PAS' || t === 'PPT') return s.replace(/[^0-9A-Z]/g, '');
    if (t === 'NIT') s = s.split('-')[0]; // el dígito de verificación se calcula, no se guarda
    return s.replace(/\D/g, '');
  }

  // Dígito de verificación del NIT (algoritmo de la DIAN, módulo 11).
  function digitoVerificacionNIT(nit) {
    var n = String(nit || '').replace(/\D/g, '');
    if (!n) return null;
    var pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    var suma = 0;
    for (var i = 0; i < n.length; i++) {
      var p = pesos[n.length - 1 - i];
      if (p === undefined) return null;
      suma += Number(n.charAt(i)) * p;
    }
    var r = suma % 11;
    return r > 1 ? 11 - r : r;
  }

  function formatearDocumento(tipo, doc) {
    var d = normalizarDocumento(tipo, doc);
    if (!d) return '';
    if (tipo === 'PAS' || tipo === 'PPT') return d;
    var conPuntos = d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (tipo === 'NIT') { var dv = digitoVerificacionNIT(d); return conPuntos + (dv === null ? '' : '-' + dv); }
    return conPuntos;
  }

  function claveCliente(tipo, doc) {
    var t = TIPOS_DOC[tipo] ? tipo : 'CC';
    return t + ':' + normalizarDocumento(t, doc);
  }

  // ── Cliente ────────────────────────────────────────
  // Obligatorios: nombre y documento. Lo demás es opcional, pero si viene
  // tiene que tener sentido (un correo mal escrito no sirve para nada).
  var RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validarCliente(c) {
    c = c || {};
    var errores = {};
    var tipo = TIPOS_DOC[c.tipoDoc] ? c.tipoDoc : 'CC';
    var nombre = limpiarEspacios(c.nombre);
    var documento = normalizarDocumento(tipo, c.documento);
    var correo = limpiarEspacios(c.correo).toLowerCase();
    var telefono = String(c.telefono == null ? '' : c.telefono).replace(/[^\d+]/g, '');
    var direccion = limpiarEspacios(c.direccion);

    if (nombre.length < 3) errores.nombre = 'Escribe el nombre del cliente.';
    else if (nombre.length > 120) errores.nombre = 'El nombre es demasiado largo.';

    if (!documento) errores.documento = 'Escribe el número de documento.';
    else if ((tipo === 'CC' || tipo === 'TI') && (documento.length < 5 || documento.length > 11)) errores.documento = 'La cédula debe tener entre 5 y 11 dígitos.';
    else if (tipo === 'NIT' && (documento.length < 8 || documento.length > 10)) errores.documento = 'El NIT debe tener 9 dígitos (sin el de verificación).';
    else if (documento.length < 3 || documento.length > 20) errores.documento = 'Revisa el número de documento.';

    if (correo && !RE_CORREO.test(correo)) errores.correo = 'Ese correo no parece válido.';
    var digitosTel = telefono.replace(/\D/g, '');
    if (telefono && (digitosTel.length < 7 || digitosTel.length > 15)) errores.telefono = 'Revisa el teléfono (7 a 15 dígitos).';
    if (direccion.length > 160) errores.direccion = 'La dirección es demasiado larga.';

    var ok = Object.keys(errores).length === 0;
    return {
      ok: ok,
      errores: errores,
      cliente: {
        tipoDoc: tipo,
        documento: documento,
        nombre: nombre,
        correo: correo,
        telefono: telefono,
        direccion: direccion,
        autorizaDatos: !!c.autorizaDatos
      }
    };
  }

  // ── Dinero ─────────────────────────────────────────
  function pesos(n) { var v = Math.round(Number(n) || 0); return v === 0 ? 0 : v; }
  function cantidadValida(q) { return Number.isInteger(q) && q > 0 && q <= 100000; }

  // Una línea: el precio unitario ya incluye IVA cuando el producto lo lleva
  // (así se cotiza en la tienda). La base se despeja por línea, no por
  // unidad, para que la suma de líneas cuadre con el total impreso.
  function calcularLinea(item) {
    var cant = Number(item.cantidad);
    var precio = pesos(item.precioUnit);
    var tasa = !_tasa || item.iva === false || item.ivaPct === 0 ? 0 : (Number(item.ivaPct) || _tasa);
    var total = pesos(precio * cant);
    var base = tasa ? pesos(total / (1 + tasa / 100)) : total;
    return { cantidad: cant, precioUnit: precio, ivaPct: tasa, base: base, iva: total - base, total: total };
  }

  // Descuento opcional en porcentaje (pago de contado, por ejemplo): se
  // aplica a cada línea antes de despejar el IVA.
  function calcularVenta(items, opciones) {
    var dPct = Math.max(0, Math.min(50, Number(opciones && opciones.descuentoPct) || 0));
    var lineas = [], base = 0, iva = 0, total = 0, unidades = 0, bruto = 0;
    (items || []).forEach(function (it) {
      var precioFinal = dPct ? pesos(it.precioUnit * (1 - dPct / 100)) : pesos(it.precioUnit);
      var l = calcularLinea({ cantidad: it.cantidad, precioUnit: precioFinal, iva: it.iva, ivaPct: it.ivaPct });
      bruto += pesos(it.precioUnit) * (Number(it.cantidad) || 0);
      lineas.push(Object.assign({}, it, l, { precioLista: pesos(it.precioUnit) }));
      base += l.base; iva += l.iva; total += l.total; unidades += l.cantidad;
    });
    return { lineas: lineas, base: base, iva: iva, total: total, unidades: unidades, descuentoPct: dPct, descuento: bruto - total };
  }

  // Pagos: en un recibo lo pagado debe cubrir el total exacto. En una
  // remisión puede quedar saldo (mercancía entregada a crédito o con abono).
  function validarPagos(pagos, total, tipo) {
    var lista = (pagos || []).filter(function (p) { return p && pesos(p.valor) > 0; });
    var errores = [];
    var pagado = 0;
    lista.forEach(function (p) {
      if (_medios.indexOf(p.medio) < 0) errores.push('Medio de pago no reconocido: ' + p.medio);
      pagado += pesos(p.valor);
    });
    if (tipo === 'recibo') {
      if (!lista.length) errores.push('Registra cómo pagó el cliente.');
      else if (pagado !== total) errores.push(pagado < total ? 'Falta registrar ' + (total - pagado) + ' pesos del pago.' : 'Lo registrado supera el total en ' + (pagado - total) + ' pesos.');
    } else if (pagado > total) {
      errores.push('El abono supera el total.');
    }
    return { ok: errores.length === 0, errores: errores, pagado: pagado, saldo: Math.max(0, total - pagado), pagos: lista.map(function (p) { return { medio: p.medio, valor: pesos(p.valor) }; }) };
  }

  // ── Venta completa ─────────────────────────────────
  // stock: mapa sku → existencias. Con permitirSinExistencias en false, no
  // se puede vender más de lo que hay; en true solo se avisa.
  function validarVenta(v, opciones) {
    opciones = opciones || {};
    var errores = [], avisos = [];
    var rc = validarCliente(v.cliente);
    if (!rc.ok) errores.push('Faltan datos del cliente: ' + Object.keys(rc.errores).join(', ') + '.');
    if (!TIPOS_VENTA[v.tipo]) errores.push('Tipo de documento desconocido.');
    if (!v.items || !v.items.length) errores.push('Agrega al menos un producto.');
    var porSku = {};
    (v.items || []).forEach(function (it) {
      if (!it.sku) errores.push('Hay un producto sin código.');
      if (!cantidadValida(Number(it.cantidad))) errores.push('Cantidad inválida en ' + (it.nombre || it.sku) + '.');
      if (!(pesos(it.precioUnit) >= 0)) errores.push('Precio inválido en ' + (it.nombre || it.sku) + '.');
      porSku[it.sku] = (porSku[it.sku] || 0) + (Number(it.cantidad) || 0);
    });
    if (opciones.stock) {
      Object.keys(porSku).forEach(function (sku) {
        if (opciones.noInventariables && opciones.noInventariables[sku]) return;
        var hay = Number(opciones.stock[sku]) || 0;
        if (porSku[sku] > hay) {
          var msg = 'Sin existencias suficientes de ' + sku + ' (hay ' + hay + ', se venden ' + porSku[sku] + ').';
          if (opciones.permitirSinExistencias) avisos.push(msg); else errores.push(msg);
        }
      });
    }
    var calc = calcularVenta(v.items || [], { descuentoPct: v.descuentoPct });
    var rp = validarPagos(v.pagos, calc.total, v.tipo);
    rp.errores.forEach(function (e) { errores.push(e); });
    return { ok: errores.length === 0, errores: errores, avisos: avisos, calculo: calc, pagos: rp, cliente: rc.cliente };
  }

  // ── Numeración ─────────────────────────────────────
  // RC-N1-000123: tipo, código de la caja y consecutivo de esa caja. Con el
  // código de caja, dos computadores que venden sin conexión nunca generan
  // el mismo número.
  function codigoCajaValido(c) { return /^[A-Z0-9]{1,4}$/.test(String(c || '')); }
  function formatearNumero(tipo, caja, n) {
    var t = TIPOS_VENTA[tipo]; if (!t) throw new Error('Tipo de venta desconocido');
    if (!codigoCajaValido(caja)) throw new Error('Código de caja inválido');
    if (!Number.isInteger(n) || n < 1) throw new Error('Consecutivo inválido');
    return t.prefijo + '-' + caja + '-' + String(n).padStart(6, '0');
  }

  // ── Inventario: libro de movimientos ───────────────
  function movimientosDeVenta(venta) {
    return (venta.items || []).filter(function (it) { return !it.noInventariable; }).map(function (it) {
      return { sku: it.sku, delta: -Number(it.cantidad), motivo: 'venta', ref: venta.id, nota: venta.numero || '' };
    });
  }
  function movimientosDeAnulacion(venta) {
    return movimientosDeVenta(venta).map(function (m) {
      return { sku: m.sku, delta: -m.delta, motivo: 'anulacion', ref: venta.id, nota: 'Anula ' + (venta.numero || '') };
    });
  }
  // Ajuste por conteo físico: el movimiento es la diferencia con lo que el
  // libro dice que hay; si coincide, no hace falta movimiento.
  function movimientoDeAjuste(sku, contado, actual, nota) {
    var c = Number(contado), a = Number(actual) || 0;
    if (!Number.isInteger(c) || c < 0) throw new Error('El conteo debe ser un número entero de 0 en adelante');
    if (c === a) return null;
    return { sku: sku, delta: c - a, motivo: 'ajuste', ref: '', nota: limpiarEspacios(nota) || ('Conteo: ' + c) };
  }
  function validarMovimiento(m) {
    if (!m || !m.sku) return 'Falta el código del producto.';
    if (!Number.isInteger(m.delta) || m.delta === 0) return 'La cantidad debe ser un entero distinto de cero.';
    if (MOTIVOS.indexOf(m.motivo) < 0) return 'Motivo de movimiento desconocido.';
    return '';
  }
  function stockDesde(movimientos) {
    var s = {};
    (movimientos || []).forEach(function (m) { s[m.sku] = (s[m.sku] || 0) + Number(m.delta || 0); });
    return s;
  }

  // ── Total en letras (recibo) ───────────────────────
  var U = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  var D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  var C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  function menosDeMil(n) {
    if (n === 0) return '';
    if (n === 100) return 'cien';
    var c = Math.floor(n / 100), r = n % 100, out = C[c];
    var dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '');
    return limpiarEspacios(out + ' ' + dec);
  }
  // «uno» se acorta delante de un sustantivo: veintiún mil, un millón, treinta y un pesos.
  function apocope(t) { return t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un'); }
  function enLetras(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'cero';
    var partes = [];
    var millones = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    if (millones) {
      if (millones >= 1000) {
        var milMill = Math.floor(millones / 1000), restoMill = millones % 1000;
        partes.push((milMill === 1 ? 'mil' : apocope(menosDeMil(milMill)) + ' mil') + (restoMill ? ' ' + apocope(menosDeMil(restoMill)) : '') + ' millones');
      } else partes.push(millones === 1 ? 'un millón' : apocope(menosDeMil(millones)) + ' millones');
    }
    if (miles) partes.push(miles === 1 ? 'mil' : apocope(menosDeMil(miles)) + ' mil');
    if (resto) partes.push(menosDeMil(resto));
    return partes.join(' ');
  }
  function totalEnLetras(n) {
    var t = apocope(enLetras(n));
    var deFinal = /(millón|millones)$/.test(t) ? ' de' : '';
    return (t.charAt(0).toUpperCase() + t.slice(1)) + deFinal + ' pesos m/cte.';
  }

  // ── Identificadores ────────────────────────────────
  function nuevoId() {
    var c = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  root.Tienda = {
    VERSION_ESQUEMA: VERSION_ESQUEMA,
    IVA_GENERAL: IVA_GENERAL,
    TIPOS_DOC: TIPOS_DOC,
    MEDIOS_PAGO: MEDIOS_PAGO,
    configurar: configurar,
    mediosPago: function () { return _medios.slice(); },
    tasaIva: function () { return _tasa; },
    TIPOS_VENTA: TIPOS_VENTA,
    MOTIVOS: MOTIVOS,
    limpiarEspacios: limpiarEspacios,
    textoBusqueda: textoBusqueda,
    normalizarDocumento: normalizarDocumento,
    digitoVerificacionNIT: digitoVerificacionNIT,
    formatearDocumento: formatearDocumento,
    claveCliente: claveCliente,
    validarCliente: validarCliente,
    calcularLinea: calcularLinea,
    calcularVenta: calcularVenta,
    validarPagos: validarPagos,
    validarVenta: validarVenta,
    codigoCajaValido: codigoCajaValido,
    formatearNumero: formatearNumero,
    movimientosDeVenta: movimientosDeVenta,
    movimientosDeAnulacion: movimientosDeAnulacion,
    movimientoDeAjuste: movimientoDeAjuste,
    validarMovimiento: validarMovimiento,
    stockDesde: stockDesde,
    enLetras: enLetras,
    totalEnLetras: totalEnLetras,
    nuevoId: nuevoId
  };
})(typeof window !== 'undefined' ? window : globalThis);
