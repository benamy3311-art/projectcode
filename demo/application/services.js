// SERVICES LAYER - Use case orchestration

// Rango del ajuste de precio: negativo es aumento, positivo es descuento.
// Tope de aumento 10% y de descuento 10%. Si cambia, mover también el
// min/max del input #discPct en index.html.
const DISC_MIN = -10, DISC_MAX = 10;
function _discPctValido(v) { return !isNaN(v) && v !== 0 && v >= DISC_MIN && v <= DISC_MAX; }

function toggleDiscount() {
  let inp = document.getElementById('discPct');
  if (inp) { let v = parseFloat(inp.value); if (_discPctValido(v)) setState('discountPct', v); }
  setState('discountOn', !S.discountOn);
  renderUI();
}
function onDiscPctChange() {
  let v = parseFloat(document.getElementById('discPct').value);
  if (_discPctValido(v)) { setState('discountPct', v); renderUI(); }
}
function updateDiscLabel() {
  let isIncrease = S.discountPct < 0;
  let abs = Math.abs(S.discountPct);
  let lbl = document.getElementById('discBtnLbl');
  if (lbl) lbl.textContent = (isIncrease ? '+' : '-') + abs + '% ' + (isIncrease ? 'Aumento' : 'Descuento');
  let bn = document.getElementById('discBanner');
  if (bn) bn.textContent = (isIncrease ? '+' : '-') + abs + '% ' + (isIncrease ? 'Aumento de precio' : 'Descuento por pago en efectivo / transferencia');
}
function toggleRete() {
  setState('reteOn', !S.reteOn);
  renderUI();
}
function toggleShowIva() {
  setState('showIvaInQuote', document.getElementById('toggleShowIva').checked);
}

function toggleEnvio() {
  setState('incluyeEnvio', !S.incluyeEnvio);
  generateQuote(true);
}

function addItem(item) {
  // ── Validación de entrada ──────────────────────────────
  var name = String(item.name || '').trim();
  if (!name) { showToast('Producto sin nombre — no se puede agregar', 'warn'); return false; }

  var price = parseFloat(item.price);
  if (isNaN(price) || price < 0) {
    showToast('Precio inválido en "' + name.slice(0, 30) + '" — revisa el catálogo', 'warn');
    return false;
  }

  var qty = parseInt(item.qty, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  var sku = String(item.sku || '').trim();
  var source = getItemSource(item, S.activePriceList);
  if (!ensureCartSourceAllowed(source)) return false;
  var finalCat = item._cat || getCat(name) || 'ADICIONAL';
  var autoIva = (item.iva !== undefined) ? item.iva : (finalCat === 'PORTÁTIL' ? false : true);

  dispatch({
    type: 'ADD', item: {
      sku: sku, name: name, price: price, qty: qty,
      _cat: finalCat, note: String(item.note || '').trim(), iva: autoIva, source: source
    }
  });
  if (sku === '55002') showToast('Edita el precio del Servicio Técnico (clic en el precio)', 'info');
  return true;
}

// --- Catalog loading ---
// ============================================================
// SECCIÓN: AUTO-CARGA DE CATÁLOGO
// Intenta TSV primero, luego JSON como fallback.
// Si ambos fallan (file:// sin servidor), usa el botón Store.
// ============================================================

function _processCatalogArray(arr, listSource) {
  if (!Array.isArray(arr)) return [];

  // ¿Este array viene en COP completo (1629000) o ya en miles (1629)? No hay forma
  // de saberlo con certeza mirando un solo array, así que se mira el precio MÁS ALTO:
  // en miles el tope real ronda los 35.000 (=$35 millones), mientras que en COP el
  // tope está en los millones. Cualquier corte entre esos dos órdenes de magnitud
  // sirve; se usa 200.000 (=$200 mil millones si fuera miles, imposible en hardware).
  //
  // El umbral estaba en 30.000 y eso se volvió un bug real: en agosto/2026 el catálogo
  // empezó a traer equipos "POR ENCARGO" de más de $30 millones, así que UN solo ítem
  // (ej. $30.729.000 → 30.729 en miles) disparaba la detección sobre un array que YA
  // venía en miles y lo dividía otra vez, dejando TODOS los precios rotos
  // ($2.589.000 → "$3.000"). Con 200.000 haría falta un producto de $200 millones
  // para volver a confundirlo.
  //
  // Aparte, arr._alreadyNormalized permite saltarse la heurística del todo: lo ponen
  // los llamadores que ya pasaron por mapPdfProductToAppSchema (que hace la única
  // división que corresponde). Explícito le gana a adivinar; la heurística queda solo
  // para las rutas que sí reciben COP crudo (TSV, Excel, pegado manual).
  var COP_THRESHOLD = 200000;
  var needsNormalization = false;
  if (!arr._alreadyNormalized) {
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (p && typeof p === 'object') {
        var priceNum = Number(p.price);
        if (!isNaN(priceNum) && priceNum > COP_THRESHOLD) {
          needsNormalization = true;
          break;
        }
      }
    }
  }

  return arr.map(function (p) {
    if (p && typeof p === 'object') {
      p._listSource = listSource;
      if (!p._cat) {
        // Un tipo inequívoco en el NOMBRE gana sobre la sección del PDF: el
        // proveedor lista las memorias RAM dentro de la sección de boards, así
        // que la sección sola mandaba las 24 RAM a BOARD. Ver strongTypeCat().
        var strong = strongTypeCat(p.name || '');
        var mappedCat = mapExcelCat(p.cat || '');
        p._cat = strong || ((mappedCat && mappedCat !== 'ADICIONAL') ? mappedCat : getCat(p.name || ''));
      }
      
      // Si se requiere normalización, dividimos por 1000
      if (needsNormalization) {
        var priceNum = Number(p.price);
        if (!isNaN(priceNum) && priceNum > 500) {
          p.price = Math.round(priceNum / 1000);
        }
      }
    }
    return p;
  });
}

// ============================================================
// AUDITOR DE CATÁLOGO — detecta productos con bugs del parser PDF
// El parser externo a veces concatena texto promocional de un producto
// al producto anterior y le asigna un precio inflado, o directamente
// publica el catálogo entero roto (pasó el 25/08/2026: los 778 productos
// llegaron con precio null y categoría "SIN CATEGORÍA" porque el sitio
// cambió de formato y su parser no lo siguió). Esta función detecta esos
// casos; si son pocos (parser con hipo en 2-3 productos) queda como antes
// -aviso discreto solo para el admin, con detalle en consola-, pero si es
// una fracción grande del catálogo (algo realmente roto, no un producto
// suelto) le avisa a CUALQUIER usuario con un banner arriba, para que no
// se descubra por casualidad viendo un precio en $0 en plena cotización.
// ============================================================
var CATALOG_AUDIT_BROKEN_RATIO = 0.15; // >=15% del catálogo con problemas ⇒ aviso a todos, no solo admin

function _auditCatalogIssues(prods, listName) {
  if (!Array.isArray(prods) || !prods.length) return;
  var PROMO_PATTERNS = /(POR LA COMPRA|OBSEQUIO|¡OFERTA|REGALO|GRATIS)/i;
  var issues = [];
  var real = 0;          // productos reales (sin contar el ítem permanente "Servicio Técnico")
  var affected = 0;      // productos con AL MENOS un problema (un mismo producto puede
                          // sumar 2 issues -sin precio Y sin categoría, como pasó de
                          // verdad- así que issues.length no sirve para el % del banner)
  for (var i = 0; i < prods.length; i++) {
    var p = prods[i];
    if (!p || p.sku === '55002') continue; // ignorar items permanentes
    real++;
    var name = String(p.name || '');
    var price = p.price;
    var before = issues.length;
    if (PROMO_PATTERNS.test(name)) {
      issues.push({ kind: 'promo-tag', sku: p.sku, name: name, price: price, reason: 'Texto promocional en el nombre — posible mezcla con otro producto' });
    }
    if (price == null || price === 0) {
      issues.push({ kind: 'no-price', sku: p.sku, name: name, price: price, reason: 'Sin precio (parser PDF no lo extrajo)' });
    }
    if (!p.cat || String(p.cat).toUpperCase() === 'SIN CATEGORÍA') {
      issues.push({ kind: 'no-cat', sku: p.sku, name: name, price: price, reason: 'Sin categoría (parser PDF no la extrajo)' });
    }
    if (issues.length > before) affected++;
  }
  if (!issues.length) return;
  try {
    console.group('[Catálogo ' + listName + '] ' + issues.length + ' problemas en ' + affected + ' productos (parser PDF)');
    for (var j = 0; j < issues.length; j++) {
      console.warn('[' + issues[j].kind + '] SKU ' + issues[j].sku + ' — ' + issues[j].reason + '\n  Nombre: ' + String(issues[j].name).slice(0, 120) + '\n  Precio: ' + issues[j].price);
    }
    console.groupEnd();
  } catch(e){}
  window._catalogAudit = window._catalogAudit || {};
  window._catalogAudit[listName] = issues;

  var brokenRatio = real ? (affected / real) : 0;
  if (brokenRatio >= CATALOG_AUDIT_BROKEN_RATIO) {
    // Corrupción masiva: probablemente el catálogo entero está mal publicado, no un
    // producto suelto. Esto lo tiene que ver cualquiera que abra la app, no solo el
    // admin -por eso NO se filtra por admin-user como el aviso de abajo-.
    var pct = Math.round(brokenRatio * 100);
    if (typeof window.showTopNotice === 'function') {
      window.showTopNotice(
        listName + ' parece dañado: ' + affected + ' de ' + real + ' productos (' + pct + '%) sin precio o categoría.',
        'Ver detalle en consola',
        function () { try { console.table(issues.slice(0, 50)); } catch (e) {} }
      );
    } else if (typeof showToast === 'function') {
      showToast(listName + ': ' + pct + '% del catálogo parece dañado (' + affected + '/' + real + ') — revisar antes de cotizar', 'error');
    }
  } else {
    var isAdmin = document.body && document.body.classList && document.body.classList.contains('admin-user');
    if (isAdmin && typeof showToast === 'function') {
      showToast(listName + ': ' + affected + ' productos con posibles errores del parser PDF (ver consola)', 'warn');
    }
  }
}

// El catálogo NO puede salir de la caché del navegador. Es una lista de
// precios: un precio viejo en una cotización es un error de venta, no una
// molestia estética, y sin esto el navegador se queda con la copia guardada
// aunque el archivo ya haya cambiado en el servidor (los <script> se bustean
// con el ?v= de index.html, pero estos fetch no pasan por ahí).
//
// 'no-cache', no 'no-store': obliga a revalidar contra el servidor en cada
// carga, pero si el archivo no cambió responde 304 y no se vuelve a bajar.
// Fresco sin pagar la descarga completa cada vez.
function _fetchCatalogFile(url) {
  return fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
}

/** Intenta parsear respuesta como TSV o JSON según tipo */
function _parseResponse(text, url) {
  if (url.endsWith('.tsv')) {
    var arr = parseTSV(text);
    if (arr && arr.length) return arr;
    throw new Error('TSV sin productos');
  }
  var data = JSON.parse(text);
  // Detect PDF parser format: { categories: [...] } with nested products and COP prices
  if (data && Array.isArray(data.categories)) {
    if (typeof parsePdfCatalogJson === 'function' && typeof mapPdfProductToAppSchema === 'function') {
      var rawProds = parsePdfCatalogJson(data);
      var mapped = rawProds.map(function (p, i) { return mapPdfProductToAppSchema(p, i); });
      // mapPdfProductToAppSchema ya dividió el precio por 1000 (COP → miles). Marcarlo
      // para que _processCatalogArray no vuelva a dividir (ver comentario ahí).
      mapped._alreadyNormalized = true;
      return mapped;
    }
    throw new Error('JSON formato PDF parser: catalog-importer.js no está cargado');
  }
  var arr2 = Array.isArray(data) ? data : (data.catalog || data.products || data.data || null);
  if (!arr2 || !arr2.length) throw new Error('JSON sin productos');
  return arr2;
}

// ─── Catálogo Lite: persistencia local por dispositivo ───────────
// Los usuarios Lite NO cargan el catálogo SpeedLogic automáticamente
// (issue legal — la app no puede distribuir precios ajenos a usuarios
// que pagan al desarrollador). En su lugar, cada Lite sube su propio
// catálogo vía PDF parser y se guarda en localStorage por dispositivo.
function _isLite() {
  if (window._slUserIsLite === true) return true;
  try {
    if (localStorage.getItem('sl_was_lite') === '1') {
      window._slUserIsLite = true;
      return true;
    }
  } catch(e){}
  if (window._slBranding && window._slBranding.customEnabled) return true;
  return false;
}
function _isBranded() {
  if (_isLite()) return true;
  if (window._slBranding && window._slBranding.customEnabled && window._slBranding.brandName !== 'SpeedLogic') return true;
  return false;
}
function _liteLoadCatalog(slot) {
  // slot: 'store' o 'lago' (mismas slots que el sistema original)
  try {
    var raw = localStorage.getItem('sl_lite_cat_' + slot);
    if (!raw) return [];
    var prods = JSON.parse(raw);
    
    // MIGRACIÓN AUTOMÁTICA DE PRECIOS:
    // Si el usuario subió su catálogo antes de corregir la normalización de precios en el PDF parser,
    // los precios quedaron guardados como valores completos (ej: 1629000). Como la app multiplica
    // por 1000 al renderizar (catalogRow), esto hace que aparezcan con 3 ceros extra ($1.629.000.000).
    // Mismo criterio (y mismo umbral) que _processCatalogArray: se compara contra
    // 200.000 y no contra 30.000, porque el catálogo ya trae equipos de más de $30
    // millones y con el umbral viejo un solo ítem de esos volvía a dividir un catálogo
    // que ya estaba en miles, rompiendo todos los precios guardados.
    var needsMigration = false;
    if (Array.isArray(prods)) {
      for (var i = 0; i < prods.length; i++) {
        var p = prods[i];
        if (p && typeof p.price === 'number' && p.price > 200000) {
          needsMigration = true;
          break;
        }
      }
    }
    
    if (needsMigration) {
      var migrated = prods.map(function(p) {
        var clone = {};
        for (var k in p) { if (p.hasOwnProperty(k)) clone[k] = p[k]; }
        if (typeof clone.price === 'number' && clone.price > 500) {
          clone.price = Math.round(clone.price / 1000);
        }
        return clone;
      });
      // Guardar de vuelta para actualizar localStorage permanentemente
      localStorage.setItem('sl_lite_cat_' + slot, JSON.stringify(migrated));
      return migrated;
    }
    
    return prods;
  } catch(e) { return []; }
}
function _liteSaveCatalog(slot, products) {
  try { localStorage.setItem('sl_lite_cat_' + slot, JSON.stringify(products || [])); return true; }
  catch(e) { return false; }
}
function _liteClearCatalog(slot) {
  try { localStorage.removeItem('sl_lite_cat_' + slot); } catch(e){}
}

// ─── Catalog daily-expiry (desactivado — catálogo se actualiza vía GitHub) ───
function _isCatalogExpired() { return false; }
window._markCatalogImported = function() {};
window._dismissCatalogExpiredOverlay = function() {};
function _showCatalogExpiredOverlay() {}

// Guarda los productos actualmente parseados por el PDF parser en la slot
// indicada del catálogo Lite, y recarga la lista activa para que el usuario
// los vea de inmediato.
window._liteSaveParsedAs = function(slot) {
  if (!_isLite()) {
    if (typeof showToast === 'function') showToast('Función solo disponible en plan Lite', 'warn');
    return;
  }
  var prods = window.pdfProducts;
  if (!prods || !prods.length) {
    if (typeof showToast === 'function') showToast('No hay productos parseados todavía', 'warn');
    return;
  }
  // Adaptar el shape del PDF parser ({sku, name, category, price}) al shape
  // de la app. El PDF parser guarda precios reales (ej: 1629000) pero la app
  // usa precios en miles (ej: 1629), así que dividimos por 1000.
  var normalized = prods.map(function(p) {
    var clone = {};
    for (var k in p) { if (p.hasOwnProperty(k)) clone[k] = p[k]; }
    if (typeof clone.price === 'number' && clone.price > 500) {
      clone.price = Math.round(clone.price / 1000);
    }
    return clone;
  });
  var ok = _liteSaveCatalog(slot, normalized);
  if (!ok) {
    if (typeof showToast === 'function') showToast('No se pudo guardar (sin espacio en el navegador)', 'error');
    return;
  }
  window._markCatalogImported();
  window._dismissCatalogExpiredOverlay();
  var label = slot === 'lago' ? 'Lista 2' : 'Lista 1';
  if (typeof showToast === 'function') showToast(prods.length + ' productos guardados en ' + label, 'success');

  // Recargar la lista activa para que los productos aparezcan en Catálogo
  if (slot === 'store') {
    autoLoadCatalog();
  } else {
    activateLago();
  }

  // Llevar al usuario al tab Catálogo para que vea el resultado
  if (typeof switchTab === 'function') setTimeout(function(){ switchTab('c'); }, 400);
};

function autoLoadCatalog() {

  // Lite: cargar SOLO desde localStorage. Sin fetch a datos SpeedLogic.
  if (_isLite()) {
    var prods = _liteLoadCatalog('store');
    CATALOG = _processCatalogArray(prods, 'store');
    ensurePermanentItems(CATALOG, 'store');
    AppState.filtered = CATALOG.slice();
    updateCatFilterOpts();
    filterCat();
    var labelEl = document.getElementById("catDate");
    var nEl = document.getElementById("catTabN");
    var realCount = CATALOG.filter(function(p){ return p.sku !== '55002'; }).length;
    if (labelEl) labelEl.textContent = realCount
      ? ('Lista 1 · ' + CATALOG.length + ' productos')
      : 'Lista 1 · sin cargar';
    if (nEl) nEl.textContent = CATALOG.length;
    hideCatalogBanner();
    return;
  }
  // Intentar TSV primero, luego catalog_store.tsv.json (PDF parser), luego JSON plano
  _fetchCatalogFile("data/store/catalog_store.tsv")
    .then(function (text) { return _parseResponse(text, 'catalog_store.tsv'); })
    .catch(function () {
      // Fallback a catalog_store.tsv.json (formato PDF parser)
      return _fetchCatalogFile("data/store/catalog_store.tsv.json")
        .then(function (text) { return _parseResponse(text, 'catalog_store.tsv.json'); })
        .catch(function () {
          // Fallback final a JSON plano
          return _fetchCatalogFile("data/store/catalog_store.json")
            .then(function (text) { return _parseResponse(text, 'catalog_store.json'); });
        });
    })
    .then(function (arr) {
      CATALOG = _processCatalogArray(arr, 'store');
      ensurePermanentItems(CATALOG, 'store');
      AppState.filtered = CATALOG.slice();
      updateCatFilterOpts();
      filterCat();
      var d = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
      document.getElementById("catDate").textContent = "Lista " + d + " · " + CATALOG.length + " productos";
      document.getElementById("catTabN").textContent = CATALOG.length;
      hideCatalogBanner();
      _auditCatalogIssues(CATALOG, 'Lista 1');
    })
    .catch(function (err) {
      console.info("Catálogo no disponible (" + err.message + "). Usa el botón Store.");
    });
}

function activateLago() {
  var btn = document.getElementById('btnActivateLago');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="lago-loading-bar"></span> Cargando...'; }

  // Lite: usar localStorage, sin fetch a datos SpeedLogic
  if (_isLite()) {
    var prods = _liteLoadCatalog('lago');
    if (!prods.length) {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Activar Lista 2'; }
      if (typeof showToast === 'function') showToast('Lista 2 vacía — súbela en el Parser PDF primero', 'warn');
      return;
    }
    var processed = _processCatalogArray(prods, 'lago');
    ensurePermanentItems(processed, 'lago');
    S.catalogLago = processed;
    if (switchPriceList('lago')) {
      var labelEl = document.getElementById("catDate");
      var nEl = document.getElementById("catTabN");
      if (labelEl) labelEl.textContent = 'Lista 2 · ' + processed.length + ' productos';
      if (nEl) nEl.textContent = processed.length;
      if (typeof showToast === 'function') showToast('Lista 2 activada · ' + processed.length + ' productos', 'info');
    } else {
      if (typeof showToast === 'function') showToast('No se puede activar Lista 2 — hay productos de Lista 1 en el carrito', 'warn');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Activar Lista 2'; }
    return;
  }

  // Intentar TSV primero, luego catalog_lago.tsv.json (PDF parser), luego JSON plano
  _fetchCatalogFile("data/lago/catalog_lago.tsv")
    .then(function (text) { return _parseResponse(text, 'catalog_lago.tsv'); })
    .catch(function () {
      // Fallback a catalog_lago.tsv.json (formato PDF parser)
      return _fetchCatalogFile("data/lago/catalog_lago.tsv.json")
        .then(function (text) { return _parseResponse(text, 'catalog_lago.tsv.json'); })
        .catch(function () {
          return _fetchCatalogFile("data/lago/catalog_lago.json")
            .then(function (text) { return _parseResponse(text, 'catalog_lago.json'); });
        });
    })
    .then(function (arr) {
      var prods = _processCatalogArray(arr, 'lago');
      ensurePermanentItems(prods, 'lago');
      S.catalogLago = prods;
      if (switchPriceList('lago')) {
        var d = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
        document.getElementById("catDate").textContent = "Lista 2 · " + d + " · " + prods.length + " productos";
        document.getElementById("catTabN").textContent = prods.length;
        showToast('Lista 2 activada · ' + prods.length + ' productos', 'info');
      } else {
        showToast('No se puede activar Lista 2 — hay productos de Lista 1 en el carrito', 'warn');
      }
      _auditCatalogIssues(prods, 'Lista 2');
    })
    .catch(function (err) {
      showToast('Error cargando Lista 2: ' + err.message, 'error');
    })
    .finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Activar Lista 2'; }
    });
}

// --- Text parsing ---
function parseRaw(raw) {
  if (!raw || !raw.trim()) { showToast('El texto está vacío', 'warn'); return []; }
  let lines = raw.split('\n').map(function (l) { return l.trim() }), blocks = [], cur = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line) { if (cur !== null) { blocks.push(cur); cur = null } continue }
    if (/^\d/.test(line)) { if (cur !== null) blocks.push(cur); cur = line } else { cur = cur !== null ? cur + ' ' + line : line }
  }
  if (cur !== null) blocks.push(cur);
  let result = [], skipped = 0;
  for (let b = 0; b < blocks.length; b++) {
    let clean = blocks[b].replace(/\s+/g, ' ').trim(), tokens = clean.split(' ');
    if (tokens.length < 2) { skipped++; continue; }
    let ps = tokens[tokens.length - 1].replace(/\./g, '').replace(',', ''), price = parseInt(ps);
    if (isNaN(price) || price < 5) { skipped++; continue; }
    let qty = 1, nameEnd = tokens.length - 1;
    if (tokens.length >= 3) { let qm = tokens[tokens.length - 2].match(/^x(\d+)$/i); if (qm) { qty = parseInt(qm[1]); nameEnd--; } }
    let sku = tokens[0], name = tokens.slice(1, nameEnd).join(' ').trim();
    if (!name) { skipped++; continue; }
    result.push({ sku: sku, name: name, price: price, qty: qty, _cat: null, note: '', source: S.activePriceList });
  }
  if (!result.length) { showToast('No se reconoció ningún producto. Formato esperado: SKU NOMBRE PRECIO', 'warn'); }
  else if (skipped > 0) { showToast( skipped + ' línea' + (skipped > 1 ? 's' : '') + ' omitida' + (skipped > 1 ? 's' : '') + ' por formato incorrecto', 'warn'); }
  return result;
}

function insertAC(sku, name, price, cat) {
  var ok = addItem({ sku: sku, name: name, price: price, _cat: cat || null, note: '', source: S.activePriceList });
  if (!ok) return;
  var ac2 = document.getElementById('skuAc'); if (ac2) ac2.classList.remove('on');
  document.getElementById('rawInput').value = '';
  showToast('' + name.slice(0, 30) + '... a\u00f1adido', 'success');
}

// --- Catalog filtering ---
function filterCat() {
  let src = S.activePriceList === 'lago' ? S.catalogLago : CATALOG;
  let q = document.getElementById('catSearch').value.toLowerCase().trim(), cat = document.getElementById('catFilter').value;
  filtered = src.filter(function (p) {
    var pName = p.name ? p.name.toLowerCase() : '';
    var pSku = p.sku != null ? String(p.sku).toLowerCase() : '';
    var pCat = p._cat || p.cat || p.category || '';
    var matchQ = !q || pName.includes(q) || pSku.includes(q);
    var matchCat = !cat || pCat === cat;
    return matchQ && matchCat;
  });
  filtered.sort(function (a, b) { return catOrd(a._cat) - catOrd(b._cat); });
  renderCat();
  if (filtered.length === 0 && q.length >= 3) {
    if (typeof window._logFailedSearchDebounced === 'function') {
      window._logFailedSearchDebounced(q);
    }
  }
}
function renderCat() {
  let list = document.getElementById('catList');
  let src = S.activePriceList === 'lago' ? S.catalogLago : CATALOG;

  // Empty state Lite: si el usuario es Lite y la lista activa (Lista 1 o
  // Lista 2) está vacía, mostrar el tutorial completo en lugar del
  // mensaje genérico. Oculta el listado y muestra los pasos.
  var emptyLite = document.getElementById('liteCatalogEmpty');
  var realCount = src.filter(function(p){ return p.sku !== '55002'; }).length;
  if (_isLite() && !realCount) {
    if (emptyLite) emptyLite.style.display = 'block';
    list.style.display = 'none';
    var listaLbl = S.activePriceList === 'lago' ? 'Lista 2' : 'Lista 1';
    // Actualizar el texto del tutorial con la lista activa
    var btnNext = emptyLite ? emptyLite.querySelector('button') : null;
    if (btnNext) btnNext.innerHTML = 'Ir al Parser PDF ' + icon('arrow-right', 'ico-sm');
    var ccount = document.getElementById('catCount');
    if (ccount) ccount.textContent = listaLbl + ' vacía';
    return;
  }
  if (emptyLite) emptyLite.style.display = 'none';
  list.style.display = '';

  // Empty state for Lago if not loaded yet (non-Lite)
  if (S.activePriceList === 'lago' && !src.length) {
    list.innerHTML = '<div class="cempty empty-state" style="padding:40px 20px"><div style="font-weight:600;margin-bottom:6px;color:var(--gray-600)">Lista 2 vacía</div><div style="font-size:11.5px;color:var(--gray-400)">Carga un JSON con el botón <strong>Lista 2</strong> de arriba</div></div>';
    document.getElementById('catCount').textContent = '0 productos';
    return;
  }
  document.getElementById('catCount').textContent = filtered.length + ' productos';
  if (!filtered.length) { list.innerHTML = '<div class="cempty empty-state">Sin resultados</div>'; return }
  let q = document.getElementById('catSearch').value.trim(), catF = document.getElementById('catFilter').value;
  let grouped = {};
  for (let i = 0; i < filtered.length; i++) { let p = filtered[i]; let key = p._cat || 'ADICIONAL'; if (!grouped[key]) grouped[key] = []; grouped[key].push(p) }
  let h = '', cats = Object.keys(grouped).sort(function (a, b) { return catOrd(a) - catOrd(b); });
  for (let c = 0; c < cats.length; c++) {
    let cat = cats[c], prods = grouped[cat];
    if (!q && !catF) h += '<div class="csec-hdr">' + esc(cat) + ' <span class="csec-count">(' + prods.length + ')</span></div>';
    for (let j = 0; j < prods.length; j++) {
      let p = prods[j], idx = filtered.indexOf(p), inCart = false;
      for (let k = 0; k < items.length; k++) { if (items[k].sku === p.sku) { inCart = true; break } }
      let cs = CAT_STYLE[p._cat || 'ADICIONAL'] || 'cb-add';
      h += T.catalogRow(p, idx, cs, inCart);
    }
  }
  list.innerHTML = h;
}
function addFromCat(i) {
  let p = filtered[i];
  if (!p) return;
  let ok = addItem({ sku: p.sku, name: p.name, price: p.price, _cat: p._cat || null, note: '', source: p._listSource || S.activePriceList });
  if (!ok) return;
  let btn = document.getElementById('cadd-' + i);
  if (btn) { btn.innerHTML = icon('check', 'ico-sm'); btn.classList.add('added'); setTimeout(function () { if (btn) { btn.textContent = '+ A\u00f1adir'; btn.classList.remove('added') } }, 1600) }
  showToast('' + p.name.slice(0, 32), 'success');
}

// Limpia el nombre del cat\u00e1logo para una b\u00fasqueda web \u00fatil: quita las
// especificaciones entre par\u00e9ntesis y la cola promocional, y colapsa
// espacios. Ej: "AMD RYZEN 9 9900X (5,6-12COR RADEON) AM5 NO FAN TR POR LA
// COMPRA DE LA TARJETA... \u00a1OBSEQUIO!" \u2192 "AMD RYZEN 9 9900X AM5 NO FAN TR".
function cleanProdQuery(name) {
  var s = String(name == null ? '' : name);
  s = s.replace(/\([^)]*\)/g, ' ');                                                        // specs entre par\u00e9ntesis
  s = s.replace(/\b(por la compra|obsequio|de regalo|gratis|promoci[o\u00f3]n|promo|llevando|combo)\b[\s\S]*$/i, ' '); // cola promocional
  s = s.replace(/[\u00a1!]+/g, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}

// Abre una b\u00fasqueda web de Google del producto. Reutiliza siempre la misma
// pesta\u00f1a ('sl_gsearch') para no acumular ventanas al revisar varios.
function gsearchCat(i) {
  var p = filtered[i];
  if (!p) return;
  var q = cleanProdQuery(p.name) || String(p.name || '');
  window.open('https://www.google.com/search?q=' + encodeURIComponent(q), 'sl_gsearch');
}

// Vac\u00eda un campo (input/textarea) y dispara su evento 'input' para que se
// re-ejecute la l\u00f3gica asociada (filtro del cat\u00e1logo, notas de la cotizaci\u00f3n\u2026).
// Lo usa el bot\u00f3n \u00d7 de los campos con clase .clearable.
function clearField(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

function switchPriceList(which, opts) {
  opts = opts || {};
  which = normListSource(which);
  if (!opts.force && !ensureCartSourceAllowed(which)) return false;
  S.activePriceList = which;
  // Lago no muestra IVA (precios sin IVA), Store sí
  var ivaChk = document.getElementById('toggleShowIva');
  if (ivaChk) { var showIva = which !== 'lago'; ivaChk.checked = showIva; setState('showIvaInQuote', showIva); }
  let btnStore = document.getElementById('plBtnStore'), btnLago = document.getElementById('plBtnLago');
  if (btnStore) btnStore.classList.toggle('active', which === 'store');
  if (btnLago) btnLago.classList.toggle('active', which === 'lago');
  document.getElementById('catSearch').value = '';
  document.getElementById('catFilter').value = '';
  updateCatFilterOpts();
  filterCat();
  let src = which === 'lago' ? S.catalogLago : CATALOG;

  var isBranded = _isBranded();
  let tabN = src.length || (isBranded ? 0 : (which === 'store' ? 844 : 0));
  document.getElementById('catTabN').textContent = tabN;

  let dateEl = document.getElementById('catDate');
  if (which === 'lago') {
    var name = 'Lista 2';
    var realCount = src.filter(function(p){ return p.sku !== '55002'; }).length;
    dateEl.textContent = realCount ? name + ' \u00b7 ' + src.length + ' productos' : name + ' \u00b7 sin cargar';
  } else {
    var name = 'Lista 1';
    var realCount = CATALOG.filter(function(p){ return p.sku !== '55002'; }).length;
    dateEl.textContent = realCount ? name + ' \u00b7 ' + CATALOG.length + ' productos' : name + ' \u00b7 sin cargar';
  }
  // Recargar las "Notas del parche" (diff de precios) de la lista reci\u00e9n activada.
  if (window.PatchNotes && typeof window.PatchNotes.load === 'function') { try { window.PatchNotes.load(which); } catch (e) {} }
  return true;
}

function loadCatalogFile(input, listTarget) {
  if (!input.files || !input.files[0]) return;
  let target = listTarget || 'store';
  let file = input.files[0];
  let isTSV = /\.(tsv|txt)$/i.test(file.name);
  let reader = new FileReader();
  reader.onload = function (e) {
    try {
      let prods = [];
      let rawText = e.target.result;

      if (isTSV) {
        // --- Parsear como TSV ---
        let tsvArr = parseTSV(rawText);
        if (!tsvArr || !tsvArr.length) { showToast('TSV sin productos válidos', 'warn'); return; }
        prods = _processCatalogArray(tsvArr, target);
      } else {
        // --- Parsear como JSON (lógica original) ---
        let data = JSON.parse(rawText);
        let arr = Array.isArray(data) ? data : (data.catalog || data.products || data.data || null);
        if (!arr || !arr.length) { showToast('JSON sin productos válidos', 'warn'); return; }
        for (let i = 0; i < arr.length; i++) {
          let item = arr[i];
          let sku = String(item.sku || item.s || item.codigo || item.code || '').trim();
          let name = String(item.name || item.n || item.nombre || item.descripcion || item.description || '').trim();
          let price = parseFloat(item.price || item.p || item.precio || item.precio_miles_cop || item.precio_cop || 0);
          let cat = String(item.cat || item.c || item.categoria || item.category || 'GENERAL').trim();
          let mappedCat = mapExcelCat(cat);
          // Mismo criterio que _processCatalogArray: el tipo inequívoco del
          // nombre gana sobre la sección declarada en el archivo.
          let _cat = String(item._cat || item.t || strongTypeCat(name) || (mappedCat && mappedCat !== 'ADICIONAL' ? mappedCat : null) || getCat(name)).trim();
          if (name && !isNaN(price) && price >= 0) {
            prods.push({ sku: sku || String(i + 1), name: name, price: price, cat: cat, _cat: _cat, _listSource: target });
          }
        }
      }

      if (!prods.length) { showToast('No se encontraron productos válidos', 'warn'); return; }
      let label = target === 'lago' ? 'Lista 2' : 'Lista 1';
      let d = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      hideCatalogBanner();
      if (target === 'lago') {
        S.catalogLago = prods;
        ensurePermanentItems(S.catalogLago, 'lago');
        if (switchPriceList('lago')) {
          document.getElementById('catDate').textContent = 'Lista 2 · Actualizado ' + d + ' · ' + prods.length + ' productos';
          showToast('\u2705 ' + label + ': ' + prods.length + ' productos cargados', 'success');
        } else {
          showToast('\u2705 ' + label + ' cargada (' + prods.length + ') · cambio bloqueado por carrito en ' + listSourceLabel(getCartListSource()), 'success');
        }
      } else {
        CATALOG = prods;
        ensurePermanentItems(CATALOG, 'store');
        if (switchPriceList('store')) {
          document.getElementById('catDate').textContent = 'Lista 1 · Actualizado ' + d + ' · ' + prods.length + ' productos';
          showToast('\u2705 ' + label + ': ' + prods.length + ' productos cargados', 'success');
        } else {
          showToast('\u2705 ' + label + ' cargada (' + prods.length + ') · cambio bloqueado por carrito en ' + listSourceLabel(getCartListSource()), 'success');
        }
      }
    } catch (err) { showToast('\u274c Error: ' + err.message, 'error'); }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}
// Alias para compatibilidad con HTML existente
var loadJSON = loadCatalogFile;

function updateCatFilterOpts() {
  let src = S.activePriceList === 'lago' ? S.catalogLago : CATALOG;
  let sel = document.getElementById('catFilter'), cats = [], seen = {};
  for (let i = 0; i < src.length; i++) { var c = src[i]._cat || src[i].cat || src[i].category || ''; if (c && !seen[c]) { cats.push(c); seen[c] = 1 } }
  sel.innerHTML = '<option value="">Todas las categor\u00edas</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>' }).join('');
}

// --- Quote generation ---
// ============================================================
// SECCIÓN: GENERACIÓN DE COTIZACIÓN PDF/HTML
// ============================================================
function generateQuote(silent) {
  if (!items.length) { if (!silent) { showToast('Agrega productos al catálogo primero', 'warn'); switchTab('c'); } return }
  if (!silent) switchTab('q');
  // El QR de la cabecera (ver quote-qr.js) codifica este id — tiene que
  // existir ANTES de armar el encabezado, no solo cuando se guarda en
  // historial (_doSave, más abajo) o el primer render se queda sin QR.
  if (!S.currentQuoteId) setState('currentQuoteId', newQuoteId());
  var calc = calcEngine();
  var numCot = document.getElementById('numCot').value, asesor = document.getElementById('asesor').value.toUpperCase();
  var cliente = document.getElementById('cliente').value || '—', wa = document.getElementById('whatsapp').value, validez = document.getElementById('validez').value, garantia = (document.getElementById('garantia') || {}).value || '12 meses', notas = document.getElementById('notasCot') ? document.getElementById('notasCot').value.trim() : '';
  var sorted = calc.sorted, total = calc.totalConIva, totalGravado = calc.totalGravado, totalExcluido = calc.totalExcluido;
  var bizCfg = loadCfg();
  var warrantyGroups = computeWarrantyGroups(sorted, garantia, bizCfg);
  var rows = '';
  for (var i = 0; i < sorted.length; i++) {
    var it = sorted[i], idx = items.indexOf(it), cat = it._cat || getCat(it.name), unitD = applyDisc(it.price) * 1000, lineT = unitD * it.qty;
    var ivaBadge = S.showIvaInQuote && it.iva === false && calc.totalGravado > 0 ? '<span class="excl-badge">EXCL. IVA</span>' : '';
    var uCell = T.quoteUnitCell(unitD, idx);
    var noteRow = it.note ? '<tr><td colspan="6" class="notetd">Nota: ' + esc(it.note) + '</td></tr>' : '';
    var isComboHeader = it._showComponents && isEnsamblado(it);

    // Ficha técnica en chips (CPU / RAM / SSD / GPU...)
    var specChips = '';
    var displayName = it.name;
    if (isComboHeader) {
      var comps = parseComboComponents(it.name, it._cat);
      if (comps && comps.length) {
        // Al desglosar, el texto principal se recorta a la referencia (modelo / gabinete)
        // y la primera entrada (Marca/Modelo) se omite para no repetirla.
        displayName = (it._comboEdits && it._comboEdits[0] !== undefined ? it._comboEdits[0] : comps[0].value) || it.name;
        specChips = T.quoteSpecChips(comps, idx, it._comboEdits);
      }
    }

    rows += T.quoteRow(it, cat, ivaBadge, uCell, lineT, isComboHeader, specChips, noteRow, displayName, idx);
  }

  var now = new Date(), today = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }), timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  var todayLong = now.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  var notasBlock = notas ? `<div style="margin:10px 28px 0;padding:10px 14px;background:#f8fafc;border-left:3px solid var(--blue);border-radius:4px;font-size:9.5px;color:#374151;white-space:pre-wrap">${esc(notas)}</div>` : '';

  // Si todas las cantidades son 1, "V. Unitario" repite exactamente lo mismo
  // que "Total" en cada fila. Se oculta por CSS (no se quita del DOM) para no
  // tener que recalcular los colspan de notas y ficha técnica.
  var hideUnit = sorted.every(function (it) { return it.qty === 1 });

  // Filigrana: el mismo logo del encabezado, al 3.5% — da cuerpo al papel
  // sin competir con nada. Va como <img> y no como background de pseudo-
  // elemento porque html2canvas sí la captura así.
  var wmSrc = T.brandLogoSrc();
  var wmBlock = wmSrc ? `<img class="qdoc-wm" src="${wmSrc}" alt="" aria-hidden="true">` : '';

  // Barra de acciones bajo el documento — igual en los dos modos.
  var accionesBlock = `<div class="vendido-wrap no-print"><button class="btn-vendido btn-add-prod" onclick="openQuickAddModal()"><span class="ico ico-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span> Agregar producto</button><button class="btn-vendido btn-vender" onclick="window.TiendaVender&&TiendaVender.desdeCotizacion()" title="Pasar esta cotización a una venta con recibo o remisión"><span class="ico ico-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6L5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></svg></span> Vender</button><button class="btn-vendido btn-facturar" onclick="openBilling()"><span class="ico ico-sm"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span> Facturar</button><button class="btn-vendido btn-gen-txt" onclick="openQuoteTextModal()"><span class="ico ico-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></span> Generar texto</button><button class="btn-vendido btn-nueva-cot" onclick="nuevaCotizacion()"><span class="ico ico-sm"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg></span> Nueva cotización</button></div>`;

  // Modo Empresas: el documento A4 reemplaza al de pantalla, y como el
  // boton PDF imprime lo que hay en #qWrap, el export sale en el formato
  // que el vendedor tiene seleccionado — no se manda una hoja de
  // condiciones corporativas por una pasta termica.
  var docHtml = (S.empresaMode && typeof renderEmpresaDoc === 'function')
    ? renderEmpresaDoc() + accionesBlock
    : `<div class="qdoc${hideUnit ? ' no-unit' : ''}" id="quoteDoc">
      ${wmBlock}
      ${T.quoteHeader(numCot, wa, todayLong, asesor, cliente, S.activePriceList, S.currentQuoteId)}
      ${T.quoteDisclaimer(S.showIvaInQuote, totalExcluido, totalGravado)}
      <table><thead><tr>
        <th class="c">Cant</th><th>SKU</th><th>Descripci&oacute;n</th><th>Categor&iacute;a</th><th class="r unit-h">V. Unitario</th><th class="r">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="qbottom">
        ${T.quoteCond(validez, warrantyGroups)}
        ${T.quoteTotalCard(calc, S.showIvaInQuote, S.discountOn, S.discountPct, S.reteOn)}
      </div>
      ${notasBlock}
      ${T.quoteFootInfo(bizCfg)}
      ${accionesBlock}
    </div>`;

  document.getElementById('qWrap').innerHTML = docHtml;

  // ── Guardado en historial ──────────────────────────────────
  // Siempre guardar, ya sea invocación explícita (!silent) o refresh
  // reactivo (silent).  Los refreshes silenciosos usan debounce para
  // no saturar localStorage en cada micro-cambio.
  var _doSave = function () {
    // Un guardado en cola puede dispararse cuando el carrito YA se vació
    // (Limpiar todo / Nueva cotización). Guardarlo dejaba una cotización
    // fantasma de 0 productos en el historial, en la nube y en las stats.
    if (!items.length) return;
    // Este guardado ya cubre el carrito actual → descartar el autosave de
    // dispatch que pudo quedar en cola desde antes de abrir la cotización.
    clearTimeout(dispatch._autoSaveTimer);
    if (!S.currentQuoteId) setState('currentQuoteId', newQuoteId());
    var _histEntry = { id: S.currentQuoteId, num: numCot, cliente: document.getElementById('cliente').value || '', asesor: asesor, letra: window._slAsesorLetter || '', total: total, date: today, time: timeStr, items: slimHistItems(items), priceList: (function () { var cs = getCartListSource(); return cs === 'mixed' ? normListSource(S.activePriceList) : normListSource(cs || S.activePriceList) })(), wa: wa, validez: validez, garantia: garantia, notas: notas, reteOn: S.reteOn, discountOn: S.discountOn, discountPct: S.discountPct, showIva: S.showIvaInQuote, empresaCliente: (S.empresaMode && S.empresaCliente) ? S.empresaCliente : undefined };
    saveHist(_histEntry);
    if (window._logQuote) window._logQuote(_histEntry);

    var currentNum = parseInt(numCot, 10) || 0;
    var prevLast = parseInt(_ls.get('lastQuoteNum', '0'), 10) || 0;
    _ls.set('lastQuoteNum', Math.max(prevLast, currentNum));

    updateHistBadge();
  };

  if (!silent) {
    // Invocación explícita → guardar de inmediato, descartando el guardado
    // silencioso en cola (traería valores de cabecera ya obsoletos).
    clearTimeout(generateQuote._saveTimer);
    _doSave();
  } else {
    // Refresh reactivo → debounce 1.5s para no saturar localStorage
    clearTimeout(generateQuote._saveTimer);
    generateQuote._saveTimer = setTimeout(_doSave, 1500);
  }
}

function removeQuoteItem(idx) {
  // Recibe el índice real en `items` (calculado con items.indexOf en el
  // loop de generateQuote). Debe pasar por dispatch para que se
  // re-renderice también la lista lateral (renderItems) y no queden
  // tarjetas con índices desfasados. Antes hacía splice directo + solo
  // regeneraba el documento, dejando el item "fantasma" en el sidebar
  // e imposibilitando editar/borrar los items siguientes.
  idx = Number(idx);
  if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
    dispatch({ type: 'REMOVE', index: idx });
  }
}

// --- AI Image scanning ---
// Prompt compartido entre Gemini (motor principal) y el respaldo OpenAI —
// deben leer la imagen exactamente igual, solo cambia el transporte.
var SCAN_PROMPT = 'Analiza esta cotización o lista de precios y extrae SOLO los productos que realmente aparecen visibles en la imagen.\nIMPORTANTE: Primero cuenta cuántas filas de productos hay en la tabla. Luego extrae EXACTAMENTE esa cantidad de productos. NO inventes, adivines ni agregues productos que no estén en la imagen. Si no puedes leer claramente una línea, omítela.\nUna línea por producto: SKU NOMBRE CANTIDAD PRECIO\nSKU = código numérico exacto tal como aparece. PRECIO = valor en miles COP entero sin puntos ni comas. CANTIDAD = entero (1 si no se especifica).\nLee los dígitos con mucho cuidado — en imágenes de baja resolución es común confundir: 1 con 7, 3 con 8, 5 con 6, 0 con 8, 4 con 9. Prioriza la lectura correcta del SKU sobre el nombre.\nSolo las líneas de productos, sin texto extra, sin encabezados.\nEjemplo: 45518 GAFAS VR META QUEST 3S 128GB 1 2399';

async function _scanImageGemini(key, b64, mime) {
  let resp = await _aiFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + key.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: mime || 'image/jpeg', data: b64 } }, { text: SCAN_PROMPT }] }] })
  });
  await _aiCheckOk(resp);
  let data = await resp.json();
  let rawText = '';
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    rawText = data.candidates[0].content.parts.map(function (p) { return p.text || '' }).join('\n').trim();
  }
  return rawText;
}

// Ítems ya decodificados de un QR de cotización (sku+qty+source exactos,
// ver infrastructure/quote-qr.js) → mismo shape de resultado que arma el
// flujo de IA, pero sin "precio en imagen" (el QR nunca codifica precio).
function _buildScanResultsFromQr(qrItems) {
  let results = [];
  for (let i = 0; i < qrItems.length; i++) {
    let qi = qrItems[i];
    let cat = qi.source === 'lago' ? S.catalogLago : CATALOG;
    let catItem = null;
    for (let j = 0; j < cat.length; j++) { if (String(cat[j].sku) === qi.sku) { catItem = cat[j]; break } }
    if (!catItem) {
      let normSku = String(parseInt(qi.sku, 10) || qi.sku).toLowerCase();
      for (let j = 0; j < cat.length; j++) {
        if (String(parseInt(cat[j].sku, 10) || cat[j].sku).toLowerCase() === normSku) { catItem = cat[j]; break }
      }
    }
    if (catItem) {
      results.push({
        sku: catItem.sku, name: catItem.name, qty: qi.qty,
        oldPrice: catItem.price, newPrice: catItem.price, diff: null, diffPct: null,
        found: true, mismatch: false, fromQr: true, scannedName: catItem.name,
        catItem: catItem, source: qi.source
      });
    } else {
      results.push({
        sku: qi.sku, name: 'Ya no está en el catálogo', qty: qi.qty,
        oldPrice: 0, newPrice: null, diff: null, diffPct: null,
        found: false, mismatch: false, fromQr: true, scannedName: qi.sku,
        catItem: null, source: qi.source
      });
    }
  }
  return results;
}

// Ítems de una cotización YA GUARDADA (historial propio, o de otro
// vendedor visto como admin) → mismo modal de revisión que el escaneo,
// pero con diff de precio REAL: a diferencia del QR, acá sí sabemos qué
// precio tenía cada producto cuando se guardó. SKU exacto, sin match
// difuso por nombre (no hace falta: viene del propio historial).
function _buildScanResultsFromHistItems(histItems) {
  let results = [];
  for (let i = 0; i < (histItems || []).length; i++) {
    let it = histItems[i];
    let cat = normListSource(it.source) === 'lago' ? S.catalogLago : CATALOG;
    let catItem = null;
    for (let j = 0; j < cat.length; j++) { if (String(cat[j].sku) === String(it.sku)) { catItem = cat[j]; break } }
    if (!catItem) {
      let normSku = String(parseInt(it.sku, 10) || it.sku).toLowerCase();
      for (let j = 0; j < cat.length; j++) {
        if (String(parseInt(cat[j].sku, 10) || cat[j].sku).toLowerCase() === normSku) { catItem = cat[j]; break }
      }
    }
    let oldPrice = Number(it.price) || 0;
    if (catItem) {
      let newPrice = catItem.price, diff = newPrice - oldPrice;
      let diffPct = oldPrice > 0 ? Math.round((diff / oldPrice) * 100) : 0;
      results.push({
        sku: catItem.sku, name: catItem.name, qty: it.qty,
        oldPrice: oldPrice, newPrice: newPrice, diff: diff, diffPct: diffPct,
        found: true, mismatch: false, scannedName: it.name || catItem.name,
        catItem: catItem, source: it.source
      });
    } else {
      results.push({
        sku: it.sku, name: it.name || 'Producto', qty: it.qty,
        oldPrice: oldPrice, newPrice: null, diff: null, diffPct: null,
        found: false, mismatch: false, scannedName: it.name || it.sku,
        catItem: null, source: it.source
      });
    }
  }
  return results;
}

function _openHistPriceRefresh(histItems) {
  let results = _buildScanResultsFromHistItems(histItems);
  if (!results.length) { showToast('Esa cotización no tiene productos', 'warn'); return; }
  openScanModal(results);
  closeHist();
}
/** Botón "Actualizar precios" — vista "Mis cotizaciones" (índice local). */
function refreshHistPricesByIdx(i) {
  let x = getHist()[i]; if (!x) return;
  _openHistPriceRefresh(x.items);
}
/** Botón "Actualizar precios" — vista admin "Todos los vendedores" (por id de Firestore). */
function refreshHistPricesById(id) {
  let x = (typeof _histAllDocs !== 'undefined' ? _histAllDocs : []).find(function (d) { return d.id === id; });
  if (!x) { showToast('No se encontró esa cotización', 'error'); return; }
  _openHistPriceRefresh(x.items);
}

async function scanImage(input) {
  if (!input.files || !input.files[0]) return;
  let file = input.files[0];
  let scanSource = normListSource(S.activePriceList);
  let scanCatalog = scanSource === 'lago' ? S.catalogLago : CATALOG;
  if (!scanCatalog.length) { showToast('Carga la ' + listSourceLabel(scanSource) + ' antes de escanear', 'warn'); return }
  let spin = document.getElementById('scanSpin'), drop = document.getElementById('scanDrop');
  if (spin) spin.classList.add('on');
  if (drop) { drop.classList.add('loading'); drop.style.pointerEvents = 'none'; }
  try {
    // 1. Primero busca un QR de cotización en la foto.
    let qrPayload = (typeof decodeQrFromImageFile === 'function') ? await decodeQrFromImageFile(file) : null;

    // 1a. Formato actual (desde v1.8.0): el QR trae el id interno de la
    // cotización — se busca en la nube (user_quotes) y se re-precifica
    // contra el catálogo actual. Necesita sesión + conexión.
    let qrId = qrPayload ? parseQuoteIdQrPayload(qrPayload) : null;
    if (qrId) {
      if (!window._slQuotesSync || !window._slQuotesSync.getById) {
        showToast('Inicia sesión para poder reescanear cotizaciones', 'warn'); return;
      }
      let doc = await window._slQuotesSync.getById(qrId);
      if (!doc) {
        showToast('No se pudo cargar esa cotización (¿sin conexión, o no es tuya?)', 'error');
        return;
      }
      let docResults = _buildScanResultsFromHistItems(doc.items);
      if (!docResults.length) { showToast('Esa cotización no tiene productos', 'warn'); return; }
      openScanModal(docResults);
      return;
    }

    // 1b. Formato viejo (QRs impresos entre v1.7.0 y v1.7.3): traía
    // sku+cantidad directo, sin ir a la nube — sigue funcionando igual
    // aunque Gemini/OpenAI estén caídos, no necesita ninguna IA.
    let qrItems = qrPayload ? parseQuoteQrPayload(qrPayload) : null;
    if (qrItems && qrItems.length) {
      openScanModal(_buildScanResultsFromQr(qrItems));
      return;
    }

    // 2. Sin QR (cotización vieja de antes de esta función, o de otra tienda) → flujo de IA de siempre.
    let key = _requireApiKey();
    if (!key) return; // tutorial abierto
    let b64 = await new Promise(function (res, rej) { let r = new FileReader(); r.onload = function () { res(r.result.split(',')[1]) }; r.onerror = rej; r.readAsDataURL(file) });
    // Antes había un respaldo por OpenAI (gpt-4o-mini) para cuando Google se
    // caía. Se quitó: esa cuenta se quedó sin saldo, así que el "respaldo"
    // solo agregaba una espera extra antes del mismo error. Si Gemini falla,
    // el error sube tal cual.
    let rawText = await _scanImageGemini(key, b64, file.type);
    let parsed = parseRaw(rawText);
    if (!parsed.length) { showToast('No se detectaron productos', 'warn'); return }
    // Build catalog index by SKU for fast lookup
    // Build SKU index with normalized keys (strip leading zeros, lowercase)
    // Usar el catálogo activo (Store o Lago según selección actual)
    var activeCat = scanCatalog;
    let catBySku = {}, catBySkuNorm = {};
    for (let i = 0; i < activeCat.length; i++) {
      let cv = activeCat[i];
      catBySku[cv.sku] = cv;
      catBySkuNorm[String(parseInt(cv.sku) || cv.sku).toLowerCase()] = cv;
    }
    // Cross-reference each parsed item with catalog
    let scanResults = [];
    for (let i = 0; i < parsed.length; i++) {
      let p = parsed[i];
      // 1. Exact match
      let catItem = catBySku[p.sku] || null;
      let matchType = catItem ? 'sku' : null;
      // 2. Normalized match (strip leading zeros)
      if (!catItem) {
        let normSku = String(parseInt(p.sku) || p.sku).toLowerCase();
        catItem = catBySkuNorm[normSku] || null;
        if (catItem) matchType = 'sku';
      }
      // 3. Name-based fuzzy match using catalog
      if (!catItem) {
        let pNameLow = p.name.toLowerCase();
        for (let ci = 0; ci < activeCat.length; ci++) {
          if (activeCat[ci].name.toLowerCase().indexOf(pNameLow.slice(0, 15)) !== -1) {
            catItem = activeCat[ci]; matchType = 'name'; break;
          }
        }
      }
      // 4. Name similarity check — discard bad matches
      if (catItem) {
        let similarity = _nameSimilarity(p.name, catItem.name);
        if (similarity < 0.3) {
          catItem = null; // discard wrong match
        }
      }
      let oldPrice = p.price; // price from image (should be in thousands)
      if (catItem) {
        let newPrice = catItem.price;
        // Auto-normalize: if Claude gave full COP instead of thousands, convert
        if (newPrice > 0 && oldPrice > 0) {
          let ratio = oldPrice / newPrice;
          if (ratio > 500 && ratio < 1500) {
            oldPrice = Math.round(oldPrice / 1000);
          }
        }
        let diff = newPrice - oldPrice;
        let diffPct = oldPrice > 0 ? Math.round((diff / oldPrice) * 100) : 0;
        scanResults.push({
          sku: p.sku, name: catItem.name, qty: p.qty,
          oldPrice: oldPrice, newPrice: newPrice,
          diff: diff, diffPct: diffPct,
          found: true, mismatch: false, scannedName: p.name,
          catItem: catItem, source: scanSource
        });
      } else {
        scanResults.push({
          sku: p.sku, name: p.name, qty: p.qty,
          oldPrice: oldPrice, newPrice: null,
          diff: null, diffPct: null,
          found: false, mismatch: false, scannedName: p.name,
          catItem: null, source: scanSource
        });
      }
    }
    openScanModal(scanResults);
  } catch (e) {
    showToast(_friendlyAiError(e), 'error');
  }
  finally {
    if (spin) spin.classList.remove('on');
    if (drop) { drop.classList.remove('loading'); drop.style.pointerEvents = 'auto'; }
    input.value = '';
  }
}

function openScanModal(results) {
  S.scanResults = results;
  let found = results.filter(function (r) { return r.found }).length;
  let notFound = results.length - found;
  let priceUp = results.filter(function (r) { return r.found && r.diff > 0 }).length;
  let priceDown = results.filter(function (r) { return r.found && r.diff < 0 }).length;
  let same = results.filter(function (r) { return r.found && r.diff === 0 }).length;
  let mismatchCount = results.filter(function (r) { return r.found && r.mismatch }).length;
  // Summary pills
  document.getElementById('scanSummaryBar').innerHTML = T.scanSummaryPills(results, found, notFound, priceUp, priceDown, same, mismatchCount);
  // Table rows
  let rows = '';
  for (let i = 0; i < results.length; i++) {
    let r = results[i];
    if (!r.found) { rows += T.scanRowNotFound(r); continue; }
    rows += T.scanRowFound(r, i);
  }
  document.getElementById('scanRows').innerHTML = rows;
  scanUpdateCount();
  document.getElementById('scanOv').classList.add('on');
}
function closeScanModal() { document.getElementById('scanOv').classList.remove('on') }
function scanToggleAll(v) {
  document.querySelectorAll('.scan-item-chk').forEach(function (c) { c.checked = v });
  scanUpdateCount();
}
function scanUpdateCount() {
  let checked = document.querySelectorAll('.scan-item-chk:checked').length;
  let total = document.querySelectorAll('.scan-item-chk').length;
  document.getElementById('scanSelInfo').textContent = checked + ' de ' + total + ' seleccionados';
  document.getElementById('scanChkAll').checked = (checked === total && total > 0);
  document.getElementById('scanChkAll').indeterminate = (checked > 0 && checked < total);
}
function importScanSelected() {
  let checked = document.querySelectorAll('.scan-item-chk:checked');
  if (!checked.length) { showToast('Selecciona al menos un producto', 'warn'); return }
  let added = 0;
  checked.forEach(function (chk) {
    let idx = parseInt(chk.getAttribute('data-idx'));
    let r = S.scanResults[idx];
    if (r && r.found) {
      if (addItem({ sku: r.catItem.sku, name: r.catItem.name, price: r.catItem.price, qty: r.qty, _cat: r.catItem._cat || null, note: '', source: r.source || r.catItem._listSource || S.activePriceList })) {
        added++;
      }
    }
  });
  closeScanModal();
  if (added) {
    showToast('\u2705 ' + added + ' productos importados con precios actuales', 'success');
    generateQuote(true);
    switchTab('q');
  }
}

// --- Smart AI Quote (Image → Catalog Matching) ---

function buildCompactCatalog(keepFn) {
  var src = S.activePriceList === 'lago' ? S.catalogLago : CATALOG;
  var lines = ['SKU|CAT|NOMBRE|PRECIO_COP'];
  for (var i = 0; i < src.length; i++) {
    var p = src[i];
    if (keepFn && !keepFn(p)) continue;
    lines.push(p.sku + '|' + (p.cat || p._cat || '') + '|' + p.name + '|' + (p.price * 1000));
  }
  return lines.join('\n');
}

// Clasifica un producto en un grupo grueso a partir de su categoría REAL del
// catálogo (más confiable que adivinar por el nombre). Se usa para filtrar el
// catálogo que se le manda a "Armar PC" según el modo, y así no inflar el
// prompt con productos irrelevantes (periféricos en un armado de escritorio,
// componentes sueltos en una búsqueda de portátil, etc.).
function _pcbCatGroup(rawCat) {
  var c = (rawCat || '').toUpperCase();
  if (/PORT[ÁA]TIL/.test(c)) return 'laptop';           // "PORTATILES"
  if (/MONITOR/.test(c)) return 'monitor';              // "MONITORES", "SOPORTES PARA MONITORES"
  if (/BOARD|PROCESADOR|MEMORIA|SSD|DISCO|TARJETA|FUENTE|UPS|REGULADOR|CAJA|DISIPAC|REFRIGERAC/.test(c)) return 'component';
  if (/ENSAMBLAD/.test(c)) return 'ensamblado';         // "EQUIPOS ENSAMBLADOS..."
  return 'peripheral';                                  // periféricos, cables, cámaras, parlantes, etc.
}

// Cajas y disipadores son "fungibles" (cualquier variante compatible sirve —
// no hay un spec que matchear exacto como el socket de una board) pero entre
// las dos suman ~160 SKUs de las ~400 filas típicas de "PC completo". Eso
// infla el prompt y hace que el modelo de razonamiento de Armar PC (ver
// _deepseekComplete) tarde muchísimo más sin ganar precisión: probado contra
// la API real, mandar el catálogo completo tardó 193s (20K tokens de
// "pensar"); muestreando estas dos categorías por precio bajó a 56s (6K
// tokens) con el mismo resultado. Un CPU/board/RAM/GPU sí necesita ver TODAS
// las opciones (el match es por spec exacto), así que esas categorías no se
// tocan.
var PCB_BULKY_CAT = /CAJA|DISIPAC|REFRIGERAC/;
var PCB_BULKY_CAP = 14;

function _pcbSampleByPrice(items, cap) {
  if (items.length <= cap) return items;
  var sorted = items.slice().sort(function (a, b) { return a.price - b.price; });
  var out = [], step = sorted.length / cap;
  for (var i = 0; out.length < cap; i += step) out.push(sorted[Math.floor(i)]);
  return out;
}

// Los periféricos son la categoría más grande del catálogo (PERIFERICOS GAMER
// sola trae ~195 productos: mouse, teclados, diademas, sillas, pads...) y casi
// siempre el cliente pide UNO de esos subtipos. Mandar los 195 para que elija
// un teclado es prompt tirado a la basura. La primera palabra del nombre ya es
// el subtipo ("MOUSE ...", "TECLADO ...", "SILLA ..."), así que se agrupa por
// ahí: lo que el cliente nombró va COMPLETO (sin perder ninguna opción) y lo
// que no nombró queda muestreado por precio, por si igual hace falta.
var PCB_PERIPH_ASK = {
  MOUSE:   /mouse|rat[óo]n/i,
  TECLADO: /teclado|keyboard/i,
  DIADEMA: /diadema|aud[íi]fono|auricular|headset|casco/i,
  SILLA:   /silla|asiento/i,
  PAD:     /pad|superficie|alfombrilla/i,
  COMBO:   /combo|kit/i,
  CONTROL: /control|\bmando\b|joystick|gamepad/i,
  SOFA:    /sof[áa]|puff|sill[óo]n/i,
  MESA:    /mesa|escritorio/i,
  SOPORTE: /soporte|base/i
};
var PCB_PERIPH_CAP = 8; // por subtipo NO mencionado por el cliente

function _pcbFilterPeripherals(items, askTxt) {
  var bySub = {}, order = [];
  for (var i = 0; i < items.length; i++) {
    var sub = ((items[i].name || '').trim().split(/\s+/)[0] || '').toUpperCase();
    if (!bySub[sub]) { bySub[sub] = []; order.push(sub); }
    bySub[sub].push(items[i]);
  }
  var out = [];
  for (var k = 0; k < order.length; k++) {
    var list = bySub[order[k]];
    var ask = PCB_PERIPH_ASK[order[k]];
    // Subtipo desconocido (grupos chicos, ofertas sueltas) => se deja entero.
    var full = !ask || (askTxt && ask.test(askTxt));
    out = out.concat(full ? list : _pcbSampleByPrice(list, PCB_PERIPH_CAP));
  }
  return out;
}

// Descarta las piezas cuyo precio no tiene sentido para el presupuesto del
// cliente (una GPU de 4 millones en un PC de 4.4 no es una opción, pero el
// modelo igual la lee y la evalúa). Nunca vacía una categoría: si casi todo
// quedó por encima del tope, deja las más baratas igual — mejor una opción
// cara que ninguna.
function _pcbCapByPrice(items, maxCop) {
  var under = 0;
  for (var i = 0; i < items.length; i++) if (items[i].price * 1000 <= maxCop) under++;
  if (under >= items.length) return items;
  var extra = Math.max(0, 6 - under), allow = {};
  if (extra) {
    var over = items.filter(function (p) { return p.price * 1000 > maxCop; })
                    .sort(function (a, b) { return a.price - b.price; })
                    .slice(0, extra);
    for (var j = 0; j < over.length; j++) allow[over[j].sku] = 1;
  }
  return items.filter(function (p) { return p.price * 1000 <= maxCop || allow[p.sku]; });
}

// Orden fijo de los bloques del catálogo: lo estable primero, lo que cambia
// según el pedido al final. DeepSeek cachea en disco el PREFIJO del prompt
// (automático, pero exige coincidencia byte a byte desde el primer token), así
// que los periféricos — que se filtran según lo que escribió el cliente — van
// de últimos para no invalidar el bloque de componentes, que es el más grande.
var PCB_GROUP_ORDER = { component: 0, monitor: 1, laptop: 2, ensamblado: 3, peripheral: 4 };

// Como buildCompactCatalog() pero agrupando por categoría, para poder recortar
// cada una según su naturaleza y para imprimir la categoría UNA vez como
// encabezado en vez de repetirla en cada fila (ese cambio solo ya recorta ~25%
// del catálogo: "BOARDS INTEL LGA-1700 / XII-XIII-XIV GENERACION" son 46
// caracteres que se repetían en las 6 filas de la sección).
// opts.askTxt   — texto del cliente, para saber qué periféricos dejar completos
// opts.maxPrice — tope por pieza en COP (0 = sin tope)
// Devuelve { text, count }.
function buildPcBuilderCatalog(keepFn, opts) {
  opts = opts || {};
  var src = S.activePriceList === 'lago' ? S.catalogLago : CATALOG;
  var byCat = {}, order = [];
  for (var i = 0; i < src.length; i++) {
    var p = src[i];
    if (keepFn && !keepFn(p)) continue;
    var cat = p.cat || p._cat || '';
    if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
    byCat[cat].push(p);
  }
  // sort() es estable: dentro de un mismo grupo se respeta el orden del catálogo.
  order.sort(function (a, b) {
    return (PCB_GROUP_ORDER[_pcbCatGroup(a)] || 0) - (PCB_GROUP_ORDER[_pcbCatGroup(b)] || 0);
  });

  var lines = [], count = 0;
  for (var k = 0; k < order.length; k++) {
    var catName = order[k], items = byCat[catName];
    if (PCB_BULKY_CAT.test(catName)) items = _pcbSampleByPrice(items, PCB_BULKY_CAP);
    else if (_pcbCatGroup(catName) === 'peripheral') items = _pcbFilterPeripherals(items, opts.askTxt);
    if (opts.maxPrice) items = _pcbCapByPrice(items, opts.maxPrice);
    if (!items.length) continue;
    lines.push('## ' + catName);
    for (var j = 0; j < items.length; j++) {
      lines.push(items[j].sku + '|' + items[j].name + '|' + (items[j].price * 1000));
    }
    count += items.length;
  }
  return { text: lines.join('\n'), count: count };
}

// Va justo antes del catálogo en los tres prompts. Sin el conteo de productos
// que llevaba antes: ese número cambia en cada pedido (el catálogo se recorta
// según lo que pida el cliente) y, al estar ANTES del catálogo, rompía el
// caché de prefijo de DeepSeek para todo lo que venía después.
var PCB_CAT_HEADER = 'CATÁLOGO (una sección "## CATEGORIA" por categoría; filas SKU|NOMBRE|PRECIO_COP):\n';

// Lee el presupuesto del texto del cliente. Devuelve COP o null.
// Conservador a propósito: ante cualquier ambigüedad devuelve null y el
// catálogo va sin recortar (el comportamiento de siempre). Un tope mal leído
// sería peor que no tener tope — borraría del prompt justo las piezas buenas.
// Por eso "pc 4.400.00 aprox" (mal escrito) no se interpreta: lee 4.400, queda
// por debajo del mínimo creíble y se descarta.
function _pcbParseBudget(txt) {
  if (!txt) return null;
  var t = String(txt).toLowerCase(), val = null;
  var m = t.match(/(\d+(?:[.,]\d+)?)\s*(millones|millon|mill|palos|m\b)/); // "6 millones", "4,5 millones", "6M"
  if (m) {
    val = Math.round(parseFloat(m[1].replace(',', '.')) * 1e6);
  } else {
    var g = t.match(/\d{1,3}(?:[.,'’]\d{3})+|\d{6,9}/); // "4.400.000", "4'400.000", "4400000"
    if (g) val = parseInt(g[0].replace(/[.,'’]/g, ''), 10);
  }
  if (!val || val < 800000 || val > 100000000) return null;
  return val;
}

async function smartQuoteFromImage(input) {
  if (!input.files || !input.files[0]) return;
  var key = _requireApiKey();
  if (!key) return; // tutorial abierto
  var file = input.files[0];
  var scanSource = normListSource(S.activePriceList);
  var scanCatalog = scanSource === 'lago' ? S.catalogLago : CATALOG;
  if (!scanCatalog.length) { showToast('Carga la ' + listSourceLabel(scanSource) + ' antes de usar', 'warn'); return }

  var drop = document.getElementById('smartDrop');
  var spin = document.getElementById('smartSpin');
  if (drop) { drop.classList.add('loading'); drop.style.pointerEvents = 'none'; }
  if (spin) spin.classList.add('on');

  try {
    var b64 = await new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result.split(',')[1]) };
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    var catalogText = buildCompactCatalog();

    var prompt = 'Eres un asesor de una tienda de tecnología en Colombia.\n\n' +
      'TAREA: Analiza la imagen del cliente (cotización de otra tienda, specs, lista, etc.). ' +
      'Extrae TODOS los productos/componentes visibles. Para CADA uno, busca el equivalente MÁS CERCANO en nuestro catálogo.\n\n' +
      'REGLAS DE MATCHING:\n' +
      '- Si existe el producto EXACTO (mismo modelo), úsalo.\n' +
      '- Si no existe el exacto, busca el equivalente más cercano: misma categoría, specs similares o superiores.\n' +
      '- Prioriza: mismo chipset/modelo > misma gama > gama superior cercana.\n' +
      '- Para RAM: respeta DDR4 vs DDR5, busca capacidad igual o superior.\n' +
      '- Para almacenamiento: respeta NVMe vs SATA, busca capacidad igual o superior.\n' +
      '- Si no hay equivalente razonable, usa matchSku: null.\n' +
      '- NUNCA inventes SKUs ni productos que no estén en el catálogo.\n\n' +
      'RESPONDE SOLO con un JSON array (sin texto extra, sin markdown, sin ```). Formato:\n' +
      '[{"imageProduct":"nombre del producto en la imagen","qty":1,"matchSku":"SKU del catálogo o null","matchType":"exact|equivalent|none","reason":"breve razón del match"}]\n\n' +
      'matchType:\n' +
      '- "exact": mismo producto encontrado en catálogo\n' +
      '- "equivalent": producto similar/equivalente encontrado\n' +
      '- "none": no hay equivalente razonable\n\n' +
      'CATÁLOGO (' + scanCatalog.length + ' productos):\n' + catalogText;

    // retries:1 — este prompt manda el catálogo COMPLETO (miles de tokens);
    // reintentar 3 veces de más (default) reenviaría ese prompt grande hasta
    // 4 veces en ~15s, disparando el límite de tokens/minuto sin necesidad.
    var resp = await _aiFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + key.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: file.type || 'image/jpeg', data: b64 } }, { text: prompt }] }] })
    }, { retries: 1 });
    await _aiCheckOk(resp);
    var data = await resp.json();
    var rawText = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      rawText = data.candidates[0].content.parts.map(function (p) { return p.text || '' }).join('\n').trim();
    }

    // Strip markdown fences if present
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

    var aiResults;
    try {
      aiResults = JSON.parse(rawText);
    } catch (pe) {
      console.error('[smartQuote] JSON parse error:', rawText);
      throw new Error('La IA no devolvió JSON válido');
    }

    if (!Array.isArray(aiResults) || !aiResults.length) {
      showToast('No se detectaron productos en la imagen', 'warn');
      return;
    }

    // Build index for fast lookup
    var catBySku = {};
    for (var i = 0; i < scanCatalog.length; i++) {
      catBySku[scanCatalog[i].sku] = scanCatalog[i];
    }

    // Enrich results with catalog data
    var results = [];
    for (var j = 0; j < aiResults.length; j++) {
      var ai = aiResults[j];
      var catItem = ai.matchSku ? catBySku[String(ai.matchSku)] : null;
      results.push({
        imageProduct: ai.imageProduct || '(desconocido)',
        qty: parseInt(ai.qty) || 1,
        matchType: ai.matchType || 'none',
        reason: ai.reason || '',
        matchSku: catItem ? catItem.sku : null,
        matchName: catItem ? catItem.name : null,
        matchPrice: catItem ? catItem.price : null,
        matchCat: catItem ? (catItem._cat || catItem.cat) : null,
        catItem: catItem,
        source: scanSource
      });
    }

    openSmartQuoteModal(results);

  } catch (err) {
    showToast(_friendlyAiError(err), 'error');
  } finally {
    if (drop) { drop.classList.remove('loading'); drop.style.pointerEvents = 'auto'; }
    if (spin) spin.classList.remove('on');
    input.value = '';
  }
}

function openSmartQuoteModal(results) {
  S.smartResults = results;
  var exact = 0, equiv = 0, none = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].matchType === 'exact') exact++;
    else if (results[i].matchType === 'equivalent') equiv++;
    else none++;
  }

  // Summary pills
  document.getElementById('sqSummaryBar').innerHTML =
    '<span class="scan-pill info">' + results.length + ' productos en imagen</span>' +
    (exact ? '<span class="scan-pill ok">' + icon('check', 'ico-xs') + ' ' + exact + ' exacto' + (exact > 1 ? 's' : '') + '</span>' : '') +
    (equiv ? '<span class="scan-pill warn">\ud83d\udd04 ' + equiv + ' equivalente' + (equiv > 1 ? 's' : '') + '</span>' : '') +
    (none ? '<span class="scan-pill err">' + icon('x', 'ico-xs') + ' ' + none + ' sin match</span>' : '');

  // Table rows
  var rows = '';
  for (var j = 0; j < results.length; j++) {
    rows += T.smartQuoteRow(results[j], j);
  }
  document.getElementById('sqRows').innerHTML = rows;
  sqUpdateCount();
  document.getElementById('smartQuoteOv').classList.add('on');
}

function closeSmartQuoteModal() { document.getElementById('smartQuoteOv').classList.remove('on') }

function sqToggleAll(v) {
  document.querySelectorAll('.sq-item-chk').forEach(function (c) { c.checked = v });
  sqUpdateCount();
}

function sqUpdateCount() {
  var checked = document.querySelectorAll('.sq-item-chk:checked').length;
  var total = document.querySelectorAll('.sq-item-chk').length;
  document.getElementById('sqSelInfo').textContent = checked + ' de ' + total + ' seleccionados';
  var allChk = document.getElementById('sqChkAll');
  if (allChk) {
    allChk.checked = (checked === total && total > 0);
    allChk.indeterminate = (checked > 0 && checked < total);
  }
}

function importSmartSelected() {
  var checked = document.querySelectorAll('.sq-item-chk:checked');
  if (!checked.length) { showToast('Selecciona al menos un producto', 'warn'); return }
  var added = 0;
  checked.forEach(function (chk) {
    var idx = parseInt(chk.getAttribute('data-idx'));
    var r = S.smartResults[idx];
    if (r && r.catItem) {
      var ok = addItem({
        sku: r.catItem.sku,
        name: r.catItem.name,
        price: r.catItem.price,
        qty: r.qty,
        _cat: r.catItem._cat || null,
        note: '',
        source: r.source || r.catItem._listSource || S.activePriceList
      });
      if (ok) added++;
    }
  });
  closeSmartQuoteModal();
  if (added) {
    showToast('\u2705 ' + added + ' productos importados desde cotización inteligente', 'success');
    generateQuote(true);
    switchTab('q');
  }
}

// --- PC Builder AI ---
async function buildPcFromPrompt() {
  var input = document.getElementById('pcBuilderInput');
  var promptTxt = input ? input.value.trim() : '';
  if (!promptTxt) { showToast('Escribe un requerimiento para armar el PC', 'warn'); return; }

  var activeSource = normListSource(S.activePriceList);
  var activeCat = activeSource === 'lago' ? S.catalogLago : CATALOG;
  if (!activeCat.length) { showToast('Carga la ' + listSourceLabel(activeSource) + ' antes de usar', 'warn'); return }
  
  var mode = document.getElementById('pcBuilderMode') ? document.getElementById('pcBuilderMode').value : 'desktop';
  var fullBuild = mode === 'desktop' && (document.getElementById('pcbFullBuild') ? document.getElementById('pcbFullBuild').checked : false);

  var btnText = document.getElementById('pcBuilderBtnText');
  var btnIco = document.getElementById('pcBuilderIco');
  var btn = document.getElementById('btnPcBuilder');
  if (btnText) btnText.textContent = 'Armando...';
  if (btnIco) btnIco.style.display = 'none';
  if (input) input.disabled = true;
  if (btn) btn.disabled = true;
  // El anillo reemplaza al spinner suelto: con los modelos de razonamiento
  // la espera pasó de ~15s a ~30-45s, y un spinner sin referencia de tiempo
  // se lee como "se colgó". Un armado completo tarda más que una búsqueda
  // de componentes sueltos, así que la estimación va aparte.
  var prog = window.aiProgressStart ? aiProgressStart('pcBuilderProgress', {
    expected: fullBuild ? 32 : 20,
    kind: fullBuild ? 'build' : 'search',
    hint: fullBuild ? 'suele tardar entre 25 y 45 segundos' : 'suele tardar entre 15 y 30 segundos'
  }) : null;
  var built = false;

  try {
    var systemPrompt = '';

    // Filtrar el catálogo a solo las categorías relevantes según el modo. Un
    // armado de escritorio no necesita ver periféricos/portátiles; una
    // búsqueda de portátil no necesita ver boards ni fuentes. Esto recorta el
    // prompt ~50% en "PC completo" → responde más rápido y gasta menos cuota.
    //
    // Excepción: en "PC completo" los periféricos se excluyen por defecto (un
    // armado puro no los necesita), PERO si el pedido del cliente los menciona
    // (combo con teclado, mouse, diadema, silla…), se vuelven a incluir para
    // que la IA pueda sumarlos. Así el armado puro sigue liviano y el
    // "PC + periféricos" también funciona.
    var pidePerifericos = /perif[ée]ric|teclado|mouse|rat[óo]n|diadema|aud[íi]fono|auricular|headset|mousepad|combo|silla|parlante|altavoz|webcam|c[áa]mara|micr[óo]fono|joystick|\bmando\b|volante|timon/i.test(promptTxt);
    var keepGroups;
    if (mode === 'desktop' && fullBuild) {
      keepGroups = pidePerifericos ? { component: 1, monitor: 1, peripheral: 1 } : { component: 1, monitor: 1 };
    } else if (mode === 'desktop' && !fullBuild) {
      keepGroups = { component: 1, peripheral: 1, monitor: 1 };
    } else {
      keepGroups = { laptop: 1, monitor: 1, peripheral: 1, ensamblado: 1 };
    }
    // Tope por pieza a partir del presupuesto — solo en armado completo. En
    // "componentes sueltos" y en portátiles el monto que escribe el cliente es
    // el precio DE LA PIEZA, no de un conjunto: ahí un tope la borraría del
    // catálogo. El monto se redondea a bloques de 500 mil para que dos pedidos
    // parecidos (4.400.000 y 4.500.000) generen el MISMO catálogo y el segundo
    // pegue en el caché de prefijo de DeepSeek.
    var budget = (mode === 'desktop' && fullBuild) ? _pcbParseBudget(promptTxt) : null;
    var maxPrice = budget ? Math.ceil(budget / 500000) * 500000 * 0.6 : 0;

    var catBundle = buildPcBuilderCatalog(function (p) { return !!keepGroups[_pcbCatGroup(p.cat || p._cat)]; },
      { askTxt: promptTxt, maxPrice: maxPrice });
    var catalogText = PCB_CAT_HEADER + catBundle.text;
    console.info('[IA:armar-pc] catálogo ' + catBundle.count + ' filas (' + catalogText.length + ' chars)' +
      (maxPrice ? ' · tope por pieza ' + fmtCOP(maxPrice) : ' · sin tope de presupuesto'));

    if (mode === 'desktop' && fullBuild) {
      // Antes esto era ~4x más largo y siempre hablaba de "maximizar
      // presupuesto" aunque el cliente no diera ninguno (ej: pega una lista
      // de piezas exactas en vez de un monto). El modelo de razonamiento
      // (deepseek-v4-flash) se enredaba intentando aplicar una regla de
      // presupuesto que no aplicaba, y eso + el catálogo completo se comía
      // los 8192-16384 tokens de max_tokens pensando, sin llegar a escribir
      // el JSON ("La IA se quedó sin espacio para responder"). Probado
      // contra la API real: prompt viejo + catálogo completo = 193s y 20K
      // tokens de razonamiento; este prompt + buildPcBuilderCatalog()
      // (arriba, agrupa/muestrea cajas y disipadores) = 56s y 6K tokens,
      // mismo resultado. Las reglas de compatibilidad y estructura se
      // mantienen igual de estrictas — se acortó la redacción, no el fondo.
      systemPrompt = 'Eres un experto armador de PC de una tienda de tecnología en Colombia.\n' +
        'TAREA: El cliente puede darte (a) un presupuesto o meta (ej: "PC gamer máximo 6 millones") — arma la MEJOR configuración posible maximizando ese presupuesto; o (b) una lista de piezas que ya eligió — busca el SKU exacto o más equivalente de cada una, verifica compatibilidad y COMPLETA las que falten para que el equipo encienda. En el caso (b) no hay presupuesto que maximizar y no agregas extras que no pidió (periféricos, monitor, más almacenamiento, subir de gama), pero el ensamble SIEMPRE va completo: un PC sin board o sin chasis no se puede vender.\n\n' +
        'SI LA LISTA DEL CLIENTE SE CONTRADICE (ej: un procesador AM4, que solo soporta DDR4, junto con RAM DDR5): respeta la pieza que nombró con modelo exacto y ajusta las demás a ella; explica el ajuste en "reason". NO cambies el procesador que pidió por otro de distinta generación, salvo que ese modelo no exista en el catálogo.\n\n' +
        'REGLAS DE PRESUPUESTO (solo si el cliente dio un monto en pesos; si no dio presupuesto, ignora esta sección):\n' +
        '- Suma el costo TOTAL (PRECIO_COP * qty). Debe quedar entre 90% y 100% del presupuesto máximo indicado (ej: presupuesto 6.000.000 COP -> total entre $5.400.000 y $6.000.000) — no dejes dinero sobrante sin justificación, sube de gama GPU/CPU/almacenamiento hasta acercarte al tope sin superarlo.\n' +
        '- Si el presupuesto supera 3.5 millones COP o el cliente pide "gamer / juegos / diseño / 3d / render": ES OBLIGATORIO incluir una GPU dedicada (ej: RTX 4060, RX 6600) — prohibido usar solo una APU integrada (Ryzen 8500G/5600G) como sustituto.\n\n' +
        'ESTRUCTURA DEL ENSAMBLE (exactamente 1 de cada uno, sin duplicar ni omitir — Board y Chasis van SIEMPRE, aunque el cliente no los nombre):\n' +
        '1 Procesador, 1 Board, RAM (1-2 módulos mismo modelo), Almacenamiento (SSD NVMe/SATA), 1 Fuente de poder (potencia suficiente para la GPU), 1 Chasis, 1 GPU dedicada si aplica. Periféricos (teclado, mouse, diadema, monitor, etc.) SOLO si el cliente los menciona.\n\n' +
        'COMPATIBILIDAD (siempre obligatoria):\n' +
        '- SOCKET: Board y CPU deben tener EXACTAMENTE el mismo socket (AM4 con AM4, AM5 con AM5, LGA1700 con LGA1700).\n' +
        '- RAM: debe coincidir en generación con la board (DDR4 con DDR4, DDR5 con DDR5).\n' +
        '- FUENTE: mínimo 600W/650W 80 Plus si hay GPU dedicada.\n\n' +
        'RESPONDE SOLO con un objeto json (sin texto extra, sin markdown, sin ```). Formato:\n' +
        '{"items":[{"sku":"SKU del catálogo","qty":1,"reason":"Breve explicación de por qué este producto es la mejor opción"}]}\n\n' +
        catalogText;
    } else if (mode === 'desktop' && !fullBuild) {
      systemPrompt = 'Eres un experto asesor de componentes de PC de una tienda de tecnología en Colombia.\n' +
        'TAREA: El cliente busca componentes o periféricos específicos. Recomienda ÚNICAMENTE los productos que pide — NO armes un PC completo.\n\n' +
        'REGLAS:\n' +
        '- Responde SOLO con los componentes que el cliente solicita explícitamente.\n' +
        '- Si pide "una RAM": devuelve 1 opción de RAM. Si pide "3 opciones de GPU": devuelve 3 GPUs. Nada más.\n' +
        '- NO agregues componentes que no pidió (ni board, ni CPU, ni fuente, etc.).\n\n' +
        'RESPONDE SOLO con un objeto json (sin texto extra, sin markdown, sin ```). Formato:\n' +
        '{"items":[{"sku":"SKU del catálogo","qty":1,"reason":"Por qué este componente es ideal para su necesidad"}]}\n\n' +
        catalogText;
    } else {
      systemPrompt = 'Eres un experto asesor de tecnología de una tienda en Colombia.\n' +
        'TAREA: El cliente busca un portátil, monitor, periférico o recomendación general. Selecciona los productos MÁS ADECUADOS de nuestro catálogo que cumplan su requerimiento y presupuesto.\n\n' +
        'REGLAS:\n' +
        '- NO intentes armar un PC por partes (no exijas board, cpu, etc.).\n' +
        '- Busca en el catálogo las opciones que mejor se ajusten a lo que pide el cliente.\n' +
        '- Puedes sugerir 1 a 3 opciones diferentes si hay buenas alternativas disponibles.\n\n' +
        'RESPONDE SOLO con un objeto json (sin texto extra, sin markdown, sin ```). Formato:\n' +
        '{"items":[{"sku":"SKU del catálogo","qty":1,"reason":"Por qué recomiendas este producto para su necesidad"}]}\n\n' +
        catalogText;
    }

    // retries:1 — este prompt manda el catálogo filtrado (miles de tokens
    // igual); reintentar 3 veces de más (default) reenviaría ese prompt
    // grande hasta 4 veces en ~15s, disparando el límite de tokens/minuto
    // sin haber conseguido ni un resultado.
    // maxTokens 16384 (el doble del default 8192): con requerimientos muy
    // detallados (lista de piezas exactas en vez de un presupuesto corto)
    // el modelo agotaba el límite razonando y nunca llegaba a escribir el JSON.
    // El requerimiento va al FINAL, después del catálogo: es la única parte que
    // cambia entre llamadas, así que todo lo de arriba puede salir del caché.
    var tail = '\n\nRequerimiento del cliente: ' + promptTxt;
    if (budget) {
      tail += '\n(Presupuesto detectado: ' + budget.toLocaleString('es-CO') + ' COP. ' +
              'El catálogo ya viene sin las piezas sueltas desproporcionadas para ese monto.)';
    }
    var rawText = await _deepseekComplete(systemPrompt + tail, { retries: 1, maxTokens: 16384, json: true });
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

    var aiResults;
    try {
      aiResults = JSON.parse(rawText);
    } catch (pe) {
      throw new Error('La IA no devolvió un JSON válido');
    }
    // Con response_format json_object la raíz siempre es un objeto, así que el
    // formato pedido es {"items":[...]}. Igual se acepta el array pelado: si
    // alguna vez hay que apagar el modo json, el resto sigue funcionando.
    if (aiResults && !Array.isArray(aiResults)) {
      aiResults = aiResults.items || aiResults.productos || aiResults.results || aiResults.data;
    }

    if (!Array.isArray(aiResults) || !aiResults.length) {
      showToast('No se pudo armar el equipo con el catálogo actual', 'warn');
      return;
    }

    // Map SKUs to catalog items
    var catBySku = {};
    for (var i = 0; i < activeCat.length; i++) {
      catBySku[activeCat[i].sku] = activeCat[i];
    }

    var results = [], descartados = 0;
    for (var j = 0; j < aiResults.length; j++) {
      var ai = aiResults[j];
      var catItem = catBySku[String(ai.sku)];
      if (catItem) {
        results.push({
          sku: catItem.sku,
          name: catItem.name,
          price: catItem.price,
          qty: parseInt(ai.qty) || 1,
          reason: ai.reason || '',
          catItem: catItem,
          source: activeSource
        });
      } else {
        // Antes esto se caía en silencio: si la IA devolvía un SKU que no
        // existe, esa pieza simplemente no aparecía y el armado se veía
        // completo. Ahora se cuenta y se avisa en el modal.
        descartados++;
        console.warn('[IA:armar-pc] SKU fuera del catálogo, descartado:', ai.sku, ai.reason || '');
      }
    }

    if (!results.length) {
      showToast('La IA eligió productos que no existen en el catálogo', 'warn');
      return;
    }

    built = true;
    openPcBuilderModal(results, { fullBuild: fullBuild, descartados: descartados });

  } catch (err) {
    showToast(_friendlyAiError(err), 'error');
  } finally {
    if (btnText) btnText.textContent = 'Buscar con IA';
    if (btnIco) btnIco.style.display = 'inline-block';
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
    // Solo se completa el anillo si de verdad hubo armado; si falló o no
    // quedó nada utilizable, desaparece sin fingir que terminó bien.
    if (prog && window.aiProgressEnd) aiProgressEnd(prog, built);
  }
}

// Piezas sin las cuales un equipo no enciende, y cómo reconocerlas en el
// resultado. Se mira la categoría real del catálogo salvo en la fuente: su
// categoría ("REGULADOR / UPS / FUENTES") mezcla fuentes con UPS y reguladores,
// que no sirven para el caso, así que ahí se mira el nombre.
var PCB_ESSENTIALS = [
  { rol: 'Procesador',     cat: /PROCESADOR/ },
  { rol: 'Board',          cat: /BOARD/ },
  { rol: 'RAM',            cat: /MEMORIA/ },
  { rol: 'Almacenamiento', cat: /SSD|DISCO/ },
  { rol: 'Fuente',         cat: /FUENTE|REGULADOR|UPS/, name: /FUENTE/ },
  { rol: 'Chasis',         cat: /CAJA/ }
];

// La IA a veces devuelve un armado al que le falta una pieza esencial (pasó con
// una lista de piezas pegada por el cliente: entregó CPU, RAM, SSD, fuente y
// GPU, sin board ni chasis). Como el modal solo mostraba lo que sí vino, el
// vendedor tenía que darse cuenta solo. Esto lo revisa acá, que además cubre el
// caso de un SKU inventado que se descartó al mapear.
function _pcbMissingRoles(results) {
  var faltan = [];
  for (var i = 0; i < PCB_ESSENTIALS.length; i++) {
    var e = PCB_ESSENTIALS[i], hay = false;
    for (var j = 0; j < results.length && !hay; j++) {
      var c = (results[j].catItem && (results[j].catItem.cat || results[j].catItem._cat)) || '';
      if (e.cat.test(c.toUpperCase()) && (!e.name || e.name.test((results[j].name || '').toUpperCase()))) hay = true;
    }
    if (!hay) faltan.push(e.rol);
  }
  return faltan;
}

function openPcBuilderModal(results, opts) {
  opts = opts || {};
  S.pcBuilderResults = results;
  var total = 0;
  for (var i = 0; i < results.length; i++) total += results[i].price * results[i].qty;

  var faltan = opts.fullBuild ? _pcbMissingRoles(results) : [];
  document.getElementById('pcbSummaryBar').innerHTML =
    '<span class="scan-pill info">' + results.length + ' componentes sugeridos</span>' +
    '<span class="scan-pill ok">Total aprox: ' + fmtCOP(total * 1000) + '</span>' +
    (faltan.length ? '<span class="scan-pill err">' + icon('x', 'ico-xs') + ' Armado incompleto, falta: ' + esc(faltan.join(', ')) + '</span>' : '') +
    (opts.descartados ? '<span class="scan-pill warn">' + opts.descartados + ' sugerencia' + (opts.descartados > 1 ? 's' : '') + ' fuera del catálogo</span>' : '');

  var rows = '';
  for (var j = 0; j < results.length; j++) {
    rows += T.pcBuilderRow(results[j], j);
  }
  document.getElementById('pcbRows').innerHTML = rows;
  pcbUpdateCount();
  document.getElementById('pcBuilderOv').classList.add('on');
}

function closePcBuilderModal() { document.getElementById('pcBuilderOv').classList.remove('on') }

function pcbToggleAll(v) {
  document.querySelectorAll('.pcb-item-chk').forEach(function (c) { c.checked = v });
  pcbUpdateCount();
}

function pcbUpdateCount() {
  var checked = document.querySelectorAll('.pcb-item-chk:checked').length;
  var total = document.querySelectorAll('.pcb-item-chk').length;
  document.getElementById('pcbSelInfo').textContent = checked + ' de ' + total + ' seleccionados';
  var allChk = document.getElementById('pcbChkAll');
  if (allChk) {
    allChk.checked = (checked === total && total > 0);
    allChk.indeterminate = (checked > 0 && checked < total);
  }
}

function importPcBuilderSelected() {
  var checked = document.querySelectorAll('.pcb-item-chk:checked');
  if (!checked.length) { showToast('Selecciona al menos un componente', 'warn'); return }
  var added = 0;
  checked.forEach(function (chk) {
    var idx = parseInt(chk.getAttribute('data-idx'));
    var r = S.pcBuilderResults[idx];
    if (r && r.catItem) {
      var ok = addItem({
        sku: r.catItem.sku,
        name: r.catItem.name,
        price: r.catItem.price,
        qty: r.qty,
        _cat: r.catItem._cat || null,
        note: '',
        source: r.source || r.catItem._listSource || S.activePriceList
      });
      if (ok) added++;
    }
  });
  closePcBuilderModal();
  if (added) {
    showToast('\u2705 ' + added + ' componentes agregados', 'success');
    generateQuote(true);
    switchTab('q');
  }
}

// --- History ---
/** Copia los campos CRM de una entrada previa a la nueva (re-guardado no los pierde). */
function _copyCrmFields(from, to) {
  ['estado', 'clienteTel', 'crmNotas', 'estadoUpdatedAt', '_synced'].forEach(function (k) {
    if (from[k] !== undefined && to[k] === undefined) to[k] = from[k];
  });
}
/** Resumen liviano de items para el historial — solo lo que mapHistItems necesita para recargar. */
function slimHistItems(arr) {
  return (arr || []).map(function (it) {
    var o = { sku: it.sku, name: it.name, price: it.price, qty: it.qty, _cat: it._cat || null, note: it.note || '', iva: it.iva !== undefined ? it.iva : true, source: it.source || it._listSource || null };
    // Ediciones manuales del desglose de un ENSAMBLADO (y si estaba desplegado):
    // sin esto, al recargar o duplicar la cotización el desglose volvía al texto
    // auto-generado del nombre y se perdía lo que el vendedor escribió a mano.
    if (it._comboEdits) o._comboEdits = it._comboEdits;
    if (it._showComponents) o._showComponents = true;
    return o;
  });
}
function saveHist(e) {
  if (window._slQuotesSync) _slQuotesSync.push(e); // sync a la nube (soft-fail, no-op sin sesión/Lite)
  var h = getHist();
  // Dedup por id estable: distintas cotizaciones ya NO se pisan por número+fecha.
  h = h.filter(function (x) {
    if (e.id && x.id) return x.id !== e.id;
    // compat. entradas viejas sin id — conservar campos CRM de la entrada previa
    if (!(x.num === e.num && x.date === e.date)) return true;
    _copyCrmFields(x, e);
    return false;
  });
  // Al re-guardar una cotización existente, conservar sus campos CRM locales
  // (la nube los conserva por su lado vía merge).
  if (e.id) {
    var prev = getHist().find(function (x) { return x.id === e.id; });
    if (prev) _copyCrmFields(prev, e);
  }
  h.unshift(e);
  if (h.length > 80) h = h.slice(0, 80);
  if (_ls.setJSON(histKey(), h)) return true;
  // Almacenamiento lleno: purgar las más viejas y reintentar en vez de fallar en silencio.
  while (h.length > 1) {
    h.pop();
    if (_ls.setJSON(histKey(), h)) {
      showToast('Historial lleno — se borraron cotizaciones viejas para guardar la nueva.', 'warn');
      return true;
    }
  }
  showToast('No se pudo guardar: almacenamiento del navegador lleno. Libera espacio o borra historial.', 'error');
  return false;
}
/** Cierra la cotización actual (ya guardada al verla) → el próximo producto iniciará una nueva. */
function closeCurrentQuote() {
  if (items && items.length) setState('quoteClosed', true);
}
/** Avanza el número, asigna un id nuevo y limpia la marca de cerrada. */
function startNextQuote() {
  var prev = parseInt(_ls.get('lastQuoteNum', '0'), 10) || 0;
  var nc = document.getElementById('numCot');
  var cur = nc ? (parseInt(nc.value, 10) || 0) : 0;
  var base = Math.max(prev, cur);
  _ls.set('lastQuoteNum', base);
  if (nc) nc.value = base + 1;
  setState('currentQuoteId', newQuoteId());
  setState('quoteClosed', false);
  if (typeof updateEncSummary === 'function') updateEncSummary();
}
/** Tras exportar/enviar, agregar el primer producto limpia y arranca una cotización nueva. */
function beginNewQuoteAfterSend() {
  items.length = 0;
  var cl = document.getElementById('cliente'); if (cl) cl.value = '';
  var nt = document.getElementById('notasCot'); if (nt) nt.value = '';
  setState('discountOn', false); setState('discountPct', 2); setState('reteOn', false); setState('incluyeEnvio', false);
  startNextQuote();
  showToast('Nueva cotización #' + ((document.getElementById('numCot') || {}).value || '') + ' iniciada', 'info');
}
// ── Historial local separado por cuenta ─────────────────────
// En tiendas es común el computador compartido. Con una sola clave
// 'cotHistory' para todos, la siguiente cuenta veía el historial de la
// anterior (con datos de clientes) y quotes-sync (_migrateLocal) subía las
// cotizaciones no sincronizadas de la otra persona A NOMBRE de la cuenta nueva.
// Toda lectura y escritura del historial pasa por histKey().
function histKey() {
  var em = '';
  try { em = (window._slAuth && window._slAuth.currentUser && window._slAuth.currentUser.email) || ''; } catch (e) { }
  em = String(em).toLowerCase().trim();
  return em ? 'cotHistory::' + em : 'cotHistory';
}

// Al entrar: el historial guardado antes de separarlo por cuenta pasa a la
// primera cuenta que entra en este navegador (el caso normal es un dispositivo
// por persona). Si esa cuenta ya tenía historial propio, el viejo no se toca:
// nunca se borra nada que no se haya copiado.
window._slMigrateHist = function (email) {
  var em = String(email || '').toLowerCase().trim();
  if (!em) return;
  try {
    var legacy = localStorage.getItem('cotHistory');
    if (legacy === null) return;
    var destino = 'cotHistory::' + em;
    if (localStorage.getItem(destino) !== null) return;
    localStorage.setItem(destino, legacy);
    localStorage.removeItem('cotHistory');
  } catch (e) { console.warn('[hist] no se pudo migrar el historial:', e && e.message); }
};

function getHist() { return _ls.getJSON(histKey(), []); }

/** Guarda inmediatamente la cotización actual que está en pantalla antes de cambiar o cargar otra. */
function saveCurrentQuoteImmediately() {
  clearTimeout(generateQuote._saveTimer);
  clearTimeout(dispatch._autoSaveTimer);
  if (!items || !items.length) return;
  if (!S.currentQuoteId) setState('currentQuoteId', newQuoteId());
  var now = new Date();
  var today = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  var numCot = (document.getElementById('numCot') || {}).value || '1';
  var cliente = (document.getElementById('cliente') || {}).value || '';
  var asesor = (document.getElementById('asesor') || {}).value || '';
  var wa = (document.getElementById('whatsapp') || {}).value || '';
  var validez = (document.getElementById('validez') || {}).value || '1 d\u00eda';
  var garantia = (document.getElementById('garantia') || {}).value || '12 meses';
  var notas = (document.getElementById('notasCot') || {}).value || '';
  var calc = calcEngine();

  var _histEntry = {
    id: S.currentQuoteId, num: numCot, cliente: cliente, asesor: asesor,
    letra: window._slAsesorLetter || '', total: calc.totalConIva, date: today, time: timeStr,
    items: slimHistItems(items),
    priceList: (function () { var cs = getCartListSource(); return cs === 'mixed' ? normListSource(S.activePriceList) : normListSource(cs || S.activePriceList); })(),
    wa: wa, validez: validez, garantia: garantia, notas: notas,
    reteOn: S.reteOn, discountOn: S.discountOn, discountPct: S.discountPct, showIva: S.showIvaInQuote,
    empresaCliente: (S.empresaMode && S.empresaCliente) ? S.empresaCliente : undefined
  };

  saveHist(_histEntry);
  if (window._logQuote) window._logQuote(_histEntry);

  var currentNum = parseInt(numCot, 10) || 0;
  var prevLast = parseInt(_ls.get('lastQuoteNum', '0'), 10) || 0;
  _ls.set('lastQuoteNum', Math.max(prevLast, currentNum));

  updateHistBadge();
}

function loadHist(i) {
  let h = getHist()[i]; if (!h) return;
  // Datos de cliente cifrados sin la llave en este dispositivo: abrirla y
  // re-guardarla dejaría el cliente vacío encima del dato real.
  if (h._piiLocked) { showToast('Esta cotización tiene los datos del cliente cifrados. Ingresa la llave de la empresa en Configuración para abrirla.', 'warn'); return; }
  let histItems = mapHistItems(h);
  if (hasMixedSources(histItems)) { showToast('Historial con mezcla Lista 1/Lista 2. Revísalo antes de usarlo.', 'error'); return; }

  // Guardar inmediatamente la cotización previa si tiene productos para no sobreescribirla ni perderla
  saveCurrentQuoteImmediately();

  let histPriceList = getHistPriceList(h);
  switchPriceList(histPriceList, { force: true, silent: true });

  // Establecer el ID de la cotización que estamos cargando ANTES de despachar los ítems
  setState('currentQuoteId', h.id || newQuoteId());
  setState('quoteClosed', false);

  if (document.getElementById('numCot')) document.getElementById('numCot').value = h.num;
  if (document.getElementById('cliente')) document.getElementById('cliente').value = h.cliente;
  if (document.getElementById('asesor')) document.getElementById('asesor').value = h.asesor;
  if (document.getElementById('whatsapp')) document.getElementById('whatsapp').value = h.wa || '';
  if (document.getElementById('notasCot')) document.getElementById('notasCot').value = h.notas || '';
  if (document.getElementById('validez')) document.getElementById('validez').value = h.validez || '1 d\u00eda';
  var gEl = document.getElementById('garantia'); if (gEl) gEl.value = h.garantia || '12 meses';

  if (h.reteOn !== undefined) setState('reteOn', h.reteOn);
  if (h.discountOn !== undefined) { setState('discountOn', h.discountOn); setState('discountPct', h.discountPct || 2); }
  if (h.showIva !== undefined) setState('showIvaInQuote', h.showIva);
  setState('empresaCliente', h.empresaCliente ? JSON.parse(JSON.stringify(h.empresaCliente)) : {});

  dispatch({ type: 'LOAD', listSource: histPriceList, newItems: histItems });

  renderUI();
  closeHist();
  generateQuote(false);
}

function dupHist(i) {
  let h = getHist()[i]; if (!h) return;
  if (h._piiLocked) { showToast('Esta cotización tiene los datos del cliente cifrados. Ingresa la llave de la empresa en Configuración para duplicarla.', 'warn'); return; }
  let histItems = mapHistItems(h);
  if (hasMixedSources(histItems)) { showToast('Historial con mezcla Lista 1/Lista 2. Revísalo antes de duplicarlo.', 'error'); return; }

  // Guardar la cotización previa antes de duplicar otra
  saveCurrentQuoteImmediately();

  let histPriceList = getHistPriceList(h);
  switchPriceList(histPriceList, { force: true, silent: true });

  // Duplicado = cotización nueva con su propia id
  setState('currentQuoteId', newQuoteId());
  setState('quoteClosed', false);

  var prevNum = parseInt(_ls.get('lastQuoteNum', '0'), 10) || 0;
  var histNum = parseInt(h.num, 10) || 0;
  var baseNum = Math.max(prevNum, histNum);
  _ls.set('lastQuoteNum', baseNum);
  var ncEl = document.getElementById('numCot');
  if (ncEl) ncEl.value = baseNum + 1;

  if (document.getElementById('cliente')) document.getElementById('cliente').value = '';
  if (document.getElementById('notasCot')) document.getElementById('notasCot').value = h.notas || '';
  setState('empresaCliente', h.empresaCliente ? JSON.parse(JSON.stringify(h.empresaCliente)) : {});

  dispatch({ type: 'LOAD', listSource: histPriceList, newItems: histItems });

  renderUI();
  closeHist();
  generateQuote(false);
  showToast('Cotización duplicada — asigna nuevo cliente', 'info');
}
function delHist(i) {
  let h = getHist();
  var borrada = h[i];
  h.splice(i, 1); _ls.setJSON(histKey(), h);
  if (borrada && borrada.id && window._slQuotesSync) _slQuotesSync.remove(borrada.id);
  updateHistBadge(); renderHist();
}
function clearHistory() {
  if (!confirm('\u00bfBorrar todo el historial?' + (window._slQuotesSync ? ' Tambi\u00e9n se borrar\u00e1 de la nube.' : ''))) return;
  _ls.remove(histKey());
  if (window._slQuotesSync) _slQuotesSync.removeAll();
  updateHistBadge(); renderHist();
}

// --- CRM de seguimiento (estados por cotizaci\u00f3n) ---
// Una cotizaci\u00f3n 'enviada' o 'negociando' sin movimiento hace >= 2 d\u00edas
// cuenta como "pendiente de seguimiento": badge \u00e1mbar + filtro propio.
var FOLLOWUP_DIAS = 2;
var _histFilter = 'todas'; // 'todas'|'seguimiento'|'enviada'|'negociando'|'vendida'|'perdida'

function _histNeedsFollowUp(x) {
  // Solo entradas con timestamp real de estado (las pre-CRM sin tocar no cuentan;
  // al migrarse a la nube reciben uno, as\u00ed el badge no explota el primer d\u00eda).
  if (!x || !x.estadoUpdatedAt || x.followUpSnoozed) return false;
  var est = x.estado || 'enviada';
  if (est !== 'enviada' && est !== 'negociando') return false;
  return (Date.now() - x.estadoUpdatedAt) >= FOLLOWUP_DIAS * 86400000;
}
function getFollowUps() { return getHist().filter(_histNeedsFollowUp); }

/** Silencia (o reactiva) el aviso de seguimiento de la entrada i, sin tocar su estado real. */
function toggleFollowUpSnooze(i) {
  var h = getHist(), x = h[i];
  if (!x) return;
  x.followUpSnoozed = !x.followUpSnoozed;
  _ls.setJSON(histKey(), h);
  if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { followUpSnoozed: x.followUpSnoozed });
  if (typeof updateFollowBadge === 'function') updateFollowBadge();
  renderHist();
  var ed = document.getElementById('hcrm-' + i);
  if (ed) ed.style.display = 'flex';
  showToast(x.followUpSnoozed ? 'Aviso de seguimiento silenciado' : 'Aviso de seguimiento reactivado', 'info', null, 2000);
}

/** Silencia de una vez el aviso de TODAS las cotizaciones pendientes de seguimiento. */
function bulkSnoozeFollowUps() {
  var h = getHist();
  var idxs = [];
  h.forEach(function (x, i) { if (_histNeedsFollowUp(x)) idxs.push(i); });
  if (!idxs.length) return;
  if (!confirm('¿Silenciar el aviso de seguimiento de las ' + idxs.length + ' cotizaciones pendientes? El estado de cada una (Enviada/Negociando) no cambia — solo dejan de contar como "sin respuesta". Puedes reactivarlo una por una si lo necesitas.')) return;
  idxs.forEach(function (i) { h[i].followUpSnoozed = true; });
  _ls.setJSON(histKey(), h);
  idxs.forEach(function (i) {
    var x = h[i];
    if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { followUpSnoozed: true });
  });
  if (typeof updateFollowBadge === 'function') updateFollowBadge();
  renderHist();
  showToast(idxs.length + ' avisos de seguimiento silenciados', 'success');
}

function setHistFilter(f) {
  _histFilter = f;
  renderHist();
}

/** Cambia el estado CRM de la entrada i del historial (y lo sube a la nube). */
function setHistEstado(i, estado) {
  var h = getHist(), x = h[i];
  if (!x) return;
  x.estado = estado;
  x.estadoUpdatedAt = Date.now();
  _ls.setJSON(histKey(), h);
  if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { estado: estado });
  if (typeof updateFollowBadge === 'function') updateFollowBadge();
  renderHist();
  // Mantener el editor abierto para seguir editando tel/notas
  var ed = document.getElementById('hcrm-' + i);
  if (ed) ed.style.display = 'flex';
  var lbl = { enviada: 'Enviada', negociando: 'Negociando', vendida: 'Vendida', perdida: 'Perdida' };
  showToast('Estado: ' + (lbl[estado] || estado), estado === 'vendida' ? 'success' : 'info', null, 2000);
}

/** Guarda tel\u00e9fono y notas CRM de la entrada i (y los sube a la nube). */
function saveHistCrm(i) {
  var h = getHist(), x = h[i];
  if (!x) return;
  // Sin la llave, teléfono y notas se ven vacíos por estar cifrados: guardar
  // desde acá los borraría en la nube.
  if (x._piiLocked) { showToast('Los datos de este cliente están cifrados. Ingresa la llave de la empresa en Configuración para editarlos.', 'warn'); return; }
  var telEl = document.getElementById('hcrmTel-' + i);
  var notasEl = document.getElementById('hcrmNotas-' + i);
  x.clienteTel = telEl ? telEl.value.trim() : (x.clienteTel || '');
  x.crmNotas = notasEl ? notasEl.value.trim() : (x.crmNotas || '');
  if (telEl) telEl.blur();
  if (notasEl) notasEl.blur();
  _ls.setJSON(histKey(), h);
  if (x.id && window._slQuotesSync) _slQuotesSync.pushCrm(x.id, { clienteTel: x.clienteTel, crmNotas: x.crmNotas });
  renderHist();
  showToast('Seguimiento guardado', 'success', null, 2000);
}

// --- Billing / SIIGO ---
function openBilling() { if (!items.length) { showToast('No hay productos', 'warn'); return } renderSiigo(); document.getElementById('billOv').classList.add('on') }
function closeBilling() { document.getElementById('billOv').classList.remove('on') }
document.getElementById('billOv').addEventListener('click', function (e) { if (e.target === this) closeBilling() });
function setBFmt(m) { setState('billingFmt', m); document.getElementById('bfmtA').classList.toggle('on', m === 'siigo'); document.getElementById('bfmtB').classList.toggle('on', m === 'co'); renderSiigo() }
function fmtNet(n) { return S.billingFmt === 'siigo' ? n.toFixed(2) : n.toFixed(2).replace('.', ',') }


// ============================================================
// SECCIÓN: FACTURACIÓN SIIGO / FORMATOS DE COPIA
// ============================================================
function renderSiigo() {
  var calc = calcEngine();
  var tCon = calc.totalConIva, tSin = 0, tIva = 0, tItems = calc.totalUnits, rows = '';
  for (var i = 0; i < calc.lines.length; i++) {
    var L = calc.lines[i];
    tSin += L.unitSinIva * L.item.qty;
    tIva += L.lineIva;
    rows += T.siigoRow(L, i, fmtNet);
    var isEns = isEnsamblado(L.item) || L.cat === 'ENSAMBLADO';
    var isLapCombo = L.cat === 'PORTÁTIL' && L.item.name.indexOf('/') !== -1 && L.item.name.indexOf('+') !== -1;
    if (isEns) {
      // ENSAMBLADO: siempre Drive
      rows += T.drivePanel(L.item, i);
    } else if (isLapCombo) {
      // PORTÁTIL combo: toggle Drive / SIIGO convencional
      var useDrive = !!(S.laptopDriveMode && S.laptopDriveMode[i]);
      rows += T.laptopBillingToggle(i, useDrive);
      if (useDrive) {
        rows += T.drivePanel(L.item, i);
      }
    }
  }
  document.getElementById('stBody').innerHTML = rows;
  document.getElementById('bsum').innerHTML = T.siigoSummary(tItems, tCon, tSin, tIva, calc, S.reteOn);
}
function _rerenderBreakdowns() { renderSiigo(); }
if (!S.laptopDriveMode) S.laptopDriveMode = {};
function toggleLaptopDrive(idx) {
  if (!S.laptopDriveMode) S.laptopDriveMode = {};
  S.laptopDriveMode[idx] = !S.laptopDriveMode[idx];
  renderSiigo();
}
// La hoja de facturación pre-armada es de cada empresa (Configuración → Datos
// de la Empresa). Antes venía quemada la hoja interna de un cliente anterior,
// así que todas las tiendas cargaban un documento de un tercero. Solo se acepta
// una URL de Google Sheets, y el iframe se arma con el DOM.
var DRIVE_SHEET_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+(\/[^\s"'<>]*)?(#[^\s"'<>]*)?$/;
// mode 'preview': vista de solo lectura para el iframe (sin la barra de edición
// de Sheets). Sin mode: la URL tal como la configuró la empresa, para el enlace
// "Abrir en Drive". '' si no hay una URL válida.
function _driveSheetUrl(mode) {
  var url = String((loadCfg() || {}).driveSheetUrl || '').trim();
  if (!DRIVE_SHEET_RE.test(url)) return '';
  if (mode !== 'preview') return url;
  return url.replace(/\/(edit|view)(\?[^#]*)?(?=#|$)/, '/preview');
}
function loadDriveIframe(idx) {
  var container = document.getElementById('drive-iframe-' + idx);
  if (!container) return;
  if (container.querySelector('iframe')) return; // already loaded
  var sku = container.dataset.sku || '';
  var url = _driveSheetUrl('preview');
  if (!url) {
    container.textContent = 'No hay una hoja de facturación configurada. Agrégala en Configuración → Datos de la Empresa.';
    container.style.cssText += ';padding:14px;font-size:12px;color:var(--gray-500);text-align:center';
    return;
  }
  var frame = document.createElement('iframe');
  frame.src = url;
  frame.style.cssText = 'width:100%;height:250px;border:none;border-radius:8px';
  container.innerHTML = '';
  container.appendChild(frame);
  // Auto-copy SKU to clipboard for quick Ctrl+F
  if (sku) {
    navigator.clipboard.writeText(sku).then(function() {
      showToast('SKU ' + sku + ' copiado — Ctrl+F y Ctrl+V en la hoja');
    });
  }
}

function updateBreakdownToggle(idx, key, checked) {
  if (!S.billingBreakdowns[idx]) S.billingBreakdowns[idx] = {};
  if (!S.billingBreakdowns[idx][key]) S.billingBreakdowns[idx][key] = {};
  S.billingBreakdowns[idx][key].on = checked;
  _rerenderBreakdowns();
}
function updateBreakdownPrice(idx, key, rawVal) {
  if (!S.billingBreakdowns[idx]) S.billingBreakdowns[idx] = {};
  if (!S.billingBreakdowns[idx][key]) S.billingBreakdowns[idx][key] = {};
  var val = parseFloat(rawVal.replace(/\./g, '').replace(/,/g, '.'));
  if (!isNaN(val) && val >= 0) {
    S.billingBreakdowns[idx][key].price = val;
    _rerenderBreakdowns();
  }
}
function updateBreakdownEquipo(idx, rawVal) {
  if (!S.billingBreakdowns[idx]) S.billingBreakdowns[idx] = {};
  if (!S.billingBreakdowns[idx].equipo) S.billingBreakdowns[idx].equipo = {};
  var val = parseFloat(rawVal.replace(/\./g, '').replace(/,/g, '.'));
  if (!isNaN(val) && val >= 0) {
    S.billingBreakdowns[idx].equipo.price = val;
    _rerenderBreakdowns();
  }
}
function copyBreakdown(idx) {
  var calc = calcEngine();
  // Find the line at this index
  var L = calc.lines[idx];
  if (!L) return;
  var overrides = S.billingBreakdowns[idx] || {};
  var bd = buildBillingBreakdown(L.item, L.lineTotal, overrides);
  var lines = [];
  // Equipo
  lines.push(bd.equipo.sku + '\t' + bd.equipo.name.slice(0, 60) + '\t' + bd.equipo.price.toFixed(2) + '\t0.00\t' + bd.equipo.price.toFixed(2));
  // Active companions
  for (var c = 0; c < bd.companions.length; c++) {
    var comp = bd.companions[c];
    if (!comp.on || comp.price <= 0) continue;
    var sub = comp.iva ? (comp.price / 1.19).toFixed(2) : comp.price.toFixed(2);
    var iva = comp.iva ? (comp.price - comp.price / 1.19).toFixed(2) : '0.00';
    lines.push(comp.sku + '\t' + comp.name + '\t' + sub + '\t' + iva + '\t' + comp.price.toFixed(2));
  }
  // Servicio
  lines.push(bd.servicio.sku + '\t' + bd.servicio.name + '\t' + bd.servicio.subtotal.toFixed(2) + '\t' + bd.servicio.ivaAmount.toFixed(2) + '\t' + bd.servicio.price.toFixed(2));
  var header = 'Codigo\tDescripcion\tSubtotal\tIVA\tTotal';
  navigator.clipboard.writeText(header + '\n' + lines.join('\n')).then(function () {
    showToast('Desglose copiado (' + lines.length + ' líneas)', 'success');
  });
}
function copySku(sku, el) {
  if (!sku) sku = el ? (el.dataset.sku || el.textContent.trim()) : '';
  sku = (sku || '').replace(/\([^)]+\)/g, '').trim();
  navigator.clipboard.writeText(sku).then(function () {
    if (!el) { showToast('SKU copiado: ' + sku, 'info'); return; }
    let orig = el.textContent;
    el.style.background = 'var(--blue-lt)'; el.style.color = 'var(--blue)'; el.innerHTML = icon('check', 'ico-xs');
    setTimeout(function () { el.textContent = orig; el.style.background = ''; el.style.color = '' }, 1400);
    showToast('SKU copiado: ' + sku, 'info');
  });
}
function copyNet(n, vid) {
  let str = fmtNet(n);
  navigator.clipboard.writeText(str).then(function () {
    let el = document.getElementById(vid);
    if (el) { el.classList.add('copied'); el.innerHTML = icon('check', 'ico-xs') + ' copiado'; setTimeout(function () { el.classList.remove('copied'); el.textContent = fmtNet(n) }, 1500) }
    showToast('' + str + ' copiado', 'success');
  });
}
function copyAllNet() {
  var calc = calcEngine(), lines = [];
  for (var i = 0; i < calc.lines.length; i++) { var L = calc.lines[i]; lines.push(L.item.sku + '\t' + fmtNet(L.unitSinIva)) }
  navigator.clipboard.writeText(lines.join('\n')).then(function () { showToast('\u2705 ' + calc.lines.length + ' precios copiados', 'success') });
}
function exportBillCSV() {
  var calc = calcEngine(), csv = 'SKU,Referencia,Cantidad,Con IVA,Sin IVA\n';
  for (var i = 0; i < calc.lines.length; i++) { var L = calc.lines[i], it = L.item; csv += '"' + it.sku + '","' + it.name + '",' + it.qty + ',' + L.unitDisc.toFixed(2) + ',' + fmtNet(L.unitSinIva) + '\n' }
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'siigo_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  showToast('CSV descargado', 'success');
}

function toggleExt() { let b = document.getElementById('extBody'), a = document.getElementById('extArr'), on = b.classList.toggle('on'); a.classList.toggle('open', on) }

// --- IVA extractor UI ---
function extDetect() {
  let text = document.getElementById('extRaw').value, cont = document.getElementById('extRows');
  if (!text.trim()) { cont.innerHTML = ''; return }
  let found = extractExt(text), IVA = 0.19;
  if (!found.length) {
    cont.innerHTML = '<div style="color:#f59e0b;font-size:11px;padding:8px 0">No se detectaron productos. Aseg\u00farate de que cada l\u00ednea empiece con el c\u00f3digo SKU seguido de gui\u00f3n. Ej: <code>26123(B1) - Producto 43,000 129,000</code></div>';
    return;
  }
  let h = '';
  for (let i = 0; i < found.length; i++) {
    let f = found[i], net = f.price / (1 + IVA), nStr = fmtNet(net);
    h += '<div class="ext-row">' +
      '<span class="er-n">' + (i + 1) + '</span>' +
      '<span class="er-code">' + esc(f.code || '\u2014') + '</span>' +
      '<span class="er-desc">' + esc(f.desc) + '</span>' +
      '<span class="er-orig">' + f.price.toLocaleString('es-CO') + '</span>' +
      '<span class="er-arr">\u2192</span>' +
      '<span class="er-net" onclick="extCopy(' + net + ',this)" title="Clic para copiar">' + nStr + '</span>' +
      '</div>';
  }
  cont.innerHTML = h;
}
function extCopy(n, el) {
  let str = fmtNet(n);
  navigator.clipboard.writeText(str).then(function () { let orig = el.textContent; el.style.background = 'rgba(16,185,129,.2)'; el.innerHTML = icon('check', 'ico-xs'); setTimeout(function () { el.style.background = ''; el.textContent = orig }, 1500); showToast('' + str + ' copiado', 'success') });
}

// --- Image export ---
async function copyImg() {
  let doc = document.getElementById('quoteDoc');
  if (!doc) { alert('Genera la cotizaci\u00f3n primero.'); return }
  let btn = document.getElementById('btnCopy'); btn.innerHTML = '<span class="btn-spinner"></span>'; btn.disabled = true;
  // Detectar Safari / iOS — no soportan ClipboardItem con imágenes
  var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) || /iPad|iPhone|iPod/.test(navigator.userAgent);

  try {
    var vw = doc.querySelector('.vendido-wrap'); if (vw) vw.style.display = 'none';
    var noPrintEls = doc.querySelectorAll('.no-print'); noPrintEls.forEach(function (el) { el.style.display = 'none'; });
    // El QR de la caja de número se agranda SOLO para esta captura (ver
    // .qr-export en styles.css) — en pantalla se ve chico y prolijo, pero
    // esta imagen es la que termina reenviada varias veces por WhatsApp y
    // un QR chico deja de poder leerse mucho antes que el resto se vea mal.
    doc.classList.add('qr-export');
    if (typeof html2canvas === 'undefined') { showToast('Función no disponible sin conexión', 'warn'); return; }
    // html2canvas clona TODO el <html> antes de recortar al #quoteDoc. Con el
    // catálogo (cientos de productos) y los íconos SVG repartidos por la app,
    // el documento tiene ~13k elementos y ~1.6k SVG, casi todos ocultos en
    // otras pestañas. Clonarlos en cada exportación tardaba ~14s aunque la
    // cotización real se rinde en ~130ms. ignoreElements poda del clon todo lo
    // que esté oculto dentro del <body> y no sea la cotización ni su cadena de
    // ancestros — deja el resultado idéntico píxel a píxel, pero ~40× más rápido.
    var body = document.body;
    var ignoreOffscreen = function (el) {
      if (el === doc || doc.contains(el) || el.contains(doc)) return false; // cotización + ancestros + descendientes
      if (!body.contains(el)) return false;                                 // <head>, <style>, <link>… → conservar (dan el CSS)
      return el.getClientRects().length === 0;                              // subárbol oculto del body → no clonar
    };
    var canvas = await html2canvas(doc, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false, ignoreElements: ignoreOffscreen });
    if (vw) vw.style.display = '';
    noPrintEls.forEach(function (el) { el.style.display = ''; });
    doc.classList.remove('qr-export');
    var resetBtn = function () {
      btn.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg></span> Copiar imagen';
      btn.disabled = false;
    };

    if (isSafari) {
      // iOS/Safari: <a download> con data URL NO funciona (Safari lo ignora
      // \u2192 ni guarda ni la deja ver). Mostramos la imagen en un visor: se VE y
      // se mantiene presionada para "Guardar en Fotos", o se toca "Compartir"
      // (gesto nuevo \u2192 navigator.share s\u00ED abre la hoja de Fotos/WhatsApp).
      canvas.toBlob(function (blob) {
        var fname = 'cotizacion-' + (document.getElementById('numCot').value || '') + '.png';
        _showQuoteImage(canvas.toDataURL('image/png'), blob, fname);
        resetBtn();
      }, 'image/png');
    } else {
      // Chrome/Windows/Edge: copiar al clipboard
      canvas.toBlob(async function (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('\u2705 \u00a1Imagen copiada!', 'success');
          if (window.tacto) tacto.sentir('toque');
        } catch (x) {
          // Fallback: abrir en ventana nueva
          var url2 = canvas.toDataURL('image/png'), w = window.open();
          w.document.write('<body style="margin:0;background:#1e293b"><img src="' + url2 + '" style="max-width:100%"><p style="font-family:sans-serif;padding:14px;color:#94a3b8">Clic derecho \u2192 Copiar imagen</p></body>');
        }
        resetBtn();
      });
    }
  } catch (e) { showToast('\u274c Error al generar imagen', 'error'); btn.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg></span> Copiar imagen'; btn.disabled = false; }
}

// Visor de la imagen de la cotizaci\u00f3n \u2014 pensado para iOS/Safari, donde la
// "descarga" no funciona. Muestra la imagen (se puede mantener presionada
// para "Guardar en Fotos") y, si el navegador lo soporta, un bot\u00f3n
// "Compartir / Guardar" que abre la hoja nativa (Fotos, WhatsApp\u2026). Reutiliza
// el estilo .rem-lightbox que ya usa Recogidas.
function _showQuoteImage(dataUrl, blob, fname) {
  var old = document.getElementById('quoteImgLightbox');
  if (old) old.remove();

  var canShare = false;
  try {
    var testFile = new File([blob], fname, { type: 'image/png' });
    canShare = !!(navigator.canShare && navigator.canShare({ files: [testFile] }) && navigator.share);
  } catch (e) { canShare = false; }

  var el = document.createElement('div');
  el.id = 'quoteImgLightbox';
  el.className = 'rem-lightbox';
  el.style.cursor = 'default';
  var shareBtn = canShare
    ? '<button id="qImgShare" style="padding:12px 22px;border:none;border-radius:12px;background:#2563eb;color:#fff;font:700 14px sans-serif;cursor:pointer">Compartir / Guardar</button>'
    : '';
  el.innerHTML =
    '<img src="' + dataUrl + '" alt="' + fname + '" style="max-width:92vw;max-height:72vh;-webkit-user-select:none">' +
    '<div class="rem-lightbox-hint">Mant\u00e9n presionada la imagen para guardarla en Fotos</div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:0 14px">' +
      shareBtn +
      '<button id="qImgClose" style="padding:12px 22px;border:1px solid rgba(255,255,255,.3);border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font:600 14px sans-serif;cursor:pointer">Cerrar</button>' +
    '</div>';

  // Cerrar solo al tocar el fondo (no la imagen ni los botones)
  el.addEventListener('click', function (ev) { if (ev.target === el) el.remove(); });
  document.body.appendChild(el);

  var closeB = document.getElementById('qImgClose');
  if (closeB) closeB.onclick = function () { el.remove(); };
  var shareB = document.getElementById('qImgShare');
  if (shareB) shareB.onclick = function () {
    try {
      var f = new File([blob], fname, { type: 'image/png' });
      navigator.share({ files: [f], title: fname }).catch(function () {});
    } catch (e) {}
  };
}
window._showQuoteImage = _showQuoteImage;

// --- Settings ---
function _updateLogoPreview(dataUrl) {
  var img = document.getElementById('logoPreviewImg');
  var placeholder = document.getElementById('logoPreviewPlaceholder');
  var removeBtn = document.getElementById('logoRemoveBtn');
  if (!img) return;
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = '';
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    img.src = '';
    img.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}
window.handleLogoUpload = function(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var MAX = 400;
      var w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/png');
      try { localStorage.setItem('sl_custom_logo', dataUrl); } catch(err) {
        showToast('Imagen muy grande, intenta con una más pequeña', 'error');
        return;
      }
      _updateLogoPreview(dataUrl);
      showToast('Logo guardado', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
};
window.removeLogo = function() {
  try { localStorage.removeItem('sl_custom_logo'); } catch(e) {}
  _updateLogoPreview(null);
  showToast('Logo eliminado', 'neutral');
};

function openSettings() {
  let cfg = loadCfg();
  let fields = { cfgEmpresa: 'empresa', cfgNit: 'nit', cfgTel: 'tel', cfgEmail: 'email', cfgDir: 'dir', cfgDriveSheet: 'driveSheetUrl', cfgBanco: 'banco', cfgTipoCuenta: 'tipoCuenta', cfgCuenta: 'cuenta', cfgTitular: 'titular', cfgGarantia: 'garantia', cfgHorarios: 'horarios', cfgUbicacion: 'ubicacion', cfgPagos: 'pagos', cfgEnvios: 'envios', cfgGlosario: 'glosario', cfgIaExtra: 'iaExtra', cfgWarrantyMonitor: 'warrantyMonitor', cfgWarrantyMonitorXiaomi: 'warrantyMonitorXiaomi', cfgWarrantyPortatil: 'warrantyPortatil', cfgEmpFormaPago: 'empFormaPago', cfgEmpEntrega: 'empEntrega', cfgEmpEnvio: 'empEnvio', cfgEmpRegimen: 'empRegimen', cfgEmpObservaciones: 'empObservaciones', cfgEmpRadicar: 'empRadicar', cfgEmpNotaLegal: 'empNotaLegal' };
  // Las garantías por categoría no arrancan vacías: si el usuario nunca las tocó, se muestran los valores por defecto.
  let warrantyFieldDefaults = { cfgWarrantyMonitor: WARRANTY_DEFAULTS.monitor, cfgWarrantyMonitorXiaomi: WARRANTY_DEFAULTS.monitorXiaomi, cfgWarrantyPortatil: WARRANTY_DEFAULTS.portatil };
  for (let id in fields) { let el = document.getElementById(id); if (el) el.value = cfg[fields[id]] || warrantyFieldDefaults[id] || ''; }
  let key = _getOwnApiKey();
  let inp = document.getElementById('apiKeyInput');
  if (inp) inp.value = key ? '••••••••••••••••' : '';
  renderApiStatus();
  var customLogo = null; try { customLogo = localStorage.getItem('sl_custom_logo'); } catch(e) {}
  _updateLogoPreview(customLogo);
  document.getElementById('settingsPanel').classList.add('on');
}
function closeSettings() { document.getElementById('settingsPanel').classList.remove('on') }
function renderApiStatus() {
  let key = _getOwnApiKey();
  let el = document.getElementById('apiKeyStatus'); if (!el) return;
  el.innerHTML = key
    ? '<span class="api-saved">&#10003; API Key guardada &nbsp;<button class="api-clear" onclick="clearApiKey()">Eliminar</button></span>'
    : '<span style="font-size:11px;color:var(--gray-400)">Sin API Key configurada</span>';
}
function saveApiKey() {
  let inp = document.getElementById('apiKeyInput');
  let val = inp ? inp.value.trim() : '';
  if (val && !val.startsWith('•')) {
    _ls.set('sl_api_key', val);
    showToast('API Key guardada', 'success');
  }
  renderApiStatus();
}
function clearApiKey() {
  _ls.remove('sl_api_key');
  let inp = document.getElementById('apiKeyInput');
  if (inp) inp.value = '';
  renderApiStatus();
}

async function answerClientQuestion() {
  var question = (document.getElementById('clientQuestion').value || '').trim();
  if (!question) { showToast('Pega la pregunta del cliente primero', 'warn'); return; }

  var key = _requireApiKey();
  if (!key) return; // tutorial abierto — el modal de respuesta ni se llega a mostrar

  var outEl = document.getElementById('clientAnswerOut');
  var modal = document.getElementById('clientAnswerOv');
  var groundEl = document.getElementById('clientAnswerGrounding');
  outEl.value = 'Generando respuesta…';
  outEl.disabled = true;
  if (groundEl) { groundEl.innerHTML = ''; groundEl.style.display = 'none'; }
  if (modal) modal.classList.add('on');

  // Construir contexto con los productos de la cotización actual
  var productLines = _state.items.map(function(it) {
    return '- ' + it.name + (it._cat ? ' [' + it._cat + ']' : '') + ' · $' + (it.price * it.qty).toLocaleString('es-CO');
  });
  var quoteContext = productLines.length
    ? 'Productos en la cotización actual:\n' + productLines.join('\n')
    : 'No hay productos en la cotización todavía.';

  var cfg = loadCfg();
  var bizInfo = [];
  if (cfg.garantia)  bizInfo.push('Garantía: ' + cfg.garantia);
  if (cfg.horarios)  bizInfo.push('Horarios: ' + cfg.horarios);
  if (cfg.ubicacion) bizInfo.push('Ubicación: ' + cfg.ubicacion);
  if (cfg.pagos)     bizInfo.push('Formas de pago: ' + cfg.pagos);
  if (cfg.envios)    bizInfo.push('Envíos: ' + cfg.envios);
  if (cfg.glosario)  bizInfo.push('Glosario de abreviaturas del catálogo: ' + cfg.glosario);
  if (cfg.iaExtra)   bizInfo.push(cfg.iaExtra);
  var bizContext = bizInfo.length ? 'Información del negocio:\n' + bizInfo.join('\n') : '';

  var extraContext = (document.getElementById('clientContext').value || '').trim();

  var toneInstructionsClient = {
    normal:    'Tono amable, cercano y natural, como un vendedor colombiano real escribiéndole a un cliente por WhatsApp. Máximo 3-4 oraciones. NO fuerces modismos ni jerga colombiana — usa una expresión local solo si es 100% natural y común; si tienes duda, mejor español neutro. Debe sonar como una persona real, no como un personaje exagerado.',
    serio:     'Tono formal y profesional, trato de "usted", sin modismos ni informalidades. Máximo 3-4 oraciones. Ideal para clientes corporativos o dudas serias.',
    corto:     'Máximo 1-2 oraciones. Ve directo a la respuesta, sin rodeos ni relleno.',
    detallado: 'Respuesta más completa, 5-7 oraciones, explicando también el porqué o el contexto detrás de la respuesta, no solo el dato puntual.'
  };

  var prompt = 'Eres el asistente de ventas de una tienda de tecnología en Colombia. ' +
    'Responde la pregunta del cliente de forma correcta y diplomática.\n' +
    'Instrucciones de tono: ' + (toneInstructionsClient[_clientTone] || toneInstructionsClient.normal) + '\n' +
    'IMPORTANTE: NO empieces con saludos como "Hola", "¡Hola!", "Buenas", etc. Ve directo al punto. ' +
    'NUNCA inventes especificaciones, precios, plazos, promociones ni datos que no estén en el contexto de abajo ni que no puedas confirmar buscando en internet — no lo hagas ni para sonar más amable o convincente. ' +
    'Si el cliente pregunta por especificaciones técnicas, características o datos de un producto que NO están en el contexto de abajo, puedes buscarlos en internet antes de responder. ' +
    'Si aun buscando no tienes la información exacta, dilo con amabilidad y ofrece consultar.\n\n' +
    (bizContext ? bizContext + '\n\n' : '') +
    quoteContext +
    (extraContext ? '\n\nDatos adicionales que el vendedor confirmó: ' + extraContext : '') +
    '\n\nPregunta del cliente: ' + question;

  try {
    var resp = await _aiFetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + key.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] })
    }, {
      onRetry: function (n, max) { outEl.value = 'El modelo está ocupado, reintentando… (' + n + '/' + max + ')'; }
    });
    await _aiCheckOk(resp, { clearKeyOnBadKey: true });
    var data = await resp.json();
    var candidate = data.candidates && data.candidates[0];
    var text = (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0].text) || 'Sin respuesta.';
    outEl.value = text.trim();
    var searchEntry = candidate && candidate.groundingMetadata && candidate.groundingMetadata.searchEntryPoint;
    if (groundEl && searchEntry && searchEntry.renderedContent) {
      groundEl.innerHTML = searchEntry.renderedContent;
      groundEl.style.display = 'block';
    }
    outEl.disabled = false;
  } catch(err) {
    var friendly = _friendlyAiError(err);
    outEl.value = friendly;
    outEl.disabled = false;
    showToast(friendly, 'error');
  }
}
var _quoteTone = 'normal';
var _clientTone = 'normal';

function setClientTone(btn) {
  _clientTone = btn.dataset.tone;
  document.querySelectorAll('.ctone-btn').forEach(function(b) { b.classList.remove('qtone-active'); });
  btn.classList.add('qtone-active');
}

// ─── API Key helpers ─────────────────────────────────────────
// Lee SOLO la key propia del usuario. Nunca devuelve el fallback agotado.
function _getOwnApiKey() {
  try { return localStorage.getItem('sl_api_key') || ''; } catch(e) { return ''; }
}

// ¿El usuario guardó su propia API Key?
function _hasOwnApiKey() {
  return !!_getOwnApiKey();
}

// Para cualquier función IA: devuelve la key del usuario o, si no la tiene,
// abre el tutorial Gemini y devuelve null. El llamador DEBE abortar si
// recibe null.  De esta forma cada función IA centraliza el manejo de
// "sin key" → tutorial, sin tocar la lógica específica de cada modal.
function _requireApiKey() {
  var key = _getOwnApiKey();
  if (key) return key.trim();
  var tut = document.getElementById('geminiTutorialModal');
  if (tut) {
    tut.style.display = 'flex';
    var inp = document.getElementById('geminiTutorialKey');
    if (inp) setTimeout(function(){ inp.focus(); }, 50);
  }
  return null;
}

// ─── Verifica una respuesta de IA y arma el error con status HTTP ──────
// Centraliza lo que antes estaba duplicado (y desincronizado) en cada
// función IA: si la key guardada quedó inválida la borra (para que se
// vuelva a pedir), y adjunta SIEMPRE el status HTTP real al Error. Antes,
// el status solo aparecía en el texto del mensaje cuando el proveedor NO
// mandaba su propio mensaje — o sea, casi nunca en errores de cuota/
// sobrecarga (que son justo los que sí traen texto propio, larguísimo).
// Por eso los mensajes crudos se colaban: el `.includes('429')` sobre el
// texto no encontraba nada. _friendlyAiError ya no depende de ese texto.
// opts.clearKeyOnBadKey: solo debe pasarse true cuando resp viene de una
// llamada con la key PERSONAL del usuario (Gemini). Para keys compartidas
// (Groq, OpenAI) NUNCA se pasa — si se pasara, un problema con la key
// compartida borraría por error la key de Gemini de un usuario que no
// tiene nada que ver.
async function _aiCheckOk(resp, opts) {
  if (resp.ok) return;
  var e = await resp.json().catch(function () { return {}; });
  var apiMsg = (e.error && e.error.message) || '';
  if (opts && opts.clearKeyOnBadKey && resp.status === 400 && apiMsg.indexOf('API key') !== -1) { try { _ls.remove('sl_api_key'); } catch (_e) {} }
  var err = new Error(apiMsg || ('Error ' + resp.status));
  err.status = resp.status;
  throw err;
}

// ─── Traduce errores de IA a mensajes cortos y amables ─────────────────
// Gemini/Groq devuelven textos técnicos larguísimos (cuotas, límites,
// enlaces a documentación) que no debe ver un vendedor. Se traduce a algo
// corto y accionable; el error real siempre va a consola para depurar.
function _friendlyAiError(err) {
  console.error('[IA]', err);
  var status = err && err.status;
  var msg = ((err && err.message) || String(err) || '').toLowerCase();
  // Errores que ya vienen escritos para el vendedor (err.friendly) pasan tal cual.
  if (err && err.friendly && err.message) return err.message;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet.';
  if (status === 503 || msg.indexOf('overloaded') !== -1 || msg.indexOf('high demand') !== -1 || msg.indexOf('unavailable') !== -1)
    return 'Modelo saturado por alta demanda — intenta de nuevo en unos segundos.';
  if (status === 429 && (msg.indexOf('quota') !== -1 || msg.indexOf('resource_exhausted') !== -1 || msg.indexOf('tokens per minute') !== -1 || msg.indexOf('tpm') !== -1))
    return 'Se agotó la cuota gratuita de IA por ahora — espera unos minutos e intenta de nuevo.';
  if (status === 429) return 'Demasiadas solicitudes a la IA — espera un momento e intenta de nuevo.';
  if (status === 401 || msg.indexOf('api key') !== -1) return 'API Key inválida — revísala en Ajustes.';
  // El proveedor retiró/renombró el modelo (le pasó a 'deepseek-chat' el
  // 2026-07-24). Antes caía en el mensaje genérico y no se sabía por dónde
  // empezar a mirar.
  if (status === 400 && msg.indexOf('model') !== -1) return 'El modelo de IA ya no está disponible — hay que actualizarlo en el código.';
  if (status === 413 || msg.indexOf('too large') !== -1) return 'El archivo es muy grande — usa uno más liviano.';
  if (status === 500 || status === 502 || status === 504) return 'Error en el servidor de IA — intenta en unos segundos.';
  if (msg.indexOf('json') !== -1 || msg.indexOf('parse') !== -1) return 'Respuesta inesperada de la IA — intenta de nuevo.';
  return 'No se pudo completar con IA — intenta de nuevo.';
}

// ─── Fetch con reintento por sobrecarga (Gemini y Groq) ────────
// El modelo a veces devuelve 503 (overloaded) o 429 (rate limit) de forma
// transitoria: no es un error de la petición, es que está saturado en ese
// instante. Reintentamos con backoff exponencial + jitter. Como el modelo
// y el prompt no cambian, la calidad de la respuesta es idéntica; solo
// evitamos que un pico de carga momentáneo rompa la llamada. onRetry
// (opcional) permite avisar al usuario. Genérico — no depende del proveedor.
function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function _aiFetch(url, options, opts) {
  opts = opts || {};
  var maxRetries = opts.retries != null ? opts.retries : 3;
  var baseDelay  = opts.baseDelay || 800; // ms
  var attempt = 0;
  while (true) {
    var resp;
    try {
      resp = await fetch(url, options);
    } catch (netErr) {
      // Fallo de red (sin respuesta HTTP): tratar como transitorio.
      if (attempt >= maxRetries) throw netErr;
      if (opts.onRetry) opts.onRetry(attempt + 1, maxRetries);
      await _sleep(baseDelay * Math.pow(2, attempt) + Math.random() * 300);
      attempt++;
      continue;
    }
    if (resp.ok) return resp;
    // 503 sobrecargado · 429 rate limit · 500 interno → reintentable.
    var transient = resp.status === 503 || resp.status === 429 || resp.status === 500;
    if (!transient || attempt >= maxRetries) return resp; // el llamador maneja el error
    var retryAfter = parseFloat(resp.headers.get('retry-after'));
    var wait = !isNaN(retryAfter) ? retryAfter * 1000
                                  : baseDelay * Math.pow(2, attempt) + Math.random() * 300;
    if (opts.onRetry) opts.onRetry(attempt + 1, maxRetries);
    attempt++;
    await _sleep(wait);
  }
}

// ─── Motores de texto: ahora pasan por el proxy ──────────────────────
// Acá vivían dos keys escritas en el código (Groq y DeepSeek). Vercel le sirve
// este archivo a cualquiera que abra la URL, con sesión o sin ella, así que
// eran públicas: cualquiera podía copiarlas y gastarlas, y la de DeepSeek es de
// pago. Ahora las dos funciones llaman a /api/ai (infrastructure/ai-provider.js
// → api/ai.js), que guarda la key en el servidor, exige sesión aprobada y deja
// registro de quién pide qué.
//
// Qué modelo atiende a cada una se decide con variables de entorno en Vercel,
// no acá: perfil 'texto' para Generar texto y 'armar' para Armar PC. Cambiar de
// proveedor dejó de ser un despliegue del front.
//
// El escaneo de imágenes y "Responder cliente" siguen yendo directo a Gemini
// con la key personal de cada usuario: esa no está expuesta, y además necesitan
// imágenes y búsqueda de Google, que el proxy todavía no traduce.

/** Deja en consola el gasto de cada llamada, para medir en vez de adivinar. */
function _logAiUsage(tag, uso, ms) {
  if (!uso) return;
  console.info('[IA:' + tag + '] ' + (ms != null ? (ms / 1000).toFixed(1) + 's · ' : '') +
    'entrada ' + (uso.entrada || 0) + ' · salida ' + (uso.salida || 0));
}

/** Texto plano, sin imágenes ni búsqueda web ("Generar texto"). */
async function _groqComplete(prompt, onRetry) {
  var t0 = Date.now();
  var r = await AI.chat({
    perfil: 'texto',
    messages: [{ rol: 'usuario', texto: prompt }],
    max_tokens: 1024,
    onRetry: onRetry
  });
  _logAiUsage('texto', r.uso, Date.now() - t0);
  return (r.texto || '').trim();
}

/**
 * Motor de "Armar PC". opts.json exige que la respuesta sea un objeto JSON (de
 * ahí salía el viejo "la IA no devolvió un JSON válido") y opts.maxTokens da el
 * presupuesto de salida: los modelos de razonamiento gastan ahí también lo que
 * "piensan", por eso va holgado.
 */
async function _deepseekComplete(content, opts) {
  opts = opts || {};
  var t0 = Date.now();
  var pedir = function (conJson) {
    return AI.chat({
      perfil: 'armar',
      messages: [{ rol: 'usuario', texto: content }],
      max_tokens: opts.maxTokens || 8192,
      json: conJson,
      onRetry: opts.onRetry
    });
  };

  var r = await pedir(!!opts.json);
  // En modo JSON la respuesta a veces llega vacía sin más. Un intento sin ese
  // modo lo resuelve: el prompt igual pide "solo JSON".
  if (!r.texto && opts.json && r.fin !== 'limite') r = await pedir(false);
  _logAiUsage('armar' + (opts.json ? '/json' : ''), r.uso, Date.now() - t0);

  // Sin este aviso, quedarse sin espacio razonando terminaba como "no devolvió
  // un JSON válido", que apunta al lado equivocado.
  if (!r.texto && r.fin === 'limite') {
    var lenErr = new Error('La IA se quedó sin espacio para responder — intenta con un requerimiento más corto.');
    lenErr.friendly = true;
    throw lenErr;
  }
  return (r.texto || '').trim();
}

// ─── OpenAI: retirado ────────────────────────────────────────────────
// Había un _openaiComplete() con una key compartida de OpenAI que hacía de
// respaldo en dos puntos: "Armar PC" si faltaba la key de DeepSeek, y el
// escaneo de imágenes si Gemini se caía. Esa cuenta se quedó sin saldo, así
// que el respaldo solo agregaba una llamada perdida antes de mostrar el mismo
// error. Se quitó junto con la key. Los proveedores que quedan son Gemini
// (key personal de cada usuario, imágenes), Groq (texto) y DeepSeek (Armar PC).

// Flag para saber si el tutorial se abrió desde "Generar texto" — si es así,
// al guardar la key reabrimos automáticamente el modal de Generar texto.
var _tutorialOpenedFromQuoteText = false;

function openQuoteTextModal() {
  // Gate: "Generar texto" es exclusivo de Pro/admin. Defense-in-depth — el
  // botón ya está oculto por CSS para Lite/Basic, pero alguien podría
  // forzar el click desde la consola.
  var user = window._slAuth && window._slAuth.currentUser;
  var email = ((user && user.email) || '').toLowerCase().trim();
  var isAdmin = (window.SUPER_ADMINS || []).indexOf(email) >= 0;
  if (!isAdmin && !window._slUserIsPremium) {
    if (typeof showToast === 'function') showToast('Función exclusiva para usuarios Pro', 'warn');
    return;
  }
  // El admin puede bloquear la IA a un usuario sin quitarle el plan
  // (approved_users.ia === false): conserva todo menos las funciones de IA.
  if (!isAdmin && window._slUserIaOn === false) {
    if (typeof showToast === 'function') showToast('Las funciones de IA están desactivadas para tu usuario', 'warn');
    return;
  }

  var modal = document.getElementById('quoteTextOv');
  var outEl = document.getElementById('quoteTextOut');
  if (!modal || !outEl) return;
  outEl.value = '';
  document.getElementById('quoteTextContext').value = '';
  modal.classList.add('on');
}

// Handler del botón "Guardar" dentro del tutorial. Valida formato básico
// (las claves de Google empiezan con "AIza"), sincroniza el input de
// Ajustes y dispara el tour del Asistente IA si es la primera vez que el
// usuario guarda una key en este dispositivo. Si el tutorial se abrió
// desde "Generar texto", también reabre ese modal después del tour.
window._saveApiKeyFromTutorial = function() {
  var inp = document.getElementById('geminiTutorialKey');
  if (!inp) return;
  var val = (inp.value || '').trim();
  if (!val) {
    if (typeof showToast === 'function') showToast('Pega tu API Key primero', 'warn');
    return;
  }
  if (!/^AIza[0-9A-Za-z_-]{10,}$/.test(val)) {
    if (typeof showToast === 'function') showToast('La clave debe empezar con "AIza..."', 'warn');
    return;
  }
  try { localStorage.setItem('sl_api_key', val); } catch(e){}
  inp.value = '';
  // Sincronizar con el input de Ajustes si existe en el DOM
  var settingsInp = document.getElementById('apiKeyInput');
  if (settingsInp) settingsInp.value = val;
  if (typeof renderApiStatus === 'function') renderApiStatus();
  if (typeof showToast === 'function') showToast('API Key guardada', 'success');
  var tut = document.getElementById('geminiTutorialModal');
  if (tut) tut.style.display = 'none';

  // ¿Primera vez? → arrancar el tour del Asistente IA
  var aiTourDone = false;
  try { aiTourDone = !!localStorage.getItem('sl_ai_tour_done'); } catch(e){}
  if (!aiTourDone) {
    setTimeout(function(){ _startAiTour(); }, 250);
    return; // Si "Generar texto" venía pendiente, lo reabrimos al cerrar el tour
  }
  // Si ya vio el tour y veníamos de "Generar texto", reabrir ese modal
  if (_tutorialOpenedFromQuoteText) {
    _tutorialOpenedFromQuoteText = false;
    setTimeout(function(){ openQuoteTextModal(); }, 250);
  }
};

// ─── Tour del Asistente IA ──────────────────────────────────────
// Modal multi-paso que se dispara la primera vez que el usuario guarda
// su API Key. Explica cada una de las 5 funciones IA en orden.
var _aiTourStep = 0;
var _AI_TOUR_STEPS = [
  {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    title: 'Escanear cotización QR',
    desc: 'Sube una foto de tu cotización (tuya o de otro asesor) y la IA importa los productos al instante, buscándolos en tu catálogo y aplicando los precios actuales.',
    tip: 'Útil para no tener que volver a digitar una cotización vieja.'
  },
  {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0012 2z"/></svg>',
    title: 'Cotizar competencia',
    desc: 'Sube la cotización de otra tienda y la IA busca equivalentes en tu catálogo. Ideal para responder con tu propia oferta cuando un cliente trae una cotización externa.',
    tip: 'Mientras más clara la foto, mejor el match.'
  },
  {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    title: 'Armar PC',
    desc: 'Escribe un requerimiento (ej: "PC para gaming 1080p, $4M") y la IA propone una configuración completa usando solo productos de tu catálogo activo.',
    tip: 'Mientras más específico el requerimiento, mejor la propuesta.'
  },
  {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    title: 'Responder cliente',
    desc: 'Pega la pregunta del cliente y la IA redacta una respuesta amable y profesional. Tiene en cuenta los productos de la cotización actual y la info de tu negocio.',
    tip: 'Puedes editar la respuesta antes de enviarla.'
  },
  {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    title: 'Generar texto de la cotización',
    desc: 'Una vez armada la cotización, este botón (debajo del documento) genera un mensaje listo para WhatsApp que describe los productos en lenguaje natural.',
    tip: 'Elige el tono: normal, serio, corto o detallado.'
  }
];

function _startAiTour() {
  _aiTourStep = 0;
  _renderAiTourStep();
  var modal = document.getElementById('aiTourModal');
  if (modal) modal.style.display = 'flex';
}

function _renderAiTourStep() {
  var step = _AI_TOUR_STEPS[_aiTourStep];
  if (!step) return;
  var body = document.getElementById('aiTourBody');
  var dots = document.getElementById('aiTourDots');
  var back = document.getElementById('aiTourBack');
  var next = document.getElementById('aiTourNext');
  if (!body || !dots || !back || !next) return;

  body.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">' +
      '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#818cf8,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
        '<div style="width:22px;height:22px">' + step.icon + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:#6366f1;text-transform:uppercase;margin-bottom:2px">Paso ' + (_aiTourStep + 1) + ' de ' + _AI_TOUR_STEPS.length + '</div>' +
        '<div style="font-size:17px;font-weight:700;color:var(--gray-900);letter-spacing:-0.3px">' + step.title + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="font-size:13.5px;color:#4b5563;line-height:1.6;margin-bottom:14px">' + step.desc + '</div>' +
    '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 12px;font-size:12px;color:#075985;line-height:1.5">' +
      '<strong style="color:#0c4a6e">Tip:</strong> ' + step.tip +
    '</div>';

  // Dots
  var dotsHtml = '';
  for (var i = 0; i < _AI_TOUR_STEPS.length; i++) {
    var active = i === _aiTourStep;
    dotsHtml += '<div style="width:' + (active ? '20px' : '6px') + ';height:6px;border-radius:3px;background:' + (active ? 'var(--gray-900)' : '#d4d4d8') + ';transition:all .2s"></div>';
  }
  dots.innerHTML = dotsHtml;

  // Botones
  back.style.visibility = _aiTourStep === 0 ? 'hidden' : 'visible';
  if (_aiTourStep === _AI_TOUR_STEPS.length - 1) {
    next.textContent = '¡Listo!';
    next.style.background = '#10b981';
  } else {
    next.textContent = 'Siguiente';
    next.style.background = 'var(--gray-900)';
  }
}

window._nextAiStep = function() {
  if (_aiTourStep < _AI_TOUR_STEPS.length - 1) {
    _aiTourStep++;
    _renderAiTourStep();
  } else {
    _closeAiTour();
  }
};

window._prevAiStep = function() {
  if (_aiTourStep > 0) {
    _aiTourStep--;
    _renderAiTourStep();
  }
};

window._closeAiTour = function() {
  var modal = document.getElementById('aiTourModal');
  if (modal) modal.style.display = 'none';
  try { localStorage.setItem('sl_ai_tour_done', '1'); } catch(e){}
  // Si veníamos de "Generar texto", reabrir ese modal ahora
  if (_tutorialOpenedFromQuoteText) {
    _tutorialOpenedFromQuoteText = false;
    setTimeout(function(){ openQuoteTextModal(); }, 250);
  }
};

// ─── Upgrade a Pro (modal + interceptor para usuarios Lite) ──────
// Configuración del CTA:
//   - PRO_WHATSAPP: número en formato wa.me (sin "+", sin espacios, sin guiones)
//   - PRO_PRICE_TEXT: lo que se muestra al usuario en el modal
//   - PRO_MSG_TEMPLATE: mensaje pre-llenado en WhatsApp (usa {{email}} para
//     interpolar el correo del usuario logueado)
var PRO_WHATSAPP = '573046217300';
var PRO_PRICE_TEXT = '$20.000 COP/mes';
// Plantilla del mensaje pre-llenado en WhatsApp. {{brand}} se reemplaza con
// el nombre de la marca activa (custom o "SpeedLogic" por defecto).
var PRO_MSG_TEMPLATE = 'Hola, quiero suscribirme a {{brand}} Pro (' + PRO_PRICE_TEXT + '). Mi correo: {{email}}';

window._openUpgradeModal = function() {
  var modal = document.getElementById('upgradeProModal');
  if (modal) modal.style.display = 'flex';
};

window._closeUpgradeModal = function() {
  var modal = document.getElementById('upgradeProModal');
  if (modal) modal.style.display = 'none';
};

window._contactProWhatsApp = function() {
  var email = '';
  try { email = (window._slAuth && window._slAuth.currentUser && window._slAuth.currentUser.email) || localStorage.getItem('sl_user_email') || ''; } catch(e){}
  var brand = (window._slBranding && window._slBranding.brandName) || 'Cotizador Web';
  var msg = PRO_MSG_TEMPLATE
    .replace('{{brand}}', brand)
    .replace('{{email}}', email || '(sin sesión)');
  var url = 'https://wa.me/' + PRO_WHATSAPP + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank', 'noopener');
};

// Selectores de features bloqueadas para Lite. Cualquier click sobre estos
// elementos (o sus hijos) abre el modal de upgrade en vez de ejecutar la
// acción original.
var _LITE_LOCKED_SELECTORS = [
  '#tab-i',
  '#tab-cmp',
  '.btn-facturar',
  '.btn-gen-txt',
  '.pv-top button[onclick*="openHist"]',
  '.btn-vstats',
  '#secAiAssistant .ai-chip'
];

// Interceptor global de clicks. Capture phase (true) para correr ANTES
// que los onclick inline de cada elemento. Solo actúa si el usuario es Lite.
document.addEventListener('click', function(e) {
  if (!document.body.classList.contains('lite-user')) return;
  // Permitir cerrar el modal de upgrade
  if (e.target.closest('#upgradeProModal')) return;
  for (var i = 0; i < _LITE_LOCKED_SELECTORS.length; i++) {
    if (e.target.closest(_LITE_LOCKED_SELECTORS[i])) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      _openUpgradeModal();
      return;
    }
  }
}, true);

function setQuoteTone(btn) {
  _quoteTone = btn.dataset.tone;
  document.querySelectorAll('.qtone-btn').forEach(function(b) { b.classList.remove('qtone-active'); });
  btn.classList.add('qtone-active');
}

async function generateQuoteText() {
  if (!_state.items || !_state.items.length) { showToast('Agrega productos a la cotización primero', 'warn'); return; }

  var outEl = document.getElementById('quoteTextOut');
  if (!outEl) return;
  outEl.value = 'Generando texto…';
  outEl.disabled = true;

  var lines = _state.items.map(function(it) {
    return '- Cant:' + (it.qty || 1) + '  ' + it.name + (it._cat ? '  [' + it._cat + ']' : '') + '  $' + ((it.price || 0) * (it.qty || 1)).toLocaleString('es-CO');
  });
  var total = _state.items.reduce(function(s, it) { return s + (it.price || 0) * (it.qty || 1); }, 0);

  var toneInstructions = {
    normal:    'Escribe en un tono amable y natural, sin formalidades excesivas ni jerga. ' +
               'Máximo 4-5 oraciones. Presenta el producto, destaca 2-3 puntos fuertes en términos simples y menciona el precio.',
    serio:     'Escribe en un tono profesional y directo, sin palabras de relleno ni frases de ventas exageradas. ' +
               'Máximo 4-5 oraciones. Presenta el producto con objetividad, menciona especificaciones relevantes y el precio.',
    corto:     'Escribe en máximo 2-3 oraciones. Ve directo al punto: qué es, para qué sirve y cuánto cuesta. Sin adornos.',
    detallado: 'Escribe una descripción completa en 7-9 oraciones. Explica cada componente o característica importante, ' +
               'para qué sirve cada uno en términos que cualquier persona entienda, el uso ideal del equipo y el precio final.'
  };

  var extraCtx = (document.getElementById('quoteTextContext').value || '').trim();

  var prompt = 'Eres asistente de ventas de una tienda de tecnología.\n' +
    'Redacta un texto explicativo sobre la siguiente cotización, listo para enviar por WhatsApp.\n' +
    'Instrucciones de tono: ' + (toneInstructions[_quoteTone] || toneInstructions.normal) + '\n' +
    'Reglas generales: NO uses listas con viñetas. NO empieces con saludos ni frases de introducción como ' +
    '"Aquí tienes", "Te presento", "A continuación", "Claro", "Con gusto" o similares. ' +
    'Empieza directamente describiendo el producto. NO repitas el nombre de la tienda. Escribe en español neutro. ' +
    'NO menciones el precio ni el costo en ningún momento.\n\n' +
    (extraCtx ? 'Contexto del cliente o del caso: ' + extraCtx + '\n' +
    'Ten en cuenta este contexto para orientar la descripción (uso previsto, perfil del usuario, etc.).\n\n' : '') +
    'Productos cotizados:\n' + lines.join('\n');

  var genBtn   = document.getElementById('quoteGenBtn');
  var regenBtn = document.getElementById('quoteRegenBtn');
  var copyBtn  = document.getElementById('quoteCopyBtn');
  if (genBtn)   genBtn.style.display   = 'none';
  if (regenBtn) regenBtn.style.display = 'none';
  if (copyBtn)  copyBtn.style.display  = 'none';

  try {
    var text = await _groqComplete(prompt, function (n, max) { outEl.value = 'El modelo está ocupado, reintentando… (' + n + '/' + max + ')'; });
    outEl.value = text || 'Sin respuesta.';
    outEl.disabled = false;
    if (regenBtn) regenBtn.style.display = '';
    if (copyBtn)  copyBtn.style.display  = '';
  } catch(err) {
    var friendly = _friendlyAiError(err);
    outEl.value = friendly;
    outEl.disabled = false;
    if (genBtn) genBtn.style.display = '';
    showToast(friendly, 'error');
  }
}

function saveSettings() {
  let fields = { cfgEmpresa: 'empresa', cfgNit: 'nit', cfgTel: 'tel', cfgEmail: 'email', cfgDir: 'dir', cfgDriveSheet: 'driveSheetUrl', cfgBanco: 'banco', cfgTipoCuenta: 'tipoCuenta', cfgCuenta: 'cuenta', cfgTitular: 'titular', cfgGarantia: 'garantia', cfgHorarios: 'horarios', cfgUbicacion: 'ubicacion', cfgPagos: 'pagos', cfgEnvios: 'envios', cfgGlosario: 'glosario', cfgIaExtra: 'iaExtra', cfgWarrantyMonitor: 'warrantyMonitor', cfgWarrantyMonitorXiaomi: 'warrantyMonitorXiaomi', cfgWarrantyPortatil: 'warrantyPortatil', cfgEmpFormaPago: 'empFormaPago', cfgEmpEntrega: 'empEntrega', cfgEmpEnvio: 'empEnvio', cfgEmpRegimen: 'empRegimen', cfgEmpObservaciones: 'empObservaciones', cfgEmpRadicar: 'empRadicar', cfgEmpNotaLegal: 'empNotaLegal' };
  let cfg = {};
  for (let id in fields) { let el = document.getElementById(id); if (el) cfg[fields[id]] = el.value.trim(); }
  saveCfg(cfg);
  saveApiKey();
  closeSettings();
  showToast('Configuración guardada', 'success');
  notifyQuote();
}

// --- Inline price editing ---
// ============================================================
// SECCIÓN: EDICIÓN INLINE DE PRECIOS
// ============================================================
function editPrice(i, el) {
  if (el.querySelector('input')) return;
  let cur = items[i].price;
  let inp = document.createElement('input');
  inp.className = 'item-price-inp';
  inp.type = 'text';
  inp.value = (cur * 1000).toLocaleString('es-CO');
  inp.onclick = function (e) { e.stopPropagation() };
  inp.onkeydown = function (e) {
    if (e.key === 'Enter') { commitPrice(i, inp, el); }
    if (e.key === 'Escape') { el.innerHTML = fmtCOP(applyDisc(items[i].price) * 1000 * items[i].qty) + '<span class="item-price-edit-ico">' + icon('edit', 'ico-xs') + '</span>'; el.onclick = function () { editPrice(i, el) }; }
  };
  inp.onblur = function () { commitPrice(i, inp, el); };
  el.textContent = '';
  el.appendChild(inp);
  inp.select();
}
function commitPrice(i, inp, el) {
  let raw = inp.value.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
  let val = parseFloat(raw);
  if (!isNaN(val) && val > 0) {
    dispatch({ type: 'UPDATE_PRICE', index: i, price: val / 1000 });
    showToast('Precio actualizado', 'info');
  }
}

// --- Inline name editing ---
function editName(i, el) {
  if (el.querySelector('input')) return;
  let cur = items[i].name;
  let inp = document.createElement('input');
  inp.className = 'item-name-inp';
  inp.type = 'text';
  inp.value = cur;
  inp.onclick = function (e) { e.stopPropagation() };
  inp.onkeydown = function (e) {
    if (e.key === 'Enter') { commitName(i, inp, el); }
    if (e.key === 'Escape') { el.innerHTML = esc(items[i].name) + '<span class="item-name-edit-ico">' + icon('edit', 'ico-xs') + '</span>'; el.onclick = function () { editName(i, el) }; }
  };
  inp.onblur = function () { commitName(i, inp, el); };
  el.textContent = '';
  el.appendChild(inp);
  inp.select();
}
function commitName(i, inp, el) {
  let val = inp.value.trim();
  if (val && val !== items[i].name) {
    dispatch({ type: 'UPDATE_NAME', index: i, name: val });
    showToast('Nombre actualizado', 'info');
  } else {
    // Restore original
    el.innerHTML = esc(items[i].name) + '<span class="item-name-edit-ico">' + icon('edit', 'ico-xs') + '</span>';
    el.onclick = function () { editName(i, el) };
  }
}

// --- Edición inline DESDE la cotización (precio y descripción) ---
function editQuotePrice(i, el) {
  if (!items[i] || el.querySelector('input')) return;
  var inp = document.createElement('input');
  inp.className = 'qedit-inp qedit-r';
  inp.type = 'text';
  inp.inputMode = 'numeric';
  inp.value = Math.round(items[i].price * 1000).toLocaleString('es-CO');
  inp.onclick = function (e) { e.stopPropagation(); };
  inp.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    else if (e.key === 'Escape') { inp._cancel = true; generateQuote(true); }
  };
  inp.onblur = function () {
    if (inp._cancel) return;
    var raw = inp.value.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
    var val = parseFloat(raw);
    if (!isNaN(val) && val > 0) { dispatch({ type: 'UPDATE_PRICE', index: i, price: val / 1000 }); showToast('Precio actualizado', 'info'); }
    else { generateQuote(true); }
  };
  el.textContent = '';
  el.appendChild(inp);
  inp.focus(); inp.select();
}

function editQuoteName(i, el) {
  if (!items[i] || el.isContentEditable) return;
  var original = items[i].name;

  // Activar edición inline directamente sobre el elemento
  el.contentEditable = 'true';
  el.classList.add('qedit-active');
  el.spellcheck = false;

  // Mover cursor al final
  el.focus();
  var range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function commit() {
    var val = el.textContent.trim();
    el.contentEditable = 'false';
    el.classList.remove('qedit-active');
    if (val && val !== original) {
      dispatch({ type: 'UPDATE_NAME', index: i, name: val });
      showToast('Descripción actualizada', 'info');
    } else {
      el.textContent = original;
    }
  }

  el.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = original; el.contentEditable = 'false'; el.classList.remove('qedit-active'); el.onkeydown = null; el.onblur = null; }
  };
  el.onblur = function () { commit(); el.onkeydown = null; el.onblur = null; };
}

// --- Add custom product (not in catalog) ---
function addCustomItem() {
  var nameInp = document.getElementById('customItemName');
  var priceInp = document.getElementById('customItemPrice');
  if (!nameInp || !priceInp) return;
  var name = nameInp.value.trim();
  var priceRaw = priceInp.value.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
  var price = parseFloat(priceRaw);
  if (!name) { showToast('Escribe un nombre para el producto', 'warn'); nameInp.focus(); return; }
  if (isNaN(price) || price <= 0) { showToast('Escribe un precio válido', 'warn'); priceInp.focus(); return; }
  var ok = addItem({ sku: 'CUSTOM', name: name, price: price / 1000, _cat: 'ADICIONAL', note: '', source: S.activePriceList });
  if (ok) {
    nameInp.value = '';
    priceInp.value = '';
    showToast(name.slice(0, 30) + ' añadido', 'success');
  }
}

// --- Compare A vs B ---

// ============================================================
// SECCIÓN: MODO COMPARACIÓN (A vs B)
// ============================================================
// Compare snapshots stored in S.cmpA / S.cmpB
function captureCompare(slot) {
  var label = slot === 'A' ? 'Opción A' : 'Opción B';
  var toastType = slot === 'A' ? 'info' : 'success';
  if (!items.length) { showToast('No hay productos', 'warn'); return }
  generateQuote(true);
  var doc = document.getElementById('quoteDoc');
  if (!doc) { showToast('Genera la cotización primero', 'warn'); return }
  var calc = calcEngine();
  var snap = { html: doc.outerHTML, total: calc.totalConIva, items: items.length, label: document.getElementById('cliente').value || label };
  if (slot === 'A') S.cmpA = snap; else S.cmpB = snap;
  showToast('Capturado como ' + label, toastType);
  renderCompare();
}
function captureCompareA() { captureCompare('A') }
function captureCompareB() { captureCompare('B') }
function renderCompare() {
  let cont = document.getElementById('cmpContent'); if (!cont) return;
  if (!S.cmpA && !S.cmpB) {
    cont.innerHTML = T.compareEmpty();
    return;
  }
  let diff = S.cmpA && S.cmpB ? S.cmpB.total - S.cmpA.total : null;
  let html = '';
  if (S.cmpA) html += T.compareSlot('A', S.cmpA);
  if (S.cmpA && S.cmpB) html += T.compareDivider(diff);
  if (S.cmpB) html += T.compareSlot('B', S.cmpB);
  cont.innerHTML = html;
  document.getElementById('btnCompare').style.display = 'flex';
  switchTab('cmp');
}
function clearCompare() {
  S.cmpA = null; S.cmpB = null;
  document.getElementById('btnCompare').style.display = 'none';
  renderCompare();
}
function openCompare() { switchTab('cmp') }



// ============================================================
// SECCIÓN: RESPONSIVE SIDEBAR TOGGLE
// ============================================================
function toggleSidebar() {
  var sb = document.querySelector('.sb');
  var btn = document.getElementById('mobileToggle');
  var bd = document.getElementById('sbBackdrop');
  var isOpen = sb.classList.contains('open');
  if (isOpen) { closeSidebar(); } else {
    sb.classList.add('open');
    btn.classList.add('open');
    bd.classList.add('on');
  }
}
function closeSidebar() {
  var sb = document.querySelector('.sb');
  var btn = document.getElementById('mobileToggle');
  var bd = document.getElementById('sbBackdrop');
  sb.classList.remove('open');
  btn.classList.remove('open');
  bd.classList.remove('on');
}

// ============================================================
// SECCIÓN: SWAP PICKER — Reemplazo rápido de producto en cotización
// Abre un popup con el catálogo pre-filtrado por categoría
// para intercambiar un producto sin salir de la cotización.
// ============================================================

var _swapTargetIdx = null;       // Índice en items[] del producto a reemplazar
var _swapFiltered  = [];         // Productos filtrados para el picker
var _swapActiveCat = '';         // Categoría activa en las pills
var _swapHighlight = 0;          // Índice resaltado (navegación con teclado)

function openSwapPicker(idx) {
  idx = Number(idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return;

  var targetItem = items[idx];
  _swapTargetIdx = idx;

  var ov = document.getElementById('swapPickerOv');
  if (!ov) return;

  // Poblar info del producto actual
  var curEl = document.getElementById('swapCurrentName');
  if (curEl) curEl.textContent = targetItem.name;

  // Categoría pre-seleccionada
  _swapActiveCat = targetItem._cat || getCat(targetItem.name) || '';

  // Renderizar pills de categorías
  _renderSwapCatPills();

  // Limpiar búsqueda
  var si = document.getElementById('swapSearch');
  if (si) { si.value = ''; }

  // Filtrar y renderizar
  _filterAndRenderSwap();

  // Mostrar overlay
  ov.classList.add('on');

  // Focus en el buscador con un pequeño delay para la animación
  setTimeout(function () { if (si) si.focus(); }, 220);
}

function _getSwapCatalogSource() {
  return S.activePriceList === 'lago' ? S.catalogLago : CATALOG;
}

function _renderSwapCatPills() {
  var wrap = document.getElementById('swapCatPills');
  if (!wrap) return;

  var src = _getSwapCatalogSource();
  // Recopilar categorías únicas
  var catSet = {};
  for (var i = 0; i < src.length; i++) {
    var c = src[i]._cat || 'ADICIONAL';
    if (!catSet[c]) catSet[c] = 0;
    catSet[c]++;
  }
  var cats = Object.keys(catSet).sort(function (a, b) { return catOrd(a) - catOrd(b); });

  var h = '<button class="swap-cat-pill' + (!_swapActiveCat ? ' active' : '') + '" onclick="_swapSetCat(\'\')">Todas <span class="swap-cat-count">' + src.length + '</span></button>';
  for (var j = 0; j < cats.length; j++) {
    var cat = cats[j];
    var isActive = (_swapActiveCat === cat);
    h += '<button class="swap-cat-pill' + (isActive ? ' active' : '') + '" onclick="_swapSetCat(\'' + esc(cat).replace(/'/g, "\\'") + '\')">' + esc(cat) + '<span class="swap-cat-count">' + catSet[cat] + '</span></button>';
  }
  wrap.innerHTML = h;

  // Scroll al pill activo
  if (_swapActiveCat) {
    setTimeout(function () {
      var active = wrap.querySelector('.swap-cat-pill.active');
      if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function _swapSetCat(cat) {
  _swapActiveCat = cat;
  _renderSwapCatPills();
  _filterAndRenderSwap();
}

function filterSwapPicker() {
  _filterAndRenderSwap();
}

function _filterAndRenderSwap() {
  var src = _getSwapCatalogSource();
  var q = (document.getElementById('swapSearch') || {}).value || '';
  q = q.toLowerCase().trim();

  _swapFiltered = src.filter(function (p) {
    var pName = p.name ? p.name.toLowerCase() : '';
    var pSku  = p.sku != null ? String(p.sku).toLowerCase() : '';
    var matchQ = !q || pName.includes(q) || pSku.includes(q);
    if (!matchQ) return false;
    if (q) return true;                                 // con texto de búsqueda, la categoría deja de restringir: busca en todo el catálogo
    var pCat = p._cat || 'ADICIONAL';
    return !_swapActiveCat || pCat === _swapActiveCat;
  });

  _swapFiltered.sort(function (a, b) {
    if (q && _swapActiveCat) {                            // durante la búsqueda, la categoría activa solo prioriza — no excluye
      var aOwn = (a._cat || 'ADICIONAL') === _swapActiveCat;
      var bOwn = (b._cat || 'ADICIONAL') === _swapActiveCat;
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
    }
    return catOrd(a._cat) - catOrd(b._cat);
  });

  _swapHighlight = 0;                                   // reset navegación al primer resultado
  var clr = document.getElementById('swapClear');
  if (clr) clr.hidden = !q;                             // mostrar × solo si hay búsqueda

  _renderSwapList();
}

function _renderSwapList() {
  var list = document.getElementById('swapList');
  var countEl = document.getElementById('swapCount');
  if (!list) return;

  if (countEl) countEl.textContent = _swapFiltered.length + ' productos';

  if (!_swapFiltered.length) {
    list.innerHTML = '<div class="swap-empty"><svg class="swap-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Sin resultados</div><div style="font-size:11px;margin-top:4px">Prueba con otro término o categoría</div></div>';
    return;
  }

  var q = (document.getElementById('swapSearch') || {}).value || '';
  q = q.trim();

  // Agrupar por categoría
  var grouped = {};
  for (var i = 0; i < _swapFiltered.length; i++) {
    var p = _swapFiltered[i], key = p._cat || 'ADICIONAL';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ product: p, filteredIdx: i });
  }

  // Precio del ítem que se está reemplazando, para mostrar la diferencia (Δ).
  var curItem = (_swapTargetIdx != null) ? items[_swapTargetIdx] : null;
  var curPrice = (curItem && Number(curItem.price) > 0) ? Number(curItem.price) : null;
  var CHEVRON = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';

  var h = '', cats = Object.keys(grouped).sort(function (a, b) {
    if (q && _swapActiveCat) {                            // agrupa primero la categoría activa cuando la búsqueda cruza a otras
      var aOwn = a === _swapActiveCat, bOwn = b === _swapActiveCat;
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
    }
    return catOrd(a) - catOrd(b);
  });
  for (var c = 0; c < cats.length; c++) {
    var cat = cats[c], prods = grouped[cat];
    // Mostrar header solo si hay más de una categoría visible
    if (cats.length > 1) {
      h += '<div class="swap-sec-hdr">' + esc(cat) + ' &middot; ' + prods.length + '</div>';
    }
    for (var j = 0; j < prods.length; j++) {
      var pp = prods[j].product, idx = prods[j].filteredIdx;
      var isCurrentItem = (curItem && curItem.sku === pp.sku);

      // Δ de precio respecto al producto actual (en COP completo).
      var deltaHtml = '';
      if (!isCurrentItem && curPrice != null) {
        var d = (pp.price - curPrice) * 1000;
        if (d !== 0) deltaHtml = '<span class="swap-row-delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + '$' + Math.abs(d).toLocaleString('es-CO') + '</span>';
      }

      h += '<div class="swap-row' + (isCurrentItem ? ' swap-row-current' : '') + (idx === _swapHighlight ? ' swap-row-hl' : '') + '" data-swap-idx="' + idx + '" onclick="swapSelectProduct(' + idx + ')">';
      h += '  <div class="swap-row-main">';
      h += '    <div class="swap-row-name" title="' + esc(pp.name) + '">' + esc(pp.name) + '</div>';
      h += '    <div class="swap-row-sku">' + esc(String(pp.sku)) + '</div>';
      h += '  </div>';
      h += '  <div class="swap-row-pricing"><span class="swap-row-price">$' + (pp.price * 1000).toLocaleString('es-CO') + '</span>' + deltaHtml + '</div>';
      h += isCurrentItem ? '  <span class="swap-row-tag">Actual</span>' : '  <span class="swap-row-go">' + CHEVRON + '</span>';
      h += '</div>';
    }
  }
  list.innerHTML = h;
}

function swapSelectProduct(filteredIdx) {
  var p = _swapFiltered[filteredIdx];
  if (!p || _swapTargetIdx == null) return;

  var oldName = items[_swapTargetIdx] ? items[_swapTargetIdx].name : '';

  dispatch({
    type: 'SWAP',
    index: _swapTargetIdx,
    item: {
      sku:   p.sku,
      name:  p.name,
      price: p.price,
      _cat:  p._cat || null,
      source: p._listSource || S.activePriceList
    }
  });

  closeSwapPicker();
  showToast(oldName.slice(0, 20) + ' → ' + p.name.slice(0, 20), 'success');
}

// Navegación con teclado dentro del buscador: ↑↓ mueven el resaltado, ↵ elige, Esc cierra.
function _swapKeydown(e) {
  var n = _swapFiltered.length;
  if (e.key === 'Escape') { e.preventDefault(); closeSwapPicker(); return; }
  if (!n) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _swapHighlight = Math.min(n - 1, _swapHighlight + 1); _swapUpdateHighlight(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _swapHighlight = Math.max(0, _swapHighlight - 1); _swapUpdateHighlight(); }
  else if (e.key === 'Enter') { e.preventDefault(); swapSelectProduct(_swapHighlight); }
}

function _swapUpdateHighlight() {
  var list = document.getElementById('swapList');
  if (!list) return;
  var rows = list.querySelectorAll('.swap-row');
  for (var i = 0; i < rows.length; i++) {
    var on = Number(rows[i].getAttribute('data-swap-idx')) === _swapHighlight;
    rows[i].classList.toggle('swap-row-hl', on);
    if (on) rows[i].scrollIntoView({ block: 'nearest' });
  }
}

function _swapClearSearch() {
  var si = document.getElementById('swapSearch');
  if (si) { si.value = ''; si.focus(); }
  _filterAndRenderSwap();
}

function closeSwapPicker() {
  var ov = document.getElementById('swapPickerOv');
  if (ov) ov.classList.remove('on');
  _swapTargetIdx = null;
  _swapFiltered = [];
}


