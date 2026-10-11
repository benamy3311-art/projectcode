/* ProjectCode - hilos de luz de fondo.
   Un haz de cientos de hilos violeta y azules que cruza la pantalla, se cierra
   en un nudo y se vuelve a abrir. Al bajar por la pagina el nudo se desplaza, asi
   que cada seccion tiene el haz en un lugar distinto. Es decorativo: si el
   script falla la pagina queda igual, solo que sin luz. */
(function () {
  'use strict';
  var cv = document.getElementById('hilos');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var W = 0, H = 0, dpr = 1, N = 0, strands = [];

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    N = W < 700 ? 70 : 140;
    strands = [];
    for (var i = 0; i < N; i++) {
      var k = i / (N - 1);
      strands.push({
        k: k,
        off: (Math.random() - 0.5) * 2,       // donde queda el hilo dentro del haz
        ph: Math.random() * Math.PI * 2,      // fase propia: los hilos no van en bloque
        hue: 262 - Math.pow(Math.random(), 1.4) * 52, // de violeta a azul, con mas violeta
        a: 0.06 + Math.random() * 0.1,
        bright: Math.random() < 0.06
      });
    }
  }

  var scrollT = 0, target = 0, fade = 1, fadeTo = 1;
  function onScroll() {
    var y = window.pageYOffset || 0, max = Math.max(1, document.documentElement.scrollHeight - H);
    target = y / max;
    // entero en la portada; pasada la portada baja a poco mas de la mitad,
    // para que el haz no compita con el texto que se esta leyendo
    fadeTo = 1 - 0.45 * Math.min(1, Math.max(0, (y - H * 0.25) / (H * 0.6)));
  }

  /* El haz se curva un poco hacia el cursor, solo con raton. */
  var fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var mx = -1e4, my = 0, pull = 0, pullTo = 0;
  if (fine) {
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; pullTo = 1; }, { passive: true });
    document.addEventListener('pointerleave', function () { pullTo = 0; });
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    scrollT += (target - scrollT) * 0.06;
    fade += (fadeTo - fade) * 0.08;
    pull += (pullTo - pull) * 0.05;
    ctx.globalAlpha = fade;
    var s = scrollT * Math.PI * 4;              // la pagina entera son dos vueltas del haz
    var cy = H * (0.58 + 0.16 * Math.sin(s * 0.5 + 0.6));
    var knot = 0.55 + 0.25 * Math.sin(s * 0.37);  // x del nudo, en fraccion del ancho
    var spread = Math.min(H * 0.42, 340);
    var steps = W < 700 ? 40 : 70;

    for (var i = 0; i < N; i++) {
      var st = strands[i];
      ctx.beginPath();
      for (var j = 0; j <= steps; j++) {
        var u = j / steps;
        var x = -0.08 * W + u * 1.16 * W;
        var d = u - knot;
        // abierto en los extremos, cerrado en el nudo
        var open = Math.min(1, Math.abs(d) * 1.7) ;
        var tw = Math.sin(d * 6 + st.ph + t * 0.00025);
        var y = cy
          + st.off * spread * open * (0.55 + 0.45 * tw)
          + Math.sin(u * 3.1 + s + t * 0.00018 + st.k * 0.6) * H * 0.09
          - d * d * H * 0.35;
        if (pull > 0.01) {
          var dx = (x - mx) / 160;
          y += (my - y) * 0.16 * pull * Math.exp(-dx * dx);
        }
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'hsla(' + st.hue + ',92%,' + (st.bright ? 76 : 64) + '%,' + (st.bright ? st.a * 3 : st.a) + ')';
      ctx.lineWidth = st.bright ? 1.4 : 1;
      ctx.stroke();
    }

    // brillo del nudo
    var gx = W * knot, g = ctx.createRadialGradient(gx, cy, 0, gx, cy, spread * 0.9);
    g.addColorStop(0, 'rgba(139,92,255,0.14)');
    g.addColorStop(1, 'rgba(139,92,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(gx - spread, cy - spread, spread * 2, spread * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  var raf = 0, visible = true;
  // con "Pausar animaciones" el haz se queda quieto donde esta
  function loop(t) { if (!document.documentElement.classList.contains('paused')) draw(t); raf = requestAnimationFrame(loop); }
  function start() { if (!raf && visible) raf = requestAnimationFrame(loop); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  size(); onScroll(); scrollT = target; fade = fadeTo;
  window.addEventListener('resize', function () { size(); if (reduce) draw(0); });
  window.addEventListener('scroll', function () { onScroll(); if (reduce) { scrollT = target; fade = fadeTo; draw(0); } }, { passive: true });

  if (reduce) { draw(0); return; }
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden; if (visible) start(); else stop();
  });
  start();
})();
