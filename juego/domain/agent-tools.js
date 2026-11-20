// ============================================================
// HERRAMIENTAS DEL ASESOR IA
// ============================================================
// Lo que el modelo puede HACER con la app, escrito como funciones puras: sin
// DOM, sin Firebase y sin fetch. Es la diferencia entre meterle el catálogo
// entero dentro del prompt (lo que hacen hoy "Cotizar competencia" y "Armar
// PC", y por eso hubo que recortarlo) y darle herramientas que consulta cuando
// las necesita: el modelo pide "boards AM5 hasta 600 mil" y acá se le responde
// con el catálogo real.
//
// Puro a propósito: este mismo archivo lo carga el navegador con un <script> y
// —cuando llegue el asesor para clientes— lo cargará la función de servidor.
// Una sola implementación, un solo lugar donde se arreglan los errores.
//
// Globales que expone (window.*):
//   AgentTools.registrar(def)              — agrega una herramienta al registro
//   AgentTools.definiciones()              — el esquema que se le manda al modelo
//   AgentTools.ejecutar(nombre, args, ctx) — corre una herramienta (Promise)
//   AgentTools.normalizarCatalogo(src, o)  — catálogo de la app -> forma interna
//   AgentTools.promptSistema(opts)         — las reglas del asistente
//   AgentTools._buscar(...)                — expuesto para los tests
//
// UNIDADES: el catálogo en memoria de la app va en MILES de COP y el JSON
// publicado va en COP completo. Todo lo que sale de acá va en COP completo y
// en un campo que lo dice (precio_cop), porque el modelo no puede adivinar la
// unidad y un cero de más es una cotización perdida.
//
// Depende de: nada.
// ============================================================
(function (root) {
  'use strict';

  var HERRAMIENTAS = {};

  // ── Texto ───────────────────────────────────────────────────

  // Minúsculas, sin tildes y sin puntuación: "Board ASUS PRIME B650M-A" y
  // "board asus prime b650m a" tienen que ser lo mismo al comparar.
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  var VACIAS = { de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, un: 1, una: 1, para: 1, con: 1, sin: 1, por: 1, que: 1, y: 1, o: 1, en: 1, mas: 1, muy: 1, algo: 1, tenga: 1, quiero: 1, busco: 1, necesito: 1 };

  function tokens(s) {
    var out = [], parts = norm(s).split(' ');
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i];
      if (!t || VACIAS[t]) continue;
      if (t.length < 2) continue;
      out.push(t);
    }
    return out;
  }

  // Palabras con las que un cliente (o el modelo) nombra una categoría. Sirven
  // para dos cosas: deducir la categoría de una consulta suelta y no castigar
  // una palabra que describe bien al producto aunque no esté en su nombre.
  var SINONIMOS = [
    { cat: 'GRÁFICA',        p: ['grafica', 'gpu', 'video', 'tarjeta', 'rtx', 'gtx', 'radeon', 'geforce'] },
    { cat: 'PROCESADOR',     p: ['procesador', 'cpu', 'ryzen', 'core', 'intel', 'amd'] },
    { cat: 'BOARD',          p: ['board', 'motherboard', 'placa', 'madre', 'tarjeta madre', 'mainboard'] },
    { cat: 'MEMORIA',        p: ['memoria', 'ram', 'ddr4', 'ddr5'] },
    { cat: 'ALMACENAMIENTO', p: ['disco', 'ssd', 'nvme', 'hdd', 'almacenamiento', 'm2'] },
    { cat: 'FUENTE',         p: ['fuente', 'psu', 'poder', 'vatios'] },
    { cat: 'CAJA',           p: ['caja', 'chasis', 'gabinete', 'torre', 'case'] },
    { cat: 'DISIPADOR',      p: ['disipador', 'cooler', 'refrigeracion', 'ventilador', 'aio'] },
    { cat: 'MONITOR',        p: ['monitor', 'pantalla'] },
    { cat: 'PORTÁTIL',       p: ['portatil', 'laptop', 'notebook'] },
    { cat: 'TECLADO',        p: ['teclado'] },
    { cat: 'MOUSE',          p: ['mouse', 'raton'] },
    { cat: 'AUDÍFONOS',      p: ['audifonos', 'diadema', 'headset', 'auriculares'] },
    { cat: 'ENSAMBLADO',     p: ['equipo', 'computador', 'pc', 'torre armada', 'ensamblado'] }
  ];

  var CAT_DE_PALABRA = (function () {
    var m = {};
    for (var i = 0; i < SINONIMOS.length; i++) {
      for (var j = 0; j < SINONIMOS[i].p.length; j++) m[norm(SINONIMOS[i].p[j])] = SINONIMOS[i].cat;
    }
    return m;
  })();

  /** Categoría que sugiere un texto libre, o '' si no sugiere ninguna. */
  function categoriaDeTexto(txt) {
    var ts = tokens(txt);
    for (var i = 0; i < ts.length; i++) if (CAT_DE_PALABRA[ts[i]]) return CAT_DE_PALABRA[ts[i]];
    return '';
  }

  // ── Catálogo ────────────────────────────────────────────────

  /**
   * Pasa el catálogo de la app a la forma que consumen las herramientas.
   * opts.unidad: 'miles' (catálogo en memoria) | 'cop' (JSON publicado).
   */
  function normalizarCatalogo(src, opts) {
    opts = opts || {};
    var factor = opts.unidad === 'cop' ? 1 : 1000;
    var out = [];
    for (var i = 0; i < (src || []).length; i++) {
      var p = src[i];
      if (!p) continue;
      var nombre = String(p.name || p.nombre || '').trim();
      if (!nombre) continue;
      var precio = Math.round(Number(p.price != null ? p.price : p.precio) * factor);
      if (!isFinite(precio) || precio <= 0) continue;
      out.push({
        sku: String(p.sku == null ? '' : p.sku),
        nombre: nombre,
        categoria: String(p._cat || p.cat || p.category || 'ADICIONAL'),
        precio_cop: precio,
        _n: norm(nombre)
      });
    }
    return out;
  }

  // ── Búsqueda ────────────────────────────────────────────────

  var LIMITE_DEF = 8, LIMITE_MAX = 25;

  function puntaje(prod, ts) {
    if (!ts.length) return 1;
    var hits = 0, score = 0;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (prod._n.indexOf(t) !== -1) {
        hits++;
        // Palabra completa pesa más que "70" dentro de "5070".
        score += new RegExp('(^| )' + t + '( |$)').test(prod._n) ? 3 : 2;
      } else if (CAT_DE_PALABRA[t] && CAT_DE_PALABRA[t] === prod.categoria) {
        hits++;
        score += 1;
      }
    }
    // Menos de la mitad de las palabras: no es lo que están buscando.
    if (hits * 2 < ts.length) return 0;
    return score;
  }

  function buscar(catalogo, args) {
    args = args || {};
    var ts = tokens(args.consulta || '');
    var cat = norm(args.categoria || '');
    var min = Number(args.precio_min) > 0 ? Number(args.precio_min) : 0;
    var max = Number(args.precio_max) > 0 ? Number(args.precio_max) : Infinity;
    var limite = Math.min(Math.max(parseInt(args.limite, 10) || LIMITE_DEF, 1), LIMITE_MAX);

    var hallados = [];
    for (var i = 0; i < catalogo.length; i++) {
      var p = catalogo[i];
      if (p.precio_cop < min || p.precio_cop > max) continue;
      if (cat && norm(p.categoria) !== cat) continue;
      var s = puntaje(p, ts);
      if (!s) continue;
      hallados.push({ p: p, s: s });
    }
    // Mejor coincidencia primero y, a igual coincidencia, lo más barato: el
    // vendedor casi siempre quiere la opción que cabe en el presupuesto.
    hallados.sort(function (a, b) { return b.s - a.s || a.p.precio_cop - b.p.precio_cop; });

    var productos = [];
    for (var k = 0; k < hallados.length && k < limite; k++) {
      var q = hallados[k].p;
      productos.push({ sku: q.sku, nombre: q.nombre, categoria: q.categoria, precio_cop: q.precio_cop });
    }
    return {
      total_encontrados: hallados.length,
      mostrando: productos.length,
      productos: productos,
      moneda: 'COP',
      nota: 'precio_cop está en pesos colombianos e incluye IVA. No sumes IVA ni conviertas.',
      sin_resultados: hallados.length === 0,
      pista: hallados.length === 0
        ? 'No hay nada así en el catálogo de esta tienda. Prueba con menos palabras o con otra categoría; si de verdad no existe, dilo y usa registrar_faltante.'
        : undefined
    };
  }

  // ── Registro de herramientas ────────────────────────────────

  /**
   * def = { nombre, descripcion, parametros, requeridos, ejecutar(args, ctx) }
   * `parametros` es un JSON Schema de propiedades; el proxy lo traduce al
   * formato de cada proveedor.
   */
  function registrar(def) {
    if (!def || !def.nombre || typeof def.ejecutar !== 'function') {
      throw new Error('AgentTools.registrar: falta nombre o ejecutar');
    }
    HERRAMIENTAS[def.nombre] = def;
    return def.nombre;
  }

  function definiciones(filtro) {
    var out = [];
    for (var k in HERRAMIENTAS) {
      if (!HERRAMIENTAS.hasOwnProperty(k)) continue;
      var d = HERRAMIENTAS[k];
      if (filtro && filtro.indexOf(k) === -1) continue;
      out.push({
        nombre: d.nombre,
        descripcion: d.descripcion || '',
        parametros: {
          type: 'object',
          properties: d.parametros || {},
          required: d.requeridos || []
        }
      });
    }
    return out;
  }

  function ejecutar(nombre, args, ctx) {
    var d = HERRAMIENTAS[nombre];
    if (!d) return Promise.resolve({ error: 'No existe la herramienta "' + nombre + '".' });
    return Promise.resolve()
      .then(function () { return d.ejecutar(args || {}, ctx || {}); })
      .catch(function (e) {
        // El error vuelve como resultado, no como excepción: el modelo tiene
        // que poder decirle a la persona que eso falló y seguir la conversación.
        return { error: (e && e.message) ? e.message : 'Falló la herramienta ' + nombre };
      });
  }

  // ── Las tres herramientas puras ─────────────────────────────

  registrar({
    nombre: 'buscar_productos',
    descripcion: 'Busca en el catálogo de precios de la tienda. Es la ÚNICA fuente de precios y de qué productos existen. Úsala antes de recomendar cualquier cosa.',
    parametros: {
      consulta: { type: 'string', description: 'Palabras clave: modelo, marca, capacidad. Ej: "board am5 ddr5", "rtx 5070", "ssd 1tb nvme".' },
      categoria: { type: 'string', description: 'Filtro exacto de categoría. Ej: BOARD, PROCESADOR, MEMORIA, ALMACENAMIENTO, GRÁFICA, FUENTE, CAJA, DISIPADOR, MONITOR, PORTÁTIL.' },
      precio_min: { type: 'number', description: 'Precio mínimo en pesos colombianos.' },
      precio_max: { type: 'number', description: 'Precio máximo en pesos colombianos.' },
      limite: { type: 'number', description: 'Cuántos productos devolver (1 a 25, por defecto 8).' }
    },
    requeridos: [],
    ejecutar: function (args, ctx) {
      var catalogo = ctx.catalogo || [];
      // Si no mandó categoría pero la consulta la nombra, se usa igual: filtra
      // el ruido sin que el modelo tenga que conocer los nombres internos.
      if (!args.categoria && args.consulta) {
        var sugerida = categoriaDeTexto(args.consulta);
        if (sugerida) {
          var conCat = buscar(catalogo, { consulta: args.consulta, categoria: sugerida, precio_min: args.precio_min, precio_max: args.precio_max, limite: args.limite });
          if (!conCat.sin_resultados) return conCat;
        }
      }
      return buscar(catalogo, args);
    }
  });

  registrar({
    nombre: 'detalle_producto',
    descripcion: 'Trae el detalle de un producto por SKU, incluidos los componentes cuando es un equipo ensamblado. Úsala cuando el cliente pregunte por características.',
    parametros: {
      sku: { type: 'string', description: 'El SKU tal como lo devolvió buscar_productos.' }
    },
    requeridos: ['sku'],
    ejecutar: function (args, ctx) {
      var catalogo = ctx.catalogo || [];
      var sku = String(args.sku == null ? '' : args.sku).trim();
      var p = null;
      for (var i = 0; i < catalogo.length; i++) {
        if (catalogo[i].sku === sku) { p = catalogo[i]; break; }
      }
      if (!p) return { encontrado: false, pista: 'Ese SKU no está en el catálogo activo. Busca de nuevo con buscar_productos.' };
      var out = {
        encontrado: true,
        sku: p.sku, nombre: p.nombre, categoria: p.categoria, precio_cop: p.precio_cop,
        moneda: 'COP',
        nota: 'El nombre es la única ficha técnica confiable. No agregues especificaciones que no estén ahí.'
      };
      // La app sabe desarmar el nombre de un ensamblado en sus piezas; si quien
      // llama pasó ese ayudante, se aprovecha.
      if (typeof ctx.componentes === 'function') {
        try {
          var comps = ctx.componentes(p.nombre, p.categoria);
          if (comps && comps.length) out.componentes = comps;
        } catch (e) { /* un nombre raro no puede tumbar la respuesta */ }
      }
      return out;
    }
  });

  var TEMAS = {
    garantia: 'garantia', garantias: 'garantia',
    horarios: 'horarios', horario: 'horarios',
    ubicacion: 'ubicacion', direccion: 'ubicacion',
    pagos: 'pagos', pago: 'pagos',
    envios: 'envios', envio: 'envios'
  };

  registrar({
    nombre: 'info_tienda',
    descripcion: 'Datos de la tienda que configuró el administrador: garantía, horarios, ubicación, formas de pago y envíos. Úsala en vez de suponer.',
    parametros: {
      tema: { type: 'string', description: 'garantía, horarios, ubicación, pagos, envíos o "todo".' }
    },
    requeridos: [],
    ejecutar: function (args, ctx) {
      var cfg = ctx.cfg || {};
      var datos = {
        empresa: cfg.empresa || '',
        garantia: cfg.garantia || '',
        horarios: cfg.horarios || '',
        ubicacion: cfg.ubicacion || '',
        pagos: cfg.pagos || '',
        envios: cfg.envios || '',
        glosario: cfg.glosario || '',
        extra: cfg.iaExtra || ''
      };
      var tema = TEMAS[norm(args.tema || '')];
      if (tema) {
        var r = { tema: tema, valor: datos[tema] };
        if (!r.valor) r.pista = 'La tienda no configuró ese dato. Dile al cliente que lo confirma un asesor; no lo inventes.';
        return r;
      }
      return datos;
    }
  });

  // ── El libreto del asistente ────────────────────────────────

  function fechaLarga(d) {
    var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  }

  /**
   * opts = { modo: 'asesor' | 'cliente', cfg, hoy: Date, lista: 'Lista 1', asesor: 'Nombre' }
   * El modo cliente es más estricto: no negocia, no promete y escala.
   */
  function promptSistema(opts) {
    opts = opts || {};
    var cfg = opts.cfg || {};
    var modoCliente = opts.modo === 'cliente';
    var tienda = cfg.empresa || 'la tienda';
    var L = [];

    L.push(modoCliente
      ? 'Eres el asistente virtual de ' + tienda + ', una tienda de tecnología en Colombia. Atiendes a un cliente.'
      : 'Eres el copiloto de ventas de ' + tienda + ', una tienda de tecnología en Colombia. Le hablas al asesor que está atendiendo, no al cliente.');
    L.push('Hoy es ' + fechaLarga(opts.hoy || new Date()) + '.');
    L.push('');
    L.push('REGLAS QUE NO SE ROMPEN:');
    L.push('- Los precios y la existencia de un producto salen SOLO de las herramientas. Nunca de tu memoria.');
    L.push('- Antes de recomendar o de dar un precio, busca. Si la búsqueda no devuelve nada, dilo con todas las letras: "eso no lo tenemos en la lista".');
    L.push('- precio_cop está en pesos colombianos e incluye IVA. No sumes IVA, no conviertas a dólares, no redondees hacia arriba.');
    L.push('- No inventes especificaciones. Lo único confiable es el nombre del producto.');
    L.push('- No prometas tiempos de entrega ni afirmes que hay unidades disponibles: el catálogo es de precios, no de inventario.');
    if (modoCliente) {
      L.push('- Preséntate como asistente automático la primera vez que escribas. No te hagas pasar por una persona.');
      L.push('- No negocies descuentos ni precios especiales. Si insisten, pasa la conversación a un asesor.');
      L.push('- Garantías, reclamos, facturas y devoluciones son SIEMPRE de un asesor humano: escala.');
    } else {
      L.push('- El asesor decide qué se envía. Tú armas y propones; no hables como si le escribieras al cliente salvo que te lo pidan.');
    }
    L.push('');
    L.push('CÓMO ARMAR UN EQUIPO:');
    L.push('- Busca pieza por pieza, por categoría, en vez de pedir todo de una.');
    L.push('- Revisa compatibilidad: el socket de la board tiene que ser el mismo del procesador, la RAM tiene que ser de la generación de la board (DDR4 con DDR4, DDR5 con DDR5) y la fuente tiene que alcanzar para la gráfica.');
    L.push('- Un equipo completo lleva procesador, board, memoria, almacenamiento, fuente y chasis. La gráfica dedicada va si el uso lo pide.');
    L.push('- Suma los precios y dilo. Si te dieron presupuesto, no lo pases.');
    L.push('');
    L.push(modoCliente
      ? 'TONO: como un vendedor colombiano por WhatsApp, cercano y natural, en español neutro: no fuerces modismos ni jerga. Dos o tres frases por respuesta. Sin emojis.'
      : 'TONO: directo y corto, de compañero de trabajo, en español neutro. Sin rodeos ni emojis.');

    var negocio = [];
    if (cfg.garantia) negocio.push('Garantía: ' + cfg.garantia);
    if (cfg.horarios) negocio.push('Horarios: ' + cfg.horarios);
    if (cfg.ubicacion) negocio.push('Ubicación: ' + cfg.ubicacion);
    if (cfg.pagos) negocio.push('Formas de pago: ' + cfg.pagos);
    if (cfg.envios) negocio.push('Envíos: ' + cfg.envios);
    if (cfg.glosario) negocio.push('Glosario de abreviaturas del catálogo: ' + cfg.glosario);
    if (cfg.iaExtra) negocio.push(cfg.iaExtra);
    if (negocio.length) {
      L.push('');
      L.push('DATOS DE LA TIENDA:');
      L.push(negocio.join('\n'));
    }
    if (opts.lista) {
      L.push('');
      L.push('Lista de precios activa: ' + opts.lista + '.');
    }
    return L.join('\n');
  }

  root.AgentTools = {
    registrar: registrar,
    definiciones: definiciones,
    ejecutar: ejecutar,
    normalizarCatalogo: normalizarCatalogo,
    promptSistema: promptSistema,
    categoriaDeTexto: categoriaDeTexto,
    // Para los tests y para quien quiera buscar sin pasar por el registro.
    _buscar: buscar,
    _norm: norm,
    _tokens: tokens
  };
})(typeof window !== 'undefined' ? window : globalThis);
