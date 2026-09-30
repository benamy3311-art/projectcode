/* ProjectCode - comportamiento de la pagina: barra, aparicion, pestanas y la
   escena de la constelacion que corresponde a la seccion que se esta leyendo. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* Barra superior: transparente arriba, con un velo negro al bajar. */
  var nav = document.getElementById('nav');
  function onScroll() { if (nav) nav.classList.toggle('solid', (window.pageYOffset || 0) > 12); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Aparicion suave de los bloques al entrar en pantalla. */
  var rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
    each(rv, function (el) { io.observe(el); });
  } else {
    each(rv, function (el) { el.classList.add('in'); });
  }

  /* Escena de la constelacion: la de la seccion que cruza la mitad de la pantalla. */
  var sections = document.querySelectorAll('.sc[data-scene]');
  var links = document.querySelectorAll('.nav-links a[href^="#"]');
  var active = null, pending = null, timer = 0;

  function activate(sec) {
    if (!sec || sec === active) return;
    active = sec;
    if (window.Constelacion) window.Constelacion.set(sec.getAttribute('data-scene'), sec.getAttribute('data-side'), sec.id === 'top', parseFloat(sec.getAttribute('data-scale')) || 1);
    each(links, function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + sec.id ? 'true' : 'false'); });
  }
  function want(sec) {
    pending = sec; clearTimeout(timer);
    // un breve compas de espera: al saltar entre secciones no se arma una forma por cada una que se cruza
    timer = setTimeout(function () { activate(pending); }, active ? 110 : 0);
  }
  if ('IntersectionObserver' in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) want(e.target); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    each(sections, function (s) { so.observe(s); });
  }

  /* Pestanas: cada una puede traer su propia escena. */
  each(document.querySelectorAll('[role="tablist"]'), function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    var sec = list.closest('.sc');
    function show(n, focus) {
      tabs.forEach(function (t, i) {
        var on = i === n, panel = document.getElementById(t.getAttribute('aria-controls'));
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (panel) panel.hidden = !on;
      });
      var scene = tabs[n].getAttribute('data-scene');
      if (scene && sec) {
        sec.setAttribute('data-scene', scene);
        if (sec === active && window.Constelacion) window.Constelacion.set(scene, sec.getAttribute('data-side'), sec.id === 'top', parseFloat(sec.getAttribute('data-scale')) || 1);
      }
      if (focus) tabs[n].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var n = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        if (n < 0) return;
        e.preventDefault(); show(n, true);
      });
    });
    show(0);
  });

  window.__pc = true;
})();
