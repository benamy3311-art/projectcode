// ============================================================
// NOTAS DEL PARCHE — ui/patch-notes.js
// Muestra el diff de precios de la lista recién publicada vs la anterior
// (solo la última comparación, sin historial). Lo ven TODOS los usuarios:
//   - Al publicar (admin), se calcula el diff y se sube data/<lista>/catalog_diff.json
//   - Al cargar/cambiar de lista, la app baja ese diff, avisa con un banner
//     "NUEVA LISTA - VER LO QUE CAMBIÓ" y lo pinta en la pestaña "Cambios".
//
// Unidades de precio: el parser y el JSON guardado van en COP COMPLETO; el
// catálogo en memoria (CATALOG / S.catalogLago) va en MILES (÷1000). buildDiff
// recibe la lista vieja en memoria (miles) y los productos nuevos del parser
// (COP completo) y normaliza todo a COP completo para comparar.
// ============================================================
(function () {
  'use strict';

  var GH_OWNER = 'benamy3311-art';
  var GH_REPO  = 'projectcode-tools';

  function fmtCOP(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function listKey() { return (typeof S !== 'undefined' && S.activePriceList === 'lago') ? 'lago' : 'store'; }

  // "Store" y "Lago" son los nombres internos de las listas: bajo marca
  // personalizada (o usuario Lite) no se muestran, igual que en el resto de
  // la app. Misma regla que usa el renombrado del catálogo — ver
  // _slIsBranded() en infrastructure/firebase-auth.js, que además llama a
  // render() cuando la marca cambia en vivo.
  function isBranded() { return typeof window._slIsBranded === 'function' && window._slIsBranded(); }
  function listNum(k) { return k === 'lago' ? 'Lista 2' : 'Lista 1'; }
  // Siempre «Lista 1» / «Lista 2» (rediseño): el nombre interno no se muestra.
  function listLabel(k) { return listNum(k); }
  function segLabel(k) { return listNum(k); }

  // Aplanar el JSON del catálogo ({categories:[{products:[{sku,name,price}]}]})
  // a un array [{sku,name,price}]. Los precios del JSON van en COP COMPLETO.
  function flatten(json) {
    var out = [];
    if (!json) return out;
    if (Array.isArray(json.categories)) {
      json.categories.forEach(function (c) {
        ((c && c.products) || []).forEach(function (p) { if (p && p.sku != null) out.push({ sku: p.sku, name: p.name, price: Number(p.price) || 0 }); });
      });
    } else if (Array.isArray(json)) {
      json.forEach(function (p) { if (p && p.sku != null) out.push({ sku: p.sku, name: p.name, price: Number(p.price) || 0 }); });
    }
    return out;
  }

  // ── Construir el diff (nuevo vs anterior) ──────────────────
  // oldList = productos de la lista ANTERIOR publicada; newProducts = del parser.
  // Ambos con precio en COP COMPLETO. Si no hay lista anterior (oldList vacía),
  // se marca firstPublish y NO se vuelca todo como "nuevos".
  function buildDiff(oldList, newProducts, listK) {
    // Excluir productos permanentes del cotizador (ej. "SERVICIO TÉCNICO"): la
    // app los inyecta ella misma en el catálogo cargado, nunca vienen en el PDF
    // ni en el JSON publicado, así que NO son un producto real de la lista —
    // compararlos siempre los marcaría como "agotados" sin serlo.
    var permanentSkus = (typeof PERMANENT_ITEMS !== 'undefined' ? PERMANENT_ITEMS : []).map(function (pi) { return pi.sku; });
    function isPermanent(it) { return it && permanentSkus.indexOf(it.sku) !== -1; }
    oldList = (oldList || []).filter(function (it) { return !isPermanent(it); });
    newProducts = (newProducts || []).filter(function (it) { return !isPermanent(it); });
    var diff = {
      list: listK, publishedAt: new Date().toISOString(),
      firstPublish: oldList.length === 0,
      prevCount: oldList.length, newCount: newProducts.length,
      up: [], down: [], added: [], removed: []
    };
    if (diff.firstPublish) return diff; // sin lista anterior con qué comparar
    var oldMap = {};
    oldList.forEach(function (it) { if (it && it.sku != null) oldMap[String(it.sku)] = { name: it.name || '', price: Number(it.price) || 0 }; });
    var seen = {};
    newProducts.forEach(function (np) {
      if (!np || np.sku == null) return;
      var sku = String(np.sku); seen[sku] = 1;
      var newPrice = Number(np.price) || 0;
      var o = oldMap[sku];
      if (!o) {
        if (newPrice > 0) diff.added.push({ sku: sku, name: np.name || '', price: newPrice });
      } else if (o.price > 0 && newPrice > 0 && o.price !== newPrice) {
        var rec = { sku: sku, name: np.name || o.name, old: o.price, new: newPrice, pct: Math.round((newPrice - o.price) / o.price * 100) };
        (newPrice > o.price ? diff.up : diff.down).push(rec);
      }
    });
    oldList.forEach(function (it) { if (it && it.sku != null) { var sku = String(it.sku); if (!seen[sku]) diff.removed.push({ sku: sku, name: it.name || '', price: Number(it.price) || 0 }); } });
    diff.up.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    diff.down.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    return diff;
  }

  // ── Subir el diff a GitHub (lo llama el flujo de publicación del parser) ──
  function publishDiff(diff, token) {
    if (typeof uploadToGitHub !== 'function') return Promise.resolve({ ok: false, error: 'sin uploader' });
    var path = 'data/' + diff.list + '/catalog_diff.json';
    var content = JSON.stringify(diff, null, 2);
    var msg = 'Diff catálogo ' + diff.list + ' (' + diff.up.length + ' subidas, ' + diff.down.length + ' bajadas, ' + diff.added.length + ' nuevos, ' + diff.removed.length + ' descontinuados)';
    return uploadToGitHub(token, GH_OWNER, GH_REPO, path, content, msg);
  }

  // ── Estado + "visto" por usuario ───────────────────────────
  // Guardamos el diff de AMBAS listas y mostramos una a la vez con un toggle.
  // Por defecto arranca en "store"; el usuario puede cambiar a "lago".
  var LISTS = ['store', 'lago'];
  var _diffs = { store: null, lago: null };
  var _activeK = 'store';

  function seenKey(k) { return 'sl_diff_seen_' + k; }
  function isNew(d) {
    if (!d || !d.publishedAt) return false;
    var seen; try { seen = localStorage.getItem(seenKey(d.list)); } catch (e) {}
    return seen !== d.publishedAt;
  }
  function markSeen(d) { if (d && d.publishedAt) { try { localStorage.setItem(seenKey(d.list), d.publishedAt); } catch (e) {} } }

  // "Ya se mostró el banner" es independiente de "visto" (que requiere abrir la
  // pestaña Cambios): el banner debe salir UNA sola vez por publicación, sin
  // importar si el usuario lo cierra con la X o navega/cambia de lista después.
  function bannerKey(k) { return 'sl_diff_bannered_' + k; }
  function wasBannered(d) {
    if (!d || !d.publishedAt) return true;
    var b; try { b = localStorage.getItem(bannerKey(d.list)); } catch (e) {}
    return b === d.publishedAt;
  }
  function markBannered(d) { if (d && d.publishedAt) { try { localStorage.setItem(bannerKey(d.list), d.publishedAt); } catch (e) {} } }

  function setDot(on) { var dot = document.getElementById('pnTabDot'); if (dot) dot.style.display = on ? '' : 'none'; }
  function updateDot() { setDot(isNew(_diffs.store) || isNew(_diffs.lago)); }

  // ── Cargar el diff de una lista ────────────────────────────
  function loadOne(listK) {
    return fetch('data/' + listK + '/catalog_diff.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { _diffs[listK] = d; return d; })
      .catch(function () { _diffs[listK] = null; return null; });
  }

  // ── Cargar ambas listas → render + banner de las que sean nuevas ──
  function loadAll() {
    return Promise.all(LISTS.map(loadOne)).then(function () {
      render();
      updateDot();
      var pend = pickBannerCandidates();
      if (pend.length) banner(pend);
      return _diffs;
    });
  }

  // Diffs con cambios sin bannerear todavía (no "sin ver": abrir la pestaña
  // Cambios sigue controlando el punto rojo, pero el banner es aparte y solo
  // se dispara una vez por publicación). Ordenadas por más reciente.
  function pickBannerCandidates() {
    var cands = [_diffs.store, _diffs.lago].filter(function (d) { return isNew(d) && !wasBannered(d); });
    cands.sort(function (a, b) { return String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')); });
    return cands;
  }

  // Un solo banner, aunque haya cambios pendientes en ambas listas a la vez.
  function banner(diffs) {
    if (!diffs || !diffs.length || typeof window.showTopNotice !== 'function') return;
    // Se marca "bannereado" al mostrarlo (no al hacer click) para que no
    // reaparezca sin importar cómo lo cierre el usuario (X o cambiando de lista).
    diffs.forEach(markBannered);
    var msg = diffs.length > 1
      ? 'NUEVAS LISTAS - ' + diffs.map(function (d) { return listLabel(d.list); }).join(' y ') + ' se actualizaron.'
      : 'NUEVA LISTA - ' + listLabel(diffs[0].list) + ' se actualizó.';
    window.showTopNotice(msg, 'Ver lo que cambió', function () {
      if (typeof switchTab === 'function') switchTab('cambios');
      show(diffs[0].list);
    });
  }

  // Cambiar de lista visible (toggle). Marca esa lista como vista.
  function show(listK) {
    _activeK = (listK === 'lago') ? 'lago' : 'store';
    markSeen(_diffs[_activeK]);
    if (typeof window.hideTopNotice === 'function') window.hideTopNotice();
    render();
    updateDot();
  }

  // Cuando el usuario abre la pestaña: marcar vista la lista activa y quitar aviso.
  function onOpen() {
    markSeen(_diffs[_activeK]);
    if (typeof window.hideTopNotice === 'function') window.hideTopNotice();
    render();
    updateDot();
  }

  // ── Render de la pestaña ───────────────────────────────────
  function render() {
    var el = document.getElementById('pn-body'); if (!el) return;
    var d = _diffs[_activeK];
    var h = toolbar();
    if (!d) {
      h += '<div class="pn-empty">Aún no hay cambios registrados para esta lista.<br>Aparecerán aquí la próxima vez que se publique una lista nueva.</div>';
    } else {
      h += head(d) + bodyOf(d);
    }
    el.innerHTML = h;
  }

  // Segmented control estilo iOS para alternar entre las dos listas.
  function toolbar() {
    function seg(k) {
      var on = _activeK === k ? ' is-active' : '';
      var dot = isNew(_diffs[k]) ? '<span class="pn-seg-dot"></span>' : '';
      return '<button type="button" class="pn-seg-btn' + on + '" onclick="PatchNotes.show(\'' + k + '\')">' + segLabel(k) + dot + '</button>';
    }
    return '<div class="pn-toolbar"><div class="pn-seg">' +
      seg('store') + seg('lago') +
      '</div></div>';
  }

  function head(d) {
    var fecha = d.publishedAt;
    try { fecha = new Date(d.publishedAt).toLocaleString('es-CO', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
    return '<div class="pn-head">' +
      '<div class="pn-title">Cambios de ' + esc(listLabel(d.list)) + '</div>' +
      '<div class="pn-date">Publicado: ' + esc(fecha) + ' &middot; ' + d.prevCount + ' &rarr; ' + d.newCount + ' productos</div>' +
      '<div class="pn-summary">' +
        '<span class="pn-chip up">' + d.up.length + ' subieron</span>' +
        '<span class="pn-chip down">' + d.down.length + ' bajaron</span>' +
        '<span class="pn-chip new">' + d.added.length + ' nuevos</span>' +
        '<span class="pn-chip gone">' + d.removed.length + ' agotados</span>' +
      '</div></div>';
  }

  function bodyOf(d) {
    if (d.firstPublish) {
      return '<div class="pn-empty">Primera lista publicada (' + d.newCount + ' productos).<br>Aún no hay una lista anterior con qué comparar; los cambios aparecerán en la próxima publicación.</div>';
    }
    if (!d.up.length && !d.down.length && !d.added.length && !d.removed.length) {
      return '<div class="pn-empty">Sin cambios de precio entre esta lista y la anterior.</div>';
    }
    return grpDelta('Subieron de precio', d.up, 'up') +
      grpDelta('Bajaron de precio', d.down, 'down') +
      grpPlain('Productos nuevos', d.added, 'new') +
      grpPlain('Agotados', d.removed, 'gone');
  }

  // Contenedor de sección estilo "lista agrupada" (tarjeta con filas).
  function group(title, count, cls, rows) {
    return '<section class="pn-group">' +
      '<div class="pn-group-hd"><span class="pn-dot ' + cls + '"></span>' +
        '<span class="pn-group-title">' + esc(title) + '</span>' +
        '<span class="pn-group-count">' + count + '</span></div>' +
      '<div class="pn-card">' + rows + '</div></section>';
  }

  function rowMain(name, sku) {
    return '<div class="pn-row-main"><span class="pn-row-name">' + esc(name) + '</span>' +
      '<span class="pn-row-sku">' + esc(sku) + '</span></div>';
  }

  function grpDelta(title, arr, cls) {
    if (!arr || !arr.length) return '';
    var arrow = cls === 'up' ? '&#9650;' : '&#9660;'; // triángulo arriba / abajo (símbolo, no emoji)
    var rows = arr.map(function (r) {
      return '<div class="pn-row">' + rowMain(r.name, r.sku) +
        '<div class="pn-row-side">' +
          '<span class="pn-old">' + fmtCOP(r.old) + '</span>' +
          '<span class="pn-new ' + cls + '">' + fmtCOP(r.new) + '</span>' +
          '<span class="pn-badge ' + cls + '">' + arrow + ' ' + Math.abs(r.pct) + '%</span>' +
        '</div></div>';
    }).join('');
    return group(title, arr.length, cls, rows);
  }

  function grpPlain(title, arr, cls) {
    if (!arr || !arr.length) return '';
    var rows = arr.map(function (r) {
      return '<div class="pn-row">' + rowMain(r.name, r.sku) +
        '<div class="pn-row-side"><span class="pn-new ' + cls + '">' + fmtCOP(r.price) + '</span></div></div>';
    }).join('');
    return group(title, arr.length, cls, rows);
  }

  // Mostrar un diff recién calculado de inmediato (para el admin al publicar),
  // sin re-descargarlo de GitHub (que puede tardar en propagarse).
  function showLocal(d) {
    if (!d) return;
    _diffs[d.list] = d;
    _activeK = d.list;
    render();
    setDot(true);
    if (typeof window.showTopNotice === 'function') banner([d]);
  }

  window.PatchNotes = { buildDiff: buildDiff, flatten: flatten, publishDiff: publishDiff, load: loadAll, show: show, render: render, onOpen: onOpen, showLocal: showLocal };

  function init() { loadAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
