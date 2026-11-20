// ============================================================
// METRICS PANEL UI
// ============================================================
// Dashboard de telemetría: registra cada cotización generada en
// Firestore (colección `quotes`) y renderiza agregados para admin:
// totales, conteo por vendedor y top productos.
//
// Globales que expone (window.*):
//   _logQuote(quoteData)   — registra una cotización en Firestore
//   _mountMetricsPanel()   — monta listener Firestore y renderiza
//
// Depende de: firebase-auth.js (window._slDb, _slAuth, SUPER_ADMINS)
//             domain.js (esc, fmtCOP)
// Requiere DOM: #panel-metrics y todos sus #metrics* hijos
//
// Firestore: la colección `quotes` necesita reglas que permitan
//   CREATE a cualquier usuario autenticado y READ solo a admin.
// ============================================================
(function(){
  var _metricsMounted = false;
  var _unsubQuotes = null;
  var _unsubFailedSearches = null;
  var _allQuotes = [];
  var _allFailedSearches = [];
  var _excludeAdmin = localStorage.getItem('sl_metrics_exclude_admin') !== 'false';

  // ─── Logging: se llama desde services.js al generar cotización ──
  window._logQuote = async function(q){
    try {
      var db = window._slDb;
      var user = window._slAuth && window._slAuth.currentUser;
      if (!db || !user) return;
      var email = (user.email || '').toLowerCase().trim();
      var items = Array.isArray(q.items) ? q.items : [];
      // Resumen liviano (sku/name/qty/price) — no guardamos notas ni campos extra
      var itemsSummary = items.map(function(it){
        return {
          sku: String(it.sku || ''),
          name: String(it.name || ''),
          qty: Number(it.qty) || 0,
          price: Number(it.price) || 0
        };
      });
      var dateKey = (function(){
        var d = new Date();
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
      })();
      await db.collection('quotes').add({
        email: email,
        asesor: String(q.asesor || ''),
        num: Number(q.num) || 0,
        total: Number(q.total) || 0,
        itemCount: items.length,
        items: itemsSummary,
        priceList: String(q.priceList || ''),
        // Sin el nombre del cliente a propósito: este registro es solo para
        // métricas y nada lo lee. Guardarlo era dejar datos personales en
        // texto plano en una colección que el cifrado no cubre.
        dateKey: dateKey,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){
      // No bloquear UX si falla — solo log a consola
      console.warn('quote log error:', e && (e.message || e.code));
    }
  };

  // ─── Helpers de formato ─────────────────────────────────────
  function _fmtMoney(n){
    if (typeof fmtCOP === 'function') return fmtCOP(n);
    return '$ ' + (Number(n)||0).toLocaleString('es-CO');
  }
  function _safeEsc(s){
    if (typeof esc === 'function') return esc(s);
    return String(s==null?'':s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  // ─── Agregaciones ───────────────────────────────────────────
  function _startOfWeek(d){
    var x = new Date(d);
    var day = x.getDay(); // 0=Sun, 1=Mon...
    var diff = (day === 0 ? -6 : 1 - day); // Lunes como inicio
    x.setHours(0,0,0,0);
    x.setDate(x.getDate() + diff);
    return x;
  }

  function _aggregate(quotes){
    var now = new Date();
    var todayKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    var weekStart = _startOfWeek(now);
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    var totals = {
      today:  { count: 0, total: 0 },
      week:   { count: 0, total: 0 },
      month:  { count: 0, total: 0 },
      all:    { count: 0, total: 0 }
    };
    var byUser = {};       // email → { asesor, count, total }
    var byProduct = {};    // sku → { name, count, qty }

    quotes.forEach(function(q){
      var t = Number(q.total) || 0;
      var when = q.createdAt && q.createdAt.toDate ? q.createdAt.toDate() : null;

      totals.all.count++;
      totals.all.total += t;
      if (q.dateKey === todayKey) { totals.today.count++; totals.today.total += t; }
      if (when && when >= weekStart) { totals.week.count++; totals.week.total += t; }
      if (when && when >= monthStart) { totals.month.count++; totals.month.total += t; }

      var em = q.email || '—';
      if (!byUser[em]) byUser[em] = { email: em, asesor: q.asesor || '', count: 0, total: 0 };
      byUser[em].count++;
      byUser[em].total += t;
      if (!byUser[em].asesor && q.asesor) byUser[em].asesor = q.asesor;

      (q.items || []).forEach(function(it){
        var sku = it.sku || '—';
        if (!byProduct[sku]) byProduct[sku] = { sku: sku, name: it.name || '', count: 0, qty: 0 };
        byProduct[sku].count++;
        byProduct[sku].qty += Number(it.qty) || 0;
        if (!byProduct[sku].name && it.name) byProduct[sku].name = it.name;
      });
    });

    var users = Object.keys(byUser).map(function(k){ return byUser[k]; })
      .sort(function(a,b){ return b.count - a.count; });
    var products = Object.keys(byProduct).map(function(k){ return byProduct[k]; })
      .sort(function(a,b){ return b.count - a.count; })
      .slice(0, 10);

    return { totals: totals, users: users, products: products };
  }

  // ─── Render ─────────────────────────────────────────────────
  function _renderCards(t){
    function set(idCount, idTotal, slot){
      var c = document.getElementById(idCount);
      var tt = document.getElementById(idTotal);
      if (c) c.textContent = slot.count;
      if (tt) tt.textContent = _fmtMoney(slot.total);
    }
    set('metricsTodayCount', 'metricsTodayTotal', t.today);
    set('metricsWeekCount',  'metricsWeekTotal',  t.week);
    set('metricsMonthCount', 'metricsMonthTotal', t.month);
    set('metricsAllCount',   'metricsAllTotal',   t.all);
  }

  function _renderUsers(users){
    var list = document.getElementById('metricsByUser');
    var count = document.getElementById('metricsUsersCount');
    if (!list) return;
    if (count) count.textContent = users.length;
    if (!users.length) {
      list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--gray-500);font-size:13.5px">Sin cotizaciones aún</div>';
      return;
    }
    list.innerHTML = users.map(function(u){
      var name = u.asesor || u.email.split('@')[0].toUpperCase();
      var initial = (name || '?').charAt(0).toUpperCase();
      return '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--gray-100)">'
           +   '<div style="width:36px;height:36px;border-radius:50%;background:var(--gray-100);color:var(--gray-900);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:14px;flex-shrink:0">' + _safeEsc(initial) + '</div>'
           +   '<div style="flex:1;min-width:0">'
           +     '<div style="font-size:14px;font-weight:500;color:var(--gray-900);letter-spacing:-0.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _safeEsc(name) + '</div>'
           +     '<div style="font-size:12.5px;color:var(--gray-500);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _safeEsc(u.email) + '</div>'
           +   '</div>'
           +   '<div style="text-align:right;flex-shrink:0">'
           +     '<div style="font-size:15px;font-weight:600;color:var(--gray-900);font-variant-numeric:tabular-nums">' + u.count + '</div>'
           +     '<div style="font-size:11.5px;color:var(--gray-500);font-variant-numeric:tabular-nums">' + _fmtMoney(u.total) + '</div>'
           +   '</div>'
           + '</div>';
    }).join('');
  }

  function _renderProducts(products){
    var list = document.getElementById('metricsTopProducts');
    if (!list) return;
    if (!products.length) {
      list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--gray-500);font-size:13.5px">Sin datos</div>';
      return;
    }
    list.innerHTML = products.map(function(p, i){
      return '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--gray-100)">'
           +   '<div style="width:24px;font-size:13px;color:var(--gray-500);font-variant-numeric:tabular-nums;flex-shrink:0">' + (i+1) + '</div>'
           +   '<div style="flex:1;min-width:0">'
           +     '<div style="font-size:13.5px;font-weight:500;color:var(--gray-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _safeEsc(p.name || p.sku) + '</div>'
           +     '<div style="font-size:11.5px;color:var(--gray-500);font-family:var(--mono,monospace)">SKU ' + _safeEsc(p.sku) + '</div>'
           +   '</div>'
           +   '<div style="text-align:right;flex-shrink:0">'
           +     '<div style="font-size:14px;font-weight:600;color:var(--gray-900);font-variant-numeric:tabular-nums">' + p.count + '</div>'
           +     '<div style="font-size:11px;color:var(--gray-500)">' + p.qty + ' u.</div>'
           +   '</div>'
           + '</div>';
    }).join('');
  }

  function _render(quotes){
    var agg = _aggregate(quotes);
    _renderCards(agg.totals);
    _renderUsers(agg.users);
    _renderProducts(agg.products);
  }

  function _renderFailedSearches(failed) {
    var list = document.getElementById('metricsFailedSearches');
    if (!list) return;
    if (!failed.length) {
      list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--gray-500);font-size:13.5px">Sin búsquedas fallidas aún</div>';
      return;
    }

    var byQuery = {};
    failed.forEach(function(fs){
      var qText = (fs.query || '').trim();
      if (!qText) return;
      if (!byQuery[qText]) {
        byQuery[qText] = { query: qText, count: 0, users: [] };
      }
      byQuery[qText].count++;
      var em = fs.email || '—';
      if (byQuery[qText].users.indexOf(em) < 0) {
        byQuery[qText].users.push(em);
      }
    });

    var sorted = Object.keys(byQuery).map(function(k){ return byQuery[k]; })
      .sort(function(a, b){ return b.count - a.count; })
      .slice(0, 10);

    if (!sorted.length) {
      list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:var(--gray-500);font-size:13.5px">Sin búsquedas fallidas aún</div>';
      return;
    }

    list.innerHTML = sorted.map(function(item, idx){
      var queryEsc = _safeEsc(item.query);
      var usersText = item.users.map(function(u){ return u.split('@')[0]; }).join(', ');
      return '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-top:1px solid var(--gray-100)">'
           +   '<div style="width:24px;font-size:13px;color:var(--gray-500);font-variant-numeric:tabular-nums;flex-shrink:0">' + (idx+1) + '</div>'
           +   '<div style="flex:1;min-width:0">'
           +     '<div style="font-size:13.5px;font-weight:600;color:#ef4444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">"' + queryEsc + '"</div>'
           +     '<div style="font-size:11.5px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Buscado por: ' + _safeEsc(usersText) + '</div>'
           +   '</div>'
           +   '<div style="text-align:right;flex-shrink:0">'
           +     '<div style="font-size:14px;font-weight:700;color:var(--gray-900);font-variant-numeric:tabular-nums">' + item.count + '</div>'
           +     '<div style="font-size:11px;color:var(--gray-500)">veces</div>'
           +   '</div>'
           + '</div>';
    }).join('');
  }

  function _renderFiltered() {
    // 1. Filtrar cotizaciones
    var filteredQuotes = _allQuotes;
    if (_excludeAdmin) {
      filteredQuotes = _allQuotes.filter(function(q) {
        return (q.email || '').toLowerCase().trim() !== 'admin@ejemplo.co';
      });
    }
    _render(filteredQuotes);

    // 2. Filtrar búsquedas fallidas
    var filteredFailed = _allFailedSearches;
    if (_excludeAdmin) {
      filteredFailed = _allFailedSearches.filter(function(fs) {
        return (fs.email || '').toLowerCase().trim() !== 'admin@ejemplo.co';
      });
    }
    _renderFailedSearches(filteredFailed);
  }

  window._toggleExcludeAdmin = function(checked) {
    _excludeAdmin = checked;
    localStorage.setItem('sl_metrics_exclude_admin', checked ? 'true' : 'false');
    _renderFiltered();
  };

  // ─── Logging de Búsquedas Fallidas (Sin Resultados) ───
  var _failedSearchTimeout = null;
  window._logFailedSearchDebounced = function(qStr) {
    if (_failedSearchTimeout) clearTimeout(_failedSearchTimeout);
    _failedSearchTimeout = setTimeout(function() {
      window._logFailedSearch(qStr);
    }, 2000);
  };

  window._logFailedSearch = async function(qStr) {
    try {
      var queryStr = (qStr || '').trim().toLowerCase();
      if (!queryStr || queryStr.length < 3) return;

      var db = window._slDb;
      var user = window._slAuth && window._slAuth.currentUser;
      if (!db || !user) return;
      var email = (user.email || '').toLowerCase().trim();

      var dateKey = (function(){
        var d = new Date();
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
      })();

      await db.collection('failed_searches').add({
        query: queryStr,
        email: email,
        dateKey: dateKey,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e) {
      console.warn('failed search log error:', e && (e.message || e.code));
    }
  };

  // ─── Montaje del panel (idempotente, solo admin) ────────────
  window._mountMetricsPanel = function(){
    if (_metricsMounted) return;
    if (!window._slDb) return;
    var currentEmail = window._slAuth.currentUser && window._slAuth.currentUser.email;
    if (!currentEmail || window.SUPER_ADMINS.indexOf(currentEmail.toLowerCase()) < 0) return;
    _metricsMounted = true;

    // Sincronizar estado inicial del checkbox
    var chk = document.getElementById('metricsExcludeAdmin');
    if (chk) {
      chk.checked = _excludeAdmin;
    }

    // 1. Snapshot de cotizaciones
    _unsubQuotes = window._slDb.collection('quotes').onSnapshot(function(snap){
      _allQuotes = [];
      snap.forEach(function(doc){ _allQuotes.push(doc.data()); });
      _renderFiltered();
    }, function(err){
      console.error('metrics snapshot error:', err);
      var byUser = document.getElementById('metricsByUser');
      if (byUser) byUser.innerHTML = '<div style="padding:32px 24px;text-align:center;color:#ef4444;font-size:13px">Error al cargar cotizaciones</div>';
    });

    // 2. Snapshot de búsquedas fallidas
    _unsubFailedSearches = window._slDb.collection('failed_searches').onSnapshot(function(snap){
      _allFailedSearches = [];
      snap.forEach(function(doc){ _allFailedSearches.push(doc.data()); });
      _renderFiltered();
    }, function(err){
      console.error('failed searches snapshot error:', err);
      var list = document.getElementById('metricsFailedSearches');
      if (list) list.innerHTML = '<div style="padding:32px 24px;text-align:center;color:#ef4444;font-size:13px">Error al cargar búsquedas fallidas</div>';
    });
  };
})();
