// ============================================================
// ONBOARDING TOUR — Guided step-by-step tutorial
// Vanilla JS spotlight overlay with tooltips
// ============================================================

var Tour = (function () {
    var STORAGE_KEY = 'sl_tour_done';
    var _active = false;
    var _step = 0;
    var _steps = null;      // pasos del tour en curso (default: STEPS)
    var _doneKey = null;    // clave localStorage del tour en curso

    var STEPS = [
        {
            el: '.total-bar',
            title: 'Total en tiempo real',
            text: 'Aquí ves el total de la cotización actualizado al instante. También puedes aplicar descuento y retefuente.',
            pos: 'bottom'
        },
        {
            el: '#uploadBtnStore',
            title: 'Cargar lista de precios',
            text: 'Primero sube tu catálogo JSON (Lista 1 o Lista 2). Sin esto, el catálogo y el escáner no podrán funcionar. Haz clic en "Lista 1" o "Lista 2" para cargar el archivo.',
            pos: 'bottom',
            before: function () { switchTab('c'); }
        },
        {
            el: '#tab-c',
            title: 'Catálogo de productos',
            text: 'Busca en el catálogo Store o Lago por nombre o SKU. Haz clic en cualquier producto para añadirlo a la cotización.',
            pos: 'bottom'
        },
        {
            el: '#scanNumDigits',
            title: 'Actualizar cotización',
            text: 'Escribe la letra y el número de una cotización (propia o de un compañero) y la trae con los precios actuales del catálogo. Para cotizar productos de otra tienda usa "Cotizar competencia".',
            pos: 'bottom'
        },
        {
            el: '#itemsList',
            title: 'Lista de productos',
            text: 'Los productos añadidos aparecen aquí. Puedes cambiar cantidades, categorías, agregar notas o eliminarlos.',
            pos: 'top'
        },
        {
            el: '#btnCopy',
            title: 'Copiar como imagen',
            text: 'Genera la cotización y cópiala como imagen lista para enviar por WhatsApp o correo.',
            pos: 'bottom'
        },
        {
            el: '.pv-btn:first-child',
            title: 'Historial de cotizaciones',
            text: 'Todas tus cotizaciones se guardan automáticamente aquí. Puedes restaurar cualquiera con un clic.',
            pos: 'bottom'
        },
        {
            el: '.gear-btn',
            title: 'Configuración',
            text: 'Configura tu API Key de IA, datos de empresa y datos bancarios para las cotizaciones.',
            pos: 'bottom'
        }
    ];

    function _createOverlay() {
        if (document.getElementById('tourOverlay')) return;

        var ov = document.createElement('div');
        ov.id = 'tourOverlay';
        ov.innerHTML =
            '<div class="tour-backdrop" id="tourBackdrop"></div>' +
            '<div class="tour-tooltip" id="tourTooltip">' +
            '<div class="tour-tt-header">' +
            '<span class="tour-tt-step" id="tourStepNum"></span>' +
            '<button class="tour-tt-close" onclick="Tour.skip()" title="Cerrar">&times;</button>' +
            '</div>' +
            '<div class="tour-tt-title" id="tourTitle"></div>' +
            '<div class="tour-tt-text" id="tourText"></div>' +
            '<div class="tour-tt-footer">' +
            '<div class="tour-progress" id="tourProgress"></div>' +
            '<div class="tour-tt-btns">' +
            '<button class="tour-btn tour-btn-skip" onclick="Tour.skip()">Saltar</button>' +
            '<button class="tour-btn tour-btn-prev" id="tourPrev" onclick="Tour.prev()">' + icon('arrow-left', 'ico-xs') + ' Anterior</button>' +
            '<button class="tour-btn tour-btn-next" id="tourNext" onclick="Tour.next()">Siguiente ' + icon('arrow-right', 'ico-xs') + '</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(ov);
    }

    function _positionSpotlight(rect) {
        var pad = 8;
        var bd = document.getElementById('tourBackdrop');
        var top = rect.top - pad;
        var left = rect.left - pad;
        var w = rect.width + pad * 2;
        var h = rect.height + pad * 2;
        var r = Math.max(w, h);

        bd.style.clipPath =
            'polygon(0% 0%, 0% 100%, ' +
            left + 'px 100%, ' +
            left + 'px ' + top + 'px, ' +
            (left + w) + 'px ' + top + 'px, ' +
            (left + w) + 'px ' + (top + h) + 'px, ' +
            left + 'px ' + (top + h) + 'px, ' +
            left + 'px 100%, 100% 100%, 100% 0%)';
    }

    function _positionTooltip(rect, pos) {
        var tt = document.getElementById('tourTooltip');
        var margin = 16;
        var ttW = 340;

        // Reset
        tt.style.top = '';
        tt.style.bottom = '';
        tt.style.left = '';
        tt.style.right = '';
        tt.style.width = ttW + 'px';

        // Horizontal center on element, clamped to viewport
        var centerX = rect.left + rect.width / 2 - ttW / 2;
        centerX = Math.max(margin, Math.min(centerX, window.innerWidth - ttW - margin));
        tt.style.left = centerX + 'px';

        if (pos === 'bottom') {
            tt.style.top = (rect.bottom + margin) + 'px';
        } else {
            tt.style.bottom = (window.innerHeight - rect.top + margin) + 'px';
        }

        // Remove old arrow classes and add new
        tt.classList.remove('tour-arrow-top', 'tour-arrow-bottom');
        tt.classList.add(pos === 'bottom' ? 'tour-arrow-top' : 'tour-arrow-bottom');

        // Position arrow horizontally
        var arrowX = rect.left + rect.width / 2 - centerX;
        arrowX = Math.max(20, Math.min(arrowX, ttW - 20));
        tt.style.setProperty('--arrow-x', arrowX + 'px');
    }

    function _renderStep() {
        var s = _steps[_step];
        var target = document.querySelector(s.el);
        if (!target) { Tour.next(); return; }

        // Run pre-step action (e.g. switch tabs)
        if (s.before) s.before();


        // Scroll into view
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        setTimeout(function () {
            // En PC la fila de pestañas está escondida (ui/riel.js): una
            // pestaña se señala con su botón del riel. Lo que no se ve, se
            // salta (antes el globo quedaba pegado a la esquina de arriba).
            // Se mira aquí, después del cambio de sección (que puede animarse).
            target = document.querySelector(s.el) || target;
            var pest = /^#tab-([\w-]+)$/.exec(s.el);
            if (pest && !target.getClientRects().length) {
                var enRiel = document.querySelector('.riel [data-vista="' + pest[1] + '"]');
                if (enRiel && enRiel.getClientRects().length) target = enRiel;
            }
            if (!target.getClientRects().length) { Tour.next(); return; }
            var rect = target.getBoundingClientRect();
            _positionSpotlight(rect);
            _positionTooltip(rect, s.pos);

            document.getElementById('tourStepNum').textContent = (_step + 1) + ' / ' + _steps.length;
            document.getElementById('tourTitle').textContent = s.title;
            document.getElementById('tourText').textContent = s.text;

            // Progress dots
            var dots = '';
            for (var i = 0; i < _steps.length; i++) {
                dots += '<span class="tour-dot' + (i === _step ? ' active' : '') + (i < _step ? ' done' : '') + '"></span>';
            }
            document.getElementById('tourProgress').innerHTML = dots;

            // Button states
            document.getElementById('tourPrev').style.display = _step === 0 ? 'none' : '';
            var nextBtn = document.getElementById('tourNext');
            nextBtn.innerHTML = _step === _steps.length - 1 ? 'Finalizar' : 'Siguiente ' + icon('arrow-right', 'ico-xs');

            // Show tooltip with animation
            document.getElementById('tourTooltip').classList.add('show');
        }, 300);
    }

    // start() sin argumentos = tour de onboarding general.
    // start(steps, doneKey) = tour personalizado de un módulo (p. ej. Recogidas).
    function start(steps, doneKey) {
        _steps = (steps && steps.length) ? steps : STEPS;
        _doneKey = doneKey || STORAGE_KEY;
        _active = true;
        _step = 0;
        _createOverlay();
        document.getElementById('tourOverlay').classList.add('on');
        document.getElementById('tourTooltip').classList.remove('show');
        _renderStep();

        // Close on Escape
        document.addEventListener('keydown', _onKey);
    }

    function next() {
        if (_step < _steps.length - 1) {
            _step++;
            document.getElementById('tourTooltip').classList.remove('show');
            _renderStep();
        } else {
            finish();
        }
    }

    function prev() {
        if (_step > 0) {
            _step--;
            document.getElementById('tourTooltip').classList.remove('show');
            _renderStep();
        }
    }

    function skip() {
        finish();
    }

    function finish() {
        _active = false;
        var ov = document.getElementById('tourOverlay');
        if (ov) {
            ov.classList.remove('on');
            setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 400);
        }
        _ls.set(_doneKey || STORAGE_KEY, '1');
        document.removeEventListener('keydown', _onKey);
    }

    function _onKey(e) {
        if (e.key === 'Escape') skip();
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
    }

    // Auto-start on first visit
    function autoStart() {
        if (!_ls.get(STORAGE_KEY)) {
            setTimeout(function () { start(); }, 800);
        }
    }

    return {
        start: start,
        next: next,
        prev: prev,
        skip: skip,
        autoStart: autoStart
    };
})();
