// ============================================================
// ASESOR IA — el chat que sabe usar la app
// ============================================================
// Un solo lugar donde el asesor le habla al modelo en vez de repartirse entre
// cuatro botones. La diferencia con las funciones de IA que ya existen no es la
// ventana: es que acá el modelo tiene HERRAMIENTAS. Busca en el catálogo real,
// mira el detalle de un producto, consulta los datos de la tienda y agrega a la
// cotización. El catálogo ya no viaja dentro del prompt.
//
// El ciclo es: se manda lo que escribió el asesor con la lista de herramientas;
// si el modelo pide una, se ejecuta acá y se le devuelve el resultado; se
// repite hasta que responde con texto (tope de 6 vueltas por mensaje).
//
// Las tarjetas de producto las pinta la app con el resultado de la herramienta,
// NO con el texto del modelo: aunque el modelo escriba mal un precio, el número
// que ve la persona sale del catálogo.
//
// Nada se le manda al cliente solo: el asesor arma y decide.
//
// Globales que expone (window.*):
//   asesorIaAbrir()    — abre el chat (lo construye la primera vez)
//   asesorIaCerrar()
//   asesorIaEnviar()   — manda lo que hay en el campo de texto
//   asesorIaNuevo()    — borra la conversación
//   asesorIaDetener()  — corta la vuelta en curso
//
// Depende de: domain/agent-tools.js (AgentTools), infrastructure/ai-provider.js
//   (AI.chat), domain.js (esc, fmtCOP, parseComboComponents), state.js (S,
//   CATALOG), services.js (addItem, loadCfg, calcEngine), ui.js (showToast),
//   metrics-panel.js (_logFailedSearchDebounced, opcional)
// Requiere DOM: ninguno propio — se inyecta en <body>. El botón que lo abre
//   vive en la fila de chips de #secAiAssistant.
// ============================================================
(function () {
  'use strict';

  var MAX_VUELTAS = 6;        // herramientas encadenadas por mensaje
  var MAX_HISTORIAL = 24;     // mensajes que se le reenvían al modelo
  var HERRAMIENTAS = ['buscar_productos', 'detalle_producto', 'info_tienda',
                      'agregar_a_cotizacion', 'ver_cotizacion_actual', 'registrar_faltante'];

  var _mensajes = [];         // formato de api/ai.js
  var _corriendo = false;
  var _cancelar = null;
  var _construido = false;

  // ── Helpers ───────────────────────────────────────────────
  function _esc(s) { return typeof esc === 'function' ? esc(s) : String(s == null ? '' : s); }
  function _cop(n) { return typeof fmtCOP === 'function' ? fmtCOP(n) : '$ ' + Math.round(n).toLocaleString('es-CO'); }
  function _toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
  function $(id) { return document.getElementById(id); }

  function _catalogoCrudo() {
    var lago = typeof S !== 'undefined' && S.activePriceList === 'lago';
    if (lago) return (typeof S !== 'undefined' && S.catalogLago) || [];
    return typeof CATALOG !== 'undefined' ? CATALOG : [];
  }

  function _crudoPorSku(sku) {
    var src = _catalogoCrudo();
    for (var i = 0; i < src.length; i++) {
      if (String(src[i].sku) === String(sku)) return src[i];
    }
    return null;
  }

  function _contexto() {
    return {
      catalogo: window.AgentTools.normalizarCatalogo(_catalogoCrudo(), { unidad: 'miles' }),
      cfg: typeof loadCfg === 'function' ? loadCfg() : {},
      componentes: typeof parseComboComponents === 'function' ? parseComboComponents : null
    };
  }

  // ── Herramientas que tocan la app ─────────────────────────
  // Las puras viven en domain/agent-tools.js; estas necesitan el DOM y el
  // estado de la cotización, por eso se registran desde acá.

  window.AgentTools.registrar({
    nombre: 'agregar_a_cotizacion',
    descripcion: 'Agrega productos del catálogo a la cotización que tiene abierta el asesor. Usa solo SKUs que hayas visto en buscar_productos.',
    parametros: {
      items: {
        type: 'array',
        description: 'Productos a agregar.',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string', description: 'SKU exacto del catálogo.' },
            cantidad: { type: 'number', description: 'Unidades (por defecto 1).' }
          },
          required: ['sku']
        }
      }
    },
    requeridos: ['items'],
    ejecutar: function (args) {
      var lista = Array.isArray(args.items) ? args.items : [];
      if (!lista.length) return { error: 'No mandaste ningún producto.' };
      if (typeof addItem !== 'function') return { error: 'La cotización no está disponible en esta pantalla.' };
      var agregados = [], faltantes = [];
      for (var i = 0; i < lista.length && i < 30; i++) {
        var p = _crudoPorSku(lista[i].sku);
        if (!p) { faltantes.push(String(lista[i].sku)); continue; }
        var cant = parseInt(lista[i].cantidad, 10);
        if (!isFinite(cant) || cant < 1) cant = 1;
        var ok = addItem({ sku: p.sku, name: p.name, price: p.price, qty: cant, _cat: p._cat });
        if (ok) agregados.push({ sku: String(p.sku), nombre: p.name, cantidad: cant });
        else faltantes.push(String(lista[i].sku));
      }
      if (agregados.length && typeof notifyQuote === 'function') notifyQuote();
      var r = { agregados: agregados, total_cotizacion_cop: _totalCotizacion() };
      if (faltantes.length) {
        r.no_encontrados = faltantes;
        r.pista = 'Esos SKU no están en la lista activa. Busca de nuevo antes de volver a intentar.';
      }
      _pintarAviso(agregados.length
        ? 'Agregado a la cotización: ' + agregados.map(function (a) { return a.nombre; }).join(', ')
        : 'No se pudo agregar nada a la cotización');
      return r;
    }
  });

  // OJO con las unidades: los items guardan el precio en MILES, pero calcEngine
  // ya devuelve los totales en COP completos (multiplica por 1000 adentro).
  // Volver a multiplicar acá convertía 800 mil en 800 millones, y eso es lo que
  // el modelo le repetía al asesor.
  function _totalCotizacion() {
    try {
      if (typeof calcEngine === 'function') return Math.round(calcEngine().totalConIva);
    } catch (e) { /* sin cotización abierta */ }
    return 0;
  }

  window.AgentTools.registrar({
    nombre: 'ver_cotizacion_actual',
    descripcion: 'Muestra lo que el asesor ya tiene en la cotización abierta, con su total. Úsala antes de sugerir piezas, para no repetir lo que ya está.',
    parametros: {},
    requeridos: [],
    ejecutar: function () {
      var lista = (typeof S !== 'undefined' && S.items) || [];
      return {
        items: lista.map(function (it) {
          return {
            sku: String(it.sku || ''), nombre: it.name,
            cantidad: it.qty, categoria: it._cat || '',
            precio_cop: Math.round(it.price * 1000)
          };
        }),
        total_cop: _totalCotizacion(),
        moneda: 'COP'
      };
    }
  });

  window.AgentTools.registrar({
    nombre: 'registrar_faltante',
    descripcion: 'Deja registrado que alguien pidió algo que la tienda no tiene en la lista. Úsala cuando una búsqueda no encuentre nada.',
    parametros: { consulta: { type: 'string', description: 'Lo que se estaba buscando.' } },
    requeridos: ['consulta'],
    ejecutar: function (args) {
      var q = String(args.consulta || '').trim();
      if (q.length < 3) return { registrado: false };
      if (typeof window._logFailedSearchDebounced === 'function') {
        window._logFailedSearchDebounced(q);
        return { registrado: true };
      }
      return { registrado: false };
    }
  });

  // ── Interfaz ──────────────────────────────────────────────
  function _construir() {
    if (_construido) return;
    var d = document.createElement('div');
    d.className = 'aia-dock';
    d.id = 'aiaDock';
    d.innerHTML =
      '<div class="aia-hdr">' +
        '<span class="aia-title">Asesor IA</span>' +
        '<div class="aia-hdr-acts">' +
          '<button type="button" class="aia-hbtn" id="aiaNuevo" title="Empezar de cero">Nuevo</button>' +
          '<button type="button" class="aia-x" id="aiaCerrar" aria-label="Cerrar">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="aia-body" id="aiaBody"></div>' +
      '<div class="aia-foot">' +
        '<textarea id="aiaInput" rows="1" placeholder="Ej: PC para edición de video, 7 millones, ya tiene monitor"></textarea>' +
        '<button type="button" class="aia-send" id="aiaSend">Enviar</button>' +
      '</div>';
    document.body.appendChild(d);
    _construido = true;

    $('aiaCerrar').addEventListener('click', window.asesorIaCerrar);
    $('aiaNuevo').addEventListener('click', window.asesorIaNuevo);
    $('aiaSend').addEventListener('click', window.asesorIaEnviar);

    var inp = $('aiaInput');
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.asesorIaEnviar(); }
      if (e.key === 'Escape') window.asesorIaCerrar();
    });
    inp.addEventListener('input', function () {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
    });

    // Un solo listener para todas las tarjetas: nada de onclick inline con
    // datos del catálogo adentro.
    $('aiaBody').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-aia-add]') : null;
      if (!btn) return;
      var p = _crudoPorSku(btn.getAttribute('data-aia-add'));
      if (!p) { _toast('Ese producto ya no está en la lista activa', 'warn'); return; }
      if (typeof addItem === 'function' && addItem({ sku: p.sku, name: p.name, price: p.price, qty: 1, _cat: p._cat })) {
        if (typeof notifyQuote === 'function') notifyQuote();
        _toast('Agregado a la cotización', 'success');
      }
    });

    _pintarBienvenida();
  }

  function _fila(clase, html) {
    var b = $('aiaBody');
    if (!b) return null;
    var el = document.createElement('div');
    el.className = clase;
    el.innerHTML = html;
    b.appendChild(el);
    b.scrollTop = b.scrollHeight;
    return el;
  }

  function _pintarBienvenida() {
    _fila('aia-hint',
      'Busca en tu lista de precios, arma equipos y los agrega a la cotización.<br>' +
      'Los precios salen del catálogo, no del modelo. Tú decides qué se envía.');
  }

  function _pintarUsuario(txt) { _fila('aia-msg aia-yo', _esc(txt).replace(/\n/g, '<br>')); }

  function _pintarAsistente(txt) { _fila('aia-msg aia-ia', _esc(txt).replace(/\n/g, '<br>')); }

  function _pintarAviso(txt) { _fila('aia-aviso', _esc(txt)); }

  function _pintarPaso(nombre, args) {
    var detalle = '';
    if (nombre === 'buscar_productos') detalle = args.consulta || args.categoria || '';
    else if (nombre === 'detalle_producto') detalle = 'SKU ' + (args.sku || '');
    else if (nombre === 'info_tienda') detalle = args.tema || 'datos de la tienda';
    var etiquetas = {
      buscar_productos: 'Buscando', detalle_producto: 'Mirando', info_tienda: 'Consultando',
      agregar_a_cotizacion: 'Agregando', ver_cotizacion_actual: 'Revisando la cotización',
      registrar_faltante: 'Registrando faltante'
    };
    _fila('aia-paso', _esc((etiquetas[nombre] || nombre) + (detalle ? ': ' + detalle : '')));
  }

  function _pintarProductos(res) {
    if (!res || !res.productos || !res.productos.length) return;
    var html = '<div class="aia-cards">';
    for (var i = 0; i < res.productos.length; i++) {
      var p = res.productos[i];
      html += '<div class="aia-card">' +
        '<div class="aia-card-txt">' +
          '<div class="aia-card-nom">' + _esc(p.nombre) + '</div>' +
          '<div class="aia-card-meta">' + _esc(p.categoria) + ' &middot; SKU ' + _esc(p.sku) + '</div>' +
        '</div>' +
        '<div class="aia-card-der">' +
          '<div class="aia-card-precio">' + _esc(_cop(p.precio_cop)) + '</div>' +
          '<button type="button" class="aia-card-add" data-aia-add="' + _esc(p.sku) + '">Agregar</button>' +
        '</div>' +
      '</div>';
    }
    if (res.total_encontrados > res.mostrando) {
      html += '<div class="aia-cards-mas">' + (res.total_encontrados - res.mostrando) + ' más en el catálogo</div>';
    }
    _fila('', html + '</div>');
  }

  function _pensando(on) {
    var v = $('aiaPensando');
    if (on && !v) {
      var nueva = _fila('aia-pensando', '<span></span><span></span><span></span>');
      if (nueva) nueva.id = 'aiaPensando';
    }
    if (!on && v) v.remove();
  }

  function _bloquear(on) {
    _corriendo = on;
    var s = $('aiaSend'), i = $('aiaInput');
    if (s) { s.disabled = false; s.textContent = on ? 'Detener' : 'Enviar'; }
    if (i) i.disabled = on;
    _pensando(on);
  }

  // ── El ciclo ──────────────────────────────────────────────
  function _prompt() {
    var lista = '';
    try {
      lista = typeof listSourceLabel === 'function' ? listSourceLabel(normListSource(S.activePriceList)) : '';
    } catch (e) { /* sin catálogo cargado */ }
    return window.AgentTools.promptSistema({
      modo: 'asesor',
      cfg: typeof loadCfg === 'function' ? loadCfg() : {},
      hoy: new Date(),
      lista: lista
    });
  }

  function _recorte() {
    // Solo los últimos mensajes, pero sin cortar una tanda de herramientas por
    // la mitad: un resultado sin su llamada hace fallar a los proveedores.
    if (_mensajes.length <= MAX_HISTORIAL) return _mensajes.slice();
    var desde = _mensajes.length - MAX_HISTORIAL;
    while (desde < _mensajes.length && _mensajes[desde].rol !== 'usuario') desde++;
    return _mensajes.slice(desde);
  }

  async function _vueltas() {
    for (var vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      var resp = await window.AI.chat({
        modo: 'asesor',
        system: _prompt(),
        messages: _recorte(),
        tools: window.AgentTools.definiciones(HERRAMIENTAS),
        max_tokens: 1200,
        signal: _cancelar ? _cancelar.signal : undefined
      });

      _mensajes.push({ rol: 'asistente', texto: resp.texto, llamadas: resp.llamadas });
      if (resp.texto) _pintarAsistente(resp.texto);

      if (!resp.llamadas.length) {
        if (resp.fin === 'limite') _pintarAviso('La respuesta quedó cortada. Pídele que la resuma.');
        return;
      }

      var ctx = _contexto();
      for (var i = 0; i < resp.llamadas.length; i++) {
        var ll = resp.llamadas[i];
        _pintarPaso(ll.nombre, ll.args || {});
        var resultado = await window.AgentTools.ejecutar(ll.nombre, ll.args, ctx);
        if (ll.nombre === 'buscar_productos') _pintarProductos(resultado);
        _mensajes.push({ rol: 'herramienta', id: ll.id, nombre: ll.nombre, resultado: resultado });
      }
    }
    _pintarAviso('El asistente dio muchas vueltas buscando. Prueba pidiéndolo de forma más concreta.');
  }

  // ── API pública ───────────────────────────────────────────
  window.asesorIaAbrir = function () {
    if (!document.body.classList.contains('ai-unlocked')) {
      _toast('La IA no está habilitada para tu cuenta', 'warn');
      return;
    }
    if (!window.AgentTools || !window.AI) {
      _toast('El asistente no cargó bien. Recarga la página.', 'error');
      return;
    }
    _construir();
    $('aiaDock').classList.add('on');
    var chip = document.querySelector('.ai-chip[data-tool="chat"]');
    if (chip) chip.classList.add('active');
    setTimeout(function () { var i = $('aiaInput'); if (i) i.focus(); }, 150);
  };

  window.asesorIaCerrar = function () {
    var d = $('aiaDock');
    if (d) d.classList.remove('on');
    var chip = document.querySelector('.ai-chip[data-tool="chat"]');
    if (chip) chip.classList.remove('active');
  };

  window.asesorIaNuevo = function () {
    if (_corriendo) return;
    _mensajes = [];
    var b = $('aiaBody');
    if (b) b.innerHTML = '';
    _pintarBienvenida();
  };

  window.asesorIaDetener = function () {
    if (_cancelar) { try { _cancelar.abort(); } catch (e) {} }
  };

  window.asesorIaEnviar = function () {
    if (_corriendo) { window.asesorIaDetener(); return; }
    var inp = $('aiaInput');
    var txt = inp ? inp.value.trim() : '';
    if (!txt) return;
    if (!_catalogoCrudo().length) { _toast('Carga la lista de precios antes de usar el asistente', 'warn'); return; }

    inp.value = '';
    inp.style.height = 'auto';
    _pintarUsuario(txt);
    _mensajes.push({ rol: 'usuario', texto: txt });

    _cancelar = typeof AbortController !== 'undefined' ? new AbortController() : null;
    _bloquear(true);
    _vueltas()
      .catch(function (e) {
        if (e && e.name === 'AbortError') _pintarAviso('Cancelado.');
        else _pintarAviso((e && e.message) || 'El asistente no pudo responder.');
      })
      .then(function () { _bloquear(false); _cancelar = null; });
  };
})();
