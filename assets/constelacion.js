/* ==========================================================================
   ProjectCode - constelacion de particulas
   --------------------------------------------------------------------------
   Una nube de miles de triangulos diminutos que hace de imagen de marca. Es un
   solo objeto vivo detras de toda la pagina: cambia de forma segun la seccion
   que se esta leyendo (un chip, una lista de precios, tres sedes conectadas...)
   y cambia de lado en zigzag con el texto.

   - Las particulas "estructurales" viajan de una forma a otra; el "polvo" es un
     campo ambiente que no cambia de forma.
   - Las formas son puntos generados por codigo (sin imagenes ni librerias).
   - Respeta prefers-reduced-motion: forma estatica, sin bucle de animacion.
   - No hace ninguna peticion de red.

   API: window.Constelacion.set(nombreDeEscena, lado)   lado: 'left' | 'right'
   Depuracion: ?escena=lock&lado=left&estatica=1   (?escala=1.4 agranda la figura)
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('constelacion');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var TAU = Math.PI * 2;
  var query = new URLSearchParams(location.search);
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var still = reduce || query.get('estatica') === '1';
  var coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  var zoomQ = parseFloat(query.get('escala')) || 1;

  /* Paleta de las particulas: espectro vivo sobre el negro. */
  var PAL = ['#8052ff', '#b39bff', '#3f7bff', '#19c3a3', '#ffb829', '#f14fb0', '#ffffff'];
  var V = 0, LAV = 1, BLU = 2, TEAL = 3, AMB = 4, MAG = 5, WHT = 6;
  var ALPHA = [0.34, 0.66, 1];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function frac(v) { return v - Math.floor(v); }

  /* ------------------------------------------------------------------------
     Constructor de formas. Las coordenadas van de -1 a 1 aprox.; y hacia
     arriba, z hacia el fondo. Cada escena llena el mismo numero de puntos.
     ------------------------------------------------------------------------ */
  function Builder(n, nDust, seed) {
    this.n = n; this.i = nDust; this.first = nDust;
    this.rnd = mulberry32(seed);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.c = new Uint8Array(n); this.s = new Float32Array(n);
    this.a = new Float32Array(n); this.tw = new Float32Array(n);
    this.fp = new Int16Array(n); this.ph = new Float32Array(n); this.sp = new Float32Array(n);
    this.a.fill(NaN); this.fp.fill(-1);
    this.paths = []; this.twk = 1;
  }
  var B = Builder.prototype;

  B.g = function () { var u = 1 - this.rnd(), v = this.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  B.pick = function (c) { return Array.isArray(c) ? c[(this.rnd() * c.length) | 0] : c; };
  B.sz = function (s) { return Array.isArray(s) ? s[0] + (s[1] - s[0]) * this.rnd() : s; };
  B.room = function () { return this.n - this.i; };
  B.add = function (x, y, z, c, s, a) {
    if (this.i >= this.n) return false;
    var i = this.i++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.c[i] = this.pick(c); this.s[i] = this.sz(s);
    if (a !== undefined) this.a[i] = a;
    this.tw[i] = this.twk;
    return true;
  };

  /* Segmento de puntos. even: separacion pareja (parece una linea de texto). */
  B.line = function (x0, y0, z0, x1, y1, z1, count, c, s, j, even) {
    j = j || 0;
    for (var k = 0; k < count; k++) {
      var t = even ? (k + 0.5) / count : (k + this.rnd()) / count;
      this.add(x0 + (x1 - x0) * t + this.g() * j, y0 + (y1 - y0) * t + this.g() * j, z0 + (z1 - z0) * t + this.g() * j, c, s);
    }
  };
  B.ring = function (cx, cy, cz, r, count, c, s, j, plane) {
    j = j || 0;
    for (var k = 0; k < count; k++) {
      var a = TAU * (k + this.rnd() * 0.5) / count, u = Math.cos(a) * r, v = Math.sin(a) * r;
      if (plane === 'xz') this.add(cx + u, cy, cz + v, c, s);
      else if (plane === 'yz') this.add(cx, cy + u, cz + v, c, s);
      else this.add(cx + u + this.g() * j, cy + v + this.g() * j, cz + this.g() * j, c, s);
    }
  };
  B.disc = function (cx, cy, cz, r, count, c, s) {
    for (var k = 0; k < count; k++) {
      var a = this.rnd() * TAU, d = r * Math.sqrt(this.rnd());
      this.add(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cz, c, s);
    }
  };
  B.rectEdge = function (cx, cy, cz, hw, hh, count, c, s, j) {
    var per = 4 * (hw + hh);
    for (var k = 0; k < count; k++) {
      var d = ((k + this.rnd()) / count) * per, x, y;
      if (d < 2 * hw) { x = -hw + d; y = hh; }
      else if (d < 2 * hw + 2 * hh) { x = hw; y = hh - (d - 2 * hw); }
      else if (d < 4 * hw + 2 * hh) { x = hw - (d - 2 * hw - 2 * hh); y = -hh; }
      else { x = -hw; y = -hh + (d - 4 * hw - 2 * hh); }
      this.add(cx + x + this.g() * (j || 0), cy + y + this.g() * (j || 0), cz + this.g() * (j || 0), c, s);
    }
  };
  B.rectFill = function (cx, cy, cz, hw, hh, count, c, s) {
    for (var k = 0; k < count; k++) this.add(cx + (this.rnd() * 2 - 1) * hw, cy + (this.rnd() * 2 - 1) * hh, cz + this.g() * 0.01, c, s);
  };
  /* Rectangulo de esquinas redondeadas: punto del perimetro en t (0..1). */
  function rrPoint(hw, hh, rc, t) {
    var a = 2 * (hw - rc), b = 2 * (hh - rc), q = Math.PI * rc / 2, L = 2 * a + 2 * b + 4 * q, s = frac(t) * L, th;
    if (s < a) return [-hw + rc + s, hh]; s -= a;
    if (s < q) { th = s / rc; return [hw - rc + rc * Math.sin(th), hh - rc + rc * Math.cos(th)]; } s -= q;
    if (s < b) return [hw, hh - rc - s]; s -= b;
    if (s < q) { th = s / rc; return [hw - rc + rc * Math.cos(th), -hh + rc - rc * Math.sin(th)]; } s -= q;
    if (s < a) return [hw - rc - s, -hh]; s -= a;
    if (s < q) { th = s / rc; return [-hw + rc - rc * Math.sin(th), -hh + rc - rc * Math.cos(th)]; } s -= q;
    if (s < b) return [-hw, -hh + rc + s]; s -= b;
    th = s / rc; return [-hw + rc - rc * Math.cos(th), hh - rc + rc * Math.sin(th)];
  }
  B.rrectEdge = function (cx, cy, cz, hw, hh, rc, count, c, s, j) {
    for (var k = 0; k < count; k++) {
      var p = rrPoint(hw, hh, rc, (k + this.rnd()) / count);
      this.add(cx + p[0] + this.g() * (j || 0), cy + p[1] + this.g() * (j || 0), cz + this.g() * (j || 0), c, s);
    }
  };
  B.rrectFill = function (cx, cy, cz, hw, hh, rc, count, c, s) {
    var k = 0, guard = 0;
    while (k < count && guard++ < count * 8) {
      var x = (this.rnd() * 2 - 1) * hw, y = (this.rnd() * 2 - 1) * hh;
      var qx = Math.abs(x) - (hw - rc), qy = Math.abs(y) - (hh - rc);
      if (qx > 0 && qy > 0 && qx * qx + qy * qy > rc * rc) continue;
      this.add(cx + x, cy + y, cz + this.g() * 0.006, c, s); k++;
    }
  };

  /* Trayectorias: polilineas de las que salen puntos fijos y tambien puntos
     que viajan (paquetes, pulsos de datos). */
  function makePath(pts) {
    var cum = [0], L = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], dz = pts[i][2] - pts[i - 1][2];
      L += Math.sqrt(dx * dx + dy * dy + dz * dz); cum.push(L);
    }
    return { p: pts, c: cum, L: L || 1 };
  }
  function pathAt(path, u, out) {
    var d = u * path.L, lo = 0, hi = path.c.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (path.c[mid] <= d) lo = mid; else hi = mid; }
    var seg = (path.c[hi] - path.c[lo]) || 1, f = (d - path.c[lo]) / seg, a = path.p[lo], b = path.p[hi];
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  }
  function bezier(p0, p1, p2, p3, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]]);
    }
    return pts;
  }
  B.path = function (pts) { this.paths.push(makePath(pts)); return this.paths.length - 1; };
  /* Puntos fijos repartidos sobre una polilinea; cfn(u) devuelve el color. */
  B.poly = function (pts, count, c, s, j, cfn) {
    var path = makePath(pts), o = [0, 0, 0];
    for (var k = 0; k < count; k++) {
      var u = (k + this.rnd()) / count; pathAt(path, u, o);
      this.add(o[0] + this.g() * (j || 0), o[1] + this.g() * (j || 0), o[2] + this.g() * (j || 0), cfn ? cfn(u, this) : c, s);
    }
  };
  /* Puntos que recorren la trayectoria id (ciclos por segundo; negativo = al reves). */
  B.flow = function (id, count, c, s, v0, v1) {
    var path = this.paths[id], o = [0, 0, 0];
    for (var k = 0; k < count; k++) {
      var i = this.i, u = this.rnd();
      pathAt(path, u, o);
      if (!this.add(o[0], o[1], o[2], c, s)) return;
      this.fp[i] = id; this.ph[i] = u; this.sp[i] = v0 + (v1 - v0) * this.rnd();
    }
  };
  /* Rellena lo que falte duplicando puntos ya puestos: nunca quedan huecos. */
  B.done = function () {
    var span = this.i - this.first, guard = 0;
    if (span < 1) { this.add(0, 0, 0, V, 3); span = 1; }
    while (this.i < this.n && guard++ < this.n * 2) {
      var src = this.first + ((this.rnd() * span) | 0);
      if (this.fp[src] >= 0) continue;
      this.add(this.x[src] + this.g() * 0.012, this.y[src] + this.g() * 0.012, this.z[src] + this.g() * 0.012, this.c[src], this.s[src] * 0.85, isNaN(this.a[src]) ? undefined : this.a[src]);
    }
    /* Orden por x: al viajar de una forma a otra la nube conserva su izquierda
       y su derecha en vez de cruzarse toda. */
    var idx = [], k;
    for (k = this.first; k < this.n; k++) idx.push(k);
    var self = this;
    idx.sort(function (p, q) { return (self.x[p] + 0.12 * self.y[p]) - (self.x[q] + 0.12 * self.y[q]); });
    var fields = ['x', 'y', 'z', 'c', 's', 'a', 'tw', 'fp', 'ph', 'sp'], f, tmp;
    for (f = 0; f < fields.length; f++) {
      var arr = this[fields[f]]; tmp = arr.slice();
      for (k = 0; k < idx.length; k++) arr[this.first + k] = tmp[idx[k]];
    }
    return this;
  };

  /* ------------------------------------------------------------------------
     Escenas. Cada una reparte los puntos de la nube en una forma.
     yaw0/yawAmp/yawSpd: giro de lado a lado; pitch0: inclinacion; roll: giro
     sobre su propio eje (rad/s); k: tamano relativo.
     ------------------------------------------------------------------------ */
  var SCENES = {};
  function qf(b) { var T = b.room(); return function (f) { return Math.max(1, Math.round(f * T)); }; }

  function tri(b, x, y, z, s, c, count, sz) {   // triangulo de contorno (la marca)
    var A = [x, y + s, z], Bb = [x + s * 0.87, y - s * 0.5, z], C = [x - s * 0.87, y - s * 0.5, z];
    b.line(A[0], A[1], z, Bb[0], Bb[1], z, count, c, sz, 0.002, true);
    b.line(Bb[0], Bb[1], z, C[0], C[1], z, count, c, sz, 0.002, true);
    b.line(C[0], C[1], z, A[0], A[1], z, count, c, sz, 0.002, true);
  }
  function fan(b, x, y, z, r, count, cols, sz) {  // ventilador: aro, nucleo y aspas
    b.ring(x, y, z, r, count, cols, sz, 0.002);
    b.ring(x, y, z, r * 0.34, Math.max(4, Math.round(count * 0.35)), WHT, [2.4, 3]);
    for (var a = 0; a < 3; a++) {
      var t = a * TAU / 3 + 0.5;
      b.line(x + Math.cos(t) * r * 0.34, y + Math.sin(t) * r * 0.34, z, x + Math.cos(t + 0.5) * r * 0.92, y + Math.sin(t + 0.5) * r * 0.92, z, Math.max(3, Math.round(count * 0.28)), cols, 2.6, 0.002, true);
    }
  }

  /* Chip: portada y cierre. Dado central con contactos en los cuatro lados y trazas que
     abren en abanico para llevar datos a nodos. */
  SCENES.chip = {
    yaw0: -0.3, yawAmp: 0.3, yawSpd: 0.23, pitch0: 0.3, pitchAmp: 0.05, roll: 0, k: 1,
    build: function (b) {
      var T = b.room(), q = qf(b), h = 0.44, rc = 0.085, zt = -0.05, zb = 0.05, k, side, i, x;
      b.rrectEdge(0, 0, zt, h, h, rc, q(0.11), [WHT, WHT, LAV], [4.4, 5.4], 0.003);
      b.rrectEdge(0, 0, zt - 0.012, h * 0.86, h * 0.86, rc * 0.8, q(0.065), [V, LAV], 3.8, 0.003);
      b.rrectEdge(0, 0, zt - 0.024, h * 0.7, h * 0.7, rc * 0.6, q(0.05), [V, BLU], 3.4, 0.003);
      b.rrectFill(0, 0, zt, h * 0.64, h * 0.64, rc, q(0.09), [V, V, V, LAV, BLU, MAG], [2.4, 3.2]);
      b.rrectFill(0, 0, zb, h * 0.9, h * 0.9, rc, q(0.03), [V, BLU], 2.4);
      // nucleo con retícula: un procesador, no una pantalla
      b.rectEdge(0, 0, zt - 0.04, 0.2, 0.2, q(0.045), [WHT, LAV], 4, 0.002);
      b.rectFill(0, 0, zt - 0.04, 0.16, 0.16, q(0.05), [WHT, LAV, LAV, AMB], [3.4, 4.8]);
      for (x = -1; x <= 1; x += 2) {
        b.line(x * 0.2, -0.3, zt - 0.03, x * 0.2, 0.3, zt - 0.03, q(0.012), V, 2.8, 0.002, true);
        b.line(-0.3, x * 0.2, zt - 0.03, 0.3, x * 0.2, zt - 0.03, q(0.012), V, 2.8, 0.002, true);
      }
      b.disc(-h * 0.8, h * 0.8, zt - 0.02, 0.03, 8, AMB, [4, 5]);          // marca del pin 1
      // contactos: 12 por lado, como los de un procesador
      var pn = Math.max(3, Math.round(T * 0.0034)), np = 12, len = 0.14;
      for (side = 0; side < 4; side++) {
        for (k = 0; k < np; k++) {
          var p = -0.37 + 0.74 * k / (np - 1), x0, y0, x1, y1;
          if (side === 0) { x0 = p; y0 = h; x1 = p; y1 = h + len; }
          else if (side === 1) { x0 = h; y0 = p; x1 = h + len; y1 = p; }
          else if (side === 2) { x0 = p; y0 = -h; x1 = p; y1 = -h - len; }
          else { x0 = -h; y0 = p; x1 = -h - len; y1 = p; }
          b.line(x0, y0, -0.02, x1, y1, -0.02, pn, k % 2 ? LAV : WHT, [3, 3.8], 0.002, true);
        }
      }
      // trazas: tres por lado, abiertas en abanico hacia nodos
      var normals = [[0, 1], [1, 0], [0, -1], [-1, 0]], tcount = q(0.016), fl = q(0.0032), stops = [V, BLU, TEAL, MAG, AMB];
      var traceColor = function (u, bb) { return stops[Math.min(4, Math.max(0, Math.floor(u * 5 + (bb.rnd() - 0.5) * 1.2)))]; };
      var picks = [1, 5, 10];
      for (side = 0; side < 4; side++) {
        for (i = 0; i < 3; i++) {
          k = picks[i];
          var pp = -0.37 + 0.74 * k / (np - 1), nx = normals[side][0], ny = normals[side][1];
          var ex = (side === 0 || side === 2) ? pp : (side === 1 ? h + len : -h - len);
          var ey = (side === 1 || side === 3) ? pp : (side === 0 ? h + len : -h - len);
          var fan = (i - 1) * 0.95 + (b.rnd() - 0.5) * 0.25;
          var th = Math.atan2(ny, nx) + (side % 2 ? -fan : fan), rho = 0.88 + b.rnd() * 0.22;
          var nX = Math.cos(th) * rho, nY = Math.sin(th) * rho, nZ = (b.rnd() - 0.5) * 0.5;
          var pts = bezier([ex, ey, -0.02], [ex + nx * 0.16, ey + ny * 0.16, -0.02 + nZ * 0.2],
            [nX - Math.cos(th) * 0.24, nY - Math.sin(th) * 0.24, nZ * 0.8], [nX, nY, nZ], 28);
          b.poly(pts, tcount, 0, [2.4, 3.2], 0.004, traceColor);
          b.flow(b.path(pts), fl, [WHT, LAV], [3.6, 4.6], 0.05, 0.12);
          b.disc(nX, nY, nZ, 0.028, q(0.004), [AMB, AMB, MAG, TEAL], [3, 4.4]);
          b.add(nX, nY, nZ, WHT, 6.5);
        }
      }
      for (k = q(0.035); k > 0; k--) {
        var a = b.rnd() * TAU, rr = 0.6 + b.rnd() * 0.75;
        b.add(Math.cos(a) * rr, Math.sin(a) * rr, (b.rnd() - 0.5) * 0.9, [V, LAV, BLU, TEAL, AMB, MAG], [1.8, 2.8]);
      }
      b.done();
    }
  };

  /* Lista de precios: filas de texto; las que cambiaron destellan en ambar (subio) o verde (bajo). */
  SCENES.changes = {
    yaw0: 0.4, yawAmp: 0.1, yawSpd: 0.19, pitch0: 0.1, pitchAmp: 0.03, roll: 0, k: 0.98,
    build: function (b) {
      var q = qf(b), rows = 15, r, up = { 2: 1, 5: 1, 9: 1, 12: 1 }, dn = { 4: 1, 10: 1 };
      b.rectEdge(0, 0, 0, 0.92, 0.88, q(0.07), [LAV, V], 3.2, 0.004);
      b.line(-0.8, 0.76, 0, -0.2, 0.76, 0, q(0.03), V, [3.6, 4.6], 0.003, true);
      b.line(0.3, 0.76, 0, 0.8, 0.76, 0, q(0.02), LAV, 3, 0.003, true);
      b.line(-0.84, 0.66, 0, 0.84, 0.66, 0, q(0.05), V, 2.6, 0.003, true);
      var per = Math.floor(q(0.72) / rows);
      for (r = 0; r < rows; r++) {
        var y = 0.54 - r * 0.087, flagged = up[r] || dn[r], nl = 0.22 + b.rnd() * 0.36;
        b.twk = 1;
        b.line(-0.8, y, 0, -0.8 + nl, y, 0, Math.round(per * 0.5), flagged ? [WHT, WHT, LAV] : [LAV, V, V, WHT], flagged ? [3, 3.8] : [2.2, 3], 0.003, true);
        b.line(-0.05, y, 0, 0.1, y, 0, Math.round(per * 0.14), LAV, [2.2, 2.8], 0.003, true);
        var cp = up[r] ? AMB : dn[r] ? TEAL : [V, LAV, WHT];
        if (flagged) b.twk = 3;
        b.line(0.36, y, 0, 0.72, y, 0, Math.round(per * 0.36), cp, flagged ? [3.8, 5] : [2.2, 3], 0.003, true);
        if (flagged) b.add(0.85, y, 0, cp, 7, up[r] ? -Math.PI / 2 : Math.PI / 2);
        b.twk = 1;
      }
      b.done();
    }
  };

  /* Hoja de documento: PDF, cotizacion y A4 comparten el mismo constructor. */
  function sheet(b, o) {
    var n = o.n, cx = o.cx, cy = o.cy, cz = o.cz, hw = o.hw, hh = o.hh, dim = !!o.dim, r, i;
    var q = function (f) { return Math.max(1, Math.round(f * n)); };
    var edge = dim ? [V, V, LAV] : [LAV, V, WHT], ink = dim ? [V, LAV] : [LAV, WHT, WHT, V];
    var L = function (x0, x1, y, f, col, sz) { b.line(cx + x0 * hw, cy + y * hh, cz, cx + x1 * hw, cy + y * hh, cz, Math.max(2, q(f)), col, sz, 0.002, true); };
    if (o.fold) {
      var fx = 0.36, fy = 0.26;
      L(-1, 1 - fx, 1, 0.045, edge, 3.2);
      b.line(cx + (1 - fx) * hw, cy + hh, cz, cx + hw, cy + (1 - fy) * hh, cz, q(0.02), AMB, 3.6, 0.002, true);
      b.line(cx + hw, cy + (1 - fy) * hh, cz, cx + hw, cy - hh, cz, q(0.04), edge, 3.2, 0.003);
      L(1, -1, -1, 0.045, edge, 3.2);
      b.line(cx - hw, cy - hh, cz, cx - hw, cy + hh, cz, q(0.045), edge, 3.2, 0.003);
      b.line(cx + (1 - fx) * hw, cy + hh, cz, cx + (1 - fx) * hw, cy + (1 - fy) * hh, cz, q(0.012), AMB, 3, 0.002, true);
      b.line(cx + (1 - fx) * hw, cy + (1 - fy) * hh, cz, cx + hw, cy + (1 - fy) * hh, cz, q(0.012), AMB, 3, 0.002, true);
    } else b.rectEdge(cx, cy, cz, hw, hh, q(0.16), edge, 3.2, 0.003);

    if (o.kind === 'pdf') {
      b.rectEdge(cx - 0.62 * hw, cy + 0.8 * hh, cz, 0.17 * hw, 0.05 * hh, q(0.03), MAG, 3.4, 0.002);
      L(-0.36, 0.06, 0.8, 0.025, WHT, [3.4, 4]);
      var y = 0.62;
      for (r = 0; r < 17; r++) {
        if (r === 5 || r === 11) y -= 0.07;
        var last = (r === 4 || r === 10 || r === 16), x1 = -0.82 + 1.64 * (last ? 0.25 + b.rnd() * 0.3 : 0.62 + b.rnd() * 0.38);
        L(-0.82, x1, y, 0.034, ink, [2.2, 3]);
        if (b.rnd() < 0.3) { var xs = -0.7 + b.rnd() * 1.1; L(xs, xs + 0.32, y, 0.012, TEAL, [3.4, 4.2]); }
        y -= 0.085;
      }
      return;
    }
    tri(b, cx - 0.7 * hw, cy + 0.82 * hh, cz, 0.075 * hh, V, Math.max(3, q(0.008)), 3.4);
    L(-0.42, 0.05, 0.84, 0.024, WHT, [3.6, 4.4]);
    L(-0.42, -0.1, 0.77, 0.014, LAV, 3);
    L(0.3, 0.88, 0.86, 0.014, LAV, 3);
    L(0.45, 0.88, 0.79, 0.012, LAV, 3);
    L(-0.88, -0.3, 0.6, 0.016, ink, 3);
    L(-0.88, -0.55, 0.53, 0.014, ink, 3);
    L(-0.88, 0.88, 0.42, 0.04, V, [3.2, 3.8]);
    for (i = 0; i < 8; i++) {
      var yy = 0.32 - i * 0.1;
      L(-0.82, -0.82 + 0.7 + b.rnd() * 0.5, yy, 0.03, ink, [2.4, 3]);
      L(0.18, 0.27, yy, 0.008, LAV, 2.6);
      L(0.5, 0.88, yy, 0.017, ink, [2.4, 3]);
      if (o.numbered) b.disc(cx - 0.94 * hw, cy + yy * hh, cz, 0.012, 2, TEAL, 3.2);
    }
    L(0.3, 0.88, -0.55, 0.014, ink, 3);
    L(0.3, 0.88, -0.63, 0.014, ink, 3);
    L(0.05, 0.88, -0.75, 0.05, AMB, [4, 5]);
    b.ring(cx - 0.55 * hw, cy - 0.7 * hh, cz, 0.1 * hw, Math.max(6, q(0.02)), MAG, 3.2, 0.002);
    if (o.numbered) {
      b.rectEdge(cx + 0.6 * hw, cy + 0.66 * hh, cz, 0.27 * hw, 0.05 * hh, q(0.03), TEAL, 3.2, 0.002);
      L(-0.88, 0.2, -0.88, 0.022, AMB, 3);
      L(-0.2, 0.2, -0.96, 0.012, LAV, 2.8);
    }
  }
  SCENES.pdf = {
    yaw0: -0.36, yawAmp: 0.12, yawSpd: 0.2, pitch0: 0.08, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) { sheet(b, { kind: 'pdf', cx: 0, cy: 0, cz: 0, hw: 0.62, hh: 0.86, n: b.room(), fold: true }); b.done(); }
  };
  SCENES.quote = {
    yaw0: 0.34, yawAmp: 0.12, yawSpd: 0.2, pitch0: 0.08, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) { sheet(b, { kind: 'quote', cx: 0, cy: 0, cz: 0, hw: 0.62, hh: 0.86, n: b.room() }); b.done(); }
  };
  SCENES.a4 = {
    yaw0: -0.42, yawAmp: 0.12, yawSpd: 0.18, pitch0: 0.1, pitchAmp: 0.03, roll: 0, k: 0.86,
    build: function (b) {
      var T = b.room();
      sheet(b, { kind: 'quote', numbered: true, cx: -0.16, cy: -0.02, cz: -0.14, hw: 0.6, hh: 0.84, n: Math.round(T * 0.74) });
      sheet(b, { kind: 'quote', dim: true, cx: 0.5, cy: 0.1, cz: 0.4, hw: 0.56, hh: 0.8, n: Math.round(T * 0.24) });
      b.done();
    }
  };

  /* Torre de PC de panel de vidrio: placa, ventiladores, memoria, grafica y fuente. */
  SCENES.tower = {
    yaw0: -0.55, yawAmp: 0.24, yawSpd: 0.2, pitch0: 0.16, pitchAmp: 0.03, roll: 0, k: 0.9,
    build: function (b) {
      var q = qf(b), hw = 0.4, hh = 0.88, dz = 0.34, zf = -dz, zk = dz, zi = zf + 0.05, sx, sy, i;
      b.rectEdge(0, 0, zf, hw, hh, q(0.09), [LAV, WHT], 3.6, 0.003);
      b.rectEdge(0, 0, zk, hw, hh, q(0.05), V, 3, 0.003);
      for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) b.line(sx * hw, sy * hh, zf, sx * hw, sy * hh, zk, q(0.012), V, 3, 0.002, true);
      b.line(-hw * 0.85, -hh - 0.05, zf, -hw * 0.55, -hh - 0.05, zf, q(0.008), LAV, 3, 0.002, true);
      b.line(hw * 0.55, -hh - 0.05, zf, hw * 0.85, -hh - 0.05, zf, q(0.008), LAV, 3, 0.002, true);
      b.rectEdge(-0.05, 0.08, zi, 0.3, 0.62, q(0.05), V, 3, 0.003);
      for (i = 0; i < 4; i++) b.line(-0.35, 0.5 - i * 0.28, zi, 0.25, 0.5 - i * 0.28, zi, q(0.006), V, 2.4, 0.002, true);
      b.rectFill(-0.06, 0.42, zi, 0.05, 0.05, q(0.02), [LAV, WHT], 2.8);
      fan(b, -0.06, 0.42, zi, 0.15, q(0.045), [TEAL, BLU], 3);
      for (i = 0; i < 4; i++) b.line(0.12 + i * 0.03, 0.28, zi, 0.12 + i * 0.03, 0.66, zi, q(0.01), AMB, 3.2, 0.001, true);
      b.rectEdge(-0.05, -0.06, zi, 0.3, 0.075, q(0.05), [V, LAV], 3.2, 0.002);
      fan(b, -0.19, -0.06, zi, 0.06, q(0.03), [MAG, BLU], 3);
      fan(b, 0.05, -0.06, zi, 0.06, q(0.03), [MAG, BLU], 3);
      b.rectEdge(0, -0.74, zi, 0.37, 0.11, q(0.04), [V, V, LAV], 3, 0.002);
      fan(b, -0.2, -0.74, zi, 0.07, q(0.03), [V, LAV], 2.8);
      fan(b, 0.315, 0.62, zi, 0.065, q(0.04), [MAG, LAV], 3);
      fan(b, 0.315, 0.36, zi, 0.065, q(0.04), [BLU, LAV], 3);
      fan(b, 0.315, 0.1, zi, 0.065, q(0.04), [TEAL, LAV], 3);
      b.ring(0.28, 0.84, zf, 0.03, 8, AMB, 3.6);
      b.done();
    }
  };

  /* Visor: una foto de una lista que se lee y se convierte en cotizacion. */
  SCENES.viewfinder = {
    yaw0: 0.22, yawAmp: 0.16, yawSpd: 0.22, pitch0: 0.06, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), fw = 0.9, fh = 0.62, arm = 0.26, sx, sy, r;
      for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) {
        b.line(sx * fw, sy * fh, 0, sx * (fw - arm), sy * fh, 0, q(0.05), [LAV, WHT], 4, 0.003, true);
        b.line(sx * fw, sy * fh, 0, sx * fw, sy * (fh - arm), 0, q(0.05), [LAV, WHT], 4, 0.003, true);
      }
      b.line(-0.05, 0, 0, 0.05, 0, 0, q(0.008), V, 3.4, 0.001, true);
      b.line(0, -0.05, 0, 0, 0.05, 0, q(0.008), V, 3.4, 0.001, true);
      b.rectEdge(0, 0, 0, fw, fh, q(0.08), V, 2.2, 0.003);
      for (r = 0; r < 9; r++) {
        var y = 0.44 - r * 0.108, len = 0.5 + b.rnd() * 0.85;
        b.line(-0.72, y, 0, -0.72 + len, y, 0, q(0.022), [LAV, V, V], [2.2, 2.8], 0.003, true);
        b.line(0.42, y, 0, 0.72, y, 0, q(0.01), [V, LAV], 2.4, 0.003, true);
      }
      for (r = 0; r < 3; r++) {
        var yy = 0.33 - r * 0.216;
        b.twk = 3;
        b.line(-0.72, yy, 0, 0.72, yy, 0, q(0.03), AMB, [3.4, 4.4], 0.003, true);
        b.add(-0.82, yy, 0, AMB, 6.5, -Math.PI / 2);
        b.twk = 1;
      }
      b.line(-fw, 0.12, 0, fw, 0.12, 0, q(0.05), TEAL, 3.2, 0.002, true);
      b.done();
    }
  };

  /* Seguimiento: una columna de cotizaciones con su estado; una lleva dias sin respuesta. */
  SCENES.timeline = {
    yaw0: -0.3, yawAmp: 0.14, yawSpd: 0.21, pitch0: 0.08, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), i, cols = [BLU, AMB, TEAL, MAG, AMB, BLU];
      b.line(-0.62, -0.88, 0, -0.62, 0.88, 0, q(0.06), [LAV, V], 2.8, 0.002, true);
      for (i = 0; i < 6; i++) {
        var y = 0.7 - i * 0.28;
        b.ring(-0.62, y, 0, 0.055, q(0.012), cols[i], 3.6, 0.002);
        b.disc(-0.62, y, 0, 0.03, q(0.01), cols[i], [3, 4]);
        b.line(-0.42, y + 0.03, 0, -0.42 + 0.34 + b.rnd() * 0.3, y + 0.03, 0, q(0.05), [WHT, LAV], [2.6, 3.4], 0.002, true);
        b.line(-0.42, y - 0.055, 0, -0.42 + 0.2 + b.rnd() * 0.16, y - 0.055, 0, q(0.02), V, 2.4, 0.002, true);
        b.rectEdge(0.62, y, 0, 0.13, 0.045, q(0.02), cols[i], 3, 0.002);
      }
      b.twk = 3;
      b.ring(0.9, 0.14, 0, 0.075, q(0.018), AMB, 4, 0.002);
      b.line(0.9, 0.14, 0, 0.9, 0.2, 0, 4, AMB, 3.4, 0, true);
      b.line(0.9, 0.14, 0, 0.94, 0.12, 0, 3, AMB, 3.4, 0, true);
      b.twk = 1;
      b.done();
    }
  };

  /* Sedes: tres puntos de venta y paquetes que viajan entre ellos. */
  SCENES.network = {
    yaw0: 0.05, yawAmp: 0.5, yawSpd: 0.17, pitch0: 0.32, pitchAmp: 0.05, roll: 0, k: 1.02,
    build: function (b) {
      var q = qf(b), N = [[-0.72, -0.3, -0.12], [0.72, -0.3, 0.16], [0, 0.66, 0]], i, j, e;
      for (i = 0; i < 3; i++) {
        var n = N[i];
        b.ring(n[0], n[1], n[2], 0.17, q(0.04), LAV, 3.6, 0.002);
        b.ring(n[0], n[1], n[2], 0.1, q(0.025), V, 3.2, 0.002);
        b.disc(n[0], n[1], n[2], 0.055, q(0.03), [WHT, AMB, LAV], [3.4, 4.6]);
        b.add(n[0], n[1] + 0.3, n[2], MAG, 6.5, -Math.PI / 2);
        b.line(n[0] - 0.13, n[1] - 0.29, n[2], n[0] + 0.13, n[1] - 0.29, n[2], q(0.014), LAV, 2.8, 0.001, true);
      }
      var E = [[0, 1, 0.34], [1, 2, -0.3], [2, 0, 0.3]];
      for (e = 0; e < 3; e++) {
        var A = N[E[e][0]], C = N[E[e][1]], mx = (A[0] + C[0]) / 2, my = (A[1] + C[1]) / 2, bulge = E[e][2];
        var dx = C[0] - A[0], dy = C[1] - A[1], len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
        var pts = bezier([A[0], A[1], A[2]], [mx + nx * bulge * 0.9 - dx * 0.2, my + ny * bulge * 0.9 - dy * 0.2, 0.32], [mx + nx * bulge * 0.9 + dx * 0.2, my + ny * bulge * 0.9 + dy * 0.2, 0.32], [C[0], C[1], C[2]], 30);
        b.poly(pts, q(0.05), [V, V, LAV, BLU], [2.2, 3], 0.003);
        var id = b.path(pts);
        b.flow(id, q(0.014), [AMB, WHT], [4, 5], 0.06, 0.1);
        b.flow(id, q(0.014), [WHT, TEAL], [3.6, 4.6], -0.1, -0.06);
      }
      for (j = q(0.05); j > 0; j--) {
        var a = b.rnd() * TAU, rr = 0.3 + b.rnd() * 0.85;
        b.add(Math.cos(a) * rr * 1.3, Math.sin(a) * rr * 0.9 + 0.1, (b.rnd() - 0.5) * 0.9, [V, LAV, BLU, TEAL, AMB], [1.8, 2.8]);
      }
      b.done();
    }
  };

  /* Cierre de caja: barras del mes (el mejor dia en ambar), promedio y base. */
  SCENES.bars = {
    yaw0: 0.32, yawAmp: 0.12, yawSpd: 0.2, pitch0: 0.16, pitchAmp: 0.03, roll: 0, k: 0.88,
    build: function (b) {
      var q = qf(b), n = 24, i, hs = [], sum = 0, best = 0;
      for (i = 0; i < n; i++) {
        var h = 0.16 + 0.42 * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + 0.6))) + 0.012 * i;
        hs.push(h); sum += h; if (h > hs[best]) best = i;
      }
      hs[best] += 0.22; sum += 0.22;
      var base = -0.62, total = q(0.6);
      for (i = 0; i < n; i++) {
        var x = -0.84 + i * (1.68 / (n - 1)), cnt = Math.max(3, Math.round(total * hs[i] / sum)), isBest = i === best;
        for (var k = 0; k < cnt; k++) {
          var t = k / cnt;
          b.add(x + b.g() * 0.006, base + t * hs[i], b.g() * 0.006, isBest ? (t > 0.7 ? [AMB, WHT] : AMB) : (t > 0.75 ? [LAV, WHT] : (t > 0.4 ? [V, LAV] : V)), isBest ? [3.4, 4.6] : [2.4, 3.4]);
        }
        b.add(x, base + hs[i] + 0.03, 0, isBest ? AMB : WHT, isBest ? 6.5 : 4.4, -Math.PI / 2);
      }
      b.line(-0.9, base - 0.03, 0, 0.9, base - 0.03, 0, q(0.05), LAV, 2.6, 0.002, true);
      b.line(-0.9, base + sum / n, 0, 0.9, base + sum / n, 0, q(0.045), TEAL, 3, 0.002, true);
      b.done();
    }
  };

  /* Historial: buscador arriba y el calendario del mes, con hoy en ambar. */
  SCENES.calendar = {
    yaw0: -0.3, yawAmp: 0.12, yawSpd: 0.2, pitch0: 0.12, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), c, r, cell = 0.115;
      b.rectEdge(0, 0.8, 0, 0.82, 0.075, q(0.07), LAV, 3.4, 0.003);
      b.ring(-0.7, 0.8, 0, 0.035, q(0.012), WHT, 3.2, 0.001);
      b.line(-0.675, 0.775, 0, -0.64, 0.74, 0, 4, WHT, 3.2, 0, true);
      b.line(-0.5, 0.8, 0, -0.1, 0.8, 0, q(0.02), V, 2.6, 0.001, true);
      for (c = 0; c < 7; c++) b.line(-0.72 + c * 0.24 - 0.05, 0.58, 0, -0.72 + c * 0.24 + 0.05, 0.58, 0, q(0.006), LAV, 2.6, 0.001, true);
      for (r = 0; r < 5; r++) for (c = 0; c < 7; c++) {
        var x = -0.72 + c * 0.24, y = 0.4 - r * 0.24, today = (r === 2 && c === 4), has = b.rnd() < 0.72;
        b.rectEdge(x, y, 0, cell, cell, q(0.012), today ? AMB : [V, V, LAV], today ? 3.8 : 2.8, 0.002);
        if (today) b.twk = 3;
        if (has || today) b.rectFill(x, y, 0, cell * 0.7, cell * 0.7, q(today ? 0.014 : 0.007), today ? [AMB, WHT] : [V, LAV, WHT], [2.2, 3]);
        b.twk = 1;
      }
      b.done();
    }
  };

  /* Cuadre del dia: efectivo y digital que suman el total a entregar. */
  SCENES.balance = {
    yaw0: 0.3, yawAmp: 0.14, yawSpd: 0.2, pitch0: 0.14, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), y, k, base = -0.62;
      var col = function (x, w, h, cols, f) {
        var cnt = q(f);
        for (k = 0; k < cnt; k++) b.add(x + (b.rnd() - 0.5) * w, base + b.rnd() * h, b.g() * 0.01, cols, [2.4, 3.4]);
        b.rectEdge(x, base + h / 2, 0, w / 2, h / 2, q(0.05), cols, 3.4, 0.002);
      };
      col(-0.42, 0.34, 0.9, [V, V, LAV], 0.27);
      col(0.12, 0.34, 0.6, [TEAL, TEAL, WHT], 0.19);
      b.line(-0.85, base - 0.03, 0, 0.55, base - 0.03, 0, q(0.05), LAV, 2.6, 0.002, true);
      b.line(-0.55, base + 0.98, 0, -0.29, base + 0.98, 0, q(0.014), WHT, 3.4, 0.001, true);
      b.line(0.02, base + 0.68, 0, 0.22, base + 0.68, 0, q(0.014), WHT, 3.4, 0.001, true);
      b.line(0.5, base + 0.02, 0, 0.5, base + 0.9, 0, q(0.05), AMB, 3.2, 0.002, true);
      b.line(0.5, base + 0.9, 0, 0.42, base + 0.9, 0, q(0.008), AMB, 3.2, 0.001, true);
      b.line(0.5, base + 0.02, 0, 0.42, base + 0.02, 0, q(0.008), AMB, 3.2, 0.001, true);
      b.twk = 3;
      b.rectEdge(0.78, base + 0.46, 0, 0.13, 0.11, q(0.05), AMB, 4, 0.002);
      b.rectFill(0.78, base + 0.46, 0, 0.1, 0.08, q(0.05), [AMB, WHT], [3, 4]);
      b.twk = 1;
      b.done();
    }
  };

  /* Trabajo de cada asesor: ranking horizontal; el primero en ambar. */
  SCENES.ranking = {
    yaw0: -0.3, yawAmp: 0.12, yawSpd: 0.2, pitch0: 0.12, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), lens = [1.32, 1.08, 0.9, 0.66, 0.5, 0.32], i;
      for (i = 0; i < 6; i++) {
        var y = 0.62 - i * 0.25, top = i === 0, cols = top ? [AMB, AMB, WHT] : [V, V, LAV];
        b.ring(-0.86, y, 0, 0.07, q(0.014), top ? AMB : LAV, 3.4, 0.001);
        b.disc(-0.86, y + 0.02, 0, 0.022, 3, top ? WHT : LAV, 3);
        b.line(-0.74, y, 0, -0.74 + lens[i], y, 0, q(0.075 * (0.4 + lens[i] / 1.32)), cols, top ? [3.4, 4.4] : [2.6, 3.4], 0.008, true);
        b.line(0.62, y, 0, 0.62 + 0.05 + 0.04 * (6 - i) / 6, y, 0, q(0.006), top ? AMB : LAV, 2.6, 0.001, true);
      }
      b.done();
    }
  };

  /* Labs: una serie de precios y una caida de mil a cien mil que se detecta y se marca. */
  SCENES.spike = {
    yaw0: 0.3, yawAmp: 0.14, yawSpd: 0.2, pitch0: 0.14, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), pts = [], i, m = 28, sx = 0.34;
      for (i = 0; i <= m; i++) {
        var x = -0.86 + i * (1.72 / m), y = 0.34 + 0.07 * Math.sin(i * 1.9) + 0.03 * Math.cos(i * 4.1);
        if (i === 17) y = -0.5;
        pts.push([x, y, 0]);
      }
      b.poly(pts.slice(0, 17), q(0.15), [LAV, V, V], [2.6, 3.4], 0.003);
      b.poly(pts.slice(18), q(0.07), [LAV, V, V], [2.6, 3.4], 0.003);
      b.twk = 3;
      b.poly(pts.slice(16, 19), q(0.07), AMB, [3.6, 5], 0.003);
      b.ring(pts[17][0], pts[17][1], 0, 0.15, q(0.04), AMB, 4, 0.002);
      tri(b, pts[17][0], pts[17][1] - 0.32, 0, 0.09, AMB, q(0.008), 4);
      b.twk = 1;
      b.line(-0.9, 0.22, 0, 0.9, 0.22, 0, q(0.045), V, 2.6, 0.002, true);
      b.line(-0.9, 0.48, 0, 0.9, 0.48, 0, q(0.045), V, 2.6, 0.002, true);
      b.line(-0.9, -0.72, 0, -0.9, 0.7, 0, q(0.05), LAV, 2.6, 0.002, true);
      b.line(-0.9, -0.72, 0, 0.9, -0.72, 0, q(0.05), LAV, 2.6, 0.002, true);
      for (i = 0; i < 9; i++) b.line(-0.86 + i * 0.215, -0.72, 0, -0.86 + i * 0.215, -0.68, 0, 2, LAV, 2.4, 0, true);
      b.done();
    }
  };

  /* Trayectoria: una galaxia que gira; seis anillos, uno por mes. */
  SCENES.spiral = {
    yaw0: 0.0, yawAmp: 0.1, yawSpd: 0.15, pitch0: 0.95, pitchAmp: 0.05, roll: 0.1, k: 1.02,
    build: function (b) {
      var q = qf(b), arm, k, i, arms = 2, per = q(0.7) / arms;
      for (arm = 0; arm < arms; arm++) {
        for (k = 0; k < per; k++) {
          var t = Math.pow(b.rnd(), 0.85), th = t * 4.2 * Math.PI + arm * Math.PI, r = 0.07 + 0.93 * Math.pow(t, 0.92);
          var spread = 0.01 + 0.045 * t;
          b.add(Math.cos(th) * r + b.g() * spread, Math.sin(th) * r + b.g() * spread, b.g() * 0.03 * (1 - t * 0.5),
            t < 0.22 ? [AMB, WHT, LAV] : t < 0.5 ? [V, LAV, MAG] : [V, BLU, LAV, TEAL], t < 0.3 ? [3, 4.4] : [2.4, 3.4]);
        }
      }
      for (k = q(0.09); k > 0; k--) { var a = b.rnd() * TAU, rr = Math.abs(b.g()) * 0.1; b.add(Math.cos(a) * rr, Math.sin(a) * rr, b.g() * 0.04, [AMB, WHT, WHT], [3.4, 5]); }
      for (i = 1; i <= 6; i++) b.ring(0, 0, 0, i * 0.16, q(0.018), V, 2.4, 0.002);
      b.done();
    }
  };

  /* Como arranca: tres pasos en vertical (lista, marca, equipo) unidos por flechas. */
  SCENES.trio = {
    yaw0: -0.16, yawAmp: 0.2, yawSpd: 0.18, pitch0: 0.08, pitchAmp: 0.03, roll: 0, k: 1,
    build: function (b) {
      var q = qf(b), i;
      // 1. la lista
      b.rectEdge(0, 0.66, 0, 0.34, 0.22, q(0.06), LAV, 3.4, 0.003);
      for (i = 0; i < 4; i++) b.line(-0.26, 0.78 - i * 0.1, 0, -0.26 + 0.26 + (i % 2) * 0.2, 0.78 - i * 0.1, 0, q(0.03), i === 1 ? AMB : [LAV, V], [2.6, 3.4], 0.002, true);
      // 2. la marca
      tri(b, 0, 0.02, 0, 0.3, V, q(0.05), 3.6);
      tri(b, 0, -0.04, 0, 0.17, LAV, q(0.03), 3.2);
      b.disc(0, -0.06, 0, 0.075, q(0.05), [AMB, WHT], [3.4, 4.6]);
      // 3. el equipo
      for (i = -1; i <= 1; i++) {
        var x = i * 0.28, y = -0.7 + (i === 0 ? 0.04 : -0.02), s = i === 0 ? 1 : 0.82;
        b.ring(x, y + 0.11 * s, 0, 0.065 * s, q(0.016), TEAL, 3.4, 0.001);
        b.disc(x, y + 0.11 * s, 0, 0.03 * s, q(0.008), [TEAL, WHT], 3);
        b.line(x - 0.12 * s, y - 0.1 * s, 0, x - 0.05 * s, y + 0.02 * s, 0, q(0.012), TEAL, 3, 0.001, true);
        b.line(x + 0.12 * s, y - 0.1 * s, 0, x + 0.05 * s, y + 0.02 * s, 0, q(0.012), TEAL, 3, 0.001, true);
        b.line(x - 0.12 * s, y - 0.1 * s, 0, x + 0.12 * s, y - 0.1 * s, 0, q(0.014), TEAL, 3, 0.001, true);
      }
      // de un paso al siguiente
      b.line(0, 0.4, 0, 0, 0.3, 0, 3, AMB, 3, 0, true);
      b.add(0, 0.27, 0, AMB, 6.5, Math.PI / 2);
      b.line(0, -0.32, 0, 0, -0.42, 0, 3, AMB, 3, 0, true);
      b.add(0, -0.45, 0, AMB, 6.5, Math.PI / 2);
      b.done();
    }
  };

  /* Datos: un candado; entran datos revueltos y quedan guardados dentro. */
  SCENES.lock = {
    yaw0: -0.3, yawAmp: 0.32, yawSpd: 0.2, pitch0: 0.1, pitchAmp: 0.03, roll: 0, k: 0.92,
    build: function (b) {
      var q = qf(b), k, s, arc = [];
      b.rrectEdge(0.12, -0.24, 0, 0.46, 0.38, 0.07, q(0.12), [LAV, LAV, WHT], 3.8, 0.003);
      b.rrectFill(0.12, -0.24, 0, 0.44, 0.36, 0.07, q(0.17), [V, V, LAV], [2.4, 3.2]);
      for (k = 0; k <= 24; k++) { var t = Math.PI * (1 - k / 24); arc.push([0.12 + Math.cos(t) * 0.3, 0.16 + Math.sin(t) * 0.34, 0]); }
      var leg1 = [[-0.18, 0.15, 0]].concat(arc.slice(0, 1)), sh = [[-0.18, 0.15, 0]].concat(arc).concat([[0.42, 0.15, 0]]);
      for (s = -1; s <= 1; s += 2) b.poly(sh.map(function (p) { return [p[0], p[1], p[2] + s * 0.03]; }), q(0.07), [WHT, LAV], [3, 4], 0.002);
      b.twk = 3;
      b.disc(0.12, -0.18, 0, 0.075, q(0.05), [AMB, AMB, WHT], [3.2, 4.4]);
      b.line(0.12, -0.26, 0, 0.12, -0.42, 0, q(0.02), AMB, 3.6, 0.002, true);
      b.twk = 1;
      var streams = [[-0.78, 0.3], [-0.84, -0.1], [-0.76, -0.42]];
      for (s = 0; s < 3; s++) {
        var pts = bezier([streams[s][0], streams[s][1], 0.1], [-0.5, streams[s][1] + 0.25, 0.2], [-0.42, -0.24 + s * 0.05, 0], [-0.32, -0.24 + s * 0.03, 0], 24);
        b.flow(b.path(pts), q(0.03), [MAG, AMB, LAV], [2.6, 3.8], 0.06, 0.11);
        for (k = q(0.012); k > 0; k--) b.add(streams[s][0] + b.g() * 0.06, streams[s][1] + b.g() * 0.06, b.g() * 0.06, [MAG, AMB, LAV, TEAL], [2.2, 3.2]);
      }
      b.done();
    }
  };

  /* ------------------------------------------------------------------------
     Motor
     ------------------------------------------------------------------------ */
  // Presupuesto reducido solo en pantallas angostas o tactiles: una laptop con la ventana baja no es un telefono.
  var small = window.innerWidth < 760 || coarse;
  var NS = small ? 1600 : 2500;      // particulas que cambian de forma
  var ND = small ? 320 : 620;        // polvo ambiente
  var N = NS + ND;
  var DUR = 1.5, WAVE = 0.55, CAM = 3.0;

  var rnd = mulberry32(20260929);
  var vw = 0, vh = 0, dpr = 1;
  var time = 0, T = 0, last = 0, rafId = 0, current = null, curPaths = [];
  var side = 'right', heroMode = false, scaleQ = 1;   // heroMode: en pantallas angostas la portada lleva el chip arriba, bien visible

  // estado de las particulas estructurales
  var fromX = new Float32Array(NS), fromY = new Float32Array(NS), fromZ = new Float32Array(NS);
  var toX = new Float32Array(NS), toY = new Float32Array(NS), toZ = new Float32Array(NS);
  var curX = new Float32Array(NS), curY = new Float32Array(NS), curZ = new Float32Array(NS);
  var cFrom = new Uint8Array(NS), cTo = new Uint8Array(NS), curC = new Uint8Array(NS);
  var sFrom = new Float32Array(NS), sTo = new Float32Array(NS), curS = new Float32Array(NS);
  var aTo = new Float32Array(NS), dl = new Float32Array(NS);
  var toFp = new Int16Array(NS), toPh = new Float32Array(NS), toSp = new Float32Array(NS), toTw = new Float32Array(NS);
  var ang0 = new Float32Array(NS), spin = new Float32Array(NS), swp = new Float32Array(NS), swf = new Float32Array(NS);
  var swa = new Float32Array(NS), twp = new Float32Array(NS), tws = new Float32Array(NS);

  // polvo
  var dU = new Float32Array(ND), dV = new Float32Array(ND), dZ = new Float32Array(ND);
  var dC = new Uint8Array(ND), dS = new Float32Array(ND), dVX = new Float32Array(ND), dVY = new Float32Array(ND);
  var dTp = new Float32Array(ND), dTs = new Float32Array(ND);

  // dibujo
  var sx = new Float32Array(N), sy = new Float32Array(N), sr = new Float32Array(N), sa = new Float32Array(N);
  var sk = new Uint8Array(N), keep = new Float32Array(N), order = new Int32Array(N);
  var NB = 7 * 3, bcount = new Int32Array(NB), bpos = new Int32Array(NB + 1);
  var qual = 1, slow = 0, frames = 0, ema = 0.016;

  // camara
  var cx = 0, cy = 0, R = 300, kCur = 1, alphaMul = 1;
  var tcx = 0, tcy = 0, tR = 300, tAlpha = 1;
  var yawCur = 0, pitchCur = 0.3, rollCur = 0, rollRate = 0;
  var mx = -9999, my = -9999, ptrOn = false, ptrSeen = 0;
  var tmp = [0, 0, 0];

  (function seed() {
    var j, d, dustCols = [V, V, V, V, V, LAV, LAV, BLU, BLU, TEAL, AMB, AMB, MAG, WHT];
    for (j = 0; j < NS; j++) {
      ang0[j] = rnd() * TAU; spin[j] = (rnd() < 0.3 ? 1 : 0.15) * (rnd() - 0.5) * 1.6;
      swp[j] = rnd() * TAU; swf[j] = 0.4 + rnd() * 0.9; swa[j] = 0.004 + rnd() * 0.006;
      twp[j] = rnd() * TAU; tws[j] = 0.2 + rnd() * 1.4;
      // punto de partida: nube dispersa (la portada se arma al cargar)
      curX[j] = (rnd() * 2 - 1) * 2.4; curY[j] = (rnd() * 2 - 1) * 1.6; curZ[j] = (rnd() * 2 - 1) * 1.6;
      curC[j] = (rnd() * 7) | 0; curS[j] = 2 + rnd() * 1.5;
    }
    for (d = 0; d < ND; d++) {
      dU[d] = rnd(); dV[d] = rnd(); dZ[d] = rnd(); dC[d] = dustCols[(rnd() * dustCols.length) | 0];
      dS[d] = 1.5 + rnd() * 1.7; dVX[d] = (rnd() - 0.5) * 0.004; dVY[d] = -(0.002 + rnd() * 0.005);
      dTp[d] = rnd() * TAU; dTs[d] = 0.3 + rnd() * 1.2;
    }
    for (j = 0; j < N; j++) keep[j] = rnd();
  })();

  var cache = {};
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function getScene(name) {
    if (cache[name]) return cache[name];
    var def = SCENES[name] || SCENES.chip, b = new Builder(N, ND, 1000 + hash(name));
    def.build(b);
    cache[name] = { name: name, def: def, b: b };
    return cache[name];
  }

  function goScene(name, instant) {
    var sc = getScene(name), b = sc.b, j, i;
    if (current === sc) return;
    for (j = 0; j < NS; j++) {
      fromX[j] = curX[j]; fromY[j] = curY[j]; fromZ[j] = curZ[j]; cFrom[j] = curC[j]; sFrom[j] = curS[j];
    }
    for (j = 0; j < NS; j++) {
      i = ND + j;
      toX[j] = b.x[i]; toY[j] = b.y[i]; toZ[j] = b.z[i]; cTo[j] = b.c[i]; sTo[j] = b.s[i]; aTo[j] = b.a[i];
      toFp[j] = b.fp[i]; toPh[j] = b.ph[i]; toSp[j] = b.sp[i]; toTw[j] = b.tw[i];
      dl[j] = WAVE * clamp(Math.sqrt(b.x[i] * b.x[i] + b.y[i] * b.y[i]) / 1.3, 0, 1) + rnd() * 0.18;
    }
    curPaths = b.paths; current = sc;
    T = instant ? DUR + WAVE + 1 : 0;
  }

  /* ---- encuadre segun el lado y el tamano de la ventana ---- */
  function layoutTargets() {
    var wrap = document.querySelector('.wrap'), r = wrap ? wrap.getBoundingClientRect() : { left: 0, width: vw };
    if (vw < 1080) {
      // pantallas angostas: no hay mitad libre. La portada deja arriba un espacio para el chip;
      // en las demas secciones la figura es una marca de agua tenue detras del texto.
      if (heroMode) { tcx = vw * 0.5; tcy = vh * 0.235; tR = Math.min(vw * 0.5, vh * 0.235); tAlpha = 0.95; }
      else { tcx = vw * 0.5; tcy = vh * 0.5; tR = Math.min(vw * 0.6, vh * 0.3); tAlpha = 0.34; }
    } else {
      var f = side === 'left' ? 0.245 : 0.755;
      tcx = r.left + r.width * f; tcy = vh * 0.52; tR = Math.min(r.width * 0.25, vh * 0.38); tAlpha = 1;
    }
    tR = Math.max(tR, 110) * zoomQ * scaleQ;
  }
  function snapCamera() { cx = tcx; cy = tcy; R = tR; alphaMul = tAlpha; }
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight; dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(vw * dpr), h = Math.round(vh * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    layoutTargets();
  }

  /* ---- un cuadro ---- */
  function drawScene(dt) {
    var j, d, i, sc = current.def, st = window.pageYOffset || 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // camara
    var kc = still ? 1 : 1 - Math.exp(-dt * 2.6);
    // al bajar por la pagina la figura gira un poco (siempre acotado, +-7 grados)
    var scrollTilt = Math.sin(st * 0.0009) * 0.12;
    yawCur += (sc.yaw0 + sc.yawAmp * Math.sin(time * sc.yawSpd) + scrollTilt - yawCur) * kc;
    pitchCur += (sc.pitch0 + sc.pitchAmp * Math.sin(time * 0.13 + 1) - pitchCur) * kc;
    rollRate += (sc.roll - rollRate) * kc; rollCur += rollRate * dt;
    kCur += (sc.k - kCur) * kc;
    var Rk = R * kCur * (1 + 0.012 * Math.sin(time * 0.5)), pxs = clamp(Rk / 380, 0.6, 1.5);
    // Densidad constante (unas 0,026 particulas por pixel cuadrado de radio): si la figura se dibuja
    // mas chica se muestran menos particulas, para que anillos y lineas no se fundan en una mancha.
    var dens = Math.min(qual, clamp(0.026 * Rk * Rk / NS, 0.45, 1));
    var cosR = Math.cos(rollCur), sinR = Math.sin(rollCur), cosY = Math.cos(yawCur), sinY = Math.sin(yawCur);
    var cosP = Math.cos(pitchCur), sinP = Math.sin(pitchCur);
    var C1 = -0.5, S1 = 0.8660254;
    var PR = 120, PR2 = PR * PR, PF = 34, usePtr = ptrOn && !still;

    // particulas estructurales
    for (j = 0; j < NS; j++) {
      i = ND + j;
      var u = (T - dl[j]) / DUR; u = u < 0 ? 0 : u > 1 ? 1 : u;
      var e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      var tx = toX[j], ty = toY[j], tz = toZ[j];
      if (toFp[j] >= 0) {
        var ph = toPh[j] + toSp[j] * time; ph -= Math.floor(ph);
        pathAt(curPaths[toFp[j]], ph, tmp); tx = tmp[0]; ty = tmp[1]; tz = tmp[2];
      }
      var bx = fromX[j] + (tx - fromX[j]) * e, by = fromY[j] + (ty - fromY[j]) * e, bz = fromZ[j] + (tz - fromZ[j]) * e;
      curX[j] = bx; curY[j] = by; curZ[j] = bz;
      curC[j] = u < 0.5 ? cFrom[j] : cTo[j];
      var size = sFrom[j] + (sTo[j] - sFrom[j]) * e; curS[j] = size;
      if (!still) {
        var turb = 4 * e * (1 - e) * 0.07, sw = time * swf[j] + swp[j];
        bx += Math.sin(sw) * swa[j] + Math.sin(time * 3.1 + swp[j] * 5) * turb;
        by += Math.cos(sw * 0.83 + 1.7) * swa[j] + Math.cos(time * 2.7 + swp[j] * 3) * turb;
      }
      var x1 = bx * cosR - by * sinR, y1 = bx * sinR + by * cosR;
      var x2 = x1 * cosY + bz * sinY, z2 = -x1 * sinY + bz * cosY;
      var y3 = y1 * cosP - z2 * sinP, z3 = y1 * sinP + z2 * cosP;
      var p = CAM / (CAM + z3), X = cx + x2 * Rk * p, Y = cy - y3 * Rk * p;
      if (usePtr) {
        var ddx = X - mx, ddy = Y - my, d2 = ddx * ddx + ddy * ddy;
        if (d2 < PR2) { var dd = Math.sqrt(d2) + 0.001, f = 1 - dd / PR; f = f * f * PF; X += ddx / dd * f; Y += ddy / dd * f; }
      }
      var ab = p > 1.06 ? 2 : (p > 0.93 ? 1 : 0), twk = toTw[j];
      if (!still) {
        var fl = Math.sin(time * (1.1 + tws[j] * twk) + twp[j]);
        if (fl > 0.93) ab = 2; else if (twk > 1.5 && fl < -0.4 && ab > 0) ab--;
      }
      var ang = ang0[j] + time * spin[j], at = aTo[j];
      if (at === at) { var df = at - ang; df -= TAU * Math.floor((df + Math.PI) / TAU); ang += df * e; }
      sx[i] = X; sy[i] = Y; sr[i] = size * p * pxs; sa[i] = ang;
      sk[i] = keep[i] > dens ? 255 : curC[j] * 3 + ab;
    }

    // polvo: campo fijo a la ventana, con paralaje al hacer scroll
    for (d = 0; d < ND; d++) {
      var dx0 = dU[d] + dVX[d] * time, dy0 = dV[d] + dVY[d] * time - st * (0.00006 + 0.00018 * dZ[d]);
      dx0 -= Math.floor(dx0); dy0 -= Math.floor(dy0);
      var X2 = dx0 * vw, Y2 = dy0 * vh, dab = dZ[d] < 0.5 ? 0 : 1;
      if (usePtr) {
        var ex = X2 - mx, ey = Y2 - my, e2 = ex * ex + ey * ey;
        if (e2 < PR2) { var ed = Math.sqrt(e2) + 0.001, ef = 1 - ed / PR; ef = ef * ef * PF * 0.6; X2 += ex / ed * ef; Y2 += ey / ed * ef; }
      }
      if (!still && Math.sin(time * dTs[d] + dTp[d]) > 0.96) dab = 2;
      sx[d] = X2; sy[d] = Y2; sr[d] = dS[d] * (0.55 + 0.7 * dZ[d]) * pxs; sa[d] = dTp[d] + time * 0.1;
      sk[d] = keep[d] > qual ? 255 : dC[d] * 3 + dab;
    }

    // agrupar por color y transparencia: un solo trazo por grupo
    var k, n;
    for (k = 0; k < NB; k++) bcount[k] = 0;
    for (n = 0; n < N; n++) if (sk[n] !== 255) bcount[sk[n]]++;
    bpos[0] = 0;
    for (k = 0; k < NB; k++) bpos[k + 1] = bpos[k] + bcount[k];
    for (k = 0; k < NB; k++) bcount[k] = bpos[k];
    for (n = 0; n < N; n++) if (sk[n] !== 255) order[bcount[sk[n]]++] = n;

    ctx.lineWidth = 1; ctx.lineJoin = 'round';
    for (k = 0; k < NB; k++) {
      if (bpos[k + 1] === bpos[k]) continue;
      ctx.globalAlpha = ALPHA[k % 3] * alphaMul;
      ctx.strokeStyle = PAL[(k / 3) | 0];
      ctx.beginPath();
      for (n = bpos[k]; n < bpos[k + 1]; n++) {
        var q = order[n], r = sr[q], a = sa[q], ca = Math.cos(a), sa2 = Math.sin(a), X0 = sx[q], Y0 = sy[q];
        ctx.moveTo(X0 + r * ca, Y0 + r * sa2);
        ctx.lineTo(X0 + r * (ca * C1 - sa2 * S1), Y0 + r * (sa2 * C1 + ca * S1));
        ctx.lineTo(X0 + r * (ca * C1 + sa2 * S1), Y0 + r * (sa2 * C1 - ca * S1));
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* Avanza el reloj y la camara. Lo usan el bucle y las pruebas (step). */
  function advance(dt) {
    time += dt; T += dt;
    var kc = 1 - Math.exp(-dt * 3);
    cx += (tcx - cx) * kc; cy += (tcy - cy) * kc; R += (tR - R) * kc; alphaMul += (tAlpha - alphaMul) * kc;
  }

  function frame(now) {
    if (!still) rafId = requestAnimationFrame(frame);
    var raw = last ? (now - last) / 1000 : 0.016; last = now;
    if (!(raw > 0)) raw = 0.016;
    var dt = Math.min(raw, 0.05);
    if (!still) {
      advance(dt);
      if (ptrOn && now - ptrSeen > 2500) ptrOn = false;
      // calidad adaptativa: si el equipo va justo, se dibujan menos particulas.
      // Las pausas largas (pestana en segundo plano, visor limitado) no cuentan.
      if (raw < 0.25) {
        ema += (raw - ema) * 0.05; frames++;
        if (frames > 120 && ema > 0.03 && qual > 0.45) { qual = Math.max(0.45, qual - 0.12); frames = 60; }
      }
    }
    drawScene(dt);
  }

  /* ---- entrada ---- */
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(); if (still) { snapCamera(); drawScene(0.016); } }, 120);
  });
  if (!coarse) {
    window.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; ptrOn = true; ptrSeen = performance.now(); }, { passive: true });
    document.addEventListener('pointerleave', function () { ptrOn = false; });
  }
  document.addEventListener('visibilitychange', function () { last = 0; });

  var startScene = query.get('escena');
  var firstSec = document.querySelector('.sc[data-scene]');
  side = query.get('lado') || (firstSec && firstSec.getAttribute('data-side')) || 'right';
  heroMode = !!(firstSec && firstSec.id === 'top');
  measure();
  snapCamera();
  if (!still) { cx = vw * 0.5; cy = vh * 0.5; R = tR * 0.6; alphaMul = 0; }
  goScene(startScene && SCENES[startScene] ? startScene : ((firstSec && firstSec.getAttribute('data-scene')) || 'chip'), still);
  if (still) drawScene(0.016); else rafId = requestAnimationFrame(frame);

  window.Constelacion = {
    scenes: Object.keys(SCENES),
    set: function (name, lado, hero, escala) {
      if (!SCENES[name]) name = 'chip';
      if (lado) side = lado;
      heroMode = !!hero;
      scaleQ = escala || 1;
      layoutTargets();
      goScene(name, still);
      if (still) { snapCamera(); drawScene(0.016); }
    },
    info: function () { return { N: N, NS: NS, ND: ND, qual: qual, ema: ema, dpr: dpr, still: still, scene: current && current.name, T: T }; },
    /* Pruebas: avanza `sec` segundos de animacion dibujando a 20 cuadros por segundo. */
    step: function (sec) {
      var n = Math.max(1, Math.round(sec * 20)), h = sec / n, i;
      for (i = 0; i < n; i++) { advance(h); drawScene(h); }
    },
    /* Pruebas: costo medio en ms de dibujar un cuadro completo. */
    bench: function (n) {
      var t0 = performance.now(), i;
      for (i = 0; i < n; i++) { advance(0.016); drawScene(0.016); }
      return (performance.now() - t0) / n;
    }
  };
})();


