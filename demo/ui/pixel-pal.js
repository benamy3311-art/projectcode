// ============================================================
// PIXEL PAL — el sprite de la mascota (arte, sin comportamiento)
// ============================================================
// Reproducción en pixel art del "Pixel Companion" que trajo Samuel:
// robot azul de silueta redondeada, pantalla blanca por cara, ojos
// grandes con destello, rayo naranja, orejitas de 3px y las luces del
// panel. Rejilla de 32x32, paleta de la lámina original:
//   B #2563eb azul   K #0d1321 contorno y ojos   W #ffffff pantalla
//   O #ff8a00 rayo   L azul claro (brillo y luces)
//
// Este archivo SOLO tiene el dibujo, para que lo compartan quienes lo
// necesiten sin duplicar el arte:
//   ui/companion.js   — la mascota que se posa en las líneas
//   ui/ai-progress.js — la cara (pantalla + ojos) dentro del anillo
//
// Globales que expone (window.*):
//   PixelPal.sprite(ojos, boca)  — SVG completo (viewBox 0 0 32 32)
//   PixelPal.faceRects(ojos, boca) — la carita del anillo: pantalla, borde
//                                    y ojos medianos (viewBox en FACE_BOX)
//   PixelPal.FACE_BOX            — viewBox de la carita del anillo
//   PixelPal.EYE_KINDS           — nombres de expresiones disponibles
//
// Depende de: nada. Colores en styles.css (.pp-*).
// ============================================================
(function () {

  var BODY = [
    '................................',
    '................................',
    '...................K............',
    '..................KOK...........',
    '.................KOOK...........',
    '................KOOKK...........',
    '...............KOOOOOK..........',
    '................KKOOK...........',
    '................KOOK............',
    '.........KKKKKKKKOKKKKK.........',
    '........KBBBBBBBBBBBBBBK........',
    '.......KBBBBBBBBBBBBBBBBK.......',
    '......KBLLBBBBBBBBBBBBBBBK......',
    '.....KBLBBBBBBBBBBBBBBBBBBK.....',
    '....KBBBBBBWWWWWWWWWWBBBBBBK....',
    '....KBBBBBWWWWWWWWWWWWBBBBBK....',
    '....KBBBBWWWWWWWWWWWWWWBBBBK....',
    '..KKKBBBWWWWWWWWWWWWWWWWBBBKKK..',
    '.KBBKBBBWWWWWWWWWWWWWWWWBBBKBBK.',
    '.KBBKBBBWWWWWWWWWWWWWWWWBBBKBBK.',
    '.KBBKBBBWWWWWWWWWWWWWWWWBBBKBBK.',
    '..KKKBBBWWWWWWWWWWWWWWWWBBBKKK..',
    '....KBBBBWWWWWWWWWWWWWWBBBBK....',
    '....KBBBBBWWWWWWWWWWWWBBBBBK....',
    '....KBBBBBBWWWWWWWWWWBBBBBBK....',
    '....KBBBBBBBBBBBBBBBBBBBBBBK....',
    '.....KBBBBBBBBLBLBOBBBBBBBK.....',
    '......KBBBBBBBBBBBBBBBBBBK......',
    '.......KBBBBKKKKKKKKBBBBK.......',
    '........KBBBK......KBBBK........',
    '.........KKK........KKK.........',
    '................................'
  ];

  // Ojos y boca, en coordenadas de la rejilla de 32x32. 'K' es el ojo
  // y 'W' el destello — un pixel blanco arriba a la izquierda es lo
  // que hace que el ojo mire en vez de parecer una mancha.
  var EYES = {
    normal: {
      K: [[16,11],[16,12],[16,13],[17,11],[17,12],[17,13],[17,14],[18,11],[18,12],[18,13],[18,14],
          [19,11],[19,12],[19,13],[19,14],[20,11],[20,12],[20,13],[20,14],[21,12],[21,13],
          [16,18],[16,19],[16,20],[17,17],[17,18],[17,19],[17,20],[18,17],[18,18],[18,19],[18,20],
          [19,17],[19,18],[19,19],[19,20],[20,17],[20,18],[20,19],[20,20],[21,18],[21,19]],
      W: [[17,12],[17,13],[18,12],[17,18],[17,19],[18,18]]
    },
    feliz:  { K: [[18,11],[19,12],[19,13],[18,14],[18,17],[19,18],[19,19],[18,20]], W: [] },
    cerrados: { K: [[19,11],[19,12],[19,13],[19,14],[19,17],[19,18],[19,19],[19,20]], W: [] },
    // mirando a un lado: el destello se corre al otro extremo del ojo
    mira: {
      K: [[16,11],[16,12],[16,13],[17,11],[17,12],[17,13],[17,14],[18,11],[18,12],[18,13],[18,14],
          [19,11],[19,12],[19,13],[19,14],[20,11],[20,12],[20,13],[20,14],[21,12],[21,13],
          [16,18],[16,19],[16,20],[17,17],[17,18],[17,19],[17,20],[18,17],[18,18],[18,19],[18,20],
          [19,17],[19,18],[19,19],[19,20],[20,17],[20,18],[20,19],[20,20],[21,18],[21,19]],
      W: [[19,13],[19,14],[20,13],[19,19],[19,20],[20,19]]
    }
  };
  // La sonrisa vieja ocupaba las columnas 15 y 17 con el pixel de abajo en
  // la 16: su centro caía en 16.5, media casilla a la derecha del eje de
  // los ojos (16). Como la boca 'o' sí estaba centrada, la boca se corría
  // de lado cada vez que rotaba el gesto. Con 3 pixeles es imposible
  // centrar en un eje entero, así que la sonrisa pasa a 4 de ancho.
  var MOUTH = {
    sonrisa: [[22,14],[22,17],[23,15],[23,16]],
    o:       [[22,15],[22,16],[23,15],[23,16]]
  };

  var CLS = { B: 'pp-b', K: 'pp-k', W: 'pp-w', O: 'pp-o', L: 'pp-l' };

  // El sprite es simétrico respecto a x=16, así que el ojo derecho se saca
  // espejando el izquierdo. El destello NO se espeja: se traslada, para que
  // los dos ojos miren al mismo lado en vez de quedar bizcos.
  function _mirror(l) { return l.map(function (p) { return [p[0], 31 - p[1]]; }); }
  function _shift(l, d) { return l.map(function (p) { return [p[0], p[1] + d]; }); }
  function _both(l) { return l.concat(_mirror(l)); }

  // ── Ojos de la carita del anillo ─────────────────────────────────────
  // Versión mediana (4x4) del ojo del sprite (4x6). A 2px por pixel el
  // bloque grande pesa demasiado y la carita se lee como delineado; este
  // conserva el gesto con casi la mitad de masa oscura.
  var _OJO   = [[17,12],[17,13],
                [18,11],[18,12],[18,13],[18,14],
                [19,11],[19,12],[19,13],[19,14],
                [20,12],[20,13]];
  var _FELIZ = [[18,11],[19,12],[19,13],[18,14]];
  var _CERR  = [[19,11],[19,12],[19,13],[19,14]];
  var _HI_N  = [[18,12]];   // destello arriba a la izquierda
  var _HI_M  = [[19,13]];   // destello abajo a la derecha: mira al otro lado
  var _DX    = 6;           // separación entre el ojo izquierdo y el derecho

  var EYES_RING = {
    normal:   { K: _both(_OJO),   W: _HI_N.concat(_shift(_HI_N, _DX)) },
    mira:     { K: _both(_OJO),   W: _HI_M.concat(_shift(_HI_M, _DX)) },
    feliz:    { K: _both(_FELIZ), W: [] },
    cerrados: { K: _both(_CERR),  W: [] }
  };

  // ── Pantalla y borde de la carita del anillo ─────────────────────────
  // Antes el recorte se quedaba SOLO con ojos y boca, y omitía la pantalla
  // blanca "porque sobre la tarjeta clara no se vería". Era al revés: sin
  // ese campo blanco los ojos oscuros quedan flotando sobre el celeste y se
  // leen como delineado y ojeras. Ahora la carita lleva la pantalla entera
  // más un borde azul de 1px, que de paso la ata con el trazo del anillo.
  //
  // La pantalla se lee del propio BODY (sus 'W') en vez de repetir
  // coordenadas a mano: si algún día se retoca el dibujo, el recorte sigue
  // solo y no queda desfasado.
  function _screenCells() {
    var out = [];
    for (var y = 0; y < BODY.length; y++)
      for (var x = 0; x < BODY[y].length; x++)
        if (BODY[y][x] === 'W') out.push([y, x]);
    return out;
  }
  // Borde: las 8 vecinas de la pantalla que no son pantalla.
  function _dilate(cells) {
    var seen = {}, out = [];
    cells.forEach(function (p) { seen[p[0] + ',' + p[1]] = 1; });
    cells.forEach(function (p) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var y = p[0] + dy, x = p[1] + dx, k = y + ',' + x;
        if (!seen[k]) { seen[k] = 1; out.push([y, x]); }
      }
    });
    return out;
  }
  function _bbox(cells) {
    var y0 = 1e9, x0 = 1e9, y1 = -1e9, x1 = -1e9;
    cells.forEach(function (p) {
      if (p[0] < y0) y0 = p[0];  if (p[0] > y1) y1 = p[0];
      if (p[1] < x0) x0 = p[1];  if (p[1] > x1) x1 = p[1];
    });
    return { y: y0, x: x0, h: y1 - y0 + 1, w: x1 - x0 + 1 };
  }

  var _SCREEN = _screenCells();
  var _RIM    = _dilate(_SCREEN);
  var _FBOX   = _bbox(_SCREEN.concat(_RIM));   // 18x13 arrancando en (13,7)

  // Une pixeles contiguos de la misma fila en un solo <rect>: el cuerpo
  // pasa de ~550 nodos a ~120, que es lo que se redibuja al animar.
  function _run(grid, cls, x0, y0) {
    var out = '';
    for (var y = 0; y < grid.length; y++) {
      var x = 0;
      while (x < grid[y].length) {
        var ch = grid[y][x];
        if (ch === '.') { x++; continue; }
        var n = 1;
        while (x + n < grid[y].length && grid[y][x + n] === ch) n++;
        out += '<rect class="' + (cls || CLS[ch]) + '" x="' + (x - x0) + '" y="' + (y - y0) +
               '" width="' + n + '" height="1"/>';
        x += n;
      }
    }
    return out;
  }

  function _paint(base, eye, mouth) {
    var g = base.map(function (r) { return r.split(''); });
    var e = EYES[eye] || EYES.normal;
    e.K.forEach(function (p) { g[p[0]][p[1]] = 'K'; });
    e.W.forEach(function (p) { g[p[0]][p[1]] = 'W'; });
    (MOUTH[mouth] || MOUTH.sonrisa).forEach(function (p) { g[p[0]][p[1]] = 'K'; });
    return g.map(function (r) { return r.join(''); });
  }

  window.PixelPal = {
    EYE_KINDS: Object.keys(EYES),
    FACE_BOX: '0 0 ' + _FBOX.w + ' ' + _FBOX.h,

    // SVG completo de la mascota.
    sprite: function (eye, mouth) {
      return '<svg class="pp-svg" viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">' +
             _run(_paint(BODY, eye, mouth), null, 0, 0) + '</svg>';
    },

    // La carita del anillo: borde azul, pantalla blanca, ojos medianos y
    // boca. Se compone desde las tablas y no desde el cuerpo pintado, para
    // no arrastrar el resto del robot.
    faceRects: function (eye, mouth) {
      var crop = [];
      for (var i = 0; i < _FBOX.h; i++) crop.push(new Array(_FBOX.w + 1).join('.').split(''));
      function set(list, ch) {
        (list || []).forEach(function (p) {
          var y = p[0] - _FBOX.y, x = p[1] - _FBOX.x;
          if (y >= 0 && y < _FBOX.h && x >= 0 && x < _FBOX.w) crop[y][x] = ch;
        });
      }
      set(_RIM, 'B');                       // borde azul, primero: lo tapa todo lo demás
      set(_SCREEN, 'W');                    // pantalla
      var e = EYES_RING[eye] || EYES_RING.normal;
      set(e.K, 'K');
      set(e.W, 'W');                        // destello, blanco dentro del ojo
      set(MOUTH[mouth] || MOUTH.sonrisa, 'K');
      return _run(crop.map(function (r) { return r.join(''); }), null, 0, 0);
    }
  };

})();
