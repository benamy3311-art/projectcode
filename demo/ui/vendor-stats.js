// ============================================================
// STATS PERSONALES DEL VENDEDOR
// ============================================================
// Modal con las métricas propias de cada vendedor: cotizaciones de
// hoy/semana/mes, tasa de conversión (vendidas / con estado), racha
// de días con actividad y puesto del mes entre vendedores.
//
// Fuentes de datos (0 lecturas extra salvo el ranking):
//   - _slQuotesSync.getCloudDocs()  → docs propios ya en memoria
//   - metrics_agg/{YYYY-MM}         → 1 read para el puesto
//
// El puesto se muestra SIN exponer los números de los colegas
// ("Puesto 2 de 5"), a propósito: motiva sin generar roces.
//
// Globales que expone (window.*):
//   _openVendorStats()  — abre el modal (crea el DOM la primera vez)
//   _closeVendorStats()
//
// Depende de: quotes-sync.js (_slQuotesSync), firebase-auth.js
//             (_slDb, _slAuth), ui.js (showToast), domain.js (esc)
// ============================================================
(function(){

  function _dk(d){
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ─── Cálculo de stats desde los docs en memoria ──────────────
  function _computeVendorStats(docs){
    var todayKey = _dk(new Date());
    var monthKey = todayKey.slice(0, 7);
    var weekFloor = _dk(new Date(Date.now() - 6 * 86400000)); // hoy incluido = 7 días
    var hoy = 0, semana = 0, mes = 0, vendidas = 0, total = 0;
    var days = {};
    docs.forEach(function(d){
      var dk = d.dateKey || '';
      if (dk) days[dk] = 1;
      if (dk === todayKey) hoy++;
      if (dk >= weekFloor) semana++;
      if (dk.slice(0, 7) === monthKey) mes++;
      total++;
      if ((d.estado || 'enviada') === 'vendida') vendidas++;
    });
    // Racha: días consecutivos con >=1 cotización, terminando hoy
    // (o ayer, para no romperla a primera hora de la mañana).
    var racha = 0;
    var cursor = new Date();
    if (!days[_dk(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (days[_dk(cursor)]) { racha++; cursor.setDate(cursor.getDate() - 1); }
    return {
      hoy: hoy, semana: semana, mes: mes,
      vendidas: vendidas,
      conversion: total ? Math.round(vendidas / total * 100) : 0,
      racha: racha
    };
  }

  // ─── Puesto del mes (1 lectura de metrics_agg) ───────────────
  async function _computeRank(){
    try {
      var mk = _dk(new Date()).slice(0, 7);
      var snap = await window._slDb.collection('metrics_agg').doc(mk).get();
      if (!snap.exists) return null;
      var counts = (snap.data() || {}).counts || {};
      var me = (window._slAuth.currentUser.email || '').toLowerCase().trim();
      var entries = Object.keys(counts).map(function(k){ return [k, counts[k]]; });
      entries.sort(function(a, b){ return b[1] - a[1]; });
      var pos = -1;
      for (var i = 0; i < entries.length; i++) if (entries[i][0] === me) { pos = i; break; }
      if (pos < 0) return null;
      return { puesto: pos + 1, de: entries.length };
    } catch(e){
      console.warn('[vstats] rank error:', e && (e.message || e.code));
      return null;
    }
  }

  function _tile(label, value, sub){
    return '<div class="vstats-tile">' +
      '<div class="vstats-val">' + value + '</div>' +
      '<div class="vstats-lbl">' + label + '</div>' +
      (sub ? '<div class="vstats-sub">' + sub + '</div>' : '') +
    '</div>';
  }

  function _ensureModal(){
    if (document.getElementById('vstatsOv')) return;
    var ov = document.createElement('div');
    ov.id = 'vstatsOv';
    ov.className = 'vstats-ov';
    ov.innerHTML =
      '<div class="vstats-card">' +
        '<div class="vstats-hdr">' +
          '<h3><span class="ico"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></span> Mis estadísticas</h3>' +
          '<button class="hclose" onclick="_closeVendorStats()">&times;</button>' +
        '</div>' +
        '<div id="vstatsBody"><div class="hempty empty-state">Cargando…</div></div>' +
      '</div>';
    ov.addEventListener('click', function(e){ if (e.target === ov) window._closeVendorStats(); });
    document.body.appendChild(ov);
  }

  window._openVendorStats = async function(){
    var user = window._slAuth && window._slAuth.currentUser;
    if (!user) {
      if (typeof showToast === 'function') showToast('Inicia sesión para ver tus estadísticas', 'warn');
      return;
    }
    _ensureModal();
    document.getElementById('vstatsOv').classList.add('on');
    var body = document.getElementById('vstatsBody');

    var docs = (window._slQuotesSync && _slQuotesSync.getCloudDocs()) || [];
    var s = _computeVendorStats(docs);
    var mesLbl = new Date().toLocaleDateString('es-CO', { month: 'long' });

    body.innerHTML =
      '<div class="vstats-grid">' +
        _tile('Cotizaciones hoy', s.hoy) +
        _tile('Esta semana', s.semana) +
        _tile('En ' + mesLbl, s.mes) +
        _tile('Conversión', s.conversion + '%', s.vendidas + (s.vendidas === 1 ? ' venta cerrada' : ' ventas cerradas')) +
      '</div>' +
      '<div class="vstats-row' + (s.racha >= 2 ? ' vstats-hot' : '') + '">' +
        '<span class="ico"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg></span>' +
        (s.racha > 0
          ? '<b>Racha: ' + s.racha + (s.racha === 1 ? ' día' : ' días seguidos') + '</b>&nbsp;cotizando'
          : 'Cotiza hoy para arrancar una racha') +
      '</div>' +
      '<div class="vstats-row" id="vstatsRank">Calculando tu puesto del mes…</div>' +
      (docs.length ? '' : '<div class="vstats-note">Las stats se calculan con tus cotizaciones sincronizadas en la nube — se llenan solas a medida que cotizas.</div>');

    var rank = await _computeRank();
    var rankEl = document.getElementById('vstatsRank');
    if (rankEl) {
      rankEl.innerHTML = rank
        ? '<span class="ico"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg></span>' +
          '<b>Puesto ' + rank.puesto + ' de ' + rank.de + '</b>&nbsp;este mes' + (rank.puesto === 1 ? ' — ¡vas de líder!' : '')
        : 'Aún no hay ranking este mes.';
    }
  };

  window._closeVendorStats = function(){
    var ov = document.getElementById('vstatsOv');
    if (ov) ov.classList.remove('on');
  };
})();
