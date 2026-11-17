// STORAGE LAYER - localStorage adapter, external constants

const LOGO_SRC = (function(){ var el = document.querySelector('.logo-wrap img'); return el ? el.src : ''; })();

const WA_LOGO = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMyNUQzNjYiLz48cGF0aCBkPSJNMjMuNSA4LjVBMTAuNDQgMTAuNDQgMCAwIDAgMTYgNS41YTEwLjUgMTAuNSAwIDAgMC05LjA5IDE1LjczTDUuNSAyNi41bDUuNDItMS40MkExMC41IDEwLjUgMCAxIDAgMjMuNSA4LjV6bS03LjUgMTYuMTZhOC43MSA4LjcxIDAgMCAxLTQuNDQtMS4yMWwtLjMyLS4xOS0zLjIyLjg0Ljg2LTMuMTQtLjIxLS4zM0E4LjczIDguNzMgMCAxIDEgMTYgMjQuNjZ6bTQuNzktNi41NGMtLjI2LS4xMy0xLjU1LS43Ny0xLjc5LS44NXMtLjQyLS4xMy0uNTkuMTMtLjY4Ljg1LS44MyAxLS4zMS4yLS41Ny4wN2E3LjIyIDcuMjIgMCAwIDEtMi4xMi0xLjMxIDcuOTMgNy45MyAwIDAgMS0xLjQ3LTEuODNjLS4xNS0uMjYgMC0uNC4xMi0uNTNzLjI2LS4zMS4zOS0uNDdhMS43NiAxLjc2IDAgMCAwIC4yNi0uNDMuNDguNDggMCAwIDAgMC0uNDZjLS4wNy0uMTMtLjU5LTEuNDMtLjgxLTEuOTZzLS40My0uNDQtLjU5LS40NWgtLjVhMSAxIDAgMCAwLS43MS4zMyAyLjkzIDIuOTMgMCAwIDAtLjkxIDIuMTggNS4wOCA1LjA4IDAgMCAwIDEuMDcgMi43MSAxMS42NSAxMS42NSAwIDAgMCA0LjQ3IDMuOTRjLjYyLjI3IDEuMTEuNDMgMS40OS41NWEzLjU4IDMuNTggMCAwIDAgMS42NS4xIDIuNjkgMi42OSAwIDAgMCAxLjc2LTEuMjQgMi4xNyAyLjE3IDAgMCAwIC4xNS0xLjI0Yy0uMDYtLjEyLS4yMy0uMTgtLjQ5LS4zMXoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=';

// --- Safe localStorage wrapper ---
var _ls = {
  get: function (key, fallback) {
    try { var v = localStorage.getItem(key); return v !== null ? v : (fallback !== undefined ? fallback : null); }
    catch (e) { return fallback !== undefined ? fallback : null; }
  },
  set: function (key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { console.warn('[storage] No se pudo guardar "' + key + '":', e.message); return false; }
  },
  remove: function (key) {
    try { localStorage.removeItem(key); return true; } catch (e) { return false; }
  },
  getJSON: function (key, fallback) {
    try { return JSON.parse(this.get(key) || 'null') || fallback; } catch (e) { return fallback; }
  },
  setJSON: function (key, value) { return this.set(key, JSON.stringify(value)); }
};

// --- Config versioning and migration ---
const CONFIG_VERSION = 1;

function migrateConfig(cfg) {
  let v = cfg._version || 0;

  // Migración 0 → 1: estructura inicial versionada
  if (v < 1) {
    // Asegurar campos base existen
    cfg.empresa = cfg.empresa || '';
    cfg.nit = cfg.nit || '';
    cfg.tel = cfg.tel || '';
    cfg.email = cfg.email || '';
    cfg.dir = cfg.dir || '';
    cfg.banco = cfg.banco || '';
    cfg.tipoCuenta = cfg.tipoCuenta || '';
    cfg.cuenta = cfg.cuenta || '';
    cfg.titular = cfg.titular || '';
    v = 1;
  }

  // Futuras migraciones: if (v < 2) { ... v = 2; }

  cfg._version = v;
  return cfg;
}

function loadCfg() {
  try {
    let cfg = _ls.getJSON('sl_cfg', {});
    if ((cfg._version || 0) < CONFIG_VERSION) {
      cfg = migrateConfig(cfg);
      saveCfg(cfg); // persistir migración
    }
    return cfg;
  } catch (e) {
    return migrateConfig({});
  }
}

function saveCfg(o) {
  o._version = CONFIG_VERSION;
  _ls.setJSON('sl_cfg', o);
}
