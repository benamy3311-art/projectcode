// ============================================================
// BRIEF DIARIO DE APERTURA
// ============================================================
// Card flotante (estilo _bigNotify de remisiones, NO modal bloqueante)
// que aparece 1 vez al día por usuario al abrir la app, con lo que
// necesita atención: seguimientos de cotizaciones pendientes (CRM),
// recogidas activas para su sede y hace cuánto se actualizó el catálogo.
// Si no hay nada que contar, no aparece.
//
// Gate: localStorage 'sl_brief_seen_<email>' === dateKey de hoy.
//
// Globales que expone (window.*):
//   _maybeShowDailyBrief()  — llamado tras login (con delay para que
//                             lleguen los primeros snapshots)
//   _dismissBrief()
//
// Depende de: quotes-sync/services (getFollowUps), remisiones.js
//             (_remPendingForMe), firebase-auth.js (_slDb, _slAuth),
//             ui.js (openHistSeguimiento, switchTab)
// ============================================================
(function(){

  function _dk(){
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Íconos SVG de línea (mismo estilo stroke del resto de la app)
  var _ICO = {
    sun:   '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
    chat:  '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
    box:   '<path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    tag:   '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'
  };
  function _ico(name, size){
    return '<svg viewBox="0 0 24 24" style="width:' + (size || 15) + 'px;height:' + (size || 15) + 'px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0">' + _ICO[name] + '</svg>';
  }

  window._dismissBrief = function(){
    var el = document.getElementById('slDailyBrief');
    if (!el) return;
    el.classList.add('gone');
    setTimeout(function(){ if (el.parentNode) el.remove(); }, 500);
  };

  window._maybeShowDailyBrief = async function(){
    var user = window._slAuth && window._slAuth.currentUser;
    if (!user || window._slUserIsLite) return;
    // Primera vez en el dispositivo: el popup "¿Cómo te llamas?" tiene
    // prioridad; el brief se mostrará a partir del día siguiente, sin apilarse.
    try { if (localStorage.getItem('sl_asesor_personal') !== '1') return; } catch(e){}
    var email = (user.email || '').toLowerCase().trim();
    if (!email) return;
    var seenKey = 'sl_brief_seen_' + email;
    try { if (localStorage.getItem(seenKey) === _dk()) return; } catch(e){}

    var fu = (typeof getFollowUps === 'function') ? getFollowUps().length : 0;
    var rec = (typeof _remPendingForMe === 'function') ? _remPendingForMe() : 0;
    if (!fu && !rec) return; // día tranquilo — no molestar

    // Última actualización del catálogo (best-effort, 1 lectura)
    var catLine = '';
    try {
      var snap = await window._slDb.collection('config').doc('catalog_meta').get();
      if (snap.exists) {
        var ts = snap.data().updatedAt;
        if (ts && ts.toMillis) {
          var days = Math.floor((Date.now() - ts.toMillis()) / 86400000);
          catLine = days === 0 ? 'Catálogo actualizado hoy'
                  : 'Catálogo actualizado hace ' + days + (days === 1 ? ' día' : ' días');
        }
      }
    } catch(e){ /* sin metadato aún — omitir la línea */ }

    var rows = '';
    if (fu) {
      rows += '<button class="brief-row" onclick="_dismissBrief();openHistSeguimiento()">' +
        '<span><b>' + fu + (fu === 1 ? ' cotización espera' : ' cotizaciones esperan') + '</b> tu seguimiento</span>' +
        '<span class="brief-go">Ver</span></button>';
    }
    if (rec) {
      rows += '<button class="brief-row" onclick="_dismissBrief();switchTab(\'rem\')">' +
        '<span><b>' + rec + (rec === 1 ? ' recogida activa' : ' recogidas activas') + '</b> en tu tablero</span>' +
        '<span class="brief-go">Ver</span></button>';
    }
    if (catLine) {
      rows += '<div class="brief-row brief-row-info">' + _ico('tag') + '<span>' + catLine + '</span></div>';
    }

    var old = document.getElementById('slDailyBrief');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'slDailyBrief';
    el.className = 'brief-card';
    el.innerHTML =
      '<div class="brief-hdr">' +
        '<span class="brief-ico">' + _ico('sun', 20) + '</span>' +
        '<span class="brief-title">Tu día de un vistazo</span>' +
        '<button class="brief-x" onclick="_dismissBrief()">&times;</button>' +
      '</div>' +
      rows;
    document.body.appendChild(el);
    try { localStorage.setItem(seenKey, _dk()); } catch(e){}

    // Se despide solo tras 45s — no bloquea nada mientras tanto
    setTimeout(function(){ window._dismissBrief(); }, 45000);
  };
})();
