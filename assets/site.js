/* ProjectCode — navegación y demostraciones.
   Un solo reloj anima únicamente demos visibles. La pausa, la interacción,
   una pestaña oculta y la preferencia de movimiento detienen ese reloj. */
(function () {
  'use strict';
  var root = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };
  var all = function (selector, scope) { return Array.from((scope || document).querySelectorAll(selector)); };
  var media = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = media.matches, globalPause = false;
  var money = function (n) { return '$ ' + Math.round(n).toLocaleString('es-CO'); };

  /* Reveal ligero: el contenido permanece visible si no se carga JavaScript. */
  var reveals = all('.rv');
  if ('IntersectionObserver' in window && !reduced) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('in'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: 0.06 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add('in'); });

  /* Sección activa según la posición real bajo la cabecera. */
  var links = all('.nav-links a'), sections = all('main > section[id]');
  var scrollQueued = false;
  function scrollState() {
    scrollQueued = false;
    var y = window.scrollY, height = root.scrollHeight - innerHeight;
    $('nav').classList.toggle('solid', y > 12);
    $('progress').style.setProperty('--p', height > 0 ? Math.min(1, y / height) : 0);
    var current = '';
    sections.forEach(function (section) { if (section.getBoundingClientRect().top <= 150) current = section.id; });
    links.forEach(function (a) { if (a.hash === '#' + current) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  function queueScroll() { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(scrollState); } }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll);
  if ('ResizeObserver' in window) new ResizeObserver(queueScroll).observe(document.body);
  scrollState();

  /* Pestañas: flechas, Home/End y foco visible. Sin JS se leen todas. */
  all('[role="tablist"]').forEach(function (list) {
    var tabs = all('[role="tab"]', list);
    function show(index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index, panel = $(tab.getAttribute('aria-controls'));
        tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
        panel.hidden = !on; panel.tabIndex = 0;
      });
      if (focus) tabs[index].focus();
      queueScroll(); wake();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { show(i); });
      tab.addEventListener('keydown', function (event) {
        var next = { ArrowRight: (i + 1) % tabs.length, ArrowDown: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, ArrowUp: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
        if (next !== undefined) { event.preventDefault(); show(next, true); }
      });
    });
    // Bootstrap follows the motion registry initialization below.
    list.__init = function () { show(0); };
  });

  /* Reloj compartido. No se acumula tiempo fuera de pantalla ni en pausa. */
  var demos = [], raf = 0, last = 0;
  function runnable(demo) {
    return demo.visible && demo.auto && !demo.hover && !demo.focus && !globalPause && !reduced && !document.hidden && !document.querySelector('dialog[open]');
  }
  function sync() {
    root.classList.toggle('paused', globalPause || reduced || document.hidden || !!document.querySelector('dialog[open]'));
    demos.forEach(function (d) {
      d.el.classList.toggle('motion-held', !runnable(d));
      if (d.button) {
        var stopped = !d.auto;
        d.button.innerHTML = '<span aria-hidden="true">' + (stopped ? '▷' : 'Ⅱ') + '</span> ' + (stopped ? 'Reanudar' : 'Pausar');
        d.button.setAttribute('aria-label', (stopped ? 'Reanudar' : 'Pausar') + ' demostración de ' + d.name);
      }
    });
  }
  function wake() {
    if (!demos) return;
    sync();
    if (demos.some(runnable) && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    else if (!demos.some(runnable) && raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  }
  function tick(now) {
    raf = 0;
    var delta = last ? Math.min(now - last, 80) : 0; last = now;
    demos.forEach(function (d) { if (runnable(d)) { d.time += delta; d.render(d.time); } });
    if (demos.some(runnable)) raf = requestAnimationFrame(tick); else last = 0;
  }
  function demo(id, key, name, render, still) {
    var el = $(id); if (!el) return null;
    var d = { el: el, name: name, time: 0, auto: true, visible: false, hover: false, focus: false, render: render, still: still, button: document.querySelector('[data-demo-toggle="' + key + '"]') };
    demos.push(d);
    if (d.button) d.button.addEventListener('click', function () { d.auto = !d.auto; wake(); });
    el.addEventListener('focusin', function (e) { d.focus = e.target !== d.button; wake(); });
    el.addEventListener('focusout', function (e) { d.focus = el.contains(e.relatedTarget) && e.relatedTarget !== d.button; wake(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) { d.visible = entries[0].isIntersecting; wake(); }, { threshold: 0.15 }).observe(el);
    else d.visible = true;
    (reduced ? still : render)(0);
    return d;
  }
  function interaction(d) { if (d) { d.auto = false; wake(); } }
  function phase(el, value) { if (el.dataset.phase !== String(value)) el.dataset.phase = value; }

  /* Cotizar: buscar → agregar → compartir. El primer fotograma ya es legible. */
  var quote = $('quote-demo'), quoteItems = all('.quote-items li');
  var prices = [259000, 449000, 2349000], queries = ['ssd 1tb', 'ddr5 32', 'video 12gb'];
  function quoteRender(time) {
    var t = time % 15000, count = 3, query = queries[2], step = 2, total = 3057000;
    if (t >= 3000 && t < 11000) {
      var progress = (t - 3000) / (8000 / 3), index = Math.min(2, Math.floor(progress)), fraction = progress - index;
      count = index + (fraction > 0.58 ? 1 : 0); query = queries[index].slice(0, Math.max(1, Math.ceil(fraction * queries[index].length / 0.5)));
      total = prices.slice(0, index).reduce(function (a,b) { return a + b; }, 0);
      if (fraction > 0.58) total += prices[index] * Math.min(1, (fraction - 0.58) / 0.18);
      step = fraction < 0.58 ? 0 : 1;
    }
    var text = money(total); if ($('quote-total').textContent !== text) $('quote-total').textContent = text;
    if ($('quote-query').textContent !== query) $('quote-query').textContent = query;
    quoteItems.forEach(function (li, i) { li.classList.toggle('added', i < count); });
    if (quote.dataset.phase !== String(step)) {
      phase(quote, step);
      $('quote-step').textContent = ['1 de 3 · Busque', '2 de 3 · Agregue', '3 de 3 · Comparta'][step];
      $('quote-result-text').textContent = step === 2 ? 'Lista para compartir por WhatsApp o PDF' : 'La propuesta se prepara con su catálogo';
    }
  }
  demo('quote-demo', 'quote', 'cotización', quoteRender, function () { quoteRender(0); });

  /* Seguimiento: cada oportunidad recibe 7 segundos; al elegir, se detiene. */
  var followRows = all('[data-follow]'), followIndex = 0;
  var notes = ['Está comparando precios. Retomar la conversación y revisar una alternativa.', 'Necesita ajustar el presupuesto. Consultar opciones antes de volver a escribirle.', 'Confirmó la compra del monitor y el teclado. Cotización marcada como vendida.'];
  function selectFollow(index) {
    followIndex = index;
    followRows.forEach(function (row, i) { row.classList.toggle('focus', i === index); row.setAttribute('aria-pressed', String(i === index)); });
    if ($('follow-note').textContent !== notes[index]) $('follow-note').textContent = notes[index];
  }
  var follow = demo('follow-board', 'follow', 'seguimiento', function (time) {
    var index = Math.floor(time / 7000) % 3;
    if (index !== followIndex) selectFollow(index);
    $('follow-board').style.setProperty('--cycle', (time % 7000) / 7000);
  }, function () { selectFollow(followIndex); });
  followRows.forEach(function (row, i) {
    row.disabled = false;
    row.addEventListener('click', function () { interaction(follow); follow.time = i * 7000; selectFollow(i); $('follow-board').style.setProperty('--cycle', 0); });
    row.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { follow.hover = true; wake(); } });
    row.addEventListener('pointerleave', function () { follow.hover = false; wake(); });
  });

  /* Importación ilustrativa y recogida: avanzan solo dentro de su pestaña. */
  var runRows = all('#run .steps-run li'), runCount = -1;
  function runRender(time) {
    var t = time % 10000, count = t < 1800 ? 5 : Math.min(5, Math.floor((t - 1800) / 900));
    if (count === runCount) return; runCount = count;
    runRows.forEach(function (li, i) { li.classList.toggle('done', i < count); li.classList.toggle('go', i === count); li.style.setProperty('--t', '900ms'); });
    $('run-state').textContent = count === 5 ? 'listo para cotizar' : 'procesando';
    $('run-total').textContent = ['0,0 s','2,4 s','3,2 s','3,5 s','3,7 s','3,7 s'][count];
  }
  demo('run', 'run', 'catálogo', runRender, function () { runRender(0); });
  var relay = $('relay'), relayStates = all('#relay .states li'), relayIndex = -1;
  function relayRender(time) {
    var t = time % 12000, index = Math.min(2, Math.floor(t / 4000));
    if (index === relayIndex) return; relayIndex = index;
    relayStates.forEach(function (li, i) { li.classList.toggle('on', i === index); li.classList.toggle('done', i < index); });
    relay.classList.toggle('go', index < 2); $('r-ping').classList.toggle('show', index === 0);
    $('r-last').textContent = ['Aviso recibido · 10:42','Preparado por Andrés · 10:51','Entregado · 16:20'][index];
  }
  demo('relay','relay','recogidas',relayRender,function () { relayRender(8000); });

  /* Documentos: alternancia pausada por selección, foco o ampliación. */
  var fmt = $('fmt'), format = '';
  function pick(value) {
    if (format === value) return; format = value;
    fmt.classList.toggle('wa', value === 'wa');
    all('.seg button', fmt).forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.fmt === value)); });
    all('.wa-doc,.a4', fmt).forEach(function (el) { var hidden = el.classList.contains('a4') ? value === 'wa' : value !== 'wa'; el.inert = hidden; el.setAttribute('aria-hidden', String(hidden)); });
  }
  var formats = demo('fmt','format','formatos',function (t) { pick(Math.floor(t / 8000) % 2 ? 'wa' : 'a4'); },function () { pick('a4'); });
  fmt.querySelector('.stage').addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { formats.hover = true; wake(); } });
  fmt.querySelector('.stage').addEventListener('pointerleave', function () { formats.hover = false; wake(); });
  all('.seg button', fmt).forEach(function (button) { button.addEventListener('click',function () { interaction(formats); pick(button.dataset.fmt); formats.time = button.dataset.fmt === 'wa' ? 8000 : 0; }); });

  /* Pausa general y cambios de preferencia del sistema, incluso en caliente. */
  $('pause').addEventListener('click', function () {
    globalPause = !globalPause;
    $('pause').setAttribute('aria-pressed', String(globalPause));
    $('pause').textContent = globalPause ? 'Reanudar animaciones' : 'Pausar animaciones'; wake();
  });
  function preference(event) {
    reduced = event.matches;
    if (reduced) { demos.forEach(function (d) { d.still(); }); reveals.forEach(function (el) { el.classList.add('in'); }); }
    wake();
  }
  if (media.addEventListener) media.addEventListener('change',preference); else media.addListener(preference);
  document.addEventListener('visibilitychange',wake);

  /* Ampliación accesible: Escape, botón de cierre y devolución del foco. */
  var zoom = $('zoom'), opener;
  if (zoom && zoom.showModal) {
    var zimg = zoom.querySelector('img');
    all('.zoomable').forEach(function (img) {
      img.tabIndex = 0; img.setAttribute('role','button');
      img.setAttribute('aria-label','Ampliar: ' + (img.alt || 'cotización'));
      function open() { opener = img; zimg.src = img.currentSrc || img.src; zimg.alt = img.alt; zoom.showModal(); wake(); }
      img.addEventListener('click',open);
      img.addEventListener('keydown',function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    zoom.querySelector('.zoom-x').addEventListener('click',function () { zoom.close(); });
    zoom.addEventListener('click',function (e) { if (e.target === zoom) zoom.close(); });
    zoom.addEventListener('close',function () { if (opener) opener.focus(); wake(); });
  }
  all('[role="tablist"]').forEach(function (list) { list.__init(); delete list.__init; });
  root.classList.add('ready');
  window.__pc = true;
  wake();
})();
