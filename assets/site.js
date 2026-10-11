/* ProjectCode - comportamiento de la pagina: barra, aparicion, pestanas, cifras
   que cuentan y los ejemplos animados (la conversacion del hero, la corrida de la
   lista nueva, la recogida entre sedes, los dos formatos del documento).
   Todo lo que se mueve en bucle corre solo mientras se ve, se detiene con
   "Pausar animaciones" y, con movimiento reducido, se muestra ya terminado. */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var fine = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var hasIO = 'IntersectionObserver' in window;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  var paused = function () { return root.classList.contains('paused'); };

  /* Espera que se detiene mientras las animaciones estan en pausa. */
  function wait(ms) {
    return new Promise(function (done) {
      var left = ms, last = performance.now();
      (function tick() {
        var now = performance.now();
        if (!paused()) left -= now - last;
        last = now;
        if (left <= 0) done(); else setTimeout(tick, Math.min(left, 100));
      })();
    });
  }

  /* ─── Barra superior y progreso de lectura ─── */
  var nav = $('nav'), bar = $('progress');
  function onScroll() {
    var y = window.pageYOffset || 0, max = Math.max(1, root.scrollHeight - window.innerHeight);
    if (nav) nav.classList.toggle('solid', y > 12);
    if (bar) bar.style.setProperty('--p', Math.min(1, y / max).toFixed(4));
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ─── Pausar animaciones ─── */
  var pauseBtn = $('pause');
  if (pauseBtn) pauseBtn.addEventListener('click', function () {
    var on = !paused();
    root.classList.toggle('paused', on);
    pauseBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    pauseBtn.textContent = on ? 'Reanudar animaciones' : 'Pausar animaciones';
  });

  /* ─── Preparacion: titular de la portada palabra por palabra, y el orden
         de entrada de las barras del tablero ─── */
  var n = 0;
  each(document.querySelectorAll('.h1'), function (h) {
    (function split(node) {
      each(Array.prototype.slice.call(node.childNodes), function (c) {
        if (c.nodeType === 1) { split(c); return; }
        if (c.nodeType !== 3 || !c.textContent.trim()) return;
        var frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement('span');
          w.className = 'w'; w.textContent = part; w.style.setProperty('--i', n++);
          frag.appendChild(w);
        });
        node.replaceChild(frag, c);
      });
    })(h);
  });
  each(document.querySelectorAll('.week .slot'), function (s, i) { s.style.setProperty('--i', i); });
  each(document.querySelectorAll('.spark i'), function (s, i) { s.style.setProperty('--i', i); });

  /* ─── Cifras que cuentan, y precios que pasan del viejo al nuevo ─── */
  function animateNumber(el, from, to, dur, delay, show) {
    if (reduce) { el.textContent = show(to); return; }
    el.textContent = show(from);
    setTimeout(function () {
      var t0 = 0;
      requestAnimationFrame(function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = show(from + (to - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      });
    }, delay);
  }
  function revealed(el) {
    each(el.querySelectorAll('[data-count]'), function (c) {
      animateNumber(c, 0, parseInt(c.getAttribute('data-count'), 10), 1100, 0, Math.round);
    });
    each(el.querySelectorAll('.tick'), function (c) {
      animateNumber(c, +c.getAttribute('data-from'), +c.getAttribute('data-to'), 1000, 600, fmt);
    });
  }

  /* ─── Aparicion suave de los bloques ─── */
  var rv = document.querySelectorAll('.rv');
  if (hasIO && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in'); io.unobserve(e.target);
        revealed(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    each(rv, function (el) { io.observe(el); });
  } else {
    each(rv, function (el) { el.classList.add('in'); });
  }

  /* ─── Seccion activa en la barra ─── */
  var links = document.querySelectorAll('.nav-links a[href^="#"]');
  if (hasIO) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        each(links, function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + e.target.id ? 'true' : 'false'); });
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    each(document.querySelectorAll('main > section[id]'), function (s) { so.observe(s); });
  }

  /* ─── Pestanas accesibles ─── */
  each(document.querySelectorAll('[role="tablist"]'), function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function show(k, focus) {
      tabs.forEach(function (t, i) {
        var on = i === k, panel = $(t.getAttribute('aria-controls'));
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (panel) panel.hidden = !on;
      });
      if (focus) tabs[k].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var k = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') k = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') k = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = tabs.length - 1;
        if (k < 0) return;
        e.preventDefault(); show(k, true);
      });
    });
    show(0);
  });

  /* ─── Luz que sigue al cursor sobre los paneles, e inclinacion del pantallazo ─── */
  if (fine && !reduce) {
    document.addEventListener('pointermove', function (e) {
      var g = e.target.closest && e.target.closest('.glass');
      if (!g) return;
      var r = g.getBoundingClientRect();
      g.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      g.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });

    var vis = document.querySelector('.hero-vis'), win = document.querySelector('.hero-vis .win');
    var hero = document.querySelector('.hero');
    if (vis && win && hero) {
      hero.addEventListener('pointermove', function (e) {
        var r = vis.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        win.style.setProperty('--ry', (Math.max(-1, Math.min(1, x)) * 7).toFixed(2) + 'deg');
        win.style.setProperty('--rx', (Math.max(-1, Math.min(1, -y)) * 5).toFixed(2) + 'deg');
      });
      hero.addEventListener('pointerleave', function () { win.style.setProperty('--rx', '0deg'); win.style.setProperty('--ry', '0deg'); });
    }
  }

  /* ─── Lineas del flujo "lo que entra, lo que sale" ─── */
  function drawPipes() {
    each(document.querySelectorAll('.pipe-l'), function (box) {
      var svg = box.querySelector('svg'), w = box.clientWidth, h = box.clientHeight;
      if (!svg) return;
      if (!w || !h) { svg.innerHTML = ''; return; }
      var out = box.classList.contains('out');
      var ul = out ? box.nextElementSibling : box.previousElementSibling;
      var top = box.getBoundingClientRect().top, mid = h / 2, html = '';
      each(ul.children, function (li, i) {
        var r = li.getBoundingClientRect(), y = (r.top + r.height / 2 - top).toFixed(1);
        var d = out
          ? 'M0 ' + mid + ' C' + (w * 0.55) + ' ' + mid + ',' + (w * 0.45) + ' ' + y + ',' + w + ' ' + y
          : 'M0 ' + y + ' C' + (w * 0.55) + ' ' + y + ',' + (w * 0.45) + ' ' + mid + ',' + w + ' ' + mid;
        html += '<path class="base" d="' + d + '"/><path class="comet" pathLength="100" style="animation-delay:-' + ((i * 0.65) + (out ? 1.3 : 0)).toFixed(2) + 's" d="' + d + '"/>';
      });
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.innerHTML = html;
    });
  }
  drawPipes();
  window.addEventListener('resize', drawPipes);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawPipes);

  /* Hace correr un bucle solo mientras su elemento esta en pantalla. */
  function whileVisible(el, fn) {
    if (!el) return;
    if (!hasIO) { el.__on = true; fn(); return; }
    var started = false;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { el.__on = e.isIntersecting; if (e.isIntersecting && !started) { started = true; fn(); } });
    }, { threshold: 0.25 }).observe(el);
  }
  async function untilVisible(el) { while (!el.__on || paused()) await wait(400); }
  function set(id, cls, on) { var e = $(id); if (e) e.classList.toggle(cls, on); }

  /* ─── Hero: el cliente pregunta, el asesor cotiza y responde ─── */
  var vis2 = document.querySelector('.hero-vis');
  var items = document.querySelectorAll('#w-res li');
  var prices = [259000, 449000, 2349000];
  var queries = ['ssd 1tb', 'ddr5 32', 'video 12gb'];
  function steps(k) { [1, 2, 3].forEach(function (i) { set('w-s' + i, 'on', i === k); set('w-s' + i, 'done', i < k); }); }
  function setTotal(from, to) { animateNumber($('w-total'), from, to, 500, 0, fmt); }
  if (vis2 && reduce) {
    $('w-q').textContent = queries[2];
    each(items, function (li) { li.classList.add('show', 'added'); var b = li.querySelector('.mini-add'); b.classList.add('on'); b.textContent = '✓'; });
    $('w-total').textContent = fmt(3057000); $('w-refs').textContent = '3 ref. · 3 u.';
    set('w-ask', 'show', true); set('w-reply', 'show', true); steps(4);
  } else if (vis2) {
    whileVisible(vis2, async function () {
      var q = $('w-q');
      while (true) {
        q.textContent = ''; $('w-total').textContent = '$ 0'; $('w-refs').textContent = '0 ref. · 0 u.';
        each(items, function (li) { li.classList.remove('show', 'added'); var b = li.querySelector('.mini-add'); b.classList.remove('on'); b.textContent = '+'; });
        set('w-toast', 'show', false); set('w-ask', 'show', false); set('w-reply', 'show', false); steps(0);
        await wait(600);
        set('w-ask', 'show', true);
        await wait(1500);
        var total = 0;
        for (var k = 0; k < items.length; k++) {
          steps(1);
          q.textContent = '';
          for (var i = 0; i < queries[k].length; i++) { q.textContent += queries[k][i]; await wait(60 + Math.random() * 50); }
          await wait(200);
          items[k].classList.add('show');
          await wait(550);
          steps(2);
          var b = items[k].querySelector('.mini-add');
          b.classList.add('on'); b.textContent = '✓'; items[k].classList.add('added');
          setTotal(total, total + prices[k]); total += prices[k];
          $('w-refs').textContent = (k + 1) + ' ref. · ' + (k + 1) + ' u.';
          await wait(650);
        }
        steps(3);
        set('w-copy', 'flash', true); await wait(260); set('w-copy', 'flash', false);
        set('w-toast', 'show', true);
        await wait(900);
        set('w-reply', 'show', true);
        await wait(4200);
        await untilVisible(vis2);
      }
    });
  }

  /* ─── Tiempo: la lista nueva, paso por paso ─── */
  var run = $('run');
  if (run) {
    var rs = run.querySelectorAll('.steps-run li');
    var secs = function (ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; };
    if (reduce) {
      each(rs, function (li) { li.classList.add('done'); });
      $('run-state').textContent = 'listo para cotizar';
    } else {
      whileVisible(run, async function () {
        while (true) {
          each(rs, function (li) { li.classList.remove('go', 'done'); });
          $('run-state').textContent = 'en cola'; $('run-total').textContent = secs(0);
          await wait(900);
          $('run-state').textContent = 'corriendo';
          var acc = 0;
          for (var i = 0; i < rs.length; i++) {
            var ms = parseInt(rs[i].getAttribute('data-ms'), 10);
            // en pantalla va mas lento que en la realidad, para que alcance a leerse
            var show = Math.max(500, ms * 0.6), el = 0;
            rs[i].style.setProperty('--t', show + 'ms');
            rs[i].classList.add('go');
            while (el < show) { await wait(40); el += 40; $('run-total').textContent = secs(acc + ms * Math.min(1, el / show)); }
            acc += ms;
            $('run-total').textContent = secs(acc);
            rs[i].classList.remove('go'); rs[i].classList.add('done');
          }
          $('run-state').textContent = 'listo para cotizar';
          await wait(4200);
          await untilVisible(run);
        }
      });
    }
  }

  /* ─── Sedes: la recogida pasa de pendiente a entregada ─── */
  var relay = $('relay');
  if (relay) {
    var st = [$('r-s1'), $('r-s2'), $('r-s3')];
    var stage = function (k) { st.forEach(function (li, i) { li.classList.toggle('on', i === k); li.classList.toggle('done', i < k); }); };
    if (reduce) {
      stage(2); $('r-last').textContent = 'Entregado · 16:20';
    } else {
      whileVisible(relay, async function () {
        while (true) {
          relay.classList.remove('go'); set('r-ping', 'show', false); stage(-1);
          $('r-last').textContent = 'Esperando aviso';
          await wait(800);
          stage(0); relay.classList.add('go');
          await wait(1500);
          set('r-ping', 'show', true); $('r-last').textContent = 'Aviso recibido · 10:42';
          await wait(2400);
          stage(1); $('r-last').textContent = 'Preparado por Andrés · 10:51';
          await wait(1600);
          set('r-ping', 'show', false);
          await wait(800);
          stage(2); $('r-last').textContent = 'Entregado · 16:20';
          await wait(3200);
          await untilVisible(relay);
        }
      });
    }
  }

  /* ─── Documento: el mismo carrito para WhatsApp o en hoja A4 ─── */
  var fmtBox = $('fmt');
  if (fmtBox) {
    var btns = fmtBox.querySelectorAll('.seg button'), auto = !reduce;
    var pick = function (f) {
      fmtBox.classList.toggle('wa', f === 'wa');
      each(btns, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-fmt') === f ? 'true' : 'false'); });
    };
    each(btns, function (b) { b.addEventListener('click', function () { auto = false; pick(b.getAttribute('data-fmt')); }); });
    pick('a4');
    whileVisible(fmtBox, async function () {
      var cur = 'a4';
      while (auto) {
        await wait(4200);
        await untilVisible(fmtBox);
        if (!auto) break;
        cur = cur === 'a4' ? 'wa' : 'a4'; pick(cur);
      }
    });
  }

  /* ─── Documentos: clic para verlos en grande ─── */
  var zoom = $('zoom');
  if (zoom && zoom.showModal) {
    var zimg = zoom.querySelector('img');
    each(document.querySelectorAll('.zoomable'), function (img) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      if (!img.getAttribute('alt')) img.setAttribute('aria-label', 'Ver la cotización en grande');
      var open = function () { zimg.src = img.currentSrc || img.src; zimg.alt = img.alt; zoom.showModal(); };
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    zoom.querySelector('.zoom-x').addEventListener('click', function () { zoom.close(); });
    zoom.addEventListener('click', function (e) { if (e.target === zoom) zoom.close(); });
  }

  window.__pc = true;
})();
