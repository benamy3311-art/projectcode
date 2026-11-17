// ============================================================
// TIENDA — base de datos local (IndexedDB)
// ============================================================
// Guarda clientes, inventario, ventas y la cola de envío al servidor en el
// navegador de la tienda. Mientras no exista el servidor, ESTA es la fuente
// de verdad; cuando exista, sigue siendo la copia local que permite vender
// sin conexión y sin esperas (ver TIENDA_DATOS.md).
//
// Garantías que da este archivo:
//   1. Atómico. Una venta, sus movimientos de inventario, su consecutivo y
//      sus registros para el servidor se escriben en UNA transacción: o
//      queda todo, o no queda nada. Nunca una venta sin descontar
//      inventario ni un número consumido sin venta.
//   2. Idempotente. Cada venta trae su id (uuid) desde la pantalla; si se
//      guarda dos veces (doble clic, reintento), la segunda devuelve la
//      primera sin duplicar.
//   3. Sin borrados. Inventario = suma de un libro de movimientos que solo
//      crece; una venta se anula con movimientos inversos, no se elimina.
//   4. Validado adentro. Las existencias se verifican DENTRO de la
//      transacción, contra el libro, no contra una copia en memoria.
//   5. Recuperable. exportar()/importar() producen y leen una copia
//      completa en JSON; importar solo agrega o actualiza, nunca borra.
//   6. Varias pestañas. Un BroadcastChannel avisa a las demás pestañas de
//      la misma tienda para que refresquen sus datos en memoria.
//
// Globales que expone (window.*):
//   TiendaDB.abrir(opciones) → Promise<Tienda abierta> (ver API al final)
// Depende de: domain/tienda.js (window.Tienda)
// ============================================================
(function (root) {
  'use strict';

  var NOMBRE_DB = 'projectcode-tienda';
  var VERSION_DB = 1;
  var ALMACENES = ['clientes', 'productos', 'movimientos', 'ventas', 'contadores', 'outbox', 'config'];

  function T() {
    var t = root.Tienda || (typeof Tienda !== 'undefined' ? Tienda : null);
    if (!t) throw new Error('Falta domain/tienda.js');
    return t;
  }

  // ── Utilidades de IndexedDB con promesas ───────────
  function req(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function finTx(tx) {
    return new Promise(function (res, rej) {
      tx.oncomplete = function () { res(); };
      tx.onabort = function () { rej(tx.error || new Error('Transacción cancelada')); };
      tx.onerror = function () { /* lo reporta onabort */ };
    });
  }
  // Corre fn(tx) dentro de una transacción y espera a que se confirme en
  // disco. Si fn lanza, la transacción se aborta y no queda nada escrito.
  function enTransaccion(db, almacenes, modo, fn) {
    var tx = db.transaction(almacenes, modo);
    var fin = finTx(tx);
    var resultado;
    var trabajo = Promise.resolve().then(function () { return fn(tx); }).then(function (r) { resultado = r; }, function (e) {
      try { tx.abort(); } catch (_) {}
      throw e;
    });
    return Promise.all([trabajo, fin]).then(function () { return resultado; });
  }

  function migrar(db, viejaVersion) {
    if (viejaVersion < 1) {
      var cli = db.createObjectStore('clientes', { keyPath: 'id' });
      cli.createIndex('clave', 'clave', { unique: true });
      cli.createIndex('actualizado', 'actualizado');
      db.createObjectStore('productos', { keyPath: 'sku' });
      var mov = db.createObjectStore('movimientos', { keyPath: 'id' });
      mov.createIndex('sku', 'sku');
      mov.createIndex('ref', 'ref');
      mov.createIndex('fecha', 'fecha');
      var ven = db.createObjectStore('ventas', { keyPath: 'id' });
      ven.createIndex('numero', 'numero', { unique: true });
      ven.createIndex('fecha', 'fecha');
      ven.createIndex('clienteClave', 'clienteClave');
      db.createObjectStore('contadores', { keyPath: 'clave' });
      var out = db.createObjectStore('outbox', { keyPath: 'id' });
      out.createIndex('estado', 'estado');
      db.createObjectStore('config', { keyPath: 'clave' });
    }
    // Versiones futuras: agregar bloques `if (viejaVersion < 2) {...}` sin
    // tocar los anteriores. Nunca borrar almacenes con datos.
  }

  function abrirDB(idb, nombre) {
    return new Promise(function (res, rej) {
      var r = idb.open(nombre, VERSION_DB);
      r.onupgradeneeded = function (e) { migrar(r.result, e.oldVersion); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('La base de datos está abierta en otra pestaña con una versión anterior. Ciérrala y recarga.')); };
    });
  }

  var CONFIG_POR_DEFECTO = {
    caja: 'C1',               // código de esta caja/computador en los consecutivos
    sede: '',
    permitirSinExistencias: true,
    tienda: { nombre: '', nit: '', telefono: '', direccion: '', correo: '' }
  };

  function abrir(opciones) {
    opciones = opciones || {};
    var idb = opciones.indexedDB || root.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    if (!idb) return Promise.reject(new Error('Este navegador no permite guardar datos locales (IndexedDB).'));
    var nombre = opciones.nombre || NOMBRE_DB;
    var ahora = opciones.ahora || function () { return Date.now(); };

    return abrirDB(idb, nombre).then(function (db) {
      // Copias en memoria para buscar sin esperas. Se rehacen desde el disco
      // al abrir y se actualizan solo DESPUÉS de que una transacción confirma.
      var cache = { clientes: [], stock: {}, productos: {}, config: Object.assign({}, CONFIG_POR_DEFECTO) };
      var oyentes = [];
      var canal = null;
      try { if (typeof BroadcastChannel !== 'undefined') canal = new BroadcastChannel('tienda:' + nombre); } catch (_) {}

      function avisar(tipo, local) {
        oyentes.forEach(function (fn) { try { fn(tipo); } catch (_) {} });
        if (local && canal) { try { canal.postMessage({ tipo: tipo }); } catch (_) {} }
      }
      if (canal) canal.onmessage = function (e) { recargar().then(function () { avisar(e.data && e.data.tipo, false); }); };

      db.onversionchange = function () { db.close(); avisar('cerrada', false); };

      function recargar() {
        return enTransaccion(db, ['clientes', 'movimientos', 'productos', 'config'], 'readonly', function (tx) {
          return Promise.all([
            req(tx.objectStore('clientes').getAll()),
            req(tx.objectStore('movimientos').getAll()),
            req(tx.objectStore('productos').getAll()),
            req(tx.objectStore('config').getAll())
          ]);
        }).then(function (r) {
          cache.clientes = r[0].sort(function (a, b) { return (b.actualizado || 0) - (a.actualizado || 0); });
          cache.stock = T().stockDesde(r[1]);
          cache.productos = {};
          r[2].forEach(function (p) { cache.productos[p.sku] = p; });
          var cfg = Object.assign({}, CONFIG_POR_DEFECTO);
          r[3].forEach(function (c) { cfg[c.clave] = c.valor; });
          cache.config = cfg;
        });
      }

      function registroOutbox(tipo, entidadId, payload) {
        return { id: T().nuevoId(), tipo: tipo, entidadId: entidadId, payload: payload, estado: 'pendiente', creado: ahora(), intentos: 0, ultimoError: '' };
      }

      function stockEnTx(tx, skus) {
        var idx = tx.objectStore('movimientos').index('sku');
        return Promise.all(skus.map(function (sku) {
          return req(idx.getAll(sku)).then(function (movs) { return [sku, movs.reduce(function (s, m) { return s + m.delta; }, 0)]; });
        })).then(function (pares) { var o = {}; pares.forEach(function (p) { o[p[0]] = p[1]; }); return o; });
      }

      function siguienteNumero(tx, tipo, caja) {
        var st = tx.objectStore('contadores');
        var clave = tipo + ':' + caja;
        return req(st.get(clave)).then(function (c) {
          var n = (c && c.valor ? c.valor : 0) + 1;
          return req(st.put({ clave: clave, valor: n })).then(function () { return T().formatearNumero(tipo, caja, n); });
        });
      }

      function upsertCliente(tx, datos, usuario) {
        var st = tx.objectStore('clientes');
        var clave = T().claveCliente(datos.tipoDoc, datos.documento);
        return req(st.index('clave').get(clave)).then(function (prev) {
          var t = ahora();
          var c = Object.assign({}, prev || {}, datos, {
            id: prev ? prev.id : (datos.id || T().nuevoId()),
            clave: clave,
            creado: prev ? prev.creado : t,
            actualizado: t,
            actualizadoPor: usuario || '',
            esquema: T().VERSION_ESQUEMA
          });
          // Un dato opcional vacío no borra el que ya estaba guardado.
          ['correo', 'telefono', 'direccion'].forEach(function (k) { if (!datos[k] && prev && prev[k]) c[k] = prev[k]; });
          return req(st.put(c)).then(function () { return c; });
        });
      }

      // ── API ──────────────────────────────────────────
      var api = {
        nombre: nombre,
        config: function () { return Object.assign({}, cache.config); },
        guardarConfig: function (cambios) {
          if (cambios.caja !== undefined && !T().codigoCajaValido(cambios.caja)) return Promise.reject(new Error('El código de caja debe tener de 1 a 4 letras o números, en mayúscula.'));
          return enTransaccion(db, ['config'], 'readwrite', function (tx) {
            var st = tx.objectStore('config');
            return Promise.all(Object.keys(cambios).map(function (k) { return req(st.put({ clave: k, valor: cambios[k] })); }));
          }).then(recargar).then(function () { avisar('config', true); return api.config(); });
        },

        // Clientes
        clientes: function () { return cache.clientes.slice(); },
        buscarClientes: function (texto, limite) {
          var q = T().textoBusqueda(texto), dig = String(texto || '').replace(/\D/g, '');
          if (!q) return cache.clientes.slice(0, limite || 8);
          return cache.clientes.filter(function (c) {
            return (dig.length >= 3 && c.documento.indexOf(dig) === 0) || T().textoBusqueda(c.nombre).indexOf(q) >= 0;
          }).slice(0, limite || 8);
        },
        clientePorDocumento: function (tipo, doc) {
          var clave = T().claveCliente(tipo, doc);
          for (var i = 0; i < cache.clientes.length; i++) if (cache.clientes[i].clave === clave) return cache.clientes[i];
          return null;
        },
        guardarCliente: function (datos, meta) {
          var r = T().validarCliente(datos);
          if (!r.ok) return Promise.reject(Object.assign(new Error('Datos del cliente incompletos'), { errores: r.errores }));
          if (!r.cliente.autorizaDatos) return Promise.reject(new Error('Sin autorización de tratamiento de datos el cliente no se guarda en el directorio.'));
          var guardado;
          return enTransaccion(db, ['clientes', 'outbox'], 'readwrite', function (tx) {
            return upsertCliente(tx, r.cliente, meta && meta.usuario).then(function (c) {
              guardado = c;
              return req(tx.objectStore('outbox').put(registroOutbox('cliente.guardar', c.id, c)));
            });
          }).then(recargar).then(function () { avisar('clientes', true); return guardado; });
        },

        // Productos que no están en el catálogo del proveedor (servicios, usados…)
        productos: function () { return Object.assign({}, cache.productos); },
        guardarProducto: function (p) {
          var sku = T().limpiarEspacios(p.sku).toUpperCase(), nombreP = T().limpiarEspacios(p.nombre), precio = Math.round(Number(p.precio));
          if (!sku || !nombreP || !(precio >= 0)) return Promise.reject(new Error('Código, nombre y precio son obligatorios.'));
          var prod = { sku: sku, nombre: nombreP, precio: precio, iva: p.iva !== false, categoria: T().limpiarEspacios(p.categoria) || 'ADICIONAL', noInventariable: !!p.noInventariable, actualizado: ahora() };
          return enTransaccion(db, ['productos', 'outbox'], 'readwrite', function (tx) {
            return Promise.all([req(tx.objectStore('productos').put(prod)), req(tx.objectStore('outbox').put(registroOutbox('producto.guardar', sku, prod)))]);
          }).then(recargar).then(function () { avisar('productos', true); return prod; });
        },

        // Inventario
        stock: function () { return Object.assign({}, cache.stock); },
        existencias: function (sku) { return cache.stock[sku] || 0; },
        registrarMovimientos: function (lista, meta) {
          var t = ahora();
          var movs = (lista || []).map(function (m) {
            return { id: m.id || T().nuevoId(), sku: String(m.sku), delta: Number(m.delta), motivo: m.motivo, ref: m.ref || '', nota: T().limpiarEspacios(m.nota), fecha: t, usuario: (meta && meta.usuario) || '', caja: cache.config.caja };
          });
          for (var i = 0; i < movs.length; i++) { var e = T().validarMovimiento(movs[i]); if (e) return Promise.reject(new Error(e)); }
          if (!movs.length) return Promise.resolve([]);
          return enTransaccion(db, ['movimientos', 'outbox'], 'readwrite', function (tx) {
            return Promise.all(movs.map(function (m) {
              return Promise.all([req(tx.objectStore('movimientos').put(m)), req(tx.objectStore('outbox').put(registroOutbox('inventario.movimiento', m.id, m)))]);
            }));
          }).then(recargar).then(function () { avisar('inventario', true); return movs; });
        },
        // Ajuste por conteo físico: la diferencia se calcula dentro de la
        // transacción contra el libro, no contra lo que muestra la pantalla.
        ajustarConteo: function (sku, contado, nota, meta) {
          var mov = null, t = ahora();
          return enTransaccion(db, ['movimientos', 'outbox'], 'readwrite', function (tx) {
            return stockEnTx(tx, [sku]).then(function (s) {
              var m = T().movimientoDeAjuste(sku, contado, s[sku], nota);
              if (!m) return null;
              mov = Object.assign(m, { id: T().nuevoId(), fecha: t, usuario: (meta && meta.usuario) || '', caja: cache.config.caja });
              return Promise.all([req(tx.objectStore('movimientos').put(mov)), req(tx.objectStore('outbox').put(registroOutbox('inventario.movimiento', mov.id, mov)))]);
            });
          }).then(recargar).then(function () { if (mov) avisar('inventario', true); return mov; });
        },
        kardex: function (sku) {
          return enTransaccion(db, ['movimientos'], 'readonly', function (tx) {
            return req(tx.objectStore('movimientos').index('sku').getAll(sku));
          }).then(function (l) { return l.sort(function (a, b) { return b.fecha - a.fecha; }); });
        },

        // Ventas
        // borrador: { id, tipo, cliente, items, pagos, descuentoPct, orden, notas, mostrarIva, guardarCliente }
        registrarVenta: function (borrador, meta) {
          meta = meta || {};
          if (!borrador || !borrador.id) return Promise.reject(new Error('La venta necesita un id.'));
          var resultado = null, duplicada = false, avisos = [];
          var almacenes = ['ventas', 'movimientos', 'contadores', 'outbox', 'clientes'];
          return enTransaccion(db, almacenes, 'readwrite', function (tx) {
            var stV = tx.objectStore('ventas');
            return req(stV.get(borrador.id)).then(function (existe) {
              if (existe) { duplicada = true; resultado = existe; return; }
              var noInv = {};
              (borrador.items || []).forEach(function (it) { if (it.noInventariable) noInv[it.sku] = true; });
              var skus = (borrador.items || []).map(function (i) { return i.sku; }).filter(function (s, i, a) { return a.indexOf(s) === i; });
              return stockEnTx(tx, skus).then(function (stock) {
                var v = T().validarVenta(borrador, { stock: stock, permitirSinExistencias: !!cache.config.permitirSinExistencias, noInventariables: noInv });
                if (!v.ok) throw Object.assign(new Error(v.errores[0]), { errores: v.errores });
                avisos = v.avisos;
                return siguienteNumero(tx, borrador.tipo, cache.config.caja).then(function (numero) {
                  var t = ahora();
                  var c = v.cliente;
                  var venta = {
                    id: borrador.id,
                    numero: numero,
                    tipo: borrador.tipo,
                    estado: 'confirmada',
                    fecha: t,
                    cliente: { tipoDoc: c.tipoDoc, documento: c.documento, nombre: c.nombre, correo: c.correo, telefono: c.telefono, direccion: c.direccion },
                    clienteClave: T().claveCliente(c.tipoDoc, c.documento),
                    items: v.calculo.lineas.map(function (l) {
                      return { sku: l.sku, nombre: l.nombre, categoria: l.categoria || '', cantidad: l.cantidad, precioLista: l.precioLista, precioUnit: l.precioUnit, ivaPct: l.ivaPct, base: l.base, iva: l.iva, total: l.total, garantia: l.garantia || '', noInventariable: !!l.noInventariable };
                    }),
                    descuentoPct: v.calculo.descuentoPct,
                    descuento: v.calculo.descuento,
                    base: v.calculo.base, iva: v.calculo.iva, total: v.calculo.total,
                    pagos: v.pagos.pagos, pagado: v.pagos.pagado, saldo: v.pagos.saldo,
                    orden: borrador.orden || {},
                    notas: T().limpiarEspacios(borrador.notas),
                    mostrarIva: !!borrador.mostrarIva,
                    caja: cache.config.caja, sede: cache.config.sede || '',
                    usuario: meta.usuario || '',
                    avisos: avisos,
                    esquema: T().VERSION_ESQUEMA
                  };
                  var movs = T().movimientosDeVenta(venta).map(function (m) {
                    return Object.assign(m, { id: T().nuevoId(), fecha: t, usuario: venta.usuario, caja: venta.caja });
                  });
                  var out = tx.objectStore('outbox');
                  var pasos = [req(stV.put(venta)), req(out.put(registroOutbox('venta.crear', venta.id, venta)))];
                  movs.forEach(function (m) { pasos.push(req(tx.objectStore('movimientos').put(m))); });
                  resultado = venta;
                  return Promise.all(pasos).then(function () {
                    if (!borrador.guardarCliente || !c.autorizaDatos) return;
                    return upsertCliente(tx, Object.assign({}, c, { ultimaCompra: t }), venta.usuario).then(function (cli) {
                      return req(out.put(registroOutbox('cliente.guardar', cli.id, cli)));
                    });
                  });
                });
              });
            });
          }).then(function () {
            if (duplicada) return { venta: resultado, duplicada: true, avisos: [] };
            return recargar().then(function () { avisar('ventas', true); return { venta: resultado, duplicada: false, avisos: avisos }; });
          });
        },
        anularVenta: function (id, motivo, meta) {
          var venta = null;
          var m = T().limpiarEspacios(motivo);
          if (m.length < 4) return Promise.reject(new Error('Escribe el motivo de la anulación.'));
          return enTransaccion(db, ['ventas', 'movimientos', 'outbox'], 'readwrite', function (tx) {
            var st = tx.objectStore('ventas');
            return req(st.get(id)).then(function (v) {
              if (!v) throw new Error('No existe esa venta.');
              if (v.estado === 'anulada') { venta = v; return; }
              var t = ahora();
              v.estado = 'anulada';
              v.anulacion = { fecha: t, motivo: m, usuario: (meta && meta.usuario) || '' };
              venta = v;
              var movs = T().movimientosDeAnulacion(v).map(function (x) { return Object.assign(x, { id: T().nuevoId(), fecha: t, usuario: v.anulacion.usuario, caja: cache.config.caja }); });
              var pasos = [req(st.put(v)), req(tx.objectStore('outbox').put(registroOutbox('venta.anular', v.id, { id: v.id, anulacion: v.anulacion })))];
              movs.forEach(function (x) { pasos.push(req(tx.objectStore('movimientos').put(x))); });
              return Promise.all(pasos);
            });
          }).then(recargar).then(function () { avisar('ventas', true); return venta; });
        },
        venta: function (id) {
          return enTransaccion(db, ['ventas'], 'readonly', function (tx) { return req(tx.objectStore('ventas').get(id)); });
        },
        ventas: function (opciones) {
          opciones = opciones || {};
          var limite = opciones.limite || 200;
          return enTransaccion(db, ['ventas'], 'readonly', function (tx) {
            return new Promise(function (res, rej) {
              var out = [];
              var KR = root.IDBKeyRange || (typeof IDBKeyRange !== 'undefined' ? IDBKeyRange : null);
              var rango = (opciones.desde || opciones.hasta) && KR ? KR.bound(opciones.desde || 0, opciones.hasta || 8.64e15) : null;
              var cur = tx.objectStore('ventas').index('fecha').openCursor(rango, 'prev');
              cur.onsuccess = function () {
                var c = cur.result;
                if (!c || out.length >= limite) return res(out);
                out.push(c.value); c.continue();
              };
              cur.onerror = function () { rej(cur.error); };
            });
          });
        },
        ventasDeCliente: function (tipo, doc) {
          var clave = T().claveCliente(tipo, doc);
          return enTransaccion(db, ['ventas'], 'readonly', function (tx) { return req(tx.objectStore('ventas').index('clienteClave').getAll(clave)); })
            .then(function (l) { return l.sort(function (a, b) { return b.fecha - a.fecha; }); });
        },

        // Cola para el servidor (la usa infrastructure/tienda-sync.js)
        pendientes: function (limite) {
          return enTransaccion(db, ['outbox'], 'readonly', function (tx) {
            return req(tx.objectStore('outbox').index('estado').getAll('pendiente'));
          }).then(function (l) { return l.sort(function (a, b) { return a.creado - b.creado; }).slice(0, limite || 1000); });
        },
        contarPendientes: function () {
          return enTransaccion(db, ['outbox'], 'readonly', function (tx) { return req(tx.objectStore('outbox').index('estado').count('pendiente')); });
        },
        marcarEnviados: function (ids) {
          var t = ahora();
          return enTransaccion(db, ['outbox'], 'readwrite', function (tx) {
            var st = tx.objectStore('outbox');
            return Promise.all((ids || []).map(function (id) {
              return req(st.get(id)).then(function (r) { if (r) { r.estado = 'enviado'; r.enviado = t; return req(st.put(r)); } });
            }));
          }).then(function () { avisar('sync', true); });
        },
        marcarError: function (id, error) {
          return enTransaccion(db, ['outbox'], 'readwrite', function (tx) {
            var st = tx.objectStore('outbox');
            return req(st.get(id)).then(function (r) { if (r) { r.intentos = (r.intentos || 0) + 1; r.ultimoError = String(error && error.message || error || '').slice(0, 300); return req(st.put(r)); } });
          });
        },

        // Copia de seguridad
        exportar: function () {
          return enTransaccion(db, ALMACENES, 'readonly', function (tx) {
            return Promise.all(ALMACENES.map(function (a) { return req(tx.objectStore(a).getAll()); }));
          }).then(function (r) {
            var datos = {};
            ALMACENES.forEach(function (a, i) { datos[a] = r[i]; });
            return { formato: 'projectcode-tienda', esquema: T().VERSION_ESQUEMA, versionDB: VERSION_DB, exportado: new Date(ahora()).toISOString(), datos: datos };
          });
        },
        // Fusiona: agrega lo que falta y actualiza por id; los contadores
        // quedan en el mayor valor para no repetir números. Nunca borra.
        importar: function (copia) {
          if (!copia || copia.formato !== 'projectcode-tienda' || !copia.datos) return Promise.reject(new Error('El archivo no es una copia de seguridad de la tienda.'));
          if (copia.esquema > T().VERSION_ESQUEMA) return Promise.reject(new Error('La copia es de una versión más nueva de la app. Actualiza antes de importar.'));
          var cuenta = {};
          return enTransaccion(db, ALMACENES, 'readwrite', function (tx) {
            var pasos = [];
            ALMACENES.forEach(function (a) {
              var lista = Array.isArray(copia.datos[a]) ? copia.datos[a] : [];
              cuenta[a] = lista.length;
              var st = tx.objectStore(a);
              lista.forEach(function (reg) {
                if (a === 'contadores') {
                  pasos.push(req(st.get(reg.clave)).then(function (p) { if (!p || p.valor < reg.valor) return req(st.put(reg)); }));
                } else if (a === 'clientes') {
                  pasos.push(req(st.index('clave').get(reg.clave)).then(function (p) {
                    if (p && p.id !== reg.id) return; // mismo documento ya registrado con otro id: se conserva el local
                    if (!p || (reg.actualizado || 0) >= (p.actualizado || 0)) return req(st.put(reg));
                  }));
                } else {
                  pasos.push(req(st.put(reg)));
                }
              });
            });
            return Promise.all(pasos);
          }).then(recargar).then(function () { avisar('importacion', true); return cuenta; });
        },

        // Almacenamiento del navegador
        estadoAlmacenamiento: function () {
          var nav = root.navigator;
          if (!nav || !nav.storage || !nav.storage.estimate) return Promise.resolve({ persistente: null, usado: null, cuota: null });
          return Promise.all([nav.storage.persisted ? nav.storage.persisted() : Promise.resolve(null), nav.storage.estimate()])
            .then(function (r) { return { persistente: r[0], usado: r[1].usage, cuota: r[1].quota }; });
        },
        // Pide al navegador que no borre estos datos para liberar espacio.
        pedirPersistencia: function () {
          var nav = root.navigator;
          if (!nav || !nav.storage || !nav.storage.persist) return Promise.resolve(false);
          return nav.storage.persist();
        },

        alCambiar: function (fn) { oyentes.push(fn); return function () { oyentes = oyentes.filter(function (f) { return f !== fn; }); }; },
        recargar: recargar,
        cerrar: function () { try { canal && canal.close(); } catch (_) {} db.close(); }
      };

      return recargar().then(function () { return api; });
    });
  }

  root.TiendaDB = { abrir: abrir, NOMBRE_DB: NOMBRE_DB, VERSION_DB: VERSION_DB, ALMACENES: ALMACENES };
})(typeof window !== 'undefined' ? window : globalThis);
