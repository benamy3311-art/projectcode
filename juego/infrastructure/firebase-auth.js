// ============================================================
// FIREBASE AUTH LAYER
// ============================================================
// Inicializa Firebase, expone helpers globales y maneja el flujo
// de login/logout, aprobación de usuarios y modo mantenimiento.
//
// Globales que expone (window.*):
//   _slAuth, _slProvider, _slDb       — handles de Firebase
//   SUPER_ADMINS                      — lista de emails admin
//   _isApproved(email)                — chequea si un email está aprobado
//   _submitPending(user)              — registra solicitud pendiente
//   _showLoginError(msg)              — pinta error en overlay de login
//   _loginGoogle()                    — abre popup de Google sign-in
//   _logout()                         — cierra sesión y recarga
//   _copyEmail()                      — copia email del overlay pendiente
//
// Depende de: firebase-app-compat, firebase-auth-compat, firebase-firestore-compat
// Requiere DOM: #loginOverlay, #pendingOverlay, #pausedOverlay, #authLoading
// ============================================================
(function(){
  // Hint preemptivo sincrónico: si fue Lite en su sesión anterior,
  // marcamos el flag de inmediato en la carga del script para que
  // los scripts de UI/servicios subsiguientes lean _isLite() = true
  // desde el primer instante.
  try { if (localStorage.getItem('sl_was_lite') === '1') window._slUserIsLite = true; } catch(e){}

  var firebaseConfig = {
    apiKey: "demo-sin-clave",
    authDomain: "speedlogic-cotizador.firebaseapp.com",
    projectId: "speedlogic-cotizador",
    storageBucket: "speedlogic-cotizador.firebasestorage.app",
    messagingSenderId: "310063020249",
    appId: "1:310063020249:web:4149cb4a31c4333b00e6c8",
    measurementId: "G-MYSFLDJYGG"
  };
  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var provider = new firebase.auth.GoogleAuthProvider();
  var db = firebase.firestore();
  window._slAuth = auth;
  window._slProvider = provider;
  window._slDb = db;

  // ─── Marca personalizada (white-label) ──────────────────────
  // window._slBranding contiene { brandName, logoUrl, isLite } — siempre
  // refleja la marca activa para este usuario en este momento.
  //
  // MARCA DEL PRODUCTO: ProjectCode es la empresa que vende la suite. Es
  // white-label, así que el nombre y el logo de UNA tienda cliente no pueden
  // ser el default de nadie. Cada
  // cliente pone los suyos en config/branding (admin) y, para los
  // documentos, en Configuración → "Subir logo".
  //
  // Para los usuarios Lite además es un piso legal, no una preferencia: le
  // pagan al desarrollador directamente, así que mostrarles la marca de otra
  // tienda sería uso indebido de marca ajena. Por eso en ese caso se fuerza
  // acá y no se puede cambiar desde el admin.
  var NEUTRAL_BRAND = {
    brandName: 'ProjectCode',
    logoUrl: '' // sin imagen — se renderiza el texto del brand en su lugar
  };
  // "Marca personalizada activa" = a este usuario NO se le pueden mostrar
  // los nombres internos de Projectcode (las listas "Store"/"Lago", el link a
  // la tienda, etc.). Es la misma regla para toda la app: la usan
  // _applyBranding acá abajo y ui/patch-notes.js, que tienen que coincidir
  // siempre. Devuelve false si el branding todavía no se aplicó (arranque).
  window._slIsBranded = function () {
    if (window._slUserIsLite) return true;
    var b = window._slBranding;
    var n = String((b && b.brandName) || '').toLowerCase();
    return !!(b && b.customEnabled && n !== 'projectcode' && n !== 'speedlogic');
  };

  window._slBranding = null;
  window._slAuthResolved = false;
  var _lastBrandingData = null;
  var _lastBrandingJsonStr = null;

  window._applyBranding = function(data) {
    if (data !== undefined) _lastBrandingData = data;

    var brand, logo;
    if (window._slUserIsLite) {
      // Lite: marca neutra forzada — no usa data
      brand = NEUTRAL_BRAND.brandName;
      logo  = NEUTRAL_BRAND.logoUrl;
    } else {
      var d = _lastBrandingData || {};
      var enabled = !!d.enabled;
      // Sin marca configurada se cae a la neutra, NO a la de una tienda
      // concreta: el default del producto no puede ser el logo de un cliente.
      brand = enabled ? (d.brandName || NEUTRAL_BRAND.brandName) : NEUTRAL_BRAND.brandName;
      logo  = enabled ? (d.logoUrl  || NEUTRAL_BRAND.logoUrl)    : NEUTRAL_BRAND.logoUrl;
    }

    // Forzar recarga de página (F5) en todas las pestañas de usuarios si cambian la configuración de marca (solo tras resolución de login)
    var currentStr = JSON.stringify({ enabled: !!(_lastBrandingData && _lastBrandingData.enabled), brandName: brand, logoUrl: logo });
    if (window._slAuthResolved === true && _lastBrandingJsonStr !== null && _lastBrandingJsonStr !== currentStr) {
      // Si el admin acaba de hacer el toggle, no recargar (su propio cambio).
      // Aplicar el branding en vivo. Para las demás pestañas sí recarga.
      if (window._slBrandingToggling) {
        window._slBrandingToggling = false;
      } else {
        window.location.reload();
        return;
      }
    }
    _lastBrandingJsonStr = currentStr;

    window._slBranding = {
      brandName: brand,
      logoUrl: logo,
      isLite: !!window._slUserIsLite,
      customEnabled: !!(_lastBrandingData && _lastBrandingData.enabled)
    };

    if (window._slUserIsLite || !!(_lastBrandingData && _lastBrandingData.enabled)) {
      document.body.classList.add('custom-catalog-active');
    } else {
      document.body.classList.remove('custom-catalog-active');
    }

    // Title del tab. El nombre de marca lo pone el logo/brand; el sufijo
    // describe el producto: "ProjectCode · Suite de ventas".
    document.title = brand + ' · Suite de ventas';

    // Logo del sidebar — si no hay logo (caso Lite), ocultamos el <img>
    // y mostramos el nombre como texto en su lugar
    var sidebarLogo = document.getElementById('sidebarLogo');
    var sidebarText = document.getElementById('sidebarBrandText');
    if (sidebarLogo) {
      if (logo) {
        sidebarLogo.src = logo;
        sidebarLogo.alt = brand;
        sidebarLogo.style.display = '';
        if (sidebarText) sidebarText.style.display = 'none';
      } else {
        sidebarLogo.style.display = 'none';
        if (sidebarText) {
          sidebarText.textContent = brand;
          sidebarText.style.display = '';
        }
      }
    }

    // Label de marca en el modal de upgrade Pro
    var upgradeBrand = document.getElementById('upgradeBrandLabel');
    if (upgradeBrand) upgradeBrand.textContent = brand;

    // Renombrar Store/Lago → Lista 1/Lista 2 cuando la marca es personalizada (o usuario es Lite)
    var isBranded = window._slIsBranded();
    var btnStore = document.getElementById('plBtnStore');
    var btnLago  = document.getElementById('plBtnLago');
    var btnActLago = document.getElementById('btnActivateLago');
    // Siempre «Lista 1» y «Lista 2» (rediseño): «Store» y «Lago» quedan como
    // nombres internos (claves, archivos, Firestore) y no se muestran.
    if (btnStore) btnStore.textContent = 'Lista 1';
    if (btnLago)  btnLago.textContent  = 'Lista 2';
    if (btnActLago) btnActLago.textContent = 'Activar Lista 2';

    // Renombrar etiquetas en el PDF parser
    var pdfLblStore = document.getElementById('pdfLblStore');
    var pdfLblLago = document.getElementById('pdfLblLago');
    if (pdfLblStore) {
      var storeTextNode = Array.from(pdfLblStore.childNodes).find(function(n) {
        return n.nodeType === 3 && n.textContent.trim();
      });
      if (storeTextNode) storeTextNode.textContent = isBranded ? ' Lista 1' : ' Store';
    }
    if (pdfLblLago) {
      var lagoTextNode = Array.from(pdfLblLago.childNodes).find(function(n) {
        return n.nodeType === 3 && n.textContent.trim();
      });
      if (lagoTextNode) lagoTextNode.textContent = isBranded ? ' Lista 2' : ' Lago';
    }

    // La pestaña "Cambios" pinta las mismas etiquetas de lista y las decide
    // con _slIsBranded(): re-render para que el cambio de marca se vea sin
    // recargar (el admin que hace el toggle no recarga, ver arriba).
    if (window.PatchNotes && typeof window.PatchNotes.render === 'function') {
      try { window.PatchNotes.render(); } catch (e) {}
    }

    // Forzar actualización de la vista del catálogo para refrescar etiquetas
    if (typeof switchPriceList === 'function') {
      var activeBtn = document.querySelector('.pl-toggle-btn.active');
      var activeList = 'store';
      if (activeBtn && activeBtn.id === 'plBtnLago') {
        activeList = 'lago';
      }
      switchPriceList(activeList, { force: true });
    }

    // Recargar catálogo para reflejar el cambio de modo (Projectcode ↔ Lite)
    if (typeof autoLoadCatalog === 'function') {
      autoLoadCatalog();
    }
    // Limpiar también la Lista 2 (Lago) en memoria para que no quede
    // el catálogo Projectcode cargado de antes del cambio de marca.
    if (typeof S !== 'undefined' && S.catalogLago) {
      if (window._slBranding && window._slBranding.customEnabled) {
        // Modo marca genérica: vaciar Lago, cargar del localStorage si hay
        S.catalogLago = [];
        if (typeof _isLite === 'function' && _isLite() && typeof _liteLoadCatalog === 'function') {
          var lagoLocal = _liteLoadCatalog('lago');
          if (lagoLocal.length && typeof _processCatalogArray === 'function') {
            S.catalogLago = _processCatalogArray(lagoLocal, 'lago');
          }
        }
      }
    }
  };

  // Re-aplica branding con la última config conocida (útil después del
  // login cuando ya sabemos si el usuario es Lite).
  window._refreshBranding = function() { window._applyBranding(undefined); };

  // Listener global de branding (corre antes incluso del login, para que el
  // logo correcto se vea desde la pantalla de inicio de sesión).
  // Se expone globalmente para poder re-establecerlo con una sesión ya autenticada,
  // previniendo fallos por permisos insuficientes en la carga inicial no-autenticada.
  window._unsubscribeBranding = null;
  window._setupBrandingListener = function() {
    if (typeof window._unsubscribeBranding === 'function') {
      try { window._unsubscribeBranding(); } catch(e){}
    }
    window._unsubscribeBranding = db.collection('config').doc('branding').onSnapshot(function(snap){
      window._applyBranding(snap.exists ? snap.data() : null);
    }, function(err){
      console.warn('Branding listener failed:', err);
    });
  };

  function _ready(fn){ if (document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  _ready(function(){
    // Aplicar branding por defecto de inmediato una vez cargado el DOM
    window._applyBranding(null);
    // Iniciar el listener de marca en tiempo real
    window._setupBrandingListener();
  });

  // Admin tiene acceso garantizado aunque la BD esté vacía
  window.SUPER_ADMINS = ['admin@ejemplo.co'];

  // ─── Aprobación de usuarios ──────────────────────────────────
  window._isApproved = async function(email){
    var em = (email||'').toLowerCase().trim();
    if (!em) return false;
    if (window.SUPER_ADMINS.indexOf(em) >= 0) return true;
    try {
      var maint = await db.collection('config').doc('maintenance').get();
      if (maint.exists && maint.data().enabled) return false;
    } catch(e){ /* sin reglas para config — ignorar, no bloquear */ }
    try {
      var doc = await db.collection('approved_users').doc(em).get();
      return doc.exists;
    } catch(e){ console.error('approved check error:', e); return false; }
  };

  window._submitPending = async function(user){
    var em = (user.email||'').toLowerCase().trim();
    if (!em || window.SUPER_ADMINS.indexOf(em) >= 0) return;
    try {
      var alreadyApproved = await db.collection('approved_users').doc(em).get();
      if (alreadyApproved.exists) return;
      await db.collection('pending_users').doc(em).set({
        email: em,
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        requestedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e){ console.error('pending submit error:', e); }
  };

  // ─── UI del login ────────────────────────────────────────────
  window._showLoginError = function(msg){
    var box = document.getElementById('loginErrorBox');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
    console.error('[Login]', msg);
  };

  // App instalada en el iPhone/Android ("Agregar a inicio"): sin barra de
  // Safari, corriendo en su propio WKWebView. `navigator.standalone` es el
  // flag específico de iOS; `display-mode: standalone` cubre Android/otros.
  function _isStandaloneApp(){
    try {
      if (window.navigator.standalone === true) return true;
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch(e){}
    return false;
  }

  function _resetLoginBtn(btn, origHtml){
    if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
  }

  window._loginGoogle = function(){
    var btn = document.getElementById('btnLoginGoogle');
    var origHtml = btn ? btn.innerHTML : '';
    var errBox = document.getElementById('loginErrorBox');
    if (errBox) errBox.style.display = 'none';

    // App instalada (standalone): signInWithPopup abre window.open(), que en
    // iOS saca el flujo a Safari en un proceso aparte — esa ventana nunca
    // puede avisarle de vuelta a la app que el login terminó, y el botón
    // queda pegado en "Abriendo Google..." para siempre (la promesa nunca
    // se resuelve ni falla, así que ni el catch de abajo se dispara).
    // signInWithRedirect en cambio navega la MISMA página (sin window.open),
    // así que iOS la mantiene dentro de la app instalada y sí vuelve bien.
    if (_isStandaloneApp()) {
      if (btn) { btn.disabled = true; btn.textContent = 'Redirigiendo a Google...'; }
      auth.signInWithRedirect(provider).catch(function(e){
        console.error('Login error (redirect/standalone):', e);
        window._showLoginError('Error: ' + (e.message || e.code || 'desconocido'));
        _resetLoginBtn(btn, origHtml);
      });
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Abriendo Google...'; }
    auth.signInWithPopup(provider).then(function(){
      // Login OK — onAuthStateChanged se encarga del resto
    }).catch(function(e){
      console.error('Login error:', e);
      var code = (e && e.code) || '';
      var human = '';
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        human = 'El navegador bloqueó el popup. Intentando con redirección...';
        window._showLoginError(human);
        // Fallback a redirect
        setTimeout(function(){ auth.signInWithRedirect(provider); }, 600);
        return;
      }
      if (code === 'auth/popup-closed-by-user') {
        human = 'Cerraste la ventana antes de completar el login. Inténtalo de nuevo.';
      } else if (code === 'auth/unauthorized-domain') {
        human = 'Este dominio (' + location.hostname + ') no está autorizado en Firebase. El administrador debe añadirlo.';
      } else if (code === 'auth/network-request-failed') {
        human = 'Error de red. Revisa tu conexión.';
      } else {
        human = 'Error: ' + (e.message || code || 'desconocido');
      }
      window._showLoginError(human);
      _resetLoginBtn(btn, origHtml);
    });
  };

  // Manejar el resultado del redirect (cuando se vuelve de Google)
  auth.getRedirectResult().catch(function(e){
    if (!e || !e.code) return;
    console.error('Redirect error:', e);
    ready(function(){
      var code = e.code;
      var human = code === 'auth/network-request-failed'
        ? 'Error de red. Revisa tu conexión.'
        : 'Error al iniciar sesión: ' + (e.message || code);
      window._showLoginError(human);
      var loading = document.getElementById('authLoading');
      if (loading) loading.style.display = 'none';
    });
  });

  // Red de seguridad: si el usuario vuelve atrás desde la pantalla de Google
  // sin completar el login, la página se restaura desde el bfcache de iOS
  // con el botón tal como quedó — deshabilitado, "Abriendo Google..." para
  // siempre. `pageshow` con persisted:true detecta justo esa restauración.
  window.addEventListener('pageshow', function(ev){
    if (!ev.persisted) return;
    var btn = document.getElementById('btnLoginGoogle');
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Continuar con Google';
    }
  });
  // Cerrar sesión borra de ESTE navegador lo sensible de la cuenta. En tiendas
  // es común el computador compartido, y antes solo se borraba sl_session_id:
  // la siguiente persona encontraba el historial con datos de clientes, la
  // clave de Gemini y el correo de la cuenta.
  //
  // Qué se borra: el historial local de esta cuenta, la clave de IA y el
  // correo guardado. Qué NO: la configuración de la empresa (sl_cfg), que es
  // del dispositivo, y la llave de cifrado, que sola no da acceso a nada sin
  // una cuenta aprobada.
  //
  // Sin perder datos: las cotizaciones que solo están en este dispositivo (Lite
  // no sincroniza, o no se alcanzaron a subir) se conservan salvo que la
  // persona confirme borrarlas. Con force (salida sin preguntar, p. ej. al
  // rechazar los términos) se conservan siempre.
  window._logout = function(force){
    if (!force && !confirm('¿Cerrar sesión?\n\nPor seguridad se borrará de este dispositivo el historial guardado y las claves. Lo que ya está en la nube no se pierde.')) return;

    var histKey = '';
    try {
      var em = (auth.currentUser && auth.currentUser.email || '').toLowerCase().trim();
      histKey = em ? 'cotHistory::' + em : '';
    } catch(e){}

    var borrarHistorial = true;
    try {
      var hist = histKey ? JSON.parse(localStorage.getItem(histKey) || '[]') : [];
      var soloLocales = hist.filter(function(x){ return x && !x._synced; }).length;
      if (soloLocales) {
        borrarHistorial = !force && confirm(
          (soloLocales === 1
            ? 'Hay 1 cotización que solo está en este dispositivo (no está en la nube).'
            : 'Hay ' + soloLocales + ' cotizaciones que solo están en este dispositivo (no están en la nube).')
          + '\n\n'
          + 'Aceptar: borrarlas igual.\nCancelar: conservarlas en este dispositivo.');
      }
    } catch(e){ borrarHistorial = false; } // ante la duda, no borrar datos

    try {
      if (histKey && borrarHistorial) localStorage.removeItem(histKey);
      ['sl_session_id', 'sl_api_key', 'sl_user_email', 'sl_github_pat'].forEach(function(k){
        localStorage.removeItem(k);
      });
      // Fichas de clientes del chat (ui/ficha-cliente.js): llevan datos
      // personales. Los comprobantes que esperan conexión se conservan: son
      // pagos que todavía no están en la nube.
      Object.keys(localStorage).forEach(function(k){
        if (k.indexOf('pc_ficha:') === 0) localStorage.removeItem(k);
      });
    } catch(e){}

    auth.signOut().then(function(){ location.reload(); });
  };

  // Botón "Iniciar sesión de nuevo" del overlay de sesión expulsada
  window._relogin = function(){
    try { localStorage.removeItem('sl_session_id'); } catch(e){}
    // signOut puede no haber terminado aún si llegamos aquí desde el listener,
    // así que llamamos de nuevo (idempotente) antes de recargar
    auth.signOut().catch(function(){}).finally(function(){ location.reload(); });
  };
  window._copyEmail = function(){
    var em = document.getElementById('pendingEmail');
    if (!em) return;
    navigator.clipboard.writeText(em.textContent).then(function(){
      var btn = document.getElementById('btnCopyEmail');
      if (btn) { var old = btn.textContent; btn.textContent = 'Copiado'; setTimeout(function(){btn.textContent=old;},1500); }
    });
  };

  // ─── Flujo principal: reaccionar a cambios de auth ───────────
  // Esperar a que el DOM esté listo para tocar overlays
  function ready(fn){ if (document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  auth.onAuthStateChanged(async function(user){
    ready(async function(){
      try {
        var login = document.getElementById('loginOverlay');
      var pending = document.getElementById('pendingOverlay');
      var loading = document.getElementById('authLoading');
      if (loading) loading.style.display = 'none';
      if (!user){
        if (login) login.style.display = 'flex';
        if (pending) pending.style.display = 'none';
        document.body.classList.remove('ai-unlocked');
        document.body.classList.remove('admin-user');
        return;
      }
      var email = (user.email||'').toLowerCase().trim();
      var isAdmin = window.SUPER_ADMINS.indexOf(email) >= 0;
      // Chequear suspensión primero (más restrictiva: solo admins y Pro pueden entrar)
      if (!isAdmin) {
        try {
          var suspSnap = await db.collection('config').doc('suspended').get();
          if (suspSnap.exists && suspSnap.data().enabled) {
            // Verificar si es Pro — si lo es, pasa; si no, bloquear con overlay severo
            var allowedPro = false;
            try {
              var udCheck = await db.collection('approved_users').doc(email).get();
              allowedPro = udCheck.exists && udCheck.data().premium === true;
            } catch(e){ /* sin permiso — tratar como no-Pro */ }
            if (!allowedPro) {
              var suspended = document.getElementById('suspendedOverlay');
              if (suspended) suspended.style.display = 'flex';
              if (login) login.style.display = 'none';
              if (pending) pending.style.display = 'none';
              return;
            }
          }
        } catch(e){ /* sin reglas — ignorar */ }
      }
      // Chequear mantenimiento antes de validar aprobación
      if (!isAdmin) {
        try {
          var maintSnap = await db.collection('config').doc('maintenance').get();
          if (maintSnap.exists && maintSnap.data().enabled) {
            var paused = document.getElementById('pausedOverlay');
            if (paused) paused.style.display = 'flex';
            if (login) login.style.display = 'none';
            if (pending) pending.style.display = 'none';
            return;
          }
        } catch(e){ /* sin reglas — ignorar */ }
      }
      var approved = await window._isApproved(email);
      if (approved){
        // Aprobado — leer plan: Pro (premium), Lite (lite) o Basic (default)
        var isPremium = isAdmin;
        var isLite = false;
        // Permiso de IA, independiente del plan: sirve para dar acceso Pro
        // completo pero sin las funciones de IA (Asistente IA, Generar texto
        // y la API key de Gemini). Solo bloquea si el campo es exactamente
        // false — ausente o true = lo que diga el plan, como siempre.
        var iaOn = true;
        // Letra fija para el número de cotización (ver domain.js:quoteDisplayNum
        // y ui/admin-panel.js). Se lee para TODOS, admin incluido — a
        // diferencia de premium/lite/ia que el admin siempre tiene fijos.
        var asesorLetter = '';
        // Rol dentro de la tienda (ui/riel.js): 'admin' (SUPER_ADMINS), 'jefe'
        // o 'asesor'. Lo pone el admin en approved_users.rol; sin campo =
        // asesor. Es solo para ordenar la interfaz: lo que un asesor no debe
        // leer lo cierran las reglas de Firestore (isJefe en firestore.rules).
        var rol = isAdmin ? 'admin' : 'asesor';
        try {
          var userDoc = await db.collection('approved_users').doc(email).get();
          if (userDoc.exists) {
            var ud = userDoc.data();
            if (!isAdmin && (ud.rol === 'jefe' || ud.rol === 'bodega')) rol = ud.rol;
            if (!isAdmin) {
              isPremium = ud.premium === true;
              // Pro tiene prioridad sobre Lite si ambos llegaran a estar marcados
              isLite = !isPremium && ud.lite === true;
              iaOn = ud.ia !== false;
            }
            asesorLetter = String(ud.letra || '').trim().charAt(0).toUpperCase();
          }
        } catch(e){ /* sin permiso — tratar como basic, sin letra fija */ }
        window._slUserIsPremium = isPremium;
        window._slUserIsLite = isLite;
        window._slUserIaOn = iaOn;
        window._slAsesorLetter = asesorLetter;
        window._slUserRol = rol;
        try { document.dispatchEvent(new CustomEvent('sl:rol', { detail: { rol: rol } })); } catch(e){}
        // Hint para evitar flash de Projectcode en próximos refreshes
        try {
          if (isLite) localStorage.setItem('sl_was_lite', '1');
          else        localStorage.removeItem('sl_was_lite');
        } catch(e){}
        // Re-establecer el listener de branding con la sesión ahora autenticada
        if (typeof window._setupBrandingListener === 'function') window._setupBrandingListener();
        // Igual que branding: re-enganchar el listener de "Forzar F5" ahora que
        // hay sesión (si se enganchó antes del login, murió con permission-denied).
        if (typeof window._setupForceReloadListener === 'function') window._setupForceReloadListener();
        // Re-aplicar branding ahora que sabemos el plan (forza marca neutra si Lite)
        if (window._refreshBranding) window._refreshBranding();

        if (login) login.style.display = 'none';
        if (pending) pending.style.display = 'none';
        // Nombre de la cuenta de Google (default sugerido). NO se usa como
        // identidad final si la persona ya eligió su propio nombre en este
        // dispositivo (sl_asesor_personal): varias personas comparten un mismo
        // login, así que el nombre personal manda y no se pisa en cada inicio.
        var googleName = (user.displayName || email.split('@')[0]).toUpperCase();
        var personalSet = false;
        try { personalSet = localStorage.getItem('sl_asesor_personal') === '1'; } catch(e){}
        var effectiveName = googleName;
        if (personalSet) {
          try { effectiveName = localStorage.getItem('sl_asesor') || googleName; } catch(e){}
        } else {
          try { localStorage.setItem('sl_asesor', googleName); } catch(e){}
        }
        try { localStorage.setItem('sl_user_email', email); } catch(e){}
        // El historial local ahora se guarda por cuenta (histKey en
        // services.js): el de antes pasa a esta cuenta si todavía no tenía uno.
        // Va antes de montar el sync, que lee y reescribe ese historial.
        if (typeof window._slMigrateHist === 'function') window._slMigrateHist(email);
        if (typeof window.updateHistBadge === 'function') { try { updateHistBadge(); } catch(e){} }
        var ase = document.getElementById('asesor');
        if (ase) ase.value = effectiveName;
        if (window._trackAsesor) window._trackAsesor(effectiveName);
        // Primera vez en este dispositivo: preguntar el nombre real (popup),
        // sugiriendo el de Google. Tras un pequeño delay para que el DOM del
        // cotizador ya esté visible.
        if (!personalSet && window._maybeAskName) {
          setTimeout(function(){ window._maybeAskName(googleName); }, 700);
        }
        // El WhatsApp de la cotización es por-persona (no por cuenta compartida):
        // cada quien guarda el suyo en su propio navegador y se restaura al
        // entrar, en vez de resetearse siempre al número por defecto.
        var waInp = document.getElementById('whatsapp');
        if (waInp) {
          var savedWa = '';
          try { savedWa = localStorage.getItem('sl_whatsapp') || ''; } catch(e){}
          if (savedWa) waInp.value = savedWa;
        }
        if (window._applyPlanBadge) window._applyPlanBadge(isPremium, isLite);
        if (window._applyUserAvatar) window._applyUserAvatar(user, isPremium, isLite);
        if (window._applyAdminState) window._applyAdminState(email, isPremium, isLite, iaOn);
        // Recargar el catálogo una vez resuelto el plan del usuario (asegura carga de catálogo Lite vacío si aplica)
        if (typeof window.autoLoadCatalog === 'function') window.autoLoadCatalog();
        // Si pasa de pendiente a aprobado, limpiar de la cola
        try { await db.collection('pending_users').doc(email).delete(); } catch(e){}
        // Si es admin, montar el panel
        if (window._mountAdminPanel) window._mountAdminPanel();
        // Montar remisiones entre sedes (todos los usuarios aprobados)
        if (window._mountRemisiones) window._mountRemisiones();
        // Buzón de WhatsApp (aprobados no Lite; ui/whatsapp-inbox.js lo verifica)
        if (window._mountWhatsApp) window._mountWhatsApp();
        // Sync del historial de cotizaciones a la nube (no-op para Lite)
        if (window._mountQuotesSync) window._mountQuotesSync();
        // Brief diario (F6) — el delay deja llegar los primeros snapshots
        if (window._maybeShowDailyBrief) setTimeout(function(){ window._maybeShowDailyBrief(); }, 2500);
        if (window.Tour && window.Tour.autoStart) window.Tour.autoStart();
        // Escuchar cambios en tiempo real del modo mantenimiento
        db.collection('config').doc('maintenance').onSnapshot(function(snap){
          var paused = document.getElementById('pausedOverlay');
          var isAdmin = window.SUPER_ADMINS.indexOf(email) >= 0;
          if (!isAdmin && snap.exists && snap.data().enabled) {
            if (paused) paused.style.display = 'flex';
          } else {
            if (paused) paused.style.display = 'none';
          }
        });
        // Escuchar cambios en tiempo real de la suspensión del proyecto
        // (solo admins y Pro pasan — los demás ven el overlay severo)
        db.collection('config').doc('suspended').onSnapshot(function(snap){
          var suspended = document.getElementById('suspendedOverlay');
          var isAdmin = window.SUPER_ADMINS.indexOf(email) >= 0;
          var enabled = snap.exists && snap.data().enabled;
          if (enabled && !isAdmin && !window._slUserIsPremium) {
            if (suspended) suspended.style.display = 'flex';
          } else {
            if (suspended) suspended.style.display = 'none';
          }
        });

        // ─── Sesión única por cuenta ─────────────────────────────
        // Generamos un sessionId único, lo escribimos en Firestore y en
        // localStorage. Un listener en tiempo real expulsa a este
        // dispositivo si otro inicia sesión con el mismo correo (el
        // sessionId remoto deja de coincidir con el local).
        // Los super admins quedan exentos para permitir multi-dispositivo.
        var newSessionId = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : (Date.now() + '-' + Math.random().toString(36).slice(2));

        if (!isAdmin) {
          try {
            await db.collection('approved_users').doc(email).update({
              activeSession: {
                id: newSessionId,
                startedAt: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: (navigator.userAgent || '').slice(0, 200)
              }
            });
          } catch(e){ console.warn('No se pudo escribir activeSession:', e); }
        }
        try { localStorage.setItem('sl_session_id', newSessionId); } catch(e){}

        // Aceptación de términos y tratamiento de datos (ui/legal.js). Va
        // acá, con el login ya resuelto: la constancia se guarda contra el
        // correo de la persona. Si no aceptó la versión vigente, la pantalla
        // bloquea la app hasta que lo haga.
        if (window.Legal && typeof window.Legal.requireAcceptance === 'function') {
          try { window.Legal.requireAcceptance(email); } catch(e){ console.warn('[legal]', e); }
        }

        // Registrar el evento de login (siempre, para notificaciones al admin)
        try {
          await db.collection('login_events').add({
            email: email,
            displayName: user.displayName || '',
            isAdmin: isAdmin,
            clientTime: Date.now(),
            serverTime: firebase.firestore.FieldValue.serverTimestamp(),
            userAgent: (navigator.userAgent || '').slice(0, 200)
          });
        } catch(e){ /* ignorar — falla blanda */ }

        // Listener de expulsión: si el activeSession.id remoto cambia
        // (otro dispositivo se logueó), cerramos esta sesión.
        if (!isAdmin) {
          db.collection('approved_users').doc(email).onSnapshot(function(snap){
            if (!snap.exists) return;
            var data = snap.data() || {};
            var remoteSession = data.activeSession;
            if (!remoteSession || !remoteSession.id) return;
            var local = '';
            try { local = localStorage.getItem('sl_session_id') || ''; } catch(e){}
            if (local && remoteSession.id !== local) {
              // Hemos sido expulsados — desuscribir todo, mostrar overlay y salir
              try { localStorage.removeItem('sl_session_id'); } catch(e){}
              var kicked = document.getElementById('sessionKickedOverlay');
              if (kicked) kicked.style.display = 'flex';
              // Cerrar sesión sin recargar — el overlay bloquea la UI hasta que el usuario reintente
              auth.signOut().catch(function(){});
            }
          }, function(err){ console.warn('Session listener error:', err); });
        }

        // Notificaciones al super admin cuando OTRO usuario inicia sesión
        if (isAdmin) {
          var _adminInitialSnapshot = true;
          db.collection('login_events').orderBy('serverTime', 'desc').limit(10)
            .onSnapshot(function(snap){
              // Saltar la primera ráfaga (eventos históricos)
              if (_adminInitialSnapshot) { _adminInitialSnapshot = false; return; }
              snap.docChanges().forEach(function(change){
                if (change.type !== 'added') return;
                var d = change.doc.data() || {};
                // Ignorar eventos sin timestamp del servidor todavía
                if (!d.serverTime) return;
                // No notificarse a sí mismo
                if (d.email === email) return;
                var who = d.displayName || d.email || 'Alguien';
                if (window.showToast) {
                  window.showToast(who + ' inició sesión', 'info', null, 6500);
                }
              });
            }, function(err){ console.warn('Admin login listener error:', err); });
        }
      } else {
        // Pendiente de aprobación — registrar la solicitud en Firestore
        await window._submitPending(user);
        if (login) login.style.display = 'none';
        if (pending) {
          pending.style.display = 'flex';
          var em = document.getElementById('pendingEmail');
          if (em) em.textContent = email;
        }
        document.body.classList.remove('ai-unlocked');
      }
      } finally {
        window._slAuthResolved = true;
      }
    });
  });
})();
