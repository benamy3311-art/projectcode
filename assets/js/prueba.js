/* La app para probar. Catálogo, clientes y cifras de ejemplo; todo pasa en el navegador.
   Lo que se hace en una vista se nota en las demás: lo que propone el asesor IA entra a la
   cotización, la cotización guardada aparece en Seguimiento y, cuando se vende, en la Caja. */
(() => {
  'use strict';
  const ventana = document.getElementById('ventana');
  if (!ventana) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const pesos = n => dinero.format(Math.round(n)).replace(/\s/g, '\u00A0');
  const corto = n => n >= 1e6 ? '$\u00A0' + (n / 1e6).toFixed(1).replace('.', ',') + '\u00A0M' : '$\u00A0' + Math.round(n / 1000) + '\u00A0mil';
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const iniciales = n => n.replace(/[^\p{L} ]/gu, '').split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const sentir = t => window.tacto && tacto.sentir(t);
  const cifra = (el, v) => { if (window.tacto) tacto.cifra(el, v); else el.textContent = v; };
  const fijar = (el, v) => { el.textContent = v; el.dataset.valor = v; };
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // ── Catálogo de ejemplo (precios en COP, IVA incluido; ex = excluido de IVA) ──
  // [id, sku, nombre, categoría, precio, garantía en meses, ex, palabras extra]
  const CAT = [
    ['p1', '7801', 'Portátil 14" Core i3 8 GB 256 GB SSD', 'Portátiles', 1699000, 12, true, 'laptop oficina estudio'],
    ['p2', '7804', 'Portátil 15,6" Ryzen 5 16 GB 512 GB SSD', 'Portátiles', 2349000, 12, true, 'laptop universidad'],
    ['p3', '7810', 'Portátil 14" Core i5 16 GB 512 GB SSD FHD', 'Portátiles', 2890000, 12, false, 'laptop empresa'],
    ['p4', '7822', 'Portátil 15,6" Core i7 16 GB 1 TB RTX 4050', 'Portátiles', 4990000, 12, false, 'laptop gamer diseño'],
    ['p5', '7830', 'Portátil gamer 16" Ryzen 7 32 GB 1 TB RTX 4060', 'Portátiles', 6590000, 12, false, 'laptop gamer'],
    ['cpu5600g', '2105', 'Procesador Ryzen 5 5600G con gráficos', 'Procesadores', 589000, 36, false, 'cpu amd am4'],
    ['cpu7600', '2116', 'Procesador Ryzen 5 7600', 'Procesadores', 849000, 36, false, 'cpu amd am5'],
    ['cpu14400f', '2140', 'Procesador Core i5-14400F', 'Procesadores', 899000, 36, false, 'cpu intel'],
    ['cpu7700x', '2121', 'Procesador Ryzen 7 7700X', 'Procesadores', 1390000, 36, false, 'cpu amd am5'],
    ['cpu7800x3d', '2124', 'Procesador Ryzen 7 7800X3D', 'Procesadores', 1990000, 36, false, 'cpu amd am5 gamer'],
    ['mbA520', '3302', 'Board A520M micro ATX (AM4)', 'Boards', 349000, 24, false, 'motherboard tarjeta madre'],
    ['mbB650', '3318', 'Board B650M micro ATX (AM5) WiFi', 'Boards', 699000, 24, false, 'motherboard tarjeta madre'],
    ['mbB760', '3325', 'Board B760M micro ATX (LGA1700)', 'Boards', 649000, 24, false, 'motherboard tarjeta madre intel'],
    ['mbX670', '3340', 'Board X670E ATX (AM5)', 'Boards', 1290000, 24, false, 'motherboard tarjeta madre'],
    ['ram16d4', '4410', 'Memoria DDR4 16 GB (2x8) 3200 MHz', 'Memoria', 219000, 12, false, 'ram'],
    ['ram16', '4421', 'Memoria DDR5 16 GB 5600 MHz', 'Memoria', 289000, 12, false, 'ram'],
    ['ram32', '4432', 'Memoria DDR5 32 GB (2x16) 6000 MHz', 'Memoria', 549000, 12, false, 'ram'],
    ['ram64', '4464', 'Memoria DDR5 64 GB (2x32) 6000 MHz', 'Memoria', 1090000, 12, false, 'ram'],
    ['ssd500', '5105', 'SSD NVMe 500 GB', 'Almacenamiento', 189000, 36, false, 'disco solido m2'],
    ['ssd1', '5110', 'SSD NVMe 1 TB', 'Almacenamiento', 259000, 36, false, 'disco solido m2'],
    ['ssd2', '5120', 'SSD NVMe 2 TB Gen4', 'Almacenamiento', 529000, 36, false, 'disco solido m2'],
    ['g3050', '6150', 'Tarjeta de video RTX 3050 6 GB', 'Video', 899000, 24, false, 'gpu grafica nvidia'],
    ['g4060', '6160', 'Tarjeta de video RTX 4060 8 GB', 'Video', 1490000, 24, false, 'gpu grafica nvidia'],
    ['g4060ti', '6166', 'Tarjeta de video RTX 4060 Ti 16 GB', 'Video', 2190000, 24, false, 'gpu grafica nvidia'],
    ['g7700xt', '6177', 'Tarjeta de video RX 7700 XT 12 GB', 'Video', 2349000, 24, false, 'gpu grafica amd radeon'],
    ['g4070s', '6170', 'Tarjeta de video RTX 4070 Super 12 GB', 'Video', 3290000, 24, false, 'gpu grafica nvidia'],
    ['g4080s', '6180', 'Tarjeta de video RTX 4080 Super 16 GB', 'Video', 5390000, 24, false, 'gpu grafica nvidia'],
    ['psu550', '7055', 'Fuente 550 W 80+ Bronze', 'Fuentes y cajas', 249000, 36, false, 'poder psu'],
    ['psu750', '7075', 'Fuente 750 W 80+ Gold', 'Fuentes y cajas', 449000, 36, false, 'poder psu'],
    ['psu850', '7085', 'Fuente 850 W 80+ Gold', 'Fuentes y cajas', 589000, 36, false, 'poder psu'],
    ['caseM', '7210', 'Caja micro ATX con 2 ventiladores', 'Fuentes y cajas', 189000, 6, false, 'chasis gabinete torre'],
    ['caseA', '7230', 'Caja ATX vidrio templado, 4 ventiladores', 'Fuentes y cajas', 329000, 6, false, 'chasis gabinete torre'],
    ['airC', '7310', 'Disipador por aire 120 mm', 'Fuentes y cajas', 129000, 12, false, 'refrigeracion cooler'],
    ['liqC', '7340', 'Refrigeración líquida 240 mm', 'Fuentes y cajas', 389000, 12, false, 'refrigeracion cooler'],
    ['mon22', '5501', 'Monitor 22" IPS FHD 75 Hz', 'Monitores', 419000, 36, false, 'pantalla'],
    ['mon24', '5512', 'Monitor 24" IPS FHD 100 Hz', 'Monitores', 589000, 36, false, 'pantalla'],
    ['mon27', '5527', 'Monitor 27" IPS QHD 165 Hz', 'Monitores', 1249000, 36, false, 'pantalla gamer 1440'],
    ['combo', '6630', 'Combo teclado y mouse inalámbrico', 'Periféricos', 139000, 6, false, 'teclado mouse'],
    ['mouseW', '6640', 'Mouse inalámbrico', 'Periféricos', 59000, 6, false, 'raton'],
    ['mouseG', '6645', 'Mouse gamer 16.000 DPI', 'Periféricos', 119000, 6, false, 'raton'],
    ['tecladoM', '6655', 'Teclado mecánico 75 %', 'Periféricos', 289000, 6, false, 'teclado gamer'],
    ['diadema', '6670', 'Diadema gamer 7.1', 'Periféricos', 199000, 6, false, 'audifonos auriculares'],
    ['webcam', '6681', 'Webcam FHD 1080p', 'Periféricos', 169000, 6, false, 'camara'],
    ['base', '6902', 'Base refrigerante para portátil', 'Periféricos', 89000, 3, false, 'accesorio'],
    ['morral', '6910', 'Morral para portátil 15,6"', 'Periféricos', 129000, 3, false, 'maleta bolso accesorio'],
  ].map(([id, sku, nombre, cat, precio, gar, ex, extra]) => {
    const pajar = norm(`${nombre} ${cat} ${sku} ${extra}`);
    return { id, sku, nombre, cat, precio, gar, ex, pajar, compacto: pajar.replace(/[\s"',.()-]/g, '') };
  });
  const P = Object.fromEntries(CAT.map(p => [p.id, p]));
  const CATEGORIAS = ['Todo', 'Portátiles', 'Procesadores', 'Video', 'Memoria', 'Almacenamiento', 'Boards', 'Fuentes y cajas', 'Monitores', 'Periféricos'];
  const garantia = m => m >= 12 && m % 12 === 0 ? `${m / 12 === 1 ? '12 meses' : m / 12 + ' años'}` : `${m} meses`;
  const textoGarantia = p => 'Garantía ' + garantia(p.gar);

  const sumar = items => items.reduce((s, it) => s + P[it.id].precio * it.cant, 0);
  const desglose = items => {
    let base = 0, iva = 0;
    items.forEach(it => {
      const p = P[it.id], t = p.precio * it.cant;
      if (p.ex) base += t; else { const b = t / 1.19; base += b; iva += t - b; }
    });
    return { base: Math.round(base), iva: Math.round(iva), total: Math.round(base + iva) };
  };
  const resumir = items => {
    const n = items.reduce((s, it) => s + it.cant, 0);
    const primero = P[items[0].id].nombre.replace(/^(Portátil|Tarjeta de video|Procesador|Memoria|Monitor)\s/, m => m);
    return items.length === 1 ? (items[0].cant > 1 ? `${items[0].cant} × ${primero}` : primero) : `${n} productos · ${primero.split(' ').slice(0, 3).join(' ')}…`;
  };

  // ── Fecha y vistas ──
  const HOY = new Date();
  $('#app-fecha').textContent = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(HOY);

  const pestanas = $$('.riel-app [role=tab]');
  const vistas = pestanas.map(t => document.getElementById(t.getAttribute('aria-controls')));
  let vistaActual = 0;
  function irA(n, { teclado = false, enfocar = false } = {}) {
    if (typeof n === 'string') n = pestanas.findIndex(t => t.dataset.v === n);
    n = (n + pestanas.length) % pestanas.length;
    ventana.toggleAttribute('data-teclado', teclado);
    pestanas.forEach((t, i) => { t.setAttribute('aria-selected', String(i === n)); t.tabIndex = i === n ? 0 : -1; });
    vistas.forEach((v, i) => v.toggleAttribute('data-activa', i === n));
    if (n !== vistaActual && !teclado) sentir('seleccion');
    vistaActual = n;
    if (enfocar) pestanas[n].focus();
    pintarCuenta();
  }
  pestanas.forEach((t, i) => t.addEventListener('click', e => irA(i, { teclado: e.detail === 0 })));
  $('.riel-app').addEventListener('keydown', e => {
    const mapa = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in mapa) { e.preventDefault(); irA(vistaActual + mapa[e.key], { teclado: true, enfocar: true }); }
    if (e.key === 'Home') { e.preventDefault(); irA(0, { teclado: true, enfocar: true }); }
    if (e.key === 'End') { e.preventDefault(); irA(pestanas.length - 1, { teclado: true, enfocar: true }); }
  });

  // ── Aviso ──
  const aviso = $('#aviso');
  let relojAviso;
  function avisar(texto) {
    (document.querySelector('dialog[open]') || document.body).append(aviso);
    aviso.textContent = texto;
    aviso.removeAttribute('data-abierto');
    void aviso.offsetWidth;
    aviso.dataset.abierto = '';
    clearTimeout(relojAviso);
    relojAviso = setTimeout(() => aviso.removeAttribute('data-abierto'), 2600);
  }

  // ════════════════════════════════════════════════════════════════════
  // COTIZAR
  // ════════════════════════════════════════════════════════════════════
  const cot = { items: [], numero: 1193, inicio: 0, fin: 0 };
  const buscar = $('#cat-buscar');
  const listaCat = $('#cat-lista');
  let filtro = 'Todo';
  $('#cat-sub').textContent = `${CAT.length} referencias de ejemplo · lista de hoy`;

  const filtros = $('#cat-filtros');
  filtros.innerHTML = CATEGORIAS.map(c => `<button type="button" aria-pressed="${c === filtro}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
  filtros.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filtro = b.dataset.c;
    $$('button', filtros).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    sentir('seleccion');
    pintarCatalogo();
  });

  function pintarCatalogo() {
    const fichas = norm(buscar.value).split(/\s+/).filter(Boolean);
    const hallados = CAT.filter(p => (filtro === 'Todo' || p.cat === filtro) && fichas.every(f => p.pajar.includes(f) || p.compacto.includes(f.replace(/[\s"',.()-]/g, ''))));
    if (!hallados.length) {
      listaCat.innerHTML = `<li class="lista-vacia">No hay «${esc(buscar.value)}» en esta lista.<br>Prueba con <b>ssd</b>, <b>4060</b> o <b>portátil</b>.</li>`;
      return;
    }
    const en = new Set(cot.items.map(i => i.id));
    listaCat.innerHTML = hallados.map(p => `
      <li class="cat-fila"${en.has(p.id) ? ' data-en' : ''}>
        <span class="cat-nombre"><b>${esc(p.nombre)}</b><small><span class="sku">${p.sku}</span>${esc(p.cat)}${p.ex ? ' · excl. IVA' : ''}</small></span>
        <span class="cat-precio">${pesos(p.precio)}</span>
        <button class="icono-redondo" type="button" data-agregar="${p.id}" aria-label="Agregar ${esc(p.nombre)}">
          ${en.has(p.id)
            ? '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'}
        </button>
      </li>`).join('');
  }
  buscar.addEventListener('input', pintarCatalogo);
  buscar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const b = $('[data-agregar]', listaCat); if (b) b.click(); }
  });
  listaCat.addEventListener('click', e => {
    const b = e.target.closest('[data-agregar]'); if (!b) return;
    agregar([{ id: b.dataset.agregar, cant: 1 }]);
    sentir('encaje');
  });

  function agregar(items, { reemplazar = false } = {}) {
    if (reemplazar) cot.items = [];
    const nuevos = [];
    items.forEach(({ id, cant }) => {
      const ya = cot.items.find(i => i.id === id);
      if (ya) ya.cant += cant; else { cot.items.push({ id, cant }); nuevos.push(id); }
    });
    if (!cot.inicio && cot.items.length) { cot.inicio = Date.now(); cot.fin = 0; correrReloj(); }
    pintarCotizacion(nuevos);
    pintarCatalogo();
  }

  const listaCot = $('#cot-items');
  function pintarCotizacion(nuevos = []) {
    const vacia = !cot.items.length;
    if (vacia) {
      listaCot.innerHTML = `<li class="cot-vacio">Toca <b>+</b> en el catálogo o pídele un equipo al asesor IA.<br>El reloj empieza con el primer producto.</li>`;
    } else {
      listaCot.innerHTML = cot.items.map(it => {
        const p = P[it.id];
        return `<li class="cot-item"${nuevos.includes(it.id) ? ' data-nuevo' : ''}>
          <span class="cot-item-nombre"><b>${esc(p.nombre)}</b><small>${p.sku} · <span class="garantia">${textoGarantia(p)}</span>${p.ex ? ' · excl. IVA' : ''}</small></span>
          <span class="cot-item-precio">${pesos(p.precio * it.cant)}</span>
          <span class="cot-item-cant">
            <span class="paso-cant" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
              <button type="button" data-menos="${it.id}" aria-label="Quitar uno">${it.cant === 1 ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '−'}</button>
              <output>${it.cant}</output>
              <button type="button" data-mas="${it.id}" aria-label="Agregar uno">+</button>
            </span>
            <small class="tenue">${pesos(p.precio)} c/u</small>
          </span>
        </li>`;
      }).join('');
    }
    const d = desglose(cot.items);
    cifra($('#cot-base'), pesos(d.base));
    cifra($('#cot-iva'), pesos(d.iva));
    cifra($('#cot-total'), pesos(d.total));
    const n = cot.items.reduce((s, i) => s + i.cant, 0);
    $('#cot-sub').textContent = vacia ? 'Agrega productos del catálogo' : `${n} ${n === 1 ? 'producto' : 'productos'} · IVA incluido`;
    $('#cot-ver').disabled = vacia;
    $('#cot-vaciar').disabled = vacia;
    $('#cot-num').textContent = 'A-' + cot.numero;
    pintarCuenta();
  }
  listaCot.addEventListener('click', e => {
    const mas = e.target.closest('[data-mas]'), menos = e.target.closest('[data-menos]');
    if (mas) { cot.items.find(i => i.id === mas.dataset.mas).cant++; sentir('seleccion'); }
    else if (menos) {
      const it = cot.items.find(i => i.id === menos.dataset.menos);
      if (--it.cant <= 0) { cot.items = cot.items.filter(i => i !== it); sentir('apagar'); } else sentir('seleccion');
    } else return;
    if (!cot.items.length) reiniciarReloj();
    pintarCotizacion();
    pintarCatalogo();
  });
  $('#cot-vaciar').addEventListener('click', () => {
    cot.items = []; reiniciarReloj(); pintarCotizacion(); pintarCatalogo(); sentir('apagar');
  });

  function pintarCuenta() {
    const c = $('#riel-cuenta'), n = cot.items.reduce((s, i) => s + i.cant, 0);
    c.hidden = !n || vistaActual === 0;
    c.textContent = n;
  }

  // El reloj: cuánto tardó en armarse la cotización
  const reloj = $('#cot-reloj'), relojT = $('#cot-reloj-t');
  let tic;
  const mmss = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function correrReloj() {
    clearInterval(tic);
    reloj.dataset.corre = ''; delete reloj.dataset.listo;
    const pintar = () => { relojT.textContent = mmss(Date.now() - cot.inicio); };
    pintar(); tic = setInterval(pintar, 1000);
  }
  function pararReloj() {
    if (!cot.inicio || cot.fin) return;
    cot.fin = Date.now();
    clearInterval(tic);
    relojT.textContent = mmss(cot.fin - cot.inicio);
    delete reloj.dataset.corre; reloj.dataset.listo = '';
  }
  function reiniciarReloj() {
    clearInterval(tic); cot.inicio = 0; cot.fin = 0; relojT.textContent = '0:00';
    delete reloj.dataset.corre; delete reloj.dataset.listo;
  }

  // ════════════════════════════════════════════════════════════════════
  // DOCUMENTOS: cotización, orden de compra y recibo
  // ════════════════════════════════════════════════════════════════════
  const TIPOS = {
    cotizacion: { nombre: 'Cotización', letra: 'A-', ayuda: 'Precios de hoy, con IVA y la garantía de cada producto.' },
    orden: { nombre: 'Orden de compra', letra: 'OC-', ayuda: 'El cliente aprueba y separa con un abono. Queda el saldo y la fecha de entrega.' },
    recibo: { nombre: 'Recibo de compra', letra: 'R-', ayuda: 'Constancia del pago con la garantía de cada producto, lista para firmar.' },
  };
  const consecutivos = { orden: 457, recibo: 871 };
  const doc = { items: [], tipo: 'cotizacion', origen: null, numero: '' };
  const hojaDoc = $('#doc');
  const formDoc = $('#doc-form');
  const campo = id => $('#' + id);
  const digitos = v => String(v).replace(/\D/g, '');
  const fechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  function abrirDocumento({ items, tipo = 'cotizacion', cliente = '', origen = null, pago = null, numero = null }) {
    doc.items = items.map(i => ({ ...i }));
    doc.origen = origen;
    doc.numeroFijo = numero;
    campo('doc-cliente').value = cliente;
    if (pago) campo('doc-pago').value = pago;
    formDoc.querySelector(`input[name=tipo][value=${tipo}]`).checked = true;
    formDoc.querySelector('input[name=formato][value=imagen]').checked = true;
    tacto.cara($('#doc-guardar'), 0);
    $('#doc-guardar').disabled = false;
    pintarDocumento();
    if (!hojaDoc.open) hojaDoc.showModal();
    // la píldora del segmentado se mide cuando la hoja ya está a la vista
    requestAnimationFrame(() => $$('.segmentado', hojaDoc).forEach(s => s.querySelector(':checked')?.dispatchEvent(new Event('change', { bubbles: true }))));
  }

  function numeroDe(tipo) {
    if (tipo === 'cotizacion') return doc.numeroFijo || 'A-' + cot.numero;
    return TIPOS[tipo].letra + String(consecutivos[tipo]).padStart(4, '0');
  }

  function leerDoc() {
    const tipo = formDoc.querySelector('input[name=tipo]:checked').value;
    const d = desglose(doc.items);
    const abono = Math.min(+digitos(campo('doc-abono').value) || 0, d.total);
    return {
      tipo, d, abono,
      numero: numeroDe(tipo),
      cliente: campo('doc-cliente').value.trim(),
      id: campo('doc-id').value.trim(),
      tel: campo('doc-tel').value.trim(),
      pago: campo('doc-pago').value,
      entrega: campo('doc-entrega').value.trim(),
    };
  }

  function papelHTML(x) {
    const t = TIPOS[x.tipo];
    const filas = doc.items.map(it => {
      const p = P[it.id];
      return `<tr>
        <td class="cant">${it.cant}</td>
        <td class="col-sku">${p.sku}</td>
        <td><span class="desc">${esc(p.nombre)}</span><span class="gar">${textoGarantia(p)}</span>${p.ex ? '<span class="ex">EXCL. IVA</span>' : ''}</td>
        <td class="num col-unit">${pesos(p.precio)}</td>
        <td class="num"><b>${pesos(p.precio * it.cant)}</b></td>
      </tr>`;
    }).join('');
    const condiciones = {
      cotizacion: ['Validez: 1 día. Precios sujetos a disponibilidad.', 'Garantía con el fabricante según cada producto.', 'Pagos: efectivo, tarjeta, transferencia o Nequi.'],
      orden: [`Entrega: ${x.entrega ? esc(x.entrega) : 'a convenir con el cliente'}.`, 'Con el abono se separa el producto por 3 días hábiles.', 'El saldo se paga al recibir. La garantía empieza con la entrega.'],
      recibo: ['La garantía se hace válida con este recibo o la factura.', 'Cubre defectos de fábrica; no cubre golpes, humedad ni sobrecargas eléctricas.', 'Revisa tu producto antes de salir de la tienda.'],
    }[x.tipo];
    const sumas = `
      <div><span>Base</span><b>${pesos(x.d.base)}</b></div>
      <div><span>IVA 19 %</span><b>${pesos(x.d.iva)}</b></div>
      <div class="papel-total"><span>Total</span><b>${pesos(x.d.total)}</b></div>
      ${x.tipo === 'orden' ? `<div class="pagado"><span>Abono · ${esc(x.pago)}</span><b>${pesos(x.abono)}</b></div><div class="saldo"><span>Saldo</span><b>${pesos(x.d.total - x.abono)}</b></div>` : ''}
      ${x.tipo === 'recibo' ? `<div class="pagado"><span>Pagado · ${esc(x.pago)}</span><b>${pesos(x.d.total)}</b></div>` : ''}`;
    const cliente = x.cliente ? esc(x.cliente) : 'Cliente de mostrador';
    const detalle = [x.id && (x.id.replace(/\D/g, '').length > 9 ? 'NIT ' : 'C.C. ') + esc(x.id), x.tel && 'Tel. ' + esc(x.tel)].filter(Boolean).join(' · ');
    return `<article class="hoja-papel">
      <div class="papel-banda"></div>
      <header class="papel-cabeza">
        <div class="papel-tienda"><svg width="30" height="32" aria-hidden="true"><use href="#pc"/></svg><span><b>Tu Tienda</b><small>NIT 900.000.000-0 · WhatsApp 300 000 0000</small><small>Sede Norte · Bogotá</small></span></div>
        <div class="papel-numero"><small>${t.nombre}</small><b>${x.numero}</b><span>${fechaLarga.format(HOY)}</span></div>
      </header>
      <div class="papel-partes">
        <div><small>Cliente</small><b>${cliente}</b>${detalle ? `<span>${detalle}</span>` : ''}</div>
        <div><small>Asesor</small><b>Ana N.</b><span>Sede Norte</span></div>
      </div>
      <table class="papel-tabla">
        <thead><tr><th>Cant</th><th class="col-sku">SKU</th><th>Descripción</th><th class="num col-unit">V. unitario</th><th class="num">Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="papel-pie">
        <div class="papel-cond"><h5>Condiciones</h5><ul>${condiciones.map(c => `<li>${c}</li>`).join('')}</ul>${x.tipo === 'cotizacion' ? '<p class="alerta">No incluye envío</p>' : ''}</div>
        <div class="papel-sumas">${sumas}</div>
      </div>
      ${x.tipo !== 'cotizacion' ? '<div class="papel-firmas"><span>Firma del cliente</span><span>Recibe: Tu Tienda</span></div>' : ''}
      <p class="papel-final">Gracias por tu compra · Tu Tienda</p>
    </article>`;
  }

  function textoWhatsApp(x) {
    const t = TIPOS[x.tipo];
    const lineas = doc.items.map(it => { const p = P[it.id]; return `• ${it.cant} × ${p.nombre}: ${pesos(p.precio * it.cant)} (${textoGarantia(p).toLowerCase()})`; });
    const saludo = x.cliente ? `Hola, ${x.cliente.split(' ')[0]}. ` : 'Hola. ';
    const intro = { cotizacion: 'Te comparto la cotización:', orden: 'Esta es tu orden de compra:', recibo: 'Este es el recibo de tu compra:' }[x.tipo];
    const cola = {
      cotizacion: ['Validez: 1 día. ¿Te la aparto?'],
      orden: [`Abono (${x.pago}): ${pesos(x.abono)}`, `Saldo: ${pesos(x.d.total - x.abono)}`, `Entrega: ${x.entrega || 'a convenir'}`],
      recibo: [`Pagado con ${x.pago}.`, 'Guarda este mensaje: con él haces válida la garantía.'],
    }[x.tipo];
    return [`*Tu Tienda* · ${t.nombre} ${x.numero}`, '', saludo + intro, ...lineas, '', `*Total IVA incluido: ${pesos(x.d.total)}*`, ...cola].join('\n').replace(/\u00A0/g, ' ');
  }

  function pintarDocumento() {
    const x = leerDoc();
    $('#doc-ayuda').textContent = TIPOS[x.tipo].ayuda;
    $$('[data-solo]', formDoc).forEach(el => { el.hidden = !el.dataset.solo.split(' ').includes(x.tipo); });
    const formato = formDoc.querySelector('input[name=formato]:checked').value;
    $('#doc-imagen').hidden = formato !== 'imagen';
    $('#doc-texto').hidden = formato !== 'texto';
    $('#doc-imagen').innerHTML = papelHTML(x);
    $('#doc-texto-msg').textContent = textoWhatsApp(x);
    const tel = digitos(x.tel);
    const destino = tel.length === 10 ? '57' + tel : tel.length > 10 ? tel : '';
    $('#doc-whatsapp').href = `https://wa.me/${destino}?text=${encodeURIComponent(textoWhatsApp(x))}`;
  }
  formDoc.addEventListener('input', e => {
    if (e.target.id === 'doc-abono') { const v = digitos(e.target.value); e.target.value = v ? pesos(+v) : ''; }
    pintarDocumento();
  });
  formDoc.addEventListener('change', pintarDocumento);
  formDoc.addEventListener('submit', e => e.preventDefault());

  $('#doc-imprimir').addEventListener('click', () => {
    const copia = $('#hoja-impresion');
    copia.innerHTML = papelHTML(leerDoc());
    document.documentElement.classList.add('imprimiendo');
    const limpiar = () => { document.documentElement.classList.remove('imprimiendo'); removeEventListener('afterprint', limpiar); };
    addEventListener('afterprint', limpiar);
    setTimeout(() => { window.print(); setTimeout(limpiar, 1000); }, 50);
  });

  $('#doc-guardar').addEventListener('click', () => {
    const x = leerDoc();
    const boton = $('#doc-guardar');
    boton.disabled = true;
    tacto.cara(boton, 1);
    sentir('exito');
    const estado = x.tipo === 'recibo' ? 'vendida' : x.tipo === 'orden' ? 'negociando' : 'enviada';
    const nota = x.tipo === 'orden' ? `Orden ${x.numero}: abonó ${pesos(x.abono)}, saldo ${pesos(x.d.total - x.abono)}.` : x.tipo === 'recibo' ? `Recibo ${x.numero} entregado.` : '';
    let fila = doc.origen && SEG.find(s => s.id === doc.origen);
    if (fila) { fila.estado = estado; fila.dias = 0; if (nota) fila.nota = nota; fila.cliente = x.cliente || fila.cliente; }
    else {
      fila = { id: 's' + Date.now(), num: numeroDe('cotizacion'), cliente: x.cliente || 'Cliente de mostrador', asesor: 'Ana', estado, dias: 0, nota, items: doc.items.map(i => ({ ...i })), nueva: true };
      SEG.unshift(fila);
      if (x.tipo === 'cotizacion' || !doc.numeroFijo) { cot.numero++; }
    }
    if (estado === 'vendida') registrarVentaDe(fila, x.pago);
    if (x.tipo !== 'cotizacion') consecutivos[x.tipo]++;
    seleccion = fila.id;
    pintarSeguimiento();
    if (!doc.origen) { cot.items = []; reiniciarReloj(); pintarCotizacion(); pintarCatalogo(); }
    avisar(x.tipo === 'recibo' ? 'Recibo guardado · la venta ya está en la Caja' : x.tipo === 'orden' ? 'Orden guardada · queda en Seguimiento como negociando' : 'Guardada · la verás en Seguimiento');
  });

  $('#cot-ver').addEventListener('click', () => {
    pararReloj();
    abrirDocumento({ items: cot.items, cliente: $('#cot-cliente').value.trim() });
    if (cot.inicio && cot.fin) avisar(`Cotización armada en ${mmss(cot.fin - cot.inicio)}`);
  });

  // ════════════════════════════════════════════════════════════════════
  // ASESOR IA (simulado en el navegador con el mismo catálogo)
  // ════════════════════════════════════════════════════════════════════
  const mensajes = $('#ia-mensajes');
  const propuesta = $('#ia-propuesta');
  const SUGERIDOS = [
    ['PC gamer de 4 millones', 'PC gamer de 4 millones para jugar en 1080p'],
    ['PC para diseño, 6 millones', 'PC para diseño y render con 6 millones'],
    ['Portátil universidad, 2,5 M', 'Portátil para la universidad hasta 2,5 millones'],
    ['5 equipos de oficina', '5 equipos de oficina completos con monitor'],
    ['Foto que mandó el cliente', 'foto'],
  ];
  $('#ia-sugeridos').innerHTML = SUGERIDOS.map(([e, t]) => `<button type="button" data-pide="${esc(t)}">${esc(e)}</button>`).join('');
  let pensando = false;

  function burbuja(html, clase) {
    const li = document.createElement('li');
    li.className = 'msg ' + clase;
    li.innerHTML = html;
    mensajes.append(li);
    mensajes.scrollTop = mensajes.scrollHeight;
    return li;
  }
  burbuja('Hola, Ana. Dime qué necesita tu cliente: para qué lo va a usar, cuánto quiere gastar y si es portátil o de escritorio. Lo busco en el catálogo de la tienda.', 'msg-sale');
  pintarPropuestaVacia();

  function pintarPropuestaVacia() {
    propuesta.innerHTML = `<div class="ia-vacia"><svg width="34" height="36" aria-hidden="true"><use href="#pc"/></svg><span>Pídele un equipo y la propuesta aparece aquí, con precios del catálogo.<br>Tú decides qué pasa a la cotización.</span></div>`;
  }

  function pedir(texto) {
    if (pensando || !texto.trim()) return;
    pensando = true;
    if (texto === 'foto') {
      burbuja('<span class="foto-papel" style="display:grid;rotate:0deg;inline-size:100%;padding:8px 12px"><span>ssd 1tb nvme</span><span>ram 16gb ddr4</span><span>mouse inalambrico</span><span>webcam 4k</span></span>', 'msg-entra foto-chat');
    } else burbuja(esc(texto), 'msg-entra');
    sentir('toque');
    const pensar = burbuja('<span class="escribiendo" aria-label="Escribiendo"><i></i><i></i><i></i></span>', 'msg-sale');
    const r = texto === 'foto' ? leerFoto() : armar(texto);
    setTimeout(() => {
      pensar.innerHTML = esc(r.texto);
      mensajes.scrollTop = mensajes.scrollHeight;
      pintarPropuesta(r);
      pensando = false;
      sentir('aviso');
    }, reducido.matches ? 200 : 1100);
  }
  $('#ia-sugeridos').addEventListener('click', e => { const b = e.target.closest('[data-pide]'); if (b) pedir(b.dataset.pide); });
  $('#ia-form').addEventListener('submit', e => { e.preventDefault(); const i = $('#ia-texto'); pedir(i.value); i.value = ''; });

  function presupuesto(t) {
    let m;
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(millones|millon|palos|mill|m)\b/))) return parseFloat(m[1].replace(',', '.')) * 1e6;
    if ((m = t.match(/\b(\d{1,3}(?:\.\d{3}){2,})\b/))) return +m[1].replace(/\./g, '');
    if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)\b/))) return parseFloat(m[1].replace(',', '.')) * 1e3;
    if ((m = t.match(/\b(\d{7,9})\b/))) return +m[1];
    return 0;
  }
  function cantidadDe(t) {
    const m = t.match(/(?:para\s+)?(\d{1,2})\s+(?:personas|equipos|empleados|puestos|computadores|pcs|portatiles|estaciones)/);
    return m ? Math.max(1, Math.min(30, +m[1])) : 1;
  }

  const RAZON = {
    cpu5600g: 'Trae gráficos integrados: no necesita tarjeta de video', cpu7600: '6 núcleos: de sobra para jugar en 1080p y 1440p',
    cpu7700x: '8 núcleos para render y edición sin esperas', cpu7800x3d: 'El más rápido para juegos de este catálogo',
    mbA520: 'Para el 5600G, con lo necesario para oficina', mbB650: 'Socket AM5: el procesador se puede mejorar después', mbX670: 'Más puertos y M.2 para crecer',
    ram16d4: 'Suficiente para oficina y navegación', ram16: 'Suficiente para jugar', ram32: 'La medida justa para diseño y juegos actuales', ram64: 'Para video y 3D pesados',
    ssd500: 'Arranque rápido; el resto en la nube', ssd1: 'Espacio para juegos y proyectos', ssd2: 'Para bibliotecas grandes de juegos o video',
    g3050: 'Juegos en 1080p con ajustes medios', g4060: '1080p en alto, con DLSS', g4060ti: '16 GB de video: aguanta texturas y render',
    g7700xt: '12 GB, muy buena para 1440p', g4070s: '1440p en ultra con margen', g4080s: '4K y render pesado',
    psu550: 'Alcanza con margen para esta tarjeta', psu750: 'Margen para la tarjeta, 80+ Gold', psu850: 'La que pide una tarjeta de esta gama',
    caseM: 'Compacta, con dos ventiladores', caseA: 'Mejor flujo de aire, cuatro ventiladores',
    airC: 'Este procesador no trae disipador', liqC: 'Más silencio en cargas largas',
    mon22: 'Para trabajo de oficina', mon24: '100 Hz, buena para todo', mon27: 'QHD a 165 Hz: para aprovechar la tarjeta',
    combo: 'Inalámbrico, para el puesto completo', morral: 'Para llevarlo a clase', mouseW: 'Lo que más piden con un portátil',
    p1: 'Liviano, para clase y oficina', p2: 'Ryzen 5 y 16 GB: le dura toda la carrera', p3: 'Core i5 y pantalla FHD', p4: 'RTX 4050: diseño y juegos', p5: 'RTX 4060 y 32 GB: el más potente',
  };

  function armar(texto) {
    const t = norm(texto);
    let budget = presupuesto(t);
    const cant = cantidadDe(t);
    const portatil = /portatil|laptop|universidad|estudiante|colegio|clase/.test(t);
    let perfil = /jug|gam|1440|1080|4k|fps|stream/.test(t) ? 'gamer'
      : /dise|render|edici|edit|arquitect|autocad|premiere|3d|video/.test(t) ? 'diseno'
      : /oficina|contab|excel|empresa|personas|empleados|basic|navegar|admin/.test(t) ? 'oficina' : null;
    const conMonitor = /monitor|completo|pantalla/.test(t);
    const reconoce = budget || perfil || portatil || cant > 1 || conMonitor;
    if (!reconoce) {
      return { texto: 'No me alcanzó para entender el pedido. Cuéntame para qué lo quiere el cliente (jugar, diseño, oficina, universidad) y cuánto quiere gastar, por ejemplo: «PC gamer de 5 millones».', items: [] };
    }
    if (!perfil) perfil = budget && budget / cant >= 3e6 ? 'gamer' : 'oficina';
    const porUnidad = budget ? budget / cant : 0;
    const nombrePerfil = { gamer: 'para jugar', diseno: 'para diseño', oficina: 'de oficina' }[perfil];

    // Portátil: el mejor que entre en el presupuesto, y accesorios con lo que sobra
    if (portatil) {
      const candidatos = { gamer: ['p4', 'p5'], diseno: ['p3', 'p4', 'p5'], oficina: ['p1', 'p2', 'p3'] }[perfil].map(id => P[id]);
      const tope = porUnidad || (perfil === 'oficina' ? 2500000 : 5000000);
      const caben = candidatos.filter(p => p.precio <= tope);
      const elegido = caben.length ? caben[caben.length - 1] : candidatos[0];
      const items = [{ id: elegido.id, cant }];
      let sobra = tope - elegido.precio;
      ['morral', 'mouseW'].forEach(id => { if (sobra >= P[id].precio) { items.push({ id, cant }); sobra -= P[id].precio; } });
      const total = sumar(items);
      const pasa = !caben.length;
      return {
        items, budget,
        titulo: cant > 1 ? `${cant} portátiles ${nombrePerfil}` : `Portátil ${nombrePerfil}`,
        texto: pasa
          ? `Con ${pesos(tope)} no alcanza para un portátil ${nombrePerfil} en este catálogo. El más cercano es el ${elegido.nombre}, de ${pesos(elegido.precio)}. Te lo dejo en la propuesta por si el cliente puede estirarse.`
          : `Te propongo el ${elegido.nombre}${items.length > 1 ? ', con ' + items.slice(1).map(i => P[i.id].nombre.toLowerCase()).join(' y ') : ''}. Total ${pesos(total)}${budget ? `, dentro de los ${pesos(budget)}` : ''}.${elegido.ex ? ' Está excluido de IVA.' : ''}`,
      };
    }

    // Oficina de escritorio: armado fijo, se sube lo que alcance
    if (perfil === 'oficina') {
      const unidad = ['cpu5600g', 'mbA520', 'ram16d4', 'ssd500', 'psu550', 'caseM'];
      const tope = porUnidad || Infinity;
      const total1 = ids => ids.reduce((s, id) => s + P[id].precio, 0);
      if (conMonitor || total1(unidad) + P.mon22.precio + P.combo.precio <= tope) unidad.push('mon22', 'combo');
      if (total1(unidad) - P.ssd500.precio + P.ssd1.precio <= tope) unidad[unidad.indexOf('ssd500')] = 'ssd1';
      const items = unidad.map(id => ({ id, cant }));
      const total = sumar(items);
      return {
        items, budget,
        titulo: cant > 1 ? `${cant} equipos de oficina` : 'PC de oficina',
        texto: `${cant > 1 ? `Para ${cant} puestos` : 'Para oficina'} te propongo un Ryzen 5 5600G, que trae gráficos y no necesita tarjeta de video${unidad.includes('mon22') ? ', con monitor de 22" y combo inalámbrico' : ''}. Cada equipo sale en ${pesos(total / cant)}; en total ${pesos(total)}.${budget && total > budget ? ` Se pasa ${pesos(total - budget)} del presupuesto: puedo quitar el monitor si ya lo tienen.` : ''}`,
      };
    }

    // Escritorio para jugar o diseñar: se mejora pieza por pieza mientras entre
    const ESCALA = { cpu: ['cpu7600', 'cpu7700x', 'cpu7800x3d'], board: ['mbB650', 'mbX670'], ram: ['ram16', 'ram32', 'ram64'], ssd: ['ssd500', 'ssd1', 'ssd2'], gpu: ['g3050', 'g4060', 'g4060ti', 'g7700xt', 'g4070s', 'g4080s'], caja: ['caseM', 'caseA'] };
    const PASOS = perfil === 'gamer'
      ? ['gpu', 'ssd', 'gpu', 'ram', 'gpu', 'cpu', 'gpu', 'caja', 'gpu', 'cpu', 'ram', 'ssd', 'gpu', 'board']
      : ['ram', 'cpu', 'ssd', 'gpu', 'gpu', 'ram', 'gpu', 'caja', 'ssd', 'gpu', 'board', 'gpu'];
    const nivel = { cpu: 0, board: 0, ram: perfil === 'diseno' ? 1 : 0, ssd: 0, gpu: 0, caja: 0 };
    const piezas = n => {
      const ids = Object.keys(ESCALA).map(k => ESCALA[k][n[k]]);
      const g = ESCALA.gpu[n.gpu];
      ids.push(g === 'g4080s' ? 'psu850' : (g === 'g4070s' || g === 'g7700xt') ? 'psu750' : 'psu550');
      if (n.cpu > 0) ids.push('airC');
      if (conMonitor) ids.push(perfil === 'gamer' && n.gpu >= 3 ? 'mon27' : 'mon24');
      return ids;
    };
    const costo = n => piezas(n).reduce((s, id) => s + P[id].precio, 0);
    const tope = porUnidad || (perfil === 'gamer' ? 4500000 : 6000000);
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      PASOS.forEach(k => {
        if (nivel[k] + 1 >= ESCALA[k].length) return;
        const prueba = { ...nivel, [k]: nivel[k] + 1 };
        if (costo(prueba) <= tope) nivel[k]++;
      });
    }
    const ids = piezas(nivel);
    const items = ids.map(id => ({ id, cant }));
    const total = sumar(items);
    const minimo = costo({ cpu: 0, board: 0, ram: 0, ssd: 0, gpu: 0, caja: 0 });
    const gpu = P[ESCALA.gpu[nivel.gpu]], cpu = P[ESCALA.cpu[nivel.cpu]];
    let txt;
    if (total > tope) txt = `Con ${pesos(tope)} no alcanza para un PC ${nombrePerfil} con este catálogo: el más sencillo sale en ${pesos(minimo)}. Te dejo ese en la propuesta.`;
    else if (perfil === 'gamer') txt = `Te propongo un PC ${nombrePerfil} de ${pesos(total)}${budget ? ` (presupuesto: ${pesos(budget)})` : ''}. La plata se va sobre todo a la ${gpu.nombre.replace('Tarjeta de video ', '')}, que es donde más se nota en juegos, con un ${cpu.nombre.replace('Procesador ', '')}.`;
    else txt = `Te propongo un PC ${nombrePerfil} de ${pesos(total)}${budget ? ` (presupuesto: ${pesos(budget)})` : ''}. Prioricé el procesador ${cpu.nombre.replace('Procesador ', '')} y la memoria, que es lo que más acelera el render, y una ${gpu.nombre.replace('Tarjeta de video ', '')}.`;
    if (!budget) txt += ' No me dijiste presupuesto, así que partí de ' + pesos(tope) + '.';
    return { items, budget, titulo: (cant > 1 ? cant + ' PC ' : 'PC ') + nombrePerfil, texto: txt };
  }

  function leerFoto() {
    return {
      foto: true, titulo: 'Lo que pidió el cliente',
      texto: 'Leí cuatro productos en la foto. Tres los tenemos exactos; la webcam 4K no está en el catálogo y te propongo la FHD como equivalente.',
      items: [{ id: 'ssd1', cant: 1, chip: ['Exacto', 'menta'] }, { id: 'ram16d4', cant: 1, chip: ['Exacto', 'menta'] }, { id: 'mouseW', cant: 1, chip: ['Exacto', 'menta'] }, { id: 'webcam', cant: 1, chip: ['Equivalente a «webcam 4k»', 'durazno'] }],
    };
  }

  function pintarPropuesta(r) {
    if (!r.items.length) { pintarPropuestaVacia(); return; }
    const total = sumar(r.items);
    propuesta.innerHTML = `
      <header class="tarjeta-cabeza"><div><h4>${esc(r.titulo)}</h4><p>${r.items.length} ${r.items.length === 1 ? 'referencia' : 'referencias'} del catálogo</p></div><span class="chip chip-cielo">Sugerido</span></header>
      <ul class="prop-lista">${r.items.map((it, i) => {
        const p = P[it.id];
        return `<li class="prop-fila" style="--i:${i}"><b>${it.cant > 1 ? it.cant + ' × ' : ''}${esc(p.nombre)}</b><span class="num">${pesos(p.precio * it.cant)}</span>${it.chip ? `<span class="chip chip-${it.chip[1]}">${esc(it.chip[0])}</span>` : `<small>${esc(RAZON[it.id] || textoGarantia(p))}</small>`}</li>`;
      }).join('')}</ul>
      <p class="prop-total"><span>Total IVA incluido${r.budget ? `<small>Presupuesto ${pesos(r.budget)}</small>` : ''}</span><b>${pesos(total)}</b></p>
      <button class="boton boton-principal" type="button" id="ia-agregar">Pasar a la cotización</button>
      <p class="prop-nota">Revisa antes de enviar: la IA sugiere, el asesor decide.</p>`;
    $('#ia-agregar').addEventListener('click', () => {
      agregar(r.items.map(({ id, cant }) => ({ id, cant })), { reemplazar: true });
      sentir('exito');
      irA('cotizar');
      avisar('Propuesta en la cotización · ajusta lo que quieras');
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // SEGUIMIENTO
  // ════════════════════════════════════════════════════════════════════
  const it = (id, cant = 1) => ({ id, cant });
  const SEG = [
    { id: 's1', num: 'A-1188', cliente: 'Laura Méndez', asesor: 'Ana', estado: 'enviada', dias: 3, nota: 'Pidió precio del portátil para su hija.', items: [it('p2'), it('morral')] },
    { id: 's2', num: 'A-1185', cliente: 'Inversiones Ejemplo S.A.S.', asesor: 'David', estado: 'negociando', dias: 2, nota: 'Pidió 3 % de descuento por pago de contado.', items: [it('p3', 5), it('combo', 5)] },
    { id: 's3', num: 'A-1190', cliente: 'Diana Castro', asesor: 'Ana', estado: 'vendida', dias: 0, nota: '', items: [it('mon24'), it('combo')] },
    { id: 's4', num: 'A-1192', cliente: 'Camilo Pérez', asesor: 'David', estado: 'enviada', dias: 0, nota: 'Lo quiere para diseño; vuelve el sábado.', items: [it('cpu7700x'), it('mbB650'), it('ram32'), it('ssd1'), it('g4060ti'), it('psu550'), it('caseA'), it('airC')] },
    { id: 's5', num: 'A-1179', cliente: 'Academia Norte', asesor: 'Sara', estado: 'negociando', dias: 1, nota: 'Compras pide la cotización formal con NIT.', items: [it('p1', 12)] },
    { id: 's6', num: 'A-1171', cliente: 'Julián Rojas', asesor: 'Sara', estado: 'perdida', dias: 4, nota: 'Compró en otra tienda: le salió $ 60.000 más barata.', items: [it('g4060ti')] },
    { id: 's7', num: 'A-1183', cliente: 'Andrés Gómez', asesor: 'Ana', estado: 'vendida', dias: 1, nota: '', items: [it('ssd1'), it('ram32')] },
    { id: 's8', num: 'A-1176', cliente: 'Marcela Torres', asesor: 'David', estado: 'enviada', dias: 4, nota: 'Preguntó si hay crédito.', items: [it('p5')] },
  ];
  const BASE_MES = { cotizado: 61240000, vendidas: 14, perdidas: 9 };
  const ESTADOS = { enviada: ['Enviada', 'cielo'], negociando: ['Negociando', 'lavanda'], vendida: ['Vendida', 'menta'], perdida: ['Perdida', 'rosa'] };
  const AVATAR = { enviada: 'cielo', negociando: 'lavanda', vendida: 'menta', perdida: 'rosa' };
  const retomar = s => (s.estado === 'enviada' || s.estado === 'negociando') && s.dias >= 2;
  const FILTROS_SEG = [['todas', 'Todas'], ['retomar', 'Para retomar'], ['enviada', 'Enviadas'], ['negociando', 'Negociando'], ['vendida', 'Vendidas'], ['perdida', 'Perdidas']];
  let filtroSeg = 'todas', seleccion = 's1';
  const filtrosSeg = $('#seg-filtros');

  function pintarSeguimiento() {
    const cuenta = k => k === 'todas' ? SEG.length : k === 'retomar' ? SEG.filter(retomar).length : SEG.filter(s => s.estado === k).length;
    filtrosSeg.innerHTML = FILTROS_SEG.map(([k, e]) => `<button type="button" aria-pressed="${k === filtroSeg}" data-f="${k}">${e}<small>${cuenta(k)}</small></button>`).join('');
    const filas = SEG.filter(s => filtroSeg === 'todas' ? true : filtroSeg === 'retomar' ? retomar(s) : s.estado === filtroSeg);
    if (!filas.find(s => s.id === seleccion) && filas.length) seleccion = filas[0].id;
    $('#seg-filas').innerHTML = filas.length ? filas.map(s => {
      const [e, c] = ESTADOS[s.estado];
      return `<button type="button" class="fila-seg" data-s="${esc(s.id)}" aria-current="${s.id === seleccion}"${s.nueva ? ' data-nueva' : ''}>
        <span class="avatar avatar-${AVATAR[s.estado]}" aria-hidden="true">${esc(iniciales(s.cliente))}</span>
        <span class="quien"><b>${esc(s.cliente)}</b><small>${esc(s.num)} · ${esc(resumir(s.items))} · ${esc(s.asesor)}</small></span>
        <span class="lado"><span class="num">${corto(sumar(s.items))}</span>${retomar(s) ? `<span class="chip chip-durazno">${s.dias} días sin respuesta</span>` : `<span class="chip chip-${c}">${e}</span>`}</span>
      </button>`;
    }).join('') : '<p class="lista-vacia">Nada por aquí. Buena señal.</p>';
    SEG.forEach(s => delete s.nueva);

    const cotizado = BASE_MES.cotizado + SEG.reduce((t, s) => t + sumar(s.items), 0);
    const vend = BASE_MES.vendidas + SEG.filter(s => s.estado === 'vendida').length;
    const perd = BASE_MES.perdidas + SEG.filter(s => s.estado === 'perdida').length;
    cifra($('#seg-cotizado'), corto(cotizado));
    cifra($('#seg-cierre'), Math.round(vend / (vend + perd) * 100) + ' %');
    cifra($('#seg-retomar'), String(SEG.filter(retomar).length));
    pintarDetalle();
  }
  filtrosSeg.addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filtroSeg = b.dataset.f; sentir('seleccion'); pintarSeguimiento();
  });
  $('#seg-filas').addEventListener('click', e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    seleccion = b.dataset.s;
    $$('.fila-seg').forEach(f => f.setAttribute('aria-current', String(f === b)));
    sentir('seleccion');
    pintarDetalle();
  });

  function borrador(s) {
    const n = s.cliente.split(' ')[0];
    return s.estado === 'negociando'
      ? `Hola, ${n}. Revisé lo que hablamos de la cotización ${s.num}. Te puedo sostener el precio hasta mañana. ¿La cerramos?`
      : `Hola, ${n}. ¿Pudiste revisar la cotización ${s.num}? Te la puedo apartar hasta mañana y, si quieres, la ajustamos.`;
  }
  function pintarDetalle() {
    const s = SEG.find(x => x.id === seleccion);
    const det = $('#seg-detalle');
    if (!s) { det.innerHTML = ''; return; }
    const total = sumar(s.items);
    det.innerHTML = `
      <div class="det-cabeza"><span class="avatar avatar-${AVATAR[s.estado]}" aria-hidden="true">${esc(iniciales(s.cliente))}</span><span><b>${esc(s.cliente)}</b><small>${esc(s.num)} · asesor: ${esc(s.asesor)}</small></span></div>
      <dl class="det-dl">
        <div><dt>Productos</dt><dd>${esc(resumir(s.items))}</dd></div>
        <div><dt>Total</dt><dd>${pesos(total)}</dd></div>
        <div><dt>Último movimiento</dt><dd>${s.dias === 0 ? 'Hoy' : s.dias === 1 ? 'Ayer' : `Hace ${s.dias} días`}</dd></div>
      </dl>
      ${s.nota ? `<p class="det-nota">${esc(s.nota)}</p>` : ''}
      ${retomar(s) ? `<p class="det-borrador">${esc(borrador(s))}</p>` : ''}
      <div class="det-estados" role="group" aria-label="Estado">${Object.entries(ESTADOS).map(([k, [e]]) => `<button type="button" data-estado="${k}" aria-pressed="${s.estado === k}">${e}</button>`).join('')}</div>
      <div class="det-acciones">
        ${retomar(s) ? `<a class="boton boton-principal" href="https://wa.me/?text=${encodeURIComponent(borrador(s))}" target="_blank" rel="noopener" data-retomar>Retomar por WhatsApp</a>` : ''}
        <button class="boton boton-hundido" type="button" data-doc="${s.estado === 'vendida' ? 'recibo' : s.estado === 'negociando' ? 'orden' : 'cotizacion'}">${s.estado === 'vendida' ? 'Hacer recibo' : s.estado === 'negociando' ? 'Orden de compra' : 'Ver cotización'}</button>
      </div>`;
  }
  $('#seg-detalle').addEventListener('click', e => {
    const s = SEG.find(x => x.id === seleccion); if (!s) return;
    const est = e.target.closest('[data-estado]');
    if (est && est.dataset.estado !== s.estado) {
      s.estado = est.dataset.estado; s.dias = 0;
      if (s.estado === 'vendida') { registrarVentaDe(s, 'Transferencia'); avisar('Vendida · la venta pasó a la Caja'); sentir('exito'); }
      else sentir('seleccion');
      pintarSeguimiento();
      return;
    }
    if (e.target.closest('[data-retomar]')) { s.dias = 0; s.nota = 'Retomada hoy por WhatsApp.'; setTimeout(pintarSeguimiento, 300); return; }
    const d = e.target.closest('[data-doc]');
    if (d) abrirDocumento({ items: s.items, tipo: d.dataset.doc, cliente: s.cliente, origen: s.id, numero: s.num });
  });

  // ════════════════════════════════════════════════════════════════════
  // CAJA
  // ════════════════════════════════════════════════════════════════════
  const GRUPO = m => /tarjeta/i.test(m) ? 'Tarjeta' : /efectivo/i.test(m) ? 'Efectivo' : 'Transferencia';
  let factura = 2200;
  const venta = (hora, cliente, items, medio, origen = null) => ({ hora, fact: 'FV-' + (++factura), cliente, items, medio, origen });
  const VENTAS = [
    venta('09:12', 'Diana Castro', [it('mon24'), it('combo')], 'Tarjeta débito', 's3'),
    venta('09:47', 'Mostrador', [it('mouseG')], 'Efectivo'),
    venta('10:31', 'Andrés Gómez', [it('ssd1'), it('ram32')], 'Nequi', 's7'),
    venta('11:05', 'Mostrador', [it('webcam'), it('diadema')], 'Efectivo'),
    venta('11:58', 'Paula Ríos', [it('p1')], 'Tarjeta crédito'),
    venta('12:40', 'Mostrador', [it('base'), it('morral')], 'Efectivo'),
  ];
  const COLA = [
    ['Esteban Vargas', [it('g4060')], 'Transferencia'], ['Mostrador', [it('tecladoM')], 'Efectivo'], ['Natalia Peña', [it('p2')], 'Efectivo'],
    ['Mostrador', [it('combo')], 'Efectivo'], ['Felipe Díaz', [it('mon27')], 'Tarjeta débito'], ['Mostrador', [it('mouseW'), it('ssd500')], 'Efectivo'],
  ];
  let reloj0 = new Date(); reloj0.setHours(13, 15, 0, 0);
  const horaVenta = () => {
    const a = new Date(), h = a.getHours();
    if (h >= 13 && h < 20) return hm(a);
    reloj0 = new Date(reloj0.getTime() + 17 * 60000); return hm(reloj0);
  };
  function registrarVentaDe(s, medio) {
    if (VENTAS.some(v => v.origen === s.id)) return;
    VENTAS.unshift({ ...venta(horaVenta(), s.cliente, s.items.map(i => ({ ...i })), medio, s.id), nueva: true });
    pintarCaja();
  }
  $('#caja-registrar').addEventListener('click', () => {
    const b = $('#caja-registrar');
    const sig = COLA.shift() || ['Mostrador', [it('mouseW')], 'Efectivo'];
    b.disabled = true; tacto.cara(b, 1);
    setTimeout(() => {
      VENTAS.unshift({ ...venta(horaVenta(), sig[0], sig[1], sig[2]), nueva: true });
      pintarCaja(); tacto.cara(b, 0); b.disabled = false; sentir('exito');
    }, 500);
  });

  const GLIFOS = {
    Efectivo: '<rect class="glifo" x="15" y="18" width="16" height="10" rx="2"/><circle class="glifo" cx="23" cy="23" r="2"/>',
    Tarjeta: '<rect class="glifo" x="15" y="17" width="16" height="12" rx="2"/><path class="glifo" d="M15 21h16"/>',
    Transferencia: '<path class="glifo" d="M16 20h13l-3-3M30 26H17l3 3"/>',
  };
  function pintarCaja() {
    const total = VENTAS.reduce((s, v) => s + sumar(v.items), 0);
    const por = { Efectivo: 0, Tarjeta: 0, Transferencia: 0 };
    VENTAS.forEach(v => { por[GRUPO(v.medio)] += sumar(v.items); });
    $('#caja-sub').textContent = `${VENTAS.length} ventas · Sede Norte`;
    $('#caja-lista').innerHTML = VENTAS.map((v, i) => `<li${v.nueva ? ' data-nueva' : ''}>
      <time>${v.hora}</time>
      <span class="quien"><b>${esc(v.cliente)}</b><small>${v.fact} · ${esc(resumir(v.items))} · ${esc(v.medio)}</small></span>
      <span class="num">${pesos(sumar(v.items))}<button class="recibo-boton" type="button" data-recibo="${i}">Recibo</button></span>
    </li>`).join('');
    VENTAS.forEach(v => delete v.nueva);
    $('#capsula').innerHTML = Object.entries(por).map(([k, v]) => `<li>
      <svg viewBox="0 0 46 46" aria-hidden="true"><circle class="pista-anillo" cx="23" cy="23" r="16"/><circle class="valor-anillo" cx="23" cy="23" r="16" pathLength="100" style="--v:${total ? Math.round(v / total * 100) : 0}"/>${GLIFOS[k]}</svg>
      <span>${corto(v)}</span><small>${k}</small>
    </li>`).join('');
    cifra($('#caja-total'), pesos(total));
    cifra($('#caja-efectivo'), pesos(por.Efectivo));
    cuadrar();
  }
  $('#caja-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-recibo]'); if (!b) return;
    const v = VENTAS[+b.dataset.recibo];
    abrirDocumento({ items: v.items, tipo: 'recibo', cliente: v.cliente === 'Mostrador' ? '' : v.cliente, pago: v.medio, origen: v.origen });
  });
  const contado = $('#caja-contado');
  function cuadrar() {
    const esperado = VENTAS.filter(v => GRUPO(v.medio) === 'Efectivo').reduce((s, v) => s + sumar(v.items), 0);
    const est = $('#caja-estado');
    const v = +digitos(contado.value);
    if (!contado.value) { est.removeAttribute('data-estado'); est.textContent = 'Al final del día, cuenta el efectivo y escríbelo arriba.'; return; }
    const dif = v - esperado;
    est.dataset.estado = dif === 0 ? 'ok' : dif < 0 ? 'falta' : 'sobra';
    est.textContent = dif === 0 ? 'Cuadra. Cierre listo para guardar.' : dif < 0 ? `Faltan ${pesos(-dif)}. Revisa vueltos y pagos divididos.` : `Sobran ${pesos(dif)}. ¿Quedó una venta sin registrar?`;
  }
  contado.addEventListener('input', () => {
    const v = digitos(contado.value);
    contado.value = v ? pesos(+v) : '';
    cuadrar();
  });
  contado.addEventListener('change', () => { const e = $('#caja-estado').dataset.estado; if (e) sentir(e === 'ok' ? 'exito' : 'aviso'); });

  // ── Arranque ──
  pintarCatalogo();
  pintarCotizacion();
  pintarSeguimiento();
  pintarCaja();
})();
