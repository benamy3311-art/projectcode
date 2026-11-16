/* tacto.js — motor de respuesta sensorial de mi-gusto: sonido, háptica, muelles y pulsado.
   Sin dependencias ni archivos de audio. Reglas y porqués en TACTO.md.

   Uso mínimo:  <link rel="stylesheet" href="tacto.css">  <script src="tacto.js"></script>
   Declarativo: <button data-sentir="exito">, <input type="checkbox" switch data-sentir="cambio">,
                <input type="radio" data-sentir="seleccion">, <input type="range" data-sentir="seleccion">
   A mano:      tacto.sentir('encaje'), tacto.muelle({...}), tacto.goma(...), tacto.proyectar(...) */
(() => {
  'use strict';

  // ── Preferencias ──────────────────────────────────────────────────────────
  // El sonido nace apagado: una web que suena sin que se lo pidan molesta. La háptica nace encendida
  // porque no invade a nadie más que a quien toca. Las dos se pueden apagar siempre.
  const CLAVE = 'tacto';
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CLAVE)); } catch {}
  const prefs = { sonido: false, haptica: true, volumen: 1, ...(guardado || {}) };
  const ajustar = cambios => {
    Object.assign(prefs, cambios);
    try { localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch {}
    return prefs;
  };
  const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apagado = () => document.documentElement.dataset.tacto === 'no';

  // ── Vocabulario ───────────────────────────────────────────────────────────
  // Un mismo nombre dispara sonido y vibración: salen del mismo suceso y dicen lo mismo.
  // s = notas (Hz de → a, ms, volumen relativo, retraso). h = vibración en ms (vibra, pausa, vibra…).
  // Una sola familia de timbre (seno con caída rápida). Subir de tono = encender o lograr; bajar = apagar o fallar.
  const SENTIR = {
    toque:     { s: [{ de: 520, a: 380, ms: 45, vol: .5 }], h: [8] },
    seleccion: { s: [{ de: 1320, ms: 22, vol: .28 }], h: [5] },
    encender:  { s: [{ de: 659, a: 880, ms: 70, vol: .5 }], h: [10] },
    apagar:    { s: [{ de: 659, a: 494, ms: 70, vol: .45 }], h: [8] },
    encaje:    { s: [{ de: 300, a: 190, ms: 70, vol: .7 }], h: [14] },
    exito:     { s: [{ de: 659, ms: 110, vol: .5 }, { de: 988, ms: 220, vol: .5, tras: 90 }], h: [10, 70, 18] },
    aviso:     { s: [{ de: 554, ms: 90, vol: .45 }, { de: 554, ms: 140, vol: .4, tras: 130 }], h: [14, 90, 14] },
    error:     { s: [{ de: 311, a: 233, ms: 160, vol: .6, onda: 'triangle' }], h: [22, 60, 22] },
    limite:    { s: [{ de: 170, ms: 40, vol: .5 }], h: [6] },
  };

  // ── Sonido: sintetizado con Web Audio ─────────────────────────────────────
  let ctx, salida;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      salida = ctx.createGain();
      salida.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    salida.gain.value = 0.16 * prefs.volumen; // flojo a propósito: se oye sin girar la cabeza de nadie
    return ctx;
  }
  function nota(c, { de, a = de, ms, vol = 1, onda = 'sine', tras = 0 }) {
    const t = c.currentTime + tras / 1000, d = ms / 1000;
    const desvio = 1 + (Math.random() - .5) * .03; // ±1.5 % de tono: lo repetido no suena a máquina
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = onda;
    osc.frequency.setValueAtTime(de * desvio, t);
    if (a !== de) osc.frequency.exponentialRampToValueAtTime(a * desvio, t + d);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .004); // 4 ms de ataque: ni chasquido ni retraso
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    osc.connect(g).connect(salida);
    osc.start(t);
    osc.stop(t + d + .02);
  }

  // ── Háptica ───────────────────────────────────────────────────────────────
  const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const tieneSwitch = 'switch' in HTMLInputElement.prototype;
  // Chrome de escritorio también tiene navigator.vibrate, pero no hay nada que vibre: solo cuenta con pantalla táctil.
  const vibraDeVerdad = !!navigator.vibrate && navigator.maxTouchPoints > 0;
  const puedeVibrar = () => vibraDeVerdad || (esIOS && tieneSwitch);
  function vibrar(patron) {
    if (vibraDeVerdad) { navigator.vibrate(patron); return true; }
    if (!(esIOS && tieneSwitch)) return false;
    // Safari de iOS no tiene Vibration API. Un <input switch> emite el tic del sistema al cambiar, y pulsar
    // su etiqueta desde código lo dispara en iOS 17.4–26.4. Desde iOS 26.5 se informa de que solo responde
    // a toques reales; ahí esto no hace nada y quedan los interruptores nativos, que vibran por sí solos.
    const pulsos = Math.ceil(patron.length / 2);
    for (let i = 0; i < pulsos; i++) setTimeout(() => {
      const etiqueta = document.createElement('label');
      etiqueta.ariaHidden = 'true';
      etiqueta.style.display = 'none';
      const palanca = document.createElement('input');
      palanca.type = 'checkbox';
      palanca.setAttribute('switch', '');
      etiqueta.append(palanca);
      document.head.append(etiqueta);
      etiqueta.click();
      etiqueta.remove();
    }, i * 90);
    return true;
  }

  // ── sentir(): el único punto de entrada ───────────────────────────────────
  const ultimo = {};
  function sentir(tipo, { sonido = true, haptica = true } = {}) {
    const receta = SENTIR[tipo];
    if (!receta || apagado()) return;
    const ahora = performance.now();
    // Presupuesto: los tics de selección, como mucho 25 por segundo; lo demás, uno cada 80 ms.
    if (ahora - (ultimo[tipo] || 0) < (tipo === 'seleccion' ? 40 : 80)) return;
    ultimo[tipo] = ahora;
    let sono = false, vibro = false;
    if (sonido && prefs.sonido) { const c = audio(); if (c) { receta.s.forEach(n => nota(c, n)); sono = true; } }
    if (haptica && prefs.haptica) vibro = vibrar(receta.h);
    document.dispatchEvent(new CustomEvent('tacto:sentir', { detail: { tipo, receta, sono, vibro } }));
  }

  // ── Pulsado ───────────────────────────────────────────────────────────────
  // La respuesta empieza cuando el dedo toca, no cuando se levanta, y dura al menos 90 ms: un toque
  // rápido suelta antes de que el ojo vea nada si se deja solo a :active.
  const PULSABLE = 'button, [data-pulsable]';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest(PULSABLE);
    if (!el || el.disabled) return;
    const t0 = performance.now();
    el.dataset.pulsado = '';
    const soltar = () => {
      setTimeout(() => { delete el.dataset.pulsado; }, Math.max(0, 90 - (performance.now() - t0)));
      removeEventListener('pointerup', soltar, true);
      removeEventListener('pointercancel', soltar, true);
      el.removeEventListener('pointerleave', salir);
    };
    // Si el dedo se sale del botón, se suelta: así se puede cancelar arrastrando fuera. Con captura de
    // puntero (un arrastre) no hay salida que valga.
    const salir = ev => { if (!el.hasPointerCapture || !el.hasPointerCapture(ev.pointerId)) soltar(); };
    addEventListener('pointerup', soltar, true);
    addEventListener('pointercancel', soltar, true);
    el.addEventListener('pointerleave', salir);
  }, { passive: true });
  document.addEventListener('touchstart', () => {}, { passive: true }); // sin esto, iOS no aplica :active

  // ── Cableado declarativo ──────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-sentir]');
    if (el && !el.matches('input')) sentir(el.dataset.sentir);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (!el.matches || !el.matches('input[data-sentir]')) return;
    if (el.type === 'checkbox') {
      // Un switch nativo de Safari ya da su tic: no se duplica.
      const nativo = esIOS && tieneSwitch && el.hasAttribute('switch');
      sentir(el.dataset.sentir === 'cambio' ? (el.checked ? 'encender' : 'apagar') : el.dataset.sentir, { haptica: !nativo });
    } else if (el.type === 'radio') sentir(el.dataset.sentir);
  });
  const pintarRango = el => {
    const min = +el.min || 0, max = el.max === '' ? 100 : +el.max;
    el.style.setProperty('--v', ((el.value - min) / (max - min)) * 100 + '%');
  };
  document.addEventListener('input', e => {
    const el = e.target;
    if (!el.matches || !el.matches('input[type=range]')) return;
    pintarRango(el);
    if (el.dataset.sentir) sentir(el.value === el.min || el.value === el.max ? 'limite' : el.dataset.sentir);
  });
  // Segmentado: la píldora toma la posición y el ancho de la opción activa (cada texto mide distinto).
  function colocar(seg) {
    const activa = seg.querySelector('label:has(:checked)');
    if (!activa) return;
    if (!seg.dataset.medido) seg.dataset.medido = 'no';
    seg.style.setProperty('--x', activa.offsetLeft + 'px');
    seg.style.setProperty('--w', activa.offsetWidth + 'px');
    // La primera colocación no se anima; las siguientes sí.
    if (seg.dataset.medido === 'no') requestAnimationFrame(() => requestAnimationFrame(() => { seg.dataset.medido = 'ya'; }));
  }
  document.addEventListener('change', e => {
    const seg = e.target.closest && e.target.closest('.segmentado');
    if (seg) colocar(seg);
  });
  const iniciar = () => {
    document.querySelectorAll('input[type=range].deslizador').forEach(pintarRango);
    const alCambiarAncho = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(en => colocar(en.target))) : null;
    document.querySelectorAll('.segmentado').forEach(seg => { colocar(seg); alCambiarAncho && alCambiarAncho.observe(seg); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.querySelectorAll('.segmentado').forEach(colocar));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  // ── Muelle ────────────────────────────────────────────────────────────────
  // Parámetros de Apple: duracion percibida (s) y rebote (0 = sin sobrepaso, .15 vivo, .3 elástico, .4 tope).
  // A diferencia de una curva CSS, arranca con la velocidad que traía el gesto y la conserva si cambia el destino.
  function muelle({ desde = 0, hasta = 0, velocidad = 0, duracion = .35, rebote = 0, precision = .1, alPaso, alTerminar }) {
    let x = desde, v = velocidad, destino = hasta, cuadro = 0, previo = 0;
    const fin = () => { cancelAnimationFrame(cuadro); cuadro = 0; };
    if (reducido() || apagado()) { alPaso(hasta, 0); alTerminar && alTerminar(); return { detener() {}, irA() {}, get velocidad() { return 0; } }; }
    const w = 2 * Math.PI / duracion, k = w * w, c = 2 * (1 - rebote) * w;
    const paso = ahora => {
      const dt = Math.min(.032, (ahora - (previo || ahora - 16)) / 1000);
      previo = ahora;
      // Euler semi-implícito en subpasos de 4 ms: estable y de sobra para interfaz
      for (let n = Math.ceil(dt / .004), h = dt / n; n--;) { v += (-k * (x - destino) - c * v) * h; x += v * h; }
      if (Math.abs(x - destino) < precision && Math.abs(v) < precision * 20) {
        x = destino; v = 0; cuadro = 0;
        alPaso(x, 0);
        alTerminar && alTerminar();
        return;
      }
      alPaso(x, v);
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return { detener: fin, irA(nuevo) { destino = nuevo; if (!cuadro) { previo = 0; cuadro = requestAnimationFrame(paso); } }, get velocidad() { return v; } };
  }

  // Resistencia de goma al pasar un límite: sigue al dedo, pero cada vez cede menos. Nunca un muro.
  const goma = (exceso, dimension, dureza = .55) =>
    Math.sign(exceso) * (Math.abs(exceso) * dimension * dureza) / (dimension + dureza * Math.abs(exceso));

  // Dónde acabaría un lanzamiento con la fricción de un scroll (velocidad en px/s). Se elige el destino
  // más cercano a ese punto, no al punto donde se soltó.
  const proyectar = (velocidad, deceleracion = .998) => (velocidad / 1000) * deceleracion / (1 - deceleracion);

  // Velocidad del gesto a partir de su historia reciente (100 ms), no solo del último evento.
  function rastro() {
    let puntos = [];
    return {
      anotar(x, y) {
        const t = performance.now();
        puntos.push({ x, y, t });
        while (puntos.length > 2 && t - puntos[0].t > 100) puntos.shift();
      },
      velocidad() {
        if (puntos.length < 2) return { x: 0, y: 0 };
        const a = puntos[0], b = puntos[puntos.length - 1], dt = (b.t - a.t) / 1000;
        // Si el dedo llevaba quieto un rato antes de soltar, no hay lanzamiento.
        if (dt <= 0 || performance.now() - b.t > 80) return { x: 0, y: 0 };
        return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
      },
      limpiar() { puntos = []; },
    };
  }

  // ── Relevos ───────────────────────────────────────────────────────────────
  // Caras: cambia el texto de un control sin cambiar su ancho (ver .caras en tacto.css).
  function cara(el, indice) {
    const caras = el.matches('.caras') ? el : el.querySelector('.caras');
    [...caras.children].forEach((c, i) => c.toggleAttribute('data-activa', i === indice));
  }

  // Cifras: solo se mueven los dígitos que cambian, de izquierda a derecha con 40 ms entre ellos;
  // suben si el número sube y bajan si baja. enfasis: true para la cifra que hay que notar.
  function cifra(el, valor, { enfasis = false } = {}) {
    const nuevo = String(valor), viejo = el.dataset.valor !== undefined ? el.dataset.valor : el.textContent.trim();
    if (nuevo === viejo && el.querySelector('.cifra-hueco')) return;
    el.dataset.valor = nuevo;
    const numero = t => parseFloat(t.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
    const sube = numero(nuevo) >= numero(viejo), quieto = reducido() || apagado();
    const lector = document.createElement('span');
    lector.className = 'solo-lector';
    lector.textContent = nuevo;
    const trozos = [lector];
    let orden = 0;
    for (let i = 0; i < nuevo.length; i++) {
      const c = nuevo[i], v = viejo[viejo.length - nuevo.length + i]; // se comparan alineados por la derecha
      const hueco = document.createElement('span'), digito = document.createElement('span');
      hueco.className = 'cifra-hueco';
      hueco.setAttribute('aria-hidden', 'true');
      digito.className = 'cifra-digito';
      digito.textContent = c;
      hueco.append(digito);
      if (!quieto && c !== v) {
        hueco.style.setProperty('--i', orden++);
        hueco.style.setProperty('--dir', sube ? 1 : -1);
        digito.dataset.entra = enfasis ? 'fuerte' : '';
        if (v !== undefined) {
          const sale = document.createElement('span');
          sale.className = 'cifra-digito cifra-sale';
          sale.textContent = v;
          sale.addEventListener('animationend', () => sale.remove());
          hueco.append(sale);
        }
      }
      trozos.push(hueco);
    }
    el.replaceChildren(...trozos);
  }

  // ── Respuesta por cercanía (solo con cursor) ──────────────────────────────
  // La pieza responde a cuánto se acerca el cursor, no solo a si está encima. Una por pantalla.
  const conCursor = () => matchMedia('(hover: hover) and (pointer: fine)').matches && !reducido();

  // Imán: la pieza se desplaza una fracción de la distancia al cursor mientras este ande por su zona.
  function iman(el, { fuerza = .35, zona = el.parentElement } = {}) {
    let mx, my, x = 0, y = 0;
    const pintar = () => { el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`; };
    const ir = (tx, ty, rebote) => {
      mx && mx.detener(); my && my.detener();
      mx = muelle({ desde: x, hasta: tx, velocidad: mx ? mx.velocidad : 0, duracion: .4, rebote, precision: .05, alPaso: v => { x = v; pintar(); } });
      my = muelle({ desde: y, hasta: ty, velocidad: my ? my.velocidad : 0, duracion: .4, rebote, precision: .05, alPaso: v => { y = v; pintar(); } });
    };
    zona.addEventListener('pointermove', e => {
      if (!conCursor() || apagado()) return;
      const r = el.getBoundingClientRect();
      ir((e.clientX - (r.left - x + r.width / 2)) * fuerza, (e.clientY - (r.top - y + r.height / 2)) * fuerza, 0);
    });
    zona.addEventListener('pointerleave', () => ir(0, 0, .35)); // sigue sin rebote; al soltarla vuelve con él
  }

  // Inclinación: la pieza gira hacia el cursor y un brillo lo sigue. Vuelve despacio (1 s) al salir.
  function inclinar(el, { grados = 9 } = {}) {
    let brillo = el.querySelector('[data-brillo]');
    el.addEventListener('pointermove', e => {
      if (!conCursor() || apagado()) return;
      const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.transition = 'transform 400ms cubic-bezier(.22, 1, .36, 1)';
      el.style.transform = `perspective(1000px) rotateX(${((.5 - py) * 2 * grados).toFixed(2)}deg) rotateY(${((px - .5) * 2 * grados).toFixed(2)}deg)`;
      if (brillo) { brillo.style.opacity = 1; brillo.style.setProperty('--bx', (px * 100).toFixed(1) + '%'); brillo.style.setProperty('--by', (py * 100).toFixed(1) + '%'); }
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform 1000ms cubic-bezier(.22, 1, .36, 1)';
      el.style.transform = 'perspective(1000px)';
      if (brillo) brillo.style.opacity = 0;
    });
  }

  window.tacto = { sentir, muelle, goma, proyectar, rastro, cara, cifra, iman, inclinar, ajustar, prefs, puedeVibrar, SENTIR, primeraVez: !guardado };
})();
