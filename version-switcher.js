// ─── Conmutador de Versiones ProjectCode (Live vs Codex) ───
(function () {
  'use strict';

  function initSwitcher() {
    // Si la página está embebida en un iframe (como en comparar.html), no mostrar el widget
    if (window.self !== window.top) return;
    if (document.getElementById('pcSwitcher')) return;

    // Detectar página actual
    const path = window.location.pathname;
    const isLive = path.endsWith('live.html');
    const isCompare = path.endsWith('comparar.html');
    const isCodex = !isLive && !isCompare; // index.html o codex.html

    const currentVersion = isLive ? 'live' : isCodex ? 'codex' : 'compare';

    // Construir markup del conmutador flotante
    const root = document.createElement('aside');
    root.id = 'pcSwitcher';
    root.className = 'pc-switcher-root';
    root.setAttribute('aria-label', 'Selector y comparador de versión');

    // Restaurar estado minimizado previo
    if (localStorage.getItem('pc_minimized') === 'true') {
      root.classList.add('is-minimized');
    }

    root.innerHTML = `
      <div class="pc-switcher-bar" role="toolbar" aria-label="Controles de versión">
        <div class="pc-switcher-tag">
          <span class="pc-switcher-tag-dot"></span>
          <span>Versión</span>
        </div>
        <nav class="pc-switcher-nav" aria-label="Versiones disponibles">
          <button type="button" class="pc-switcher-btn ${isLive ? 'is-active' : ''}" data-target="live" aria-pressed="${isLive}">
            <span>⚡ Original</span>
            <span class="pc-btn-badge">Live</span>
          </button>
          <button type="button" class="pc-switcher-btn ${isCodex ? 'is-active' : ''}" data-target="codex" aria-pressed="${isCodex}">
            <span>✨ Nueva</span>
            <span class="pc-btn-badge">Codex</span>
          </button>
          <div class="pc-switcher-btn-compare">
            <a href="comparar.html" class="pc-switcher-btn ${isCompare ? 'is-active' : ''}" title="Comparar ambas versiones en pantalla dividida">
              <span>◫ Lado a lado</span>
            </a>
          </div>
        </nav>
        <button type="button" class="pc-switcher-minimize" id="pcSwitcherMin" title="Minimizar barra" aria-label="Minimizar selector">✕</button>
      </div>
      <button type="button" class="pc-switcher-bubble" id="pcSwitcherMax" title="Expandir conmutador de versión" aria-label="Expandir conmutador">
        <span>⚖️</span>
        <span>Comparar versiones</span>
      </button>
    `;

    document.body.appendChild(root);

    // Botones de minimizar y restaurar
    const minBtn = root.querySelector('#pcSwitcherMin');
    const maxBtn = root.querySelector('#pcSwitcherMax');

    minBtn.addEventListener('click', function () {
      root.classList.add('is-minimized');
      localStorage.setItem('pc_minimized', 'true');
    });

    maxBtn.addEventListener('click', function () {
      root.classList.remove('is-minimized');
      localStorage.setItem('pc_minimized', 'false');
    });

    // Detectar la sección visible más cercana para sincronizar posición
    function getActiveSectionId() {
      const sections = document.querySelectorAll('section[id]');
      let closestId = null;
      let minDistance = Infinity;
      const viewportMid = window.innerHeight * 0.35;

      sections.forEach(function (sec) {
        const rect = sec.getBoundingClientRect();
        const dist = Math.abs(rect.top - viewportMid);
        if (rect.top <= window.innerHeight && rect.bottom >= 0 && dist < minDistance) {
          minDistance = dist;
          closestId = sec.id;
        }
      });
      return closestId;
    }

    // Manejar clics de cambio de versión
    root.querySelectorAll('.pc-switcher-btn[data-target]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        const target = this.getAttribute('data-target');
        if (target === currentVersion) return;

        // Guardar porcentaje de scroll actual
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const scrollRatio = window.scrollY / maxScroll;
        const sectionId = getActiveSectionId();

        sessionStorage.setItem('pc_scroll_ratio', String(scrollRatio));
        if (sectionId) {
          sessionStorage.setItem('pc_section_id', sectionId);
        }
        localStorage.setItem('projectcode_version', target);

        // Destino
        let dest = target === 'live' ? 'live.html' : 'index.html';
        if (sectionId && document.getElementById(sectionId)) {
          dest += '#' + sectionId;
        }

        window.location.href = dest;
      });
    });

    // Restaurar posición de scroll si venimos de la otra versión
    const savedRatio = sessionStorage.getItem('pc_scroll_ratio');
    if (savedRatio !== null && !window.location.hash) {
      sessionStorage.removeItem('pc_scroll_ratio');
      const ratio = parseFloat(savedRatio);
      if (!isNaN(ratio) && ratio > 0.02) {
        // Permitir que el render inicial calcule la altura
        setTimeout(function () {
          const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({
            top: ratio * maxScroll,
            behavior: 'instant'
          });
        }, 60);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwitcher);
  } else {
    initSwitcher();
  }
})();
