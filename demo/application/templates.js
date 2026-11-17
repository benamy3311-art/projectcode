// TEMPLATES LAYER - Pure HTML generation (object T)

// ============================================================
// SECCIÓN: ÍCONOS SVG STROKE
// Regla de la app: nunca emojis en la UI; siempre SVG stroke.
// icon(name, cls) devuelve un <span class="ico"> listo para
// interpolar en cualquier template o innerHTML.
// ============================================================
const SL_ICONS = {
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'alert': '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'info': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'key': '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  'copy': '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  'download': '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'upload': '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  'edit': '<path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5z"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'tool': '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
  'sparkle': '<path d="M12 3l1.9 5.7a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/>',
  'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 010 18a15 15 0 010-18"/>',
  'cloud-up': '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>',
  'swap': '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>'
};

function icon(name, cls) {
  const d = SL_ICONS[name] || SL_ICONS['info'];
  return '<span class="ico' + (cls ? ' ' + cls : '') + '"><svg viewBox="0 0 24 24">' + d + '</svg></span>';
}

// ============================================================
// SECCIÓN: SISTEMA DE TEMPLATES HTML
// Funciones puras: reciben datos → retornan markup.
// Centralizan toda la generación de HTML.
// ============================================================
const T = {

  // ── Sidebar: tarjeta de item ────────────────────────
  comboComponentLi(i, ci, label, savedVal) {
    return `<li>
      ${label ? `<span style="font-size:9px;font-weight:600;color:var(--blue);min-width:90px;display:inline-block">${esc(label)}</span>` : ''}
      <span class="combo-comp-val" contenteditable="true" title="Clic para editar"
        oninput="saveComboEdit(${i},${ci},this)"
        onblur="notifyQuote()">${esc(savedVal)}</span>
    </li>`;
  },

  comboToggleBtn(i, wasOpen) {
    return `<button class="combo-toggle-btn${wasOpen ? ' active' : ''}" id="combo-btn-${i}"
      onclick="toggleComboPanel(${i})" title="Ver componentes del combo">
      <span class="ctb-arrow">${wasOpen ? '▾' : '▸'}</span> Componentes</button>`;
  },

  comboPanelBlock(i, liItems, wasOpen) {
    return `<div class="combo-components item-full-row${wasOpen ? ' open' : ''}" id="combo-panel-${i}">
      <div class="combo-comp-title">${icon('tool', 'ico-xs')} Desglose de componentes</div>
      <ul class="combo-comp-list">${liItems}</ul>
    </div>`;
  },

  itemCard(i, item, cat, cs, price, nd, comboBtn, comboPanel) {
    return `<div class="item" id="icard-${i}">
      <div class="item-info">
        <div class="item-name" id="iname-${i}" onclick="editName(${i},this)" title="Clic para editar nombre">${esc(item.name)}<span class="item-name-edit-ico">${icon('edit', 'ico-xs')}</span></div>
        <div class="item-meta">
          <span class="item-sku">${esc(item.sku)}</span>
          <span class="cpill ${cs}" onclick="openCatPicker(${i},this)">${cat} ${icon('edit', 'ico-xs')}</span>
          <button class="iva-btn ${item.iva ? 'has-iva' : 'no-iva'}" onclick="toggleIva(${i})">${item.iva ? 'IVA 19%' : 'EXCL. IVA'}</button>
          <button class="note-btn" onclick="toggleNote(${i})">+ nota</button>
          ${comboBtn}
        </div>
        <input class="note-inp" id="note-${i}" style="display:${nd}" value="${esc(item.note)}"
          placeholder="Ej: incluye instalación..." oninput="dispatch({type:'UPDATE_NOTE',index:${i},note:this.value})">
      </div>
      <div class="item-price" id="ip-${i}" onclick="editPrice(${i},this)" title="Clic para editar precio">${fmtCOP(price)}<span class="item-price-edit-ico">${icon('edit', 'ico-xs')}</span></div>
      <div class="qty-ctrl">
        <button class="qbtn" onclick="changeQty(${i},-1)">−</button>
        <input class="qnum qnum-inp" id="iq-${i}" type="text" inputmode="numeric" pattern="[0-9]*" value="${item.qty}"
          onclick="this.select()"
          oninput="setQty(${i},this.value)"
          onblur="setQty(${i},this.value,true)"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}">
        <button class="qbtn" onclick="changeQty(${i},+1)">+</button>
      </div>
      <button class="idel" onclick="removeItem(${i})" title="Eliminar">×</button>
      ${comboPanel}
    </div>`;
  },

  // ── Catálogo ────────────────────────────────────────
  catalogRow(p, idx, cs, inCart) {
    return `<div class="crow">
      <span class="crow-sku">${esc(p.sku)}</span>
      <span class="crow-badge ${cs}">${esc(p._cat || 'ADICIONAL')}</span>
      <span class="crow-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <button class="crow-gsearch" onclick="gsearchCat(${idx})" title="Buscar «${esc(p.name)}» en Google" aria-label="Buscar en Google">
        <svg class="gs-lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <svg class="gs-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
      </button>
      <span class="crow-price">$${(p.price * 1000).toLocaleString('es-CO')}</span>
      <button class="btn-add${inCart ? ' added' : ''}" id="cadd-${idx}"
        onclick="addFromCat(${idx})">${inCart ? icon('check', 'ico-sm') : '+ Añadir'}</button>
    </div>`;
  },

  // ── Cotización: filas de producto ───────────────────
  // displayName: texto a mostrar (cuando el combo está desglosado, se recorta a la referencia)
  // idx: índice real en `items` → habilita edición inline de descripción y precio
  quoteRow(it, cat, ivaBadge, uCell, lineT, isComboHeader, specChips, noteRow, displayName, idx) {
    const nameTxt = (displayName != null && displayName !== '') ? displayName : it.name;
    const refEdit = (idx != null) ? ` qedit" onclick="editQuoteName(${idx},this)" title="Clic para editar descripción` : '"';
    const catEdit = (idx != null) ? ` qedit" onclick="openCatPicker(${idx},this)" title="Clic para cambiar categoría` : '"';
    const catEditIcon = (idx != null) ? ` <span class="no-print">${icon('edit', 'ico-xs')}</span>` : '';
    return `<tr${isComboHeader ? ' class="qrow-combo-header"' : ''}>
      <td class="c" style="width:34px"><span class="qrow-qty">${it.qty}</span><button class="qrow-swap no-print" onclick="openSwapPicker(${idx})" title="Reemplazar producto">${icon('swap','ico-xs')}</button><button class="qrow-rm no-print" onclick="removeQuoteItem(${idx})">×</button></td>
      <td class="sku" style="width:74px">${esc(it.sku)}</td>
      <td class="ref${isComboHeader ? ' combo-label-cell' : ''}${refEdit}">${esc(nameTxt)}</td>
      <td class="cat" style="width:122px"><span class="catpill${catEdit}">${cat}${catEditIcon}</span>${ivaBadge}</td>
      ${uCell}
      <td class="r tot" style="width:128px">${fmtCOP(lineT)}</td>
    </tr>${specChips}${noteRow}`;
  },

  // ── Cotización: ficha técnica en chips ──────────────
  // Misma data que parseComboComponents(); en vez de una viñeta por línea,
  // se muestran como chips etiquetados (CPU / RAM / SSD / GPU...) debajo de
  // la referencia. El valor sigue siendo editable y escribe en el mismo
  // _comboEdits[ci] que usaba el desglose vertical.
  quoteSpecChips(comps, idx, edits) {
    let chips = '';
    for (let ci = 1; ci < comps.length; ci++) {
      const val = (edits && edits[ci] !== undefined) ? edits[ci] : comps[ci].value;
      if (!val) continue;
      const lbl = comboChipLabel(comps[ci].label);
      const editable = (idx != null)
        ? ` contenteditable="true" oninput="saveComboEdit(${idx},${ci},this)" onblur="notifyQuote()" title="Clic para editar"`
        : '';
      // Sin etiqueta igual va la cápsula, vacía e invisible: es la que
      // reserva el ancho de la columna y mantiene los valores alineados.
      chips += `<span class="qspec${COMBO_CHIP_HERO[lbl] ? ' hero' : ''}">`
        + (lbl ? `<b>${esc(lbl)}</b>` : '<b class="qspec-nolabel"></b>')
        + `<i${editable}>${esc(val)}</i></span>`;
    }
    if (!chips) return '';
    return `<tr class="qrow-specs"><td></td><td></td>
      <td colspan="4"><div class="qspecs">${chips}</div></td></tr>`;
  },

  // Con descuento activo se mostraba el precio de lista tachado encima del
  // precio final. Se quitó: el descuento ya se explica una sola vez abajo,
  // en la línea "Pago en efectivo o transferencia", y el tachado sobre cada
  // fila recargaba la tabla sin agregar información.
  quoteUnitCell(unitD, idx) {
    const edit = (idx != null) ? ` qedit" onclick="editQuotePrice(${idx},this)" title="Clic para editar precio` : '"';
    return `<td class="r unit${edit}" style="width:128px">${fmtCOP(unitD)}</td>`;
  },

  // Logo de marca: custom del usuario > branding white-label > logo por
  // defecto. '' cuando no hay imagen (caso Lite: se rotula con el nombre).
  brandLogoSrc() {
    const b = window._slBranding || {};
    let custom = null;
    try { custom = localStorage.getItem('sl_custom_logo'); } catch (_e) { }
    return custom || b.logoUrl || (b.brandName ? '' : LOGO_SRC);
  },

  quoteHeader(numCot, wa, today, asesor, cliente, lista, quoteId) {
    const waBlock = wa
      ? `<div class="wa"><img src="${WA_LOGO}" class="wa-ico">WhatsApp: ${esc(wa)}</div>`
      : '';
    const friendlyLista = lista === 'lago' ? 'Lista 2' : (lista === 'store' ? 'Lista 1' : lista);
    const listaBadge = friendlyLista
      ? `<span class="qmeta-lista${lista === 'lago' ? ' alt' : ''}">${friendlyLista}</span>`
      : '';
    // QR de reescaneo (ver infrastructure/quote-qr.js): codifica el id
    // interno de la cotización — al escanearlo meses después la busca en
    // la nube y la reconstruye con los precios ACTUALES del catálogo.
    const qrSvg = (typeof buildQuoteIdQrSvg === 'function' && quoteId) ? buildQuoteIdQrSvg(quoteId) : '';
    const qrHtml = qrSvg ? `<div class="qnum-qr" title="Escanéala para regenerar esta cotización con los precios actuales">${qrSvg}<span class="qnum-qr-cap">Certificado</span></div>` : '';
    return `<div class="qtopbar"></div>
    <div class="qhdr">
      <div class="qlogo">${(function(){
        // El logo puede venir de Firestore (config/branding.logoUrl): se valida
        // antes de meterlo en el src y además se escapa.
        var src = safeImgSrc(T.brandLogoSrc());
        // Sin logo cargado se muestra el nombre de la marca. La palabra "Logo"
        // como respaldo salía impresa en la cotización del cliente, así que si
        // ni siquiera hay marca resuelta el bloque va vacío.
        var name = (window._slBranding || {}).brandName || '';
        if (src) return '<img src="' + esc(src) + '" alt="' + esc(name) + '">';
        return name ? '<span class="qlogo-txt">' + name.replace(/</g,'&lt;') + '</span>' : '';
      })()}</div>
      <div class="qcontact">
        ${waBlock}
        <div class="qdate">${today}</div>
      </div>
      <div class="qnumbox">
        <div class="qnumbox-txt"><span class="qnum-hash">Cotización</span><span class="qnum-n">${quoteDisplayNum(numCot, asesor, window._slAsesorLetter)}</span></div>
        ${qrHtml}
      </div>
    </div>
    <div class="qmeta">
      <span class="qmeta-cliente"><strong>Cliente:</strong> ${esc(cliente)}</span>
      <span class="qmeta-asesor"><strong>Asesor:</strong> ${esc(asesor)}</span>
      ${listaBadge}
    </div>`;
  },

  quoteDisclaimer(showIvaInQuote, totalExcluido, totalGravado) {
    let ivaText = 'Precios finales';
    if (showIvaInQuote) {
      if (totalExcluido > 0 && totalGravado > 0) ivaText = 'Algunos productos excluidos de IVA';
      else if (totalExcluido > 0) ivaText = 'Productos excluidos de IVA';
      else ivaText = 'Todos los precios incluyen IVA 19%';
    }
    return `<div class="qdiscl">Precios y productos sujetos a cambios y/o disponibilidad &middot; ${ivaText}</div>`;
  },

  quoteDiscountBanner(on, pct) {
    if (on && pct < 0) return '';
    return `<div class="disc-banner${on ? ' on' : ''}">&minus;${pct}% Descuento por pago en efectivo / transferencia</div>`;
  },

  quoteTotalCard(calc, showIva, dOn, dPct, rOn) {
    const { totalGravado, totalExcluido, ivaAmount, totalConIva, discountSaved, reteAmount, netoAPagar } = calc;
    let rows = '';
    if (showIva && totalGravado > 0) {
      rows += `<div class="qtc-row"><span class="qtc-label">IVA</span><span class="qtc-val">${fmtCOP(ivaAmount)}</span></div>`;
    }
    if (showIva && totalExcluido > 0 && totalGravado > 0) {
      rows += `<div class="qtc-row excl"><span class="qtc-label">Subtotal</span><span class="qtc-val">${fmtCOP(totalExcluido)}</span></div>`;
    }
    if (dOn && dPct > 0) {
      rows += `<div class="qtc-row disc"><span class="qtc-label">Pago en efectivo o transferencia (−${dPct}%)</span><span class="qtc-val">−${fmtCOP(discountSaved)}</span></div>`;
    }
    rows += `<div class="qtc-row main${rOn ? '" style="border-radius:0' : ''}"><span class="qtc-label">TOTAL</span><span class="qtc-val">${fmtCOP(totalConIva)}</span></div>`;
    if (rOn) {
      rows += `<div class="qtc-row rete"><span class="qtc-label">Retefuente 2.5%</span><span class="qtc-val">−${fmtCOP(reteAmount)}</span></div>`;
      rows += `<div class="qtc-row neto"><span class="qtc-label">NETO A PAGAR</span><span class="qtc-val">${fmtCOP(netoAPagar)}</span></div>`;
    }
    return `<div class="quote-total-card">${rows}</div>`;
  },

  // ── Cotización: bloque de condiciones (columna izquierda del pie) ──
  // `groups` viene de computeWarrantyGroups(): 1 grupo → línea simple;
  // varios → desglose con viñetas (Monitores / Portátiles / Demás productos).
  quoteCond(validez, groups) {
    const icoCheck = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.4 2.4 4.6-5"/></svg>';
    const icoClock = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/></svg>';
    const gs = (groups && groups.length) ? groups : [{ term: '12 meses', byMaker: false }];
    const clause = g => g.byMaker ? ', directamente con el fabricante' : ' por defectos de fabricación';
    let garantiaHtml;
    if (gs.length === 1) {
      garantiaHtml = `<strong>Garantía:</strong> ${esc(gs[0].term)}${clause(gs[0])}`;
    } else {
      const rows = gs.map(g => {
        const note = g.byMaker ? ' (con el fabricante)' : ' por defectos de fabricación';
        return `<span class="qcond-wrow">${esc(g.label)}: ${esc(g.term)}${note}</span>`;
      }).join('');
      garantiaHtml = `<strong>Garantía:</strong><span class="qcond-wgroups">${rows}</span>`;
    }
    const icoTruck = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="14" height="10" rx="1.5"/><path d="M15 10h3.5L21 13.5V17h-6"/><circle cx="6" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/></svg>';
    const envioTxt = S.incluyeEnvio
      ? 'INCLUYE ENVÍO'
      : 'NO INCLUYE ENVÍO<span class="no-envio-note"> &middot; se paga a la transportadora al recibir</span>';
    return `<div class="qcond">
      <div class="qcond-h">Condiciones</div>
      <div class="qcond-list">
        <div class="qcond-item">${icoCheck}<span>${garantiaHtml}</span></div>
        <div class="qcond-item">${icoClock}<span><strong>Validez:</strong> ${esc(validez)}</span></div>
      </div>
      <div class="no-envio${S.incluyeEnvio ? ' si-envio' : ''}" onclick="toggleEnvio()" style="cursor:pointer">${icoTruck}<span>${envioTxt}</span></div>
      <div class="gracias">Gracias por su preferencia</div>
    </div>`;
  },

  // ── Cotización: línea inferior con datos de empresa (NIT / correo / dirección) ──
  quoteFootInfo(cfg) {
    const dot = ' · ';
    let parts = [];
    if (cfg.nit) parts.push('NIT: ' + esc(cfg.nit));
    if (cfg.email) parts.push(esc(cfg.email));
    if (cfg.dir) parts.push(esc(cfg.dir));
    if (!parts.length) return '';
    return `<div class="qfoot-nit">${parts.join(dot)}</div>`;
  },

  // ── Historial ───────────────────────────────────────
  // Estados CRM de una cotización y su color (mismos colores del resto de la app)
  // Colores del tema «gusto»: el texto de cada pastel (cielo, lavanda, menta,
  // rosa). El fondo de la píldora sale de este mismo color con color-mix.
  crmEstados: {
    enviada:    { label: 'Enviada',    color: '#1B3A86' },
    negociando: { label: 'Negociando', color: '#3F3470' },
    vendida:    { label: 'Vendida',    color: '#1F5A3C' },
    perdida:    { label: 'Perdida',    color: '#6F2A47' }
  },

  // Tarjeta del historial (rediseño, paso 5). El cliente va primero: a la gente
  // se la recuerda por el nombre, no por el número. Una acción principal (Cargar)
  // y las demás en segundo plano; borrar queda aparte, a la derecha. El
  // seguimiento se abre desde la píldora de estado (era un botón repetido). Si la
  // cotización lleva días sin respuesta y hay teléfono, «Escribirle» abre
  // WhatsApp con el mensaje listo (menos pasos = más seguimientos hechos).
  histItem(x, i) {
    const estKey = x.estado || 'enviada';
    const est = T.crmEstados[estKey] || T.crmEstados.enviada;
    const needsFU = (typeof _histNeedsFollowUp === 'function') && _histNeedsFollowUp(x);
    const wouldNeedFU = (est.label && (estKey === 'enviada' || estKey === 'negociando'))
      && x.estadoUpdatedAt && (Date.now() - x.estadoUpdatedAt) >= (typeof FOLLOWUP_DIAS !== 'undefined' ? FOLLOWUP_DIAS : 2) * 86400000;
    const dias = x.estadoUpdatedAt ? Math.floor((Date.now() - x.estadoUpdatedAt) / 86400000) : 0;
    const telDigits = String(x.clienteTel || '').replace(/\D/g, '');
    const numTxt = quoteDisplayNum(x.num, x.asesor, x.letra);
    const nombre = x._piiLocked
      ? '<span class="hlocked" title="Los datos del cliente están cifrados y este dispositivo no tiene la llave">Datos cifrados</span>'
      : (x.cliente ? esc(x.cliente) : '<span class="hsin-cliente">Sin nombre de cliente</span>');
    const primerNombre = x._piiLocked ? '' : String(x.cliente || '').trim().split(/\s+/)[0];
    const msgRetomar = 'Hola' + (primerNombre ? ' ' + primerNombre : '') + ', ¿pudiste revisar la cotización #' + numTxt + '? Si quieres, te la aparto o la ajustamos.';
    const escribir = (needsFU && telDigits)
      ? `<a class="hbtn hbtn-wa" href="https://wa.me/57${telDigits}?text=${esc(encodeURIComponent(msgRetomar))}" target="_blank" rel="noopener" title="Abrir WhatsApp con un mensaje para retomar">Escribirle</a>`
      : '';
    return `<div class="hitem${needsFU ? ' hitem-fu' : ''}">
      <div class="hitem-top">
        <div class="hcliente">${nombre}</div>
        <div class="htotal">${fmtCOP(x.total)}</div>
      </div>
      <div class="hitem-tags">
        <button class="hest" style="--est:${est.color}" onclick="toggleHistCrm(${i})" title="Estado de la venta — clic para editar el seguimiento" aria-label="${est.label}: editar seguimiento">${est.label}</button>
        ${needsFU ? `<span class="hfu-tag" title="Sin movimiento hace ${dias} días">${dias} días sin respuesta</span>` : ''}
        ${!needsFU && x.followUpSnoozed && wouldNeedFU ? `<span class="hfu-tag hfu-tag-snoozed" title="El aviso de seguimiento está silenciado para esta cotización">aviso silenciado</span>` : ''}
      </div>
      <div class="hmeta"><span class="hnum">#${esc(numTxt)}</span> &middot; ${esc(x.asesor)} &middot; ${esc(x.date)} ${esc(x.time || '')} &middot; ${Array.isArray(x.items) ? x.items.length : 0} prod.${telDigits ? ` &middot; <a class="htel" href="https://wa.me/57${telDigits}" target="_blank" rel="noopener" title="Abrir chat de WhatsApp">${esc(x.clienteTel)}</a>` : ''}</div>
      ${x.crmNotas ? `<div class="hcrm-nota">${esc(x.crmNotas)}</div>` : ''}
      <div class="hbtns">
        ${escribir}
        <button class="hbtn hbtn-main" onclick="loadHist(${i})">Cargar</button>
        <button class="hbtn" onclick="dupHist(${i})">Duplicar</button>
        <button class="hbtn" onclick="refreshHistPricesByIdx(${i})" title="Busca cada producto de esta cotización en el catálogo actual y te deja elegir cuáles importar con el precio de hoy">Precios de hoy</button>
        <button class="hbtn del" onclick="delHist(${i})" title="Borrar esta cotización" aria-label="Borrar esta cotización">&times;</button>
      </div>
      ${T.histCrmEditor(x, i)}
    </div>`;
  },

  // Editor de seguimiento inline (plegado por defecto dentro de cada .hitem)
  histCrmEditor(x, i) {
    const cur = x.estado || 'enviada';
    const btns = Object.keys(T.crmEstados).map(k => {
      const e = T.crmEstados[k];
      return `<button class="hest-opt${k === cur ? ' on' : ''}" style="--est:${e.color}" onclick="setHistEstado(${i},'${k}')">${e.label}</button>`;
    }).join('');
    return `<div class="hcrm" id="hcrm-${i}" style="display:none">
      <div class="hcrm-row">${btns}</div>
      <input type="text" class="hcrm-inp" id="hcrmTel-${i}" placeholder="WhatsApp del cliente" value="${esc(x.clienteTel || '')}">
      <textarea class="hcrm-inp" id="hcrmNotas-${i}" rows="2" placeholder="Notas de seguimiento (qué dijo, cuándo volver a escribirle…)">${esc(x.crmNotas || '')}</textarea>
      <div class="hcrm-foot">
        <button class="hbtn hcrm-save" onclick="saveHistCrm(${i})">Guardar seguimiento</button>
        <button class="hbtn hcrm-snooze" onclick="toggleFollowUpSnooze(${i})" title="${x.followUpSnoozed ? 'Vuelve a avisar cuando pasen 2 días sin movimiento' : 'No mostrar el aviso de «sin respuesta» para esta cotización'}">${x.followUpSnoozed ? 'Reactivar aviso' : 'Silenciar aviso'}</button>
      </div>
    </div>`;
  },

  // Card solo-lectura para la vista admin "Todos los vendedores".
  // Estos documentos los escribe cualquier cuenta (ver FIRESTORE_RULES_CRM.md):
  // TODO lo que venga de x se escapa, incluidos número, fecha y hora, y el id
  // va con escJsAttr porque termina dentro de un onclick.
  histItemTeam(x) {
    const est = T.crmEstados[x.estado || 'enviada'] || T.crmEstados.enviada;
    return `<div class="hitem">
      <div class="hitem-top">
        <div class="hitem-tags">
          <div class="hnum">#${esc(quoteDisplayNum(x.num, x.asesor, x.letra))}</div>
          <span class="hest" style="--est:${est.color};cursor:default">${est.label}</span>
        </div>
        <div class="htotal">${fmtCOP(x.total)}</div>
      </div>
      <div class="hmeta">${x._piiLocked ? '<span class="hlocked" title="Los datos del cliente están cifrados y este dispositivo no tiene la llave">Datos cifrados</span>' : esc(x.cliente)} &middot; ${esc(x.asesor)}</div>
      ${x.crmNotas ? `<div class="hcrm-nota">${esc(x.crmNotas)}</div>` : ''}
      <div class="hdate">${esc(x.date)} ${esc(x.time || '')} &middot; ${Array.isArray(x.items) ? x.items.length : 0} prod. &middot; ${esc(x.email || '')}</div>
      <div class="hbtns">
        <button class="hbtn" onclick="refreshHistPricesById('${escJsAttr(x.id)}')" title="Busca cada producto de esta cotización en el catálogo actual y te deja elegir cuáles importar con el precio de hoy">Actualizar precios</button>
      </div>
    </div>`;
  },

  // Barra segmentada de filtros por estado (arriba de la lista del historial)
  histFilterBar(filtro, followCount, teamMode) {
    const opts = [
      ['todas', 'Todas'],
      ['seguimiento', 'Para retomar' + (followCount ? ' (' + followCount + ')' : '')],
      ['enviada', 'Enviadas'],
      ['negociando', 'Negociando'],
      ['vendida', 'Vendidas'],
      ['perdida', 'Perdidas']
    ];
    const pills = opts.map(o =>
      `<button class="hseg-btn${filtro === o[0] ? ' active' : ''}${o[0] === 'seguimiento' && followCount ? ' hseg-fu' : ''}" onclick="setHistFilter('${o[0]}')">${o[1]}</button>`
    ).join('');
    // Silenciar todas de una vez: solo tiene sentido viendo el propio seguimiento
    // (no en la vista admin "Todos los vendedores", que es de otra persona).
    const bulk = (!teamMode && filtro === 'seguimiento' && followCount > 0)
      ? `<button class="hseg-btn hseg-bulk" onclick="bulkSnoozeFollowUps()" title="Silencia el aviso de las ${followCount} cotizaciones pendientes, sin cambiar su estado">Silenciar todas (${followCount})</button>`
      : '';
    return pills + bulk;
  },

  // ── Comparar A vs B ─────────────────────────────────
  compareEmpty() {
    return `<div style="text-align:center;padding:60px 20px;color:var(--gray-400);background:#fff;border-radius:14px;border:1.5px dashed var(--gray-200)">
      <div style="font-size:32px;margin-bottom:12px;color:var(--gray-300)"><span class="ico" style="width:32px;height:32px"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg></span></div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">Sin comparaciones aún</div>
      <div style="font-size:12px">Arma una cotización, luego usa los botones para guardarla como Opción A o B</div>
    </div>`;
  },

  compareSlot(slot, snap) {
    const cls = slot === 'A' ? 'a' : 'b';
    return `<div class="cmp-doc-label ${cls}">
      <span>OPCIÓN ${slot} · ${esc(snap.label)}</span>
      <span style="font-family:var(--mono);font-size:12px">${fmtCOP(snap.total)}</span>
    </div>
    <div style="transform:scale(0.72);transform-origin:top left;width:calc(100%/0.72);margin-bottom:calc(-28% * 1)">${snap.html}</div>`;
  },

  compareDivider(diff) {
    const sign = diff > 0 ? '+' : '';
    return `<div class="cmp-divider">···· DIFERENCIA: ${sign}${fmtCOP(diff)} ····</div>`;
  },

  // ── Siigo / Facturación ─────────────────────────────
  siigoRow(L, i, fmtNetFn) {
    const it = L.item;
    const uSin = L.unitSinIva;
    const nStr = fmtNetFn(uSin);
    const vid = 'nv' + i;
    return `<tr>
      <td class="st-n">${i + 1}</td>
      <td class="st-sku" style="padding:8px 10px;cursor:pointer" onclick="copySku('${escJsAttr(it.sku)}')">${esc(it.sku)}</td>
      <td class="st-name" style="padding:8px 10px" title="${esc(it.name)}">${esc(it.name)}</td>
      <td style="text-align:center;padding:8px;font-family:var(--mono);font-size:11px">${it.qty}</td>
      <td class="st-orig" style="padding:8px 10px" onclick="navigator.clipboard.writeText('${Math.round(L.lineTotal)}');showToast('Precio copiado')">${fmtCOP(L.lineTotal)}</td>
      <td style="text-align:right;padding:8px 10px" colspan="2">
        <span class="net-val" id="${vid}" onclick="copyNet(${uSin},'${vid}')">${nStr}</span>
      </td>
    </tr>${it.note ? `<tr><td colspan="7" style="padding:0 10px 5px 36px;font-size:9px;color:#475569;font-style:italic">${esc(it.note)}</td></tr>` : ''}`;
  },

  siigoSummary(tItems, tCon, tSin, tIva, calc, rOn) {
    let html = `
      <div class="bsum-card"><div class="bsum-lbl">Ítems</div><div class="bsum-val blue">${tItems}</div></div>
      <div class="bsum-card"><div class="bsum-lbl">Total</div><div class="bsum-val">${fmtCOP(tCon)}</div></div>`;
    if (rOn) {
      html += `
        <div class="bsum-card"><div class="bsum-lbl">Retefuente 2.5%</div><div class="bsum-val" style="color:#92400e">&minus;${fmtCOP(calc.reteAmount)}</div></div>
        <div class="bsum-card" style="border-color:rgba(146,64,14,0.3);background:#fffbf5"><div class="bsum-lbl">Neto a Pagar</div><div class="bsum-val" style="color:#78350f">${fmtCOP(calc.netoAPagar)}</div></div>`;
    } else {
      html += `
        <div class="bsum-card"><div class="bsum-lbl">Sin IVA</div><div class="bsum-val green">${fmtCOP(tSin)}</div></div>
        <div class="bsum-card"><div class="bsum-lbl">IVA 19%</div><div class="bsum-val amber">${fmtCOP(tIva)}</div></div>`;
    }
    return html;
  },

  // ── Scan modal ──────────────────────────────────────
  scanSummaryPills(results, found, notFound, priceUp, priceDown, same, mismatchCount) {
    return [
      `<span class="scan-pill info">${results.length} productos en imagen</span>`,
      found ? `<span class="scan-pill ok">${icon('check', 'ico-xs')} ${found} en catálogo</span>` : '',
      notFound ? `<span class="scan-pill err">${icon('x', 'ico-xs')} ${notFound} no encontrado${notFound > 1 ? 's' : ''}</span>` : '',
      mismatchCount ? `<span class="scan-pill warn">${mismatchCount} SKU diferente</span>` : '',
      priceUp ? `<span class="scan-pill warn">↑ ${priceUp} subieron</span>` : '',
      priceDown ? `<span class="scan-pill ok">↓ ${priceDown} bajaron</span>` : '',
      same ? `<span class="scan-pill" style="background:var(--gray-100);color:var(--gray-500)">= ${same} sin cambio</span>` : '',
    ].join('');
  },

  scanRowFound(r, i) {
    if (r.mismatch) return this.scanRowMismatch(r, i);
    let diffLabel, diffCls;
    if (r.fromQr) { diffLabel = 'Desde QR'; diffCls = ''; }
    else if (r.diff > 0) { diffLabel = '+' + r.diffPct + '% +' + fmtCOP(r.diff * 1000); diffCls = 'up'; }
    else if (r.diff < 0) { diffLabel = r.diffPct + '% ' + fmtCOP(r.diff * 1000); diffCls = 'down'; }
    else { diffLabel = 'Sin cambio'; diffCls = 'same'; }
    const rowCls = r.diff > 0 ? 'row-warn' : r.diff < 0 ? 'row-ok' : '';
    const oldPriceCell = r.fromQr
      ? '<span style="color:var(--gray-400)">&mdash;</span>'
      : `<span class="price-old">${fmtCOP(r.oldPrice * 1000)}</span>`;
    return `<tr class="${rowCls}" id="srow-${i}">
      <td><input type="checkbox" class="scan-chk scan-item-chk" checked data-idx="${i}" onchange="scanUpdateCount()"></td>
      <td><span class="badge-sku">${esc(r.sku)}</span></td>
      <td style="font-weight:500">${esc(r.name)}${r.qty > 1 ? ` <span style="font-size:10px;color:var(--gray-400);font-weight:400">x${r.qty}</span>` : ''}</td>
      <td class="r">${oldPriceCell}</td>
      <td class="r"><span class="price-new">${fmtCOP(r.newPrice * 1000)}</span></td>
      <td class="r"><span class="price-diff ${diffCls}">${diffLabel}</span></td>
      <td></td>
    </tr>`;
  },

  scanRowMismatch(r, i) {
    return `<tr class="row-mismatch" id="srow-${i}">
      <td><input type="checkbox" class="scan-chk scan-item-chk" data-idx="${i}" onchange="scanUpdateCount()"></td>
      <td><span class="badge-sku">${esc(r.sku)}</span></td>
      <td>
        <div style="font-weight:500;color:#92400e">${esc(r.name)}</div>
        <div style="font-size:9.5px;color:#b45309;margin-top:2px">En imagen: <em>${esc(r.scannedName)}</em></div>
        <div style="font-size:9px;color:#d97706;margin-top:1px">El SKU podría no corresponder a este producto</div>
      </td>
      <td class="r"><span class="price-old">${fmtCOP(r.oldPrice * 1000)}</span></td>
      <td class="r"><span class="price-new">${fmtCOP(r.newPrice * 1000)}</span></td>
      <td class="r"><span class="badge-mismatch">SKU diferente</span></td>
      <td></td>
    </tr>`;
  },

  scanRowNotFound(r) {
    const oldPriceCell = r.fromQr
      ? '<span style="color:var(--gray-400)">&mdash;</span>'
      : `<span class="price-old">${fmtCOP(r.oldPrice * 1000)}</span>`;
    return `<tr class="row-err">
      <td><input type="checkbox" class="scan-chk" disabled></td>
      <td><span class="badge-sku">${esc(r.sku)}</span></td>
      <td style="color:var(--gray-500);font-style:italic">${esc(r.name)}</td>
      <td class="r">${oldPriceCell}</td>
      <td class="r" colspan="2"><span class="badge-notfound">${icon('x', 'ico-xs')} No disponible en catálogo</span></td>
      <td></td>
    </tr>`;
  },

  // ── Smart Quote Modal Rows ─────────────────────────
  smartQuoteRow(r, i) {
    if (r.matchType === 'none' || !r.catItem) {
      return `<tr class="row-err">
        <td><input type="checkbox" class="scan-chk" disabled></td>
        <td style="font-weight:500;color:var(--gray-500)">${esc(r.imageProduct)}${r.qty > 1 ? ' <span style="font-size:10px;color:var(--gray-400)">x' + r.qty + '</span>' : ''}</td>
        <td colspan="3"><span class="badge-notfound">${icon('x', 'ico-xs')} Sin equivalente en catálogo</span>
          ${r.reason ? '<div style="font-size:9px;color:var(--gray-400);margin-top:2px">' + esc(r.reason) + '</div>' : ''}</td>
        <td></td>
      </tr>`;
    }
    var typeBadge = r.matchType === 'exact'
      ? `<span class="sq-badge sq-exact">${icon('check', 'ico-xs')} Exacto</span>`
      : '<span class="sq-badge sq-equiv">\ud83d\udd04 Equivalente</span>';
    var rowCls = r.matchType === 'exact' ? 'row-ok' : 'row-warn';
    return `<tr class="${rowCls}" id="sqrow-${i}">
      <td><input type="checkbox" class="scan-chk sq-item-chk" checked data-idx="${i}" onchange="sqUpdateCount()"></td>
      <td>
        <div style="font-size:10px;color:var(--gray-400);margin-bottom:2px">${esc(r.imageProduct)}</div>
        <div style="font-weight:600;color:var(--gray-900)">${esc(r.matchName)}${r.qty > 1 ? ' <span style="font-size:10px;color:var(--gray-400);font-weight:400">x' + r.qty + '</span>' : ''}</div>
      </td>
      <td><span class="badge-sku">${esc(r.matchSku)}</span></td>
      <td class="r"><span class="price-new">${fmtCOP(r.matchPrice * 1000)}</span></td>
      <td>${typeBadge}
        ${r.reason ? '<div style="font-size:9px;color:var(--gray-400);margin-top:2px">' + esc(r.reason) + '</div>' : ''}</td>
      <td></td>
    </tr>`;
  },

  // ── PC Builder Modal Rows ─────────────────────────
  pcBuilderRow(r, i) {
    return `<tr class="row-ok" id="pcbrow-${i}">
      <td><input type="checkbox" class="scan-chk pcb-item-chk" checked data-idx="${i}" onchange="pcbUpdateCount()"></td>
      <td>
        <div style="font-weight:600;color:var(--gray-900)">${esc(r.name)}${r.qty > 1 ? ' <span style="font-size:10px;color:var(--gray-400);font-weight:400">x' + r.qty + '</span>' : ''}</div>
      </td>
      <td><span class="badge-sku">${esc(r.sku)}</span></td>
      <td class="r"><span class="price-new">${fmtCOP(r.price * 1000)}</span></td>
      <td><div style="font-size:10px;color:var(--gray-500)">${esc(r.reason)}</div></td>
      <td></td>
    </tr>`;
  },

  // ── Live update pills ───────────────────────────────
  itemsSummaryPills(calc) {
    return `<span class="isumm-pill refs">■ ${calc.totalRefs} referencia${calc.totalRefs !== 1 ? 's' : ''}</span>
      <span class="isumm-pill units">■ ${calc.totalUnits} unidad${calc.totalUnits !== 1 ? 'es' : ''}</span>`;
  },

  // ── Billing Breakdown (Ensamblados/Portátiles) ─────
  billingBreakdownPanel(bd, itemIdx, totalConIva) {
    let rows = '';
    // Equipo principal
    rows += `<tr class="bk-row bk-equipo">
      <td><span class="bk-tag excl">EXCL</span></td>
      <td class="bk-sku" onclick="copySku('${escJsAttr(bd.equipo.sku)}')" style="cursor:pointer">${esc(bd.equipo.sku)}</td>
      <td class="bk-name">Equipo principal</td>
      <td class="bk-price"><input type="text" class="bk-inp" value="${bd.equipo.price.toLocaleString('es-CO')}"
        onchange="updateBreakdownEquipo(${itemIdx},this.value)" title="Editar precio equipo"></td>
      <td class="bk-sub">${fmtCOP2(bd.equipo.price)}</td>
      <td class="bk-iva">$ 0</td>
    </tr>`;

    // Companions
    for (var c = 0; c < bd.companions.length; c++) {
      var comp = bd.companions[c];
      var chkId = 'bk-chk-' + itemIdx + '-' + comp.key;
      var ivaTag = comp.iva ? '<span class="bk-tag grav">19%</span>' : '<span class="bk-tag excl">EXCL</span>';
      var subVal = comp.on && comp.price > 0 ? (comp.iva ? fmtCOP2(comp.price / 1.19) : fmtCOP2(comp.price)) : '—';
      var ivaVal = comp.on && comp.price > 0 && comp.iva ? fmtCOP2(comp.price - comp.price / 1.19) : '$ 0';
      rows += `<tr class="bk-row${comp.on ? '' : ' bk-off'}">
        <td>${ivaTag}</td>
        <td><input type="checkbox" id="${chkId}" ${comp.on ? 'checked' : ''}
          onchange="updateBreakdownToggle(${itemIdx},'${comp.key}',this.checked)"></td>
        <td class="bk-name">
          <label for="${chkId}" style="cursor:pointer">${esc(comp.name)}</label>
          <span class="bk-sku-sm">${comp.sku ? 'SKU ' + esc(comp.sku) : ''}</span>
        </td>
        <td class="bk-price"><input type="text" class="bk-inp" value="${comp.price > 0 ? comp.price.toLocaleString('es-CO') : ''}"
          placeholder="Precio" ${!comp.on ? 'disabled' : ''}
          onchange="updateBreakdownPrice(${itemIdx},'${comp.key}',this.value)"></td>
        <td class="bk-sub">${subVal}</td>
        <td class="bk-iva">${comp.on ? ivaVal : '—'}</td>
      </tr>`;
    }

    // Servicio Técnico (residuo)
    rows += `<tr class="bk-row bk-servicio">
      <td><span class="bk-tag grav">19%</span></td>
      <td class="bk-sku" onclick="copySku('${SERVICIO_SKU}')" style="cursor:pointer">${SERVICIO_SKU}</td>
      <td class="bk-name"><strong>SERVICIO TÉCNICO</strong><span class="bk-auto">Auto-calculado</span></td>
      <td class="bk-price" style="font-weight:700;color:#16a34a">${fmtCOP(bd.servicio.price)}</td>
      <td class="bk-sub" style="font-weight:600">${fmtCOP2(bd.servicio.subtotal)}</td>
      <td class="bk-iva">${fmtCOP2(bd.servicio.ivaAmount)}</td>
    </tr>`;

    return `<tr class="bk-panel-row"><td colspan="7">
      <div class="bk-panel">
        <div class="bk-hdr">
          <span>Desglose de facturación</span>
          <span class="bk-total">Total: ${fmtCOP(bd.totalFacturado)}</span>
        </div>
        <table class="bk-table">
          <thead><tr>
            <th style="width:40px">IVA</th><th style="width:60px"></th><th>Concepto</th>
            <th style="width:110px">Total</th><th style="width:100px">Subtotal</th><th style="width:90px">IVA</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="bk-foot">
          <button class="bbtn bbtn-dark" style="font-size:11px;padding:6px 14px" onclick="copyBreakdown(${itemIdx})">
            Copiar desglose para SIIGO
          </button>
          ${bd.servicio.price < 0 ? '<span class="bk-warn">El servicio técnico es negativo — ajusta los precios</span>' : ''}
        </div>
      </div>
    </td></tr>`;
  },

  // ── Drive Billing Panel (Ensamblados/Portátiles) ───
  drivePanel(item, idx) {
    const sku = esc(item.sku);
    // La hoja es la que configuró la empresa (ver _driveSheetUrl en services.js).
    // Antes estaba quemada la hoja interna de un cliente anterior.
    const driveUrl = (typeof _driveSheetUrl === 'function') ? _driveSheetUrl() : '';
    return `<tr class="bk-panel-row"><td colspan="7">
      <div class="drive-panel">
        <div class="drive-panel-hdr">
          <div>
            
            <strong>Facturación Drive</strong>
            <span class="drive-sku-badge">SKU ${sku}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="bbtn bbtn-ghost" style="font-size:11px;padding:4px 10px" onclick="loadDriveIframe(${idx})">Cargar hoja</button>
            ${driveUrl ? `<a href="${esc(driveUrl)}" target="_blank" rel="noopener noreferrer" class="drive-link">Abrir en Drive ↗</a>` : ''}
          </div>
        </div>
        <div id="drive-iframe-${idx}" class="drive-iframe-wrap" data-sku="${sku}">
          <div class="drive-placeholder" onclick="loadDriveIframe(${idx})">
            <span class="drive-icon-svg"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
            <div>Clic para cargar la hoja de facturación</div>
          </div>
        </div>
      </div>
    </td></tr>`;
  },

  laptopBillingToggle(idx, useDrive) {
    return `<tr class="bk-panel-row"><td colspan="7">
      <div class="drive-toggle-bar">
        <span style="font-size:11px;color:var(--gray-500)">Facturación:</span>
        <button class="drive-toggle-btn ${!useDrive ? 'active' : ''}" onclick="if(S.laptopDriveMode[${idx}]){toggleLaptopDrive(${idx})}">SIIGO convencional</button>
        <button class="drive-toggle-btn ${useDrive ? 'active' : ''}" onclick="if(!S.laptopDriveMode[${idx}]){toggleLaptopDrive(${idx})}">Drive pre-armado</button>
      </div>
    </td></tr>`;
  }
};
