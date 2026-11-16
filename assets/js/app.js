/* ProjectCode — comportamiento de la página. La respuesta al tocar viene de tacto.js;
   la app para probar vive en prueba.js. */
(() => {
  'use strict';

  // WhatsApp de ProjectCode, con indicativo de país y sin espacios.
  const WHATSAPP = '573046217300';

  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const pesos = n => dinero.format(n).replace(/\s/g, '\u00A0');

  // ── Titular móvil: cada línea al ancho real del contenedor ──
  function ajustar(bloque) {
    const ancho = bloque.parentElement.clientWidth;
    if (!ancho || !bloque.offsetParent) return;
    const lineas = $$('.linea', bloque);
    for (let pasada = 0; pasada < 2; pasada++) {
      const actual = parseFloat(getComputedStyle(bloque).fontSize);
      const mayor = Math.max(...lineas.map(l => l.getBoundingClientRect().width));
      if (!mayor) return;
      bloque.style.fontSize = (actual * (ancho * 0.99) / mayor).toFixed(2) + 'px';
    }
  }
  const bloques = $$('.ajusta');
  const reajustar = () => bloques.forEach(ajustar);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(reajustar);
    bloques.forEach(b => ro.observe(b.parentElement));
  } else addEventListener('resize', reajustar);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(reajustar);

  // ── El arte del héroe: la luz sigue al cursor y la P se deja atraer ──
  const arte = $('#arte');
  if (arte && window.tacto) {
    arte.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = arte.getBoundingClientRect();
      arte.style.setProperty('--lx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      arte.style.setProperty('--ly', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    tacto.iman($('#pe-vidrio'), { fuerza: .08, zona: arte });
  }

  // ── Entrada al aparecer: una vez, de arriba abajo, 40 ms entre piezas ──
  const grupos = new Map();
  $$('.revela').forEach(el => {
    const grupo = el.closest('section, footer') || document.body;
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    const lista = grupos.get(grupo);
    el.style.setProperty('--orden', Math.min(lista.length, 7));
    lista.push(el);
  });
  const alVer = (umbral, fn) => {
    if (!('IntersectionObserver' in window)) return el => fn(el);
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { io.unobserve(e.target); fn(e.target); }
    }), { threshold: umbral, rootMargin: '0px 0px -8% 0px' });
    return el => io.observe(el);
  };
  window.alVer = alVer;
  const verRevela = alVer(0.12, el => { el.dataset.visto = ''; });
  $$('.revela').forEach(verRevela);

  // ── La sección en pantalla se marca en el menú ──
  const enlaces = $$('.nav a');
  const destinos = enlaces.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const marcarNav = () => {
    const y = innerHeight * 0.35;
    let activo = null;
    destinos.forEach(d => { if (d.getBoundingClientRect().top <= y) activo = d; });
    enlaces.forEach(a => a.toggleAttribute('aria-current', !!activo && a.getAttribute('href') === '#' + activo.id));
  };
  addEventListener('scroll', () => requestAnimationFrame(marcarNav), { passive: true });

  // ── Tiempo: un pedido contado en seis pasos ──
  const pasos = $$('#pasos li');
  const piezasChat = $$('#chat [data-paso]');
  const estado = $('#chat-estado');
  const repetir = $('#repetir');
  let relojes = [];
  function pintarPaso(i) {
    pasos.forEach((li, n) => li.toggleAttribute('data-hecho', n <= i));
    piezasChat.forEach(p => p.toggleAttribute('data-visible', +p.dataset.paso <= i));
    if (estado) estado.textContent = i === 4 ? 'escribiendo…' : 'en línea';
    if (i === 5) {
      const trazo = $('#chat .msg-sistema');
      setTimeout(() => trazo && trazo.setAttribute('data-dibujado', ''), 120);
    }
  }
  function reproducir() {
    relojes.forEach(clearTimeout);
    relojes = [];
    $('#chat .msg-sistema')?.removeAttribute('data-dibujado');
    pintarPaso(-1);
    if (reducido.matches) { pintarPaso(pasos.length - 1); return; }
    tacto.cara(repetir, 1);
    repetir.disabled = true;
    const ritmo = [250, 1100, 2000, 2900, 4000, 4900];
    ritmo.forEach((t, i) => relojes.push(setTimeout(() => pintarPaso(i), t)));
    relojes.push(setTimeout(() => { tacto.cara(repetir, 0); repetir.disabled = false; }, 5500));
  }
  if (pasos.length) {
    alVer(0.35, reproducir)($('#chat'));
    repetir.addEventListener('click', reproducir);
  }

  // ── Dinero: la calculadora ──
  const calc = $('#calculadora');
  if (calc) {
    const v = id => +$('#' + id).value;
    const MIN_CON_APP = 2, DIAS = 24;
    let primera = true;
    function calcular() {
      const cot = v('c-cotizaciones'), min = v('c-minutos'), ases = v('c-asesores'), hora = v('c-hora');
      $('#o-cotizaciones').textContent = cot;
      $('#o-minutos').textContent = min + ' min';
      $('#o-asesores').textContent = ases;
      $('#o-hora').textContent = pesos(hora);
      const horas = Math.max(0, Math.round((min - MIN_CON_APP) * cot * ases * DIAS / 60));
      const valor = Math.round(horas * hora / 1000) * 1000;
      const h = $('#r-horas'), val = $('#r-valor');
      if (primera) { h.textContent = horas; h.dataset.valor = String(horas); val.textContent = pesos(valor); val.dataset.valor = pesos(valor); primera = false; }
      else { tacto.cifra(h, String(horas)); tacto.cifra(val, pesos(valor)); }
    }
    calc.addEventListener('input', calcular);
    calc.addEventListener('submit', e => e.preventDefault());
    calcular();
  }

  // ── Funciones: momentos en el mismo sitio ──
  const riel = $('.indice');
  const escenario = $('#escenario');
  const ciclo = $('#funciones');
  if (riel && escenario) {
    const pestanas = $$('[role=tab]', riel);
    const momentos = pestanas.map(t => document.getElementById(t.getAttribute('aria-controls')));
    let actual = 0;

    const colocarPildora = () => {
      const y = pestanas.slice(0, actual).reduce((s, t) => s + t.offsetHeight, 0);
      riel.style.setProperty('--y', y + 'px');
      riel.style.setProperty('--h', pestanas[actual].offsetHeight + 'px');
      if (!riel.dataset.medido) requestAnimationFrame(() => requestAnimationFrame(() => { riel.dataset.medido = 'ya'; }));
    };
    function jugar(m) {
      momentos.forEach(x => { if (x !== m) x.removeAttribute('data-juega'); });
      m.removeAttribute('data-juega');
      void m.offsetWidth;
      m.dataset.juega = '';
    }
    function ir(n, { teclado = false, enfocar = false } = {}) {
      n = Math.max(0, Math.min(momentos.length - 1, n));
      if (n === actual) { volverAlSitio(); return; }
      const dir = n > actual ? 1 : -1;
      const sale = momentos[actual], entra = momentos[n];
      ciclo.toggleAttribute('data-teclado', teclado);
      entra.style.transition = 'none';
      entra.style.translate = `${dir * 16}px 0`;
      void entra.offsetWidth;
      entra.style.transition = '';
      entra.style.translate = '';
      sale.style.translate = `${dir * -16}px 0`;
      sale.removeAttribute('data-activo');
      entra.dataset.activo = '';
      pestanas.forEach((t, i) => {
        t.setAttribute('aria-selected', String(i === n));
        t.tabIndex = i === n ? 0 : -1;
        t.parentElement.toggleAttribute('data-activo', i === n);
      });
      actual = n;
      colocarPildora();
      if (enfocar) pestanas[n].focus();
      if (!teclado) tacto.sentir('seleccion');
      jugar(entra);
    }
    pestanas.forEach((t, i) => t.addEventListener('click', e => ir(i, { teclado: e.detail === 0 })));
    riel.addEventListener('keydown', e => {
      const mapa = { ArrowDown: actual + 1, ArrowRight: actual + 1, ArrowUp: actual - 1, ArrowLeft: actual - 1, Home: 0, End: momentos.length - 1 };
      if (!(e.key in mapa)) return;
      e.preventDefault();
      ir(mapa[e.key], { teclado: true, enfocar: true });
    });

    // Arrastrar el escenario: sigue al dedo, cede como goma en los extremos y decide con el impulso
    const rastro = tacto.rastro();
    let x0 = null, y0 = 0, dx = 0, horizontal = null, activo = null;
    function volverAlSitio() { const m = momentos[actual]; m.style.transition = ''; m.style.translate = ''; }
    escenario.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; horizontal = null; activo = momentos[actual];
      rastro.limpiar();
    });
    escenario.addEventListener('pointermove', e => {
      if (x0 === null) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (horizontal === null && Math.hypot(mx, my) > 8) {
        horizontal = Math.abs(mx) > Math.abs(my);
        if (horizontal) { escenario.setPointerCapture(e.pointerId); escenario.dataset.arrastra = ''; activo.style.transition = 'none'; }
        else { x0 = null; return; }
      }
      if (!horizontal) return;
      rastro.anotar(e.clientX, 0);
      const enBorde = (mx > 0 && actual === 0) || (mx < 0 && actual === momentos.length - 1);
      dx = enBorde ? tacto.goma(mx, escenario.clientWidth * 0.25) : mx;
      activo.style.translate = `${dx}px 0`;
    });
    const soltar = () => {
      if (x0 === null) return;
      x0 = null;
      delete escenario.dataset.arrastra;
      if (!horizontal) return;
      const destino = dx + tacto.proyectar(rastro.velocidad().x, 0.99);
      activo.style.transition = '';
      const umbral = escenario.clientWidth * 0.22;
      if (destino < -umbral && actual < momentos.length - 1) ir(actual + 1);
      else if (destino > umbral && actual > 0) ir(actual - 1);
      else { volverAlSitio(); if (Math.abs(dx) > 24) tacto.sentir('limite'); }
    };
    escenario.addEventListener('pointerup', soltar);
    escenario.addEventListener('pointercancel', soltar);
    escenario.addEventListener('click', e => { if (Math.abs(dx) > 8) { e.preventDefault(); e.stopPropagation(); dx = 0; } }, true);

    if ('ResizeObserver' in window) new ResizeObserver(colocarPildora).observe(riel);
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(colocarPildora);
    colocarPildora();
    alVer(0.35, () => jugar(momentos[actual]))(escenario);
  }

  // ── Hojas: menú, documento y demo ──
  const abrir = (id, origen) => {
    const d = document.getElementById(id);
    if (!d) return;
    if (id === 'demo') reiniciarDemo(origen && origen.dataset.plan);
    if (!d.open) d.showModal();
  };
  window.abrirHoja = abrir;
  document.addEventListener('click', e => {
    const disparador = e.target.closest('[data-abre]');
    if (disparador) { abrir(disparador.dataset.abre, disparador); return; }
    const cierre = e.target.closest('[data-cierra]');
    if (cierre) { cierre.closest('dialog').close(); return; }
  });
  $$('dialog.hoja').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });
  $$('#menu nav a').forEach(a => a.addEventListener('click', () => $('#menu').close()));

  // Arrastrar la hoja hacia abajo la cierra, con el mismo muelle
  $$('.hoja .asa').forEach(asa => {
    const hoja = asa.closest('.hoja');
    let y0 = null, dy = 0;
    const rastro = tacto.rastro();
    asa.style.touchAction = 'none';
    asa.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; rastro.limpiar(); asa.setPointerCapture(e.pointerId); hoja.style.transition = 'none'; });
    asa.addEventListener('pointermove', e => {
      if (y0 === null) return;
      dy = e.clientY - y0;
      rastro.anotar(0, e.clientY);
      hoja.style.translate = `0 ${dy > 0 ? dy : tacto.goma(dy, 200)}px`;
    });
    const soltar = () => {
      if (y0 === null) return;
      y0 = null;
      const v = rastro.velocidad().y;
      hoja.style.transition = '';
      hoja.style.translate = '';
      if (dy + tacto.proyectar(v) > hoja.offsetHeight * 0.4) hoja.close();
    };
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
  });

  // ── Demo: la acción clave de la página ──
  const form = $('#form-demo');
  const enviar = form.querySelector('[type=submit]');
  const gracias = form.querySelector('.demo-gracias');
  const telefono = form.elements.whatsapp;
  const campoTel = telefono.closest('.campo');
  const errorTel = campoTel.querySelector('.campo-error');
  const digitos = v => v.replace(/\D/g, '');
  function reiniciarDemo(plan) {
    tacto.cara(enviar, 0);
    enviar.disabled = false;
    gracias.hidden = true;
    form.elements.plan.value = plan || '';
  }
  function validarTel() {
    const ok = digitos(telefono.value).length >= 10;
    campoTel.toggleAttribute('data-error', !ok);
    errorTel.hidden = ok;
    telefono.setAttribute('aria-invalid', String(!ok));
    return ok;
  }
  telefono.addEventListener('blur', () => { if (telefono.value) validarTel(); });
  telefono.addEventListener('input', () => { if (campoTel.hasAttribute('data-error') && digitos(telefono.value).length >= 10) validarTel(); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const vacios = ['nombre', 'tienda', 'ciudad'].map(n => form.elements[n]).filter(i => !i.value.trim());
    const telOk = validarTel();
    if (vacios.length || !telOk) {
      const primero = vacios[0] || telefono;
      const campo = primero.closest('.campo');
      campo.removeAttribute('data-sacude');
      void campo.offsetWidth;
      campo.setAttribute('data-sacude', '');
      tacto.sentir('error');
      primero.focus();
      return;
    }
    enviar.disabled = true;
    tacto.cara(enviar, 1);
    const d = Object.fromEntries(new FormData(form));
    const texto = `Hola, quiero una demo de ProjectCode.\nNombre: ${d.nombre}\nTienda: ${d.tienda}\nCiudad y sedes: ${d.ciudad}\nWhatsApp: ${d.whatsapp}` + (d.plan ? `\nPlan que me interesa: ${d.plan}` : '');
    setTimeout(() => {
      tacto.cara(enviar, 2);
      tacto.sentir('exito');
      gracias.hidden = false;
      setTimeout(() => window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener'), 600);
    }, 600);
  });
})();
