// UI LAYER - DOM rendering, event handlers, navigation

function switchTab(t) {
  var _protectedTabs = ['pdf', 'admin', 'metrics', 'cuadre', 'adminhub'];
  if (_protectedTabs.indexOf(t) >= 0) {
    var _u = window._slAuth && window._slAuth.currentUser;
    var _em = _u ? (_u.email || '').toLowerCase().trim() : '';
    var isAdmin = _em && window.ADMIN_EMAILS && window.ADMIN_EMAILS.indexOf(_em) >= 0;
    var isAllowedLite = (t === 'pdf' && (window._slUserIsLite || document.body.classList.contains('custom-catalog-active')));
    var isPremium = !!window._slUserIsPremium || document.body.classList.contains('premium-user');
    var isAllowedPremium = (t === 'cuadre' && isPremium); // Cuadre de Caja: PRO + admin
    // 'adminhub' (Parser PDF + Usuarios + Métricas), 'admin' y 'metrics' son exclusivos de admin
    if (!isAdmin && !isAllowedLite && !isAllowedPremium) return;
  }
  ['q', 'c', 'ven', 'inv', 'i', 'cmp', 'rem', 'pdf', 'admin', 'metrics', 'cuadre', 'cambios'].forEach(function (id) {
    let tab = document.getElementById('tab-' + id);
    let panel = document.getElementById('panel-' + id);
    if (tab) tab.classList.toggle('active', id === t);
    if (!panel) return;
    if (id !== t) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'flex';
    }
  });
  // Vender e Inventario se arman la primera vez que se abren (abren la base local).
  if (t === 'ven' && window.TiendaVender) TiendaVender.montar();
  if (t === 'inv' && window.TiendaInventario) TiendaInventario.montar();
  // Hub de Administración: una sola pestaña que agrupa Parser PDF, Usuarios y Métricas.
  var hubTab = document.getElementById('tab-adminhub');
  var subnav = document.getElementById('adminSubnav');
  if (t === 'adminhub') {
    if (hubTab) hubTab.classList.add('active');
    if (subnav) subnav.style.display = 'flex';
    showAdminSub(window._adminSub || 'pdf');
  } else {
    if (hubTab) hubTab.classList.remove('active');
    if (subnav) subnav.style.display = 'none';
  }
}

// Muestra una de las 3 secciones dentro del hub de Administración (Parser PDF · Usuarios · Métricas).
function showAdminSub(which) {
  var map = { pdf: 'panel-pdf', usuarios: 'panel-admin', metrics: 'panel-metrics' };
  if (!map[which]) which = 'pdf';
  window._adminSub = which;
  Object.keys(map).forEach(function (k) {
    var p = document.getElementById(map[k]);
    if (p) p.style.display = (k === which) ? 'flex' : 'none';
  });
  var subBtns = document.querySelectorAll('#adminSubnav .admin-sub');
  for (var i = 0; i < subBtns.length; i++) {
    subBtns[i].classList.toggle('active', subBtns[i].getAttribute('data-sub') === which);
  }
  if (which === 'metrics' && typeof _mountMetricsPanel === 'function') _mountMetricsPanel();
}
window.showAdminSub = showAdminSub;

// Pestaña "SIIGO": abre la facturación en una pestaña nueva del navegador.
// No se puede incrustar en un iframe porque SIIGO envía la cabecera CSP
// `frame-ancestors`, que solo permite incrustarlo desde dominios de siigo.com.
// Por eso se abre en una ventana aparte, para todos los usuarios.
var SIIGO_URL = 'https://siigonube.siigo.com/#/invoice/824?TabID=1786';
function openSiigo() {
  window.open(SIIGO_URL, '_blank', 'noopener');
}
window.openSiigo = openSiigo;

// Carga diferida del iframe del Cuadre de Caja (solo en el primer acceso)
function _mountCuadre() {
  var f = document.getElementById('cuadreFrame');
  if (f && !f.getAttribute('src')) f.setAttribute('src', 'cuadre.html');
}
window._mountCuadre = _mountCuadre;

function showCatalogBanner() {
  var b = document.getElementById("catalogBanner");
  if (b) b.style.display = "flex";
}
function hideCatalogBanner() {
  var b = document.getElementById("catalogBanner");
  if (b) b.style.display = "none";
}

// --- Sync UI from state ---
// ============================================================
// renderUI() — Sincroniza TODA la UI de controles desde el estado.
// Llamar después de cualquier cambio batch (ej: cargar historial).
// Para cambios individuales, setState + Proxy ya regenera la cotización.
// ============================================================
function renderUI() {
  // Discount
  var btnDisc = document.getElementById('btnDisc');
  if (btnDisc) btnDisc.classList.toggle('on', S.discountOn);
  var discInp = document.getElementById('discPct');
  if (discInp) discInp.value = S.discountPct;
  updateDiscLabel();

  // Retefuente
  var btnRete = document.getElementById('btnRete');
  if (btnRete) {
    btnRete.classList.toggle('on', S.reteOn);
    btnRete.innerHTML = S.reteOn
      ? icon('check', 'ico-sm') + ' Retefuente 2.5%'
      : '<span class="ico ico-sm"><svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="2"/><circle cx="15" cy="15" r="2"/><line x1="18" y1="6" x2="6" y2="18"/></svg></span> Retefuente 2.5%';
  }
  var retS = document.getElementById('reteSummary');
  if (retS) retS.style.display = S.reteOn ? 'block' : 'none';

  // Show IVA toggle
  var tg = document.getElementById('toggleShowIva');
  if (tg) tg.checked = S.showIvaInQuote;

  // Re-render items + totals
  renderItems();
  liveUpdate();
}

// --- Item list rendering ---
// ============================================================
// SECCIÓN: RENDERIZADO DE ITEMS / TABLA DE COTIZACIÓN
// ============================================================
function renderItems() {
  let el = document.getElementById('itemsList');
  document.getElementById('itemCount').textContent = items.length ? '(' + items.length + ')' : '';
  if (!items.length) { el.innerHTML = '<div class="items-empty empty-state">Añade del catálogo o pega tu lista arriba</div>'; return }
  let html = '';
  for (let i = 0; i < items.length; i++) {
    let item = items[i], cat = item._cat || getCat(item.name), cs = CAT_STYLE[cat] || 'cb-add';
    let price = applyDisc(item.price) * 1000 * item.qty, nd = item.note ? 'block' : 'none';
    let comboBtn = '', comboPanel = '';

    if (isEnsamblado(item)) {
      let comps = parseComboComponents(item.name, item._cat);
      if (comps && comps.length) {
        let wasOpen = !!item._showComponents;
        comboBtn = T.comboToggleBtn(i, wasOpen);
        let liItems = comps.map(function (c, ci) {
          let savedVal = (item._comboEdits && item._comboEdits[ci] !== undefined) ? item._comboEdits[ci] : c.value;
          return T.comboComponentLi(i, ci, c.label, savedVal);
        }).join('');
        comboPanel = T.comboPanelBlock(i, liItems, wasOpen);
      }
    }

    html += T.itemCard(i, item, cat, cs, price, nd, comboBtn, comboPanel);
  }
  el.innerHTML = html;
}

function changeQty(i, d) {
  dispatch({ type: 'UPDATE_QTY', index: i, delta: d });
}
function setQty(i, raw, commit) {
  // Solo dígitos
  var clean = String(raw == null ? '' : raw).replace(/[^\d]/g, '');
  // Mientras el usuario escribe y el campo está vacío, no toques el state — espera al blur
  if (clean === '' && !commit) return;
  var n = parseInt(clean, 10);
  if (isNaN(n) || n < 1) n = 1;
  dispatch({ type: 'UPDATE_QTY', index: i, value: n });
}
function removeItem(i) { dispatch({ type: 'REMOVE', index: i }); }
function toggleIva(i) { dispatch({ type: 'UPDATE_IVA', index: i }); }
function toggleNote(i) { let el = document.getElementById('note-' + i); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none' }

function liveUpdate() {
  var calc = calcEngine();
  document.getElementById('liveTotal').textContent = fmtCOP(calc.totalConIva);
  document.getElementById('liveCount').textContent = calc.totalRefs + ' ref. · ' + calc.totalUnits + ' u.';
  var summEl = document.getElementById('itemsSummary');
  if (summEl) {
    if (items.length) {
      summEl.style.display = 'flex';
      summEl.innerHTML = T.itemsSummaryPills(calc);
    } else { summEl.style.display = 'none'; }
  }
  if (S.reteOn) {
    var ra = document.getElementById('reteAmt'), rf = document.getElementById('reteFinal');
    if (ra) ra.textContent = '-' + fmtCOP(calc.reteAmount);
    if (rf) rf.textContent = fmtCOP(calc.netoAPagar);
  }
  if (typeof renderPcChecklist === 'function') renderPcChecklist();
}

function openCatPicker(i, el) {
  let pop = document.getElementById('catPopup'), h = '';
  let curCat = items[i] && (items[i]._cat || getCat(items[i].name));
  for (let c = 0; c < ALL_CATS.length; c++) h += '<div class="cat-opt' + (ALL_CATS[c] === curCat ? ' active' : '') + '" onclick="setCat(' + i + ',\'' + ALL_CATS[c] + '\')">' + ALL_CATS[c] + '</div>';
  pop.innerHTML = h;
  pop.classList.add('on'); // renderizar antes de medir alto real (13 categorías no siempre caben)
  let r = el.getBoundingClientRect();
  let popH = pop.offsetHeight, popW = pop.offsetWidth || 160;
  pop.style.left = Math.min(r.left, window.innerWidth - popW - 8) + 'px';
  // Si no cabe abajo, abrir hacia arriba en vez de dejarla cortada contra el borde de la ventana.
  let top = (r.bottom + 4 + popH <= window.innerHeight) ? (r.bottom + 4) : Math.max(8, r.top - popH - 4);
  pop.style.top = top + 'px';
  setTimeout(function () { document.addEventListener('click', function hh() { pop.classList.remove('on'); document.removeEventListener('click', hh) }) }, 0);
}
function setCat(i, cat) { dispatch({ type: 'UPDATE_CAT', index: i, cat: cat }); }

// --- Combo panel ---
function toggleComboPanel(i) {
  let el = document.getElementById('combo-panel-' + i);
  let btn = document.getElementById('combo-btn-' + i);
  if (!el || !btn) return;
  let open = el.classList.toggle('open');
  btn.classList.toggle('active', open);
  btn.querySelector('.ctb-arrow').textContent = open ? '\u25be' : '\u25b8';
  dispatch({ type: 'TOGGLE_COMPONENTS', index: i, open: open });
  notifyQuote();
}
function saveComboEdit(itemIdx, compIdx, el) {
  if (!items[itemIdx]._comboEdits) items[itemIdx]._comboEdits = {};
  items[itemIdx]._comboEdits[compIdx] = el.textContent;
}

document.addEventListener('click', function (e) { if (!e.target.closest('#skuAc') && !e.target.closest('#rawInput')) { var ac = document.getElementById('skuAc'); if (ac) ac.classList.remove('on'); } });

// --- Notifications ---
// showToast(msg, 'success'|'error'|'warn'|'info'|'neutral', _, ms) → variante
// semántica con ícono SVG. Compat: si el 2º argumento es un color (hex/css)
// se aplica inline como siempre — obligatorio para llamadas legacy
// (p. ej. firebase-auth.js, que carga en <head> antes que todo).
var TOAST_TYPES = { success: 'check', error: 'x', warn: 'alert', info: 'info', neutral: 'info' };
function showToast(msg, bg, color, durationMs) {
  let t = document.getElementById('toast');
  if (bg && TOAST_TYPES[bg]) {
    t.className = 'toast toast-' + bg;
    t.style.background = ''; t.style.color = '';
    // El msg puede traer datos del catálogo: siempre textContent, nunca HTML.
    t.innerHTML = (typeof icon === 'function' ? icon(TOAST_TYPES[bg]) : '') + '<span></span>';
    t.lastChild.textContent = msg;
  } else {
    t.className = 'toast';
    t.textContent = msg; t.style.background = bg || '#1e293b'; t.style.color = color || '#fff';
  }
  t.classList.add('on'); clearTimeout(t._to); t._to = setTimeout(function () { t.classList.remove('on') }, durationMs || 3000);
}

// --- Keyboard shortcuts ---

document.addEventListener('keydown', function (e) {
  // Cerrar swap picker con Escape
  if (e.key === 'Escape') {
    var swOv = document.getElementById('swapPickerOv');
    if (swOv && swOv.classList.contains('on')) { closeSwapPicker(); e.preventDefault(); return; }
  }
  if (e.metaKey || e.ctrlKey) {
    if (e.key === 'g') { e.preventDefault(); generateQuote(false) }
    if (e.key === 'k') { e.preventDefault(); switchTab('c') }
    if (e.key === 'h') { e.preventDefault(); openHist() }
  }
  // Shift+1..7: saltar directo a una pestaña, en el mismo orden en que
  // aparecen visualmente en la barra: Cotización·Catálogo·Calculadora IVA·
  // Recogidas·Cuadre de Caja·SIIGO·Admin. Se ignora si se está escribiendo en
  // un campo de texto (para no interferir con "!", "@", etc.).
  if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    var tag = (e.target && e.target.tagName) || '';
    var isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if (!isEditable) {
      var shiftTabs = { Digit1: 'q', Digit2: 'c', Digit3: 'i', Digit4: 'rem', Digit5: 'cuadre', Digit6: 'siigo', Digit7: 'adminhub' };
      var id = shiftTabs[e.code];
      if (id) {
        e.preventDefault();
        if (id === 'siigo') {
          if (typeof openSiigo === 'function') openSiigo();
        } else {
          switchTab(id);
          if (id === 'cuadre' && typeof _mountCuadre === 'function') _mountCuadre();
        }
      }
    }
  }
});


// --- Speedy mascot ---
function speedyHTML() {
  return '<div class="empty-st empty-state" style="height:100%;padding:40px 20px">' +
    '<div id="speedy-wrap">' +
      '<svg width="180" height="220" viewBox="-15 -5 230 235" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="visible">' +
        // Shadow
        '<ellipse cx="100" cy="210" rx="55" ry="8" fill="rgba(0,0,0,0.08)"/>' +
        // Body
        '<ellipse cx="100" cy="135" rx="58" ry="62" fill="#2563eb"/>' +
        '<ellipse cx="85" cy="112" rx="22" ry="18" fill="rgba(255,255,255,0.12)"/>' +
        // Feet
        '<ellipse cx="82" cy="193" rx="18" ry="10" fill="#1d4ed8"/>' +
        '<ellipse cx="118" cy="193" rx="18" ry="10" fill="#1d4ed8"/>' +
        // Left arm
        '<ellipse cx="48" cy="148" rx="12" ry="20" fill="#1d4ed8" transform="rotate(15, 48, 148)"/>' +
        // Head
        '<circle cx="100" cy="78" r="52" fill="#2563eb"/>' +
        '<circle cx="82" cy="58" r="16" fill="rgba(255,255,255,0.15)"/>' +
        // Lightning bolt
        '<g transform="translate(88, 14)">' +
          '<path d="M14 0 L6 13 L11 13 L4 26 L18 10 L12 10 Z" fill="#fbbf24" stroke="#f59e0b" stroke-width="0.5"/>' +
        '</g>' +
        // Visor
        '<rect x="62" y="56" width="76" height="46" rx="14" fill="#1e3a8a"/>' +
        '<rect x="66" y="59" width="28" height="8" rx="4" fill="rgba(255,255,255,0.2)"/>' +
        // Left eye
        '<g class="speedy-eye">' +
          '<circle cx="83" cy="82" r="13" fill="white"/>' +
          '<circle cx="86" cy="84" r="8" fill="#1e40af"/>' +
          '<circle cx="87" cy="82" r="4" fill="#0f172a"/>' +
          '<circle cx="90" cy="78" r="3" fill="white"/>' +
          '<circle cx="84" cy="85" r="1.5" fill="rgba(255,255,255,0.6)"/>' +
        '</g>' +
        // Right eye
        '<g class="speedy-eye speedy-eye-r">' +
          '<circle cx="117" cy="82" r="13" fill="white"/>' +
          '<circle cx="114" cy="84" r="8" fill="#1e40af"/>' +
          '<circle cx="115" cy="82" r="4" fill="#0f172a"/>' +
          '<circle cx="120" cy="78" r="3" fill="white"/>' +
          '<circle cx="112" cy="85" r="1.5" fill="rgba(255,255,255,0.6)"/>' +
        '</g>' +
        // Cheeks
        '<ellipse cx="68" cy="94" rx="9" ry="6" fill="rgba(251,113,133,0.55)"/>' +
        '<ellipse cx="132" cy="94" rx="9" ry="6" fill="rgba(251,113,133,0.55)"/>' +
        // Mouth
        '<path d="M 84 99 Q 100 112 116 99" stroke="white" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        // Right arm (waving)
        '<g class="speedy-arm-wave">' +
          '<ellipse cx="152" cy="130" rx="12" ry="20" fill="#1d4ed8" transform="rotate(-30, 152, 130)"/>' +
          '<circle cx="158" cy="114" r="9" fill="#2563eb"/>' +
        '</g>' +
      '</svg>'+
    '</div>' +
    '<p style="font-size:15px;font-weight:600;color:#374151;margin-top:16px;">\u00a1Bienvenido! \u00bfListo para cotizar?</p>' +
    '<p style="font-size:12px;color:#9ca3af;margin-top:4px;">Agrega productos del cat\u00e1logo o pega tu lista</p>' +
  '</div>';
}

// --- Init and clear ---
function initCounter() {
  let num = parseInt(_ls.get('lastQuoteNum', '0'), 10) || 0;
  document.getElementById('numCot').value = num + 1;
  setState('currentQuoteId', newQuoteId()); // arranca/limpia → cotización nueva con id propio
  setState('quoteClosed', false);
}
function clearAll() {
  // Cancelar los guardados en cola ANTES de vaciar: si disparan con el carrito
  // ya vacío escriben una cotización fantasma (0 productos) en el historial,
  // que además se sube a la nube y cuenta en las stats del vendedor.
  clearTimeout(generateQuote._saveTimer);
  clearTimeout(dispatch._autoSaveTimer);
  dispatch({ type: 'CLEAR' });
  setState('discountOn', false); setState('discountPct', 2);
  setState('reteOn', false); setState('incluyeEnvio', false);
  // Los datos de facturacion son del cliente anterior: arrastrarlos a la
  // siguiente cotizacion mandaria el NIT equivocado en el PDF.
  setState('empresaCliente', {});
  document.getElementById('cliente').value = '';
  document.getElementById('whatsapp').value = '';
  let nc = document.getElementById('notasCot'); if (nc) nc.value = '';
  renderUI();
  document.getElementById('qWrap').innerHTML = speedyHTML();
  initCounter();
}
function nuevaCotizacion() {
  showToast('Cotización guardada en historial', 'success');
  clearAll();
  switchTab('c');
}

// --- History panel UI ---
function updateHistBadge() { document.getElementById('histBadge').textContent = getHist().length }

// Badge \u00e1mbar de seguimientos pendientes en el bot\u00f3n Historial
function updateFollowBadge() {
  var b = document.getElementById('histFollowBadge');
  if (!b) return;
  var n = (typeof getFollowUps === 'function') ? getFollowUps().length : 0;
  if (n > 0) {
    b.textContent = n;
    b.style.display = 'inline-block';
    b.title = n + (n === 1 ? ' cotizaci\u00f3n espera' : ' cotizaciones esperan') + ' seguimiento';
  } else {
    b.style.display = 'none';
  }
}

/** ¿La sesión actual es de un super-admin? */
function _isAdminUser() {
  var u = window._slAuth && window._slAuth.currentUser;
  var em = u ? (u.email || '').toLowerCase().trim() : '';
  return !!em && window.SUPER_ADMINS && window.SUPER_ADMINS.indexOf(em) >= 0;
}

// Vista admin del historial: 'mios' (localStorage, editable) | 'todos'
// (one-shot a la nube, solo lectura, muestra el vendedor de cada cotización)
var _histAdminMode = 'mios';
var _histAllDocs = [];

async function setHistAdminMode(m) {
  _histAdminMode = m;
  var bm = document.getElementById('histAdmMios');
  var bt = document.getElementById('histAdmTodos');
  if (bm) bm.classList.toggle('active', m === 'mios');
  if (bt) bt.classList.toggle('active', m === 'todos');
  if (m === 'todos') {
    var el = document.getElementById('hlist');
    if (el) el.innerHTML = '<div class="hempty empty-state">Cargando cotizaciones del equipo…</div>';
    try {
      var docs = await _slQuotesSync.fetchAllVendors(200);
      _histAllDocs = docs.map(function (d) {
        return {
          email: d.email || '', id: d._id, num: d.num, cliente: d.cliente || '',
          asesor: d.asesor || '', letra: d.letra || '', total: d.total || 0, date: d.date || '', time: d.time || '',
          items: d.items || [], estado: d.estado || 'enviada',
          clienteTel: d.clienteTel || '', crmNotas: d.crmNotas || '',
          _piiLocked: !!d._piiLocked,
          estadoUpdatedAt: d.estadoUpdatedAt && d.estadoUpdatedAt.toMillis ? d.estadoUpdatedAt.toMillis() : null
        };
      });
    } catch (e) {
      console.warn('hist admin error:', e && (e.message || e.code));
      if (el) el.innerHTML = '<div class="hempty empty-state">Error al cargar — revisa las reglas de Firestore (user_quotes).</div>';
      return;
    }
  }
  renderHist();
}

function openHist() {
  // Defense-in-depth: el interceptor Lite cubre el click del botón, pero
  // Ctrl+H llega directo aquí — mismo destino: modal de upgrade.
  if (document.body.classList.contains('lite-user')) {
    if (typeof _openUpgradeModal === 'function') _openUpgradeModal();
    return;
  }
  var tg = document.getElementById('histAdminToggle');
  if (tg) tg.style.display = _isAdminUser() ? 'flex' : 'none';
  renderHist();
  document.getElementById('hpanel').classList.add('on');
  document.getElementById('overlay').classList.add('on');
}
/** Abre el historial directo en el filtro de seguimientos (badge / brief diario). */
function openHistSeguimiento() { _histFilter = 'seguimiento'; openHist(); }
function closeHist() { document.getElementById('hpanel').classList.remove('on'); document.getElementById('overlay').classList.remove('on') }

// "Actualizar cotización" (buscar por número y reabrir con precios de
// hoy) vive en ui/quote-update.js — ver ese archivo.

/** Muestra/oculta el editor de seguimiento de la entrada i. */
function toggleHistCrm(i) {
  var el = document.getElementById('hcrm-' + i);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function renderHist() {
  // No pisar el DOM si el usuario est\u00e1 escribiendo en un editor CRM
  // (el sync en tiempo real puede disparar re-renders en cualquier momento).
  var ae = document.activeElement;
  if (ae && ae.closest && ae.closest('.hcrm') && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;

  var teamMode = _histAdminMode === 'todos' && _isAdminUser();
  let hist = teamMode ? _histAllDocs.slice() : getHist();
  let el = document.getElementById('hlist');

  // Barra de filtros por estado (CRM)
  var estadoFilter = (typeof _histFilter !== 'undefined') ? _histFilter : 'todas';
  var fbar = document.getElementById('histCrmFilter');
  if (fbar && T.histFilterBar) {
    fbar.innerHTML = T.histFilterBar(estadoFilter, (typeof getFollowUps === 'function') ? getFollowUps().length : 0, teamMode);
  }

  // El \u00edndice original en cotHistory viaja en _origIdx: los botones de cada
  // card (Cargar/Duplicar/etc.) operan sobre getHist()[_origIdx] aunque la
  // lista est\u00e9 filtrada.
  hist = hist.map(function(x, i) { x._origIdx = i; return x; });

  let dateFilter = document.getElementById('histDateFilter');
  let filterVal = dateFilter ? dateFilter.value : ''; // YYYY-MM-DD
  if (filterVal) {
    // Convert YYYY-MM-DD to DD/MM/YYYY for comparison
    let parts = filterVal.split('-');
    let filterDate = parts[2] + '/' + parts[1] + '/' + parts[0]; // DD/MM/YYYY
    hist = hist.filter(function(x) { return x.date === filterDate; });
  }

  // Buscar por # de cotización — útil cuando llega una foto vieja/borrosa
  // de WhatsApp y el número es lo único que se alcanza a leer. Matchea
  // tanto el consecutivo puro como el que se ve impreso con la inicial
  // del asesor (ver domain.js:quoteDisplayNum — "S-129"), sea que se haya
  // alcanzado a leer la letra o no. NO filtra exacto: el consecutivo se
  // repite entre asesores, así que en "Todos los vendedores" deja ver
  // los que coincidan con el nombre de cada uno para desambiguar.
  let numFilter = document.getElementById('histNumFilter');
  let numVal = numFilter ? numFilter.value.trim() : '';
  if (numVal) {
    // También por nombre del cliente (rediseño, paso 5): se recuerda el nombre
    // antes que el número. Sin tildes ni mayúsculas para no fallar por un acento.
    var _sinTilde = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var numNorm = _sinTilde(numVal);
    hist = hist.filter(function(x) {
      return String(x.num || '').indexOf(numVal) !== -1
        || quoteDisplayNum(x.num, x.asesor, x.letra).toUpperCase().indexOf(numVal.toUpperCase()) !== -1
        || (!x._piiLocked && _sinTilde(x.cliente).indexOf(numNorm) !== -1);
    });
  }

  if (estadoFilter === 'seguimiento' && typeof _histNeedsFollowUp === 'function') {
    hist = hist.filter(_histNeedsFollowUp);
  } else if (estadoFilter !== 'todas' && estadoFilter !== 'seguimiento') {
    hist = hist.filter(function(x) { return (x.estado || 'enviada') === estadoFilter; });
  }

  if (!hist.length) {
    var emptyMsg = numVal ? ('Sin cotizaciones con "' + numVal + '"' + (teamMode ? '.' : ' \u2014 prob\u00e1 en "Todos los vendedores" si es de otro asesor.'))
      : filterVal ? 'Sin cotizaciones en esa fecha.'
      : estadoFilter === 'seguimiento' ? '\u00a1Al d\u00eda! No hay seguimientos pendientes.'
      : estadoFilter !== 'todas' ? 'Sin cotizaciones en ese estado.'
      : teamMode ? 'A\u00fan no hay cotizaciones del equipo en la nube.'
      : 'A\u00fan no hay cotizaciones guardadas.';
    el.innerHTML = '<div class="hempty empty-state">' + emptyMsg + '</div>';
    return;
  }
  let h = '';
  for (let i = 0; i < hist.length; i++) {
    h += teamMode ? T.histItemTeam(hist[i]) : T.histItem(hist[i], hist[i]._origIdx);
  }
  el.innerHTML = h;
}

// --- PC Builder: 3 modos via segmented control ---
function _setPcbMode(which) {
  // Sincroniza UI segmentada + estado oculto (mode + fullBuild) leído por buildPcFromPrompt()
  var modeSel = document.getElementById('pcBuilderMode');
  var fullChk = document.getElementById('pcbFullBuild');
  var input = document.getElementById('pcBuilderInput');
  var btns = document.querySelectorAll('.pcb-seg-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-pcb') === which);
  if (which === 'laptop') {
    if (modeSel) modeSel.value = 'laptop';
    if (fullChk) fullChk.checked = false;
    if (input) input.placeholder = 'Ej: Portátil para la universidad max 2 millones';
  } else if (which === 'full') {
    if (modeSel) modeSel.value = 'desktop';
    if (fullChk) fullChk.checked = true;
    if (input) input.placeholder = 'Ej: PC Gamer 5 millones con gráfica NVIDIA';
  } else {
    if (modeSel) modeSel.value = 'desktop';
    if (fullChk) fullChk.checked = false;
    if (input) input.placeholder = 'Ej: SSD 1TB barato, o RTX 4060 y board compatible';
  }
}

// --- Encabezado plegable ---
function updateEncSummary() {
  var el = document.getElementById('encSummary');
  if (!el) return;
  // El cliente ya está a la vista encima de este bloque: el resumen muestra
  // lo que queda plegado (número, asesor y validez), para no tener que abrirlo.
  var val = function (id) { var x = document.getElementById(id); return x ? (x.value || '').trim() : ''; };
  var parts = [];
  if (val('numCot')) parts.push('#' + val('numCot'));
  if (val('asesor')) parts.push(val('asesor'));
  if (val('validez')) parts.push(val('validez'));
  el.textContent = parts.join(' · ');
}
function toggleEncabezado() {
  var sec = document.getElementById('secEncabezado');
  if (!sec) return;
  var collapsed = sec.classList.toggle('collapsed');
  try { _ls.set('sl_enc_collapsed', collapsed ? '1' : '0'); } catch (e) {}
  updateEncSummary();
}

// --- Application boot ---
initCounter(); updateHistBadge(); updateFollowBadge(); liveUpdate();
autoLoadCatalog();
(function () { let a = _ls.get('sl_asesor'); if (a) { let el = document.getElementById('asesor'); if (el) el.value = a; } })();
updateCatFilterOpts(); filtered = CATALOG.slice(); filterCat();
document.getElementById('catTabN').textContent = CATALOG.length;
(function () {
  var sec = document.getElementById('secEncabezado');
  // Plegado por defecto: son datos que casi nunca cambian entre cotizaciones.
  if (sec && _ls.get('sl_enc_collapsed') !== '0') sec.classList.add('collapsed');
  updateEncSummary();
})();




