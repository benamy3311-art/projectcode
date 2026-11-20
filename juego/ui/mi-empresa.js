// ============================================================
// MI EMPRESA (PC, jefe y admin)
// ============================================================
// Pantalla donde el jefe ajusta la app a su empresa: si cobra IVA (y a qué
// tarifa), con qué medios de pago le pagan, los mensajes rápidos y las
// tarifas del envío estimado (domain/envio.js, config/envios). Se edita un
// borrador y nada cambia para el equipo hasta "Guardar cambios".
//
// El modelo y sus reglas están en domain/empresa.js; guardar y aplicar, en
// infrastructure/empresa-config.js. Las reglas de Firestore solo dejan
// escribir config/empresa a jefe y admin.
//
// Globales que expone (window.*):
//   MiEmpresa.abrir()
//
// Depende de: domain/empresa.js (Empresa), infrastructure/empresa-config.js
//             (EmpresaConfig), ui.js (switchTab, showToast), domain.js (esc,
//             fmtCOP), riel.js (navegación)
// Estilos: styles/mi-empresa.css
// ============================================================
(function () {
  'use strict';

  var _borrador = null;
  var _env = null;          // borrador de tarifas de envío
  var _envSucio = false;
  var _prueba = { ciudad: 'Medellín', cat: 'PORTÁTIL', precio: 2890000 };
  var _sucio = false;
  var _guardando = false;
  var _errores = [];

  var ICO = {
    subir: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    bajar: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    quitar: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICO[n] + '</svg>'; }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function pesos(n) { return window.fmtCOP ? fmtCOP(n) : '$ ' + Math.round(n).toLocaleString('es-CO'); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2800); }
  function esJefe() { return ['jefe', 'admin'].indexOf(window._slUserRol) >= 0; }

  function copiaActual() { return window.Empresa ? window.Empresa.actual() : null; }

  function panel() {
    var p = $('panel-empresa');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-empresa';
    p.className = 'ivapanel me';
    p.style.display = 'none';
    pv.appendChild(p);
    enlazar(p);
    return p;
  }

  // ── Pintar ───────────────────────────────────────────────
  function ejemplo() {
    var b = _borrador;
    var t = Number(b.iva.tarifa);
    if (!b.iva.responsable) {
      return '<span>Así se cobra un producto de ' + esc(pesos(1000000)) + '</span><b>Precio final ' + esc(pesos(1000000)) + ' · sin IVA</b>';
    }
    if (!window.Empresa || !(t > 0 && t <= window.Empresa.TARIFA_MAX)) return '<span>Escribe una tarifa para ver el ejemplo.</span>';
    var precio = Math.round(1000000 * (1 + t / 100));
    return '<span>Así se separa un producto de ' + esc(pesos(precio)) + '</span><b>Base ' + esc(pesos(1000000)) + ' · IVA ' + esc(pesos(precio - 1000000)) + '</b>';
  }

  function pruebaTxt() {
    if (!window.Envio || !_env) return '';
    var e = window.Envio.estimar({ ciudad: _prueba.ciudad, items: [{ categoria: _prueba.cat, cantidad: 1, precio: _prueba.precio }], cfg: _env });
    if (!e) return '<span>Escribe una ciudad para probar.</span>';
    return '<span>' + esc(e.zona) + ' · ' + e.kg + ' kg · flete ' + esc(pesos(e.flete)) + ' + seguro ' + esc(pesos(e.seguro)) + '</span><b>' + esc(pesos(e.desde)) + ' a ' + esc(pesos(e.hasta)) + (e.dias ? ' · ' + esc(e.dias) : '') + '</b>';
  }

  function enviosHtml() {
    if (!window.Envio) return '';
    if (!_env) _env = window.Envio.actual();
    var z = _env.zonas.map(function (x, i) {
      return '<li class="me-zona">'
        + '<div class="me-zona-cab"><input data-me-zona="' + i + '" data-campo="nombre" value="' + esc(x.nombre) + '" maxlength="40" aria-label="Nombre de la zona ' + (i + 1) + '" autocomplete="off">'
        + '<button type="button" class="me-ico" data-me-zona-quitar="' + i + '" aria-label="Quitar la zona ' + esc(x.nombre) + '"' + (_env.zonas.length === 1 ? ' disabled' : '') + '>' + svg('quitar') + '</button></div>'
        + '<div class="me-zona-num">'
          + '<label><span>Primer kilo</span><input data-me-zona="' + i + '" data-campo="base" inputmode="numeric" value="' + x.base + '"></label>'
          + '<label><span>Kilo adicional</span><input data-me-zona="' + i + '" data-campo="porKg" inputmode="numeric" value="' + x.porKg + '"></label>'
          + '<label><span>Tiempo de entrega</span><input data-me-zona="' + i + '" data-campo="dias" maxlength="30" value="' + esc(x.dias) + '"></label>'
        + '</div>'
        + '<label class="me-zona-ciu"><span>' + (x.ciudades.length ? 'Ciudades' : 'Ciudades (vacío = todas las que no estén en otra zona)') + '</span><textarea data-me-zona="' + i + '" data-campo="ciudades" rows="2">' + esc(x.ciudades.join(', ')) + '</textarea></label>'
        + '</li>';
    }).join('');
    var cats = Object.keys(_env.pesos).sort();
    return '<section class="me-tarjeta me-ancha" aria-labelledby="meEnvT">'
      + '<h2 id="meEnvT">Envíos</h2>'
      + '<p class="me-nota me-nota-top">La guía la hace tu empresa con su transportadora. Con estas tarifas el asesor le dice al cliente cuánto le sale el envío antes de vender; en el chat aparece como "Envío estimado".</p>'
      + '<div class="me-env-rej"><div>'
        + '<ol class="me-zonas">' + z + '</ol>'
        + (_env.zonas.length < 12 ? '<button type="button" class="me-btn" data-me-acc="zona">Agregar zona</button>' : '')
      + '</div><div class="me-env-lado">'
        + '<div class="me-env-seg"><label><span>Seguro (manejo)</span><div class="me-num-campo"><input data-me-env="seguroPct" inputmode="decimal" value="' + esc(String(_env.seguroPct).replace('.', ',')) + '"><span>%</span></div></label>'
        + '<label><span>Seguro mínimo</span><input data-me-env="seguroMin" inputmode="numeric" value="' + _env.seguroMin + '"></label></div>'
        + '<div class="me-env-prueba"><b>Pruébalo</b><div class="me-env-pr-campos"><input data-me-prueba="ciudad" value="' + esc(_prueba.ciudad) + '" aria-label="Ciudad de prueba" autocomplete="off">'
        + '<select data-me-prueba="cat" aria-label="Producto de prueba">' + cats.map(function (c) { return '<option' + (c === _prueba.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>'
        + '<div class="me-ejemplo" id="meEnvPrueba">' + pruebaTxt() + '</div></div>'
        + '<details class="me-pesos"><summary>Peso de envío por categoría (kg)</summary><p class="me-nota">Con caja y volumen: un monitor de 27" pesa 5 kg pero la transportadora lo cobra como 9.</p><div class="me-pesos-rej">'
        + cats.map(function (c) { return '<label><span>' + esc(c) + '</span><input data-me-peso="' + esc(c) + '" inputmode="decimal" value="' + esc(String(_env.pesos[c]).replace('.', ',')) + '"></label>'; }).join('')
        + '</div></details>'
      + '</div></div>'
      + '</section>';
  }

  function estadoTxt() {
    if (_guardando) return 'Guardando…';
    return _sucio ? 'Tienes cambios sin guardar' : 'Todo guardado';
  }

  function pintar() {
    var p = panel();
    if (!p) return;
    if (!esJefe()) { p.innerHTML = '<div class="me-in"><p class="me-sub">Solo el jefe de la tienda puede cambiar la configuración de la empresa.</p></div>'; return; }
    if (!_borrador) _borrador = copiaActual();
    if (!_borrador) return;
    var b = _borrador;
    var si = b.iva.responsable;

    var medios = b.mediosPago.map(function (m, i) {
      var n = b.mediosPago.length;
      return '<li class="me-medio">'
        + '<span class="me-num" aria-hidden="true">' + (i + 1) + '</span>'
        + '<input data-me-medio="' + i + '" value="' + esc(m) + '" maxlength="' + window.Empresa.MAX_NOMBRE + '" aria-label="Medio de pago ' + (i + 1) + '" autocomplete="off">'
        + '<button type="button" class="me-ico" data-me-subir="' + i + '" aria-label="Subir ' + esc(m) + '"' + (i === 0 ? ' disabled' : '') + '>' + svg('subir') + '</button>'
        + '<button type="button" class="me-ico" data-me-bajar="' + i + '" aria-label="Bajar ' + esc(m) + '"' + (i === n - 1 ? ' disabled' : '') + '>' + svg('bajar') + '</button>'
        + '<button type="button" class="me-ico" data-me-quitar="' + i + '" aria-label="Quitar ' + esc(m) + '"' + (n === 1 ? ' disabled' : '') + '>' + svg('quitar') + '</button>'
        + '</li>';
    }).join('');

    var lleno = b.mediosPago.length >= window.Empresa.MAX_MEDIOS;

    p.innerHTML = '<div class="me-in">'
      + '<header class="me-cab"><p class="me-eti">Configuración</p><h1>Mi empresa</h1>'
      + '<p class="me-sub">Lo que pongas aquí cambia la app para todo tu equipo: cotizaciones, ventas y documentos.</p></header>'
      + '<div class="me-rej">'
        + '<section class="me-tarjeta" aria-labelledby="meIvaT">'
          + '<h2 id="meIvaT">Impuestos</h2>'
          + '<p class="me-preg">¿Tu empresa es responsable de IVA?</p>'
          + '<div class="me-opciones" role="radiogroup" aria-labelledby="meIvaT">'
            + '<button type="button" role="radio" class="me-opcion' + (si ? ' on' : '') + '" data-me-iva="si" aria-checked="' + si + '"><i aria-hidden="true"></i><span><b>Sí, cobro IVA</b><small>Los precios incluyen IVA y la app lo separa en cotizaciones, ventas y facturación.</small></span></button>'
            + '<button type="button" role="radio" class="me-opcion' + (!si ? ' on' : '') + '" data-me-iva="no" aria-checked="' + !si + '"><i aria-hidden="true"></i><span><b>No soy responsable de IVA</b><small>Los precios son finales. La app no calcula ni muestra IVA.</small></span></button>'
          + '</div>'
          + (si ? '<div class="me-tarifa"><label for="meTarifa">Tarifa general</label><div class="me-num-campo"><input id="meTarifa" inputmode="decimal" autocomplete="off" value="' + esc(String(b.iva.tarifa).replace('.', ',')) + '"><span>%</span></div>'
              + '<p class="me-nota">Los productos marcados como excluidos siguen sin IVA.</p></div>' : '')
          + '<div class="me-ejemplo" id="meEjemplo">' + ejemplo() + '</div>'
        + '</section>'
        + '<section class="me-tarjeta" aria-labelledby="meMedT">'
          + '<h2 id="meMedT">Medios de pago</h2>'
          + '<p class="me-nota me-nota-top">Los que aparecen al registrar una venta, en este orden.</p>'
          + '<ol class="me-medios">' + medios + '</ol>'
          + (lleno ? '<p class="me-nota">Llegaste al máximo de ' + window.Empresa.MAX_MEDIOS + ' medios de pago.</p>'
            : '<div class="me-agregar"><input id="meNuevo" maxlength="' + window.Empresa.MAX_NOMBRE + '" placeholder="Ej.: Bancolombia QR, Addi, Sistecrédito" aria-label="Nuevo medio de pago" autocomplete="off"><button type="button" class="me-btn" data-me-acc="agregar">Agregar</button></div>')
          + '<p class="me-nota">Las ventas ya registradas conservan su medio de pago aunque lo quites de aquí.</p>'
        + '</section>'
        + enviosHtml()
        + '<section class="me-tarjeta me-ancha" aria-labelledby="meMsgT">'
          + '<h2 id="meMsgT">Mensajes rápidos</h2>'
          + '<p class="me-nota me-nota-top">Los manda el asesor con un clic desde el chat del cliente. Escribe {nombre} donde va el nombre del cliente.</p>'
          + '<div class="me-msgs">'
            + '<label class="me-msg"><b>Pedir datos para la factura</b><textarea data-me-msg="pedirDatos" rows="6" maxlength="' + window.Empresa.MAX_MENSAJE + '">' + esc(b.mensajes.pedirDatos) + '</textarea></label>'
            + '<label class="me-msg"><b>Datos para pagar</b><textarea data-me-msg="datosPago" rows="6" maxlength="' + window.Empresa.MAX_MENSAJE + '" placeholder="Ej.: Puedes pagar a Bancolombia ahorros 123-456789-00 a nombre de Tienda SAS, NIT 900.123.456-7, o por Nequi al 300 123 4567. Cuando pagues, mándame el pantallazo.">' + esc(b.mensajes.datosPago) + '</textarea></label>'
          + '</div>'
        + '</section>'
      + '</div>'
      + (_errores.length ? '<div class="me-errores" role="alert">' + _errores.map(function (e) { return '<p>' + esc(e) + '</p>'; }).join('') + '</div>' : '')
      + '<footer class="me-pie"><span id="meEstado" class="' + (_sucio ? 'me-sucio' : '') + '">' + estadoTxt() + '</span>'
        + '<button type="button" class="me-btn" data-me-acc="descartar"' + (_sucio && !_guardando ? '' : ' disabled') + '>Descartar</button>'
        + '<button type="button" class="me-guardar" data-me-acc="guardar"' + (_sucio && !_guardando ? '' : ' disabled') + '>Guardar cambios</button></footer>'
      + '</div>';
  }

  // Cambios que no redibujan todo (para no perder el foco al escribir).
  function marcarSucio() {
    _sucio = true;
    var e = $('meEstado');
    if (e) { e.textContent = estadoTxt(); e.className = 'me-sucio'; }
    var bs = document.querySelectorAll('[data-me-acc="descartar"],[data-me-acc="guardar"]');
    for (var i = 0; i < bs.length; i++) bs[i].disabled = false;
    var ej = $('meEjemplo');
    if (ej) ej.innerHTML = ejemplo();
  }

  function envCambio() {
    _envSucio = true;
    marcarSucio();
    var pr = $('meEnvPrueba'); if (pr) pr.innerHTML = pruebaTxt();
  }

  function cambiar(fn) { fn(_borrador); _errores = []; _sucio = true; pintar(); }

  function agregar() {
    var inp = $('meNuevo');
    var n = String(inp && inp.value || '').replace(/\s+/g, ' ').trim();
    if (!n) { if (inp) inp.focus(); return; }
    var ya = _borrador.mediosPago.some(function (m) { return String(m).trim().toLowerCase() === n.toLowerCase(); });
    if (ya) { toast('«' + n + '» ya está en la lista', 'warn'); return; }
    cambiar(function (b) { b.mediosPago.push(n); });
    var otro = $('meNuevo');
    if (otro) otro.focus();
  }

  function guardar() {
    if (_guardando || !window.EmpresaConfig) return;
    var v = window.Empresa.validar(_borrador);
    if (!v.ok) { _errores = v.errores; pintar(); return; }
    _guardando = true; _errores = [];
    pintar();
    var pasos = [window.EmpresaConfig.guardar(_borrador)];
    if (_envSucio && window.EmpresaConfig.guardarEnvios) pasos.push(window.EmpresaConfig.guardarEnvios(_env));
    Promise.all(pasos).then(function () {
      _guardando = false; _sucio = false; _envSucio = false;
      _borrador = copiaActual();
      _env = window.Envio ? window.Envio.actual() : null;
      pintar();
      toast('Guardado. Tu equipo ya lo ve.', 'success');
    }, function (err) {
      _guardando = false;
      var permiso = err && (err.code === 'permission-denied' || /permission/i.test(err.message || ''));
      _errores = err && err.errores ? err.errores
        : [permiso ? 'No se pudo guardar: falta publicar las reglas nuevas de Firestore o tu cuenta no es de jefe.' : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.'];
      pintar();
    });
  }

  function enlazar(p) {
    p.addEventListener('click', function (e) {
      var t = e.target.closest('[data-me-iva],[data-me-subir],[data-me-bajar],[data-me-quitar],[data-me-acc],[data-me-zona-quitar]');
      if (!t || t.disabled) return;
      if (t.hasAttribute('data-me-iva')) {
        var si = t.getAttribute('data-me-iva') === 'si';
        if (si !== _borrador.iva.responsable) cambiar(function (b) { b.iva.responsable = si; });
        return;
      }
      if (t.hasAttribute('data-me-subir') || t.hasAttribute('data-me-bajar')) {
        var i = Number(t.getAttribute('data-me-subir') || t.getAttribute('data-me-bajar'));
        var j = t.hasAttribute('data-me-subir') ? i - 1 : i + 1;
        cambiar(function (b) { var x = b.mediosPago[i]; b.mediosPago[i] = b.mediosPago[j]; b.mediosPago[j] = x; });
        var foco = p.querySelector((j < i ? '[data-me-subir="' : '[data-me-bajar="') + j + '"]');
        if (foco && !foco.disabled) foco.focus();
        return;
      }
      if (t.hasAttribute('data-me-zona-quitar')) {
        _env.zonas.splice(Number(t.getAttribute('data-me-zona-quitar')), 1);
        _envSucio = true; _sucio = true; pintar();
        return;
      }
      if (t.hasAttribute('data-me-quitar')) {
        var k = Number(t.getAttribute('data-me-quitar'));
        cambiar(function (b) { b.mediosPago.splice(k, 1); });
        return;
      }
      var acc = t.getAttribute('data-me-acc');
      if (acc === 'agregar') agregar();
      else if (acc === 'guardar') guardar();
      else if (acc === 'descartar') { _borrador = copiaActual(); _env = window.Envio ? window.Envio.actual() : null; _sucio = false; _envSucio = false; _errores = []; pintar(); }
      else if (acc === 'zona') { _env.zonas.push({ nombre: 'Zona nueva', ciudades: [], base: 0, porKg: 0, dias: '' }); _envSucio = true; _sucio = true; pintar(); }
    });
    p.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !_borrador) return;
      if (el.id === 'meTarifa') {
        var n = Number(String(el.value).replace(',', '.'));
        _borrador.iva.tarifa = el.value.trim() === '' ? NaN : n;
        marcarSucio();
      } else if (el.hasAttribute('data-me-msg')) {
        _borrador.mensajes = _borrador.mensajes || {};
        _borrador.mensajes[el.getAttribute('data-me-msg')] = el.value;
        marcarSucio();
      } else if (el.hasAttribute('data-me-medio')) {
        _borrador.mediosPago[Number(el.getAttribute('data-me-medio'))] = el.value;
        marcarSucio();
      } else if (el.hasAttribute('data-me-zona') && _env) {
        var zona = _env.zonas[Number(el.getAttribute('data-me-zona'))];
        var campo = el.getAttribute('data-campo');
        if (!zona) return;
        if (campo === 'ciudades') zona.ciudades = el.value.split(/[,\n]/).map(function (c) { return c.trim(); }).filter(Boolean);
        else if (campo === 'base' || campo === 'porKg') zona[campo] = Number(String(el.value).replace(/\D/g, '')) || 0;
        else zona[campo] = el.value;
        envCambio();
      } else if (el.hasAttribute('data-me-env') && _env) {
        var k = el.getAttribute('data-me-env');
        _env[k] = k === 'seguroPct' ? Number(String(el.value).replace(',', '.')) || 0 : Number(String(el.value).replace(/\D/g, '')) || 0;
        envCambio();
      } else if (el.hasAttribute('data-me-peso') && _env) {
        _env.pesos[el.getAttribute('data-me-peso')] = Number(String(el.value).replace(',', '.')) || 0;
        envCambio();
      } else if (el.hasAttribute('data-me-prueba')) {
        _prueba[el.getAttribute('data-me-prueba')] = el.value;
        var pr = $('meEnvPrueba'); if (pr) pr.innerHTML = pruebaTxt();
      }
    });
    p.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'meNuevo' && e.key === 'Enter') { e.preventDefault(); agregar(); }
    });
  }

  // Si otro jefe guarda mientras esta pantalla está abierta sin cambios
  // propios, se muestra lo nuevo.
  document.addEventListener('sl:envios', function () {
    if (_envSucio || _guardando) return;
    _env = window.Envio ? window.Envio.actual() : null;
    var p = $('panel-empresa');
    if (p && p.style.display !== 'none') pintar();
  });
  document.addEventListener('sl:empresa', function () {
    if (_sucio || _guardando) return;
    _borrador = copiaActual();
    var p = $('panel-empresa');
    if (p && p.style.display !== 'none') pintar();
  });

  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      if (t === 'empresa') panel();
      var r = original.apply(this, arguments);
      if (t === 'empresa') pintar();
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  window.MiEmpresa = { abrir: function () { switchTab('empresa'); } };
})();
