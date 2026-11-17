// ============================================================
// BETA: Catalog JSON Importer — application/catalog-importer.js
//
// ANALYSIS NOTES (do not modify existing code):
//   - CATALOG is a global array declared in application/state.js
//   - Products use schema: { sku, name, price (miles COP), cat, _cat, _listSource }
//   - price in the app is in THOUSANDS of COP (price * 1000 = COP). The PDF
//     JSON has price in full COP (e.g. 1039000), so we DIVIDE by 1000.
//   - _processCatalogArray() assigns _listSource and _cat via mapExcelCat()
//   - After updating CATALOG, call filterCat() to re-render the list
//   - showToast(msg, bg, color) is available globally from ui.js
// ============================================================

/** Feature flag — set to false to disable the BETA importer entirely */
var BETA_CATALOG_IMPORTER_ENABLED = true;

// ── Parsing ──────────────────────────────────────────────────

/**
 * Extracts a flat array of raw products from the nested PDF JSON structure.
 * Input:  { categories: [ { name, products: [...] } ] }
 * Output: flat array of raw product objects
 */
function parsePdfCatalogJson(jsonData) {
  if (!jsonData || !Array.isArray(jsonData.categories)) {
    throw new Error('JSON inválido: falta el array "categories"');
  }
  var allProducts = [];
  for (var i = 0; i < jsonData.categories.length; i++) {
    var cat = jsonData.categories[i];
    if (!cat || !Array.isArray(cat.products)) {
      throw new Error('Categoría "' + (cat && cat.name || i) + '" no tiene array "products"');
    }
    for (var j = 0; j < cat.products.length; j++) {
      allProducts.push(cat.products[j]);
    }
  }
  return allProducts;
}

/**
 * Validates a single raw product from the PDF JSON.
 * Returns null if valid, or an error string if invalid.
 */
function validatePdfProduct(product, index) {
  if (!product || typeof product !== 'object') return 'Producto #' + index + ' no es un objeto';
  var name = String(product.name || '').trim();
  if (!name) return 'Producto #' + index + ' no tiene nombre';
  var price = Number(product.price);
  if (isNaN(price) || price <= 0) return 'Producto #' + index + ' (' + name.slice(0, 30) + ') tiene precio inválido: ' + product.price;
  return null;
}

/**
 * Maps a single raw product from the PDF JSON to the app's catalog schema.
 *
 * Field mapping:
 *   JSON.sku       → app.sku        (string, can be numeric or alphanumeric like "52373-19290")
 *   JSON.name      → app.name       (string)
 *   JSON.price     → app.price      (DIVIDE by 1000: PDF is COP, app is miles COP)
 *   JSON.category  → app.cat        (string; app will assign _cat via mapExcelCat())
 *
 * Fields NOT in the PDF JSON (assigned automatically later):
 *   _cat        — assigned by _processCatalogArray() via mapExcelCat()
 *   _listSource — assigned by _processCatalogArray()
 */
function mapPdfProductToAppSchema(product, index) {
  // SKU: use as-is if present; generate a placeholder when absent so the product
  // is still identifiable in the cart (the app allows non-numeric SKUs).
  var sku = String(product.sku || '').trim();
  if (!sku) sku = 'PDF-' + (index + 1);

  // price: PDF JSON is in COP (e.g. 1039000). App stores prices in THOUSANDS of COP
  // (e.g. 1039). Math.round() is used to handle minor floating-point artefacts that
  // can arise from the PDF parser (e.g. 1039999 → 1040). This matches the existing
  // behaviour of manual price entries in the app which are always integer multiples.
  var priceMilesCop = Math.round(Number(product.price) / 1000);

  return {
    sku:   sku,                                    // JSON.sku → app.sku
    name:  String(product.name || ''),             // JSON.name → app.name
    price: priceMilesCop,                          // JSON.price (COP) ÷ 1000 → app.price (miles COP)
    cat:   String(product.category || '')          // JSON.category → app.cat
    // _cat and _listSource are set by _processCatalogArray()
  };
}

// ── Main import function ──────────────────────────────────────

/**
 * Imports a PDF catalog JSON file into the app's CATALOG.
 * Reads the file, validates it, maps products, processes them,
 * updates CATALOG, and triggers a UI re-render.
 *
 * @param {File} file  - The .json File object from a file input or drop
 * @param {Function} [onPreview] - Optional callback(jsonData, mappedProducts) called before confirmation
 * @param {Function} [onDone]    - Optional callback(count, categories) called after successful import
 */
function importPdfCatalogFile(file, onPreview, onDone) {
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      // 1. Parse JSON
      var jsonData;
      try {
        jsonData = JSON.parse(e.target.result);
      } catch (parseErr) {
        showToast('El archivo no es JSON válido: ' + parseErr.message, 'error');
        return;
      }

      // 2. Validate top-level structure
      if (!jsonData.categories || !Array.isArray(jsonData.categories)) {
        showToast('JSON inválido: falta el array "categories"', 'error');
        return;
      }

      // 3. Extract raw products
      var rawProducts;
      try {
        rawProducts = parsePdfCatalogJson(jsonData);
      } catch (structErr) {
        showToast(structErr.message, 'error');
        return;
      }

      if (!rawProducts.length) {
        showToast('El JSON no contiene productos', 'warn');
        return;
      }

      // 4. Validate each product
      var errors = [];
      for (var i = 0; i < rawProducts.length; i++) {
        var err = validatePdfProduct(rawProducts[i], i + 1);
        if (err) errors.push(err);
        if (errors.length >= 5) { errors.push('... (más errores omitidos)'); break; }
      }
      if (errors.length) {
        showToast('Errores de validación:\n' + errors.join('\n'), 'error');
        return;
      }

      // 5. Map to app schema
      var mappedProducts = rawProducts.map(function (p, i) { return mapPdfProductToAppSchema(p, i); });
      // mapPdfProductToAppSchema ya dividió el precio por 1000 (COP → miles). Marcarlo
      // para que _processCatalogArray (llamado más abajo en _applyPdfCatalogImport) no
      // lo vuelva a dividir — ver el comentario en _processCatalogArray, services.js.
      mappedProducts._alreadyNormalized = true;

      // 6. If onPreview callback provided, hand off to UI for confirmation
      if (typeof onPreview === 'function') {
        onPreview(jsonData, mappedProducts);
        return;
      }

      // 7. No preview — import directly
      _applyPdfCatalogImport(mappedProducts, jsonData, onDone);

    } catch (err) {
      showToast('Error procesando el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/**
 * Applies the already-validated and mapped products to CATALOG (store) or S.catalogLago (lago).
 * Called after user confirms the import in the UI.
 *
 * @param {Array}    mappedProducts - Products already mapped to app schema
 * @param {Object}   jsonData       - Original JSON (for metadata like source/date)
 * @param {Function} [onDone]       - Optional callback(count, categoryCount, processedProducts) after import
 * @param {string}   [target]       - 'store' (default) or 'lago'
 */
function _applyPdfCatalogImport(mappedProducts, jsonData, onDone, target) {
  target = target || 'store';
  try {
    // Process: assigns _listSource and _cat via mapExcelCat()
    var processed = _processCatalogArray(mappedProducts, target);

    // Add permanent items (e.g. "Servicio Técnico")
    ensurePermanentItems(processed, target);

    var d = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    var catCount = jsonData && jsonData.categories ? jsonData.categories.length : 0;

    if (target === 'lago') {
      // Update Lago catalog
      S.catalogLago = processed;
      if (switchPriceList('lago')) {
        var dateElL = document.getElementById('catDate');
        if (dateElL) dateElL.textContent = 'Lista 2 · Actualizado ' + d + ' · ' + processed.length + ' productos';
        var tabNL = document.getElementById('catTabN');
        if (tabNL) tabNL.textContent = processed.length;
      }
    } else {
      // Replace global CATALOG (store)
      CATALOG = processed;

      // Update the UI date label
      var dateEl = document.getElementById('catDate');
      if (dateEl) dateEl.textContent = 'Lista 1 · Actualizado ' + d + ' · ' + processed.length + ' productos';

      var tabN = document.getElementById('catTabN');
      if (tabN) tabN.textContent = processed.length;

      // Re-render catalog
      updateCatFilterOpts();
      filterCat();
    }

    showToast(processed.length + ' productos importados (' + catCount + ' categorías)', 'success');

    if (typeof window._markCatalogImported === 'function') window._markCatalogImported();
    if (typeof window._dismissCatalogExpiredOverlay === 'function') window._dismissCatalogExpiredOverlay();

    if (typeof onDone === 'function') onDone(processed.length, catCount, processed);
  } catch (err) {
    showToast('Error al importar: ' + err.message, 'error');
  }
}

/**
 * Generates and triggers a browser download of a flat JSON catalog file.
 * The file is a plain array [{sku, name, price, cat}] compatible with autoLoadCatalog().
 *
 * @param {Array}  mappedProducts - Products already mapped to app schema
 * @param {string} filename       - Name for the downloaded file (e.g. "catalog_store.json")
 */
function generateCatalogDownload(mappedProducts, filename) {
  try {
    var flat = mappedProducts.map(function (p) {
      return { sku: p.sku, name: p.name, price: p.price, cat: p.cat };
    });
    var json = JSON.stringify(flat, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'catalog_store.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    showToast('Error al generar descarga: ' + err.message, 'error');
  }
}
