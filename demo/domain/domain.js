// DOMAIN LAYER - Pure business logic, no DOM, no I/O

// Productos permanentes: siempre presentes en AMBAS listas (Store y Lago)
const PERMANENT_ITEMS = [
  { sku: '55002', name: 'SERVICIO TÉCNICO', price: 0, _cat: 'ADICIONAL' }
];
/** Inyecta los productos permanentes si no existen ya en el array */
function ensurePermanentItems(catalog, listSource) {
  PERMANENT_ITEMS.forEach(function (pi) {
    var exists = catalog.some(function (p) { return p.sku === pi.sku; });
    if (!exists) {
      var copy = JSON.parse(JSON.stringify(pi));
      copy._listSource = listSource || 'store';
      catalog.unshift(copy); // al inicio de la lista
    }
  });
  return catalog;
}

const ALL_CATS = ['ENSAMBLADO', 'CAJA', 'FUENTE', 'BOARD', 'PROCESADOR', 'DISIPADOR', 'MEMORIA', 'ALMACENAMIENTO', 'GR\u00c1FICA', 'MONITOR', 'PORT\u00c1TIL', 'ACCESORIO PORT\u00c1TIL', 'TECLADO', 'MOUSE', 'AUD\u00cdFONOS', 'SIMULADOR', 'RED', 'MUEBLE', 'LIMPIEZA', 'PERIF\u00c9RICOS', 'ADICIONAL'];
// Orden en que se agrupan los productos dentro de la cotizaci\u00f3n: primero el
// equipo y sus componentes, despu\u00e9s los perif\u00e9ricos, y al final mobiliario y
// varios. PERIF\u00c9RICOS queda como caj\u00f3n de lo que no cae en un grupo propio.
const CAT_ORDER = ['PORT\u00c1TIL', 'ENSAMBLADO', 'PROCESADOR', 'BOARD', 'MEMORIA', 'ALMACENAMIENTO', 'GR\u00c1FICA', 'DISIPADOR', 'FUENTE', 'CAJA', 'MONITOR', 'TECLADO', 'MOUSE', 'AUD\u00cdFONOS', 'SIMULADOR', 'PERIF\u00c9RICOS', 'RED', 'MUEBLE', 'ACCESORIO PORT\u00c1TIL', 'LIMPIEZA', 'ADICIONAL'];
const CAT_STYLE = { 'ENSAMBLADO': 'cb-ens', 'GR\u00c1FICA': 'cb-graf', 'PROCESADOR': 'cb-proc', 'MEMORIA': 'cb-mem', 'ALMACENAMIENTO': 'cb-alm', 'MONITOR': 'cb-mon', 'CAJA': 'cb-caja', 'BOARD': 'cb-board', 'FUENTE': 'cb-fuel', 'DISIPADOR': 'cb-dis', 'PORT\u00c1TIL': 'cb-lap', 'ACCESORIO PORT\u00c1TIL': 'cb-accp', 'TECLADO': 'cb-tecl', 'MOUSE': 'cb-mouse', 'AUD\u00cdFONOS': 'cb-audio', 'SIMULADOR': 'cb-simul', 'RED': 'cb-red', 'MUEBLE': 'cb-mueble', 'LIMPIEZA': 'cb-limp', 'PERIF\u00c9RICOS': 'cb-peri', 'ADICIONAL': 'cb-add' };
const EXCEL_MAP = {
  'PORTÁTILES': 'PORTÁTIL', 'PORTATILES': 'PORTÁTIL',
  'MEMORIAS RAM': 'MEMORIA', 'MEMORIAS': 'MEMORIA',
  'PROCESADORES': 'PROCESADOR',
  'TARJETAS DE VIDEO': 'GRÁFICA', 'TARJETAS': 'GRÁFICA',
  'UNIDADES SSD': 'ALMACENAMIENTO', 'SSD / DISCOS DUROS': 'ALMACENAMIENTO', 'SSD': 'ALMACENAMIENTO', 'DISCOS': 'ALMACENAMIENTO',
  'CAJAS': 'CAJA', 'ENSAMBLADOS': 'ENSAMBLADO', 'ENSAMBLADO': 'ENSAMBLADO', 'COMBOS': 'ENSAMBLADO', 'COMBO': 'ENSAMBLADO', 'EQUIPOS ENSAMBLADOS': 'ENSAMBLADO', 'EQUIPOS': 'ENSAMBLADO',
  // El PDF renombró "EQUIPOS ENSAMBLADOS…" a "COMPUTADORES DE ESCRITORIO" (y sumó
  // "… CON TARJETA GRAFICA", que entra por el matcher de prefijo). Sin esta clave los
  // equipos de escritorio no mapeaban y caían al matcher por nombre, que a varios los
  // mandaba a PORTÁTIL — con lo que se llevaban la garantía de portátil en la cotización.
  'COMPUTADORES DE ESCRITORIO': 'ENSAMBLADO',
  // El PDF usa el singular en las secciones AMD ("BOARD AMD SOCKET AM4"), que
  // no coincidía con ninguna clave plural y caía al matcher por nombre.
  'BOARDS': 'BOARD', 'BOARDS INTEL': 'BOARD', 'BOARDS AMD': 'BOARD',
  'BOARD AMD': 'BOARD', 'BOARD INTEL': 'BOARD',
  'REGULADOR': 'FUENTE', 'REGULADORES': 'FUENTE', 'FUENTES': 'FUENTE', 'UPS': 'FUENTE',
  'DISIPACIÓN': 'DISIPADOR', 'DISIPACION': 'DISIPADOR', 'REFRIGERACIÓN': 'DISIPADOR', 'REFRIGERACION': 'DISIPADOR', 'VENTILADORES': 'DISIPADOR',
  'MONITORES': 'MONITOR',
  'PERIFÉRICOS': 'PERIFÉRICOS', 'PERIFERICOS': 'PERIFÉRICOS', 'ACCESORIOS': 'PERIFÉRICOS',
  // Secciones que ahora tienen grupo propio
  'TECLADOS': 'TECLADO', 'MOUSE': 'MOUSE', 'AUDÍFONOS': 'AUDÍFONOS', 'AUDIFONOS': 'AUDÍFONOS',
  'DIADEMAS': 'AUDÍFONOS', 'SILLAS': 'MUEBLE', 'MUEBLES': 'MUEBLE',
  'REDES': 'RED', 'TIMONES': 'SIMULADOR', 'SIMULADORES': 'SIMULADOR', 'LIMPIEZA': 'LIMPIEZA',
  // Secciones del PDF que no mapeaban a nada y caían a ADICIONAL
  'PARLANTES': 'PERIFÉRICOS', 'CAMARAS': 'PERIFÉRICOS', 'CÁMARAS': 'PERIFÉRICOS',
  'SMARTWATCH': 'PERIFÉRICOS', 'SOPORTES': 'PERIFÉRICOS',
  // Secciones del PDF nuevo que caían a ADICIONAL por no estar acá
  'MICROFONOS': 'PERIFÉRICOS', 'MICRÓFONOS': 'PERIFÉRICOS', 'STREAMING': 'PERIFÉRICOS',
  'GAFAS REALIDAD VIRTUAL': 'PERIFÉRICOS',
  'GENERAL': 'ADICIONAL'
};
function mapExcelCat(cat) {
  if (!cat) return null;
  var c = cat.toUpperCase().trim();
  if (EXCEL_MAP[c]) return EXCEL_MAP[c];
  // Prefix match: 'BOARDS INTEL LGA-1700 (XII-XIII-XIV)' → starts with 'BOARDS INTEL'
  var keys = Object.keys(EXCEL_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (c.indexOf(keys[i]) === 0) return EXCEL_MAP[keys[i]];
  }
  return null;
}
const CATS = [
  { k: ['port\u00e1til', 'portatil', 'laptop', 'notebook', 'omen ', 'pavilion', 'aspire', 'vivobook', 'zenbook', 'inspiron', 'latitude', 'thinkpad', 'macbook', 'ideapad', 'acer nitro', 'stealth', 'razer blade', 'tuf a15', 'tuf gaming f', 'rog strix scar', 'rog gu6', 'rog g8', 'gaming rog', 'loq 1', 'msi thin', 'msi katana', 'msi cyborg', 'msi vector', 'cougar duoface', 'legion ', '16 gamer', '15 gamer'], v: 'PORT\u00c1TIL' },
  { k: ['caja', 'case', 'gabinete', 'nzxt', 'fractal', 'aerocool', 'gamemax', 'phanteks', 'lian li'], v: 'CAJA' },
  { k: ['fuente', 'psu', 'evga', 'seasonic', 'antec', '80plus', '80 plus', 'probe', 'superflower', 'thermaltake', 'cybercore'], v: 'FUENTE' },
  { k: ['board', 'motherboard', 'b550', 'b650', 'b850', 'b860', 'b760', 'b660', 'b560', 'a620', 'a820', 'x670', 'x870', 'z790', 'z890', 'z890e', 'h610', 'h810', 'prime b', 'rog strix b', 'tuf gaming b', 'tuf b', 'mag b', 'msi pro b', 'pro b'], v: 'BOARD' },
  { k: ['ryzen', 'core i3', 'core i5', 'core i7', 'core i9', 'procesador', '8700f', '8600g', 'i3-', 'i5-', 'i7-', 'i9-'], v: 'PROCESADOR' },
  { k: ['disipador', 'refrigeracion', 'cooler', 'aio', 'liquid', 'noctua', 'deepcool', 'thermalright', 'cougar pos', 'hyper 212', 'arctic'], v: 'DISIPADOR' },
  { k: ['ddr3', 'ddr4', 'ddr5', 'lancer', 'ripjaws', 'vengeance', 'fury beast', 'trident', 'kingston fury', 'viper ', 'patriot', 'crucial ballistix', 'adata xpg', 'teamgroup', 'team t-force', 'geil ', 'pny '], v: 'MEMORIA' },
  { k: ['ssd', 'nvme', 'hdd', 'm.2', 'samsung 870', 'samsung 980', 'samsung 990', 'wd green', 'wd blue', 'seagate', 'nv3', 'nv2'], v: 'ALMACENAMIENTO' },
  { k: ['rtx', 'gtx', 'rx 6', 'rx 7', 'radeon', 'geforce', '4060', '4070', '4080', '4090', '5060', '5070', '5080', '5090'], v: 'GR\u00c1FICA' },
  { k: ['monitor', 'hz', 'ips ', '24g', '27g', 'oled', 'aoc ', 'viewsonic'], v: 'MONITOR' },
  { k: ['teclado', 'keyboard', 'mouse', 'raton', 'diadema', 'headset', 'auricular', 'audifonos', 'aud\u00edfono', 'gamepad', 'control ', 'joystick', 'mando', 'webcam', 'camara web', 'silla gamer', 'sofa gamer', 'alfombrilla', 'mousepad', 'pad ', 'tapete', 'redragon', 'logitech g', 'hyperx', 'razer ', 'steelseries', 'corsair k', 'corsair m', 'cougar '], v: 'PERIF\u00c9RICOS' }
];

// ============================================================
// SEÑALES INEQUÍVOCAS DE TIPO DE PRODUCTO
// ============================================================
// El NOMBRE dice qué ES el producto; la sección del PDF solo dice dónde lo
// imprimió el proveedor. En el catálogo real las memorias RAM vienen listadas
// DENTRO de la sección "BOARDS INTEL LGA-1700", así que confiar en la sección
// mandaba las 24 RAM a BOARD. Estas reglas ganan sobre la sección y sobre las
// marcas, y por eso el orden importa:
//   1. RAM   — el nombre ARRANCA con DDRx. Un board solo la menciona al final
//              como capacidad de slots ("... 4DDR5"), nunca al inicio.
//   2. BOARD — palabra explícita ("board"/"motherboard").
//   3. ALMACENAMIENTO — antes del chipset: los boards anuncian "3 M.2" como
//              característica y no deben caer aquí.
//   4. BOARD — chipset (B550/A520/X870…) junto a contexto de board. Va último
//              para no robarse los SSD cuyo modelo parece chipset (EX400U).
const STRONG_TYPES = [
  // Accesorios que solo nombran "portátil" como compatibilidad (fundas, maletines,
  // cargadores, cajas externas). Iban a PORTÁTIL por la palabra suelta, lo que
  // ensuciaba el catálogo y además les daba la garantía de fabricante del equipo.
  // Van primero: la caja externa dice "NVMe" y si no, caería en ALMACENAMIENTO.
  { re: /^(funda|maletin|maletín|morral|bolso|estuche|guaya)\b/, v: 'ACCESORIO PORTÁTIL' },
  { re: /(funda|maletin|maletín|morral|estuche|cargador|base|caja\s+externa|soporte|adaptador)[\s\S]*\b(portatil|portátil|laptop)\b/, v: 'ACCESORIO PORTÁTIL' },
  { re: /^(kit|portatil|portátil|memoria|ram)?\s*ddr[2345]\b/, v: 'MEMORIA' },
  { re: /\b(board|motherboard|mainboard)\b/, v: 'BOARD' },
  { re: /\b(ssd|nvme|hdd)\b|disco\s+duro|s[oó]lido\s+sata|estado\s+s[oó]lido/, v: 'ALMACENAMIENTO' },
  // Tarjetas de memoria y USB: el proveedor de Lago las agrupa bajo "MEMORIAS",
  // pero guardan datos, no son RAM. Anclado al inicio Y exigiendo capacidad para
  // no capturar hubs, cables ni teclados que solo mencionan "USB" de pasada.
  { re: /^(memoria\s+)?(micro\s*sd|sd|usb(-?\s?c)?)\s*\d+\s*(gb|tb)\b/, v: 'ALMACENAMIENTO' },
  { re: /\b[abhxz]\d{3}[a-z]{0,2}\b[\s\S]*?(gpu|pci|socket|wifi|lga|am4|am5|ddr\d)/, v: 'BOARD' },

  // ── Periféricos con grupo propio ──────────────────────────────
  // Antes caían los 248 juntos en PERIFÉRICOS. El catálogo nombra estos
  // productos de forma muy consistente ("MOUSE …", "DIADEMA …"), así que se
  // anclan al inicio: es lo que evita que un "PAD MOUSE" o un "SOPORTE
  // DIADEMA" se cuelen en el grupo del producto que solo mencionan.
  { re: /^[¡!\s]*(diadema|audifono|audífono|manos\s+libres|earbuds)/, v: 'AUDÍFONOS' },
  { re: /^mouse\b(?!\s*pad)/, v: 'MOUSE' },
  { re: /^teclado\b/, v: 'TECLADO' },
  { re: /^(silla|sofa|sofá|mesa|cojin|cojín|banqueta)\b/, v: 'MUEBLE' },
  { re: /^(timon|timón|simulador|volante|palanca\s+driving)\b/, v: 'SIMULADOR' },
  { re: /^(router|switch|access\s*point|repetidor|modem|módem|bluethoot|bluetooth)\b/, v: 'RED' },
  { re: /^(adaptador|cable|tarjeta)\b[\s\S]*(\blan\b|rj45|\bred\b|wifi|ethernet|inalambric)/, v: 'RED' },
  { re: /(espuma\s+limpiadora|limpiador|limpieza|aire\s+comprimido|alcohol\s+isoprop|silicona\s+desmoldante|microfibra|removedor)/, v: 'LIMPIEZA' }
];

/**
 * Un ensamblado o portátil ENUMERA varios componentes en su nombre
 * ("... /RYZ 7 5700X+16GB+NVMe 1TB", "COUGAR AIRFACE V.T+4 ..."). Sin este
 * guardia, el "+NVMe" de un portátil lo mandaba a ALMACENAMIENTO.
 */
function _esProductoCompuesto(l) {
  if (/v\.\s*t\b/.test(l)) return true;                         // "V.T." y también "V.T+4"
  return /\+/.test(l) && /(core|ryzen|ryz|ultra|athlon)\b/.test(l);
}

/** Categoría por tipo si el nombre es inequívoco; null si no lo es. */
function strongTypeCat(n) {
  var l = String(n || '').toLowerCase();
  if (!l) return null;
  if (_esProductoCompuesto(l)) return null;
  // "CAJA EXTERNA ... NVMe" es un gabinete y no un disco, pero si además dice
  // "PORTATIL" sí es un accesorio: se deja pasar a las reglas de abajo.
  if (/^caja\b/.test(l) && !/\b(portatil|portátil|laptop)\b/.test(l)) return null;
  // Un combo trae varios periféricos ("TECLADO + MOUSE"): no es ninguno de los
  // dos por separado, así que se queda en PERIFÉRICOS.
  if (/^combo\b/.test(l)) return null;
  // Un "SOPORTE PARA DIADEMA" es un soporte, no una diadema. Se exceptúa la
  // "BASE REFRIGERANTE PORTATIL", que sí es accesorio de portátil.
  if (/^(soporte|base)\b/.test(l) && !/\b(portatil|portátil|laptop)\b/.test(l)) return null;
  for (var i = 0; i < STRONG_TYPES.length; i++) {
    if (STRONG_TYPES[i].re.test(l)) return STRONG_TYPES[i].v;
  }
  return null;
}

function getCat(n) {
  let l = n.toLowerCase();
  // PRIORITY 1: Ensamblados — combos with V.T. pattern (even if prefixed with CAJA)
  if (/v\.t\.\s*\+/i.test(l) && /\+/.test(l)) return 'ENSAMBLADO';
  if (/v\.t\.\s*\w*\s*\//i.test(l) && /\+/.test(l)) return 'ENSAMBLADO';
  // PRIORITY 2: "PORTATIL DDR" / "KIT DDR" = memoria, NO portátil
  if (/^(portatil|port\u00e1til|kit)\s+ddr/i.test(l)) return 'MEMORIA';
  // PRIORITY 3: Laptops with brand/model + full spec pattern (BRAND MODEL/PROC+RAM+...)
  if (/\//.test(l) && /\+/.test(l) && /(core|ryzen|ryz|ultra)\s/i.test(l) && /\d+g/i.test(l)) {
    // Has slash + plus + processor keyword + RAM size → likely laptop or ensamblado
    // Check if it has laptop-specific patterns
    if (/\d+[,.]?\d*["\u201d]/.test(l) || /fhd|qhd|uhd|wuxga|oled/i.test(l)) return 'PORT\u00c1TIL';
  }
  // PRIORITY 4: tipo inequívoco por el nombre. Va ANTES de las marcas porque
  // Patriot, Viper, ADATA y Kingston fabrican RAM *y* SSD: la marca sola no
  // puede decidir (los SSD Patriot caían en MEMORIA).
  var strong = strongTypeCat(l);
  if (strong) return strong;
  // Normal keyword matching
  for (let i = 0; i < CATS.length; i++) {
    if (CATS[i].k.some(function (k) { return l.includes(k) })) return CATS[i].v;
  }
  if (/(^|\s)ram(\s|$)/.test(l)) return 'MEMORIA';
  return 'ADICIONAL';
}
function catOrd(c) { let i = CAT_ORDER.indexOf(c); return i === -1 ? 99 : i }

// ============================================================
// SECCIÓN: GARANTÍAS AUTOMÁTICAS POR CATEGORÍA
// Monitores y portátiles llevan garantía del FABRICANTE (no de la tienda).
// Xiaomi es la excepción entre los monitores: su garantía de marca es menor.
// Los meses de cada grupo son editables en Ajustes → Garantías por categoría;
// estos son solo los valores por defecto la primera vez que se abre la app.
//   - Monitores: 36 meses   - Monitores Xiaomi: 12 meses   - Portátiles: 12 meses
// Los demás productos conservan la garantía del campo #garantia (por defectos
// de fabricación). Si cambia una regla de detección de marca, se toca SOLO aquí.
// ============================================================
const WARRANTY_DEFAULTS = {
  monitor: '36 meses',
  monitorXiaomi: '12 meses',
  portatil: '12 meses'
};

/**
 * Determina los grupos de garantía presentes en la cotización.
 * @param {Array} list - items de la cotización
 * @param {string} baseGarantia - garantía estándar (#garantia) para los demás productos
 * @param {object} [cfg] - config del negocio (loadCfg()); trae los meses configurados
 *        por categoría: cfg.warrantyMonitor, cfg.warrantyMonitorXiaomi, cfg.warrantyPortatil
 * @returns {Array<{label:string, term:string, byMaker:boolean}>}
 *          Orden fijo: Monitores → Monitores Xiaomi → Portátiles → Demás productos.
 *          Solo incluye los grupos que realmente aparecen en el carrito. Si el término
 *          de Monitores y Monitores Xiaomi coincide, se fusionan en una sola línea.
 */
function computeWarrantyGroups(list, baseGarantia, cfg) {
  cfg = cfg || {};
  var wMonitor = cfg.warrantyMonitor || WARRANTY_DEFAULTS.monitor;
  var wMonitorXiaomi = cfg.warrantyMonitorXiaomi || WARRANTY_DEFAULTS.monitorXiaomi;
  var wPortatil = cfg.warrantyPortatil || WARRANTY_DEFAULTS.portatil;

  var hasMonitor = false, hasMonitorXiaomi = false, hasPortatil = false, hasOther = false;
  for (var i = 0; i < list.length; i++) {
    var it = list[i], cat = it._cat || getCat(it.name);
    if (cat === 'MONITOR') {
      if (/xiaomi/i.test(it.name)) hasMonitorXiaomi = true; else hasMonitor = true;
    } else if (cat === 'PORTÁTIL') {
      hasPortatil = true;
    } else {
      hasOther = true;
    }
  }

  var base = ((baseGarantia || '') + '').trim() || '12 meses';
  var groups = [];
  if (hasMonitor && hasMonitorXiaomi && wMonitor === wMonitorXiaomi) {
    groups.push({ label: 'Monitores', term: wMonitor, byMaker: true });
  } else {
    if (hasMonitor) groups.push({ label: 'Monitores', term: wMonitor, byMaker: true });
    if (hasMonitorXiaomi) groups.push({ label: 'Monitores Xiaomi', term: wMonitorXiaomi, byMaker: true });
  }
  if (hasPortatil) groups.push({ label: 'Portátiles', term: wPortatil, byMaker: true });
  if (hasOther) groups.push({ label: 'Demás productos', term: base, byMaker: false });
  if (!groups.length) groups.push({ label: 'Demás productos', term: base, byMaker: false });
  return groups;
}
function fmtCOP(n) { return '$ ' + Math.round(n).toLocaleString('es-CO') }
function fmtCOP2(n) { return '$ ' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100 }
/**
 * Escapa HTML para prevenir XSS en contenido dinámico.
 * Se usa en: generateQuote(), renderItems(), buildQFoot(),
 * y cualquier lugar donde se inyecte texto del usuario en el DOM.
 * Cubre: & " < > ' — seguro para atributos entre comillas y contenido texto.
 *
 * NO sirve para texto que va dentro de un string de JavaScript en un manejador
 * inline (onclick="fn('...')"): el navegador decodifica &#39; → ' ANTES de
 * ejecutar el manejador, así que el texto cierra la comilla y agrega código.
 * Para eso está escJsAttr().
 */
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;') }

/**
 * Escapa texto para meterlo en un string de JavaScript entre comillas simples
 * que vive dentro de un atributo HTML: onclick="fn('" + escJsAttr(x) + "')".
 * Usa escapes hexadecimales de JS (\x27), que el parser de HTML no toca, así
 * que ni la decodificación del atributo ni el string de JS se pueden romper.
 * Misma técnica que _safeJsAttr de ui/admin-panel.js, que ya estaba bien.
 *
 * Obligatorio para CUALQUIER dato que no sea una constante del código: IDs de
 * documentos de Firestore (los elige quien crea el documento), SKUs, fechas…
 */
var JS_LINE_SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
function escJsAttr(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\x27')
    .replace(/"/g, '\\x22')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/&/g, '\\x26')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    // U+2028 y U+2029 cortan un string de JS en navegadores viejos. Se
    // escapan con fromCharCode para no escribir el caracter en el fuente.
    .replace(JS_LINE_SEPARATORS, function (c) { return '\\u' + c.charCodeAt(0).toString(16); });
}

/**
 * Valida la URL de una imagen antes de meterla en un src armado como texto.
 * Acepta solo:
 *   - data:image/(png|jpeg|gif|webp|svg+xml);base64,…  con caracteres base64
 *   - https://…  sin comillas, espacios ni < >
 *   - rutas relativas de assets/
 * Cualquier otra cosa devuelve '' (sin imagen). Los caracteres permitidos no
 * pueden cerrar el atributo, así que, además de escaparlo, el valor no tiene
 * cómo inyectar HTML aunque alguien lo haya puesto a propósito en Firestore.
 */
function safeImgSrc(s) {
  var v = String(s == null ? '' : s).trim();
  if (/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(v)) return v;
  if (/^https:\/\/[^\s"'<>`\\]+$/.test(v)) return v;
  if (/^assets\/[A-Za-z0-9_.\/-]+$/.test(v) && v.indexOf('..') === -1) return v;
  return '';
}
function applyDisc(p) { return S.discountOn ? p * (1 - S.discountPct / 100) : p }

// ============================================================
// SECCIÓN: MOTOR DE CÁLCULOS CENTRALIZADO
// Única fuente de verdad para totales, IVA, retefuente, descuento.
// Si cambia una regla fiscal, se toca SOLO aquí.
// ============================================================
function calcEngine() {
  var sorted = items.slice().sort(function (a, b) {
    return catOrd(a._cat || getCat(a.name)) - catOrd(b._cat || getCat(b.name));
  });

  var totalConIva = 0;
  var totalGravado = 0;
  var totalExcluido = 0;
  var totalUnits = 0;

  var lines = [];
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i];
    var cat = it._cat || getCat(it.name);
    var isIva = it.iva !== false;
    var unitBase = it.price * 1000;                   // precio original (con IVA si aplica)
    var unitDisc = applyDisc(it.price) * 1000;        // precio con descuento
    var lineTotal = unitDisc * it.qty;
    var unitSinIva = isIva ? round2(unitDisc / 1.19) : unitDisc;
    var lineIva = isIva ? round2((unitDisc - unitSinIva) * it.qty) : 0;

    totalConIva += lineTotal;
    if (isIva) totalGravado += lineTotal;
    else totalExcluido += lineTotal;
    totalUnits += it.qty;

    lines.push({
      item: it, cat: cat, isIva: isIva,
      unitBase: unitBase, unitDisc: unitDisc,
      unitSinIva: unitSinIva,
      lineTotal: lineTotal, lineIva: lineIva
    });
  }

  var subtotalSinIva = Math.round(totalGravado / 1.19);
  var ivaAmount = Math.round(totalGravado - subtotalSinIva);   // = totalGravado/1.19 * 0.19
  var reteBase = subtotalSinIva + totalExcluido;               // retefuente sobre base sin IVA (gravados + excluidos)
  var reteAmount = S.reteOn ? Math.round(reteBase * 0.025) : 0;
  var netoAPagar = totalConIva - reteAmount;
  var discountSaved = S.discountOn
    ? Math.round(totalConIva / (1 - S.discountPct / 100) * S.discountPct / 100)
    : 0;

  return {
    lines: lines,
    sorted: sorted,
    totalConIva: totalConIva,
    totalGravado: totalGravado,
    totalExcluido: totalExcluido,
    totalUnits: totalUnits,
    totalRefs: items.length,
    subtotalSinIva: subtotalSinIva,
    ivaAmount: ivaAmount,
    reteAmount: reteAmount,
    netoAPagar: netoAPagar,
    discountSaved: discountSaved
  };
}

// Número de cotización tal como se muestra al cliente: antepone una
// letra. Cada asesor lleva su propio consecutivo (ver lastQuoteNum), así
// que el mismo número puro se repite entre ellos — esto lo vuelve
// inequívoco en una foto/pantallazo, sin depender de que se alcance a
// leer el nombre del asesor en otra parte. Ej: "S-129" (Samuel), "D-159"
// (David). Solo para MOSTRAR — el campo interno #numCot y el contador
// siguen siendo el entero puro, sin este prefijo.
//
// letraFija: letra asignada por el admin en Usuarios (approved_users →
// letra), fija por correo y sin colisiones — tiene prioridad. Si no está
// asignada (usuario nuevo, o cotización vieja de antes de esta función),
// cae a la inicial del campo Asesor de siempre, que SÍ puede repetirse
// entre dos personas con nombres parecidos.
function quoteDisplayNum(num, asesor, letraFija) {
  var letter = (letraFija ? String(letraFija).trim().charAt(0) : '') || String(asesor || '').trim().charAt(0);
  letter = letter.toUpperCase();
  return (letter ? letter + '-' : '') + (num == null ? '' : num);
}

// --- List source helpers ---
function normListSource(src) {
  return String(src || '').toLowerCase() === 'lago' ? 'lago' : 'store';
}
function listSourceLabel(src) {
  if (src === 'mixed') return 'Mixta';
  return normListSource(src) === 'lago' ? 'Lista 2' : 'Lista 1';
}

// ============================================================
// SECCIÓN: FACTURACIÓN POR COMPONENTES — ENSAMBLADOS/PORTÁTILES
// Items compañeros con SKU, IVA y precio default conocidos.
// El Servicio Técnico se calcula como residuo para cuadrar.
// ============================================================
var BILLING_COMPANIONS = [
  { key: 'windows', sku: '44027', name: 'MICROSOFT WINDOWS 11 PROFESIONAL 64BIT STICKER', defaultPrice: 300000, iva: true, on: false },
  { key: 'kaspersky', sku: '44005', name: 'ANTIVIRUS KASPERSKY', defaultPrice: 700000, iva: false, on: false },
  { key: 'garantia', sku: '98989', name: 'EXTENSIÓN DE GARANTÍA 3 AÑOS', defaultPrice: 500000, iva: true, on: false },
  { key: 'accesorio', sku: '', name: 'ACCESORIO', defaultPrice: 0, iva: true, on: false }
];
var SERVICIO_SKU = '55002';
var EQUIPO_DEFAULT_PRICE = 2619000; // Precio base equipo excluido IVA

/**
 * Construye el desglose de facturación para un ensamblado/portátil.
 * @param {object} item - El item del carrito (ensamblado/portátil)
 * @param {number} totalConIva - El total con IVA de ese item (price * qty * 1000, con descuento si aplica)
 * @param {object} [overrides] - Overrides del usuario: { windows: {on, price}, kaspersky: {on, price}, ... }
 * @returns {object} { equipo, companions[], servicio, totalFacturado }
 */
function buildBillingBreakdown(item, totalConIva, overrides) {
  overrides = overrides || {};

  // Equipo principal — excluido de IVA
  var equipoPrice = (overrides.equipo && overrides.equipo.price !== undefined)
    ? overrides.equipo.price : EQUIPO_DEFAULT_PRICE;
  var equipoSku = (overrides.equipo && overrides.equipo.sku) || item.sku || '';

  // Companions activos
  var companions = [];
  var sumCompanions = 0;
  for (var i = 0; i < BILLING_COMPANIONS.length; i++) {
    var bc = BILLING_COMPANIONS[i];
    var ov = overrides[bc.key] || {};
    var isOn = ov.on !== undefined ? ov.on : bc.on;
    var price = ov.price !== undefined ? ov.price : bc.defaultPrice;
    var sku = ov.sku !== undefined ? ov.sku : bc.sku;
    var name = ov.name !== undefined ? ov.name : bc.name;

    companions.push({
      key: bc.key, sku: sku, name: name,
      price: price, iva: bc.iva, on: isOn
    });

    if (isOn && price > 0) {
      sumCompanions += price; // precio con IVA si gravado, precio total si excluido
    }
  }

  // Servicio Técnico = residuo
  var residuo = totalConIva - equipoPrice - sumCompanions;
  if (residuo < 0) residuo = 0;
  // Servicio es gravado al 19%, así que: subtotal = residuo/1.19, iva = residuo - subtotal
  var servicioSubtotal = round2(residuo / 1.19);
  var servicioIva = round2(residuo - servicioSubtotal);

  return {
    equipo: { sku: equipoSku, name: item.name, price: equipoPrice, iva: false },
    companions: companions,
    servicio: { sku: SERVICIO_SKU, name: 'SERVICIO TECNICO', price: residuo, subtotal: servicioSubtotal, ivaAmount: servicioIva, iva: true },
    totalFacturado: equipoPrice + sumCompanions + residuo
  };
}


/* ── COMBO COMPONENT PARSER ──────────────────────── */
function parseComboComponents(name, itemCat) {
  // ── FORMAT A (new PCs): "CASE V.T.+FANS/PROC+RAM+STORAGE+PSU+BOARD+MONITOR+PERIPH"
  // ── FORMAT A2 (variant): "CASE V.T. MESH/PROC+RAM+..."
  // ── FORMAT B (laptops): "BRAND MODEL-CODE/PROC+RAM+STORAGE+GPU+SCREEN+EXTRAS"
  // ── FORMAT C (legacy PCs): "CASE V.T.+specs / PROC+RAM+STORAGE+..."

  let headerLabel = 'Gabinete';  // default for PCs
  let casePart = '';
  let compStr = '';
  let isLaptop = (itemCat === 'PORTÁTIL');

  // ── Try V.T.+ pattern first (assembled PCs) ──
  let vtMatch = name.match(/^(.+?V\.T\.)\s*\+\s*(.+)$/i);
  let vtSlashMatch = !vtMatch ? name.match(/^(.+?V\.T\.\s*\w*)\s*\/\s*(.+)$/i) : null;

  if (vtMatch) {
    casePart = vtMatch[1].trim();
    let afterVT = vtMatch[2].trim();
    // Check legacy " / " after V.T.
    let slashIdx = afterVT.indexOf(' / ');
    if (slashIdx !== -1) {
      casePart += ' +' + afterVT.substring(0, slashIdx).trim();
      compStr = afterVT.substring(slashIdx + 3).trim();
    } else {
      // New format: first token may have FANS/PROC
      let firstPlus = afterVT.indexOf('+');
      let firstTok = firstPlus !== -1 ? afterVT.substring(0, firstPlus).trim() : afterVT.trim();
      let rest = firstPlus !== -1 ? afterVT.substring(firstPlus + 1).trim() : '';
      let innerSlash = firstTok.indexOf('/');
      if (innerSlash !== -1) {
        let caseFans = firstTok.substring(0, innerSlash).trim();
        let procStart = firstTok.substring(innerSlash + 1).trim();
        if (caseFans) casePart += ' +' + caseFans;
        compStr = procStart + (rest ? '+' + rest : '');
      } else {
        compStr = afterVT;
      }
    }
  } else if (vtSlashMatch) {
    // "POWER CL-L48 V.T. MESH/RYZ 5 9600X+16GB..."
    casePart = vtSlashMatch[1].trim();
    compStr = vtSlashMatch[2].trim();
  } else {
    // ── Try laptop / generic "BRAND MODEL/PROC+specs" pattern ──
    // El "+" que separa componentes es el que va DESPUÉS del "/". Mirar el
    // primero del nombre dejaba fuera los equipos cuyo gabinete/modelo ya trae
    // un "+" propio ("COUGAR FV150+ 4 A R G B /RYZ 5 9600X+...", y los que el
    // proveedor escribe "V.T+4" sin el punto final, que tampoco entran por las
    // dos ramas de V.T. de arriba): ahí el primer "+" cae antes del "/" y el
    // desglose no se generaba.
    let slashPos = name.indexOf('/');
    if (slashPos !== -1 && name.indexOf('+', slashPos) !== -1) {
      casePart = name.substring(0, slashPos).trim();
      compStr = name.substring(slashPos + 1).trim();
      if (isLaptop) headerLabel = 'Marca / Modelo';
    } else {
      // ── Legacy " / " split ──
      let parts = name.split(' / ');
      if (parts.length < 2) return null;
      casePart = parts[0].trim();
      compStr = parts.slice(1).join(' / ').trim();
    }
  }

  if (!compStr || !compStr.includes('+')) return null;

  // Split components by "+" but be smart: skip "+" inside known compound tokens
  // We'll split naively then merge tokens that look like continuations
  let raw = compStr.split('+');
  let components = [];
  let buf = '';

  // Component type prefixes we know
  let COMP_LABELS = {
    ryz: 'Procesador AMD Ryzen',
    ryzen: 'Procesador AMD Ryzen',
    core: 'Procesador Intel',
    intel: 'Procesador Intel',
    ddr4: 'Memoria RAM',
    ddr5: 'Memoria RAM',
    d4: 'Memoria RAM',
    d5: 'Memoria RAM',
    nvme: 'Almacenamiento NVMe',
    ssd: 'Almacenamiento SSD',
    rtx: 'Tarjeta de Video',
    rx: 'Tarjeta de Video',
    gtx: 'Tarjeta de Video',
    b550m: 'Motherboard',
    b650m: 'Motherboard',
    b840m: 'Motherboard',
    a520m: 'Motherboard',
    a620m: 'Motherboard',
    b550: 'Motherboard',
    b650: 'Motherboard',
    b840: 'Motherboard',
    b850: 'Motherboard',
    x670: 'Motherboard',
    z790: 'Motherboard',
    wifi: null, // suffix, skip as standalone
    'bz': null,
    'rgb': null
  };

  function labelFor(tok) {
    let lo = tok.toLowerCase().trim();
    // RAM: e.g. "16GB D4", "16GB D5", "32G D5", "8GB D5 NO EXP"
    if (/^\d+g[b]?\s+d[45]/i.test(lo)) return 'Memoria RAM';
    if (/^d[45]\s*rgb/i.test(lo)) return null; // suffix
    if (/^\d+w\s*bz$/i.test(lo) || /^\d+w$/i.test(lo)) return 'Fuente de poder';
    if (/^600w|650w|750w|800w|1000w/i.test(lo)) return 'Fuente de poder';
    // Monitor (desktop)
    if (/asus\s+\d+[\"\u201d]|asus\s+tuf\s+\d+|msi\s+\d+[\"\u201d]|gigabyte\s+\d+[\"\u201d]|lg\s+\d+[\"\u201d]|samsung\s+\d+[\"\u201d]/i.test(lo)) return 'Monitor';
    if (/\d+[\"\u201d]\s*(ips|fhd|qhd|ssips|uhd|oled|wuxga|wqxga|wqhd)/i.test(lo)) return isLaptop ? 'Pantalla' : 'Monitor';
    if (!isLaptop && /^(asus|msi|gigabyte|aoc|lg|viewsonic|samsung)\s+\d+/i.test(lo)) return 'Monitor';
    // Laptop screen: e.g. "15,6\" FHD", "14\" FHD+", "16\" WUXGA"
    if (/^\d+[,.]?\d*[\"\u201d]\s*(fhd|hd|qhd|oled|uhd|wuxga|wqxga|wqhd|2k|4k)/i.test(lo)) return 'Pantalla';
    // GPU labels: integrated or discrete
    if (/^(amd|intel|nvidia)\s+graphics/i.test(lo)) return 'Gráficos integrados';
    if (/^ryz\s*\d|^ryzen\s*\d/i.test(lo)) return 'Procesador AMD Ryzen';
    // "CORE ULTRA 9 275HX" y también "ULTRA 9 275HX" a secas — algunos
    // portátiles (ej. ASUS ROG) traen el nombre comercial sin "Core".
    if (/^core\s*i[0-9]|^core\s*ultra|^ultra\s*\d/i.test(lo)) return 'Procesador Intel';
    if (/^(ddr4|ddr5)/i.test(lo)) return 'Memoria RAM';
    if (/^nvme\s*\d+/i.test(lo)) return 'Almacenamiento NVMe';
    if (/^ssd/i.test(lo)) return 'Almacenamiento';
    if (/^rtx[\-\s]/i.test(lo)) return 'Tarjeta de Video RTX';
    if (/^rx[\-\s]/i.test(lo)) return 'Tarjeta de Video RX';
    if (/^gtx[\-\s]/i.test(lo)) return 'Tarjeta de Video GTX';
    // GPU con la capacidad adelante: "6GB RTX-4050", "12 GIGAS RTX 5070"
    if (/\b(rtx|gtx)\s*[-\s]?\d/i.test(lo)) return 'Tarjeta de Video';
    if (/\b\d+\s*(gb|gigas?)\b.*\brx\s*[-\s]?\d/i.test(lo)) return 'Tarjeta de Video';
    if (/^(b550|b650|b840|b850|a520|a620|x670|z790|z890|h610)/i.test(lo)) return 'Motherboard';
    if (/wifi/i.test(lo) && /^(b550|b650|b840|b850|a520|a620)/i.test(lo)) return 'Motherboard';
    if (/^t\+m|^t\s*\+\s*m/i.test(lo)) return 'Teclado + Mouse';
    if (/^fan\s/i.test(lo)) return 'Disipador/Fan';
    // Laptop extras: morral, mouse, etc.
    if (/morral|malet|mouse|funda|cargador/i.test(lo)) return 'Accesorio';
    // Color/finish as last token: "GRIS", "NEGRO", "PLATEADO"
    if (/^(gris|negro|plata|plateado|blanco|azul|rojo|silver|black|white)$/i.test(lo)) return 'Color';
    // Generic: if it has letters, treat as component
    if (/[a-z]{2,}/i.test(lo)) return '';
    return null;
  }

  // Parse tokens — merge short tokens that are actually suffixes
  let tokens = [];
  let acc = '';
  for (let i = 0; i < raw.length; i++) {
    let t = raw[i].trim();
    if (!t) continue;
    // If token is very short (<=3 chars) and no label, it's a suffix
    let lbl = labelFor(t);
    if (lbl === null && t.length <= 4 && acc) {
      acc += '+' + t;
      continue;
    }
    if (acc) tokens.push(acc);
    acc = t;
  }
  if (acc) tokens.push(acc);

  let result = [];
  // First component: case/brand with contextual label
  result.push({ label: headerLabel, value: casePart });

  for (let j = 0; j < tokens.length; j++) {
    let tok = tokens[j].trim();
    if (!tok) continue;
    let lbl2 = labelFor(tok);
    if (lbl2 === null) continue; // skip pure suffixes
    result.push({ label: lbl2 || 'Componente', value: tok });
  }

  // El último token suele traer el color pegado ("16\" WUXGA NEGRO"). Se
  // separa en su propio componente para que la ficha técnica no mezcle
  // pantalla y acabado en el mismo chip. Solo se agrega al final, así los
  // índices de _comboEdits ya guardados siguen apuntando a lo mismo.
  var TRAILING_COLOR = /\s+(gris|negro|plata|plateado|blanco|azul|rojo|verde|silver|black|white)$/i;
  if (result.length > 1) {
    var last = result[result.length - 1];
    var cm = last.value && last.value.match(TRAILING_COLOR);
    if (cm && last.label !== 'Color') {
      last.value = last.value.replace(TRAILING_COLOR, '').trim();
      result.push({ label: 'Color', value: cm[1] });
    }
  }

  // Mismo caso que el color, pero con el sistema operativo pegado a la
  // pantalla ("18\" WQXGA 2.5K WIN 11 HOME"): en el nombre de origen no
  // hay un "+" entre ambos, así que llegan como un solo token. Se separa
  // para que "Pantalla" no mezcle resolución y SO en la misma cápsula.
  var TRAILING_OS = /\s+(win(?:dows)?\s*1[01](?:\s*(?:home|pro|profesional))?|no\s*incluye\s*s\.?o\.?|sin\s*s\.?o\.?)\s*$/i;
  if (result.length > 1) {
    var lastOs = result[result.length - 1];
    var om = lastOs.value && lastOs.value.match(TRAILING_OS);
    if (om && lastOs.label !== 'Sistema operativo') {
      lastOs.value = lastOs.value.replace(TRAILING_OS, '').trim();
      result.push({ label: 'Sistema operativo', value: om[1].replace(/\s+/g, ' ').trim() });
    }
  }

  return result.length > 1 ? result : null;
}

/* ── ETIQUETAS DE LA FICHA TÉCNICA ─────────────────
   parseComboComponents() devuelve etiquetas que mezclan el tipo con la
   marca ("Procesador Intel", "Tarjeta de Video RTX"); acá se normalizan
   al tipo solo, que es lo que va en la cápsula.
   Se usa palabra completa en español y no la sigla técnica (CPU/GPU/SSD)
   a propósito: la ficha la lee el cliente final, que muchas veces no
   sabe del tema. La cápsula es de ancho fijo, así que caben.
   Etiqueta '' = el valor se muestra solo, sin rótulo. */
const COMBO_CHIP_LABELS = {
  'Procesador AMD Ryzen': 'PROCESADOR',
  'Procesador Intel': 'PROCESADOR',
  'Memoria RAM': 'MEMORIA',
  'Almacenamiento NVMe': 'ALMACENAMIENTO',
  'Almacenamiento SSD': 'ALMACENAMIENTO',
  'Almacenamiento': 'ALMACENAMIENTO',
  'Tarjeta de Video RTX': 'GRÁFICA',
  'Tarjeta de Video RX': 'GRÁFICA',
  'Tarjeta de Video GTX': 'GRÁFICA',
  'Tarjeta de Video': 'GRÁFICA',
  'Gráficos integrados': 'GRÁFICA',
  'Motherboard': 'BOARD',
  'Fuente de poder': 'FUENTE',
  'Monitor': 'MONITOR',
  'Pantalla': 'PANTALLA',
  'Disipador/Fan': 'REFRIGERACIÓN',
  'Teclado + Mouse': 'TECLADO',
  'Accesorio': 'ACCESORIO',
  'Color': 'COLOR',
  'Gabinete': 'CHASIS',
  'Sistema operativo': 'SISTEMA OPERATIVO',
  'Componente': ''
};

// Procesador y gráfica van resaltadas: son lo que el cliente compara primero.
const COMBO_CHIP_HERO = { 'PROCESADOR': 1, 'GRÁFICA': 1 };

function comboChipLabel(label) {
  if (label == null) return '';
  var s = COMBO_CHIP_LABELS[label];
  return s === undefined ? '' : s;
}

function isEnsamblado(item) {
  // Items from "EQUIPOS ENSAMBLADOS" category, assembled PCs with V.T. pattern,
  // portátiles with MODEL/PROC+specs pattern, or legacy " / " format
  if (item.cat === 'EQUIPOS ENSAMBLADOS' || item._cat === 'EQUIPOS ENSAMBLADOS') return true;
  if (item._cat === 'ENSAMBLADO') return true;
  var n = item.name || '';
  // Assembled PCs: "CASE V.T.+components"
  if (/V\.T\.\s*\+/i.test(n) && /\+/.test(n)) return true;
  if (/V\.T\.\s*\w*\s*\//i.test(n) && /\+/.test(n)) return true;
  // Portátiles: "BRAND MODEL-CODE/PROC+RAM+..." (has / followed by processor keyword, and +)
  if (item._cat === 'PORTÁTIL' && /\//.test(n) && /\+/.test(n)) return true;
  // Legacy format: " / " separator with "+"
  if (item._cat === 'ADICIONAL' && n.indexOf(' / ') !== -1 && /\+/.test(n)) return true;
  return false;
}

// --- Name similarity (word overlap) for scan mismatch detection ---
function _nameSimilarity(a, b) {
  if (!a || !b) return 0;
  var wordsA = a.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length >= 3 });
  var wordsB = b.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length >= 3 });
  if (!wordsA.length || !wordsB.length) return 0;
  var matches = 0;
  for (var i = 0; i < wordsA.length; i++) {
    for (var j = 0; j < wordsB.length; j++) {
      if (wordsA[i] === wordsB[j]) { matches++; break; }
    }
  }
  return matches / Math.max(wordsA.length, wordsB.length);
}

// --- IVA Extractor parsing ---
const COL_RE = /\b(\d{1,3}(?:[.,]\d{3})+)\b/g;
function pExt(s) { return parseFloat(s.replace(/[,.]/g, '')) }
function pExtNum(s) {
  // Parse Colombian number: may use dots as thousands OR just plain digits
  // e.g. "1.850.000" -> 1850000, "43,000" -> 43000, "129000" -> 129000
  s = s.trim();
  // Format with dots: 1.234.567
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''));
  // Format with comma as thousands: 43,000
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return parseInt(s.replace(/,/g, ''));
  // Plain number
  if (/^\d+$/.test(s)) return parseInt(s);
  return NaN;
}
function extractExt(text) {
  let res = [];
  // Split into lines, collapse whitespace runs
  let lines = text.split(/\n/).map(function (l) { return l.trim() }).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Match SKU at start: digits optionally followed by (letters+digits)
    // e.g.  26123(B1)  or  26123  or  4521(A2)
    let skuM = line.match(/^(\d{4,7}(?:\([A-Z0-9]+\))?)\s*[-\u2013]\s*/);
    if (!skuM) continue;

    let code = skuM[1];
    let rest = line.slice(skuM[0].length);

    // Find all numbers >= 1000 in the rest of this line
    // Numbers can be: 1.234.567  or  1,234,567  or  43,000  or  129000
    let numRe = /\b(\d{1,3}(?:[.,]\d{3})+|\d{5,})\b/g;
    let nums = [], m;
    while ((m = numRe.exec(rest)) !== null) {
      let v = pExtNum(m[1]);
      if (isNaN(v) || v < 1000 || v > 99999999) continue;
      // Discard if the number is surrounded by dashes or letters (model serial)
      let before = m.index > 0 ? rest[m.index - 1] : ' ';
      let after = m.index + m[0].length < rest.length ? rest[m.index + m[0].length] : ' ';
      if (/[-A-Za-z]/.test(before) || /[-A-Za-z]/.test(after)) continue;
      nums.push(v);
    }

    // Also scan next few lines if no numbers on this line (multi-line entries)
    if (!nums.length) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        // Stop if next product starts
        if (/^\d{4,7}(?:\([A-Z0-9]+\))?\s*[-\u2013]/.test(lines[j])) break;
        numRe.lastIndex = 0;
        while ((m = numRe.exec(lines[j])) !== null) {
          let v = pExtNum(m[1]);
          if (isNaN(v) || v < 1000 || v > 99999999) continue;
          // Discard if the number is surrounded by dashes or letters (model serial)
          let before = m.index > 0 ? lines[j][m.index - 1] : ' ';
          let after = m.index + m[0].length < lines[j].length ? lines[j][m.index + m[0].length] : ' ';
          if (/[-A-Za-z]/.test(before) || /[-A-Za-z]/.test(after)) continue;
          nums.push(v);
        }
        if (nums.length) break;
      }
    }

    if (!nums.length) continue;

    // Unit price = MINIMUM (avoids picking up the total when qty>1)
    let unitPrice = Math.min.apply(null, nums);

    // Description = everything before first number, trimmed
    let desc = rest.replace(/\s*\b(\d{1,3}(?:[.,]\d{3})+|\d{5,})\b.*/, '').trim().slice(0, 70);
    // Remove trailing noise (serial-like codes: 4n518...)
    desc = desc.replace(/\s+[a-z0-9]{6,}(\s+[a-z0-9]{6,})*\s*$/i, '').trim();

    res.push({ price: unitPrice, code: code, desc: desc, qty: 1 });
  }
  return res;
}

// ============================================================
// SECCIÓN: PARSER TSV — convierte texto tab-separated a array de productos
// Compatible con archivos exportados desde Excel / Google Sheets.
// Headers soportados: sku|codigo|code, name|nombre|descripcion, price|precio, cat|categoria|category
// ============================================================
function parseTSV(text) {
  if (!text || !text.trim()) return [];
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return []; // necesita al menos header + 1 fila

  // Detectar separador: tab o punto y coma
  var sep = '\t';
  if (lines[0].indexOf('\t') === -1 && lines[0].indexOf(';') !== -1) sep = ';';

  var headers = lines[0].split(sep).map(function (h) { return h.trim().toLowerCase().replace(/^["']|["']$/g, ''); });

  // Mapear columnas por alias
  var ALIAS = {
    sku: ['sku', 's', 'codigo', 'code', 'cod', 'código'],
    name: ['name', 'n', 'nombre', 'descripcion', 'description', 'producto', 'descripción'],
    price: ['price', 'p', 'precio', 'precio_miles_cop', 'precio_cop', 'valor'],
    cat: ['cat', 'c', 'categoria', 'category', 'categoría', 'tipo']
  };
  var colIdx = {};
  Object.keys(ALIAS).forEach(function (field) {
    for (var i = 0; i < headers.length; i++) {
      if (ALIAS[field].indexOf(headers[i]) !== -1) { colIdx[field] = i; break; }
    }
  });

  // name y price son obligatorios
  if (colIdx.name === undefined || colIdx.price === undefined) return [];

  var prods = [];
  for (var r = 1; r < lines.length; r++) {
    var line = lines[r].trim();
    if (!line) continue;
    var cols = line.split(sep).map(function (c) { return c.trim().replace(/^["']|["']$/g, ''); });

    var name = cols[colIdx.name] || '';
    var priceRaw = cols[colIdx.price] || '0';
    // Soportar formatos: "1.500.000", "1500000", "1,500", "1500"
    var price = parseFloat(priceRaw.replace(/\./g, '').replace(/,/g, '.'));
    if (!name || isNaN(price) || price < 0) continue;

    var sku = colIdx.sku !== undefined ? (cols[colIdx.sku] || String(r)) : String(r);
    var cat = colIdx.cat !== undefined ? (cols[colIdx.cat] || 'GENERAL') : 'GENERAL';

    prods.push({ sku: sku, name: name, price: price, cat: cat });
  }
  return prods;
}

/* ── VALOR EN LETRAS ───────────────────────────────
   Para el documento de empresas: en Colombia una cotización formal lleva
   el total escrito ("SON: OCHO MILLONES ... PESOS M/CTE."). Solo enteros:
   los totales del cotizador siempre son pesos redondos. */
function numeroALetras(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (!n) return 'CERO';

  var UNI = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE',
    'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES',
    'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  var DEC = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  var CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function hasta999(x) {
    if (x === 100) return 'CIEN';
    var c = Math.floor(x / 100), r = x % 100;
    var cen = CEN[c];
    if (!r) return cen;
    var res = r < 30 ? UNI[r] : DEC[Math.floor(r / 10)] + (r % 10 ? ' Y ' + UNI[r % 10] : '');
    return cen ? cen + ' ' + res : res;
  }

  function build(x) {
    if (x < 1000) return hasta999(x);
    if (x < 1e6) {
      var m = Math.floor(x / 1000), r = x % 1000;
      return (m === 1 ? 'MIL' : build(m) + ' MIL') + (r ? ' ' + hasta999(r) : '');
    }
    var mm = Math.floor(x / 1e6), rr = x % 1e6;
    return (mm === 1 ? 'UN MILLON' : build(mm) + ' MILLONES') + (rr ? ' ' + build(rr) : '');
  }

  return build(n);
}
