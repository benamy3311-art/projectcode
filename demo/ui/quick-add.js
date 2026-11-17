// ============================================================
// BÚSQUEDA RÁPIDA Y ADICIÓN DE PRODUCTOS (+)
// ============================================================
// Comparte exactamente la misma interfaz gráfica, componentes (UI)
// y experiencia de usuario (UX) que la función "Reemplazar producto"
// (swap-picker): categorías en pills, buscador unificado, navega por
// teclado (↑↓, Enter, Esc) y lista agrupada.
//
// Globales expuestos:
//   openQuickAddModal()        — Abre la ventana de adición rápida
//   closeQuickAddModal()       — Cierra la ventana
//   filterQuickAddPicker()     — Filtra productos
//   quickAddSelectProduct(i)   — Añade el producto i a la cotización
//   _quickAddSetCat(cat)       — Filtra por categoría activa
//   _quickAddKeydown(e)        — Soporte de navegación por teclado
//   _quickAddClearSearch()     — Limpia el campo de texto
// ============================================================

(function () {
  var _quickAddFiltered = [];
  var _quickAddActiveCat = '';
  var _quickAddHighlight = 0;

  function _getQuickAddCatalogSource() {
    return (typeof S !== 'undefined' && S.activePriceList === 'lago')
      ? (S.catalogLago || [])
      : (typeof CATALOG !== 'undefined' ? CATALOG : []);
  }

  function openQuickAddModal() {
    var ov = document.getElementById('quickAddOv');
    if (!ov) return;

    _quickAddActiveCat = '';
    _renderQuickAddCatPills();

    var si = document.getElementById('quickAddSearch');
    if (si) { si.value = ''; }

    _filterAndRenderQuickAdd();

    ov.classList.add('on');
    setTimeout(function () { if (si) si.focus(); }, 220);
  }

  function closeQuickAddModal() {
    var ov = document.getElementById('quickAddOv');
    if (ov) ov.classList.remove('on');
    _quickAddFiltered = [];
  }

  function _renderQuickAddCatPills() {
    var wrap = document.getElementById('quickAddCatPills');
    if (!wrap) return;

    var src = _getQuickAddCatalogSource();
    var catSet = {};
    for (var i = 0; i < src.length; i++) {
      var c = src[i]._cat || 'ADICIONAL';
      if (!catSet[c]) catSet[c] = 0;
      catSet[c]++;
    }
    var catOrdFn = typeof catOrd === 'function' ? catOrd : function () { return 0; };
    var escFn = typeof esc === 'function' ? esc : function (s) { return s; };

    var cats = Object.keys(catSet).sort(function (a, b) { return catOrdFn(a) - catOrdFn(b); });

    var h = '<button class="swap-cat-pill' + (!_quickAddActiveCat ? ' active' : '') + '" onclick="_quickAddSetCat(\'\')">Todas <span class="swap-cat-count">' + src.length + '</span></button>';
    for (var j = 0; j < cats.length; j++) {
      var cat = cats[j];
      var isActive = (_quickAddActiveCat === cat);
      h += '<button class="swap-cat-pill' + (isActive ? ' active' : '') + '" onclick="_quickAddSetCat(\'' + escFn(cat).replace(/'/g, "\\'") + '\')">' + escFn(cat) + '<span class="swap-cat-count">' + catSet[cat] + '</span></button>';
    }
    wrap.innerHTML = h;

    if (_quickAddActiveCat) {
      setTimeout(function () {
        var active = wrap.querySelector('.swap-cat-pill.active');
        if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }

  function _quickAddSetCat(cat) {
    _quickAddActiveCat = cat;
    _renderQuickAddCatPills();
    _filterAndRenderQuickAdd();
  }

  function filterQuickAddPicker() {
    _filterAndRenderQuickAdd();
  }

  function _filterAndRenderQuickAdd() {
    var src = _getQuickAddCatalogSource();
    var q = (document.getElementById('quickAddSearch') || {}).value || '';
    q = q.toLowerCase().trim();
    var catOrdFn = typeof catOrd === 'function' ? catOrd : function () { return 0; };

    _quickAddFiltered = src.filter(function (p) {
      var pName = p.name ? p.name.toLowerCase() : '';
      var pSku = p.sku != null ? String(p.sku).toLowerCase() : '';
      var matchQ = !q || pName.includes(q) || pSku.includes(q);
      if (!matchQ) return false;
      if (q) return true;
      var pCat = p._cat || 'ADICIONAL';
      return !_quickAddActiveCat || pCat === _quickAddActiveCat;
    });

    _quickAddFiltered.sort(function (a, b) {
      if (q && _quickAddActiveCat) {
        var aOwn = (a._cat || 'ADICIONAL') === _quickAddActiveCat;
        var bOwn = (b._cat || 'ADICIONAL') === _quickAddActiveCat;
        if (aOwn !== bOwn) return aOwn ? -1 : 1;
      }
      return catOrdFn(a._cat) - catOrdFn(b._cat);
    });

    _quickAddHighlight = 0;
    var clr = document.getElementById('quickAddClear');
    if (clr) clr.hidden = !q;

    _renderQuickAddList();
  }

  function _renderQuickAddList() {
    var list = document.getElementById('quickAddList');
    var countEl = document.getElementById('quickAddCount');
    if (!list) return;

    if (countEl) countEl.textContent = _quickAddFiltered.length + ' productos';

    if (!_quickAddFiltered.length) {
      list.innerHTML = '<div class="swap-empty"><svg class="swap-empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><div>Sin resultados</div><div style="font-size:11px;margin-top:4px">Prueba con otro término o categoría</div></div>';
      return;
    }

    var q = (document.getElementById('quickAddSearch') || {}).value || '';
    q = q.trim();
    var escFn = typeof esc === 'function' ? esc : function (s) { return s; };
    var catOrdFn = typeof catOrd === 'function' ? catOrd : function () { return 0; };

    var grouped = {};
    for (var i = 0; i < _quickAddFiltered.length; i++) {
      var p = _quickAddFiltered[i], key = p._cat || 'ADICIONAL';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ product: p, filteredIdx: i });
    }

    var CHEVRON = '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>';

    var h = '', cats = Object.keys(grouped).sort(function (a, b) {
      if (q && _quickAddActiveCat) {
        var aOwn = a === _quickAddActiveCat, bOwn = b === _quickAddActiveCat;
        if (aOwn !== bOwn) return aOwn ? -1 : 1;
      }
      return catOrdFn(a) - catOrdFn(b);
    });

    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c], prods = grouped[cat];
      if (cats.length > 1) {
        h += '<div class="swap-sec-hdr">' + escFn(cat) + ' &middot; ' + prods.length + '</div>';
      }
      for (var j = 0; j < prods.length; j++) {
        var pp = prods[j].product, idx = prods[j].filteredIdx;
        var finalPrice = (pp.price * 1000);
        if (typeof applyDisc === 'function') {
          finalPrice = applyDisc(pp.price) * 1000;
        }

        h += '<div class="swap-row' + (idx === _quickAddHighlight ? ' swap-row-hl' : '') + '" data-qa-idx="' + idx + '" onclick="quickAddSelectProduct(' + idx + ')">';
        h += '  <div class="swap-row-main">';
        h += '    <div class="swap-row-name" title="' + escFn(pp.name) + '">' + escFn(pp.name) + '</div>';
        h += '    <div class="swap-row-sku">' + escFn(String(pp.sku)) + '</div>';
        h += '  </div>';
        h += '  <div class="swap-row-pricing"><span class="swap-row-price">$' + finalPrice.toLocaleString('es-CO') + '</span></div>';
        h += '  <span class="swap-row-go">' + CHEVRON + '</span>';
        h += '</div>';
      }
    }
    list.innerHTML = h;
  }

  function quickAddSelectProduct(filteredIdx) {
    var p = _quickAddFiltered[filteredIdx];
    if (!p) return;

    if (typeof addItem === 'function') {
      var added = addItem({
        sku: p.sku,
        name: p.name,
        price: p.price,
        qty: 1,
        _cat: p._cat || p.cat,
        _listSource: p._listSource || (typeof S !== 'undefined' ? S.activePriceList : 'store')
      });

      if (added && typeof showToast === 'function') {
        showToast('Agregado: ' + p.name.slice(0, 35), 'success', null, 2000);
      }
    }
  }

  function _quickAddKeydown(e) {
    var n = _quickAddFiltered.length;
    if (e.key === 'Escape') { e.preventDefault(); closeQuickAddModal(); return; }
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); _quickAddHighlight = Math.min(n - 1, _quickAddHighlight + 1); _quickAddUpdateHighlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _quickAddHighlight = Math.max(0, _quickAddHighlight - 1); _quickAddUpdateHighlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); quickAddSelectProduct(_quickAddHighlight); }
  }

  function _quickAddUpdateHighlight() {
    var list = document.getElementById('quickAddList');
    if (!list) return;
    var rows = list.querySelectorAll('.swap-row');
    for (var i = 0; i < rows.length; i++) {
      var on = Number(rows[i].getAttribute('data-qa-idx')) === _quickAddHighlight;
      rows[i].classList.toggle('swap-row-hl', on);
      if (on) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }

  function _quickAddClearSearch() {
    var si = document.getElementById('quickAddSearch');
    if (si) { si.value = ''; si.focus(); }
    _filterAndRenderQuickAdd();
  }

  window.openQuickAddModal = openQuickAddModal;
  window.closeQuickAddModal = closeQuickAddModal;
  window.filterQuickAddPicker = filterQuickAddPicker;
  window.quickAddSelectProduct = quickAddSelectProduct;
  window._quickAddSetCat = _quickAddSetCat;
  window._quickAddKeydown = _quickAddKeydown;
  window._quickAddClearSearch = _quickAddClearSearch;
})();
