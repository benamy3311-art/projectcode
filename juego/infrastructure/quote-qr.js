// ============================================================
// QR DE COTIZACIÓN — encode/decode + generación de imagen
// ============================================================
// Cada cotización (normal y empresas) imprime un QR con SOLO el id
// interno de la cotización (currentQuoteId — ver state.js/newQuoteId).
// Escaneando ese QR meses después, se busca esa cotización en
// user_quotes (Firestore) y se reconstruye con los precios ACTUALES
// del catálogo. Se eligió el id interno y no el número visible
// (numCot) porque numCot se puede repetir entre asesores (cada uno
// lleva su propio consecutivo) — el id interno es único siempre.
//
// Formato v2 (desde v1.8.0): "SLQ2:" + currentQuoteId — carga chica a
// propósito (no depende de cuántos productos tenga la cotización), así
// el QR queda con pocos módulos y aguanta mucho mejor una foto borrosa
// o varios reenvíos de WhatsApp. Corrección de errores 'H' (máxima)
// por la misma razón.
//
// Formato v1 (SLQ1, cotizaciones impresas entre v1.7.0 y v1.7.3):
// codificaba directamente sku+cantidad de cada ítem, sin ir a la nube.
// Se mantiene el decoder para no romper QRs ya impresos/enviados.
//
// Globales que expone (window.*):
//   buildQuoteIdQrSvg(quoteId)        — id → "<svg>...</svg>" (o '' si falla)
//   parseQuoteIdQrPayload(text)       — string → quoteId, o null si no es formato v2
//   parseQuoteQrPayload(text)         — [v1, legacy] string → [{sku,qty,source}] o null
//   decodeQrFromImageData(imageData)  — ImageData de canvas → payload string o null
//   decodeQrFromImageFile(file)       — File → Promise<payload string o null>
//
// Depende de: vendor/qrcode-generator.js (window.qrcode), vendor/jsqr.js (window.jsQR)
// Requiere DOM: ninguno propio — decodeQrFromImageData recibe un
//   ImageData ya extraído (el caller hace el canvas)
// ============================================================
(function () {
  var TAG = 'SLQ1';
  var TAG_ID = 'SLQ2:';

  // margin en celdas del propio QR — grande a propósito: da una zona
  // blanca de respiro alrededor, clave para que un teléfono lo siga
  // detectando en una foto reenviada varias veces y algo borrosa.
  function svgFromPayload(payload) {
    if (typeof qrcode !== 'function' || !payload) return '';
    try {
      var qr = qrcode(0, 'H'); // typeNumber 0 = auto-tamaño; H = máxima corrección de errores
      qr.addData(payload);
      qr.make();
      return qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) {
      console.warn('[quote-qr] no se pudo generar el QR:', e);
      return '';
    }
  }

  window.buildQuoteIdQrSvg = function (quoteId) {
    if (!quoteId) return '';
    return svgFromPayload(TAG_ID + String(quoteId));
  };

  window.parseQuoteIdQrPayload = function (text) {
    if (typeof text !== 'string' || text.slice(0, TAG_ID.length) !== TAG_ID) return null;
    var id = text.slice(TAG_ID.length).trim();
    return id || null;
  };

  function srcFromCode(code) {
    return code === 'L' ? 'lago' : 'store';
  }

  // [v1, legacy — solo decode] cotizaciones impresas entre v1.7.0 y
  // v1.7.3 codificaban sku+cantidad de cada ítem directo en el QR.
  window.parseQuoteQrPayload = function (text) {
    if (typeof text !== 'string' || text.slice(0, TAG.length) !== TAG) return null;
    var body = text.slice(TAG.length);
    if (!body) return null;
    var tokens = body.split('/');
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var code = tok.charAt(0);
      if (code !== 'S' && code !== 'L') continue;
      var rest = tok.slice(1).split(':');
      if (rest.length !== 2) continue;
      var sku = rest[0], qty = parseInt(rest[1], 10);
      if (!sku || !qty || qty < 1) continue;
      out.push({ sku: sku, qty: qty, source: srcFromCode(code) });
    }
    return out.length ? out : null;
  };

  window.decodeQrFromImageData = function (imageData) {
    if (typeof jsQR !== 'function' || !imageData) return null;
    try {
      var res = jsQR(imageData.data, imageData.width, imageData.height);
      return res ? res.data : null;
    } catch (e) {
      console.warn('[quote-qr] error decodificando QR:', e);
      return null;
    }
  };

  // File (foto subida/pegada) → payload del QR si hay uno, o null.
  // Se usa ANTES de mandar la imagen a la IA: si ya trae QR no hace
  // falta gastar la llamada — y sigue funcionando aunque Gemini/OpenAI
  // estén caídos, porque no depende de ninguno de los dos.
  window.decodeQrFromImageFile = function (file) {
    return new Promise(function (resolve) {
      if (!file || typeof jsQR !== 'function') { resolve(null); return; }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve(window.decodeQrFromImageData(data));
        } catch (e) {
          console.warn('[quote-qr] error leyendo la imagen:', e);
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  };
})();
