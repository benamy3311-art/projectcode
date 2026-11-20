// ============================================================
// TACTO EN LA APP — respuesta al tocar (paso 9) y deshacer (paso 10)
// ============================================================
// Aplica a la app el sistema de TACTO.md con el motor de ui/tacto.js, en el
// registro «sereno» (pantallas de trabajo): sin cercanía, sonido apagado por
// defecto, vibración solo en cambios de estado, éxito y fallo.
//
//   - Selectores de opciones: una sola píldora que viaja entre opciones.
//   - Cifras: en los totales solo ruedan los dígitos que cambian.
//   - Cambios de estado (añadir, interruptores): su vibración y sonido.
//   - Quitar un producto o «Limpiar» se hace al instante y ofrece «Deshacer».
//
// Globales que expone (window.*):
//   TactoApp.fallo(el)            — sacudida + vibración de error sobre un campo
//   TactoApp.limpiar()            — «Limpiar» la cotización con deshacer
//   TactoApp.ajustar(clave, v)    — sonido / vibración desde Configuración
//
// Depende de: ui/tacto.js (tacto), ui/ui.js (removeItem, clearAll, renderUI),
//   application/state.js (items, dispatch, S, setState)
// Estilos: styles/tacto.css
// ============================================================
(function () {
  if (!window.tacto) return;
  var t = window.tacto;
  var reducido = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  // ── Píldora que viaja ──────────────────────────────────
  // Funciona aunque el selector se vuelva a dibujar entero (Vender lo hace en
  // cada cambio): se recuerda dónde estaba la píldora y sale desde ahí.
  var GRUPOS = '.tv-seg, .qmode-vgroup, .pl-toggle-wrap';
  var ACTIVA = '[aria-pressed="true"], .on, .active';
  var antes = {};
  function clave(g) {
    var dueno = g.parentElement && g.parentElement.closest('[id]');
    var hermanos = dueno ? [].slice.call(dueno.querySelectorAll(GRUPOS)) : [];
    return (dueno ? dueno.id : '') + ':' + hermanos.indexOf(g);
  }
  function colocar(g) {
    if (!g.offsetWidth) return;
    var a = g.querySelector(ACTIVA);
    if (!a || a.parentElement !== g) { g.style.setProperty('--po', '0'); return; }
    var pos = { x: a.offsetLeft, y: a.offsetTop, w: a.offsetWidth, h: a.offsetHeight };
    var k = clave(g), previa = antes[k];
    var poner = function (p) {
      g.style.setProperty('--px', p.x + 'px'); g.style.setProperty('--py', p.y + 'px');
      g.style.setProperty('--pw', p.w + 'px'); g.style.setProperty('--ph', p.h + 'px');
      g.style.setProperty('--po', '1');
    };
    if (!g.dataset.pildora) {
      poner(previa || pos);
      g.dataset.pildora = 'quieta';
      void g.offsetWidth;
      if (previa && (previa.x !== pos.x || previa.w !== pos.w) && !reducido()) {
        g.dataset.pildora = 'viaja';
        requestAnimationFrame(function () { poner(pos); });
      } else {
        poner(pos);
        requestAnimationFrame(function () { g.dataset.pildora = 'viaja'; });
      }
    } else {
      poner(pos);
    }
    antes[k] = pos;
  }
  var pendiente = false;
  function revisar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      [].forEach.call(document.querySelectorAll(GRUPOS), colocar);
      cifras();
    });
  }
  if (window.MutationObserver) {
    new MutationObserver(revisar).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] });
  }
  window.addEventListener('resize', revisar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(revisar);

  // ── Cifras que ruedan ──────────────────────────────────
  // El total de la cotización lo reescribe liveUpdate(); el de Vender se
  // dibuja de nuevo en cada cambio. En los dos se compara con el valor anterior.
  var ultimoVenta = null;
  function cifras() {
    var vivo = document.getElementById('liveTotal');
    if (vivo && !vivo.querySelector('.cifra-hueco')) {
      var txt = vivo.textContent.trim();
      if (vivo.dataset.valor === undefined) vivo.dataset.valor = txt;
      else if (txt !== vivo.dataset.valor) t.cifra(vivo, txt);
    }
    var dd = document.querySelector('#venRaiz .tv-total dd');
    if (dd && !dd.querySelector('.cifra-hueco')) {
      var v = dd.textContent.trim();
      if (ultimoVenta !== null && v !== ultimoVenta) { dd.dataset.valor = ultimoVenta; t.cifra(dd, v); }
      ultimoVenta = v;
    }
  }

  // ── Cambios de estado: sonido y vibración ──────────────
  // Solo con dedo o cursor (e.detail > 0): lo que lanza el teclado no suena ni vibra.
  document.addEventListener('click', function (e) {
    if (!e.detail) return;
    var b = e.target.closest && e.target.closest('.btn-add, .tv-interruptor, [data-acc="mas"], [data-acc="menos"], .esf-op');
    if (!b) return;
    if (b.matches('.btn-add')) t.sentir(b.classList.contains('added') ? 'toque' : 'encaje');
    else if (b.matches('.tv-interruptor')) t.sentir(b.getAttribute('aria-checked') === 'true' ? 'apagar' : 'encender');
    else t.sentir('seleccion');
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.matches || !el.matches('.switch input[type="checkbox"]')) return;
    var nativo = el.hasAttribute('switch') && 'switch' in HTMLInputElement.prototype;
    t.sentir(el.checked ? 'encender' : 'apagar', { haptica: !nativo });
  });

  // ── Fallo: sacudida corta y vibración de error ─────────
  function fallo(el) {
    t.sentir('error');
    if (!el || reducido()) return;
    el.removeAttribute('data-sacude');
    void el.offsetWidth;
    el.setAttribute('data-sacude', '');
    setTimeout(function () { el.removeAttribute('data-sacude'); }, 320);
  }

  // ── Deshacer en vez de preguntar ───────────────────────
  var barra = null, reloj = 0, accion = null;
  function ofrecer(texto, alDeshacer) {
    if (!barra) {
      barra = document.createElement('div');
      barra.className = 'deshacer';
      barra.setAttribute('role', 'status');
      barra.innerHTML = '<span class="deshacer-txt"></span><button type="button" class="deshacer-btn">Deshacer</button>';
      document.body.appendChild(barra);
      barra.querySelector('.deshacer-btn').addEventListener('click', function () {
        var f = accion; cerrar();
        if (f) { f(); t.sentir('toque'); }
      });
    }
    barra.querySelector('.deshacer-txt').textContent = texto;
    accion = alDeshacer;
    barra.removeAttribute('data-abierto');
    void barra.offsetWidth;
    barra.setAttribute('data-abierto', '');
    clearTimeout(reloj);
    reloj = setTimeout(cerrar, 6000);
  }
  function cerrar() { clearTimeout(reloj); accion = null; if (barra) barra.removeAttribute('data-abierto'); }

  function refrescarCotizacion() {
    try { if (typeof renderUI === 'function') renderUI(); } catch (_) {}
    try { if (typeof generateQuote === 'function' && items.length) generateQuote(true); } catch (_) {}
  }
  function devolver(lista) {
    dispatch({ type: 'LOAD', newItems: lista, listSource: (window.S && S.activePriceList) || undefined });
    refrescarCotizacion();
  }

  // Quitar un producto: se quita ya y se ofrece devolverlo.
  if (typeof window.removeItem === 'function') {
    var quitarOriginal = window.removeItem;
    window.removeItem = function (i) {
      var copia = (window.items || []).slice();
      var it = copia[i];
      quitarOriginal(i);
      if (!it) return;
      var nombre = String(it.name || 'el producto');
      ofrecer('Quitaste ' + (nombre.length > 34 ? nombre.slice(0, 33) + '…' : nombre), function () { devolver(copia); });
    };
  }

  // «Limpiar»: se guarda todo lo que borra clearAll() para poder volver atrás.
  function limpiar() {
    if (!window.items || !items.length) { if (typeof clearAll === 'function') clearAll(); return; }
    var campo = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var foto = {
      items: items.slice(), cliente: campo('cliente'), whatsapp: campo('whatsapp'), notas: campo('notasCot'), numCot: campo('numCot'),
      estado: ['discountOn', 'discountPct', 'reteOn', 'incluyeEnvio', 'empresaCliente', 'currentQuoteId', 'quoteClosed']
        .reduce(function (o, k) { o[k] = window.S ? S[k] : undefined; return o; }, {})
    };
    clearAll();
    ofrecer('Cotización vacía', function () {
      Object.keys(foto.estado).forEach(function (k) { if (foto.estado[k] !== undefined && typeof setState === 'function') setState(k, foto.estado[k]); });
      [['cliente', foto.cliente], ['whatsapp', foto.whatsapp], ['notasCot', foto.notas], ['numCot', foto.numCot]].forEach(function (p) {
        var el = document.getElementById(p[0]); if (el) el.value = p[1];
      });
      devolver(foto.items);
    });
  }

  // ── Ajustes (Configuración) ────────────────────────────
  function ajustar(k, valor) {
    var c = {}; c[k] = !!valor;
    t.ajustar(c);
    if (valor) t.sentir(k === 'sonido' ? 'encender' : 'toque');
  }
  function pintarAjustes() {
    var s = document.getElementById('tactoSonido'), h = document.getElementById('tactoHaptica');
    if (s) s.checked = !!t.prefs.sonido;
    if (h) h.checked = !!t.prefs.haptica;
  }
  if (typeof window.openSettings === 'function') {
    var abrirOriginal = window.openSettings;
    window.openSettings = function () { var r = abrirOriginal.apply(this, arguments); pintarAjustes(); return r; };
  }
  pintarAjustes();
  revisar();

  window.TactoApp = { fallo: fallo, limpiar: limpiar, ajustar: ajustar };
})();
