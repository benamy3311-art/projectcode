/* ═══════════════════════════════════════════════════
   Orbe — una esfera de vidrio en WebGL
   ═══════════════════════════════════════════════════
   Por cada píxel se calcula cómo se dobla la luz al entrar en una bola de
   vidrio: aumento en el centro, la imagen comprimida cerca del borde (ojo de
   pez) y el rojo, el verde y el azul doblados con índices distintos, que es
   lo que abre el arcoíris del borde. Encima, Fresnel y el brillo de una luz.

   - La luz y el contenido siguen al puntero (o a la inclinación del teléfono).
   - Se detiene cuando sale de la pantalla o la pestaña no está visible.
   - Con «reducir movimiento» se dibuja una sola vez.
   - Sin WebGL queda la imagen de respaldo (clase .orbe-sin-gl).

   Uso: <canvas class="orbe" data-textura="assets/img/orbe-textura.webp">
═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }';
  var FRAG = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D tex; uniform float t; uniform float px; uniform vec2 m;',
    'vec2 girar(vec2 q, float a){ float c=cos(a), s=sin(a); return vec2(c*q.x-s*q.y, s*q.x+c*q.y); }',
    'vec2 muestra(vec2 q, vec3 n, float ior, float r){',
    '  vec3 rd = refract(vec3(0.0,0.0,-1.0), n, 1.0/ior);',
    '  vec2 uv = q*0.50 + rd.xy*0.30 + q*pow(r, 7.0)*0.75;',
    '  uv = girar(uv, sin(t*0.07)*0.35 + t*0.025 + m.x*0.25);',
    '  uv += vec2(sin(t*0.11), cos(t*0.09))*0.05 - m*0.06;',
    '  uv *= 0.58;',
    '  return vec2(uv.x + 0.5, 0.5 - uv.y);',
    '}',
    'void main(){',
    '  vec2 q = v; float r = length(q);',
    '  float borde = 1.0 - smoothstep(1.0 - 2.0*px, 1.0, r);',
    '  if (borde <= 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  float z = sqrt(max(0.0, 1.0 - r*r));',
    '  vec3 n = normalize(vec3(q, z));',
    '  float ab = 0.012 + 0.07*smoothstep(0.72, 0.99, r);',
    '  vec3 col = vec3(texture2D(tex, muestra(q, n, 1.46 - ab, r)).r,',
    '                  texture2D(tex, muestra(q, n, 1.46, r)).g,',
    '                  texture2D(tex, muestra(q, n, 1.46 + ab*1.4, r)).b);',
    '  float fr = pow(1.0 - z, 5.0);',
    '  col *= 1.0 - 0.35*smoothstep(0.70, 0.99, r);',
    '  col = mix(col, vec3(0.94, 0.96, 1.0), fr*0.30);',
    '  vec3 L = normalize(vec3(-0.45 + m.x*0.5, 0.6 + m.y*0.4, 0.66));',
    '  float sp = pow(max(dot(reflect(-L, n), vec3(0.0,0.0,1.0)), 0.0), 70.0);',
    '  col += sp*0.85 + smoothstep(0.2, 1.0, n.y)*fr*0.12;',
    '  col += vec3(1.0) * smoothstep(0.965, 0.995, r) * (1.0 - smoothstep(0.995, 1.0, r)) * 0.18;',
    '  col += vec3(1.0, 0.85, 0.7) * smoothstep(0.55, 1.0, -n.y) * (1.0 - fr) * 0.08;',
    '  gl_FragColor = vec4(col * borde, borde);',
    '}'
  ].join('\n');

  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function compilar(gl, tipo, src) {
    var s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }

  function montar(canvas) {
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true }); } catch (e) {}
    if (!gl) { canvas.classList.add('orbe-sin-gl'); return; }
    var prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
    } catch (e) { canvas.classList.add('orbe-sin-gl'); return; }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uT = gl.getUniformLocation(prog, 't'), uPx = gl.getUniformLocation(prog, 'px'), uM = gl.getUniformLocation(prog, 'm');

    var lista = false, visible = true, raf = 0, inicio = performance.now();
    var meta = { x: 0, y: 0 }, mano = { x: 0, y: 0 };

    function medir() {
      var d = Math.min(window.devicePixelRatio || 1, 3);
      var w = Math.max(1, Math.round(canvas.clientWidth * d)), h = Math.max(1, Math.round(canvas.clientHeight * d));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h); gl.uniform1f(uPx, 2 / w);
    }
    function dibujar(ahora) {
      medir();
      mano.x += (meta.x - mano.x) * 0.06; mano.y += (meta.y - mano.y) * 0.06;
      gl.uniform1f(uT, quieto ? 6 : (ahora - inicio) / 1000);
      gl.uniform2f(uM, mano.x, mano.y);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bucle(ahora) {
      raf = 0;
      if (!lista || !visible || document.hidden) return;
      dibujar(ahora);
      raf = requestAnimationFrame(bucle);
    }
    function seguir() { if (!quieto && !raf && lista && visible && !document.hidden) raf = requestAnimationFrame(bucle); }

    var img = new Image();
    img.onload = function () {
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      var an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      lista = true; canvas.classList.add('orbe-listo');
      if (quieto) dibujar(0); else seguir();
    };
    img.onerror = function () { canvas.classList.add('orbe-sin-gl'); };
    img.src = canvas.getAttribute('data-textura');

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) seguir(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', seguir);
    window.addEventListener('resize', function () { if (quieto && lista) dibujar(0); });

    if (!quieto) {
      window.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        meta.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        meta.y = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      }, { passive: true });
      window.addEventListener('deviceorientation', function (e) {
        if (e.gamma == null) return;
        meta.x = Math.max(-1, Math.min(1, e.gamma / 30));
        meta.y = Math.max(-1, Math.min(1, (45 - e.beta) / 30));
      }, { passive: true });
    }
  }

  function iniciar() { document.querySelectorAll('canvas.orbe').forEach(montar); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
