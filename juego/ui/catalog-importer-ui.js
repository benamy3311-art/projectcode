// ============================================================
// Catalog JSON Importer UI — ui/catalog-importer-ui.js
//
// Injects a "📋 Importar Catálogo JSON" button into the catalog
// toolbar (#panel-c .ctoolbar) and renders a modal for import.
// Depends on: application/catalog-importer.js (must load first)
// ============================================================

(function () {
  'use strict';

  // Guard: respect feature flag from catalog-importer.js
  if (typeof BETA_CATALOG_IMPORTER_ENABLED === 'undefined' || !BETA_CATALOG_IMPORTER_ENABLED) return;

  // ── Constants ─────────────────────────────────────────────
  var GH_OWNER = 'benamy3311-art';
  var GH_REPO  = 'projectcode-tools';
  var DATE_LOCALE  = 'es-CO';

  // ── State ─────────────────────────────────────────────────
  var _pendingJsonData = null;      // parsed JSON from selected file
  var _pendingMapped   = null;      // mapped products ready to import
  var _pendingProcessed = null;     // processed products after import (for download)
  var _fileInput       = null;      // hidden file input inside dropzone
  var _pendingFileText = null;      // raw JSON text of selected file (for GitHub upload)

  // ── DOM helpers ───────────────────────────────────────────
  function $(id) { return document.getElementById(id); }

  // ── Build & inject the trigger button ────────────────────
  function renderCatalogImporterButton() {
    var toolbar = document.querySelector('#panel-c .ctoolbar');
    if (!toolbar) return;
    if ($('ci-import-trigger')) return; // already injected

    var btn = document.createElement('button');
    btn.id = 'ci-import-trigger';
    btn.className = 'ci-import-btn';
    btn.title = 'Importar catálogo desde JSON del parser PDF';
    btn.innerHTML = 'Importar Catálogo JSON';
    btn.addEventListener('click', openImportModal);
    toolbar.appendChild(btn);
  }

  // ── Build modal HTML ──────────────────────────────────────
  function buildModal() {
    if ($('ci-overlay')) return; // already built

    var overlay = document.createElement('div');
    overlay.id = 'ci-overlay';
    overlay.className = 'ci-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ci-modal-title');

    // Close overlay on backdrop click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeImportModal();
    });

    overlay.innerHTML = [
      '<div class="ci-modal">',
        '<div class="ci-modal-header">',
          '<span class="ci-modal-title" id="ci-modal-title">',
            'Importar Catálogo JSON',
          '</span>',
          '<button class="ci-close-btn" id="ci-close-btn" title="Cerrar" aria-label="Cerrar">&#215;</button>',
        '</div>',

        // Target selector (Store / Lago)
        '<div class="ci-target-row" id="ci-target-row">',
          '<span class="ci-target-label">Destino:</span>',
          '<label class="ci-target-opt"><input type="radio" name="ci-target" value="store" checked> Store</label>',
          '<label class="ci-target-opt"><input type="radio" name="ci-target" value="lago"> Lago</label>',
        '</div>',

        // Dropzone
        '<div class="ci-dropzone" id="ci-dropzone">',
          '<span class="ci-dropzone-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>',
          '<div>Arrastra un archivo <strong>.json</strong> aquí</div>',
          '<div class="ci-dropzone-hint">o haz clic para seleccionar</div>',
          '<input type="file" accept=".json" id="ci-file-input" aria-label="Seleccionar archivo JSON de catálogo">',
        '</div>',

        // Status
        '<div class="ci-status" id="ci-status">Esperando archivo...</div>',

        // Summary (hidden until file selected)
        '<div class="ci-summary" id="ci-summary">',
          '<div class="ci-summary-headline" id="ci-summary-headline"></div>',
          '<div class="ci-summary-meta" id="ci-summary-meta"></div>',
          '<div class="ci-summary-note">Los precios en COP se convertirán automáticamente a miles de COP</div>',
          '<div id="ci-cat-wrap"></div>',
        '</div>',

        // GitHub upload section (hidden until import done)
        '<div class="ci-gh-section" id="ci-gh-section">',
          '<div class="ci-gh-title">' + icon('upload', 'ico-sm') + ' Subir a GitHub <span style="font-size:10px;color:#64748b;font-weight:400">(opcional)</span></div>',
          '<div class="ci-gh-row">',
            '<label class="ci-gh-label" for="ci-gh-token">Token PAT</label>',
            '<div class="ci-gh-token-wrap">',
              '<input class="ci-gh-input" type="password" id="ci-gh-token" placeholder="ghp_..." autocomplete="off">',
              '<button class="ci-gh-toggle-token" id="ci-gh-toggle-token" type="button" title="Mostrar/ocultar token">' + icon('eye', 'ico-sm') + '</button>',
            '</div>',
            '<label class="ci-gh-save-label"><input type="checkbox" id="ci-gh-save-token"> Recordar mientras la página esté abierta</label>',
          '</div>',
          '<div class="ci-gh-row">',
            '<label class="ci-gh-label" for="ci-gh-filename">Nombre de archivo</label>',
            '<input class="ci-gh-input" type="text" id="ci-gh-filename" value="catalog_store.json">',
          '</div>',
          '<div class="ci-gh-row ci-gh-row-action">',
            '<button class="ci-btn ci-btn-dl" id="ci-btn-dl">' + icon('download', 'ico-sm') + ' Descargar JSON</button>',
            '<button class="ci-btn ci-btn-upload" id="ci-btn-upload">' + icon('upload', 'ico-sm') + ' Subir a GitHub</button>',
            '<span class="ci-gh-status" id="ci-gh-status"></span>',
          '</div>',
        '</div>',

        // Action buttons
        '<div class="ci-actions">',
          '<button class="ci-btn ci-btn-cancel" id="ci-btn-cancel">Cancelar</button>',
          '<button class="ci-btn ci-btn-confirm" id="ci-btn-confirm" disabled>Confirmar importación</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    // Wire up events
    $('ci-close-btn').addEventListener('click', closeImportModal);
    $('ci-btn-cancel').addEventListener('click', closeImportModal);
    $('ci-btn-confirm').addEventListener('click', confirmImport);

    _fileInput = $('ci-file-input');
    _fileInput.addEventListener('change', function () {
      if (_fileInput.files && _fileInput.files[0]) handleFile(_fileInput.files[0]);
    });

    var dz = $('ci-dropzone');
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('drag-over');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });

    // Wire up GitHub upload section events
    $('ci-btn-upload').addEventListener('click', handleGitHubUpload);
    $('ci-btn-dl').addEventListener('click', handleDownload);
    $('ci-gh-toggle-token').addEventListener('click', function () {
      var inp = $('ci-gh-token');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    // Update filename default when target changes
    var targetRadios = overlay.querySelectorAll('input[name="ci-target"]');
    for (var i = 0; i < targetRadios.length; i++) {
      targetRadios[i].addEventListener('change', _updateFilenameForTarget);
    }
    // Mark filename as user-edited when manually changed
    $('ci-gh-filename').addEventListener('input', function () {
      this._userEdited = true;
    });
    // Pre-fill saved token
    var savedToken = _getSavedToken();
    if (savedToken) {
      $('ci-gh-token').value = savedToken;
      $('ci-gh-save-token').checked = true;
    }
  }

  // ── Open / close modal ────────────────────────────────────
  function openImportModal() {
    buildModal();
    resetModal();
    $('ci-overlay').classList.add('on');
  }

  function closeImportModal() {
    var overlay = $('ci-overlay');
    if (overlay) overlay.classList.remove('on');
    resetModal();
  }

  function resetModal() {
    _pendingJsonData  = null;
    _pendingMapped    = null;
    _pendingProcessed = null;
    _pendingFileText  = null;
    setStatus('Esperando archivo...', '');
    var summary = $('ci-summary');
    if (summary) summary.classList.remove('on');
    var confirm = $('ci-btn-confirm');
    if (confirm) { confirm.disabled = true; confirm.textContent = 'Confirmar importación'; confirm.classList.remove('done'); }
    if (_fileInput) _fileInput.value = '';
    var dz = $('ci-dropzone');
    if (dz) dz.classList.remove('drag-over');
    // Reset GitHub section
    var ghSection = $('ci-gh-section');
    if (ghSection) ghSection.classList.remove('on');
    var ghStatus = $('ci-gh-status');
    if (ghStatus) { ghStatus.textContent = ''; ghStatus.className = 'ci-gh-status'; }
    var uploadBtn = $('ci-btn-upload');
    if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = icon('upload', 'ico-sm') + ' Subir a GitHub'; }
    var dlBtn = $('ci-btn-dl');
    if (dlBtn) { dlBtn.disabled = false; dlBtn.innerHTML = icon('download', 'ico-sm') + ' Descargar JSON'; }
    // Reset target to store
    var storeRadio = document.querySelector('input[name="ci-target"][value="store"]');
    if (storeRadio) storeRadio.checked = true;
    var fnEl = $('ci-gh-filename');
    if (fnEl) fnEl._userEdited = false;
    _updateFilenameForTarget();
  }

  // ── Get selected import target ────────────────────────────
  function _getTarget() {
    var checked = document.querySelector('input[name="ci-target"]:checked');
    return checked ? checked.value : 'store';
  }

  // ── Update default filename based on selected target ──────
  function _updateFilenameForTarget() {
    var fnEl = $('ci-gh-filename');
    if (!fnEl) return;
    var target = _getTarget();
    if (!fnEl._userEdited) {
      fnEl.value = target === 'lago' ? 'catalog_lago.json' : 'catalog_store.json';
    }
  }

  // ── Status helper ─────────────────────────────────────────
  function setStatus(msg, type) {
    var el = $('ci-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'ci-status' + (type ? ' ' + type : '');
  }

  // ── File handling ─────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      setStatus('Solo se aceptan archivos .json', 'err');
      return;
    }

    setStatus('Analizando archivo...', '');
    var summary = $('ci-summary');
    if (summary) summary.classList.remove('on');
    var confirm = $('ci-btn-confirm');
    if (confirm) { confirm.disabled = true; confirm.classList.remove('done'); confirm.textContent = 'Confirmar importación'; }
    // Reset processed state when a new file is loaded
    _pendingProcessed = null;
    var ghSection = $('ci-gh-section');
    if (ghSection) ghSection.classList.remove('on');

    // Read raw text for potential GitHub upload
    var rawReader = new FileReader();
    rawReader.onload = function (e) { _pendingFileText = e.target.result; };
    rawReader.readAsText(file, 'UTF-8');

    // Auto-fill filename based on target (don't override if user already typed)
    var fnEl = $('ci-gh-filename');
    if (fnEl && !fnEl._userEdited) _updateFilenameForTarget();

    // Delegate to application layer (catalog-importer.js)
    importPdfCatalogFile(file, function onPreview(jsonData, mappedProducts) {
      _pendingJsonData = jsonData;
      _pendingMapped   = mappedProducts;
      showPreview(jsonData, mappedProducts);
    });
  }

  // ── Show preview summary ──────────────────────────────────
  function showPreview(jsonData, mappedProducts) {
    var totalProds = mappedProducts.length;
    var cats = jsonData.categories || [];
    var totalCats = cats.length;

    // Headline
    var hl = $('ci-summary-headline');
    if (hl) hl.textContent = totalProds + ' productos en ' + totalCats + ' categorías';

    // Meta info
    var meta = $('ci-summary-meta');
    if (meta) {
      var parts = [];
      if (jsonData.source)   parts.push('Fuente: ' + jsonData.source);
      if (jsonData.parsedAt) {
        try {
          var d = new Date(jsonData.parsedAt);
          parts.push('Fecha: ' + (isNaN(d.getTime()) ? jsonData.parsedAt : d.toLocaleString('es-CO')));
        } catch (_) { parts.push('Fecha: ' + jsonData.parsedAt); }
      }
      if (jsonData.method)   parts.push('Método: ' + jsonData.method);
      meta.textContent = parts.join(' · ');
    }

    // Category table (show first 20 to keep UI manageable)
    var catWrap = $('ci-cat-wrap');
    if (catWrap) {
      var rows = '';
      var display = cats.slice(0, 20);
      for (var i = 0; i < display.length; i++) {
        var c = display[i];
        var count = c.count != null ? c.count : (Array.isArray(c.products) ? c.products.length : '?');
        rows += '<tr><td>' + _esc(c.name || '—') + '</td><td class="ci-ct-count">' + count + '</td></tr>';
      }
      if (cats.length > 20) {
        rows += '<tr><td colspan="2" style="color:#94a3b8;font-style:italic">... y ' + (cats.length - 20) + ' categorías más</td></tr>';
      }
      catWrap.innerHTML = rows
        ? '<table class="ci-cat-table"><thead><tr><th>Categoría</th><th style="text-align:right">Productos</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '';
    }

    // Show summary panel
    var summary = $('ci-summary');
    if (summary) summary.classList.add('on');

    setStatus('Listo para importar — ' + totalProds + ' productos encontrados', 'ok');

    // Enable confirm button
    var confirm = $('ci-btn-confirm');
    if (confirm) confirm.disabled = false;
  }

  // ── Confirm & execute import ──────────────────────────────
  function confirmImport() {
    if (!_pendingJsonData || !_pendingMapped) return;

    var target = _getTarget();
    var confirm = $('ci-btn-confirm');
    if (confirm) { confirm.disabled = true; confirm.textContent = 'Importando...'; }
    setStatus('Importando catálogo...', '');

    // Small timeout so UI updates before synchronous processing
    setTimeout(function () {
      _applyPdfCatalogImport(_pendingMapped, _pendingJsonData, function (count, catCount, processed) {
        _pendingProcessed = processed || _pendingMapped;
        setStatus('Importado: ' + count + ' productos (' + catCount + ' categorías)', 'ok');
        if (confirm) { confirm.textContent = 'Importado'; confirm.classList.add('done'); }

        // Update filename based on target and show GitHub upload section
        _updateFilenameForTarget();
        var ghSection = $('ci-gh-section');
        if (ghSection) ghSection.classList.add('on');
      }, target);
    }, 50);
  }

  // ── GitHub upload ─────────────────────────────────────────
  // El token ya no se guarda en localStorage: "Recordar" lo mantiene solo en
  // memoria mientras la página esté abierta. Ver _slGhToken en
  // infrastructure/github-upload.js para el porqué.
  function _getSavedToken() {
    return (typeof _slGhToken !== 'undefined') ? _slGhToken.get() : '';
  }

  function _saveToken(token) {
    if (typeof _slGhToken !== 'undefined') _slGhToken.set(token);
  }

  function _clearToken() {
    if (typeof _slGhToken !== 'undefined') _slGhToken.clear();
  }

  function setGhStatus(msg, type) {
    var el = $('ci-gh-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'ci-gh-status' + (type ? ' ' + type : '');
  }

  function handleGitHubUpload() {
    if (typeof uploadToGitHub !== 'function') {
      setGhStatus('Módulo de subida no disponible', 'err');
      return;
    }

    var target   = _getTarget();
    var ghDir    = target === 'lago' ? 'data/lago/' : 'data/store/';
    var token    = ($('ci-gh-token') && $('ci-gh-token').value || '').trim();
    var filename = ($('ci-gh-filename') && $('ci-gh-filename').value || '').trim() || (target === 'lago' ? 'catalog_lago.json' : 'catalog_store.json');
    var saveIt   = $('ci-gh-save-token') && $('ci-gh-save-token').checked;
    var content  = _pendingFileText;

    if (!token) {
      setGhStatus('Ingresa un token PAT de GitHub', 'err');
      return;
    }
    if (!content) {
      setGhStatus('No hay contenido de archivo para subir', 'err');
      return;
    }

    // Persist or clear token based on checkbox
    if (saveIt) {
      _saveToken(token);
    } else {
      _clearToken();
    }

    var uploadBtn = $('ci-btn-upload');
    if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Subiendo...'; }
    setGhStatus('Subiendo a GitHub...', '');

    var path = ghDir + filename;
    var today = new Date().toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    var label = target === 'lago' ? 'lago' : 'store';
    var commitMsg = 'Actualizar catálogo ' + label + ' via importador - ' + today;

    uploadToGitHub(token, GH_OWNER, GH_REPO, path, content, commitMsg)
      .then(function (result) {
        if (result.ok) {
          setGhStatus('Subido a GitHub: ' + path, 'ok');
          showToast('Catálogo subido a GitHub (' + path + ')', 'success');
          if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = 'Subido'; }
          _writeCatalogMeta(label);
          // Auto-close after success
          setTimeout(closeImportModal, 2000);
        } else {
          setGhStatus('Error al subir: ' + result.error, 'err');
          if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = icon('upload', 'ico-sm') + ' Reintentar'; }
        }
      });
  }

  // ── Download flat JSON ────────────────────────────────────
  function handleDownload() {
    var products = _pendingProcessed || _pendingMapped;
    if (!products || !products.length) {
      setGhStatus('Importa el catálogo primero', 'err');
      return;
    }
    var target   = _getTarget();
    var filename = ($('ci-gh-filename') && $('ci-gh-filename').value || '').trim() || (target === 'lago' ? 'catalog_lago.json' : 'catalog_store.json');
    if (typeof generateCatalogDownload === 'function') {
      generateCatalogDownload(products, filename);
    }
  }

  // ── Tiny HTML-escape helper ───────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Auto-init on DOMContentLoaded ────────────────────────
  function init() {
    renderCatalogImporterButton();
    buildModal();
    window.openImportModal = openImportModal;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
