// ============================================================
// REMISIONES ENTRE SEDES
// ============================================================
// Módulo de comunicación entre sedes: cuando un cliente compra en
// la sede X para recoger en la sede Y, se registra una "recogida"
// en Firestore y TODOS los usuarios de la sede Y reciben una
// notificación en tiempo real (banner + sonido + badge en el tab,
// y notificación nativa del navegador si el usuario la activó).
//
// Datos:
//   approved_users/{email}.sede  — 'plaza' | 'centro' | 'lago'
//   remisiones/{id}              — { cliente, telefono, productos,
//     sedeOrigen, sedeDestino, vendedorEmail, vendedorNombre, notas,
//     imagen (data URL opcional),
//     estado: 'pendiente'|'preparado'|'entregado',
//     createdAt, preparadoPor/Email/At, entregadoPor/Email/At }
//
// Avisos de estado: al pasar a 'entregado' se notifica tanto a quien
// registró la recogida (vendedorEmail) como a quien la alistó
// (preparadoPor/Email) — a este último incluso si tenía la app cerrada
// cuando se entregó (ver _avisarEntregasNoVistas).
//
// El "Historial de entregas" (recogidas en estado 'entregado') es visible
// para todo el equipo sin filtrar por sede — es información de auditoría.
// Por seguridad no se guarda indefinidamente: el admin purga (borra) las
// entregas de más de 30 días cada vez que abre la app (_remPurgeAntiguas).
// Lo pendiente/preparado nunca se purga, sin importar la antigüedad.
//
// Globales que expone (window.*):
//   SL_SEDES                — catálogo de sedes {id,label}
//   _slSedeLabel(id)        — etiqueta legible de una sede
//   _mountRemisiones()      — inicia listeners (llamar tras login)
//   _remCrear(), _remSetEstado(), _remEliminar(), _remUsarCotizacion()
//   _remSetFiltro(), _remPickDestino(), _remPickOrigen()
//   _remAdjuntarImg(), _remQuitarImg(), _remVerImg(), _remPedirPermiso()
//   _remPurgeAntiguas(), _remLimpiarEntregadas()
//
// Depende de: firebase-auth.js (_slDb, _slAuth, SUPER_ADMINS),
//             ui.js (showToast, switchTab), domain.js (esc)
// Requiere DOM: #panel-rem, #tab-rem, #remBadge
// ============================================================
(function(){

  window.SL_SEDES = [
    { id: 'plaza',  label: 'Plaza Imperial' },
    { id: 'centro', label: 'Centro Mayor'   },
    { id: 'lago',   label: 'Lago'           }
  ];
  window._slSedeLabel = function(id){
    var s = window.SL_SEDES.find(function(x){ return x.id === id; });
    return s ? s.label : (id || 'Sin sede');
  };

  var _mounted = false;
  var _docs = [];              // remisiones en memoria (recientes primero)
  var _initialSnapshot = true; // para no notificar la ráfaga histórica
  var _mySede = '';            // sede del usuario actual ('' = sin asignar)
  var _isAdmin = false;
  var _filtro = 'destino';     // 'destino' | 'origen' | 'todas'
  var _destinoSel = '';        // sede destino elegida en el formulario
  var _origenSel = '';         // sede origen (solo si el usuario no tiene sede)
  var _editingId = null;       // id de la recogida en edición (null = creando una nueva)

  function _esc(s){ return (typeof esc === 'function') ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s); }
  // Para datos dentro de un onclick="fn('…')". Los IDs de las recogidas los
  // elige quien crea el documento, así que pueden traer comillas: _esc() no
  // sirve ahí (ver escJsAttr en domain.js). Sin domain.js cargado, se descarta
  // todo lo que no sea seguro en vez de pasarlo crudo.
  function _js(s){
    return (typeof escJsAttr === 'function')
      ? escJsAttr(s)
      : String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '');
  }
  // Solo fotos en data URL con caracteres base64: así la imagen adjunta no
  // puede cerrar el atributo src e inyectar código. Las fotos de recogidas
  // siempre se recomprimen a JPEG con canvas (_compressImage), así que un
  // valor legítimo nunca queda afuera.
  var IMG_DATA_RE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;
  function _imgSrc(s){
    var v = String(s == null ? '' : s).trim();
    return IMG_DATA_RE.test(v) ? v : '';
  }
  function _toast(msg, bg, fg, ms){ if (typeof showToast === 'function') showToast(msg, bg, fg, ms); }
  function _myEmail(){
    var u = window._slAuth && window._slAuth.currentUser;
    return u ? (u.email || '').toLowerCase().trim() : '';
  }
  function _origenEfectivo(){ return _mySede || _origenSel; }

  // Nombre del asesor: toma el campo "Asesor" del encabezado de la
  // cotización (el mismo que aparece impreso en los PDFs), que es la
  // identidad real cuando varias personas comparten una sesión/dispositivo.
  // Si está vacío, cae a lo guardado en localStorage y por último al
  // nombre/email de la cuenta de Firebase.
  function _asesorNombre(){
    var inp = document.getElementById('asesor');
    var nombre = (inp && inp.value.trim()) || (typeof _ls !== 'undefined' ? _ls.get('sl_asesor', '') : '') || '';
    if (nombre) return nombre;
    var u = window._slAuth && window._slAuth.currentUser;
    return (u && (u.displayName || u.email)) || '';
  }

  // ¿La acción registrada en la recogida (alistar / entregar) la hice yo?
  // La identidad aquí es doble: la CUENTA (email, que varias personas de una
  // misma sede comparten) y el NOMBRE del asesor (por dispositivo/persona).
  // Con ambos datos manda el nombre, así el aviso le llega a quien realmente
  // hizo la acción y no a todos los que comparten el login. Las recogidas
  // registradas antes de guardar el email se resuelven solo por nombre.
  function _fuiYo(emailAccion, nombreAccion){
    var ea = String(emailAccion || '').toLowerCase().trim();
    var na = String(nombreAccion || '').trim().toLowerCase();
    var yo = String(_asesorNombre() || '').trim().toLowerCase();
    if (!ea) return !!na && na === yo;
    if (ea !== _myEmail()) return false;
    return !(na && yo && na !== yo);
  }

  // Íconos SVG de línea (mismo estilo stroke de los tabs de la app)
  var _ICO = {
    box:   '<path d="M21 8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    pin:   '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    phone: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    note:  '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>',
    clip:  '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    bell:  '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
    arrDl: '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    help:  '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };
  function _ico(name, size, extraStyle){
    return '<svg viewBox="0 0 24 24" style="width:' + (size||14) + 'px;height:' + (size||14) + 'px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px;' + (extraStyle||'') + '">' + _ICO[name] + '</svg>';
  }

  // ─── Sonido de notificación (chime de dos tonos, sin assets) ─
  function _playChime(){
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!window._slAudioCtx) window._slAudioCtx = new Ctx();
      var ctx = window._slAudioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      [[880, 0], [1174.66, 0.14]].forEach(function(t){
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = t[0];
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t[1]);
        gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t[1] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t[1] + 0.5);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + t[1]); osc.stop(ctx.currentTime + t[1] + 0.55);
      });
    } catch(e){ /* sonido es best-effort */ }
  }

  // ─── Notificación nativa del navegador (opt-in) ──────────────
  // Cubre el caso "estoy en otra pestaña / la app minimizada".
  window._remPedirPermiso = function(){
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(function(perm){
      var banner = document.getElementById('remNotifBanner');
      if (banner) banner.style.display = 'none';
      _toast(perm === 'granted' ? 'Avisos del navegador activados' : 'Avisos del navegador no activados', perm === 'granted' ? 'success' : 'neutral');
    });
  };
  function _nativeNotify(titulo, cuerpo){
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (!document.hidden) return; // si la app está visible, el banner interno basta
      var n = new Notification(titulo, { body: cuerpo, tag: 'sl-remision' });
      n.onclick = function(){ window.focus(); if (typeof switchTab === 'function') switchTab('rem'); n.close(); };
    } catch(e){ /* best-effort */ }
  }

  // ─── Notificación grande (banner flotante dentro de la app) ──
  function _bigNotify(titulo, cuerpo){
    var old = document.getElementById('remBigNotify');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'remBigNotify';
    el.className = 'rem-bignotify';
    el.innerHTML =
      '<div class="rem-bignotify-ico">' + _ico('box', 22) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="rem-bignotify-title">' + _esc(titulo) + '</div>' +
        '<div class="rem-bignotify-body">' + _esc(cuerpo) + '</div>' +
      '</div>' +
      '<button class="rem-bignotify-btn" onclick="switchTab(\'rem\');document.getElementById(\'remBigNotify\').remove()">Ver</button>' +
      '<button class="rem-bignotify-x" onclick="document.getElementById(\'remBigNotify\').remove()">&times;</button>';
    document.body.appendChild(el);
    setTimeout(function(){ if (el.parentNode) el.classList.add('gone'); }, 12000);
    setTimeout(function(){ if (el.parentNode) el.remove(); }, 12600);
  }

  // ─── Aviso a quien alistó la recogida ────────────────────────
  // Cuando alguien marca «Entregado», el que la alistó recibe el aviso de
  // que ya salió (cierra su ciclo: alistó → se entregó). Como el listener
  // solo ve cambios en vivo, se perdería si tenía la app cerrada: por eso
  // los ids ya avisados quedan en localStorage y al entrar se revisan las
  // entregas recientes que alisté y de las que todavía no me enteré.
  var REM_AVISADAS_KEY = 'sl_rem_entr_avisadas';
  var REM_AVISO_HORAS = 48;   // más viejo que esto ya no vale la pena avisar

  function _avisadasGet(){
    try {
      var v = JSON.parse(localStorage.getItem(REM_AVISADAS_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch(e){ return []; }
  }
  // Marca como "ya evaluada" toda entrega que conocemos en este momento (más
  // un id extra opcional). Así la lista se mantiene acotada sola: solo guarda
  // ids que siguen existiendo, y las entregas viejas las borra la purga.
  function _avisadasSync(extraId){
    var ids = {};
    _docs.forEach(function(d){ if (d.estado === 'entregado') ids[d._id] = 1; });
    if (extraId) ids[extraId] = 1;
    try { localStorage.setItem(REM_AVISADAS_KEY, JSON.stringify(Object.keys(ids).slice(-300))); } catch(e){}
  }

  function _laAlisteYo(d){
    return _fuiYo(d.preparadoEmail, d.preparadoPor) && !_fuiYo(d.entregadoEmail, d.entregadoPor);
  }

  // Aviso completo (chime + banner grande + aviso nativo si está en otra
  // pestaña), igual de fuerte que una recogida entrante.
  function _notificarEntregaAlistada(d){
    var titulo = 'Ya se entregó lo que alistaste';
    var cuerpo = (d.cliente || 'Cliente') + ' recibió sus productos' +
      (d.entregadoPor ? ' · entregó ' + d.entregadoPor : '');
    _toast('Se entregó la recogida de ' + (d.cliente || 'cliente') + ' que alistaste', 'success', null, 6000);
    _playChime();
    _bigNotify(titulo, cuerpo);
    _nativeNotify(titulo, cuerpo);
  }

  // Entregas de cosas que alisté y que ocurrieron con la app cerrada.
  function _avisarEntregasNoVistas(){
    var vistas = _avisadasGet();
    var nuevas = _docs.filter(function(d){
      if (d.estado !== 'entregado') return false;
      if (vistas.indexOf(d._id) >= 0) return false;
      if (_horasDesde(d.entregadoAt || d.createdAt) > REM_AVISO_HORAS) return false;
      return _laAlisteYo(d);
    });
    _avisadasSync(); // todo lo entregado de ahora queda evaluado, avise o no
    if (!nuevas.length) return;
    if (nuevas.length === 1) { _notificarEntregaAlistada(nuevas[0]); return; }
    var titulo = 'Se entregaron ' + nuevas.length + ' recogidas que alistaste';
    var cuerpo = nuevas.map(function(d){ return d.cliente || 'Cliente'; }).join(', ');
    _toast(titulo, 'success', null, 6000);
    _playChime();
    _bigNotify(titulo, cuerpo);
    _nativeNotify(titulo, cuerpo);
  }

  // Recogidas activas que me competen (mi sede, o todas si soy admin).
  // Lo usa el brief diario (daily-brief.js) — misma lógica del badge.
  window._remPendingForMe = function(){
    return _docs.filter(function(d){
      if (d.estado === 'entregado') return false;
      if (_isAdmin) return true;
      return _mySede && d.sedeDestino === _mySede;
    }).length;
  };

  // ─── Badge del tab + contador en el título de la pestaña ─────
  function _updateBadge(){
    var badge = document.getElementById('remBadge');
    var n = window._remPendingForMe();
    if (badge) {
      if (n > 0) { badge.textContent = n; badge.style.display = 'inline-block'; }
      else badge.style.display = 'none';
    }
    // Prefijo "(n)" en el título del navegador — visible aunque estén en otra pestaña
    var base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = (n > 0 ? '(' + n + ') ' : '') + base;
  }

  // ─── Tiempo relativo y antigüedad ────────────────────────────
  function _tsDate(ts){ try { return ts && ts.toDate ? ts.toDate() : null; } catch(e){ return null; } }
  function _tiempoRel(ts){
    var d = _tsDate(ts);
    if (!d) return '';
    var mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'ahora mismo';
    if (mins < 60) return 'hace ' + mins + ' min';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return 'hace ' + hrs + ' h';
    var dias = Math.floor(hrs / 24);
    return 'hace ' + dias + (dias === 1 ? ' día' : ' días');
  }
  function _horasDesde(ts){
    var d = _tsDate(ts);
    return d ? (Date.now() - d.getTime()) / 3600000 : 0;
  }

  // ─── Imagen adjunta (orden de pedido, comprobante, etc.) ─────
  // Se guarda como data URL JPEG comprimido dentro del doc de Firestore
  // (límite 1MB por doc — comprimimos a máx 1400px y validamos tamaño).
  var _imgPend = null; // data URL pendiente de enviar

  function _compressImage(file, maxDim, quality){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          var r = w > h ? maxDim / w : maxDim / h;
          w = Math.round(w * r); h = Math.round(h * r);
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // fondo blanco (JPEG sin alfa)
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function(){ reject(new Error('No se pudo leer la imagen')); };
      var reader = new FileReader();
      reader.onload = function(e){ img.src = e.target.result; };
      reader.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
      reader.readAsDataURL(file);
    });
  }

  async function _procesarImgFile(file){
    if (!file) return;
    if (!file.type.startsWith('image/')) { _toast('El archivo debe ser una imagen', 'error'); return; }
    try {
      var dataUrl = await _compressImage(file, 1400, 0.8);
      if (dataUrl.length > 900000) dataUrl = await _compressImage(file, 1000, 0.65);
      if (dataUrl.length > 900000) { _toast('La imagen es demasiado grande', 'error'); return; }
      _imgPend = dataUrl;
      _renderImgPreview();
      _toast('Imagen adjuntada', 'success', null, 2500);
    } catch(e){
      console.error('rem img error:', e);
      _toast('Error procesando la imagen', 'error');
    }
  }

  window._remAdjuntarImg = function(input){
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    input.value = '';
    _procesarImgFile(file);
  };

  // Arrastrar-y-soltar sobre el formulario y pegar (Ctrl+V) con el
  // tab de Recogidas visible — ambos adjuntan la imagen directamente.
  // Se enlazan a #panel-rem (persiste aunque su innerHTML se re-renderice)
  // y a document (paste), una sola vez.
  var _dndBound = false;
  function _bindImgDropPaste(){
    if (_dndBound) return;
    var panel = document.getElementById('panel-rem');
    if (!panel) return;
    _dndBound = true;

    function formCard(){ return panel.querySelector('.rem-form-card'); }
    function hasFiles(e){
      return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
    }

    panel.addEventListener('dragover', function(e){
      if (!hasFiles(e)) return;
      e.preventDefault();
      var card = formCard();
      if (card) card.classList.add('rem-dropzone-over');
    });
    panel.addEventListener('dragleave', function(e){
      // Solo quitar el resaltado al salir del panel, no entre hijos
      if (e.relatedTarget && panel.contains(e.relatedTarget)) return;
      var card = formCard();
      if (card) card.classList.remove('rem-dropzone-over');
    });
    panel.addEventListener('drop', function(e){
      if (!hasFiles(e)) return;
      e.preventDefault();
      var card = formCard();
      if (card) card.classList.remove('rem-dropzone-over');
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) { _procesarImgFile(files[i]); return; }
      }
      _toast('El archivo debe ser una imagen', 'error');
    });

    document.addEventListener('paste', function(e){
      // Solo cuando el panel de Recogidas está visible
      if (!panel.offsetParent && panel.style.display !== 'block') return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
          e.preventDefault();
          _procesarImgFile(items[i].getAsFile());
          return;
        }
      }
    });
  }

  window._remQuitarImg = function(){ _imgPend = null; _renderImgPreview(); };

  function _renderImgPreview(){
    var wrap = document.getElementById('remImgPreviewWrap');
    var lbl = document.getElementById('remImgBtnLbl');
    var btn = document.getElementById('remImgAttachBtn');
    if (!wrap) return;
    if (_imgPend) {
      wrap.style.display = 'flex';
      wrap.innerHTML = '<img src="' + _imgPend + '" class="rem-img-preview" onclick="_remVerImg(this.src)">' +
        '<button class="rem-btn rem-btn-del" onclick="_remQuitarImg()">Quitar imagen</button>';
      if (lbl) lbl.innerHTML = _ico('check', 20) + ' Imagen adjunta';
      if (btn) btn.classList.add('rem-imgattach-ok');
    } else {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      if (lbl) lbl.innerHTML = _ico('clip', 20) + ' Adjuntar imagen';
      if (btn) btn.classList.remove('rem-imgattach-ok');
    }
  }

  // Lightbox para ver la imagen en grande
  window._remVerImg = function(src){
    // Se llama desde un onclick global: cualquiera puede invocarlo con lo que
    // quiera. La imagen se valida otra vez y se arma con el DOM, sin HTML.
    var safe = _imgSrc(src);
    if (!safe) return;
    var old = document.getElementById('remLightbox');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'remLightbox';
    el.className = 'rem-lightbox';
    el.onclick = function(){ el.remove(); };
    var img = document.createElement('img');
    img.src = safe;
    var hint = document.createElement('div');
    hint.className = 'rem-lightbox-hint';
    hint.textContent = 'Clic para cerrar';
    el.appendChild(img);
    el.appendChild(hint);
    document.body.appendChild(el);
  };

  // ─── Render del panel ────────────────────────────────────────
  var EST = {
    pendiente: { label: 'Pendiente', cls: 'rem-est-pend' },
    preparado: { label: 'Preparado', cls: 'rem-est-prep' },
    entregado: { label: 'Entregado', cls: 'rem-est-entr' }
  };

  function _card(d){
    var est = EST[d.estado] || EST.pendiente;
    var paraMi = _mySede && d.sedeDestino === _mySede;
    var horas = _horasDesde(d.createdAt);
    var demorada = d.estado !== 'entregado' && horas >= 24;
    var acciones = '';
    if (d.estado === 'pendiente') {
      acciones = '<button class="rem-btn rem-btn-prep" onclick="_remSetEstado(\'' + _js(d._id) + '\',\'preparado\')">Marcar preparado</button>';
    } else if (d.estado === 'preparado') {
      acciones = '<button class="rem-btn rem-btn-entr" onclick="_remSetEstado(\'' + _js(d._id) + '\',\'entregado\')">' + _ico('check', 13) + ' Entregar al cliente</button>';
    }
    // El autor de la recogida (y el admin) puede editarla mientras no esté
    // entregada — por si le faltó información al registrarla.
    var soyAutor = !!d.vendedorEmail && d.vendedorEmail === _myEmail();
    if ((soyAutor || _isAdmin) && d.estado !== 'entregado') {
      acciones += '<button class="rem-btn rem-btn-edit" onclick="_remEditar(\'' + _js(d._id) + '\')">' + _ico('note', 13) + ' Editar</button>';
    }
    if (_isAdmin) {
      acciones += '<button class="rem-btn rem-btn-del" onclick="_remEliminar(\'' + _js(d._id) + '\')">Eliminar</button>';
    }
    var meta = [];
    meta.push('Registró: ' + _esc(d.vendedorNombre || d.vendedorEmail || '—') + ' (' + _esc(window._slSedeLabel(d.sedeOrigen)) + ')');
    if (d.preparadoPor) meta.push('Preparó: ' + _esc(d.preparadoPor));
    if (d.entregadoPor) meta.push('Entregó: ' + _esc(d.entregadoPor));
    if (d.editadoPor) meta.push('Editado ' + (d.editadoAt ? _tiempoRel(d.editadoAt) + ' ' : '') + 'por ' + _esc(d.editadoPor));
    if (d.createdAt) meta.push(_tiempoRel(d.createdAt));
    var tel = String(d.telefono || '').replace(/\D/g, '');
    var esLocal = d.sedeOrigen === d.sedeDestino;
    var ruta = esLocal
      ? '<span class="rem-local-tag">' + _ico('pin', 11) + ' Recogida local</span> <b>' + _esc(window._slSedeLabel(d.sedeDestino)) + '</b>'
      : _esc(window._slSedeLabel(d.sedeOrigen)) + ' → <b>' + _esc(window._slSedeLabel(d.sedeDestino)) + '</b>';
    return '<div class="rem-card' + (paraMi && d.estado !== 'entregado' ? ' rem-card-mia' : '') + (demorada ? ' rem-card-old' : '') + '">' +
      '<div class="rem-card-head">' +
        '<span class="rem-flecha">' + ruta + '</span>' +
        '<span style="display:flex;align-items:center;gap:6px">' +
          (demorada ? '<span class="rem-est rem-est-old">' + _ico('clock', 11) + ' ' + _tiempoRel(d.createdAt) + '</span>' : '') +
          '<span class="rem-est ' + est.cls + '">' + est.label + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="rem-card-cliente">' + (d._piiLocked ? 'Datos cifrados' : _esc(d.cliente || 'Cliente sin nombre')) +
        (tel ? ' <a class="rem-tel" href="https://wa.me/57' + tel + '" target="_blank" rel="noopener">' + _ico('phone', 12) + ' ' + _esc(d.telefono) + '</a>' : '') +
      '</div>' +
      '<div class="rem-card-prods">' + _esc(d.productos || '').replace(/\n/g, '<br>') + '</div>' +
      (_imgSrc(d.imagen) ? '<img class="rem-card-img" src="' + _esc(_imgSrc(d.imagen)) + '" onclick="_remVerImg(this.src)" title="Ver imagen adjunta">' : '') +
      (d.notas ? '<div class="rem-card-notas">' + _ico('note', 12) + ' ' + _esc(d.notas) + '</div>' : '') +
      '<div class="rem-card-meta">' + meta.join(' · ') + '</div>' +
      (acciones ? '<div class="rem-card-acts">' + acciones + '</div>' : '') +
    '</div>';
  }

  function _renderList(){
    var list = document.getElementById('remList');
    var entrList = document.getElementById('remListEntregadas');
    var entrWrap = document.getElementById('remEntregadasWrap');
    if (!list) return;

    var visibles = _docs.filter(function(d){
      // Las recogidas locales (origen === destino) son asunto interno de esa
      // sede: nadie más las ve, en ningún filtro. El admin sí las ve todas.
      if (d.sedeOrigen === d.sedeDestino && !_isAdmin && d.sedeDestino !== _mySede) return false;
      if (_filtro === 'destino') return _isAdmin ? true : (_mySede ? d.sedeDestino === _mySede : true);
      if (_filtro === 'origen')  return _isAdmin ? true : (_mySede ? d.sedeOrigen === _mySede : true);
      return true;
    });
    var activas = visibles.filter(function(d){ return d.estado !== 'entregado'; });
    // El historial de entregas es información de seguridad/auditoría: se
    // muestra completo a TODOS los usuarios (sin filtrar por sede), a
    // diferencia del tablero de activas. Se conservan ~30 días — ver
    // _remPurgeAntiguas().
    var entregadas = _docs
      .filter(function(d){ return d.estado === 'entregado'; })
      .sort(function(a, b){ return _horasDesde(a.entregadoAt || a.createdAt) - _horasDesde(b.entregadoAt || b.createdAt); });

    list.innerHTML = activas.length
      ? activas.map(_card).join('')
      : '<div class="rem-empty empty-state">No hay recogidas pendientes' + (_filtro === 'destino' && _mySede && !_isAdmin ? ' en ' + _esc(window._slSedeLabel(_mySede)) : '') + '</div>';

    if (entrWrap) entrWrap.style.display = entregadas.length ? 'block' : 'none';
    if (entrList) entrList.innerHTML = entregadas.map(_card).join('');
    _updateBadge();
  }

  window._remSetFiltro = function(f){
    _filtro = f;
    document.querySelectorAll('.rem-seg-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-f') === f);
    });
    _renderList();
  };

  // ─── Formulario ──────────────────────────────────────────────
  function _updateBtnCrear(){
    var btn = document.getElementById('remBtnCrear');
    if (!btn || btn.disabled) return;
    if (_editingId) { btn.textContent = 'Guardar cambios'; return; }
    btn.textContent = !_destinoSel
      ? 'Registrar recogida'
      : (_destinoSel === _origenEfectivo()
        ? 'Registrar recogida local (' + window._slSedeLabel(_destinoSel) + ')'
        : 'Registrar y notificar a ' + window._slSedeLabel(_destinoSel));
  }

  // Alterna el formulario entre "crear" y "editar" (título + botón cancelar).
  function _setFormEditMode(on, d){
    var title = document.getElementById('remFormTitle');
    var cancel = document.getElementById('remBtnCancelEdit');
    if (on){
      if (title) title.textContent = 'Editar recogida' + (d && d.cliente ? ' — ' + d.cliente : '');
      if (cancel) cancel.style.display = '';
    } else {
      if (title) title.textContent = 'Nueva recogida';
      if (cancel) cancel.style.display = 'none';
    }
    _updateBtnCrear();
  }

  // Carga una recogida existente en el formulario para editarla. Reusa el
  // mismo formulario de "nueva recogida" (inputs, imagen y selector de sede).
  window._remEditar = function(id){
    var d = _docs.find(function(x){ return x._id === id; });
    if (!d){ _toast('No se encontró la recogida', 'error'); return; }
    // Sin la llave sus campos llegan vacíos: guardarla los borraría en la nube.
    if (d._piiLocked){ _toast('Esta recogida está cifrada y este dispositivo no tiene la llave de la empresa', 'warn'); return; }
    _editingId = id;
    var g = function(k){ return document.getElementById(k); };
    if (g('remCliente'))   g('remCliente').value   = d.cliente || '';
    if (g('remTelefono'))  g('remTelefono').value  = d.telefono || '';
    if (g('remProductos')) g('remProductos').value = d.productos || '';
    if (g('remNotas'))     g('remNotas').value     = d.notas || '';
    _imgPend = d.imagen || null;
    _renderImgPreview();
    window._remPickDestino(d.sedeDestino || '');
    _setFormEditMode(true, d);
    var card = document.querySelector('.rem-form-card');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    _toast('Editando la recogida — ajusta lo que falte y guarda', 'info', null, 3500);
  };

  // Descarta la edición en curso y limpia el formulario.
  window._remCancelarEdicion = function(){
    _editingId = null;
    _imgPend = null; _renderImgPreview();
    ['remCliente','remTelefono','remProductos','remNotas'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.value = '';
    });
    window._remPickDestino('');
    _setFormEditMode(false);
  };

  // OJO: las filas de origen y destino usan la misma clase visual
  // .rem-dest-btn, así que los selectores SIEMPRE se limitan por el
  // id de su fila (#remDestRow / #remOrigRow) para no cruzarse.
  window._remPickDestino = function(id){
    _destinoSel = id;
    document.querySelectorAll('#remDestRow .rem-dest-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-sede') === id);
    });
    _updateBtnCrear();
  };

  // Solo aplica cuando el usuario no tiene sede asignada.
  // Origen === destino se permite (recogida local en la misma sede).
  window._remPickOrigen = function(id){
    _origenSel = id;
    document.querySelectorAll('#remOrigRow .rem-orig-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-sede') === id);
    });
  };

  // Pre-llenar desde la cotización actual (cliente, whatsapp e items)
  window._remUsarCotizacion = function(){
    var cli = document.getElementById('cliente');
    var wa = document.getElementById('whatsapp');
    var fCli = document.getElementById('remCliente');
    var fTel = document.getElementById('remTelefono');
    var fProd = document.getElementById('remProductos');
    if (fCli && cli && cli.value.trim()) fCli.value = cli.value.trim();
    if (fTel && wa && wa.value.trim()) fTel.value = wa.value.trim();
    if (fProd && typeof items !== 'undefined' && items.length) {
      fProd.value = items.map(function(it){ return it.qty + 'x ' + it.name; }).join('\n');
    }
    if ((!fProd || !fProd.value) && (!fCli || !fCli.value)) {
      _toast('La cotización actual está vacía', 'warn');
    } else {
      _toast('Datos copiados de la cotización actual', 'info');
    }
  };

  // ── Cifrado de datos de clientes (infrastructure/pii-crypto.js) ──
  // Cola de snapshots: descifrar es asíncrono, y si dos snapshots se
  // procesaran a la vez "prev" quedaría mal y se perderían avisos.
  var _remCola = Promise.resolve();
  var _remUltimoRaw = null;

  function _remDescifrar(raw){
    var P = window.PiiCrypto;
    if (!P) return Promise.resolve(raw);
    return Promise.all(raw.map(function(d){
      return P.reveal('remisiones', d._id, d, P.REM_FIELDS).catch(function(){
        return Object.assign({}, d, { cliente: '', telefono: '', productos: '', notas: '', imagen: '', _piiLocked: true });
      });
    }));
  }

  // Al ingresar la llave en este dispositivo: volver a descifrar lo que ya
  // está en pantalla, sin repetir los avisos.
  function _remRedescifrar(){
    _remCola = _remCola.then(async function(){
      if (!_remUltimoRaw) return;
      _docs = await _remDescifrar(_remUltimoRaw);
      _renderList();
    }).catch(function(e){ console.warn('[rem] redescifrar:', e); });
  }

  // Cifra antes de escribir. Sin cifrado activo devuelve el objeto tal cual;
  // con cifrado activo y sin llave lanza: no se guarda texto plano.
  async function _remCifrar(id, data){
    var P = window.PiiCrypto;
    if (!P) return data;
    try {
      return await P.protect('remisiones', id, data, P.REM_FIELDS);
    } catch (e) {
      if (e && e.piiLocked) {
        try { document.dispatchEvent(new CustomEvent('pii:locked', { detail: { source: 'remisiones' } })); } catch (_e) {}
      }
      throw e;
    }
  }

  window._remCrear = async function(){
    var cliente = (document.getElementById('remCliente').value || '').trim();
    var telefono = (document.getElementById('remTelefono').value || '').trim();
    var productos = (document.getElementById('remProductos').value || '').trim();
    var notas = (document.getElementById('remNotas').value || '').trim();
    var editando = !!_editingId;
    var origen = _origenEfectivo();
    if (!cliente)  { _toast('Escribe el nombre del cliente', 'warn'); return; }
    if (!productos){ _toast('Escribe qué producto(s) recoge', 'warn'); return; }
    if (!_destinoSel) { _toast('Elige la sede donde el cliente recoge', 'warn'); return; }
    // Al crear se exige el origen; al editar se conserva el original (no se toca).
    if (!editando && !origen) { _toast('Elige desde qué sede vendes', 'warn'); return; }
    // destino === origen es válido: recogida local (el cliente recoge aquí mismo)

    // Aviso de posible duplicado: mismo cliente con recogida activa al mismo
    // destino. Solo al crear (al editar, el propio doc sería un falso positivo).
    if (!editando) {
      var dup = _docs.find(function(d){
        return d.estado !== 'entregado' && d.sedeDestino === _destinoSel &&
               (d.cliente || '').trim().toLowerCase() === cliente.toLowerCase();
      });
      if (dup && !confirm('Ya hay una recogida activa de "' + cliente + '" en ' + window._slSedeLabel(_destinoSel) + '.\n\n¿Registrar otra de todas formas?')) return;
    }

    var btn = document.getElementById('remBtnCrear');
    if (btn) { btn.disabled = true; btn.textContent = editando ? 'Guardando…' : 'Enviando…'; }
    try {
      if (editando) {
        // Editar: solo el contenido y la sede destino. No se tocan sedeOrigen,
        // vendedorEmail, estado ni createdAt. Si la sede destino cambió, el
        // listener de más abajo notifica a la nueva sede.
        await window._slDb.collection('remisiones').doc(_editingId).update(await _remCifrar(_editingId, {
          cliente: cliente,
          telefono: telefono,
          productos: productos,
          notas: notas,
          sedeDestino: _destinoSel,
          imagen: _imgPend || '',
          editadoPor: _asesorNombre(),
          editadoAt: firebase.firestore.FieldValue.serverTimestamp()
        }));
        _editingId = null;
        _imgPend = null;
        _renderImgPreview();
        ['remCliente','remTelefono','remProductos','remNotas'].forEach(function(id){
          var el = document.getElementById(id); if (el) el.value = '';
        });
        window._remPickDestino('');
        _setFormEditMode(false);
        _toast('Recogida actualizada', 'success', null, 4000);
      } else {
        // doc() + set() en vez de add(): el id tiene que existir ANTES de
        // cifrar, porque cada campo cifrado queda atado a su documento.
        var nuevaRef = window._slDb.collection('remisiones').doc();
        await nuevaRef.set(await _remCifrar(nuevaRef.id, {
          cliente: cliente,
          telefono: telefono,
          productos: productos,
          notas: notas,
          sedeOrigen: origen,
          sedeDestino: _destinoSel,
          vendedorEmail: _myEmail(),
          vendedorNombre: _asesorNombre(),
          estado: 'pendiente',
          imagen: _imgPend || '',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }));
        _imgPend = null;
        _renderImgPreview();
        ['remCliente','remTelefono','remProductos','remNotas'].forEach(function(id){
          var el = document.getElementById(id); if (el) el.value = '';
        });
        var destinoLbl = window._slSedeLabel(_destinoSel);
        var fueLocal = _destinoSel === origen;
        window._remPickDestino('');
        _toast(fueLocal
          ? 'Recogida local registrada — quedó en el tablero de ' + destinoLbl
          : 'Recogida registrada — ' + destinoLbl + ' ya fue notificada', 'success', null, 4500);
      }
    } catch(e){
      console.error('rem guardar error:', e);
      _toast('Error al guardar: ' + (e.message || e.code), 'error');
    } finally {
      if (btn) { btn.disabled = false; _updateBtnCrear(); }
    }
  };

  window._remSetEstado = async function(id, estado){
    if (estado === 'entregado' && !confirm('¿Confirmas que el cliente ya recibió sus productos?')) return;
    var who = _asesorNombre();
    var data = { estado: estado };
    // Se guarda también el email de la cuenta: junto al nombre es lo que
    // permite avisarle después a quien alistó la recogida (ver _fuiYo).
    if (estado === 'preparado') { data.preparadoPor = who; data.preparadoEmail = _myEmail(); data.preparadoAt = firebase.firestore.FieldValue.serverTimestamp(); }
    if (estado === 'entregado') { data.entregadoPor = who; data.entregadoEmail = _myEmail(); data.entregadoAt = firebase.firestore.FieldValue.serverTimestamp(); }
    try {
      await window._slDb.collection('remisiones').doc(id).update(data);
      _toast(estado === 'entregado' ? 'Entregado al cliente' : 'Marcado como preparado', estado === 'entregado' ? 'success' : 'info');
    } catch(e){
      console.error('rem estado error:', e);
      _toast('Error: ' + (e.message || e.code), 'error');
    }
  };

  window._remEliminar = async function(id){
    if (!confirm('¿Eliminar esta recogida definitivamente?')) return;
    try { await window._slDb.collection('remisiones').doc(id).delete(); }
    catch(e){ _toast('Error: ' + (e.message || e.code), 'error'); }
  };

  // Borrado automático por retención: cualquier recogida ENTREGADA con
  // más de 30 días se elimina sola (no se toca nada pendiente/preparado,
  // eso siempre queda visible sin importar la antigüedad). Se dispara
  // desde la sesión del admin al abrir la app — es una limpieza best-effort,
  // no crítica, por eso los errores solo se registran en consola.
  var REM_RETENCION_DIAS = 30;
  window._remPurgeAntiguas = async function(){
    try {
      var snap = await window._slDb.collection('remisiones').where('estado', '==', 'entregado').get();
      var corteMs = Date.now() - REM_RETENCION_DIAS * 24 * 60 * 60 * 1000;
      var aBorrar = snap.docs.filter(function(doc){
        var d = doc.data();
        var ts = d.entregadoAt || d.createdAt;
        var ms = ts && ts.toMillis ? ts.toMillis() : 0;
        return ms && ms < corteMs;
      });
      if (!aBorrar.length) return;
      var batch = window._slDb.batch();
      aBorrar.forEach(function(doc){ batch.delete(doc.ref); });
      await batch.commit();
      console.log('[rem] purgadas ' + aBorrar.length + ' recogidas entregadas de hace más de ' + REM_RETENCION_DIAS + ' días');
    } catch(e){ console.error('rem purge error:', e); }
  };

  // Borra en un solo paso todas las recogidas ya entregadas (útil para
  // limpiar pruebas). Solo visible/usable por administradores.
  window._remLimpiarEntregadas = async function(){
    var entregadas = _docs.filter(function(d){ return d.estado === 'entregado'; });
    if (!entregadas.length) { _toast('No hay recogidas entregadas para borrar', 'neutral'); return; }
    if (!confirm('¿Eliminar las ' + entregadas.length + ' recogidas entregadas? Esta acción no se puede deshacer.')) return;
    try {
      var batch = window._slDb.batch();
      entregadas.forEach(function(d){ batch.delete(window._slDb.collection('remisiones').doc(d._id)); });
      await batch.commit();
      _toast('Recogidas entregadas eliminadas', 'success');
    } catch(e){
      console.error('rem limpiar error:', e);
      _toast('Error al eliminar: ' + (e.message || e.code), 'error');
    }
  };

  // ─── Tutorial guiado (usa el motor de Tour de la app) ────────
  var REM_TOUR_KEY = 'sl_rem_tour_done';

  function _remTourSteps(){
    var steps = [
      {
        el: '#tab-rem',
        title: 'Recogidas entre sedes',
        text: 'Cuando un cliente compra en tu sede pero recoge en otra, regístralo aquí. La otra sede se entera al instante — sin WhatsApp ni llamadas.',
        pos: 'bottom'
      },
      {
        el: '.rem-mysede',
        title: 'Tu sede',
        text: 'Esta es la sede que tienes asignada. Recibirás una notificación con sonido cada vez que alguien registre una recogida para tu sede.',
        pos: 'bottom',
        before: function(){ switchTab('rem'); }
      },
      {
        el: '.rem-form-card',
        title: 'Registrar una recogida',
        text: 'Llena los datos del cliente y qué productos recoge. Puedes adjuntar la orden de pedido o el comprobante de pago como imagen.',
        pos: 'bottom'
      },
      {
        el: '.rem-form-head .rem-btn-ghost',
        title: 'Ahórrate digitar',
        text: 'Si la venta salió de una cotización que hiciste aquí mismo, este botón copia el cliente, el WhatsApp y los productos automáticamente.',
        pos: 'bottom'
      },
      {
        el: '#remDestRow',
        title: 'Dónde recoge el cliente',
        text: 'Elige la sede de recogida y presiona el botón. En ese momento todos en esa sede reciben el aviso — no hace falta avisarle a nadie más.',
        pos: 'top'
      },
      {
        el: '.rem-seg',
        title: 'Tablero de recogidas',
        text: '«Recogen aquí» muestra lo que tu sede debe alistar. «Enviadas por mi sede» muestra tus ventas en camino y en qué estado van.',
        pos: 'bottom'
      },
      {
        el: '#remList',
        title: 'Preparado y entregado',
        text: 'Cuando alistes el pedido marca «Preparado», y al entregarlo al cliente marca «Entregado». El vendedor recibe aviso en cada paso, y quien alistó se entera cuando el pedido sale. Las recogidas con más de un día en espera se resaltan en rojo.',
        pos: 'top'
      }
    ];
    return steps;
  }

  // force=true → siempre (botón «¿Cómo funciona?»); sin force → solo la primera vez
  window._remTour = function(force){
    if (typeof Tour === 'undefined' || !Tour.start) return;
    var visto = false;
    try { visto = (typeof _ls !== 'undefined' ? _ls.get(REM_TOUR_KEY) : localStorage.getItem(REM_TOUR_KEY)) === '1'; } catch(e){}
    if (!force && visto) return;
    switchTab('rem');
    setTimeout(function(){ Tour.start(_remTourSteps(), REM_TOUR_KEY); }, 250);
  };

  // ─── HTML del panel ──────────────────────────────────────────
  function _panelHtml(){
    var sedeBadge;
    if (_isAdmin) {
      sedeBadge = '<span class="rem-mysede">' + _ico('pin', 13) + ' Administrador — recibes las recogidas de <b>todas las sedes</b>' +
        (_mySede ? ' · registras desde <b>' + _esc(window._slSedeLabel(_mySede)) + '</b>' : '') + '</span>';
    } else if (_mySede) {
      sedeBadge = '<span class="rem-mysede">' + _ico('pin', 13) + ' Tu sede: <b>' + _esc(window._slSedeLabel(_mySede)) + '</b></span>';
    } else {
      sedeBadge = '<span class="rem-mysede rem-mysede-warn">' + _ico('alert', 13) + ' No tienes sede asignada — pídele al administrador que te asigne una para recibir notificaciones.</span>';
    }

    // Si el usuario no tiene sede, debe indicar desde dónde vende
    var origenRow = _mySede ? '' :
      '<div class="rem-dest-row" id="remOrigRow"><span class="rem-dest-lbl">Vendes desde:</span>' +
        window.SL_SEDES.map(function(s){
          return '<button class="rem-orig-btn rem-dest-btn" data-sede="' + s.id + '" onclick="_remPickOrigen(\'' + s.id + '\')">' + _esc(s.label) + '</button>';
        }).join('') +
      '</div>';

    // Incluye la propia sede: sirve para "recogidas locales" (el cliente
    // recoge aquí mismo y queda registrado para el resto del turno).
    var destBtns = window.SL_SEDES
      .map(function(s){
        var esMia = s.id === _mySede;
        return '<button class="rem-dest-btn" data-sede="' + s.id + '" onclick="_remPickDestino(\'' + s.id + '\')">' + _esc(s.label) + (esMia ? ' · aquí' : '') + '</button>';
      }).join('');

    var notifBanner = ('Notification' in window && Notification.permission === 'default')
      ? '<div id="remNotifBanner" class="rem-notif-banner">' +
          '<span>' + _ico('bell', 14) + ' Activa los avisos del navegador para enterarte de nuevas recogidas aunque estés en otra pestaña.</span>' +
          '<button class="rem-btn rem-btn-prep" onclick="_remPedirPermiso()">Activar avisos</button>' +
        '</div>'
      : '';

    return '' +
    '<div style="padding:48px 32px 48px;max-width:760px;margin:0 auto;width:100%;box-sizing:border-box">' +
      '<div style="margin-bottom:28px">' +
        '<div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:var(--gray-500);text-transform:uppercase;margin-bottom:8px">Comunicación entre sedes</div>' +
        '<h2 style="font-size:32px;font-weight:700;color:var(--gray-900);margin:0 0 6px;letter-spacing:-0.6px">Recogidas</h2>' +
        '<p style="font-size:15px;color:var(--gray-500);margin:0 0 10px;line-height:1.5">Registra ventas que el cliente recoge en otra sede. La sede destino recibe la notificación al instante.</p>' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' + sedeBadge +
        '<button class="rem-btn-ghost" onclick="_remTour(true)">' + _ico('help', 12) + ' ¿Cómo funciona?</button></div>' +
      '</div>' +
      notifBanner +

      '<section class="rem-form-card">' +
        '<div class="rem-form-head">' +
          '<h3 id="remFormTitle">Nueva recogida</h3>' +
          '<button class="rem-btn-ghost" onclick="_remUsarCotizacion()">' + _ico('arrDl', 12) + ' Usar cotización actual</button>' +
        '</div>' +
        '<div class="rem-form-grid">' +
          '<input id="remCliente" type="text" placeholder="Nombre del cliente *">' +
          '<input id="remTelefono" type="text" placeholder="WhatsApp / Teléfono">' +
        '</div>' +
        '<textarea id="remProductos" rows="3" placeholder="Producto(s) que recoge * — uno por línea"></textarea>' +
        '<input id="remNotas" type="text" placeholder="Observaciones (pago, hora estimada, etc.)">' +
        '<label id="remImgAttachBtn" class="rem-imgattach">' +
          '<span class="rem-imgattach-main"><span id="remImgBtnLbl">' + _ico('clip', 20) + ' Adjuntar imagen</span></span>' +
          '<span class="rem-imgattach-kbd"><kbd>Ctrl</kbd><span>+</span><kbd>V</kbd></span>' +
          '<input type="file" accept="image/*" style="display:none" onchange="_remAdjuntarImg(this)">' +
        '</label>' +
        '<div style="font-size:11.5px;color:var(--gray-400);margin-top:-2px">Orden de pedido, comprobante de pago… también puedes arrastrarla directamente aquí.</div>' +
        '<div id="remImgPreviewWrap" style="display:none;align-items:center;gap:12px"></div>' +
        origenRow +
        '<div class="rem-dest-row" id="remDestRow"><span class="rem-dest-lbl">El cliente recoge en:</span>' + destBtns + '</div>' +
        '<button id="remBtnCrear" class="rem-btn-crear" onclick="_remCrear()">Registrar recogida</button>' +
        '<button id="remBtnCancelEdit" class="rem-btn-ghost" style="display:none;margin-top:8px;width:100%;text-align:center" onclick="_remCancelarEdicion()">Cancelar edición</button>' +
      '</section>' +

      '<section style="margin-top:36px">' +
        '<div class="rem-list-head">' +
          '<h3 style="font-size:13px;font-weight:600;color:var(--gray-900);margin:0;letter-spacing:-0.2px">Tablero de recogidas</h3>' +
          '<div class="rem-seg">' +
            '<button class="rem-seg-btn active" data-f="destino" onclick="_remSetFiltro(\'destino\')">' + (_isAdmin ? 'Activas' : 'Recogen aquí') + '</button>' +
            (_isAdmin ? '' : '<button class="rem-seg-btn" data-f="origen" onclick="_remSetFiltro(\'origen\')">Enviadas por mi sede</button>') +
            '<button class="rem-seg-btn" data-f="todas" onclick="_remSetFiltro(\'todas\')">Todas</button>' +
          '</div>' +
        '</div>' +
        '<div id="remList"><div class="rem-empty empty-state">Cargando…</div></div>' +
        '<div id="remEntregadasWrap" style="display:none;margin-top:28px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:8px">' +
            '<h3 style="font-size:13px;font-weight:600;color:var(--gray-500);margin:0;letter-spacing:-0.2px">Historial de entregas</h3>' +
            (_isAdmin ? '<button class="rem-btn rem-btn-del" onclick="_remLimpiarEntregadas()">Borrar todas las entregadas</button>' : '') +
          '</div>' +
          '<p style="font-size:11px;color:var(--gray-400);margin:0 0 12px">Visible para todo el equipo. Por seguridad, cada entrega se conserva 30 días y luego se borra automáticamente.</p>' +
          '<div id="remListEntregadas" style="opacity:0.65"></div>' +
        '</div>' +
      '</section>' +
    '</div>';
  }

  // ─── Montaje (idempotente, llamado tras login aprobado) ──────
  window._mountRemisiones = async function(){
    if (_mounted) return;
    if (!window._slDb || !window._slAuth || !window._slAuth.currentUser) return;
    _mounted = true;

    var email = _myEmail();
    _isAdmin = window.SUPER_ADMINS.indexOf(email) >= 0;

    // Leer la sede del usuario
    try {
      var snap = await window._slDb.collection('approved_users').doc(email).get();
      _mySede = (snap.exists && snap.data().sede) || '';
    } catch(e){ _mySede = ''; }
    window._slUserSede = _mySede;

    var panel = document.getElementById('panel-rem');
    if (panel) panel.innerHTML = _panelHtml();
    _bindImgDropPaste();

    // Tutorial: se lanza solo la primera vez que el usuario abre el tab
    var tabRem = document.getElementById('tab-rem');
    if (tabRem) tabRem.addEventListener('click', function(){ setTimeout(function(){ window._remTour(false); }, 350); });

    // Cambios de sede en caliente (el admin puede reasignar sin que el usuario recargue)
    window._slDb.collection('approved_users').doc(email).onSnapshot(function(s){
      var nueva = (s.exists && s.data().sede) || '';
      if (nueva !== _mySede) {
        _mySede = nueva;
        window._slUserSede = nueva;
        _origenSel = '';
        var p = document.getElementById('panel-rem');
        if (p) p.innerHTML = _panelHtml();
        window._remSetFiltro(_filtro);
      }
    }, function(){ /* permisos — ignorar */ });

    // Refrescar tiempos relativos y alertas de demora cada minuto
    setInterval(function(){ if (_docs.length) _renderList(); }, 60000);

    // El admin purga (borra) las entregas de hace más de 30 días al abrir
    // la app — así el historial nunca guarda datos de clientes más allá de
    // lo necesario. Solo dispara una vez por sesión.
    if (_isAdmin) setTimeout(_remPurgeAntiguas, 4000);

    // Cifrado: arranca antes del listener, y al ingresar la llave se vuelve a
    // descifrar lo que ya está en pantalla.
    if (window.PiiCrypto) {
      window.PiiCrypto.init();
      window.PiiCrypto.onChange(_remRedescifrar);
    }

    // Listener principal: últimas 400 remisiones, filtrado en cliente
    // (evita índices compuestos en Firestore; el volumen es bajo). 400
    // da margen para ~1 mes de historial de entregas + activas.
    window._slDb.collection('remisiones')
      .orderBy('createdAt', 'desc').limit(400)
      .onSnapshot(function(snap){
        _remCola = _remCola.then(async function(){
          var raw = [];
          snap.forEach(function(doc){
            var d = doc.data() || {};
            d._id = doc.id;
            raw.push(d);
          });
          _remUltimoRaw = raw;
          var descifrados = await _remDescifrar(raw);
          var porId = {};
          descifrados.forEach(function(d){ porId[d._id] = d; });
          var prev = {};
          _docs.forEach(function(d){ prev[d._id] = d; });
          _docs = descifrados;

          if (_initialSnapshot) {
            // Primera carga: nada de la ráfaga histórica se notifica como
            // "nuevo", pero sí se revisa si alguien entregó algo que alisté
            // mientras tenía la app cerrada. Con un respiro para no chocar
            // con el brief diario ni con el tutorial.
            setTimeout(_avisarEntregasNoVistas, 2500);
          } else {
            snap.docChanges().forEach(function(ch){
              var d = porId[ch.doc.id] || {};
              if (ch.type === 'added') {
                // Nueva recogida hacia mi sede (o soy admin) → notificar
                var esParaMi = (_mySede && d.sedeDestino === _mySede) || _isAdmin;
                var laCreeYo = d.vendedorEmail === email;
                if (esParaMi && !laCreeYo && d.createdAt) {
                  var titulo = 'Nueva recogida en ' + window._slSedeLabel(d.sedeDestino);
                  var cuerpo = (d.cliente || 'Cliente') + ' · ' + (d.productos || '').split('\n')[0];
                  _playChime();
                  _bigNotify(titulo, cuerpo);
                  _nativeNotify(titulo, cuerpo);
                }
              } else if (ch.type === 'modified') {
                // Mi recogida cambió de estado → avisar al vendedor que la registró
                var antes = prev[ch.doc.id];
                var cambioEstado = !!antes && antes.estado !== d.estado;
                var yaAvisado = false;
                if (d.vendedorEmail === email && cambioEstado) {
                  if (d.estado === 'entregado') {
                    // Entregada al cliente: notificación fuerte (chime + banner grande
                    // + aviso del navegador si está en otra pestaña), igual que una
                    // recogida entrante — para que el que la registró se entere seguro.
                    var tEntr = 'Recogida entregada';
                    var cEntr = (d.cliente || 'Cliente') + ' ya recibió sus productos'
                      + (d.entregadoPor ? ' · entregó ' + d.entregadoPor : '');
                    _toast('Tu recogida de ' + (d.cliente || 'cliente') + ' fue entregada al cliente', 'success', null, 6000);
                    _playChime();
                    _bigNotify(tEntr, cEntr);
                    _nativeNotify(tEntr, cEntr);
                    yaAvisado = true;
                  } else if (d.estado === 'preparado') {
                    _toast('Tu recogida de ' + (d.cliente || 'cliente') + ' ya está preparada en ' + window._slSedeLabel(d.sedeDestino), 'info', null, 6000);
                  }
                }
                // Se entregó algo que YO alisté (aunque la recogida no sea mía)
                // → avisarme también. Si además soy quien la registró, ya me
                // avisó el bloque de arriba: no se duplica el aviso.
                if (cambioEstado && d.estado === 'entregado') {
                  if (!yaAvisado && _laAlisteYo(d)) _notificarEntregaAlistada(d);
                  _avisadasSync(ch.doc.id); // no volver a avisarla al recargar
                }
                // El autor reasignó la recogida a otra sede (edición) → notificar
                // a la nueva sede como si fuera una recogida entrante.
                if (antes && antes.sedeDestino !== d.sedeDestino && d.estado !== 'entregado') {
                  var ahoraMia = (_mySede && d.sedeDestino === _mySede) || _isAdmin;
                  var antesMia = (_mySede && antes.sedeDestino === _mySede) || _isAdmin;
                  var laCreeYo = d.vendedorEmail === email;
                  if (ahoraMia && !antesMia && !laCreeYo) {
                    var tReasig = 'Recogida reasignada a ' + window._slSedeLabel(d.sedeDestino);
                    var cReasig = (d.cliente || 'Cliente') + ' · ' + (d.productos || '').split('\n')[0];
                    _playChime();
                    _bigNotify(tReasig, cReasig);
                    _nativeNotify(tReasig, cReasig);
                  }
                }
              }
            });
          }
          _initialSnapshot = false;
          _renderList();
        }).catch(function(e){ console.warn('[rem] snapshot:', e); });
      }, function(err){
        console.error('remisiones listener error:', err);
        var list = document.getElementById('remList');
        if (list) list.innerHTML = '<div class="rem-empty empty-state">Error al cargar recogidas — revisa los permisos de Firestore (colección «remisiones»)</div>';
      });
  };
})();
