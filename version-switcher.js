// Conmutador de Versiones ProjectCode - Sin emojis
(function () {
  'use strict';

  function initSwitcher() {
    if (window.self !== window.top) return;
    if (document.getElementById('pcSwitcher')) return;

    // Detectar pagina actual
    const path = window.location.pathname;
    const isLive = path.endsWith('live.html');
    const isCodex = path.endsWith('codex.html');
    const isCompare = path.endsWith('comparar.html');
    const isDefinitiva = path.endsWith('definitiva.html') || (!isLive && !isCodex && !isCompare);

    const currentVersion = isLive ? 'live' : isCodex ? 'codex' : isDefinitiva ? 'definitiva' : 'compare';

    // Construir markup del conmutador flotante
    const root = document.createElement('aside');
    root.id = 'pcSwitcher';
    root.className = 'pc-switcher-root';
    root.setAttribute('aria-label', 'Selector de version del sitio');

    if (localStorage.getItem('pc_minimized') === 'true') {
      root.classList.add('is-minimized');
    }

    root.innerHTML = `
      <div class="pc-switcher-bar" role="toolbar" aria-label="Controles de version">
        <div class="pc-switcher-tag">
          <span class="pc-switcher-tag-dot"></span>
          <span>Version</span>
        </div>
        <nav class="pc-switcher-nav" aria-label="Versiones disponibles">
          <button type="button" class="pc-switcher-btn ${isLive ? 'is-active' : ''}" data-target="live" aria-pressed="${isLive}">
            <span>Original</span>
            <span class="pc-btn-badge">Live</span>
          </button>
          <button type="button" class="pc-switcher-btn ${isCodex ? 'is-active' : ''}" data-target="codex" aria-pressed="${isCodex}">
            <span>Codex</span>
            <span class="pc-btn-badge">Propuesta</span>
          </button>
          <button type="button" class="pc-switcher-btn ${isDefinitiva ? 'is-active' : ''}" data-target="definitiva" aria-pressed="${isDefinitiva}">
            <span>Definitiva</span>
            <span class="pc-btn-badge pc-badge-definitiva">Hibrida</span>
          </button>
          <div class="pc-switcher-btn-compare">
            <a href="comparar.html" class="pc-switcher-btn ${isCompare ? 'is-active' : ''}" title="Comparar versiones en pantalla dividida">
              <span>Comparar</span>
            </a>
          </div>
        </nav>
        <button type="button" class="pc-switcher-minimize" id="pcSwitcherMin" title="Minimizar barra" aria-label="Minimizar selector">x</button>
      </div>
      <button type="button" class="pc-switcher-bubble" id="pcSwitcherMax" title="Expandir conmutador de version" aria-label="Expandir selector de version">
        <span>Comparar versiones</span>
      </button>
    `;

    document.body.appendChild(root);

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

    root.querySelectorAll('.pc-switcher-btn[data-target]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        const target = this.getAttribute('data-target');
        if (target === currentVersion) return;

        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const scrollRatio = window.scrollY / maxScroll;
        const sectionId = getActiveSectionId();

        sessionStorage.setItem('pc_scroll_ratio', String(scrollRatio));
        if (sectionId) {
          sessionStorage.setItem('pc_section_id', sectionId);
        }
        localStorage.setItem('projectcode_version', target);

        let dest = 'index.html';
        if (target === 'live') dest = 'live.html';
        else if (target === 'codex') dest = 'codex.html';
        else if (target === 'definitiva') dest = 'index.html';

        if (sectionId && document.getElementById(sectionId)) {
          dest += '#' + sectionId;
        }

        window.location.href = dest;
      });
    });

    const savedRatio = sessionStorage.getItem('pc_scroll_ratio');
    if (savedRatio !== null && !window.location.hash) {
      sessionStorage.removeItem('pc_scroll_ratio');
      const ratio = parseFloat(savedRatio);
      if (!isNaN(ratio) && ratio > 0.02) {
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
