// ============================================================
// CHECKLIST DE COMPONENTES DE PC
// ============================================================
// Evalúa en tiempo real si la cotización contiene partes de PC
// y muestra un checklist visual de los componentes esenciales:
//   1. Procesador
//   2. Board
//   3. Memoria RAM
//   4. Almacenamiento
//   5. Fuente de Poder
//   6. Caja / Chasis
//   7. Disipador / Refrigeración
//
// Incluye avisos inteligentes (CPU sin cooler de fábrica, CPU sin
// video integrado sin tarjeta gráfica dedicada).
//
// Globales expuestos:
//   renderPcChecklist()       — Recalcula y renderiza el checklist
//   togglePcChecklistExpand() — Alterna colapso/expansión
// ============================================================

(function () {
  var _expanded = true;

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Determina la categoría real de un ítem.
   */
  function _getCatOf(item) {
    if (!item) return 'ADICIONAL';
    if (item._cat) return item._cat;
    if (typeof getCat === 'function') return getCat(item.name);
    return 'ADICIONAL';
  }

  /**
   * Comprueba si el procesador no incluye refrigerador de fábrica.
   */
  function _cpuNeedsCooler(cpuItems) {
    if (!cpuItems || !cpuItems.length) return false;
    return cpuItems.some(function (it) {
      var n = String(it.name || '').toLowerCase();
      if (/(7800x3d|7900x3d|7950x3d|9800x3d|9900x|9950x|7700x|7900x|7950x|5800x3d|5700x3d|5900x|5950x|5800x)\b/i.test(n)) return true;
      if (/ryzen\s*[79]\s*\d{4}x/i.test(n)) return true;
      if (/i[79]-?\d{4,5}k/i.test(n)) return true;
      if (/\b(12700|12900|13700|13900|14700|14900)[kK]/i.test(n)) return true;
      if (/ultra\s*[79]/i.test(n)) return true;
      if (/sin\s*(disipador|cooler|refrigeracion|refrigeración)|without\s*fan/i.test(n)) return true;
      return false;
    });
  }

  /**
   * Comprueba si el procesador requiere gráfica dedicada por no tener video integrado.
   */
  function _cpuNeedsGpu(cpuItems) {
    if (!cpuItems || !cpuItems.length) return false;
    return cpuItems.some(function (it) {
      var n = String(it.name || '').toLowerCase();
      if (/\bi[3579]-?\d{4,5}k?f\b/i.test(n)) return true;
      if (/\b7500f\b/i.test(n)) return true;
      if (/sin\s*gr[aá]ficos|no\s*graphics/i.test(n)) return true;
      return false;
    });
  }

  /**
   * Renderiza el componente de checklist en `#secPcChecklist`
   */
  function renderPcChecklist() {
    var container = document.getElementById('secPcChecklist');
    if (!container) return;

    var currentItems = (typeof items !== 'undefined' && Array.isArray(items)) ? items : (window.S && window.S.items) || [];
    if (!currentItems || !currentItems.length) {
      container.style.display = 'none';
      return;
    }

    var byCat = {
      PROCESADOR: [],
      BOARD: [],
      MEMORIA: [],
      ALMACENAMIENTO: [],
      FUENTE: [],
      CAJA: [],
      DISIPADOR: [],
      GRÁFICA: [],
      ENSAMBLADO: []
    };

    for (var i = 0; i < currentItems.length; i++) {
      var c = _getCatOf(currentItems[i]);
      if (byCat[c]) {
        byCat[c].push(currentItems[i]);
      }
    }

    var hasEnsamblado = byCat.ENSAMBLADO.length > 0;
    var countCoreCats = 0;
    var catsToCheck = ['PROCESADOR', 'BOARD', 'MEMORIA', 'ALMACENAMIENTO', 'FUENTE', 'CAJA', 'DISIPADOR', 'GRÁFICA'];
    catsToCheck.forEach(function (catKey) {
      if (byCat[catKey].length > 0) countCoreCats++;
    });

    var isPcQuote = hasEnsamblado || countCoreCats >= 2;

    if (!isPcQuote) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    var cpuReqCooler = _cpuNeedsCooler(byCat.PROCESADOR);
    var cpuReqGpu = _cpuNeedsGpu(byCat.PROCESADOR);

    var checklist = [
      {
        key: 'PROCESADOR',
        label: 'Procesador',
        present: byCat.PROCESADOR.length > 0 || hasEnsamblado,
        items: byCat.PROCESADOR,
        required: true
      },
      {
        key: 'BOARD',
        label: 'Board / Placa Madre',
        present: byCat.BOARD.length > 0 || hasEnsamblado,
        items: byCat.BOARD,
        required: true
      },
      {
        key: 'MEMORIA',
        label: 'Memoria RAM',
        present: byCat.MEMORIA.length > 0 || hasEnsamblado,
        items: byCat.MEMORIA,
        required: true
      },
      {
        key: 'ALMACENAMIENTO',
        label: 'Almacenamiento SSD',
        present: byCat.ALMACENAMIENTO.length > 0 || hasEnsamblado,
        items: byCat.ALMACENAMIENTO,
        required: true
      },
      {
        key: 'DISIPADOR',
        label: 'Disipador / Cooler',
        present: byCat.DISIPADOR.length > 0 || hasEnsamblado,
        items: byCat.DISIPADOR,
        required: cpuReqCooler,
        warnMsg: cpuReqCooler && byCat.DISIPADOR.length === 0 ? 'CPU sin cooler de fábrica' : null,
        infoMsg: !cpuReqCooler && byCat.DISIPADOR.length === 0 ? 'Incluido en caja de CPU' : null
      },
      {
        key: 'FUENTE',
        label: 'Fuente de Poder',
        present: byCat.FUENTE.length > 0 || hasEnsamblado,
        items: byCat.FUENTE,
        required: true
      },
      {
        key: 'CAJA',
        label: 'Caja / Chasis',
        present: byCat.CAJA.length > 0 || hasEnsamblado,
        items: byCat.CAJA,
        required: true
      },
      {
        key: 'GRÁFICA',
        label: 'Tarjeta Gráfica',
        present: byCat.GRÁFICA.length > 0 || hasEnsamblado,
        items: byCat.GRÁFICA,
        required: cpuReqGpu,
        warnMsg: cpuReqGpu && byCat.GRÁFICA.length === 0 ? 'CPU sin video integrado' : null,
        infoMsg: !cpuReqGpu && byCat.GRÁFICA.length === 0 ? 'Video integrado en CPU' : null
      }
    ];

    var missingCount = 0;
    for (var k = 0; k < checklist.length; k++) {
      var chk = checklist[k];
      if (chk.required && !chk.present) {
        missingCount++;
      }
    }

    var isComplete = missingCount === 0;

    var badgeText = isComplete
      ? 'PC Completo'
      : 'Incompleto (' + missingCount + ' faltante' + (missingCount > 1 ? 's' : '') + ')';
    var badgeClass = isComplete ? 'pcc-badge-ok' : 'pcc-badge-warn';

    var rowsHtml = '';
    for (var r = 0; r < checklist.length; r++) {
      var item = checklist[r];
      var statusClass = '';
      var iconSymbol = '';
      var detailText = '';

      if (item.present) {
        statusClass = 'pcc-ok';
        iconSymbol = '✓';
        var firstItem = item.items[0];
        detailText = firstItem ? firstItem.name : 'Incluido';
        if (item.items.length > 1) {
          detailText += ' (' + item.items.length + ')';
        }
      } else if (item.required) {
        statusClass = 'pcc-miss';
        iconSymbol = '!';
        detailText = item.warnMsg ? item.warnMsg : 'Requerido';
      } else {
        statusClass = 'pcc-opt';
        iconSymbol = '•';
        detailText = item.infoMsg ? item.infoMsg : 'Opcional';
      }

      rowsHtml += '<div class="pcc-row ' + statusClass + '">' +
        '<span class="pcc-status-ico">' + iconSymbol + '</span>' +
        '<div class="pcc-info">' +
          '<span class="pcc-label">' + _escHtml(item.label) + '</span>' +
          '<span class="pcc-detail" title="' + _escHtml(detailText) + '">' + _escHtml(detailText) + '</span>' +
        '</div>' +
      '</div>';
    }

    var content = '<div class="pcc-card">' +
      '<div class="pcc-header" onclick="togglePcChecklistExpand()">' +
        '<div class="pcc-title-wrap">' +
          '<span class="pcc-main-ico">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="4" y="2" width="16" height="20" rx="2"></rect>' +
              '<line x1="8" y1="6" x2="16" y2="6"></line>' +
              '<line x1="16" y1="14" x2="16" y2="14"></line>' +
              '<path d="M12 18h.01"></path>' +
            '</svg>' +
          '</span>' +
          '<span class="pcc-title">Checklist de PC</span>' +
        '</div>' +
        '<div class="pcc-right-wrap">' +
          '<span class="pcc-badge ' + badgeClass + '">' + badgeText + '</span>' +
          '<span class="pcc-chevron ' + (_expanded ? 'open' : '') + '">&#9662;</span>' +
        '</div>' +
      '</div>' +
      '<div class="pcc-body" style="display:' + (_expanded ? 'block' : 'none') + '">' +
        rowsHtml +
      '</div>' +
    '</div>';

    container.innerHTML = content;
  }

  function togglePcChecklistExpand() {
    _expanded = !_expanded;
    renderPcChecklist();
  }

  window.renderPcChecklist = renderPcChecklist;
  window.togglePcChecklistExpand = togglePcChecklistExpand;
})();
