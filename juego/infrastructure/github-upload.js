// ============================================================
// GitHub Contents API uploader — infrastructure/github-upload.js
//
// Provides uploadToGitHub() to PUT a file into a GitHub repo
// using a Personal Access Token (PAT).  No external dependencies.
// ============================================================

// ── Token de GitHub: solo en memoria ─────────────────────────
// Un token con permiso de escritura sobre el repositorio equivale a publicar
// en producción para todas las tiendas (Vercel despliega cada push a main).
// Antes quedaba guardado para siempre en localStorage (sl_github_pat), donde
// cualquier script inyectado, extensión o la siguiente persona en un equipo
// compartido lo podía leer. Ahora vive solo mientras la página está abierta:
// se pierde al recargar o cerrar sesión, y el que haya quedado guardado de
// versiones anteriores se borra al cargar.
//
//   _slGhToken.get()      — token de esta sesión ('' si no hay)
//   _slGhToken.set(tok)   — lo recuerda hasta recargar la página
//   _slGhToken.clear()
var _slGhToken = (function () {
  var mem = '';
  try { localStorage.removeItem('sl_github_pat'); } catch (e) { }
  return {
    get: function () { return mem; },
    set: function (t) { mem = String(t || '').trim(); },
    clear: function () { mem = ''; }
  };
})();

/**
 * Uploads (creates or updates) a file in a GitHub repository using the
 * GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path}).
 *
 * @param {string} token   - GitHub Personal Access Token (PAT) with repo write scope
 * @param {string} owner   - Repository owner (e.g. "benamy3311-art")
 * @param {string} repo    - Repository name (e.g. "projectcode-tools")
 * @param {string} path    - File path inside the repo (e.g. "data/store/catalog_store.json")
 * @param {string} content - File content as a plain UTF-8 string (will be base64-encoded)
 * @param {string} message - Commit message
 * @returns {Promise<{ok: boolean, sha: string|null, error: string|null}>}
 */
function uploadToGitHub(token, owner, repo, path, content, message) {
  if (!token || !owner || !repo || !path || content == null || !message) {
    return Promise.resolve({ ok: false, sha: null, error: 'Parámetros incompletos para uploadToGitHub' });
  }

  var apiBase = 'https://api.github.com';
  var url = apiBase + '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + path;

  // Step 1: GET the current file to obtain its sha (needed for updates)
  return fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json'
    }
  })
    .then(function (res) {
      if (res.status === 200) return res.json().then(function (d) { return d.sha || null; });
      if (res.status === 404) return null; // file doesn't exist yet — create it
      return res.text().then(function (t) {
        throw new Error('GitHub GET ' + res.status + ': ' + t);
      });
    })
    .then(function (existingSha) {
      // Step 2: PUT (create or update)
      var body = {
        message: message,
        content: _base64Encode(content)
      };
      if (existingSha) body.sha = existingSha;

      return fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    })
    .then(function (res) {
      if (res.status === 200 || res.status === 201) {
        return res.json().then(function (d) {
          var newSha = (d.content && d.content.sha) ? d.content.sha : null;
          return { ok: true, sha: newSha, error: null };
        });
      }
      return res.text().then(function (t) {
        var msg;
        try { msg = JSON.parse(t).message || t; } catch (_) { msg = t; }
        return { ok: false, sha: null, error: 'GitHub ' + res.status + ': ' + msg };
      });
    })
    .catch(function (err) {
      return { ok: false, sha: null, error: err.message || String(err) };
    });
}

/**
 * Registra en Firestore (config/catalog_meta) cuándo y quién actualizó
 * el catálogo por última vez. Lo consume el brief diario. Best-effort:
 * si no hay sesión o faltan permisos, no interrumpe la subida.
 * @param {string} list - 'store' | 'lago'
 */
function _writeCatalogMeta(list) {
  try {
    var db = window._slDb;
    var user = window._slAuth && window._slAuth.currentUser;
    if (!db || !user) return;
    db.collection('config').doc('catalog_meta').set({
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: (user.email || '').toLowerCase().trim(),
      list: list || ''
    }).catch(function (e) { console.warn('catalog_meta error:', e && (e.message || e.code)); });
  } catch (e) { console.warn('catalog_meta error:', e && (e.message || e.code)); }
}

// ── Internal helpers ────────────────────────────────────────

/**
 * Encodes a UTF-8 string to base64 using the browser's btoa(),
 * properly handling non-ASCII characters.
 * @param {string} str
 * @returns {string} base64-encoded string
 */
function _base64Encode(str) {
  // Encode to UTF-8 bytes, then to base64
  var utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  return btoa(utf8Bytes);
}
