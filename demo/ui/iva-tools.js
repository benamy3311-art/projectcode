// ============================================================
// CALCULADORA IVA (pestaña "Calculadora IVA" — panel-i)
// ============================================================
// Dos herramientas independientes de la misma pestaña:
//  (1) Extractor bulk: pegar una remisión/orden completa, detecta
//      SKU + precio por línea y calcula base/IVA de cada producto.
//  (2) Calculadora rápida: un solo valor con IVA -> base + IVA.
//
// Ambas calculan con la misma fórmula que Facturación SIIGO
// (domain.js calcEngine: unitSinIva = round2(precio / 1.19)) y copian
// al portapapeles en el mismo formato que allí (fmtNet), para que lo
// pegado en SIIGO sea idéntico venga de donde venga.
//
// Globales que expone (window.*):
//   calcQuickIva(val)          — recalcula la calculadora rápida
//   copyQuickIvaVal(type,el)   — copia base/iva de la calculadora rápida
//   clearQuickIva()            — limpia la calculadora rápida
//   applyQuickIvaDiscount()    — aplica el % de #qivaDiscPct al valor con IVA
//   extProcess()              — recalcula el extractor bulk
//   extBulkCopy(n, el)        — copia un valor de una fila del bulk
//   extCopySku(el, code)      — copia el SKU de una fila del bulk
//   extBulkCopyAll()          — copia todas las filas (SKU/base/iva) para SIIGO
//
// Depende de: domain.js (round2, fmtCOP2, extractExt), application/state.js
//             (S.extBulkRate), application/services.js (fmtNet — respeta
//             S.billingFmt), application/templates.js (icon), ui/ui.js (showToast)
// Requiere DOM: #quickIvaInput/#quickIvaBase/#quickIvaAmount,
//               #extBulkInput/#extBulkResults/#extBulkStatus/#extBulkSummary/
//               #extBulkBody/#extBulkTotals
// ============================================================
(function () {

  // ── Calculadora rápida (un valor -> base + IVA) ──────────────
  var _quickIvaBaseVal = 0;
  var _quickIvaAmountVal = 0;

  window.calcQuickIva = function (val) {
    var input = document.getElementById('quickIvaInput');
    var baseEl = document.getElementById('quickIvaBase');
    var amountEl = document.getElementById('quickIvaAmount');
    if (!input || !baseEl || !amountEl) return;

    var raw = String(val || '').replace(/\D/g, '');
    if (!raw || Number(raw) <= 0) {
      _quickIvaBaseVal = 0;
      _quickIvaAmountVal = 0;
      input.value = '';
      baseEl.textContent = '$ 0';
      amountEl.textContent = '$ 0';
      return;
    }

    var num = Number(raw);
    input.value = num.toLocaleString('es-CO');

    // Misma fórmula que Facturación SIIGO (domain.js calcEngine: unitSinIva/lineIva),
    // redondeada a 2 decimales en vez de al peso — para que el resultado y lo
    // que se copia coincidan exactamente con lo que SIIGO calcularía para ese total.
    var base = round2(num / 1.19);
    var iva = round2(num - base);
    _quickIvaBaseVal = base;
    _quickIvaAmountVal = iva;

    var fmtOpts = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    baseEl.textContent = '$ ' + base.toLocaleString('es-CO', fmtOpts);
    amountEl.textContent = '$ ' + iva.toLocaleString('es-CO', fmtOpts);
  };

  // Copia el valor con el mismo formato que Facturación SIIGO (fmtNet: respeta
  // el toggle SIIGO/CO de S.billingFmt) y da el mismo feedback visual que copyNet.
  window.copyQuickIvaVal = function (type, el) {
    var val = type === 'base' ? _quickIvaBaseVal : _quickIvaAmountVal;
    var label = type === 'base' ? 'Base sin IVA' : 'Valor del IVA';
    if (!val || val <= 0) {
      if (typeof showToast === 'function') showToast('Ingresa un valor primero', 'warn');
      return;
    }
    var str = fmtNet(val);
    function done() {
      if (typeof showToast === 'function') showToast(label + ' copiada: ' + str, 'success');
      if (el) {
        var orig = el.textContent;
        el.classList.add('copied');
        el.innerHTML = icon('check', 'ico-xs') + ' copiado';
        setTimeout(function () { el.classList.remove('copied'); el.textContent = orig; }, 1400);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(done).catch(function () { _fallbackCopyText(str, done); });
    } else {
      _fallbackCopyText(str, done);
    }
  };

  function _fallbackCopyText(str, done) {
    var ta = document.createElement('textarea');
    ta.value = str;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    if (typeof done === 'function') done();
  }

  window.clearQuickIva = function () {
    window.calcQuickIva('');
  };

  // Descuento por porcentaje sobre el valor con IVA (no sobre la base):
  // mismo criterio que el descuento del panel de cotización, que también
  // descuenta el precio final y no la base gravable. Redondea al peso,
  // igual que fmtCOP — el resultado queda listo para volver a copiarse.
  window.applyQuickIvaDiscount = function () {
    var input = document.getElementById('quickIvaInput');
    var pctEl = document.getElementById('qivaDiscPct');
    if (!input || !pctEl) return;

    var raw = String(input.value || '').replace(/\D/g, '');
    var actual = raw ? Number(raw) : 0;
    if (!actual) {
      if (typeof showToast === 'function') showToast('Ingresa un valor primero', 'warn');
      return;
    }

    var pct = parseFloat(pctEl.value);
    if (isNaN(pct) || pct <= 0) {
      if (typeof showToast === 'function') showToast('El porcentaje debe ser mayor a 0', 'warn');
      return;
    }

    var nuevo = Math.round(actual * (1 - pct / 100));
    window.calcQuickIva(nuevo);
    if (typeof showToast === 'function') showToast('Descuento del ' + pct + '% aplicado', 'success');
  };

  // ── Extractor bulk (pegar remisión completa) ─────────────────
  window.extProcess = function () {
    let text = document.getElementById('extBulkInput').value;
    let resultsDiv = document.getElementById('extBulkResults');
    let statusEl = document.getElementById('extBulkStatus');
    if (!text.trim()) {
      resultsDiv.style.display = 'none';
      statusEl.textContent = 'Pega texto arriba para empezar';
      return;
    }
    let found = extractExt(text);
    if (!found.length) {
      resultsDiv.style.display = 'none';
      statusEl.style.color = '#d97706';
      statusEl.textContent = 'No se detectaron productos. Cada línea debe empezar con código SKU seguido de guión.';
      return;
    }
    statusEl.style.color = '#16a34a';
    statusEl.textContent = found.length + ' producto' + (found.length > 1 ? 's' : '') + ' detectado' + (found.length > 1 ? 's' : '');
    resultsDiv.style.display = 'block';

    let rate = S.extBulkRate / 100;
    let tConIva = 0, tBase = 0, tIva = 0, rows = '';

    for (let i = 0; i < found.length; i++) {
      let f = found[i];
      let conIva = f.price;                        // price already includes IVA
      let base = (conIva / (1 + rate));
      let ivaVal = conIva - base;
      tConIva += conIva; tBase += base; tIva += ivaVal;

      let baseStr = base.toFixed(2);
      let ivaStr = ivaVal.toFixed(2);
      let conStr = conIva.toFixed(2);

      rows += '<tr style="border-bottom:1px solid var(--gray-100)">' +
        '<td style="padding:8px 10px;font-size:10px;color:var(--gray-400)">' + (i + 1) + '</td>' +
        '<td style="padding:8px 10px"><span class="badge-sku" onclick="extCopySku(this,\'' + esc(f.code || '') + '\')" title="Clic para copiar SKU">' + esc(f.code || '—') + '</span></td>' +
        '<td style="padding:8px 10px;font-size:11.5px;font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(f.desc) + '">' + esc(f.desc) + '</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-size:11px;color:var(--gray-600);cursor:pointer" onclick="extBulkCopy(' + conIva + ',this)" title="Clic para copiar precio con IVA">' + conStr + '</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:var(--blue);cursor:pointer" onclick="extBulkCopy(' + base + ',this)" title="Clic para copiar">' + baseStr + '</td>' +
        '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">' + ivaStr + '</td>' +
        '<td style="padding:8px 4px;text-align:center"><button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--gray-300);padding:2px 4px" onclick="extBulkCopy(' + base + ',this)" title="Copiar base">' + icon('copy', 'ico-xs') + '</button></td>' +
        '</tr>';
    }
    document.getElementById('extBulkBody').innerHTML = rows;

    // Summary pills
    document.getElementById('extBulkSummary').innerHTML =
      '<span class="scan-pill info">' + found.length + ' productos</span>' +
      '<span class="scan-pill ok">Base total: ' + fmtCOP2(tBase) + '</span>' +
      '<span class="scan-pill" style="background:#dcfce7;color:#15803d">IVA total: ' + fmtCOP2(tIva) + '</span>' +
      '<span class="scan-pill info">Total con IVA: ' + fmtCOP2(tConIva) + '</span>';

    // Totals + copy-all button
    let totHtml =
      '<div style="display:flex;flex-direction:column;gap:4px">' +
      '<div style="font-size:11px;color:var(--gray-500)">Total base gravable: <strong style="color:var(--blue);font-family:var(--mono)">' + fmtCOP2(tBase) + '</strong></div>' +
      '<div style="font-size:11px;color:var(--gray-500)">Total IVA ' + S.extBulkRate + '%: <strong style="color:var(--green);font-family:var(--mono)">' + fmtCOP2(tIva) + '</strong></div>' +
      '</div>' +
      '<div style="display:flex;gap:7px;flex-direction:column;align-items:flex-end">' +
      '<button class="bbtn bbtn-dark" style="font-size:11.5px;padding:7px 14px" onclick="extBulkCopyAll()">' +
      icon('copy', 'ico-xs') + ' Copiar todo para SIIGO</button>' +

      '</div>';
    document.getElementById('extBulkTotals').innerHTML = totHtml;
  };

  window.extBulkCopy = function (n, el) {
    let str = n.toFixed(2);  // SIIGO format: 595798.32
    navigator.clipboard.writeText(str).then(function () {
      let orig = el.textContent;
      el.style.color = '#16a34a';
      el.innerHTML = icon('check', 'ico-xs');
      setTimeout(function () { el.textContent = orig; el.style.color = ''; }, 1400);
      showToast('Copiado: ' + str, 'neutral');
    });
  };

  window.extCopySku = function (el, code) {
    if (!code) return;
    code = String(code).replace(/\([^)]+\)/g, '').trim();
    navigator.clipboard.writeText(code).then(function () {
      let orig = el.textContent;
      el.style.background = '#16a34a';
      el.style.color = '#fff';
      el.textContent = 'Copiado';
      setTimeout(function () { el.textContent = orig; el.style.background = ''; el.style.color = ''; }, 1400);
      showToast('SKU copiado: ' + code, 'neutral');
    });
  };

  window.extBulkCopyAll = function () {
    let text = document.getElementById('extBulkInput').value;
    let found = extractExt(text);
    let rate = S.extBulkRate / 100;
    let rows = found.map(function (f) {
      let base = Math.round(f.price / (1 + rate));
      let iva = f.price - base;
      let sku = String(f.code || '-').replace(/\([^)]+\)/g, '').trim();
      return sku + '\t' + f.desc + '\t' + base.toFixed(2) + '\t' + iva.toFixed(2);
    });
    let out = 'Codigo\tDescripcion\tBase\tIVA\n' + rows.join('\n');
    navigator.clipboard.writeText(out).then(function () {
      showToast(found.length + ' filas copiadas para SIIGO', 'success');
    });
  };

})();
