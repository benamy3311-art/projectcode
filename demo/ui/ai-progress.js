// ============================================================
// ANILLO DE PROGRESO PARA ESPERAS DE IA
// ============================================================
// Reemplaza el spinner suelto en las funciones de IA que tardan
// decenas de segundos (Armar PC con los modelos de razonamiento).
// Muestra un anillo que se llena, la carita de la mascota parpadeando
// dentro, los segundos REALES transcurridos y una etiqueta de etapa.
//
// Honestidad de la barra: el proveedor no expone progreso real, así
// que el llenado del anillo es una ESTIMACIÓN sobre el tiempo típico
// (opts.expected). La curva es asintótica: se acerca al 92% y ahí se
// queda hasta que llega la respuesta — nunca se planta en 100%
// mintiendo, y nunca "retrocede". Los segundos de la línea de abajo sí
// son exactos (reloj), que es el dato que el vendedor necesita para
// decidir si sigue esperando.
//
// La carita es decorativa (aria-hidden): su expresión no significa
// nada sobre el estado, solo hace la espera menos larga. El dibujo
// vive en ui/pixel-pal.js; acá solo se pide la cara recortada.
//
// Globales que expone (window.*):
//   aiProgressStart(hostId, opts) — pinta el anillo y arranca. Devuelve
//                                   un handle (o null si no hay host).
//                                   opts.expected  — segundos típicos (def. 30)
//                                   opts.kind      — 'build' | 'search' (etapas)
//                                   opts.hint      — texto pequeño de abajo
//   aiProgressEnd(handle, ok)     — cierra: ok=true completa el anillo y
//                                   se desvanece; ok=false lo corta seco.
//
// Depende de: ui/pixel-pal.js (PixelPal.faceRects). Si no está cargado,
// el anillo funciona igual, solo que sin carita.
// Estilos en styles.css (.aip-*).
// Requiere DOM: un contenedor vacío cuyo id se pasa a aiProgressStart.
// ============================================================
(function () {

  // El anillo ocupa SIZE y deja SIZE - 2*STROKE libres adentro: 58px, para
  // la carita de 36x26 (18x13 pixeles a 2px exactos), que entra con 6.8px
  // de holgura por lado. Con el anillo viejo de 52 la carita rozaba el
  // trazo y se leía como una calcomanía pegada encima.
  // STROKE tiene que coincidir con el stroke-width de .aip-track/.aip-bar
  // en styles.css, que es donde vive el grosor.
  var SIZE = 68;                    // lado del anillo en pantalla
  var STROKE = 5;                   // grosor del trazo
  var R = (SIZE - STROKE) / 2;      // radio: deja el trazo justo adentro
  var BOX = SIZE;                   // lado del viewBox
  var MID = SIZE / 2;               // centro
  var C = 2 * Math.PI * R;          // circunferencia -> dasharray
  var CEIL = 0.92;                  // tope del llenado estimado
  var _seq = 0;

  // Etapas: [fracción del tiempo esperado hasta la que aplica, texto].
  // Son narrativas de tiempo, no progreso real reportado por el modelo.
  var STAGES = {
    build: [
      [0.10, 'Leyendo el catálogo'],
      [0.40, 'Eligiendo componentes'],
      [0.70, 'Revisando compatibilidad'],
      [1.00, 'Ajustando al presupuesto'],
      [999,  'Ya casi, cerrando el armado']
    ],
    search: [
      [0.15, 'Leyendo el catálogo'],
      [0.60, 'Buscando opciones'],
      [1.00, 'Comparando precios'],
      [999,  'Ya casi, afinando la lista']
    ]
  };

  function _stageIdx(kind, frac) {
    var list = STAGES[kind] || STAGES.build;
    for (var i = 0; i < list.length; i++) if (frac <= list[i][0]) return i;
    return list.length - 1;
  }

  function _stageText(kind, frac) {
    var list = STAGES[kind] || STAGES.build;
    return list[_stageIdx(kind, frac)][1];
  }

  // Caras de la espera. El dibujo vive en ui/pixel-pal.js; acá solo se
  // elige la expresión de turno. Todas contentas, como pidió el brief;
  // cambian cada CARA_MS para que la carita no quede tiesa.
  var MOODS = [
    ['normal', 'sonrisa'],
    ['feliz',  'sonrisa'],
    ['normal', 'o'],
    ['mira',   'sonrisa']
  ];
  var CARA_MS = 4200;
  var BLINK_EVERY = 3.4;   // segundos entre parpadeos
  var BLINK_MS = 0.18;     // cuánto dura el parpadeo
  var SCAN_S = 0.85;       // cada cuánto la mirada cambia de lado al "leer"

  function _face(eye, mouth) {
    return window.PixelPal ? PixelPal.faceRects(eye, mouth) : '';
  }

  // Llenado estimado: asintótico hacia CEIL. tau se calibra para que al
  // llegar al tiempo esperado el anillo vaya por ~85%, dejando margen
  // visible para las esperas que se pasan de la cuenta.
  function _estimate(elapsed, expected) {
    var tau = expected / 2.34;
    return CEIL * (1 - Math.exp(-elapsed / tau));
  }

  window.aiProgressStart = function (hostId, opts) {
    opts = opts || {};
    var host = document.getElementById(hostId);
    if (!host) return null;

    var expected = opts.expected || 30;
    var kind = opts.kind || 'build';
    var uid = 'aipg' + (++_seq);

    host.innerHTML =
      '<div class="aip">' +
        '<div class="aip-ring">' +
          '<svg class="aip-svg" viewBox="0 0 ' + BOX + ' ' + BOX + '" aria-hidden="true">' +
            '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0%" class="aip-g0"/><stop offset="100%" class="aip-g1"/>' +
            '</linearGradient></defs>' +
            '<circle class="aip-track" cx="' + MID + '" cy="' + MID + '" r="' + R + '"/>' +
            '<circle class="aip-bar" cx="' + MID + '" cy="' + MID + '" r="' + R + '" stroke="url(#' + uid + ')" ' +
              'stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"/>' +
          '</svg>' +
          '<svg class="aip-buddy" viewBox="' + (window.PixelPal ? PixelPal.FACE_BOX : '0 0 18 13') + '" ' +
            'shape-rendering="crispEdges" aria-hidden="true">' +
            '<g class="aip-face">' + _face('normal', 'sonrisa') + '</g>' +
          '</svg>' +
        '</div>' +
        '<div class="aip-txt">' +
          '<div class="aip-stage" role="status"></div>' +
          '<div class="aip-hint"><span class="aip-secs">0s</span> · ' +
            (opts.hint || 'suele tardar entre 20 y 45 segundos') + '</div>' +
        '</div>' +
      '</div>';
    host.classList.add('aip-host', 'on');

    var h = {
      host: host,
      bar: host.querySelector('.aip-bar'),
      face: host.querySelector('.aip-face'),
      secs: host.querySelector('.aip-secs'),
      stage: host.querySelector('.aip-stage'),
      t0: Date.now(),
      expected: expected,
      kind: kind,
      p: 0,
      timer: 0,
      faceKey: '',        // última expresión pintada, para no redibujar de más
      closing: false
    };

    // setInterval y no requestAnimationFrame: rAF se congela cuando la
    // pestaña pasa a segundo plano, y esta espera es justo el momento en
    // que el vendedor se va a mirar otra cosa. Con el intervalo, al
    // volver ve el tiempo real y no un anillo detenido. Lo fino del
    // movimiento lo pone la transición CSS de .aip-bar.
    function tick() {
      if (h.closing) return;
      var elapsed = (Date.now() - h.t0) / 1000;
      h.p = _estimate(elapsed, h.expected);
      h.bar.style.strokeDashoffset = (C * (1 - h.p)).toFixed(2);
      h.secs.textContent = Math.floor(elapsed) + 's';
      h.stage.textContent = _stageText(h.kind, elapsed / h.expected);

      // Cara. Durante la primera etapa ("Leyendo el catálogo") la mirada
      // barre de lado a lado, para que acompañe a la palabra que está justo
      // al lado en vez de rotar al azar; después vuelve al ciclo de gestos.
      // Sigue sin significar nada del estado real: el dato es .aip-secs.
      var eye, mouth;
      if (_stageIdx(h.kind, elapsed / h.expected) === 0) {
        eye = (Math.floor(elapsed / SCAN_S) % 2) ? 'mira' : 'normal';
        mouth = 'sonrisa';
      } else {
        var mood = MOODS[Math.floor(elapsed * 1000 / CARA_MS) % MOODS.length];
        eye = mood[0];
        mouth = mood[1];
      }
      // El +1.2 evita que el primer fotograma caiga dentro de un
      // parpadeo: si no, la mascota aparece con los ojos cerrados.
      if (((elapsed + 1.2) % BLINK_EVERY) < BLINK_MS) eye = 'cerrados';

      var key = eye + '|' + mouth;
      if (key !== h.faceKey) {
        h.faceKey = key;
        h.face.innerHTML = _face(eye, mouth);
      }
    }
    tick();
    h.timer = setInterval(tick, 120);
    return h;
  };

  window.aiProgressEnd = function (h, ok) {
    if (!h || h.closing) return;
    h.closing = true;
    if (h.timer) clearInterval(h.timer);

    if (!ok) { h.host.classList.remove('on'); h.host.innerHTML = ''; return; }

    // Cierre: del punto estimado al 100% en un tirón corto. Es el único
    // tramo del anillo que corresponde a algo real (ya llegó la respuesta).
    h.stage.textContent = 'Listo';
    h.face.innerHTML = _face('feliz', 'sonrisa');   // ojos arqueados
    h.host.classList.add('aip-done');
    h.bar.style.transition = 'stroke-dashoffset .28s cubic-bezier(.22,.61,.36,1)';
    h.bar.style.strokeDashoffset = '0';
    setTimeout(function () {
      h.host.classList.remove('on', 'aip-done');
      h.host.innerHTML = '';
    }, 620);
  };

})();
