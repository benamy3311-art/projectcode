// ============================================================
// COMPAÑERO DE ESCRITORIO — la mascota que vive en la barra lateral
// ============================================================
// La mascota de ui/pixel-pal.js, posada sobre las líneas que separan
// los módulos del panel izquierdo (el borde inferior de cada `.sec`).
// No hace nada funcional: es compañía.
//
// Qué hace:
//   - Se para en una línea divisoria y respira (sube y baja 1px).
//   - Parpadea sola y mira hacia donde está el puntero.
//   - Al hacerle clic, salta a la siguiente línea.
//   - Se puede arrastrar y soltar: cae a la línea más cercana.
//   - Recuerda dónde quedó (localStorage) entre recargas.
//
// Por qué absoluta dentro de .sb-body y no fija en pantalla: así se
// desplaza junto con el contenido, y la línea sobre la que está sigue
// siendo la misma cuando el vendedor hace scroll.
//
// Solo Samuel la ve: index.html marca <body class="admin-user"> vía
// window._applyAdminState() cuando el email autenticado está en
// window.ADMIN_EMAILS (hoy solo samuelsan6646@gmail.com). El resto de
// vendedores nunca tiene esa clase, así que para ellos este archivo no
// construye nada. Se observa la clase por MutationObserver en vez de
// leerla una sola vez, porque el login con Firebase resuelve async —
// bastante después de que este script corre — y hay que reaccionar
// también si la sesión cambia de cuenta sin recargar la página.
//
// Globales que expone (window.*):
//   companionToggle()  — muestra u oculta la mascota (y lo recuerda)
//   companionIsOn()    — si está visible
//
// Depende de: ui/pixel-pal.js (PixelPal.sprite), index.html (clase
//             body.admin-user vía window._applyAdminState)
// Requiere DOM: .sb-body con secciones .sec
// ============================================================
(function () {

  var LS_POS = 'sl_pal_perch';
  var LS_ON  = 'sl_pal_on';
  var SIZE = 32;              // el sprite es de 32x32, se dibuja 1:1
  var el = null, sprite = null, host = null, ro = null;
  var perch = 0;              // índice de la línea donde está parada
  var x = 0.5;                // posición horizontal, 0..1 sobre la línea
  var timer = 0, blinkAt = 0, mood = 'normal', look = 0;
  var dragging = false, dragDX = 0, dragDY = 0, moved = false;

  function _hasAdmin() {
    return document.body.classList.contains('admin-user');
  }

  function _ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) {}
    return null;
  }

  // Las líneas donde se puede parar: el borde inferior de cada sección
  // visible del panel. Se recalculan cada vez porque las secciones de
  // IA aparecen y desaparecen según el chip activo.
  function _lines() {
    if (!host) return [];
    var out = [];
    [].forEach.call(host.querySelectorAll('.sec'), function (s) {
      if (s.offsetParent === null) return;              // oculta
      out.push({ top: s.offsetTop + s.offsetHeight, left: s.offsetLeft, w: s.offsetWidth });
    });
    return out;
  }

  function _place(anim) {
    var ls = _lines();
    if (!ls.length || !el) return;
    if (perch >= ls.length) perch = ls.length - 1;
    var l = ls[perch];
    var px = l.left + Math.round((l.w - SIZE) * x);
    el.style.transition = anim ? 'left .42s cubic-bezier(.34,1.3,.64,1), top .42s cubic-bezier(.34,1.3,.64,1)' : 'none';
    el.style.left = px + 'px';
    el.style.top = (l.top - SIZE + 1) + 'px';           // +1: las patas pisan la línea
  }

  function _draw() {
    if (sprite) sprite.innerHTML = PixelPal.sprite(mood, 'sonrisa');
  }

  function _tick() {
    var t = Date.now();
    var nuevo = mood;
    if (t >= blinkAt) {
      nuevo = 'cerrados';
      if (t >= blinkAt + 160) { blinkAt = t + 2600 + Math.random() * 3200; nuevo = look ? 'mira' : 'normal'; }
    } else {
      nuevo = look ? 'mira' : 'normal';
    }
    if (nuevo !== mood) { mood = nuevo; _draw(); }
  }

  function _hop() {
    var ls = _lines();
    if (!ls.length) return;
    perch = (perch + 1) % ls.length;
    x = 0.15 + Math.random() * 0.7;
    el.classList.add('pal-hop');
    setTimeout(function () { el && el.classList.remove('pal-hop'); }, 420);
    _place(true);
    _save();
  }

  function _save() { _ls(LS_POS, perch + ':' + x.toFixed(3)); }

  function _load() {
    var raw = _ls(LS_POS);
    if (!raw) return;
    var p = raw.split(':');
    perch = parseInt(p[0], 10) || 0;
    x = parseFloat(p[1]);
    if (isNaN(x)) x = 0.5;
  }

  // ── Arrastrar y soltar ───────────────────────────────────
  function _down(ev) {
    var pt = ev.touches ? ev.touches[0] : ev;
    dragging = true; moved = false;
    var r = el.getBoundingClientRect();
    dragDX = pt.clientX - r.left;
    dragDY = pt.clientY - r.top;
    el.classList.add('pal-drag');
    el.style.transition = 'none';
    ev.preventDefault();
  }

  function _move(ev) {
    if (!dragging) return;
    var pt = ev.touches ? ev.touches[0] : ev;
    moved = true;
    var hr = host.getBoundingClientRect();
    el.style.left = (pt.clientX - dragDX - hr.left + host.scrollLeft) + 'px';
    el.style.top  = (pt.clientY - dragDY - hr.top + host.scrollTop) + 'px';
  }

  function _up() {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('pal-drag');
    if (!moved) { _hop(); return; }
    // Soltada: cae a la línea más cercana por debajo del punto donde quedó.
    var ls = _lines();
    if (!ls.length) return;
    var cy = parseFloat(el.style.top) + SIZE;
    var cx = parseFloat(el.style.left);
    var best = 0, bestD = Infinity;
    ls.forEach(function (l, i) {
      var d = Math.abs(l.top - cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    perch = best;
    var l = ls[perch];
    x = Math.min(1, Math.max(0, (cx - l.left) / Math.max(1, l.w - SIZE)));
    _place(true);
    _save();
  }

  function _build() {
    if (el) return true;        // ya está construida
    host = document.querySelector('.sb-body');
    if (!host || !window.PixelPal) return false;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    el = document.createElement('div');
    el.className = 'pal';
    el.title = 'Tu compañero — clic para que salte, o arrástralo';
    el.innerHTML = '<div class="pal-sprite"></div><div class="pal-shadow"></div>';
    sprite = el.querySelector('.pal-sprite');
    host.appendChild(el);
    _draw();

    el.addEventListener('mousedown', _down);
    el.addEventListener('touchstart', _down, { passive: false });
    document.addEventListener('mousemove', _move);
    document.addEventListener('touchmove', _move, { passive: false });
    document.addEventListener('mouseup', _up);
    document.addEventListener('touchend', _up);

    // Mira hacia el puntero: solo dos estados (de frente o de reojo),
    // que a 32px es todo lo que se alcanza a leer.
    document.addEventListener('mousemove', function (ev) {
      if (!el || dragging) return;
      var r = el.getBoundingClientRect();
      var d = ev.clientX - (r.left + r.width / 2);
      var n = Math.abs(d) > 90 ? 1 : 0;
      if (n !== look) { look = n; mood = look ? 'mira' : 'normal'; _draw(); }
    });

    window.addEventListener('resize', function () { _place(false); });

    // Las secciones cambian de alto todo el tiempo (se abre el chip de
    // IA, crece el textarea, aparece el anillo de espera). Sin esto la
    // mascota se queda flotando lejos de su línea.
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { if (!dragging) _place(false); });
      ro.observe(host);
      [].forEach.call(host.querySelectorAll('.sec'), function (s) { ro.observe(s); });
    }
    blinkAt = Date.now() + 2000;
    timer = setInterval(_tick, 120);
    return true;
  }

  // Quita la mascota del DOM por completo. Se usa si la cuenta admin
  // cierra sesión o cambia a un email sin privilegios sin recargar.
  function _destroy() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (ro) ro.disconnect();
    ro = null;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = sprite = host = null;
  }

  window.companionIsOn = function () { return _ls(LS_ON) !== '0'; };

  window.companionToggle = function () {
    var on = !companionIsOn();
    _ls(LS_ON, on ? '1' : '0');
    if (!_hasAdmin()) return on;       // el toggle no le da acceso a quien no es admin
    if (el) el.style.display = on ? 'block' : 'none';
    else if (on) _init();
    return on;
  };

  function _init() {
    if (!_hasAdmin() || !companionIsOn()) return;
    if (!_build()) return;
    _load();
    _place(false);
    // Las secciones de IA cambian de alto al abrirse; reubicar en el
    // siguiente cuadro evita que quede flotando fuera de su línea.
    setTimeout(function () { _place(false); }, 300);
  }

  // El login con Firebase resuelve async: cuando llega, index.html
  // agrega o quita 'admin-user' del body. Se observa esa clase en vez
  // de leerla una sola vez al cargar.
  new MutationObserver(function () {
    if (_hasAdmin()) _init();
    else _destroy();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { setTimeout(_init, 400); });
  else setTimeout(_init, 400);

})();
