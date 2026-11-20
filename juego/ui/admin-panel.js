// ============================================================
// ADMIN PANEL UI
// ============================================================
// Maneja todo el panel de administración: aprobación/rechazo de
// usuarios, modo mantenimiento, y suscripciones de Firestore para
// listas de pendientes y aprobados.
//
// Globales que expone (window.*):
//   _approveEmail(email, displayName) — aprueba usuario
//   _rejectEmail(email)               — rechaza solicitud
//   _removeApproved(email)            — revoca acceso
//   _adminAddEmail()                  — añade email desde input
//   _toggleMaintenance()              — activa/desactiva mantenimiento
//   _mountAdminPanel()                — monta listeners (idempotente)
//   _setUserLetra(email, letra)       — fija la letra del # de cotización (ver domain.js:quoteDisplayNum)
//
// Helpers internos (NO en window):
//   _safeJsAttr(s)             — escape para JS-en-atributo HTML (anti-XSS)
//   _emailRow(item, type, dupSet) — renderiza una fila de usuario
//   _letraField(emailJs, letra, dupCount) — campo editable de letra fija
//   _updateMaintenanceBtn(enabled) — sincroniza UI del botón
//
// Depende de: firebase-auth.js (window._slDb, _slAuth, SUPER_ADMINS)
//             domain.js (esc)
// Requiere DOM: #panel-admin, #pendingList, #approvedList,
//               #btnMaintenance, #adminAddEmail, #adminBadge,
//               #pendingCount, #approvedCount
// ============================================================
(function(){
  var _adminMounted = false;
  var _unsubPending = null, _unsubApproved = null;
  // Última foto del roster aprobado (con letra) — para el chequeo de
  // colisión al guardar una letra nueva (_setUserLetra) sin otra lectura.
  var _lastApprovedEntries = [];

  // Escape para uso dentro de un literal JS '...' embebido en atributo HTML.
  // Convierte cualquier carácter peligroso a su escape hexadecimal JS,
  // que es seguro tanto en el contexto de string JS como en el atributo HTML.
  function _safeJsAttr(s){
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\x27')
      .replace(/"/g, '\\x22')
      .replace(/</g, '\\x3c')
      .replace(/>/g, '\\x3e')
      .replace(/&/g, '\\x26')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
  }

  // Dropdown de sede para un usuario aprobado
  function _sedeSelect(emailJs, currentSede){
    var sedes = window.SL_SEDES || [];
    var opts = '<option value=""' + (!currentSede ? ' selected' : '') + '>Sin sede</option>';
    sedes.forEach(function(s){
      opts += '<option value="' + s.id + '"' + (currentSede === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>';
    });
    var style = currentSede
      ? 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;'
      : 'background:#fff7ed;color:#c2410c;border:1px dashed #fdba74;';
    // width:auto — anula el select{width:100%} global, que dentro de un
    // contenedor flex con wrap lo estiraba a todo el ancho de la fila
    return '<select onchange="_setUserSede(\'' + emailJs + '\', this.value)" title="Sede del usuario (para notificaciones de recogidas)"'
         + ' style="width:auto;flex-shrink:0;box-shadow:none;padding:5px 8px;border-radius:8px;font-size:11.5px;font-weight:600;cursor:pointer;outline:none;-webkit-appearance:none;appearance:none;' + style + '">'
         + opts + '</select>';
  }

  // Letra fija del usuario para el número de cotización (ej. "S-129").
  // La asigna el admin acá, a mano, una vez por usuario — reemplaza la
  // inicial del campo Asesor (que cualquiera puede editar y hacía que dos
  // vendedores con nombres parecidos chocaran). dupCount > 1 = esta letra
  // ya la tiene otro usuario aprobado: se resalta en rojo hasta que se
  // resuelva, en vez de bloquear el guardado (ver _setUserLetra).
  function _letraField(emailJs, letra, dupCount){
    var v = esc(String(letra || ''));
    var isDup = !!letra && dupCount > 1;
    var style = isDup
      ? 'border:1.5px solid var(--red);background:#fef2f2;color:var(--red);'
      : letra
        ? 'border:1px solid var(--gray-200);background:#fff;color:var(--gray-900);'
        : 'border:1px dashed var(--gray-300);background:var(--gray-50);color:var(--gray-400);';
    var title = isDup
      ? 'Letra repetida — otro usuario aprobado ya tiene "' + esc(letra) + '". Cambiala en uno de los dos.'
      : 'Letra fija para el número de cotización (ej. S-129) — la asignás una vez, no la puede cambiar el usuario';
    return '<input type="text" maxlength="1" value="' + v + '" placeholder="—" title="' + title + '"'
         + ' onchange="_setUserLetra(\'' + emailJs + '\', this.value)"'
         + ' style="width:30px;height:30px;text-align:center;text-transform:uppercase;font-weight:700;font-size:13px;border-radius:8px;padding:0;flex-shrink:0;font-family:inherit;' + style + '">';
  }

  // Interruptor de IA de un usuario. Va aparte del plan a propósito: permite
  // dar acceso Pro completo (Cuadre de Caja incluido) pero sin las funciones
  // de IA. Solo bloquea si el campo es exactamente false.
  function _iaToggle(emailJs, iaOn, isPremium){
    var style = iaOn
      ? 'background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;'
      : 'background:var(--gray-100);color:var(--gray-400);border:1px solid var(--gray-200);text-decoration:line-through;';
    var title = iaOn
      ? (isPremium ? 'IA permitida — clic para quitarle solo las funciones de IA'
                   : 'IA permitida, pero además requiere plan Pro para usarla')
      : 'IA bloqueada para este usuario — clic para volver a permitirla';
    return '<button onclick="_setUserIA(\'' + emailJs + '\',' + (iaOn ? 'false' : 'true') + ')"'
         + ' title="' + esc(title) + '"'
         + ' style="padding:5px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.4px;line-height:1.2;white-space:nowrap;flex-shrink:0;cursor:pointer;transition:all .15s;' + style + '">'
         + 'IA</button>';
  }

  // Rol dentro de la tienda: Asesor (por defecto) o Jefe. El jefe ve el
  // panel del jefe y lo de todo el equipo (ui/riel.js, ui/panel-jefe.js).
  function _rolToggle(emailJs, rolActual){
    var on = 'background:var(--gray-900);color:#fff;border:1px solid var(--gray-900);';
    var off = 'background:var(--gray-100);color:var(--gray-500);border:1px solid var(--gray-200);';
    function b(label, val, activo){
      return '<button onclick="_setUserRol(\'' + emailJs + '\',\'' + val + '\')"' + (activo ? ' disabled' : '')
           + ' title="' + (val === 'jefe' ? 'Jefe: ve el panel del dueño y lo de todo el equipo' : val === 'bodega' ? 'Bodega: inventario, ingresos, agotados, proveedores y garantías' : 'Asesor: chats, cotizar, vender y recogidas') + '"'
           + ' style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.4px;line-height:1.2;white-space:nowrap;flex-shrink:0;cursor:' + (activo ? 'default' : 'pointer') + ';transition:all .15s;' + (activo ? on : off) + '">'
           + label + '</button>';
    }
    var r = rolActual === 'jefe' || rolActual === 'bodega' ? rolActual : 'asesor';
    return '<div style="display:inline-flex;gap:3px;margin:0 4px">' + b('Asesor', 'asesor', r === 'asesor') + b('Bodega', 'bodega', r === 'bodega') + b('Jefe', 'jefe', r === 'jefe') + '</div>';
  }

  function _emailRow(item, type, dupSet){
    // item: {email, displayName, photoURL, premium, lite, ia, sede, letra}; type: 'pending' | 'approved'
    // dupSet: {LETRA: cantidad} de todo el roster aprobado — solo aplica en type 'approved'
    var email = String(item.email || '');
    var displayName = String(item.displayName || '');
    var photoURL = String(item.photoURL || '');
    var isPremium = item.premium === true;
    var isLite = !isPremium && item.lite === true;
    var currentPlan = isPremium ? 'pro' : (isLite ? 'lite' : 'basic');
    var initial = (displayName || email || '?').charAt(0).toUpperCase();
    var hasName = !!displayName;
    var emailJs = _safeJsAttr(email);
    var nameJs = _safeJsAttr(displayName);
    var btns = '';
    if (type === 'pending') {
      btns = '<button onclick="_rejectEmail(\'' + emailJs + '\')" style="padding:6px 14px;border:none;border-radius:7px;background:transparent;color:var(--gray-500);font-size:13px;font-weight:500;cursor:pointer;transition:color .15s" onmouseover="this.style.color=\'var(--red)\'" onmouseout="this.style.color=\'var(--gray-500)\'">Rechazar</button>'
           + '<button onclick="_approveEmail(\'' + emailJs + '\',\'' + nameJs + '\')" style="padding:6px 16px;border:none;border-radius:8px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s;letter-spacing:-0.1px" onmouseover="this.style.opacity=\'0.88\'" onmouseout="this.style.opacity=\'1\'">Aprobar</button>';
    } else {
      var letraDup = dupSet && item.letra ? (dupSet[item.letra] || 0) : 0;
      if (window.SUPER_ADMINS.indexOf(email) >= 0) {
        // El admin también hace cotizaciones (ej. "S-129") y puede tener
        // sede (para pre-llenar el origen de sus recogidas)
        btns = _letraField(emailJs, item.letra || '', letraDup)
             + _sedeSelect(emailJs, item.sede || '')
             + '<span style="font-size:11px;color:var(--gray-500);font-weight:500;letter-spacing:0.5px;text-transform:uppercase;margin-left:6px">Admin</span>';
      } else {
        // Estilos por plan
        var STYLE_INACTIVE = 'background:var(--gray-100);color:var(--gray-500);border:1px solid var(--gray-200);';
        var STYLE_LITE_ACTIVE  = 'background:#fafafa;color:#6b7280;border:1px dashed #9ca3af;';
        var STYLE_BASIC_ACTIVE = 'background:var(--gray-200);color:var(--gray-900);border:1px solid #c7c7cc;';
        var STYLE_PRO_ACTIVE   = 'background:linear-gradient(135deg,#93c5fd,#3b82f6,#1d4ed8);color:#fff;border:1px solid #2563eb;box-shadow:0 0 8px rgba(37,99,235,0.4);';
        function _planBtn(label, planVal, activeStyle){
          var style = (currentPlan === planVal) ? activeStyle : STYLE_INACTIVE;
          var disabled = (currentPlan === planVal) ? ' disabled' : '';
          var cursor = (currentPlan === planVal) ? 'default' : 'pointer';
          return '<button onclick="_setUserPlan(\'' + emailJs + '\',\'' + planVal + '\')"' + disabled
               + ' style="padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.4px;line-height:1.2;white-space:nowrap;flex-shrink:0;cursor:' + cursor + ';transition:all .15s;' + style + '">'
               + label
               + '</button>';
        }
        btns = _letraField(emailJs, item.letra || '', letraDup)
             + _sedeSelect(emailJs, item.sede || '')
             + '<div style="display:inline-flex;gap:3px;margin:0 4px">'
             + _planBtn('Lite',  'lite',  STYLE_LITE_ACTIVE)
             + _planBtn('Basic', 'basic', STYLE_BASIC_ACTIVE)
             + _planBtn(icon('sparkle', 'ico-xs') + ' Pro', 'pro',   STYLE_PRO_ACTIVE)
             + '</div>'
             + _iaToggle(emailJs, item.ia !== false, isPremium)
             + _rolToggle(emailJs, item.rol)
             + '<button onclick="_removeApproved(\'' + emailJs + '\')" style="padding:6px 14px;border:none;border-radius:7px;background:transparent;color:var(--gray-500);font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;transition:color .15s" onmouseover="this.style.color=\'var(--red)\'" onmouseout="this.style.color=\'var(--gray-500)\'">Quitar</button>';
      }
    }
    // photoURL solo aceptado si es URL http/https; previene javascript: URIs
    var safePhoto = /^https?:\/\//i.test(photoURL) ? photoURL : '';
    var avatar = safePhoto
      ? '<img src="' + esc(safePhoto) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0" referrerpolicy="no-referrer">'
      : '<div style="width:36px;height:36px;border-radius:50%;background:var(--gray-100);color:var(--gray-900);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:14px;flex-shrink:0;letter-spacing:-0.2px">' + esc(initial) + '</div>';
    var primary = hasName ? displayName : email;
    var secondary = hasName ? email : '';
    // flex-wrap: si la ventana es angosta, el bloque de botones baja
    // completo a una segunda línea en vez de aplastar los textos
    return '<div class="admin-row" style="display:flex;align-items:center;gap:10px 14px;padding:14px 18px;border-top:1px solid var(--gray-100);flex-wrap:wrap">'
         + avatar
         + '<div style="flex:1;min-width:150px">'
         + '<div style="font-size:14px;font-weight:500;color:var(--gray-900);letter-spacing:-0.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(primary) + '</div>'
         + (secondary ? '<div style="font-size:12.5px;color:var(--gray-500);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(secondary) + '</div>' : '')
         + '</div>'
         + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap;row-gap:6px">' + btns + '</div>'
         + '</div>';
  }

  // ─── Acciones de admin ───────────────────────────────────────
  window._approveEmail = async function(email, displayName){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    try {
      var batch = window._slDb.batch();
      batch.set(window._slDb.collection('approved_users').doc(em), {
        email: em,
        displayName: displayName || '',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        approvedBy: (window._slAuth.currentUser && window._slAuth.currentUser.email) || ''
      });
      batch.delete(window._slDb.collection('pending_users').doc(em));
      await batch.commit();
      if (window.showToast) window.showToast(em + ' aprobado', 'success');
    } catch(e){
      console.error('Approve error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  window._rejectEmail = async function(email){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    if (!confirm('¿Rechazar la solicitud de ' + em + '?')) return;
    try {
      await window._slDb.collection('pending_users').doc(em).delete();
      if (window.showToast) window.showToast('Solicitud rechazada', 'info');
    } catch(e){
      console.error('Reject error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Cambia el plan de un usuario aprobado a 'lite', 'basic' o 'pro'.
  // 'pro'   → { premium: true,  lite: false }
  // 'lite'  → { premium: false, lite: true  }
  // 'basic' → { premium: false, lite: false }
  window._setUserPlan = async function(email, plan){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    var data;
    if (plan === 'pro')        data = { premium: true,  lite: false };
    else if (plan === 'lite')  data = { premium: false, lite: true  };
    else                       data = { premium: false, lite: false };
    try {
      await window._slDb.collection('approved_users').doc(em).update(data);
      if (window.showToast) {
        var msg = (plan === 'pro')  ? (em + ' es ahora Pro')
                : (plan === 'lite') ? (em + ' cambiado a Lite')
                                    : (em + ' cambiado a Basic');
        window.showToast(msg, plan === 'lite' ? 'neutral' : 'info');
      }
    } catch(e){
      console.error('setUserPlan error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Rol en la tienda: 'jefe' o 'asesor'. Solo el admin escribe approved_users
  // (firestore.rules); la persona ve el cambio la próxima vez que entra.
  window._setUserRol = async function(email, rol){
    var em = (email||'').toLowerCase().trim();
    if (!em || ['jefe', 'asesor', 'bodega'].indexOf(rol) < 0) return;
    try {
      await window._slDb.collection('approved_users').doc(em).update({ rol: rol });
      if (window.showToast) window.showToast(em + (rol === 'jefe' ? ' es ahora Jefe' : rol === 'bodega' ? ' es ahora Bodega' : ' es ahora Asesor'), 'info');
    } catch(e){
      console.error('setUserRol error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Permite o bloquea las funciones de IA de un usuario, sin tocarle el plan:
  // un Pro con ia:false conserva todo lo demás (Cuadre de Caja incluido) y
  // solo pierde el Asistente IA, "Generar texto" y la API key de Gemini.
  window._setUserIA = async function(email, allow){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    try {
      // set + merge (no update): el doc puede no tener el campo todavía
      await window._slDb.collection('approved_users').doc(em).set({ ia: !!allow }, { merge: true });
      if (window.showToast) {
        window.showToast(allow ? ('IA habilitada para ' + em) : ('IA bloqueada para ' + em), allow ? 'info' : 'neutral');
      }
    } catch(e){
      console.error('setUserIA error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Asigna la sede de un usuario aprobado ('' = sin sede).
  // La sede determina qué notificaciones de recogidas recibe.
  window._setUserSede = async function(email, sede){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    try {
      // set + merge (no update): el doc del super admin puede no existir
      // en approved_users porque su fila se genera sintéticamente
      await window._slDb.collection('approved_users').doc(em).set({ sede: sede || '' }, { merge: true });
      if (window.showToast) {
        var lbl = (typeof window._slSedeLabel === 'function') ? window._slSedeLabel(sede) : sede;
        window.showToast(sede ? (em + ' asignado a ' + lbl) : (em + ' quedó sin sede'), 'info');
      }
    } catch(e){
      console.error('setUserSede error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Letra fija del usuario para el número de cotización (domain.js:
  // quoteDisplayNum). No bloquea el guardado si queda repetida — el campo
  // se pone en rojo en ambas filas (ver dupSet en el listener de abajo) y
  // el admin lo resuelve él mismo cambiando una de las dos.
  window._setUserLetra = async function(email, letra){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    var L = String(letra || '').trim().toUpperCase().replace(/[^A-ZÑ]/g, '').charAt(0);
    try {
      // set + merge (no update): el doc del super admin puede no existir
      // en approved_users porque su fila se genera sintéticamente
      await window._slDb.collection('approved_users').doc(em).set({ letra: L }, { merge: true });
      var clash = _lastApprovedEntries.find(function(e){ return e.email !== em && e.letra === L; });
      if (L && clash && window.showToast) {
        window.showToast('"' + L + '" también la tiene ' + (clash.displayName || clash.email) + ' — quedaron en rojo hasta que cambies una', 'warn');
      } else if (window.showToast) {
        window.showToast(L ? ('Letra "' + L + '" asignada a ' + em) : ('Letra quitada a ' + em), L ? 'info' : 'neutral');
      }
    } catch(e){
      console.error('setUserLetra error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Rellena de una sola vez las letras que falten, sin tocar las ya
  // asignadas (ni la del admin). Toma la inicial del nombre si está libre
  // — que es lo que ya dicen las cotizaciones viejas de esa persona, así
  // que arrastra menos confusión — y si está ocupada cae a otra letra
  // libre al azar. No reasigna: cambiarle la letra a alguien que ya
  // cotizó parte su numeración en dos (las viejas quedan con la anterior).
  window._autoAsignarLetras = async function(){
    var libres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var usadas = {};
    _lastApprovedEntries.forEach(function(e){ if (e.letra) usadas[e.letra] = 1; });
    var faltan = _lastApprovedEntries.filter(function(e){ return !e.letra; });
    if (!faltan.length) {
      if (window.showToast) window.showToast('Todos los usuarios ya tienen letra', 'info');
      return;
    }
    var disponibles = libres.filter(function(L){ return !usadas[L]; });
    if (disponibles.length < faltan.length) {
      if (window.showToast) window.showToast('No alcanzan las letras del abecedario para ' + faltan.length + ' usuarios', 'error');
      return;
    }
    if (!confirm('Se le va a asignar una letra a ' + faltan.length + ' usuario(s) sin letra.\n\nLos que ya tienen una NO se tocan. ¿Seguir?')) return;

    // Barajado Fisher-Yates para el fallback aleatorio
    for (var i = disponibles.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = disponibles[i]; disponibles[i] = disponibles[j]; disponibles[j] = t;
    }
    try {
      var batch = window._slDb.batch();
      faltan.forEach(function(e){
        var ini = String(e.displayName || e.email || '').trim().toUpperCase().replace(/[^A-Z]/g, '').charAt(0);
        var L;
        if (ini && disponibles.indexOf(ini) >= 0) L = disponibles.splice(disponibles.indexOf(ini), 1)[0];
        else L = disponibles.pop();
        usadas[L] = 1;
        batch.set(window._slDb.collection('approved_users').doc(e.email), { letra: L }, { merge: true });
      });
      await batch.commit();
      if (window.showToast) window.showToast(faltan.length + ' letra(s) asignada(s)', 'success');
    } catch(e){
      console.error('autoAsignarLetras error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // Compatibilidad hacia atrás (por si quedó referenciado en algún sitio)
  window._togglePremium = function(email, currentIsPremium){
    return window._setUserPlan(email, currentIsPremium ? 'basic' : 'pro');
  };

  window._removeApproved = async function(email){
    var em = (email||'').toLowerCase().trim();
    if (!em) return;
    if (!confirm('¿Quitar acceso a ' + em + '?\n\nNo podrá entrar a la app hasta que lo vuelvas a aprobar.')) return;
    try {
      await window._slDb.collection('approved_users').doc(em).delete();
      if (window.showToast) window.showToast(em + ' removido', 'info');
    } catch(e){
      console.error('Remove error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  // ─── Modo mantenimiento ──────────────────────────────────────
  // Mantenimiento y Suspensión son excluyentes: activar uno apaga el otro
  // en el mismo batch para evitar estados inconsistentes.
  window._toggleMaintenance = async function(){
    var btn = document.getElementById('btnMaintenance');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      var doc = await window._slDb.collection('config').doc('maintenance').get();
      var current = doc.exists && doc.data().enabled;
      var newVal = !current;
      var batch = window._slDb.batch();
      batch.set(window._slDb.collection('config').doc('maintenance'), { enabled: newVal });
      if (newVal) batch.set(window._slDb.collection('config').doc('suspended'), { enabled: false });
      await batch.commit();
      _updateMaintenanceBtn(newVal);
      if (newVal) _updateSuspendedBtn(false);
      if (window.showToast) window.showToast(
        newVal ? 'Mantenimiento activado — solo tú puedes entrar' : 'Mantenimiento desactivado — acceso restaurado',
        newVal ? '#ef4444' : '#22c55e', '#fff'
      );
    } catch(e){
      console.error('Maintenance toggle error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
      if (btn) { btn.disabled = false; }
    }
  };

  function _updateMaintenanceBtn(enabled){
    var btn = document.getElementById('btnMaintenance');
    if (!btn) return;
    btn.disabled = false;
    if (enabled) {
      btn.textContent = 'Desactivar';
      btn.style.background = '#ef4444';
      btn.style.color = '#fff';
    } else {
      btn.textContent = 'Activar';
      btn.style.background = 'var(--gray-200)';
      btn.style.color = 'var(--gray-900)';
    }
  }

  // ─── Suspender proyecto ──────────────────────────────────────
  // Bloquea acceso a todos excepto admins y usuarios Pro.
  // Excluyente con mantenimiento — activar éste apaga el otro.
  window._toggleSuspended = async function(){
    var btn = document.getElementById('btnSuspended');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      var doc = await window._slDb.collection('config').doc('suspended').get();
      var current = doc.exists && doc.data().enabled;
      var newVal = !current;
      var batch = window._slDb.batch();
      batch.set(window._slDb.collection('config').doc('suspended'), { enabled: newVal });
      if (newVal) batch.set(window._slDb.collection('config').doc('maintenance'), { enabled: false });
      await batch.commit();
      _updateSuspendedBtn(newVal);
      if (newVal) _updateMaintenanceBtn(false);
      if (window.showToast) window.showToast(
        newVal ? 'Proyecto suspendido — solo Pro pueden entrar' : 'Suspensión desactivada — acceso restaurado',
        newVal ? '#dc2626' : '#22c55e', '#fff'
      );
    } catch(e){
      console.error('Suspended toggle error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
      if (btn) { btn.disabled = false; }
    }
  };

  function _updateSuspendedBtn(enabled){
    var btn = document.getElementById('btnSuspended');
    if (!btn) return;
    btn.disabled = false;
    if (enabled) {
      btn.textContent = 'Desactivar';
      btn.style.background = '#dc2626';
      btn.style.color = '#fff';
    } else {
      btn.textContent = 'Activar';
      btn.style.background = 'var(--gray-200)';
      btn.style.color = 'var(--gray-900)';
    }
  }

  // ─── Marca personalizada (white-label) ──────────────────────
  // Estado pendiente del editor: logo subido pero aún no guardado.
  // Se commitea a Firestore cuando el admin presiona "Guardar cambios".
  var _pendingBrandLogo = null;

  // Lee config/branding y rellena la UI del editor.
  function _loadBrandingIntoUi() {
    window._slDb.collection('config').doc('branding').get().then(function(doc){
      var data = doc.exists ? doc.data() : {};
      var enabled = !!data.enabled;
      _updateBrandingToggleBtn(enabled);
      var fields = document.getElementById('brandingFields');
      if (fields) fields.style.display = enabled ? 'block' : 'none';
      var nameInp = document.getElementById('brandNameInput');
      if (nameInp) nameInp.value = data.brandName || '';
      var prev = document.getElementById('brandLogoPreview');
      var ph = document.getElementById('brandLogoPlaceholder');
      if (prev && ph) {
        if (data.logoUrl) {
          prev.src = data.logoUrl;
          prev.style.display = 'block';
          ph.style.display = 'none';
        } else {
          prev.src = '';
          prev.style.display = 'none';
          ph.style.display = 'block';
        }
      }
      _pendingBrandLogo = null;
    }).catch(function(){ _updateBrandingToggleBtn(false); });
  }

  function _updateBrandingToggleBtn(enabled){
    var btn = document.getElementById('btnBrandingToggle');
    if (!btn) return;
    btn.disabled = false;
    if (enabled) {
      btn.textContent = 'Desactivar';
      btn.style.background = 'var(--gray-900)';
      btn.style.color = '#fff';
    } else {
      btn.textContent = 'Activar';
      btn.style.background = 'var(--gray-200)';
      btn.style.color = 'var(--gray-900)';
    }
  }

  window._toggleBrandingEnabled = async function(){
    var btn = document.getElementById('btnBrandingToggle');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try {
      var doc = await window._slDb.collection('config').doc('branding').get();
      var current = doc.exists && doc.data().enabled;
      var newVal = !current;
      window._slBrandingToggling = true;
      await window._slDb.collection('config').doc('branding').set({ enabled: newVal }, { merge: true });
      _updateBrandingToggleBtn(newVal);
      var fields = document.getElementById('brandingFields');
      if (fields) fields.style.display = newVal ? 'block' : 'none';
      if (window.showToast) window.showToast(
        newVal ? 'Marca personalizada activada' : 'Marca personalizada desactivada', 'info');
    } catch(e){
      console.error('Branding toggle error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
      if (btn) btn.disabled = false;
    }
  };

  // Redimensiona una imagen a max 400px en el lado mayor y devuelve un data URL.
  // Mantiene PNG para soportar transparencia (logos típicamente).
  function _resizeImageToDataUrl(file, maxDim) {
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){
        var canvas = document.createElement('canvas');
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          var ratio = w > h ? maxDim / w : maxDim / h;
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = function(){ reject(new Error('No se pudo cargar la imagen')); };
      var reader = new FileReader();
      reader.onload = function(e){ img.src = e.target.result; };
      reader.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
      // SVG no se puede redimensionar via canvas — usar tal cual
      if (file.type === 'image/svg+xml') {
        reader.onload = function(e){ resolve(e.target.result); };
      }
      reader.readAsDataURL(file);
    });
  }

  window._uploadBrandLogo = async function(input){
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (!file.type.startsWith('image/')) {
      if (window.showToast) window.showToast('El archivo debe ser una imagen', 'error');
      return;
    }
    try {
      var dataUrl = await _resizeImageToDataUrl(file, 400);
      // Validar tamaño aproximado del data URL (Firestore limit 1MB por doc)
      if (dataUrl.length > 700000) {
        if (window.showToast) window.showToast('La imagen es muy grande. Usa una más pequeña.', 'error');
        return;
      }
      _pendingBrandLogo = dataUrl;
      var prev = document.getElementById('brandLogoPreview');
      var ph = document.getElementById('brandLogoPlaceholder');
      if (prev) { prev.src = dataUrl; prev.style.display = 'block'; }
      if (ph) ph.style.display = 'none';
      if (window.showToast) window.showToast('Logo cargado · presiona Guardar', 'info');
    } catch(e){
      console.error('Logo upload error:', e);
      if (window.showToast) window.showToast('Error procesando la imagen', 'error');
    }
    // Limpiar el input para permitir re-subir el mismo archivo si el usuario quiere
    input.value = '';
  };

  window._saveBranding = async function(){
    var nameInp = document.getElementById('brandNameInput');
    var name = nameInp ? (nameInp.value || '').trim() : '';
    if (!name) {
      if (window.showToast) window.showToast('Escribe el nombre de la marca', 'warn');
      return;
    }
    var data = { brandName: name, enabled: true };
    if (_pendingBrandLogo) data.logoUrl = _pendingBrandLogo;
    try {
      await window._slDb.collection('config').doc('branding').set(data, { merge: true });
      _pendingBrandLogo = null;
      if (window.showToast) window.showToast('Marca actualizada', 'success');
    } catch(e){
      console.error('Save branding error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  window._triggerLiteAdAll = async function(){
    try {
      await window._slDb.collection('config').doc('lite_ad_trigger').set({ triggerTime: Date.now() });
      if (window.showToast) window.showToast('Anuncio disparado a todos los asesores Lite', 'success');
    } catch(e) {
      console.error('Trigger ad error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  window._forceRefreshAll = async function(){
    try {
      await window._slDb.collection('config').doc('force_reload').set({ triggerTime: Date.now() });
      if (window.showToast) window.showToast('F5 enviado a todas las sesiones activas', 'success');
    } catch(e) {
      console.error('Force reload error:', e);
      if (window.showToast) window.showToast('Error: ' + (e.message||e.code), 'error');
    }
  };

  window._adminAddEmail = async function(){
    var inp = document.getElementById('adminAddEmail');
    if (!inp) return;
    var em = (inp.value||'').toLowerCase().trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      if (window.showToast) window.showToast('Email inválido', 'error');
      return;
    }
    await window._approveEmail(em, '');
    inp.value = '';
  };

  // ─── Montaje del panel (idempotente) ─────────────────────────
  window._mountAdminPanel = function(){
    if (_adminMounted) return;
    if (!window._slDb) return;
    var currentEmail = window._slAuth.currentUser && window._slAuth.currentUser.email;
    if (!currentEmail || window.SUPER_ADMINS.indexOf(currentEmail.toLowerCase()) < 0) return;
    _adminMounted = true;

    window._slDb.collection('config').doc('maintenance').get()
      .then(function(doc){ _updateMaintenanceBtn(doc.exists && doc.data().enabled); })
      .catch(function(){ _updateMaintenanceBtn(false); });

    window._slDb.collection('config').doc('suspended').get()
      .then(function(doc){ _updateSuspendedBtn(doc.exists && doc.data().enabled); })
      .catch(function(){ _updateSuspendedBtn(false); });

    _loadBrandingIntoUi();

    _unsubPending = window._slDb.collection('pending_users').orderBy('requestedAt','desc').onSnapshot(function(snap){
      var list = document.getElementById('pendingList');
      var count = document.getElementById('pendingCount');
      var badge = document.getElementById('adminBadge');
      if (!list) return;
      var n = snap.size;
      if (count) count.textContent = n;
      if (badge) { if (n > 0) { badge.textContent = n; badge.style.display = 'inline-block'; } else { badge.style.display = 'none'; } }
      if (n === 0) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No hay solicitudes pendientes</div>';
        return;
      }
      var html = '';
      snap.forEach(function(doc){
        var d = doc.data();
        html += _emailRow({ email: d.email || doc.id, displayName: d.displayName || '', photoURL: d.photoURL || '' }, 'pending');
      });
      list.innerHTML = html;
    }, function(err){ console.error('pending snapshot error:', err); });

    _unsubApproved = window._slDb.collection('approved_users').onSnapshot(function(snap){
      var list = document.getElementById('approvedList');
      var count = document.getElementById('approvedCount');
      if (!list) return;
      // Incluir super admins aunque no estén en la BD
      var entries = [];
      snap.forEach(function(doc){
        var d = doc.data();
        entries.push({ email: d.email || doc.id, displayName: d.displayName || '', premium: d.premium || false, lite: d.lite || false, ia: d.ia !== false, sede: d.sede || '', letra: d.letra || '', rol: d.rol === 'jefe' ? 'jefe' : 'asesor' });
      });
      // Asegurar que el super admin aparezca
      window.SUPER_ADMINS.forEach(function(sa){
        if (!entries.find(function(e){return e.email===sa;})) entries.unshift({ email: sa, displayName: 'Administrador' });
      });
      _lastApprovedEntries = entries;
      var dupSet = {};
      entries.forEach(function(e){ if (e.letra) dupSet[e.letra] = (dupSet[e.letra] || 0) + 1; });
      if (count) count.textContent = entries.length;
      if (!entries.length) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Sin usuarios aprobados</div>';
        return;
      }
      list.innerHTML = entries.map(function(e){return _emailRow(e,'approved',dupSet);}).join('');
    }, function(err){
      console.error('approved snapshot error:', err);
      var list = document.getElementById('approvedList');
      var count = document.getElementById('approvedCount');
      if (list) {
        // Si es admin, igual mostrar el super admin aunque falle la BD
        if (err.code === 'permission-denied') {
          var entries = window.SUPER_ADMINS.map(function(sa){ return { email: sa, displayName: 'Administrador' }; });
          if (count) count.textContent = entries.length;
          list.innerHTML = entries.map(function(e){ return _emailRow(e,'approved'); }).join('');
        } else {
          if (count) count.textContent = '0';
          list.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">Error al cargar usuarios</div>';
        }
      }
    });
  };
})();
