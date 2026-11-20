// ============================================================
// UN DÍA EN LA TIENDA — simulador de un día de ventas (solo en la demo)
// ============================================================
// Se juega con la app de verdad: los clientes escriben por "WhatsApp"
// (Firestore de la demo, demo-sesion.js) y el jugador los atiende con Chats,
// la ficha, Cotizar, Vender y Pagos. El juego no toca la app por dentro:
//   - lee lo que el asesor manda (la app abre wa.me con el texto: aquí se
//     atrapa y se le entrega al cliente),
//   - escribe los mensajes de los clientes en wa_conversations,
//   - oye las ventas registradas (evento sl:venta) y los comprobantes,
//   - hace de jefe: aprueba o rechaza los pagos,
//   - cuando la app pide una imagen, abre "la galería del celular" con los
//     pantallazos que mandaron los clientes.
// Reloj: 9:00 a. m. a 6:00 p. m.; cada minuto del juego dura 1,6 s (x2 lo acelera).
// Se activa con ?juego en la URL o window.PC_JUEGO (exportar-demo.mjs --juego).
// ============================================================
(function () {
  'use strict';
  if (!window.PC_JUEGO) return;

  var MS_MIN = 1600;
  var INICIO = 9 * 60, FIN = 18 * 60;
  var DATOS_PAGO = 'Puedes pagar por Nequi o Daviplata al 300 123 4567 a nombre de Tienda Demo SAS, o por transferencia a Bancolombia ahorros 123-456789-00. Cuando pagues, mándame el pantallazo por aquí.';

  // ── Los clientes del día ─────────────────────────────────
  // medio: con qué paga. reto: lo que pone a prueba.
  var CLIENTES = [
    { id: '573104458812', nombre: 'Carlos Rincón', llega: INICIO + 1, paciencia: 60, tutorial: true,
      doc: '1023456789', correo: 'carlos.rincon@correo.co', direccion: 'Carrera 43A # 18-20, Medellín', medio: 'Nequi',
      abre: ['Buenas tardes', '¿Tienen la tarjeta de video RTX 4060 de 8 GB? ¿Qué precio tiene?'],
      trasCot: 'Me sirve. ¿Cuánto me sale el envío a Medellín?',
      acepta: 'Perfecto, me la llevo. ¿Qué datos necesitas?',
      sugerencia: { pregunta2: 'El envío a Medellín te sale aproximadamente entre $ 35.000 y $ 45.000 y llega en 2 a 3 días. ¿Te la separo?' },
      gracias: '¡Mil gracias! Quedo pendiente de la guía.' },
    { id: '573157720394', nombre: 'Laura Gómez', llega: INICIO + 75, paciencia: 60,
      doc: '1018765432', correo: 'laura.gomez@correo.co', direccion: 'Calle 45 # 13-22 apto 501, Bogotá', medio: 'Daviplata',
      abre: ['Hola! Busco un portátil para la universidad', 'Algo con Ryzen 5 de 16 GB, que no pase de 2,5 millones'],
      trasCot: 'Me gusta. ¿Me puedes hacer algún descuento si pago hoy?',
      acepta: 'Bueno, dale. Me lo llevo. ¿Qué te mando?',
      sugerencia: { pregunta2: 'Si pagas hoy te dejo el envío en Bogotá sin costo. ¿Te lo separo?' },
      gracias: 'Gracias!! Me encantó la atención.' },
    { id: '573001189045', nombre: 'Andrés Castillo', llega: INICIO + 145, paciencia: 55,
      doc: '80456123', correo: 'andres.castillo@correo.co', direccion: 'Calle 80 # 20-10, Bogotá', medio: 'Efectivo',
      abre: ['Buenas, necesito un mouse gamer y un teclado mecánico. ¿Qué precio?'],
      trasCot: '¿Hacen envío contraentrega en Bogotá?',
      acepta: 'Perfecto, me los llevo. Pago en efectivo cuando lleguen. ¿Qué datos necesitas?',
      sugerencia: { pregunta2: 'Sí, en Bogotá te lo enviamos contraentrega: pagas en efectivo cuando llegue.' },
      contraentrega: 'Listo, quedo atento. Pago cuando llegue. ¡Gracias!' },
    { id: '573159876543', nombre: 'Jorge Pardo', llega: INICIO + 205, paciencia: 45, tipo: 'pregunta',
      abre: ['Hola, ¿la RTX 4060 de 8 GB es compatible con mi fuente de 550 W?'],
      sugerencia: { pregunta: 'Sí, la RTX 4060 consume unos 115 W; con una fuente de 550 W 80+ Bronze quedas bien. ¿Te la cotizo?' },
      gracias: 'Gracias por la info. La compro la otra quincena.' },
    { id: '573203345566', nombre: 'Valentina Ruiz', llega: INICIO + 265, paciencia: 50, compraDirecta: true, reto: 'incompleto',
      doc: '1032456987', correo: 'vale.ruiz@correo.co', direccion: 'Avenida 6N # 25-40, Cali', medio: 'Transferencia',
      abre: ['Hola, quiero el monitor de 27 pulgadas QHD de 165 Hz', 'Me lo llevo ya, ¿qué necesitas?'],
      acepta: 'Perfecto, ¿qué datos te mando?',
      gracias: 'Gracias, y perdón por lo del primer pago.' },
    { id: '573117654321', nombre: 'Mariana Torres', llega: INICIO + 340, paciencia: 60,
      doc: '52987654', correo: 'mariana.torres@correo.co', direccion: 'Calle 10 # 4-56, Cali', medio: 'Nequi',
      abre: ['Hola, ¿me cotizas un SSD NVMe de 1 TB y una memoria DDR5 de 32 GB?'],
      trasCot: '¿Y cuánto sería el envío a Cali?',
      acepta: 'Listo, los quiero. ¿Qué datos necesitas?',
      sugerencia: { pregunta2: 'El envío a Cali te sale aproximadamente entre $ 18.000 y $ 24.000 y llega en 2 a 3 días.' },
      gracias: 'Súper, gracias!' },
    { id: '573016667788', nombre: 'Paula Medina', llega: INICIO + 420, paciencia: 25,
      doc: '1019234567', correo: 'paula.medina@correo.co', direccion: 'Carrera 15 # 93-60, Bogotá', medio: 'Transferencia',
      abre: ['Necesito el portátil gamer con RTX 4060 y 32 GB HOY', '¿Lo tienen? Respóndeme rápido porfa'],
      acepta: 'Listo, lo quiero. ¿Qué datos necesitas?',
      gracias: 'Gracias por la rapidez!' }
  ];

  // Dentro de una página publicada los diálogos del navegador no aparecen
  // (confirm devuelve false): en el juego se responde que sí.
  window.confirm = function () { return true; };

  var J = { min: INICIO, acumulado: 0, corriendo: false, pausa: false, velocidad: 1, puntos: 0, vendido: 0, ventas: 0,
    felices: 0, perdidos: 0, atendidos: 0, respuestas: [], guia: true, terminado: false, tareas: [], galeria: [], ultimoRecibo: null, vistos: {} };
  try { J.guia = localStorage.getItem('pc_juego_guia') !== '0'; } catch (e) {}

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pesos(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function primer(n) { return String(n || '').split(' ')[0]; }
  function hora(min) { var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'p. m.' : 'a. m.'; var h12 = h % 12 || 12; return h12 + ':' + String(m).padStart(2, '0') + ' ' + ap; }
  function porId(id) { return CLIENTES.filter(function (c) { return c.id === String(id); })[0] || null; }
  function despues(min, fn) { J.tareas.push({ en: J.min + Math.max(0, min), fn: fn }); }
  function sentir(t) { if (window.tacto && tacto.sentir) try { tacto.sentir(t); } catch (e) {} }

  // ── Mensajes del cliente → Firestore de la demo ──────────
  function escribir(c, texto, o) {
    o = o || {};
    var retraso = o.retraso != null ? o.retraso : 2 + Math.floor(Math.random() * 3);
    c.escribiendo = (c.escribiendo || 0) + 1;
    despues(retraso, function () {
      c.escribiendo--;
      if (J.terminado) return;
      var db = firebase.firestore(), T = window.PC_DEMO.TS, ahora = Date.now();
      var mid = 'm' + ahora + Math.random().toString(36).slice(2, 6);
      var conv = db.collection('wa_conversations').doc(c.id);
      conv.collection('mensajes').doc(mid).set({ texto: texto || '', at: T(ahora), tipo: o.imagen ? 'image' : 'text', de: c.id });
      var doc = { nombre: c.nombre, ultimoTexto: o.imagen ? '[imagen] ' + (texto || 'Comprobante de pago') : texto, ultimoAt: T(ahora), noLeidos: firebase.firestore.FieldValue.increment(1), ventanaHasta: T(ahora + 86400000) };
      if (!c.creado) { c.creado = true; doc.creadoAt = T(ahora); }
      conv.set(doc, { merge: true });
      if (o.espera) esperar(c);
      sentir('cambio');
      pintarHud();
    });
  }

  function esperar(c) { if (c.esperaDesde == null) { c.esperaDesde = J.min; c.insistioEspera = false; } }
  function respondido(c) {
    if (c.esperaDesde == null) return;
    var t = J.min - c.esperaDesde;
    J.respuestas.push(t);
    var p = t <= 5 ? 40 : t <= 15 ? 20 : 5;
    sumar(p, t <= 5 ? 'Respuesta rápida' : null);
    c.esperaDesde = null;
  }
  function sumar(p, por) {
    J.puntos += p;
    if (por && p) aviso('+' + p + ' · ' + por, 'menta');
    pintarHud();
  }
  function fin(c, resultado) {
    c.resultado = resultado;
    c.esperaDesde = null;
    if (resultado === 'feliz') { J.felices++; sumar(150, 'Cliente feliz: ' + primer(c.nombre)); }
    else if (resultado === 'atendido') { J.atendidos++; sumar(80, 'Pregunta resuelta'); }
    else if (resultado === 'perdido') { J.perdidos++; J.puntos -= 150; aviso(primer(c.nombre) + ' se fue con otra tienda · -150', 'rosa'); }
    pintarHud();
    revisarFin();
  }

  // ── Lo que manda el asesor (wa.me) ───────────────────────
  var abrirReal = window.open;
  window.open = function (url) {
    var m = /^https:\/\/wa\.me\/(\d+)(?:\?text=([\s\S]*))?$/.exec(String(url || ''));
    if (m && J.corriendo) {
      var texto = '';
      try { texto = m[2] ? decodeURIComponent(m[2]) : ''; } catch (e) { texto = m[2] || ''; }
      setTimeout(function () { alSalir(m[1], texto); }, 60);
      return { closed: false, focus: function () {}, close: function () {} };
    }
    return abrirReal.apply(window, arguments);
  };

  function clasificar(id, texto) {
    var k = norm(texto);
    var env = window.FichaCliente && FichaCliente.enviados ? FichaCliente.enviados(id) : [];
    var ult = env[env.length - 1];
    if ((ult && ult.imagen && Date.now() - ult.at < 6000) || /cotizacion #|tu cotizacion/.test(k)) return 'cotizacion';
    if (/recibimos tu pago/.test(k)) return 'pagoRecibido';
    if (/nequi|daviplata|bancolombia|ahorros|a nombre de|consigna/.test(k)) return 'datosPago';
    if (/nombre completo|cedula|tus datos|correo para la factura|datos para/.test(k)) return 'pedirDatos';
    return 'texto';
  }

  function alSalir(id, texto) {
    var c = porId(id);
    if (!c || c.resultado || !c.etapa) return;
    var tipo = clasificar(id, texto);
    respondido(c);
    aviso('Enviado a ' + primer(c.nombre) + ' por WhatsApp', 'cielo');
    reaccionar(c, tipo);
  }

  // ── El cerebro de cada cliente ───────────────────────────
  function reaccionar(c, tipo) {
    switch (c.etapa) {
      case 'pregunta':
        if (c.tipo === 'pregunta') { escribir(c, c.gracias); fin(c, 'atendido'); return; }
        if (tipo === 'cotizacion') {
          sumar(100, 'Cotización enviada');
          if (c.trasCot) { c.etapa = 'pregunta2'; escribir(c, c.trasCot, { espera: true }); }
          else { c.etapa = 'quiere'; escribir(c, c.acepta, { espera: true }); }
          return;
        }
        if (tipo === 'pedirDatos' && c.compraDirecta) { c.etapa = 'datos'; sumar(60, 'Fuiste directo al cierre'); escribir(c, datosDe(c), { espera: true }); return; }
        if (!c.insistio) { c.insistio = true; escribir(c, '¿Y el precio? Pásame la cotización porfa', { espera: true }); }
        else esperar(c);
        return;
      case 'pregunta2':
        c.etapa = 'quiere';
        escribir(c, c.acepta, { espera: true });
        return;
      case 'quiere':
        if (tipo === 'pedirDatos') { c.etapa = 'datos'; sumar(50, 'Datos pedidos'); escribir(c, datosDe(c), { espera: true }); return; }
        if (!c.preguntoDatos) { c.preguntoDatos = true; escribir(c, '¿Qué datos necesitas para la factura?', { espera: true }); }
        else esperar(c);
        return;
      case 'datos':
        if (tipo === 'datosPago') { c.recibioDatosPago = true; escribir(c, 'Listo. Me avisas cuando quede registrada la compra y pago.', { espera: true }); return; }
        esperar(c);
        return;
      case 'pidePago':
        if (tipo === 'datosPago') { c.recibioDatosPago = true; pagar(c, false); return; }
        if (!c.insistioPago) { c.insistioPago = true; escribir(c, '¿Me pasas a dónde te pago?', { espera: true }); }
        else esperar(c);
        return;
      case 'rechazado':
        pagar(c, true);
        return;
      case 'aprobado':
        if (tipo === 'pagoRecibido') { escribir(c, c.gracias); fin(c, 'feliz'); }
        return;
      case 'pagando':
        // Vio que el pago no alcanza y le escribió antes de guardarlo: punto para el asesor
        var ult = J.galeria.filter(function (g) { return g.c === c; })[0];
        if (c.venta && ult && ult.monto < c.venta.total && !c.corrigio) { c.corrigio = true; sumar(100, 'Detectaste el pago incompleto'); pagar(c, true); }
        return;
      default:
        return; // revisión: el cliente ya hizo su parte
    }
  }

  function datosDe(c) {
    var d = c.doc.length > 8 ? c.doc.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : c.doc;
    return 'Perfecto. Aquí van mis datos:\n' + c.nombre + '\nCC ' + d + '\n' + c.direccion + '\n' + c.correo;
  }

  // ── Comprobantes: la imagen que manda el cliente ─────────
  var COLOR = { Nequi: '#5B2A86', Daviplata: '#B4232C', Transferencia: '#1F4E8C' };
  function recibo(banco, monto, ref) {
    var cv = document.createElement('canvas'); cv.width = 600; cv.height = 1000;
    var x = cv.getContext('2d');
    x.fillStyle = '#F4F4F7'; x.fillRect(0, 0, 600, 1000);
    x.fillStyle = COLOR[banco] || '#1F4E8C'; x.fillRect(0, 0, 600, 260);
    x.fillStyle = '#fff'; x.font = '600 30px sans-serif'; x.fillText(banco === 'Transferencia' ? 'Transferencia' : banco, 40, 80);
    x.font = '700 44px sans-serif'; x.fillText('Transferencia exitosa', 40, 200);
    x.fillStyle = '#fff';
    x.beginPath(); if (x.roundRect) x.roundRect(30, 300, 540, 560, 28); else x.rect(30, 300, 540, 560); x.fill();
    var fila = function (y, k, v, grande) { x.fillStyle = '#6B6E79'; x.font = '400 24px sans-serif'; x.fillText(k, 70, y); x.fillStyle = '#141519'; x.font = (grande ? '700 48px' : '600 30px') + ' sans-serif'; x.fillText(v, 70, y + (grande ? 58 : 44)); };
    fila(370, '¿Cuánto?', '$ ' + monto.toLocaleString('es-CO'), true);
    fila(500, 'Para', 'Tienda Demo SAS');
    fila(600, 'Fecha', new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }));
    fila(700, 'Referencia', ref);
    return cv.toDataURL('image/jpeg', 0.85);
  }

  function pagar(c, corregido) {
    if (corregido) c.corrigio = true;
    var total = c.venta ? c.venta.total : 0;
    var monto = c.reto === 'incompleto' && !corregido ? total - 100000 : total;
    var ref = (c.medio === 'Nequi' ? 'M' : c.medio === 'Daviplata' ? 'D-' : '') + String(Math.floor(10000000 + Math.random() * 89999999));
    J.galeria.unshift({ c: c, img: recibo(c.medio === 'Efectivo' ? 'Transferencia' : c.medio, monto, ref), monto: monto, ref: ref, banco: c.medio, at: Date.now() });
    c.etapa = 'pagando';
    escribir(c, corregido ? 'Perdón, me faltó plata. Ya te mandé el completo' : 'Listo, ya pagué. Te mando el comprobante');
    escribir(c, 'Comprobante de pago', { imagen: true, espera: true, retraso: 4 });
  }

  // ── La venta registrada en Vender ────────────────────────
  document.addEventListener('sl:venta', function (e) {
    var v = (e.detail || {}).venta;
    if (!v || !J.corriendo) return;
    var doc = String((v.cliente || {}).documento || '').replace(/\D/g, '');
    var c = CLIENTES.filter(function (x) { return x.doc && x.doc === doc && !x.resultado; })[0];
    if (!c || c.venta) return;
    c.venta = { numero: v.numero, total: v.total };
    J.vendido += v.total; J.ventas++;
    sumar(Math.round(v.total / 10000), 'Venta ' + v.numero);
    c.esperaDesde = null;
    if (c.medio === 'Efectivo') { escribir(c, c.contraentrega); fin(c, 'feliz'); return; }
    c.etapa = 'pidePago';
    if (c.recibioDatosPago) pagar(c, false);
    else escribir(c, 'Listo. ¿A dónde te pago?', { espera: true });
  });

  // ── El jefe revisa los comprobantes ──────────────────────
  function escucharPagos() {
    firebase.firestore().collection('comprobantes').onSnapshot(function (snap) {
      snap.forEach(function (d) {
        var x = d.data() || {};
        if (J.vistos[d.id] || x.estado !== 'pendiente') return;
        var c = CLIENTES.filter(function (k) { return k.venta && k.venta.numero === x.ventaNumero && !k.resultado; })[0];
        if (!c) return;
        J.vistos[d.id] = true;
        var rec = J.ultimoRecibo;
        c.etapa = 'revision';
        c.esperaDesde = null;
        sumar(50, 'Comprobante enviado a revisión');
        despues(8 + Math.floor(Math.random() * 6), function () {
          var bien = rec && rec.c === c && rec.monto >= c.venta.total;
          var nota = !rec || rec.c !== c ? 'El comprobante es de otro cliente' : rec.monto < c.venta.total ? 'El valor no coincide con la venta' : 'Llegó completo';
          firebase.firestore().collection('comprobantes').doc(d.id).update({ estado: bien ? 'aprobado' : 'rechazado', nota: nota, revisadoPor: 'jefa@tutienda.co', revisadoAt: window.PC_DEMO.TS(Date.now()) });
          if (bien) { c.etapa = 'aprobado'; sumar(100, 'Pago aprobado: ' + primer(c.nombre)); esperar(c); }
          else { c.etapa = 'rechazado'; aviso('El jefe rechazó el pago de ' + primer(c.nombre) + ': ' + nota.toLowerCase(), 'rosa'); esperar(c); }
        });
      });
    });
  }

  // ── "La galería del celular" cuando la app pide una imagen ──
  var clickReal = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file' && J.corriendo) { abrirGaleria(this); return; }
    return clickReal.apply(this, arguments);
  };
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'file' && J.corriendo) { e.preventDefault(); abrirGaleria(t); }
  }, true);

  function abrirGaleria(input) {
    var pausaAntes = J.pausa;
    J.pausa = true; // el reloj espera mientras eliges la foto
    var o = document.createElement('div');
    o.className = 'jg-capa';
    o.innerHTML = '<div class="jg-modal jg-galeria" role="dialog" aria-modal="true" aria-labelledby="jgGalT"><header><div><p class="jg-eti">Tu celular</p><h2 id="jgGalT">Fotos que te mandaron por WhatsApp</h2></div><button type="button" class="jg-x" data-jg="cerrar" aria-label="Cerrar">Cerrar</button></header>'
      + (J.galeria.length ? '<div class="jg-fotos">' + J.galeria.map(function (g, i) {
          return '<button type="button" class="jg-foto" data-jg-foto="' + i + '"><img src="' + g.img + '" alt="Comprobante de ' + esc(g.c.nombre) + '"><span><b>' + esc(g.c.nombre) + '</b><small>' + esc(g.banco) + ' · hace ' + Math.max(1, Math.round((Date.now() - g.at) / MS_MIN)) + ' min</small></span></button>';
        }).join('') + '</div>' : '<p class="jg-vacio">Todavía no te han mandado fotos. Cuando un cliente pague, su pantallazo aparece aquí.</p>')
      + '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) {
      if (e.target === o || e.target.closest('[data-jg="cerrar"]')) { o.remove(); J.pausa = pausaAntes; pintarHud(); return; }
      var b = e.target.closest('[data-jg-foto]');
      if (!b) return;
      var g = J.galeria[Number(b.getAttribute('data-jg-foto'))];
      o.remove();
      J.pausa = pausaAntes; pintarHud();
      J.ultimoRecibo = g;
      fetch(g.img).then(function (r) { return r.blob(); }).then(function (blob) {
        var f = new File([blob], 'comprobante-' + primer(g.c.nombre).toLowerCase() + '.jpg', { type: 'image/jpeg' });
        var dt = new DataTransfer(); dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  // La "IA" de la demo lee el comprobante elegido y sugiere respuestas
  window.PC_JUEGO_IA = {
    leer: function () {
      var g = J.ultimoRecibo;
      if (!g) return { es_comprobante: false };
      return { es_comprobante: true, monto: g.monto, referencia: g.ref, banco: g.banco === 'Transferencia' ? 'Bancolombia' : g.banco, fecha: new Date().toISOString().slice(0, 10), destinatario: 'Tienda Demo SAS' };
    },
    sugerir: function (texto) {
      var c = CLIENTES.filter(function (k) { return texto.indexOf(k.nombre) >= 0 || texto.indexOf(primer(k.nombre)) >= 0; })[0];
      var s = c && c.sugerencia && c.sugerencia[c.etapa];
      if (s) return 'Hola ' + primer(c.nombre) + ', ' + s.charAt(0).toLowerCase() + s.slice(1);
      return c ? 'Hola ' + primer(c.nombre) + ', claro que sí. Ya te paso la cotización con precio y disponibilidad.' : 'Claro que sí, ya te ayudo.';
    }
  };

  // ── Reloj ────────────────────────────────────────────────
  function minuto() {
    J.min++;
    // Llegadas
    CLIENTES.forEach(function (c) {
      if (!c.etapa && !c.resultado && J.min >= c.llega) {
        c.etapa = 'pregunta';
        c.abre.forEach(function (t, i) { escribir(c, t, { retraso: i * 1, espera: i === c.abre.length - 1 }); });
        aviso('Nuevo cliente: ' + c.nombre + ' te escribió por WhatsApp', 'lavanda');
      }
    });
    // Tareas que vencen
    var ahora = J.tareas.filter(function (t) { return t.en <= J.min; });
    J.tareas = J.tareas.filter(function (t) { return t.en > J.min; });
    ahora.forEach(function (t) { try { t.fn(); } catch (e) { console.error(e); } });
    // Paciencia
    CLIENTES.forEach(function (c) {
      if (c.resultado || c.esperaDesde == null || c.escribiendo) return;
      var t = J.min - c.esperaDesde;
      var yaPago = ['pagando', 'aprobado', 'rechazado', 'revision'].indexOf(c.etapa) >= 0;
      if (!c.insistioEspera && t >= Math.round(c.paciencia * 0.6)) {
        c.insistioEspera = true;
        escribir(c, yaPago ? '¿Te llegó el comprobante?' : c.etapa === 'datos' ? '¿Ya quedó mi compra?' : '¿Hola? ¿Sigues ahí?', { retraso: 0 });
      } else if (t >= c.paciencia && !yaPago) {
        escribir(c, 'Bueno, ya lo conseguí en otro lado. Gracias.', { retraso: 0 });
        fin(c, 'perdido');
      } else if (t >= c.paciencia * 2 && c.etapa === 'aprobado') {
        c.esperaDesde = null; c.resultado = 'vendido'; revisarFin();
      }
    });
    if (J.min >= FIN) terminar();
    pintarHud();
  }

  setInterval(function () {
    if (!J.corriendo || J.pausa || J.terminado) return;
    J.acumulado += 250 * J.velocidad;
    while (J.acumulado >= MS_MIN) { J.acumulado -= MS_MIN; minuto(); }
  }, 250);

  function revisarFin() {
    var todos = CLIENTES.every(function (c) { return c.resultado; });
    if (todos && !J.terminado) { aviso('Atendiste a todos los clientes del día', 'menta'); setTimeout(terminar, 2500); }
  }

  // ── Qué hacer ahora (modo guía) ──────────────────────────
  function pista() {
    var activos = CLIENTES.filter(function (c) { return c.etapa && !c.resultado; });
    if (!activos.length) return J.min < INICIO + 2 ? 'El primer cliente está por escribir. Abre Chats.' : 'Todo al día. Espera al próximo cliente.';
    var c = activos.filter(function (x) { return x.esperaDesde != null; }).sort(function (a, b) { return a.esperaDesde - b.esperaDesde; })[0] || activos[0];
    var n = primer(c.nombre);
    var P = {
      pregunta: c.tipo === 'pregunta' ? 'Responde la pregunta de ' + n + ': escribe en el cuadro del chat y dale Enviar (o usa "Sugerir respuesta").'
        : c.compraDirecta ? n + ' ya quiere comprar: toca "Pedir datos" abajo del chat y luego Enviar.'
        : 'Abre el chat de ' + n + '. En su ficha, "Pidió en el chat" ya tiene el producto: toca "Cotizar y enviar la imagen".',
      pregunta2: 'Responde lo que pregunta ' + n + ': escríbele en el cuadro del chat o toca "Sugerir respuesta".',
      quiere: n + ' quiere comprar: toca "Pedir datos" abajo del chat y luego Enviar.',
      datos: 'Llegaron los datos de ' + n + ': en su ficha toca "Crear la venta" y después "Registrar venta".',
      pidePago: 'Mándale a ' + n + ' cómo pagar: toca "Datos para pagar" y luego Enviar.',
      pagando: n + ' te mandó el comprobante: en su ficha toca "Adjuntar comprobante", elige su foto y guárdalo en Pagos.',
      revision: 'El jefe está revisando el pago de ' + n + '. Mientras, atiende a otro cliente.',
      rechazado: 'El jefe rechazó el pago de ' + n + ': escríbele que le faltó plata para que mande el comprobante completo.',
      aprobado: 'Pago de ' + n + ' aprobado: en su ficha toca "Avisar que recibimos el pago".'
    };
    return P[c.etapa] || 'Atiende a ' + n + '.';
  }

  // ── Tablero ──────────────────────────────────────────────
  var ETAPA = { pregunta: 'Pregunta', pregunta2: 'Pregunta', quiere: 'Quiere comprar', datos: 'Datos listos', pidePago: 'Por pagar', pagando: 'Pagó', revision: 'En revisión', rechazado: 'Pago rechazado', aprobado: 'Pago aprobado' };
  function pintarHud() {
    var h = $('jgHud');
    if (!h) return;
    var activos = CLIENTES.filter(function (c) { return c.etapa && !c.resultado; });
    var progreso = Math.min(100, Math.round(100 * (J.min - INICIO) / (FIN - INICIO)));
    h.querySelector('[data-jg-hora]').textContent = hora(J.min);
    h.querySelector('[data-jg-dia]').style.width = progreso + '%';
    h.querySelector('[data-jg-vendido]').textContent = pesos(J.vendido);
    h.querySelector('[data-jg-puntos]').textContent = J.puntos.toLocaleString('es-CO');
    h.querySelector('[data-jg-clientes]').innerHTML = activos.length ? activos.map(function (c) {
      var resto = c.esperaDesde == null ? 1 : Math.max(0, 1 - (J.min - c.esperaDesde) / c.paciencia);
      var tono = c.esperaDesde == null ? 'jg-ok' : resto > 0.5 ? 'jg-ok' : resto > 0.25 ? 'jg-medio' : 'jg-mal';
      return '<button type="button" class="jg-cli" data-jg-cli="' + c.id + '" title="Abrir el chat de ' + esc(c.nombre) + '"><span class="jg-cli-n"><b>' + esc(primer(c.nombre)) + '</b><small>' + (c.escribiendo ? 'escribiendo…' : esc(ETAPA[c.etapa] || '')) + '</small></span>'
        + '<i class="jg-pac ' + tono + '"><i style="width:' + Math.round(resto * 100) + '%"></i></i></button>';
    }).join('') : '<p class="jg-nadie">Nadie esperando</p>';
    var p = h.querySelector('[data-jg-pista]');
    p.hidden = !J.guia;
    p.textContent = pista();
    h.querySelector('[data-jg-acc="pausa"]').textContent = J.pausa ? 'Seguir' : 'Pausa';
    h.querySelector('[data-jg-acc="vel"]').textContent = J.velocidad === 1 ? 'x1' : 'x2';
    h.querySelector('[data-jg-acc="guia"]').setAttribute('aria-pressed', String(J.guia));
  }

  function montarHud() {
    var h = document.createElement('aside');
    h.id = 'jgHud';
    h.className = 'jg-hud';
    h.setAttribute('aria-label', 'Tablero del juego');
    h.innerHTML = '<div class="jg-fila"><div class="jg-reloj"><small>Jornada</small><b data-jg-hora>9:00 a. m.</b></div>'
      + '<div class="jg-cifra"><small>Vendido</small><b data-jg-vendido>$ 0</b></div><div class="jg-cifra"><small>Puntos</small><b data-jg-puntos>0</b></div></div>'
      + '<i class="jg-barra"><i data-jg-dia></i></i>'
      + '<div class="jg-clientes" data-jg-clientes></div>'
      + '<p class="jg-pista" data-jg-pista></p>'
      + '<div class="jg-botones"><button type="button" data-jg-acc="pausa">Pausa</button><button type="button" data-jg-acc="vel" title="Velocidad del reloj">x1</button><button type="button" data-jg-acc="guia" aria-pressed="true">Guía</button><button type="button" data-jg-acc="cerrar-dia">Cerrar el día</button></div>';
    document.body.appendChild(h);
    h.addEventListener('click', function (e) {
      var cli = e.target.closest('[data-jg-cli]');
      if (cli) { if (window.WaInbox) { switchTab('wa'); setTimeout(function () { WaInbox.abrir(cli.getAttribute('data-jg-cli')); }, 120); } return; }
      var a = e.target.closest('[data-jg-acc]');
      if (!a) return;
      var acc = a.getAttribute('data-jg-acc');
      if (acc === 'pausa') J.pausa = !J.pausa;
      else if (acc === 'vel') J.velocidad = J.velocidad === 1 ? 2 : 1;
      else if (acc === 'guia') { J.guia = !J.guia; try { localStorage.setItem('pc_juego_guia', J.guia ? '1' : '0'); } catch (x) {} }
      else if (acc === 'cerrar-dia') terminar();
      pintarHud();
    });
    pintarHud();
  }

  function aviso(texto, tono) {
    var cont = $('jgAvisos');
    if (!cont) { cont = document.createElement('div'); cont.id = 'jgAvisos'; cont.className = 'jg-avisos'; cont.setAttribute('aria-live', 'polite'); document.body.appendChild(cont); }
    var a = document.createElement('div');
    a.className = 'jg-aviso jg-' + (tono || 'cielo');
    a.textContent = texto;
    cont.appendChild(a);
    setTimeout(function () { a.classList.add('jg-sale'); setTimeout(function () { a.remove(); }, 400); }, 3600);
  }

  // ── Inicio y cierre ──────────────────────────────────────
  function intro() {
    var o = document.createElement('div');
    o.className = 'jg-capa';
    o.innerHTML = '<div class="jg-modal jg-intro" role="dialog" aria-modal="true" aria-labelledby="jgIntroT">'
      + '<p class="jg-eti">ProjectCode · Suite de ventas</p><h1 id="jgIntroT">Un día en la tienda</h1>'
      + '<p class="jg-sub">Eres asesor de una tienda de tecnología. De 9:00 a. m. a 6:00 p. m. te escriben clientes por WhatsApp y los atiendes con el software, como en un día real.</p>'
      + '<ol class="jg-reglas"><li><b>Responde rápido.</b> Cada cliente tiene paciencia: si espera demasiado, se va con otra tienda.</li>'
      + '<li><b>Cotiza, pide datos y vende.</b> La ficha del cliente te dice el siguiente paso.</li>'
      + '<li><b>Cobra.</b> Cuando paguen, adjunta su comprobante: el jefe lo revisa y tú avisas que llegó.</li>'
      + '<li><b>Ojo con los pagos.</b> No todos los comprobantes están bien.</li></ol>'
      + '<label class="jg-campo"><span>Tu nombre</span><input id="jgNombre" maxlength="20" value="Ana" autocomplete="off"></label>'
      + '<label class="jg-check"><input type="checkbox" id="jgGuia"' + (J.guia ? ' checked' : '') + '> Mostrarme qué hacer en cada paso</label>'
      + '<button type="button" class="jg-empezar" data-jg="empezar">Empezar el día</button>'
      + '<p class="jg-nota">Cada minuto del juego dura 1,6 segundos. Puedes pausar o acelerar cuando quieras.</p></div>';
    document.body.appendChild(o);
    var inp = $('jgNombre'); if (inp) { inp.focus(); inp.select(); }
    o.addEventListener('keydown', function (e) { if (e.key === 'Enter') o.querySelector('[data-jg="empezar"]').click(); });
    o.querySelector('[data-jg="empezar"]').addEventListener('click', function () {
      var nombre = (String(($('jgNombre') || {}).value || '').trim() || 'Ana').slice(0, 20);
      J.guia = !!($('jgGuia') || {}).checked;
      try { localStorage.setItem('pc_juego_guia', J.guia ? '1' : '0'); } catch (e) {}
      o.remove();
      empezar(nombre);
    });
  }

  function prepararTienda() {
    // Existencias para vender y los datos para pagar de la empresa
    if (window.Empresa) {
      var cfg = Empresa.actual();
      cfg.mensajes = { pedirDatos: cfg.mensajes.pedirDatos, datosPago: DATOS_PAGO };
      Empresa.usar(cfg);
    }
    if (window.TiendaApp && TiendaApp.listo) {
      TiendaApp.listo.then(function (db) {
        var movs = TiendaApp.productos().filter(function (p) { return !p.noInventariable; }).map(function (p) { return { sku: p.sku, delta: 4, motivo: 'entrada', nota: 'Inventario del día' }; });
        if (movs.length) return db.registrarMovimientos(movs, { usuario: 'Bodega' });
      }).catch(function (e) { console.warn('[juego] inventario', e); });
    }
    // El aviso de la app sobre copiar o descargar la imagen no aplica en el juego
    if (typeof window.showToast === 'function') {
      var real = window.showToast;
      window.showToast = function (m) { if (/Ctrl\+V|pégala|arrástrala|descargó/i.test(String(m))) return; return real.apply(this, arguments); };
    }
    try { if (navigator.clipboard) navigator.clipboard.write = function () { return Promise.resolve(); }; } catch (e) {}
  }

  function empezar(nombre) {
    var u = window.PC_DEMO && window.PC_DEMO.usuario;
    if (u) u.displayName = nombre;
    try { localStorage.setItem('sl_asesor', nombre.toUpperCase()); } catch (e) {}
    var a = $('asesor'); if (a) { a.value = nombre.toUpperCase(); a.dispatchEvent(new Event('input', { bubbles: true })); }
    prepararTienda();
    escucharPagos();
    montarHud();
    if (typeof switchTab === 'function') switchTab('wa');
    J.corriendo = true;
    aviso('Abriste la tienda. ¡Buena suerte, ' + nombre + '!', 'menta');
  }

  function terminar() {
    if (J.terminado) return;
    J.terminado = true; J.corriendo = false;
    CLIENTES.forEach(function (c) { if (c.etapa && !c.resultado) c.resultado = c.venta ? 'vendido' : 'sin cerrar'; });
    var prom = J.respuestas.length ? Math.round(J.respuestas.reduce(function (s, x) { return s + x; }, 0) / J.respuestas.length) : 0;
    var estrellas = J.puntos >= 2200 ? 3 : J.puntos >= 1200 ? 2 : 1;
    var titulo = ['', 'Mañana será mejor', 'Buen día de ventas', 'Asesor estrella'][estrellas];
    var o = document.createElement('div');
    o.className = 'jg-capa';
    o.innerHTML = '<div class="jg-modal jg-fin" role="dialog" aria-modal="true" aria-labelledby="jgFinT">'
      + '<p class="jg-eti">Cierre del día · ' + hora(Math.min(J.min, FIN)) + '</p><h1 id="jgFinT">' + titulo + '</h1>'
      + '<div class="jg-estrellas" aria-label="' + estrellas + ' de 3 estrellas">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= estrellas ? 'on' : '') + '"></i>'; }).join('') + '</div>'
      + '<div class="jg-arte"><small>Vendiste</small><b>' + pesos(J.vendido) + '</b><span>' + J.ventas + (J.ventas === 1 ? ' venta' : ' ventas') + ' · ' + J.puntos.toLocaleString('es-CO') + ' puntos</span></div>'
      + '<div class="jg-stats">'
        + '<div><b>' + J.felices + '</b><span>clientes felices</span></div>'
        + '<div><b>' + J.atendidos + '</b><span>preguntas resueltas</span></div>'
        + '<div><b>' + J.perdidos + '</b><span>se fueron</span></div>'
        + '<div><b>' + prom + ' min</b><span>en responder, en promedio</span></div>'
      + '</div>'
      + '<ul class="jg-resumen">' + CLIENTES.map(function (c) {
          var r = { feliz: ['Feliz', 'menta'], atendido: ['Pregunta resuelta', 'cielo'], perdido: ['Se fue', 'rosa'], vendido: ['Vendido, sin cerrar el pago', 'durazno'], 'sin cerrar': ['Sin cerrar', 'durazno'] }[c.resultado] || ['No alcanzó a escribir', ''];
          return '<li><span>' + esc(c.nombre) + (c.venta ? '<small>' + esc(c.venta.numero) + ' · ' + pesos(c.venta.total) + '</small>' : '') + '</span><i class="jg-pill jg-' + r[1] + '">' + r[0] + '</i></li>';
        }).join('') + '</ul>'
      + '<div class="jg-acciones"><button type="button" class="jg-empezar" data-jg="otra">Jugar otro día</button><button type="button" class="jg-sec" data-jg="explorar">Seguir explorando la app</button></div></div>';
    document.body.appendChild(o);
    o.querySelector('[data-jg="otra"]').addEventListener('click', function () { location.reload(); });
    o.querySelector('[data-jg="explorar"]').addEventListener('click', function () { o.remove(); var h = $('jgHud'); if (h) h.remove(); });
    sentir('exito');
  }

  // ── Estilos (el mismo lenguaje de la app: blanco, pasteles, una pieza oscura) ──
  var css = document.createElement('style');
  css.textContent = [
    '.jg-capa{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(20,21,25,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}',
    '.jg-modal{width:min(560px,100%);max-height:calc(100vh - 48px);overflow:auto;background:#fff;color:#141519;border-radius:28px;padding:28px;display:grid;gap:14px;box-shadow:0 30px 80px rgba(20,21,25,.25);font-family:var(--font,system-ui,sans-serif)}',
    '.jg-eti{margin:0;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#6B6E79}',
    '.jg-modal h1{margin:0;font-size:34px;line-height:1.08;letter-spacing:-.03em}',
    '.jg-modal h2{margin:0;font-size:20px;letter-spacing:-.02em}',
    '.jg-sub{margin:0;color:#50535E;font-size:15px;line-height:1.5}',
    '.jg-reglas{margin:0;padding:0 0 0 20px;display:grid;gap:8px;color:#50535E;font-size:14px;line-height:1.45}',
    '.jg-reglas b{color:#141519}',
    '.jg-campo{display:grid;gap:6px;font-size:12px;font-weight:600;color:#50535E}',
    '.jg-campo input{height:44px;padding:0 16px;border:0;border-radius:999px;background:#F2F3F6;font:500 15px var(--font,system-ui);color:#141519}',
    '.jg-campo input:focus{outline:none;box-shadow:0 0 0 2px #141519}',
    '.jg-check{display:flex;gap:10px;align-items:center;font-size:14px;color:#50535E;cursor:pointer}',
    '.jg-check input{all:revert;width:18px;height:18px;margin:0;flex:none;accent-color:#141519}',
    '.jg-empezar{height:50px;border:0;border-radius:999px;background:#141519;color:#fff;font:600 16px var(--font,system-ui);cursor:pointer;transition:transform .12s}',
    '.jg-empezar:active{transform:scale(.98)}',
    '.jg-sec{height:50px;border:0;border-radius:999px;background:#F2F3F6;color:#141519;font:600 15px var(--font,system-ui);cursor:pointer}',
    '.jg-nota{margin:0;font-size:12px;color:#6B6E79;text-align:center}',
    '.jg-hud{position:fixed;z-index:9000;left:16px;bottom:16px;width:min(330px,calc(100vw - 32px));padding:16px;border-radius:24px;color:#fff;display:grid;gap:10px;font-family:var(--font,system-ui,sans-serif);box-shadow:0 18px 50px rgba(20,21,25,.3);',
    'background:radial-gradient(120% 90% at 100% 0%,rgba(143,110,255,.5),transparent 55%),radial-gradient(90% 80% at 0% 110%,rgba(232,100,31,.38),transparent 60%),#17151F}',
    '.jg-fila{display:grid;grid-template-columns:1.3fr 1fr .8fr;gap:8px;align-items:end}',
    '.jg-reloj small,.jg-cifra small{display:block;font-size:10.5px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.06em}',
    '.jg-reloj b{font-size:22px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
    '.jg-cifra b{font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.jg-barra{display:block;height:4px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}',
    '.jg-barra i{display:block;height:100%;background:#fff;border-radius:99px;transition:width .5s}',
    '.jg-clientes{display:grid;gap:6px}',
    '.jg-cli{display:grid;grid-template-columns:1fr 90px;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:14px;background:rgba(255,255,255,.08);color:#fff;text-align:left;cursor:pointer;font:inherit}',
    '.jg-cli:hover{background:rgba(255,255,255,.14)}',
    '.jg-cli-n{display:grid;min-width:0}',
    '.jg-cli-n b{font-size:13px}',
    '.jg-cli-n small{font-size:11px;color:rgba(255,255,255,.7)}',
    '.jg-pac{display:block;height:6px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden}',
    '.jg-pac i{display:block;height:100%;border-radius:99px;transition:width .5s,background .5s}',
    '.jg-ok i{background:#9DE3BF}.jg-medio i{background:#F7C68E}.jg-mal i{background:#F39BBB}',
    '.jg-nadie{margin:0;font-size:12.5px;color:rgba(255,255,255,.7)}',
    '.jg-pista{margin:0;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.1);font-size:12.5px;line-height:1.45}',
    '.jg-botones{display:flex;gap:6px;flex-wrap:wrap}',
    '.jg-botones button{height:30px;padding:0 12px;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:600 12px var(--font,system-ui);cursor:pointer}',
    '.jg-botones button:hover{background:rgba(255,255,255,.2)}',
    '.jg-botones [aria-pressed="true"]{background:#fff;color:#141519}',
    '.jg-avisos{position:fixed;z-index:100001;top:70px;left:50%;transform:translateX(-50%);display:grid;gap:6px;justify-items:center;pointer-events:none}',
    '.jg-aviso{padding:9px 16px;border-radius:999px;font:600 13px var(--font,system-ui);box-shadow:0 8px 24px rgba(20,21,25,.15);animation:jgEntra .25s ease-out}',
    '.jg-sale{opacity:0;transform:translateY(-6px);transition:opacity .35s,transform .35s}',
    '@keyframes jgEntra{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}',
    '.jg-pill{font-style:normal;height:24px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;font-size:12px;font-weight:600;white-space:nowrap;background:#F2F3F6;color:#50535E}',
    '.jg-menta{background:#CFEEDD;color:#1F5A3C}.jg-rosa{background:#F9D7E4;color:#6F2A47}.jg-cielo{background:#DCE5FF;color:#1B3A86}.jg-lavanda{background:#E4DEFC;color:#3F3470}.jg-durazno{background:#FCE3CC;color:#6E4516}',
    '.jg-galeria header{display:flex;justify-content:space-between;align-items:start;gap:12px}',
    '.jg-x{height:34px;padding:0 14px;border:0;border-radius:999px;background:#F2F3F6;font:600 13px var(--font,system-ui);cursor:pointer}',
    '.jg-fotos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
    '.jg-foto{display:grid;gap:6px;padding:8px;border:0;border-radius:16px;background:#F2F3F6;cursor:pointer;text-align:left;font:inherit}',
    '.jg-foto:hover{box-shadow:0 0 0 2px #141519}',
    '.jg-foto img{width:100%;aspect-ratio:3/5;object-fit:cover;border-radius:10px}',
    '.jg-foto b{font-size:12.5px;display:block}.jg-foto small{font-size:11px;color:#6B6E79}',
    '.jg-vacio{margin:0;color:#6B6E79;font-size:14px}',
    '.jg-estrellas{display:flex;gap:8px}',
    '.jg-estrellas i{width:34px;height:34px;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);background:#E7E8EE}',
    '.jg-estrellas i.on{background:#F2B04C}',
    '.jg-arte{border-radius:20px;padding:18px 20px;color:#fff;display:grid;gap:2px;background:radial-gradient(120% 90% at 100% 0%,rgba(143,110,255,.5),transparent 55%),radial-gradient(90% 80% at 0% 110%,rgba(232,100,31,.38),transparent 60%),#17151F}',
    '.jg-arte small{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.7)}',
    '.jg-arte b{font-size:32px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}',
    '.jg-arte span{font-size:13px;color:rgba(255,255,255,.8)}',
    '.jg-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.jg-stats div{background:#F2F3F6;border-radius:14px;padding:10px 12px;display:grid}',
    '.jg-stats b{font-size:20px;font-variant-numeric:tabular-nums}.jg-stats span{font-size:11.5px;color:#6B6E79}',
    '.jg-resumen{list-style:none;margin:0;padding:0;display:grid}',
    '.jg-resumen li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(20,21,25,.07);font-size:14px}',
    '.jg-resumen li span{display:grid}.jg-resumen small{font-size:12px;color:#6B6E79}',
    '.jg-acciones{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '@media (max-width:640px){.jg-fotos{grid-template-columns:repeat(2,minmax(0,1fr))}.jg-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.jg-acciones{grid-template-columns:1fr}}',
    '@media (prefers-reduced-motion:reduce){.jg-aviso{animation:none}.jg-barra i,.jg-pac i{transition:none}}'
  ].join('\n');
  document.head.appendChild(css);

  // Para probar el juego sin esperar el reloj: ?juego&prueba
  if (/[?&]prueba\b/.test(location.search)) window.__JUEGO = { J: J, clientes: CLIENTES, minuto: minuto, terminar: terminar };

  if (document.readyState === 'complete') setTimeout(intro, 600);
  else window.addEventListener('load', function () { setTimeout(intro, 600); });
})();
