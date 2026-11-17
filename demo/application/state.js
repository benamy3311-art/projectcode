// STATE LAYER - Centralized reactive state + dispatch

let CATALOG = []; // Cargado desde catalog_store.json

var _state = {
  filtered: CATALOG.slice(),
  items: [],
  discountOn: false,
  discountPct: 2,
  reteOn: false,
  showIvaInQuote: true,
  billingFmt: 'siigo',
  cmpA: null,
  cmpB: null,
  catalogLago: [],
  activePriceList: 'store',
  scanResults: [],
  extBulkRate: 19,
  billingBreakdowns: {},
  currentQuoteId: null,   // id estable de la cotización en edición — dedup del historial
  incluyeEnvio: false,    // toggle de envío en la cotización (default: no incluye)
  quoteClosed: false,     // true tras exportar/enviar → el próximo producto inicia una nueva
  empresaMode: false,     // documento A4 corporativo en vez del de pantalla (ui/empresas.js)
  empresaCliente: {}      // razón social / NIT / contacto del cliente, para el A4
};
var _refreshQueued = false;
var REACTIVE_KEYS = new Set(['discountOn', 'discountPct', 'reteOn', 'showIvaInQuote']);
function _scheduleQuoteRefresh() {
  if (_refreshQueued) return;
  _refreshQueued = true;
  Promise.resolve().then(function () {
    _refreshQueued = false;
    if (document.getElementById('quoteDoc')) generateQuote(true);
  });
}
/** Notifica que hubo un cambio que requiere re-render de cotización. */
function notifyQuote() { _scheduleQuoteRefresh(); }

var AppState = new Proxy(_state, {
  set: function (target, key, value) {
    target[key] = value;
    if (REACTIVE_KEYS.has(key)) _scheduleQuoteRefresh();
    return true;
  }
});

// Aliases de conveniencia para arrays/objetos (referencia directa, no copia)
var filtered = AppState.filtered;
var items = AppState.items;

// ============================================================
// LECTURA DE ESTADO REACTIVO — SIEMPRE leer desde _state
// Elimina las variables-sombra. Una sola fuente de verdad.
// ============================================================
// Getter helpers — usar estos en vez de variables sueltas:
//   S.discountOn, S.discountPct, S.reteOn, S.showIvaInQuote, S.billingFmt
// Escritura: setState('key', value)
// ============================================================
var S = _state; // alias corto para lectura

function setState(key, value) {
  AppState[key] = value; // dispara el Proxy → re-render si es REACTIVE_KEY
}

/** Genera un id único que identifica una cotización a lo largo de toda su vida. */
function newQuoteId() { return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ============================================================
// SECCIÓN: DISPATCH — MUTACIONES CENTRALIZADAS DE ITEMS
// Toda modificación al array items pasa por aquí.
// dispatch() auto-llama renderItems + liveUpdate + notifyQuote
// después de cada acción. Nunca hace falta llamarlos manual.
// ============================================================
function dispatch(action) {
  var _skipRender = false;
  var _skipLive = false;

  switch (action.type) {

    case 'ADD': {
      // Identidad de la cotización: cada carrito que arranca define una cotización distinta.
      if (S.quoteClosed) {
        // La anterior ya se exportó/envió y quedó guardada → empezar una nueva, limpia.
        beginNewQuoteAfterSend();
      } else if (items.length === 0) {
        // Carrito vacío → cotización nueva con id propio (no pisa a la anterior en el historial).
        setState('currentQuoteId', newQuoteId());
      }
      var incomingSource = getItemSource(action.item);
      for (var i = 0; i < items.length; i++) {
        if (items[i].sku === action.item.sku && items[i].name === action.item.name && getItemSource(items[i]) === incomingSource) {
          if (!items[i].source) items[i].source = incomingSource;
          items[i].qty += (action.item.qty || 1);
          break;
        }
      }
      if (i === items.length) {
        action.item.source = incomingSource;
        items.push(action.item);
      }
      break;
    }

    case 'REMOVE': {
      items.splice(action.index, 1);
      break;
    }

    case 'UPDATE_QTY': {
      var newQty;
      if (typeof action.value === 'number') {
        newQty = Math.max(1, Math.floor(action.value));
      } else {
        newQty = Math.max(1, items[action.index].qty + (action.delta || 0));
      }
      items[action.index].qty = newQty;
      // Micro-optimización: solo actualizar los 2 nodos que cambian
      var iqEl = document.getElementById('iq-' + action.index);
      var ipEl = document.getElementById('ip-' + action.index);
      if (iqEl) {
        var s = String(newQty);
        if (iqEl.tagName === 'INPUT') {
          // Solo sobrescribir si el valor del DOM difiere (evita brincar el cursor mientras se escribe)
          if (iqEl.value !== s) iqEl.value = s;
        } else {
          iqEl.textContent = s;
        }
      }
      if (ipEl) {
        var priceStr = fmtCOP(applyDisc(items[action.index].price) * 1000 * newQty);
        // Conservar el ícono ✏ si existe
        var ico = ipEl.querySelector('.item-price-edit-ico');
        if (ico) ipEl.innerHTML = priceStr + '<span class="item-price-edit-ico">' + icon('edit', 'ico-xs') + '</span>';
        else ipEl.textContent = priceStr;
      }
      _skipRender = true; // no reconstruir toda la lista
      break;
    }

    case 'UPDATE_PRICE': {
      items[action.index].price = action.price;
      break;
    }

    case 'UPDATE_NAME': {
      items[action.index].name = action.name;
      // Update category based on new name
      items[action.index]._cat = getCat(action.name);
      break;
    }

    case 'UPDATE_IVA': {
      items[action.index].iva = !items[action.index].iva;
      break;
    }

    case 'UPDATE_NOTE': {
      items[action.index].note = action.note;
      _skipRender = true;
      _skipLive = true;
      break;
    }

    case 'UPDATE_CAT': {
      items[action.index]._cat = action.cat;
      var cp = document.getElementById('catPopup');
      if (cp) cp.classList.remove('on');
      break;
    }

    case 'TOGGLE_COMPONENTS': {
      if (items[action.index]) items[action.index]._showComponents = action.open;
      _skipLive = true;
      break;
    }

    case 'CLEAR': {
      items.length = 0;
      break;
    }

    case 'LOAD': {
      var loadSource = normListSource(action.listSource || S.activePriceList);
      items.length = 0;
      action.newItems.forEach(function (it) {
        if (!it) return;
        it.source = getItemSource(it, loadSource);
        items.push(it);
      });
      break;
    }

    case 'SWAP': {
      var oldItem = items[action.index];
      if (!oldItem) break;
      var keepQty = oldItem.qty;
      var swapCat = action.item._cat || getCat(action.item.name) || 'ADICIONAL';
      items[action.index] = {
        sku:    action.item.sku,
        name:   action.item.name,
        price:  action.item.price,
        qty:    keepQty,
        _cat:   swapCat,
        note:   '',
        iva:    (swapCat === 'PORTÁTIL' ? false : true),
        source: action.item.source || action.item._listSource || S.activePriceList
      };
      break;
    }
  }

  // ── Auto-render después de TODA acción ──
  if (!_skipRender) renderItems();
  if (!_skipLive) liveUpdate();
  notifyQuote();

  // ── Auto-save del carrito ──────────────────────────────────
  // Cuando quoteDoc ya está en el DOM, generateQuote(true) se encarga
  // de guardar vía su propio debounce.  Pero si el usuario solo trabaja
  // desde la pestaña de catálogo y nunca abre la cotización, quoteDoc
  // no existe y no se dispara generateQuote.  En ese caso guardamos
  // directamente aquí con debounce para no perder el carrito.
  var SAVE_ACTIONS = { ADD: 1, REMOVE: 1, UPDATE_QTY: 1, UPDATE_PRICE: 1, UPDATE_NAME: 1, LOAD: 1, SWAP: 1 };
  if (SAVE_ACTIONS[action.type] && items.length && !document.getElementById('quoteDoc')) {
    clearTimeout(dispatch._autoSaveTimer);
    dispatch._autoSaveTimer = setTimeout(function () {
      // El carrito pudo vaciarse mientras este guardado esperaba en cola
      // (Limpiar todo / Nueva cotización): no escribir una entrada vacía.
      if (!items.length) return;
      if (!S.currentQuoteId) setState('currentQuoteId', newQuoteId());
      var now = new Date();
      var today = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      var timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      var numCot = (document.getElementById('numCot') || {}).value || '';
      var asesor = (document.getElementById('asesor') || {}).value || '';
      var calc = calcEngine();
      var entry = {
        id: S.currentQuoteId, num: numCot, cliente: (document.getElementById('cliente') || {}).value || '',
        asesor: asesor, total: calc.totalConIva, date: today, time: timeStr,
        items: slimHistItems(items),
        priceList: (function () { var cs = getCartListSource(); return cs === 'mixed' ? normListSource(S.activePriceList) : normListSource(cs || S.activePriceList); })(),
        wa: (document.getElementById('whatsapp') || {}).value || '',
        validez: (document.getElementById('validez') || {}).value || '',
        garantia: (document.getElementById('garantia') || {}).value || '12 meses',
        notas: (document.getElementById('notasCot') || {}).value || '',
        reteOn: S.reteOn, discountOn: S.discountOn, discountPct: S.discountPct, showIva: S.showIvaInQuote
      };
      saveHist(entry);
      updateHistBadge();
    }, 2000);
  }
}

// --- Cart source validation ---
function getItemSource(it, fallback) {
  return normListSource((it && (it.source || it._listSource)) || fallback || S.activePriceList || 'store');
}
function getCartListSource() {
  if (!items.length) return null;
  var first = getItemSource(items[0], S.activePriceList);
  for (var i = 1; i < items.length; i++) {
    if (getItemSource(items[i], first) !== first) return 'mixed';
  }
  return first;
}
function ensureCartSourceAllowed(nextSource, opts) {
  opts = opts || {};
  var cartSrc = getCartListSource();
  var nextSrc = normListSource(nextSource);
  if (!cartSrc) return true;
  if (cartSrc === 'mixed') {
    if (!opts.silent) showToast('Carrito con mezcla Store/Lago detectada. Limpia o carga una cotización antes de continuar.', 'warn');
    return false;
  }
  if (cartSrc !== nextSrc) {
    if (!opts.silent) showToast('Carrito en ' + listSourceLabel(cartSrc) + '. No se puede mezclar con ' + listSourceLabel(nextSrc) + '.', 'warn');
    return false;
  }
  return true;
}
function getHistPriceList(h) {
  return normListSource((h && h.priceList) || (h && h.items && h.items[0] && h.items[0].source) || S.activePriceList || 'store');
}
function mapHistItems(h) {
  var fallback = getHistPriceList(h);
  return (h.items || []).map(function (it) {
    var o = {
      sku: it.sku,
      name: it.name,
      price: it.price, // miles COP (invariante)
      qty: it.qty,
      _cat: it._cat || null,
      note: it.note || '',
      iva: it.iva !== undefined ? it.iva : true,
      source: getItemSource(it, fallback)
    };
    // Restaurar las ediciones manuales del desglose (ver slimHistItems)
    if (it._comboEdits) o._comboEdits = it._comboEdits;
    if (it._showComponents) o._showComponents = true;
    return o;
  });
}
function hasMixedSources(arr) {
  if (!arr || !arr.length) return false;
  var first = getItemSource(arr[0], S.activePriceList);
  for (var i = 1; i < arr.length; i++) {
    if (getItemSource(arr[i], first) !== first) return true;
  }
  return false;
}
