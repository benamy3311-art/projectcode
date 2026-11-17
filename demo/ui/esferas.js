// ============================================================
// ESFERAS — foto de perfil y bienvenida como esfera de vidrio
// ============================================================
// Cada vendedor elige una imagen de la galería (o sube una foto suya) y la
// app la muestra dentro de una esfera de vidrio (WebGL: refracción por
// canal, ojo de pez, Fresnel). Se usa en su foto de perfil y, grande y en
// movimiento, en la pantalla de bienvenida. A cada cliente le toca una
// imagen de la galería según su nombre: siempre la misma para la misma
// persona, sin guardar nada.
//
// La elección se guarda en este dispositivo, por cuenta (como el historial).
// Sin WebGL se ve la imagen recortada en círculo y vuelve la mascota.
//
// Globales que expone (window.*):
//   Esferas.de(nombre)   — id de la galería para un cliente ('noche'|'coral')
//   Esferas.abrir()      — ventana para elegir la esfera propia
//
// Depende de: nada. Imágenes en assets/img/esfera-*.webp.
// Requiere DOM: #sbAvatar, #sbUserName, #speedy-wrap (opcionales).
// Estilos: styles/tema-cristal.css (sección «Esferas»).
// ============================================================
(function () {
  var GALERIA = [
    { id: 'noche', nombre: 'Noche', src: 'assets/img/esfera-noche.webp' },
    { id: 'coral', nombre: 'Coral', src: 'assets/img/esfera-coral.webp' }
  ];
  var MAX_FOTO = 1024; // la foto propia se guarda cuadrada, 1024 px (potencia de 2 para WebGL)
  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Sombreador ────────────────────────────────────────────
  var VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'varying vec2 v; uniform sampler2D tex; uniform float t; uniform float px;',
    'vec2 girar(vec2 q, float a){ float c=cos(a), s=sin(a); return vec2(c*q.x-s*q.y, s*q.x+c*q.y); }',
    'vec2 muestra(vec2 q, vec3 n, float ior, float r){',
    '  vec3 rd = refract(vec3(0.0,0.0,-1.0), n, 1.0/ior);',
    '  vec2 uv = q*0.50 + rd.xy*0.30 + q*pow(r, 7.0)*0.75;',
    '  uv = girar(uv, sin(t*0.07)*0.35 + t*0.025);',
    '  uv += vec2(sin(t*0.11), cos(t*0.09))*0.05;',
    '  uv *= 0.58;',
    '  return vec2(uv.x + 0.5, 0.5 - uv.y);',
    '}',
    'void main(){',
    '  vec2 q = v; float r = length(q);',
    '  float borde = 1.0 - smoothstep(1.0 - 2.0*px, 1.0, r);',
    '  if (borde <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  float z = sqrt(max(0.0, 1.0 - r*r)); vec3 n = normalize(vec3(q, z));',
    '  float ab = 0.012 + 0.07*smoothstep(0.72, 0.99, r);',
    '  vec3 col = vec3(texture2D(tex, muestra(q, n, 1.46 - ab, r)).r,',
    '                  texture2D(tex, muestra(q, n, 1.46, r)).g,',
    '                  texture2D(tex, muestra(q, n, 1.46 + ab*1.4, r)).b);',
    '  float fr = pow(1.0 - z, 5.0);',
    '  col *= 1.0 - 0.35*smoothstep(0.70, 0.99, r);',
    '  col = mix(col, vec3(0.94, 0.96, 1.0), fr*0.30);',
    '  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));',
    '  col += pow(max(dot(reflect(-L, n), vec3(0.0,0.0,1.0)), 0.0), 70.0)*0.85 + smoothstep(0.2, 1.0, n.y)*fr*0.12;',
    '  col += vec3(1.0) * smoothstep(0.965, 0.995, r) * (1.0 - smoothstep(0.995, 1.0, r)) * 0.18;',
    '  gl_FragColor = vec4(col * borde, borde);',
    '}'
  ].join('\n');

  function crearGL(canvas, conservar) {
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: !!conservar }); } catch (e) {}
    if (!gl) return null;
    function sh(tipo, src) { var s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader'); return s; }
    try {
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      return { gl: gl, uT: gl.getUniformLocation(prog, 't'), uPx: gl.getUniformLocation(prog, 'px'), tex: gl.createTexture() };
    } catch (e) { return null; }
  }
  function subirTextura(g, img) {
    var gl = g.gl;
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    var an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  function pintar(g, w, h, t) {
    var gl = g.gl;
    gl.viewport(0, 0, w, h); gl.uniform1f(g.uPx, 2 / w); gl.uniform1f(g.uT, t);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function cargar(src) {
    return new Promise(function (ok, mal) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = mal; i.src = src; });
  }

  // ── Render fijo para fotos de perfil (un solo contexto, con caché) ──
  var fijo = null, cache = {};
  function renderFijo(src, lado) {
    lado = lado || 192;
    var k = src + '@' + lado;
    if (cache[k]) return cache[k];
    cache[k] = cargar(src).then(function (img) {
      if (fijo === null) {
        var c = document.createElement('canvas');
        fijo = crearGL(c, true) || false; if (fijo) fijo.canvas = c;
      }
      if (!fijo) return src; // sin WebGL: la imagen tal cual, recortada por CSS
      fijo.canvas.width = lado; fijo.canvas.height = lado;
      subirTextura(fijo, img); pintar(fijo, lado, lado, 6);
      return fijo.canvas.toDataURL('image/png');
    }).catch(function () { return src; });
    return cache[k];
  }

  // ── Elección guardada por cuenta en este dispositivo ──────
  function correo() {
    try { return String((window._slAuth && _slAuth.currentUser && _slAuth.currentUser.email) || '').toLowerCase().trim(); } catch (e) { return ''; }
  }
  function clave() { var c = correo(); return c ? 'sl_esfera::' + c : 'sl_esfera'; }
  function leer() {
    try { var v = JSON.parse(localStorage.getItem(clave()) || 'null'); if (v && (v.id === 'propia' ? v.foto : buscar(v.id))) return v; } catch (e) {}
    return { id: GALERIA[0].id };
  }
  function guardar(v) {
    try { localStorage.setItem(clave(), JSON.stringify(v)); return true; }
    catch (e) { if (window.showToast) showToast('No se pudo guardar la foto en este equipo (sin espacio).', 'error'); return false; }
  }
  function buscar(id) { for (var i = 0; i < GALERIA.length; i++) if (GALERIA[i].id === id) return GALERIA[i]; return null; }
  function fuente(v) { return v.id === 'propia' ? v.foto : buscar(v.id).src; }

  function de(nombre) {
    var t = String(nombre || '').trim().toLowerCase(), s = 0;
    for (var i = 0; i < t.length; i++) s += t.charCodeAt(i);
    return GALERIA[s % GALERIA.length].id;
  }

  // ── Foto del vendedor ─────────────────────────────────────
  function aplicarVendedor() {
    var a = document.getElementById('sbAvatar');
    if (!a) return;
    renderFijo(fuente(leer())).then(function (url) {
      a.style.backgroundImage = 'url("' + url + '")';
      a.classList.add('con-esfera');
    });
  }

  // ── Clientes: una regla de CSS por imagen de la galería ──
  function reglasClientes() {
    Promise.all(GALERIA.map(function (g) { return renderFijo(g.src, 128); })).then(function (urls) {
      var css = GALERIA.map(function (g, i) { return '.tv-avatar[data-esfera="' + g.id + '"]{background-image:url("' + urls[i] + '")}'; }).join('\n');
      var st = document.getElementById('esferasClientes');
      if (!st) { st = document.createElement('style'); st.id = 'esferasClientes'; document.head.appendChild(st); }
      st.textContent = css;
    });
  }

  // ── Bienvenida: la esfera grande en movimiento ────────────
  var vivo = null;
  function montarBienvenida() {
    var wrap = document.getElementById('speedy-wrap');
    if (!wrap) return;
    var c = wrap.querySelector('canvas.esfera-viva');
    if (!c) {
      c = document.createElement('canvas'); c.className = 'esfera-viva'; c.setAttribute('aria-hidden', 'true');
      wrap.appendChild(c);
    }
    if (!vivo) {
      vivo = crearGL(c, false);
      if (!vivo) return;
      vivo.canvas = c; vivo.raf = 0; vivo.inicio = performance.now(); vivo.lista = false; vivo.visible = true;
      var bucle = function (ahora) {
        vivo.raf = 0;
        if (!vivo.lista || !vivo.visible || document.hidden) return;
        var d = Math.min(window.devicePixelRatio || 1, 3);
        var w = Math.max(1, Math.round(c.clientWidth * d));
        if (c.width !== w) { c.width = w; c.height = w; }
        pintar(vivo, w, w, quieto ? 6 : (ahora - vivo.inicio) / 1000);
        if (!quieto) vivo.raf = requestAnimationFrame(bucle);
      };
      vivo.seguir = function () { if (!vivo.raf) vivo.raf = requestAnimationFrame(bucle); };
      if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vivo.visible = e[0].isIntersecting; if (vivo.visible) vivo.seguir(); }).observe(c);
      document.addEventListener('visibilitychange', function () { vivo.seguir(); });
    }
    cargar(fuente(leer())).then(function (img) {
      subirTextura(vivo, img); vivo.lista = true;
      document.documentElement.classList.add('con-esfera');
      vivo.seguir();
    }).catch(function () {});
  }

  // ── Ventana para elegir ───────────────────────────────────
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var modal = null, eleccion = null;
  function abrir() {
    eleccion = leer();
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'esf-ov'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'esfTitulo');
      modal.innerHTML =
        '<div class="esf-caja">' +
          '<div class="esf-cab"><h3 id="esfTitulo">Tu esfera</h3><button type="button" class="esf-x" data-acc="cerrar" aria-label="Cerrar">&times;</button></div>' +
          '<p class="esf-ayuda">Es tu foto de perfil y la esfera de tu pantalla de inicio. Se guarda en este equipo.</p>' +
          '<div class="esf-grilla" id="esfGrilla"></div>' +
          '<div class="esf-pie"><label class="esf-subir"><input type="file" accept="image/*" id="esfArchivo">Subir mi foto</label>' +
          '<button type="button" class="esf-listo" data-acc="listo">Listo</button></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (e) {
        var b = e.target.closest('[data-acc], [data-esfera-op]');
        if (e.target === modal || (b && b.getAttribute('data-acc') === 'cerrar')) return cerrar();
        if (!b) return;
        if (b.hasAttribute('data-esfera-op')) {
          var id = b.getAttribute('data-esfera-op');
          eleccion = id === 'propia' ? { id: 'propia', foto: eleccion.foto || (leer().foto) } : { id: id };
          pintarGrilla();
        } else if (b.getAttribute('data-acc') === 'listo') {
          if (guardar(eleccion)) { aplicarVendedor(); montarBienvenida(); }
          cerrar();
        }
      });
      modal.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
      modal.querySelector('#esfArchivo').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (!/^image\//.test(f.type)) { if (window.showToast) showToast('Elige un archivo de imagen.', 'error'); return; }
        recortar(f).then(function (url) { eleccion = { id: 'propia', foto: url }; pintarGrilla(); })
          .catch(function () { if (window.showToast) showToast('No se pudo leer esa imagen.', 'error'); });
      });
    }
    pintarGrilla();
    modal.classList.add('on');
    var listo = modal.querySelector('.esf-listo'); if (listo) listo.focus();
  }
  function cerrar() { if (modal) modal.classList.remove('on'); }
  function pintarGrilla() {
    var g = modal.querySelector('#esfGrilla');
    var ops = GALERIA.slice();
    var propia = eleccion.id === 'propia' ? eleccion.foto : leer().foto;
    if (propia) ops.push({ id: 'propia', nombre: 'Mi foto', src: propia });
    g.innerHTML = ops.map(function (o) {
      return '<button type="button" class="esf-op" data-esfera-op="' + esc(o.id) + '" aria-pressed="' + (eleccion.id === o.id) + '">' +
        '<span class="esf-bola" data-src="' + esc(o.id) + '"></span><span>' + esc(o.nombre) + '</span></button>';
    }).join('');
    ops.forEach(function (o) {
      renderFijo(o.src, 192).then(function (url) {
        var el = g.querySelector('.esf-bola[data-src="' + o.id + '"]');
        if (el) el.style.backgroundImage = 'url("' + url + '")';
      });
    });
  }
  // Foto propia: recorte cuadrado al centro, 1024 px, JPEG
  function recortar(archivo) {
    return new Promise(function (ok, mal) {
      var lector = new FileReader();
      lector.onerror = mal;
      lector.onload = function () {
        cargar(lector.result).then(function (img) {
          var lado = Math.min(img.naturalWidth, img.naturalHeight);
          var c = document.createElement('canvas'); c.width = MAX_FOTO; c.height = MAX_FOTO;
          c.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, MAX_FOTO, MAX_FOTO);
          ok(c.toDataURL('image/jpeg', 0.86));
        }, mal);
      };
      lector.readAsDataURL(archivo);
    });
  }

  // ── Arranque ──────────────────────────────────────────────
  function iniciar() {
    aplicarVendedor();
    reglasClientes();
    montarBienvenida();
    // Al iniciar sesión cambia la cuenta: se vuelve a leer su elección
    var n = document.getElementById('sbUserName');
    if (n && window.MutationObserver) new MutationObserver(function () { aplicarVendedor(); montarBienvenida(); }).observe(n, { childList: true, characterData: true, subtree: true });
  }

  window.Esferas = { de: de, abrir: abrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
