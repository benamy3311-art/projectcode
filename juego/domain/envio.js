// ============================================================
// COSTO DE ENVÍO ESTIMADO
// ============================================================
// La guía la hace la empresa con su transportadora; la app solo responde lo
// que el cliente pregunta siempre: "¿y cuánto me sale el envío a Medellín?".
//
// Cómo calcula (igual que cobran las transportadoras en Colombia):
//   - Zona del destino: la primera zona que nombra la ciudad; si ninguna la
//     nombra, la zona sin ciudades ("Resto del país").
//   - Peso cobrado: cada producto pesa según su categoría (peso de la caja,
//     con volumen incluido); el primer kilo va en la tarifa base.
//   - Flete = base de la zona + kilos adicionales x valor del kilo.
//   - Seguro (costo de manejo) = % del valor declarado, con un mínimo.
//   - Se redondea a miles y se da un rango (-10 % / +15 %): es un estimado.
//
// La empresa ajusta zonas, tarifas, pesos y seguro en Mi empresa; se guarda
// en Firestore en config/envios (infrastructure/empresa-config.js).
//
// Globales que expone (window.*):
//   Envio.porDefecto()               — tarifas de ejemplo para arrancar
//   Envio.normalizar(raw)            — configuración segura a partir de cualquier cosa
//   Envio.zonaDe(ciudad, cfg)        — la zona que aplica
//   Envio.estimar({ ciudad, items, cfg }) → { ciudad, zona, kg, flete, seguro, total, desde, hasta, dias } | null
//   Envio.usar(cfg) / Envio.actual()  — configuración activa
//
// items: [{ categoria, cantidad, precio }] (precio en pesos, por unidad)
// Depende de: nada (se prueba en tests/envio.test.js)
// ============================================================
(function (root) {
  'use strict';

  var MAX_ZONAS = 12, MAX_CIUDADES = 120;

  // Peso de envío por categoría en kg (caja incluida, redondeado hacia arriba
  // por volumen: un monitor de 27" pesa 5 kg pero se cobra como 9).
  var PESOS = {
    'PORTÁTIL': 3.5, 'ENSAMBLADO': 15, 'CAJA': 12, 'MONITOR': 9, 'FUENTE': 2.5, 'GRÁFICA': 2, 'BOARD': 1.5,
    'PROCESADOR': 0.5, 'MEMORIA': 0.3, 'ALMACENAMIENTO': 0.3, 'DISIPADOR': 1.5, 'TECLADO': 1.5, 'MOUSE': 0.5,
    'AUDÍFONOS': 0.8, 'PERIFÉRICOS': 1, 'MUEBLE': 25, 'SIMULADOR': 6, 'RED': 0.8, 'ACCESORIO PORTÁTIL': 1,
    'LIMPIEZA': 0.5, 'ADICIONAL': 1
  };

  function porDefecto() {
    return {
      origen: 'Bogotá',
      zonas: [
        { nombre: 'Misma ciudad', ciudades: ['Bogotá', 'Soacha'], base: 12000, porKg: 600, dias: '1 día' },
        { nombre: 'Cerca', ciudades: ['Chía', 'Cajicá', 'Zipaquirá', 'Mosquera', 'Funza', 'Madrid', 'Facatativá', 'Cota', 'La Calera', 'Sopó', 'Tocancipá', 'Fusagasugá', 'Girardot', 'Tunja', 'Villavicencio'], base: 15000, porKg: 1500, dias: '1 a 2 días' },
        { nombre: 'Ciudades principales', ciudades: ['Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Manizales', 'Armenia', 'Ibagué', 'Neiva', 'Cúcuta', 'Santa Marta', 'Montería', 'Pasto', 'Popayán', 'Valledupar', 'Sincelejo', 'Bello', 'Envigado', 'Itagüí', 'Sabaneta', 'Rionegro', 'Palmira', 'Floridablanca', 'Girón', 'Soledad', 'Dosquebradas', 'Tuluá', 'Jamundí'], base: 18000, porKg: 2400, dias: '2 a 3 días' },
        { nombre: 'Resto del país', ciudades: [], base: 24000, porKg: 3400, dias: '3 a 6 días' }
      ],
      seguroPct: 1,
      seguroMin: 4000,
      pesos: Object.assign({}, PESOS)
    };
  }

  function minus(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(d\.?\s?c\.?|colombia)\b/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function num(v, min, max, def) { var n = Number(v); return isFinite(n) && n >= min && n <= max ? n : def; }
  function texto(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }

  function normalizar(raw) {
    var d = porDefecto();
    if (!raw || typeof raw !== 'object') return d;
    if (texto(raw.origen, 60)) d.origen = texto(raw.origen, 60);
    if (Array.isArray(raw.zonas)) {
      var zonas = raw.zonas.slice(0, MAX_ZONAS).map(function (z) {
        z = z || {};
        var vistas = {};
        var ciudades = (Array.isArray(z.ciudades) ? z.ciudades : String(z.ciudades || '').split(/[,\n]/)).map(function (c) { return texto(c, 40); })
          .filter(function (c) { var k = minus(c); if (!k || vistas[k]) return false; vistas[k] = true; return true; }).slice(0, MAX_CIUDADES);
        return { nombre: texto(z.nombre, 40) || 'Zona', ciudades: ciudades, base: Math.round(num(z.base, 0, 2000000, 0)), porKg: Math.round(num(z.porKg, 0, 200000, 0)), dias: texto(z.dias, 30) };
      });
      if (zonas.length) d.zonas = zonas;
    }
    d.seguroPct = num(raw.seguroPct, 0, 10, d.seguroPct);
    d.seguroMin = Math.round(num(raw.seguroMin, 0, 500000, d.seguroMin));
    if (raw.pesos && typeof raw.pesos === 'object') {
      Object.keys(raw.pesos).slice(0, 60).forEach(function (k) {
        var n = num(raw.pesos[k], 0, 500, null);
        if (n != null && texto(k, 40)) d.pesos[texto(k, 40).toUpperCase()] = n;
      });
    }
    return d;
  }

  function zonaDe(ciudad, cfg) {
    var c = normalizar(cfg);
    var k = minus(ciudad);
    if (!k) return null;
    for (var i = 0; i < c.zonas.length; i++) {
      if (c.zonas[i].ciudades.some(function (x) { return minus(x) === k; })) return c.zonas[i];
    }
    var resto = c.zonas.filter(function (z) { return !z.ciudades.length; });
    return resto.length ? resto[resto.length - 1] : c.zonas[c.zonas.length - 1];
  }

  function mil(n) { return Math.round(n / 1000) * 1000; }

  function estimar(o) {
    o = o || {};
    var cfg = normalizar(o.cfg);
    var zona = zonaDe(o.ciudad, cfg);
    if (!zona) return null;
    var kg = 0, valor = 0, unidades = 0;
    (o.items || []).forEach(function (it) {
      var n = Math.max(1, Math.round(Number(it.cantidad) || 1));
      var cat = String(it.categoria || 'ADICIONAL').toUpperCase();
      var p = cfg.pesos[cat];
      kg += (p == null ? 1 : p) * n;
      valor += Math.max(0, Number(it.precio) || 0) * n;
      unidades += n;
    });
    if (!unidades) return null;
    kg = Math.max(1, Math.ceil(kg - 1e-9));
    var flete = zona.base + Math.max(0, kg - 1) * zona.porKg;
    var seguro = Math.max(cfg.seguroMin, valor * cfg.seguroPct / 100);
    var total = mil(flete + seguro);
    return {
      ciudad: String(o.ciudad).trim(), zona: zona.nombre, kg: kg, flete: Math.round(flete), seguro: Math.round(seguro),
      total: total, desde: mil(total * 0.9), hasta: mil(total * 1.15), dias: zona.dias
    };
  }

  // Lo que se guarda en Firestore: solo los campos conocidos.
  function paraGuardar(cfg) {
    var c = normalizar(cfg);
    return { origen: c.origen, zonas: c.zonas, seguroPct: c.seguroPct, seguroMin: c.seguroMin, pesos: c.pesos };
  }

  var _actual = porDefecto();

  root.Envio = {
    PESOS: Object.assign({}, PESOS),
    porDefecto: porDefecto,
    normalizar: normalizar,
    paraGuardar: paraGuardar,
    zonaDe: zonaDe,
    estimar: function (o) { o = o || {}; return estimar({ ciudad: o.ciudad, items: o.items, cfg: o.cfg || _actual }); },
    usar: function (cfg) { _actual = normalizar(cfg); return normalizar(_actual); },
    actual: function () { return normalizar(_actual); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
