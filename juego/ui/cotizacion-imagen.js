// ============================================================
// LA IMAGEN DE COTIZACIÓN, DESDE EL CHAT
// ============================================================
// La misma imagen de siempre ("Copiar imagen" en Cotizar), pero sin salir del
// chat: se arma o se abre la cotización del cliente, se dibuja, se copia al
// portapapeles y se abre su WhatsApp para pegarla (Ctrl+V) y enviarla.
// WhatsApp Web no deja adjuntar una imagen por enlace; cuando llegue el envío
// por la API (fase 2), este mismo paso la mandará directo.
//
// Globales que expone (window.*):
//   CotizacionImagen.armar({ cliente, tel, productos })  — cotización nueva con esos productos
//   CotizacionImagen.abrir(id)                            — deja abierta una cotización del historial
//   CotizacionImagen.enviar({ waId, texto, alListo })     — imagen de la abierta → portapapeles → WhatsApp
//   CotizacionImagen.agregar(id, { name, price })        — suma una línea manual (el envío estimado)
//
// Depende de: services.js (capturaCotizacion, loadHist, getHist, addItem,
//             generateQuote, saveCurrentQuoteImmediately, histKey),
//             ui.js (clearAll, switchTab), state.js (items, S),
//             storage.js (_ls), quotes-sync.js (pushCrm)
// ============================================================
(function () {
  'use strict';

  function toast(m, t, ms) { if (window.showToast) showToast(m, t || 'info', null, ms || 3200); }

  // Cargar o armar sin que Cotizar se ponga al frente: el asesor sigue en el chat.
  function sinCambiarVista(fn) {
    var sw = window.switchTab;
    window.switchTab = function () {};
    try { return fn(); } finally { window.switchTab = sw; }
  }

  function abrir(id) {
    if (typeof S !== 'undefined' && S.currentQuoteId === id && typeof items !== 'undefined' && items.length) {
      sinCambiarVista(function () { generateQuote(true); });
      return true;
    }
    var h = typeof getHist === 'function' ? getHist() : [];
    for (var i = 0; i < h.length; i++) {
      if (h[i].id === id) {
        var ok = true;
        sinCambiarVista(function () { loadHist(i); });
        if (typeof S === 'undefined' || S.currentQuoteId !== id) ok = false;
        return ok;
      }
    }
    return false;
  }

  // productos: [{ sku, name, price (en miles, como el catálogo), _cat, qty }]
  function armar(o) {
    o = o || {};
    if (typeof saveCurrentQuoteImmediately === 'function') saveCurrentQuoteImmediately();
    var id = null;
    sinCambiarVista(function () {
      clearAll();
      var cli = document.getElementById('cliente');
      if (cli) { cli.value = o.cliente || ''; cli.dispatchEvent(new Event('input', { bubbles: true })); }
      (o.productos || []).forEach(function (p) {
        addItem({ sku: p.sku, name: p.name, price: p.price, qty: p.qty || 1, _cat: p._cat || null, note: '', source: p.source || (typeof S !== 'undefined' ? S.activePriceList : '') });
      });
      if (typeof items !== 'undefined' && items.length) generateQuote(true);
      // Guardarla ya (normalmente se guarda con un pequeño retraso): la ficha
      // y la imagen la necesitan en el historial en este mismo momento.
      if (typeof saveCurrentQuoteImmediately === 'function') saveCurrentQuoteImmediately();
      id = typeof S !== 'undefined' ? S.currentQuoteId : null;
    });
    // El celular del chat queda en la cotización: así Seguimiento y la ficha la encuentran.
    if (id && o.tel && typeof getHist === 'function') {
      var h = getHist();
      for (var i = 0; i < h.length; i++) {
        if (h[i].id === id && !h[i].clienteTel) {
          h[i].clienteTel = String(o.tel).replace(/\D/g, '').slice(-10);
          try { _ls.setJSON(histKey(), h); } catch (e) {}
          if (window._slQuotesSync) _slQuotesSync.pushCrm(id, { clienteTel: h[i].clienteTel });
          break;
        }
      }
    }
    return id;
  }

  function aBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('No se pudo preparar la imagen')); }, 'image/png');
    });
  }
  function miniatura(canvas) {
    var c = document.createElement('canvas');
    var k = 220 / canvas.width;
    c.width = 220; c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }

  // Imagen de la cotización abierta → portapapeles → WhatsApp del cliente.
  // Se llama desde un clic: la ventana de WhatsApp se abre dentro del margen
  // que da el navegador después de ese clic (si lo bloquea, se ofrece un botón).
  function enviar(o) {
    o = o || {};
    if (typeof capturaCotizacion !== 'function') return Promise.reject(new Error('No se pudo generar la imagen'));
    var canvas;
    return capturaCotizacion().then(function (c) { canvas = c; return aBlob(c); }).then(function (blob) {
      var copiada = navigator.clipboard && window.ClipboardItem
        ? navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () { return true; }, function () { return false; })
        : Promise.resolve(false);
      return copiada.then(function (ok) {
        if (!ok) {
          // Sin portapapeles: se descarga para arrastrarla a WhatsApp.
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'cotizacion.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        }
        var url = 'https://wa.me/' + encodeURIComponent(o.waId) + (o.texto ? '?text=' + encodeURIComponent(o.texto) : '');
        window.open(url, '_blank', 'noopener');
        toast(ok ? 'Imagen de la cotización copiada: pégala en el chat de WhatsApp con Ctrl+V y envía.' : 'La imagen se descargó: arrástrala al chat de WhatsApp.', 'success', 6000);
        if (typeof o.alListo === 'function') o.alListo({ copiada: ok, miniatura: miniatura(canvas) });
        return { copiada: ok };
      });
    });
  }

  // Una línea manual en una cotización del historial, sin salir del chat.
  // price en miles, como el catálogo. En Vender queda como producto manual.
  function agregar(id, item) {
    if (typeof saveCurrentQuoteImmediately === 'function') saveCurrentQuoteImmediately();
    if (!abrir(id)) return false;
    var ok = false;
    sinCambiarVista(function () {
      ok = addItem({ sku: 'CUSTOM', name: item.name, price: item.price, qty: 1, _cat: 'ADICIONAL', note: '', source: typeof S !== 'undefined' ? S.activePriceList : '' }) !== false;
      if (ok) {
        generateQuote(true);
        if (typeof saveCurrentQuoteImmediately === 'function') saveCurrentQuoteImmediately();
      }
    });
    return ok;
  }

  window.CotizacionImagen = { armar: armar, abrir: abrir, enviar: enviar, agregar: agregar };
})();
