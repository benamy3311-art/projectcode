// ============================================================
// CIFRADO DE DATOS DE CLIENTES — interfaz
// ============================================================
// La parte visible de infrastructure/pii-crypto.js: la sección de
// Configuración, el asistente con el que el administrador activa el cifrado
// (genera la llave y obliga a guardarla antes de activar), la ventana para
// ingresar la llave en un dispositivo y el aviso cuando falta.
//
// El asistente está hecho para que sea difícil perder la llave sin darse
// cuenta: se muestra una sola vez, hay que marcar que se guardó Y escribir su
// último grupo. Si se cancela en cualquier paso, no se escribe nada.
//
// Globales que expone (window.*):
//   CifradoUI.activar()    — asistente de activación (solo super admin)
//   CifradoUI.pedirLlave() — ventana para ingresar la llave en este dispositivo
//   CifradoUI.olvidar()    — borra la llave de este dispositivo
//   CifradoUI.render()     — vuelve a pintar la sección de Configuración
//   CifradoUI.explicar()   — ventana con la explicación para las empresas
//                            (qué protege, qué no, la llave), en lenguaje simple
//
// Depende de: pii-crypto.js (PiiCrypto), firebase-auth.js (_slAuth,
//   SUPER_ADMINS), ui.js (showToast), index.html (showTopNotice)
// Requiere DOM: #secCifrado. Estilos: styles/cifrado.css + las clases lg-*
//   de styles/legal.css para las ventanas.
// ============================================================
(function () {
  'use strict';

  function P() { return window.PiiCrypto; }

  function email() {
    try { return (window._slAuth.currentUser.email || '').toLowerCase().trim(); } catch (e) { return ''; }
  }

  // Quien activa el cifrado es quien ve la llave. En una instancia propia de
  // una empresa, SUPER_ADMINS tiene que ser el administrador de ESA empresa,
  // no el proveedor: si no, la promesa de que el proveedor no puede leer los
  // datos deja de ser cierta.
  function isAdmin() {
    var e = email();
    return !!e && (window.SUPER_ADMINS || []).indexOf(e) >= 0;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'info');
  }

  function modal(html) {
    document.querySelectorAll('.cf-modal').forEach(function (x) { x.remove(); });
    var m = document.createElement('div');
    m.className = 'lg-modal cf-modal';
    m.innerHTML = '<div class="lg-card lg-card-sm cf-card">' + html + '</div>';
    document.body.appendChild(m);
    return m;
  }

  // ── Explicación para las empresas ─────────────────────────
  // El texto que lee el administrador o un vendedor de la tienda (y, en una
  // empresa grande, su área de sistemas o de compras) para entender qué
  // protege el cifrado, qué no, y qué pasa con la llave. Lenguaje simple
  // arriba; los detalles técnicos van plegados al final, para quien los pida.
  //
  // Todo lo que dice tiene que seguir siendo cierto respecto de
  // infrastructure/pii-crypto.js: si cambian los campos cifrados
  // (QUOTE_FIELDS / REM_FIELDS) o el algoritmo, se actualiza acá también.
  function textoExplicacion() {
    return ''
      + '<h3>Cómo protegemos los datos de tus clientes</h3>'
      + '<p>Cuando tu empresa activa el cifrado, los datos personales de tus clientes se vuelven '
      + 'ilegibles para cualquiera que no tenga la llave de tu empresa. Eso incluye al proveedor de '
      + 'esta aplicación y a Google, que es donde se guarda la información.</p>'

      + '<div class="cf-sample">'
      + '  <div class="cf-sample-row"><span class="cf-sample-lbl">Lo que ves tú</span>'
      + '    <span class="cf-sample-plain">María Gómez · 300 123 4567</span></div>'
      + '  <div class="cf-sample-row"><span class="cf-sample-lbl">Lo que queda guardado en la nube</span>'
      + '    <code class="cf-sample-enc">pcenc:1:q7Hx2mR9vKc1pT0z:Wn3bX8kQf2LzV5rJ0yHc7sDpA4tE</code></div>'
      + '</div>'

      + '<h4>Qué se protege</h4>'
      + '<ul>'
      + '<li>Nombre o razón social del cliente y su NIT.</li>'
      + '<li>Teléfono o WhatsApp, correo y ciudad.</li>'
      + '<li>Las notas de la cotización y del seguimiento de la venta.</li>'
      + '<li>En las recogidas: cliente, teléfono, productos, notas y la foto adjunta.</li>'
      + '</ul>'

      + '<h4>Cómo funciona</h4>'
      + '<p>Los datos se cifran <b>en tu dispositivo, antes de salir hacia internet</b>. A la nube '
      + 'llega un texto sin sentido, y así se queda guardado. Solo un dispositivo que tenga la llave '
      + 'de tu empresa puede convertirlo otra vez en el dato original.</p>'
      + '<p>Por eso, aunque alguien lograra entrar a la base de datos, incluso quien administra la '
      + 'aplicación, lo único que vería son caracteres ilegibles como los del ejemplo.</p>'

      + '<h4>La llave de tu empresa</h4>'
      + '<ul>'
      + '<li>La crea la aplicación cuando el administrador activa el cifrado. Son 32 caracteres que '
      + 'nadie elige a mano, para que sea imposible adivinarla.</li>'
      + '<li>Se muestra <b>una sola vez</b>. El administrador la guarda y la comparte solo con su '
      + 'equipo.</li>'
      + '<li>Cada vendedor la ingresa una vez en su dispositivo. Queda guardada de forma que ni la '
      + 'propia aplicación puede leerla: solo usarla para cifrar y descifrar.</li>'
      + '<li>La <b>huella</b> (por ejemplo, 31DE-3EAA) sirve para comprobar que todos los '
      + 'dispositivos usan la misma llave sin tener que mostrarla. La ves en Configuración.</li>'
      + '</ul>'

      + '<div class="cf-warn"><b>Si se pierde la llave, los datos cifrados no se pueden '
      + 'recuperar.</b> No existe un "olvidé la llave": ni el administrador de la aplicación ni nadie '
      + 'más puede abrirlos. Esa es justamente la garantía de que nadie más puede leerlos. Guárdala en '
      + 'un gestor de contraseñas y en una copia impresa, en un lugar seguro.</div>'

      + '<h4>Qué sigue siendo legible, y por qué</h4>'
      + '<p>Los productos, precios, totales, el estado de cada venta, las fechas y el nombre del '
      + 'vendedor no se cifran. No son datos personales de tus clientes, y la aplicación los necesita '
      + 'para las métricas, el ranking de ventas y la búsqueda de cotizaciones por número.</p>'

      + '<h4>En un dispositivo que no tiene la llave</h4>'
      + '<ul>'
      + '<li>Los datos de los clientes aparecen como "Datos cifrados".</li>'
      + '<li>Esas cotizaciones y recogidas no se pueden abrir, duplicar ni editar. Así nadie borra '
      + 'por accidente la información real.</li>'
      + '<li>Lo que se cotice en ese dispositivo queda guardado en él y se sube, ya cifrado, en '
      + 'cuanto se ingrese la llave. <b>Nunca se sube sin cifrar.</b></li>'
      + '</ul>'

      + '<h4>Lo que conviene saber</h4>'
      + '<ul>'
      + '<li>Las cotizaciones que ya existían antes de activar el cifrado se cifran cuando cada '
      + 'vendedor entra con la llave. Las recogidas anteriores, cuando se editan.</li>'
      + '<li>Las funciones de inteligencia artificial ("Generar texto" y "Armar PC") reciben el texto '
      + 'que les envías en el momento de usarlas, porque lo necesitan para responder.</li>'
      + '<li>El cifrado protege lo que se guarda. Quien use un dispositivo desbloqueado que ya tiene '
      + 'la llave puede ver los datos, igual que el resto de la aplicación: cuida el acceso a tus '
      + 'equipos.</li>'
      + '</ul>'

      + '<details class="cf-tech">'
      + '<summary>Detalles técnicos</summary>'
      + '<ul>'
      + '<li><b>Cifrado:</b> AES-GCM de 256 bits, con un vector de inicialización aleatorio distinto '
      + 'para cada campo.</li>'
      + '<li><b>Llave:</b> 160 bits aleatorios generados en el navegador (Web Crypto API), '
      + 'presentados en base32 de Crockford. La llave de cifrado se deriva con HKDF-SHA256 y una sal '
      + 'pública de 16 bytes.</li>'
      + '<li><b>Integridad:</b> cada valor cifrado queda atado a su documento y a su campo mediante '
      + 'datos adicionales autenticados. No se puede alterar ni mover a otro registro sin que el '
      + 'descifrado falle.</li>'
      + '<li><b>En el servidor</b> solo se guardan la sal, una prueba cifrada para validar la llave y '
      + 'una huella de 32 bits. Nada de eso permite reconstruir la llave.</li>'
      + '<li><b>En cada dispositivo</b> la llave derivada se guarda como CryptoKey no exportable en '
      + 'IndexedDB.</li>'
      + '<li><b>Fotos:</b> se cifran como bytes, sin aumentar su tamaño de forma apreciable. El tipo de '
      + 'imagen también queda autenticado: no se puede alterar sin que el descifrado falle.</li>'
      + '<li><b>Estado confiable:</b> si el cifrado está activo lo decide solo la configuración que crea '
      + 'el administrador, nunca el contenido de un documento. Un registro falso no puede bloquear ni '
      + 'desactivar el cifrado en ningún dispositivo.</li>'
      + '<li><b>Alcance:</b> protege los datos almacenados. Como en toda aplicación web, el código '
      + 'que usa la llave se descarga del proveedor; una instalación con base de datos propia elimina '
      + 'esa dependencia.</li>'
      + '</ul>'
      + '</details>';
  }

  function explicar() {
    // Clase propia (no cf-modal): se abre encima del asistente o de la
    // ventana de la llave sin cerrarlos.
    document.querySelectorAll('.cf-explica').forEach(function (x) { x.remove(); });
    var m = document.createElement('div');
    m.className = 'lg-modal cf-explica';
    m.innerHTML = ''
      + '<div class="lg-card lg-card-read">'
      + '  <button type="button" class="lg-x" aria-label="Cerrar">&times;</button>'
      + '  <div class="lg-doc cf-doc">' + textoExplicacion() + '</div>'
      + '  <div class="lg-actions"><button type="button" class="lg-btn" data-a="ok">Entendido</button></div>'
      + '</div>';
    document.body.appendChild(m);
    function cerrar() { m.remove(); }
    m.querySelector('.lg-x').addEventListener('click', cerrar);
    m.querySelector('[data-a="ok"]').addEventListener('click', cerrar);
    m.addEventListener('click', function (e) { if (e.target === m) cerrar(); });
  }

  function enlaceExplicar(texto) {
    return '<button type="button" class="cf-link" data-a="explica">' + esc(texto) + '</button>';
  }

  // ── Sección de Configuración ──────────────────────────────
  function render() {
    var sec = document.getElementById('secCifrado');
    if (!sec || !P()) return;
    var st = P().status();
    if (!st.initialized) { sec.style.display = 'none'; return; }
    sec.style.display = '';

    var h = '<div class="settings-section" style="margin-top:18px">Cifrado de datos de clientes</div>';
    if (!st.enabled) {
      h += '<div class="cap cf-cap">Hoy los datos de tus clientes (nombre, NIT, teléfono, correo, '
        + 'notas y fotos de recogidas) se guardan legibles en la nube. Con el cifrado activo, solo '
        + 'los dispositivos de tu empresa pueden leerlos: ni el proveedor de la app ni Google.</div>';
      h += isAdmin()
        ? '<button class="bbtn bbtn-ghost cf-btn" onclick="CifradoUI.activar()">Activar cifrado</button>'
        : '<div class="cap">Lo activa el administrador de la cuenta.</div>';
    } else if (st.ready) {
      h += '<div class="cf-state cf-on"><span class="cf-dot"></span>Activo en este dispositivo</div>'
        + '<div class="cap cf-cap">Huella de la llave: <b class="cf-fp">' + esc(st.fingerprint) + '</b>. '
        + 'Todos los dispositivos de la empresa deben mostrar la misma.</div>'
        + '<button class="bbtn bbtn-ghost cf-btn" onclick="CifradoUI.olvidar()">Olvidar la llave en este dispositivo</button>';
    } else {
      h += '<div class="cf-state cf-off"><span class="cf-dot"></span>Este dispositivo no tiene la llave</div>'
        + '<div class="cap cf-cap">Los datos de clientes están cifrados. Pídele la llave al '
        + 'administrador de tu empresa e ingrésala una sola vez en este dispositivo.</div>'
        + '<button class="bbtn bbtn-ghost cf-btn" onclick="CifradoUI.pedirLlave()">Ingresar llave</button>';
    }
    h += '<button type="button" class="cf-link cf-link-settings" onclick="CifradoUI.explicar()">¿Cómo funciona el cifrado?</button>';
    sec.innerHTML = h;
  }

  // ── Ingresar la llave en este dispositivo ─────────────────
  function pedirLlave() {
    if (!P()) return;
    var m = modal(''
      + '<h3>Llave de cifrado de la empresa</h3>'
      + '<p class="lg-p">Los datos de clientes están cifrados. Ingresa la llave que te dio el '
      + 'administrador: se guarda en este dispositivo y no tendrás que volver a escribirla.</p>'
      + enlaceExplicar('¿Qué es esta llave?')
      + '<input class="cf-input" id="cfKeyInput" type="text" autocomplete="off" autocapitalize="characters" '
      + 'spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">'
      + '<div class="cf-err" id="cfKeyErr" hidden></div>'
      + '<div class="lg-actions">'
      + '  <button type="button" class="lg-btn-ghost" data-a="no">Ahora no</button>'
      + '  <button type="button" class="lg-btn" data-a="si">Desbloquear</button>'
      + '</div>');
    var inp = m.querySelector('#cfKeyInput');
    var err = m.querySelector('#cfKeyErr');
    var ok = m.querySelector('[data-a="si"]');

    async function intentar() {
      err.hidden = true;
      ok.disabled = true;
      ok.textContent = 'Verificando…';
      try {
        await P().unlock(inp.value);
        m.remove();
        toast('Llave verificada: los datos de clientes ya se pueden leer en este dispositivo', 'success');
      } catch (e) {
        err.textContent = (e && e.friendly) ? e.message : 'No se pudo verificar la llave.';
        err.hidden = false;
        ok.disabled = false;
        ok.textContent = 'Desbloquear';
      }
    }

    ok.addEventListener('click', intentar);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') intentar(); });
    m.querySelector('[data-a="no"]').addEventListener('click', function () { m.remove(); });
    m.querySelector('[data-a="explica"]').addEventListener('click', explicar);
    setTimeout(function () { inp.focus(); }, 50);
  }

  // ── Activar el cifrado (administrador) ────────────────────
  function activar() {
    if (!P()) return;
    if (!isAdmin()) { toast('Solo el administrador puede activar el cifrado', 'warn'); return; }
    var m = modal(''
      + '<h3>Activar el cifrado de datos de clientes</h3>'
      + '<p class="lg-p">Nombre, NIT, teléfono, correo, notas y fotos de recogidas se van a cifrar en '
      + 'cada dispositivo antes de guardarse. En la nube quedan ilegibles para todos, incluido el '
      + 'proveedor de la app.</p>'
      + '<div class="cf-warn"><b>Antes de seguir:</b><ul>'
      + '<li>La app va a generar una llave. <b>Si se pierde, nadie puede recuperar los datos '
      + 'cifrados</b>: ni tú ni el proveedor. No existe un "olvidé la llave".</li>'
      + '<li>Cada vendedor la tiene que ingresar una vez en su dispositivo.</li>'
      + '<li>Una vez activo, el cifrado no se puede desactivar.</li>'
      + '</ul></div>'
      + enlaceExplicar('Ver cómo funciona antes de activar')
      + '<div class="lg-actions">'
      + '  <button type="button" class="lg-btn-ghost" data-a="no">Cancelar</button>'
      + '  <button type="button" class="lg-btn" data-a="si">Generar llave</button>'
      + '</div>');
    m.querySelector('[data-a="no"]').addEventListener('click', function () { m.remove(); });
    m.querySelector('[data-a="explica"]').addEventListener('click', explicar);
    m.querySelector('[data-a="si"]').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Generando…';
      try {
        mostrarLlave(m, await P().prepareEnable());
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Generar llave';
        toast('No se pudo generar la llave: ' + ((e && e.message) || e), 'error');
      }
    });
  }

  function normalizarGrupo(s) {
    return String(s || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  }

  // La llave en dos renglones de 4 grupos: si el navegador la corta donde
  // quiere, puede partir un grupo al medio y quien la copie a mano lee mal la
  // agrupación. Así el corte siempre cae entre grupos.
  function llaveEnRenglones(texto) {
    var g = texto.split('-');
    return esc(g.slice(0, 4).join('-')) + '<br>' + esc(g.slice(4).join('-'));
  }

  function mostrarLlave(m, prep) {
    var ultimo = prep.secretText.split('-').pop();
    var card = m.querySelector('.cf-card');
    card.innerHTML = ''
      + '<h3>Guarda esta llave</h3>'
      + '<p class="lg-p">Es la única vez que se muestra. Guárdala en un gestor de contraseñas o '
      + 'impresa en un lugar seguro, y compártela solo con tu equipo.</p>'
      + '<div class="cf-key">' + llaveEnRenglones(prep.secretText) + '</div>'
      + '<div class="cf-key-actions">'
      + '  <button type="button" class="lg-btn-ghost" data-a="copiar">Copiar</button>'
      + '  <button type="button" class="lg-btn-ghost" data-a="descargar">Descargar .txt</button>'
      + '  <span class="cf-fp-lbl">Huella <b>' + esc(prep.fingerprint) + '</b></span>'
      + '</div>'
      + '<label class="lg-check" for="cfSaved"><input type="checkbox" id="cfSaved">'
      + '<span>Guardé la llave y entiendo que, si se pierde, los datos cifrados no se pueden recuperar.</span></label>'
      + '<label class="cf-confirm" for="cfLast">Para confirmar, escribe el último grupo de la llave'
      + '<input class="cf-input cf-input-sm" id="cfLast" type="text" maxlength="4" autocomplete="off" spellcheck="false"></label>'
      + '<div class="cf-err" id="cfErr" hidden></div>'
      + '<div class="lg-actions">'
      + '  <button type="button" class="lg-btn-ghost" data-a="no">Cancelar</button>'
      + '  <button type="button" class="lg-btn" data-a="si" disabled>Activar cifrado</button>'
      + '</div>';

    var saved = card.querySelector('#cfSaved');
    var last = card.querySelector('#cfLast');
    var err = card.querySelector('#cfErr');
    var ok = card.querySelector('[data-a="si"]');

    function validar() {
      ok.disabled = !(saved.checked && normalizarGrupo(last.value) === normalizarGrupo(ultimo));
    }
    saved.addEventListener('change', validar);
    last.addEventListener('input', validar);

    card.querySelector('[data-a="copiar"]').addEventListener('click', function () {
      var b = this;
      var done = function () { b.textContent = 'Copiada'; setTimeout(function () { b.textContent = 'Copiar'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prep.secretText).then(done, function () { toast('No se pudo copiar: selecciónala a mano', 'warn'); });
      } else {
        toast('Tu navegador no deja copiar desde acá: selecciónala a mano', 'warn');
      }
    });

    card.querySelector('[data-a="descargar"]').addEventListener('click', function () {
      var fecha = '';
      try { fecha = new Date().toLocaleString('es-CO'); } catch (e) { }
      var txt = 'Llave de cifrado de datos de clientes\n\n'
        + prep.secretText + '\n\n'
        + 'Huella: ' + prep.fingerprint + '\n'
        + 'Generada: ' + fecha + '\n\n'
        + 'Guárdala en un lugar seguro y compártela solo con tu equipo.\n'
        + 'Si se pierde, los datos cifrados no se pueden recuperar.\n';
      var url = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = 'llave-cifrado-clientes.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });

    // Cancelar acá tampoco escribe nada: la llave solo existía en esta ventana.
    card.querySelector('[data-a="no"]').addEventListener('click', function () { m.remove(); });

    ok.addEventListener('click', async function () {
      if (ok.disabled) return;
      err.hidden = true;
      ok.disabled = true;
      ok.textContent = 'Activando…';
      try {
        await prep.commit(email());
        m.remove();
        toast('Cifrado activado. Comparte la llave con tu equipo para que la ingresen en sus dispositivos.', 'success');
        render();
      } catch (e) {
        err.textContent = (e && e.friendly) ? e.message : 'No se pudo activar: ' + ((e && (e.message || e.code)) || e);
        err.hidden = false;
        ok.textContent = 'Activar cifrado';
        validar();
      }
    });

    setTimeout(function () { last.focus(); }, 50);
  }

  async function olvidar() {
    if (!P()) return;
    if (!confirm('¿Olvidar la llave en este dispositivo?\n\nLos datos de clientes dejarán de verse acá '
      + 'hasta que la vuelvas a ingresar. No se borra nada de la nube.')) return;
    await P().forgetDevice();
    toast('Se borró la llave de este dispositivo', 'info');
  }

  // ── Aviso cuando falta la llave ───────────────────────────
  // Una vez por sesión: al arrancar con el cifrado activo y sin llave, o la
  // primera vez que algo no se pudo guardar por eso.
  var _avisado = false;
  function avisar() {
    if (_avisado) return;
    _avisado = true;
    var msg = 'Los datos de clientes están cifrados y este dispositivo no tiene la llave.';
    if (typeof window.showTopNotice === 'function') window.showTopNotice(msg, 'Ingresar llave', pedirLlave);
    else toast(msg, 'warn');
  }

  document.addEventListener('pii:locked', avisar);

  function montar() {
    if (!P()) return;
    P().onChange(function (st) {
      render();
      if (st && st.initialized && st.enabled && !st.ready) avisar();
      // Ya tiene la llave: el aviso que se mostró por faltarle ya no aplica.
      if (st && st.ready && _avisado && typeof window.hideTopNotice === 'function') window.hideTopNotice();
    });
    render();
  }

  if (document.readyState !== 'loading') montar();
  else document.addEventListener('DOMContentLoaded', montar);

  window.CifradoUI = { activar: activar, pedirLlave: pedirLlave, olvidar: olvidar, render: render, explicar: explicar };
})();
