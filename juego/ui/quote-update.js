// ============================================================
// ACTUALIZAR COTIZACIÓN
// ============================================================
// Buscar una cotización por su número (letra + dígitos) y reabrirla con
// los precios de HOY. Cubre el caso de que llegue por WhatsApp solo el
// número, o que el asesor que la hizo no esté. No usa IA: por eso vive
// fuera del bloque "Asistente IA" y se ve para cualquier plan.
//
// Por qué hay un selector y no solo el filtro por letra:
// la letra sale de approved_users.letra y se congela en cada cotización
// al guardarla. Las ANTERIORES a esa función no la tienen y caen a la
// inicial del campo Asesor — y ahí sí chocan: "ANDRES RAMIREZ" y
// "ADMINISTRADOR PLAZA IMPERIAL" arrancan las dos con A, así que cuatro
// cotizaciones distintas se ven todas como "A-66" y pedir la letra no
// desambigua nada. Con el selector se elige por cliente, fecha y total,
// que sí distinguen, sin importar si la cotización es vieja o nueva.
//
// Globales que expone (window.*):
//   lookupQuoteForUpdate()   — lee los inputs y busca (botón "Buscar")
//   _pickQuoteToUpdate(i)    — elige una del selector
//   _closeQuotePicker()      — cierra el selector
//
// Depende de: domain.js (esc, fmtCOP, quoteDisplayNum),
//   services.js (getHist, _openHistPriceRefresh), ui.js (showToast),
//   quotes-sync.js (_slQuotesSync.findByNum) — opcional, sin sesión no hay nube
// Requiere DOM: #scanNumLetter, #scanNumDigits (sección #secQuoteUpdate)
// ============================================================
(function () {
  // Candidatas del último resultado múltiple — el índice viaja en el
  // onclick del selector, así no hay que serializar la cotización entera.
  var _cands = [];

  function _val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function _limpiarInputs() {
    var a = document.getElementById('scanNumLetter'), b = document.getElementById('scanNumDigits');
    if (a) a.value = '';
    if (b) b.value = '';
  }

  // ── Selector cuando hay varias con el mismo número ─────────
  function _overlay() {
    var ov = document.getElementById('qpickOv');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.className = 'scan-ov';
    ov.id = 'qpickOv';
    ov.innerHTML =
      '<div style="position:relative;isolation:isolate">'
      + '<div class="scan-modal" style="max-width:460px">'
      + '<div class="scan-modal-hdr">'
      + '<div><h3 id="qpickTitle"></h3>'
      + '<div class="cap" style="margin-top:2px">Elegí cuál querés reabrir con los precios de hoy</div></div>'
      + '<button class="bclose" onclick="_closeQuotePicker()">&times;</button>'
      + '</div>'
      + '<div class="scan-modal-body" id="qpickList"></div>'
      + '</div></div>';
    document.body.appendChild(ov);
    // Clic fuera del modal = cerrar (mismo gesto que el resto de overlays)
    ov.addEventListener('click', function (e) { if (e.target === ov) window._closeQuotePicker(); });
    return ov;
  }

  function _fila(m, i) {
    var prods = (m.items || []).length;
    var cliente = (m.cliente || '').trim() || 'Sin cliente';
    var asesor = (m.asesor || '').trim() || 'Sin asesor';
    return '<div class="hitem qpick-row" onclick="_pickQuoteToUpdate(' + i + ')">'
      + '<div class="hitem-top">'
      + '<div class="hitem-tags"><div class="hnum">#' + esc(quoteDisplayNum(m.num, m.asesor, m.letra)) + '</div></div>'
      + '<div class="htotal">' + fmtCOP(m.total || 0) + '</div>'
      + '</div>'
      + '<div class="hmeta">' + esc(cliente) + ' &middot; ' + esc(asesor) + '</div>'
      + '<div class="hdate">' + esc(m.date || 'sin fecha') + (m.time ? ' ' + esc(m.time) : '')
      + ' &middot; ' + prods + ' prod.</div>'
      + '</div>';
  }

  function _abrirSelector(matches, digits) {
    _cands = matches;
    var ov = _overlay();
    document.getElementById('qpickTitle').textContent =
      matches.length + ' cotizaciones con el número ' + digits;
    document.getElementById('qpickList').innerHTML =
      matches.map(_fila).join('');
    ov.classList.add('on');
  }

  window._closeQuotePicker = function () {
    var ov = document.getElementById('qpickOv');
    if (ov) ov.classList.remove('on');
  };

  window._pickQuoteToUpdate = function (i) {
    var m = _cands[i];
    if (!m) return;
    window._closeQuotePicker();
    _limpiarInputs();
    _openHistPriceRefresh(m.items);
  };

  // ── Búsqueda ───────────────────────────────────────────────
  // Tres pasos, del más barato al más caro:
  //   1. Historial local (0 lecturas) — cubre lo reciente y propio.
  //   2. Firestore por número (findByNum) — sin ventana de antigüedad:
  //      encuentra la #20 aunque el consecutivo ya vaya en 300.
  //   3. Distingue "no existe" de "las reglas no me dejan leer las de
  //      otros" (ver FIRESTORE_RULES_CRM.md), que si no se confunden.
  window.lookupQuoteForUpdate = async function () {
    var letter = _val('scanNumLetter').toUpperCase().charAt(0);
    var digits = _val('scanNumDigits');
    if (!digits) { showToast('Escribe el número de la cotización, ej: 290', 'warn'); return; }
    var display = (letter ? letter + '-' : '') + digits;
    var digitsInp = document.getElementById('scanNumDigits');

    var pool = getHist().filter(function (x) {
      return String(x.num || '').indexOf(digits) !== -1;
    });
    var denied = false;

    if (window._slQuotesSync && window._slQuotesSync.findByNum) {
      if (digitsInp) digitsInp.disabled = true;
      try {
        var docs = await window._slQuotesSync.findByNum(digits, 25);
        var vistos = {};
        pool.forEach(function (x) { if (x.id) vistos[x.id] = 1; });
        docs.forEach(function (d) {
          if (vistos[d._id]) return; // ya venía del historial local
          pool.push({
            id: d._id, num: d.num, asesor: d.asesor || '', letra: d.letra || '',
            cliente: d.cliente || '', date: d.date || '', time: d.time || '',
            total: d.total || 0, items: d.items || []
          });
        });
      } catch (e) {
        denied = !!(e && (e.code === 'permission-denied' || /permission/i.test(e.message || '')));
        console.warn('[lookupQuoteForUpdate] error buscando en la nube:', e);
      } finally {
        if (digitsInp) digitsInp.disabled = false;
      }
    }

    // La letra es un filtro BLANDO: si con ella no queda nada pero sin
    // ella sí, casi siempre es una cotización anterior a la asignación de
    // letras (lleva la inicial del nombre, no la letra actual del asesor).
    var matches = pool;
    if (letter) {
      var conLetra = pool.filter(function (x) {
        return quoteDisplayNum(x.num, x.asesor, x.letra).toUpperCase().charAt(0) === letter;
      });
      if (conLetra.length) matches = conLetra;
      else if (pool.length) showToast('Ninguna "' + letter + '-' + digits + '" — te muestro las #' + digits + ' que sí existen', 'warn');
    }

    if (!matches.length) {
      showToast(denied
        ? 'No se pudo buscar: faltan permisos en Firestore para ver cotizaciones de otros asesores'
        : 'No se encontró la cotización "' + display + '"', 'error');
      return;
    }
    if (matches.length > 1) { _abrirSelector(matches, digits); return; }
    _limpiarInputs();
    _openHistPriceRefresh(matches[0].items);
  };
})();
