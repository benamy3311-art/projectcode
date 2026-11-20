// ============================================================
// LEER LOS DATOS DEL CLIENTE DE UN MENSAJE
// ============================================================
// Cuando se le pide al cliente "en un solo mensaje: nombre, cédula,
// dirección de envío y correo para la factura", cada quien responde a su
// manera: con etiquetas o sin ellas, en líneas o en una sola frase con
// comas, en mayúsculas, con saludo y despedida. Esto saca de ese texto:
//   nombre, tipoDoc + documento, direccion (con la ciudad), correo, telefono
// y dice de dónde salió cada uno ('etiqueta' si el cliente lo rotuló,
// 'patron' si se dedujo), para que la pantalla marque lo que hay que mirar.
//
// No inventa: lo que no encuentra queda vacío y va en `faltan`. Todo es
// editable después; esto solo ahorra el copiar y pegar campo por campo.
//
// Globales que expone (window.*):
//   ExtraerDatos.cliente(texto)     — { nombre, tipoDoc, documento, direccion,
//                                       correo, telefono, origen, faltan, encontrados }
//   ExtraerDatos.pareceDatos(texto) — ¿el mensaje trae datos para facturar?
//
// Depende de: nada (se prueba en tests/extraer-datos.test.js)
// ============================================================
(function (root) {
  'use strict';

  var CIUDADES = ['bogotá', 'bogota', 'medellín', 'medellin', 'cali', 'barranquilla', 'cartagena', 'cúcuta', 'cucuta',
    'bucaramanga', 'pereira', 'santa marta', 'ibagué', 'ibague', 'manizales', 'villavicencio', 'pasto', 'montería', 'monteria',
    'neiva', 'armenia', 'valledupar', 'sincelejo', 'popayán', 'popayan', 'tunja', 'riohacha', 'florencia', 'yopal', 'quibdó',
    'quibdo', 'soacha', 'bello', 'itagüí', 'itagui', 'envigado', 'soledad', 'palmira', 'chía', 'chia', 'zipaquirá', 'zipaquira',
    'facatativá', 'facatativa', 'mosquera', 'funza', 'cajicá', 'cajica', 'rionegro', 'sabaneta', 'dosquebradas',
    'floridablanca', 'girón', 'giron', 'piedecuesta', 'tuluá', 'tulua', 'buenaventura', 'girardot', 'fusagasugá', 'fusagasuga',
    'duitama', 'sogamoso', 'apartadó', 'apartado', 'barrancabermeja', 'cartago', 'jamundí', 'jamundi', 'yumbo', 'malambo',
    'turbaco', 'san andrés', 'san andres', 'leticia', 'arauca', 'mocoa', 'la ceja', 'la estrella', 'copacabana', 'caldas',
    'tocancipá', 'tocancipa', 'sopó', 'sopo', 'la calera', 'cota', 'tenjo', 'tabio', 'madrid'];

  // Etiquetas que la gente escribe antes de cada dato. El orden importa:
  // la primera que encaja gana ("correo" antes que "nombre").
  var ETIQUETAS = [
    ['correo', 'correo(?:\\s+electr[oó]nico)?(?:\\s+(?:para\\s+(?:la\\s+)?)?factura(?:ci[oó]n)?)?|e-?mail|mail'],
    ['direccion', 'direcci[oó]n(?:\\s+(?:de\\s+)?(?:env[ií]o|entrega|despacho|domicilio))?|dir\\.?|domicilio|env[ií]o\\s+a|enviar\\s+a|entregar\\s+en|lugar\\s+de\\s+entrega'],
    ['documento', 'n[uú]mero\\s+de\\s+(?:c[eé]dula|documento|identificaci[oó]n)|c[eé]dula\\s+de\\s+extranjer[ií]a|c[eé]dula(?:\\s+de\\s+ciudadan[ií]a)?|c\\.\\s?c\\.?|cc|documento(?:\\s+de\\s+identidad)?|identificaci[oó]n|nit|c\\.\\s?e\\.?|pasaporte|ppt|t\\.\\s?i\\.?'],
    ['telefono', 'tel[eé]fono|tel\\.?|celular|cel\\.?|celu|whatsapp|wpp|m[oó]vil|n[uú]mero\\s+de\\s+contacto|contacto'],
    ['ciudad', 'ciudad|municipio'],
    ['nombre', 'nombre(?:s)?(?:\\s+(?:completo|y\\s+apellidos?))?|raz[oó]n\\s+social|a\\s+nombre\\s+de|cliente']
  ];
  var RE_ETIQUETA_INICIO = new RegExp('^\\s*(' + ETIQUETAS.map(function (e) { return '(' + e[1] + ')'; }).join('|') + ')(?=[\\s:=.\\-–]|$)\\s*(?:[:=\\-–]\\s*|\\s+)?', 'i');
  // Dentro de una línea, una etiqueta nueva solo cuenta si viene con ":" o
  // "=" (así "Calle 45 cc" o "el cliente" no cortan el texto).
  var RE_ETIQUETA_DENTRO = new RegExp('[,;|•]\\s*(?=(?:' + ETIQUETAS.map(function (e) { return e[1]; }).join('|') + ')\\s*[:=])', 'gi');

  var RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  var RE_CALLE = /\b(?:calle|cl|cll|carrera|cra|kra|kr|cr|crr|avenida|av|ak|ac|diagonal|dg|diag|transversal|tv|tr|trans|autopista|manzana|mz|circular|km|kil[oó]metro|vereda|v[ií]a)\b\.?/i;
  var RE_NUMERO_CASA = /\d+\s*[a-z]?\s*(?:bis\s*)?(?:#|n[oº°]\.?|nro\.?|num\.?)\s*\d+/i;
  var RE_SEGUIDO_DIR = /^(?:apto|apartamento|apt|torre|t\.|casa|interior|int|piso|oficina|of|barrio|br|conjunto|edificio|ed|bloque|bl|manzana|mz|etapa|local|lote|sector|urbanizaci[oó]n|urb|unidad|sur|norte|este|oeste)\b/i;
  var RE_NIT = /(\d[\d.\s]{6,12}\d)\s*-\s*(\d)\b/;
  var RE_NUMERO = /\d[\d.\s]{3,14}\d|\d{5,}/;

  var NO_NOMBRE = ['hola', 'buenas', 'buenos', 'buen', 'dia', 'día', 'días', 'dias', 'tardes', 'tarde', 'noches', 'noche', 'gracias',
    'claro', 'listo', 'ok', 'okay', 'perfecto', 'aqui', 'aquí', 'van', 'son', 'mis', 'datos', 'envio', 'envío', 'factura', 'correo',
    'pago', 'cotizacion', 'cotización', 'precio', 'vale', 'dale', 'bueno', 'saludos', 'atento', 'atenta', 'favor', 'quedo',
    'pendiente', 'muchas', 'mil', 'señor', 'señora', 'sr', 'sra', 'don', 'doña', 'ya', 'te', 'le', 'envío', 'mando', 'paso',
    'transferencia', 'nequi', 'daviplata', 'efectivo', 'apto', 'barrio', 'torre', 'casa', 'conjunto', 'edificio'];
  var CONECTORES = ['de', 'del', 'la', 'las', 'los', 'y', 'san', 'van', 'von', 'da', 'do'];

  // ── Utilidades ───────────────────────────────────────────
  function limpiar(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function sinPuntaFinal(s) { return limpiar(s).replace(/^[\s:=.,;\-–]+|[\s:=.,;\-–!¡?¿]+$/g, ''); }
  function minus(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function nombrePropio(s) {
    var t = limpiar(s);
    if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t; // ya viene con mayúsculas a mano
    return t.toLowerCase().split(' ').map(function (w, i) {
      if (i > 0 && CONECTORES.indexOf(w) >= 0) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  function ciudadEn(s) {
    var m = minus(s);
    for (var i = 0; i < CIUDADES.length; i++) {
      var c = minus(CIUDADES[i]);
      if (new RegExp('(^|[^a-z])' + c.replace(/ /g, '\\s+') + '([^a-z]|$)').test(m)) return CIUDADES[i];
    }
    return '';
  }
  function esSoloCiudad(s) {
    var t = minus(sinPuntaFinal(s)).replace(/\b(d\.?c\.?|colombia|antioquia|valle|cundinamarca|atlantico|santander)\b/g, '').replace(/[\s,.]+/g, ' ').trim();
    return !!t && CIUDADES.some(function (c) { return minus(c) === t; });
  }
  function ciudadBonita(c) {
    var m = { bogota: 'Bogotá', medellin: 'Medellín', cucuta: 'Cúcuta', ibague: 'Ibagué', monteria: 'Montería', popayan: 'Popayán', quibdo: 'Quibdó', itagui: 'Itagüí', chia: 'Chía', zipaquira: 'Zipaquirá', facatativa: 'Facatativá', cajica: 'Cajicá', giron: 'Girón', tulua: 'Tuluá', fusagasuga: 'Fusagasugá', apartado: 'Apartadó', jamundi: 'Jamundí', 'san andres': 'San Andrés', tocancipa: 'Tocancipá', sopo: 'Sopó' };
    return m[minus(c)] || nombrePropio(c);
  }

  function pareceDireccion(s) { return RE_CALLE.test(s) || RE_NUMERO_CASA.test(s); }

  function pareceTelefono(digitos) {
    var d = digitos.replace(/^57(?=3\d{9}$)/, '');
    return /^3\d{9}$/.test(d) || /^60\d{8}$/.test(d);
  }

  function pareceNombre(s) {
    var t = sinPuntaFinal(s);
    if (!t || /\d|@|#/.test(t) || t.length > 80) return false;
    var palabras = t.split(/\s+/);
    var reales = palabras.filter(function (w) { return CONECTORES.indexOf(w.toLowerCase()) < 0; });
    if (reales.length < 2 || reales.length > 6) return false;
    if (!palabras.every(function (w) { return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’.-]+$/.test(w); })) return false;
    if (palabras.some(function (w) { return NO_NOMBRE.indexOf(w.toLowerCase().replace(/[.!¡?¿,]/g, '')) >= 0; })) return false;
    if (esSoloCiudad(t) || pareceDireccion(t)) return false;
    return reales.every(function (w) { return w.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length >= 2; });
  }

  function tipoPorEtiqueta(et) {
    var e = minus(et).replace(/\s+/g, ' ');
    if (/\bnit\b/.test(e)) return 'NIT';
    if (/extranjer|^c\.?\s?e\.?$/.test(e)) return 'CE';
    if (/pasaporte/.test(e)) return 'PAS';
    if (/ppt/.test(e)) return 'PPT';
    if (/^t\.?\s?i\.?$/.test(e)) return 'TI';
    return 'CC';
  }

  function leerDocumento(valor, etiqueta) {
    var v = String(valor || '');
    var nit = RE_NIT.exec(v);
    if (nit) return { tipoDoc: 'NIT', documento: nit[1].replace(/\D/g, '') };
    var m = RE_NUMERO.exec(v);
    if (!m) {
      // Pasaporte o PPT pueden llevar letras
      var alfa = /[A-Za-z]{1,3}\d{5,12}/.exec(v);
      return alfa ? { tipoDoc: tipoPorEtiqueta(etiqueta || 'pasaporte'), documento: alfa[0].toUpperCase() } : null;
    }
    var tipo = etiqueta ? tipoPorEtiqueta(etiqueta) : 'CC';
    // "NIT 900123456" sin dígito de verificación separado
    var d = m[0].replace(/\D/g, '');
    if (tipo === 'NIT' && d.length === 10) d = d.slice(0, 9);
    return { tipoDoc: tipo, documento: d };
  }

  // ── Trocear el mensaje ───────────────────────────────────
  // Líneas; dentro de cada línea, comas y punto y coma. Después se vuelven a
  // pegar los pedazos que siguen a una dirección ("apto 501", "Bogotá").
  function trozos(texto) {
    var out = [];
    String(texto || '').replace(/\r/g, '').split(/\n+/).forEach(function (linea) {
      linea = linea.replace(/^[\s•*\-–·>]+/, '').trim();
      if (!linea) return;
      linea.replace(RE_ETIQUETA_DENTRO, '\u0001').split('\u0001').forEach(function (p) {
        // Las comas separan datos, salvo dentro de "Calle 45 # 12-30, apto 501".
        p.split(/\s*[;|]\s*|\s*,\s*(?!\d)/).forEach(function (q) { q = q.trim(); if (q) out.push(q); });
      });
    });
    return out;
  }

  // ── Principal ────────────────────────────────────────────
  function cliente(texto) {
    var r = { nombre: '', tipoDoc: 'CC', documento: '', direccion: '', correo: '', telefono: '', origen: {}, faltan: [], encontrados: 0 };
    var ciudad = '', partesDir = [], dirAbierta = false;
    var sueltos = [];

    function poner(campo, valor, origen) {
      if (!valor || r[campo]) return false;
      r[campo] = valor; r.origen[campo] = origen;
      return true;
    }

    trozos(texto).forEach(function (t) {
      // "te mando mis datos: Nombre Juan Pérez" → lo que va tras el preámbulo
      // (solo si antes de los dos puntos no hay una etiqueta ni una hora).
      if (!RE_ETIQUETA_INICIO.test(t) && /[A-Za-zÁÉÍÓÚáéíóúñÑ]\s*:/.test(t)) {
        var tras = t.slice(t.lastIndexOf(':') + 1).trim();
        if (tras) t = tras;
      }
      var m = RE_ETIQUETA_INICIO.exec(t);
      var campo = null, etiqueta = '';
      if (m) {
        for (var i = 0; i < ETIQUETAS.length; i++) if (m[i + 2]) { campo = ETIQUETAS[i][0]; etiqueta = m[i + 2]; break; }
      }
      var valor = m ? t.slice(m[0].length) : t;

      // Continuación de una dirección: "apto 501", "barrio X", "Bogotá"
      if (!campo && dirAbierta && (RE_SEGUIDO_DIR.test(t) || esSoloCiudad(t))) {
        if (esSoloCiudad(t)) ciudad = ciudad || sinPuntaFinal(t); else partesDir.push(sinPuntaFinal(t));
        return;
      }
      dirAbierta = false;

      if (campo === 'correo') { var c = RE_CORREO.exec(valor); if (c) poner('correo', c[0].toLowerCase(), 'etiqueta'); return; }
      if (campo === 'documento') {
        var d = leerDocumento(valor, etiqueta);
        if (d && !r.documento) { r.tipoDoc = d.tipoDoc; poner('documento', d.documento, 'etiqueta'); }
        return;
      }
      if (campo === 'telefono') {
        var tel = valor.replace(/[^\d]/g, '').replace(/^57(?=3\d{9}$)/, '');
        if (tel.length >= 7) poner('telefono', tel, 'etiqueta');
        return;
      }
      if (campo === 'ciudad') { ciudad = ciudad || sinPuntaFinal(valor); return; }
      if (campo === 'direccion') {
        var v = sinPuntaFinal(valor);
        if (esSoloCiudad(v)) { ciudad = ciudad || v; return; }
        if (v && !partesDir.length) { partesDir.push(v); r.origen.direccion = 'etiqueta'; dirAbierta = true; }
        return;
      }
      if (campo === 'nombre') {
        var n = sinPuntaFinal(valor);
        if (n && !/@/.test(n)) poner('nombre', nombrePropio(n.replace(/\s+\d[\d.\s]*$/, '')), 'etiqueta');
        return;
      }
      sueltos.push(t);
    });

    // Sin etiqueta: se deduce por la forma de cada pedazo.
    var trasDir = false; // el pedazo anterior fue una dirección sin etiqueta
    sueltos.forEach(function (t) {
      // "mis datos son: Laura Gómez" → lo que va después de los dos puntos
      var s = t.indexOf(':') >= 0 ? t.slice(t.lastIndexOf(':') + 1) : t;
      s = sinPuntaFinal(s);
      if (!s) return;
      if (trasDir && (RE_SEGUIDO_DIR.test(s) || esSoloCiudad(s))) {
        if (esSoloCiudad(s)) ciudad = ciudad || s; else partesDir.push(s);
        return;
      }
      trasDir = false;

      var c = RE_CORREO.exec(s);
      if (c) { poner('correo', c[0].toLowerCase(), 'patron'); s = sinPuntaFinal(s.replace(c[0], '')); if (!s) return; }

      if (pareceDireccion(s)) {
        if (!partesDir.length) { partesDir.push(s); r.origen.direccion = r.origen.direccion || 'patron'; trasDir = true; }
        return;
      }
      if (esSoloCiudad(s)) { ciudad = ciudad || s; return; }

      var nit = RE_NIT.exec(s);
      if (nit && !r.documento) { r.tipoDoc = 'NIT'; poner('documento', nit[1].replace(/\D/g, ''), 'patron'); s = sinPuntaFinal(s.replace(nit[0], '')); }

      var num = RE_NUMERO.exec(s);
      if (num) {
        var dig = num[0].replace(/\D/g, '');
        if (pareceTelefono(dig)) poner('telefono', dig.replace(/^57/, ''), 'patron');
        else if (dig.length >= 5 && dig.length <= 11 && !r.documento) poner('documento', dig, 'patron');
        s = sinPuntaFinal(s.replace(num[0], ''));
      }
      if (s && !r.nombre && pareceNombre(s)) poner('nombre', nombrePropio(s), 'patron');
    });

    // Último recurso para el correo: en cualquier parte del texto.
    if (!r.correo) { var cc = RE_CORREO.exec(String(texto || '')); if (cc) poner('correo', cc[0].toLowerCase(), 'patron'); }

    // Dirección completa, con la ciudad al final si no la trae ya.
    if (partesDir.length) {
      var dir = partesDir.join(', ');
      var c2 = ciudad ? (ciudadEn(ciudad) || ciudad) : ''; // "Bogotá D.C." → Bogotá
      if (c2 && !ciudadEn(dir)) dir += ', ' + ciudadBonita(c2);
      r.direccion = dir.slice(0, 160);
      r.origen.direccion = r.origen.direccion || 'patron';
    } else if (ciudad) {
      r.direccion = ciudadBonita(ciudadEn(ciudad) || ciudad);
      r.origen.direccion = 'patron';
    }

    ['nombre', 'documento', 'direccion', 'correo'].forEach(function (k) { if (!r[k]) r.faltan.push(k); });
    r.encontrados = 4 - r.faltan.length;
    if (!r.documento) r.tipoDoc = 'CC';
    return r;
  }

  // ¿Este mensaje trae datos para facturar? Dos de: documento, dirección,
  // correo (el nombre solo no basta: "Hola, soy Laura" no es una venta).
  function pareceDatos(texto) {
    var r = cliente(texto);
    var n = (r.documento ? 1 : 0) + (r.direccion && pareceDireccion(r.direccion) ? 1 : 0) + (r.correo ? 1 : 0);
    return n >= 2;
  }

  // Con qué dice que pagó o va a pagar ("ya te transferí por Nequi"): el
  // medio de la empresa que nombra, o el más parecido. '' si no dice nada.
  function medioPago(texto, medios) {
    var t = minus(texto);
    if (!t) return '';
    var lista = (medios || []).map(function (m) { return { m: m, k: minus(m) }; });
    var nombra = function (x) { return x.k.length >= 4 && new RegExp('(^|[^a-z])' + x.k.replace(/[^a-z0-9 ]/g, '').replace(/ /g, '\\s+') + '([^a-z]|$)').test(t); };
    // Primero los nombres propios (Nequi, Daviplata, Bancolombia QR): "transferí
    // por Nequi" es Nequi, no Transferencia.
    var generico = /^(efectivo|transferencia|tarjeta)/;
    var propio = lista.filter(function (x) { return !generico.test(x.k) && nombra(x); })[0];
    if (propio) return propio.m;
    var gen = lista.filter(function (x) { return generico.test(x.k) && nombra(x); })[0];
    if (gen) return gen.m;
    var buscar = function (re) { return (lista.filter(function (x) { return re.test(x.k); })[0] || {}).m || ''; };
    if (/\b(transferi|transferencia|transfiero|transfiera|consigne|consigno|consigna|consignacion|consignar|pse)\b/.test(t)) return buscar(/transfer/);
    if (/\b(efectivo|contraentrega|contra entrega)\b/.test(t)) return buscar(/efectivo/);
    return '';
  }

  root.ExtraerDatos = { cliente: cliente, pareceDatos: pareceDatos, medioPago: medioPago };
})(typeof window !== 'undefined' ? window : globalThis);
