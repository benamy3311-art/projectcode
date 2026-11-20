// ============================================================
// CAPA LEGAL — términos, privacidad y consentimiento
// ============================================================
// Reúne en un solo lugar lo que la app necesita para operar como producto
// que se le vende a terceros: aceptación de términos con registro auditable,
// política de tratamiento de datos (Ley 1581 de 2012), aviso de propiedad
// intelectual con vía de retiro, y el consentimiento de analítica.
//
// Cómo funciona la aceptación:
//   - Al resolverse el login se llama requireAcceptance(email). Si esa
//     persona no aceptó la versión VIGENTE de los documentos, se le muestra
//     la pantalla de aceptación y no puede usar la app hasta aceptar.
//   - La aceptación queda en Firestore (legal_acceptances/{email}) con la
//     versión, la fecha y el userAgent — que es lo que sirve como prueba —
//     y en localStorage para no volver a preguntar en cada carga.
//   - Subir LEGAL_VERSION obliga a todo el mundo a aceptar de nuevo. Es el
//     mecanismo para cuando cambien los textos.
//
// Analítica: Google Analytics arranca DENEGADO vía Consent Mode (ver el
// bloque gtag de index.html) y solo se habilita si la persona lo marca.
// Nada de tracking antes del consentimiento.
//
// Globales que expone (window.*):
//   Legal.requireAcceptance(email)  — muestra la pantalla si hace falta
//   Legal.open(docKey)              — abre los documentos para leerlos
//   Legal.hasAccepted()             — bool, contra la versión vigente
//   Legal.confirmUploadRights()     — Promise<bool>, declaración de derechos
//                                     antes de publicar una lista de precios
//   Legal.setAnalytics(on)          — cambia el consentimiento de analítica
//
// Depende de: firebase-auth.js (window._slDb, _slAuth) de forma opcional —
//   sin Firebase la aceptación se guarda solo local y la app no se bloquea.
// Requiere DOM: ninguno propio; se inyecta en <body>.
// ============================================================
(function () {
  'use strict';

  // ── DATOS DEL RESPONSABLE ─────────────────────────────────
  // COMPLETAR ANTES DE PUBLICAR. Todo lo que aparece en los documentos sale
  // de acá, así que se cambia en un solo lugar. Mientras diga "[COMPLETAR]"
  // los documentos lo muestran marcado en rojo, para que no se escape a
  // producción sin llenar.
  var ORG = {
    responsable: '[COMPLETAR: razón social o nombre completo]',
    nit:         '[COMPLETAR: NIT o cédula]',
    domicilio:   '[COMPLETAR: dirección, ciudad]',
    ciudad:      '[COMPLETAR: ciudad]',
    email:       '[COMPLETAR: correo de contacto]',
    telefono:    '[COMPLETAR: teléfono de contacto]',
    producto:    'ProjectCode'
  };

  // Subir esta versión obliga a re-aceptar. Formato libre; se guarda tal cual.
  var LEGAL_VERSION = '2026-09-13.1';

  var LS_ACCEPT = 'sl_legal_accept';
  var LS_ANALYTICS = 'sl_legal_analytics';
  var LS_UPLOAD_DECL = 'sl_legal_upload_decl';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Los pendientes salen marcados para que se vean en una revisión.
  function org(k) {
    var v = ORG[k] || '';
    return /^\[COMPLETAR/.test(v)
      ? '<mark class="lg-todo">' + esc(v) + '</mark>'
      : esc(v);
  }

  function hoy() {
    try {
      return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return ''; }
  }

  // ── DOCUMENTOS ────────────────────────────────────────────
  // Redactados para el contexto colombiano. NO son asesoría legal: son un
  // borrador completo y específico de esta app, para que un abogado los
  // revise y ajuste antes de publicarlos.

  function docTerminos() {
    return ''
      + '<h3>Términos y Condiciones de Uso</h3>'
      + '<p class="lg-meta">Versión ' + esc(LEGAL_VERSION) + '</p>'

      + '<h4>1. Quién presta el servicio</h4>'
      + '<p>' + org('responsable') + ', NIT ' + org('nit') + ', con domicilio en '
      + org('domicilio') + ' (en adelante, el <b>Proveedor</b>), es titular del software '
      + esc(ORG.producto) + ' (el <b>Servicio</b>) y lo licencia para su uso bajo estos términos.</p>'

      + '<h4>2. Objeto y licencia</h4>'
      + '<p>El Proveedor concede una licencia de uso limitada, no exclusiva, intransferible y '
      + 'revocable sobre el Servicio, por el tiempo en que la cuenta esté activa. La licencia no '
      + 'transfiere la propiedad del software ni de su código, diseño o documentación, que '
      + 'permanecen en cabeza del Proveedor, incluso cuando el Servicio se use con marca propia '
      + 'del cliente (marca blanca). El uso de marca propia no otorga derecho alguno sobre el '
      + 'software.</p>'

      + '<h4>3. Cuenta y acceso</h4>'
      + '<p>El acceso requiere autenticación con una cuenta de Google autorizada previamente. '
      + 'La cuenta es personal: el usuario responde por lo que se haga desde ella y debe avisar '
      + 'de inmediato ante cualquier uso no autorizado. El Servicio admite una sesión activa por '
      + 'cuenta; al iniciar sesión en otro dispositivo se cierra la anterior. El Proveedor puede '
      + 'suspender o retirar el acceso cuando haya incumplimiento de estos términos, uso indebido '
      + 'o falta de pago.</p>'

      + '<h4>4. Contenido que carga el usuario</h4>'
      + '<p>El usuario puede cargar listas de precios, catálogos, logotipos, datos de sus clientes '
      + 'y otros contenidos (el <b>Contenido del Usuario</b>). Al cargarlos, el usuario '
      + '<b>declara y garantiza</b> que:</p>'
      + '<ul>'
      + '<li>Es titular de esos contenidos o cuenta con autorización suficiente del titular para '
      + 'cargarlos, publicarlos y tratarlos en el Servicio.</li>'
      + '<li>Los contenidos no corresponden a secretos empresariales, listas de precios, bases de '
      + 'datos o información confidencial de terceros obtenidos sin autorización, incluidos los de '
      + 'empleadores anteriores.</li>'
      + '<li>Cuenta con la autorización de los titulares de los datos personales que incorpore '
      + '(por ejemplo, nombre y teléfono de sus clientes) para que sean tratados en el Servicio.</li>'
      + '</ul>'
      + '<p>El usuario mantendrá indemne al Proveedor frente a reclamaciones de terceros derivadas '
      + 'del Contenido del Usuario. El usuario concede al Proveedor una licencia limitada, '
      + 'únicamente para alojar, procesar y mostrar ese contenido con el fin de prestar el '
      + 'Servicio.</p>'

      + '<h4>5. Conductas prohibidas</h4>'
      + '<ul>'
      + '<li>Cargar o publicar información de terceros sin autorización.</li>'
      + '<li>Usar el Servicio para actos de competencia desleal o violación de secretos '
      + 'empresariales.</li>'
      + '<li>Intentar acceder a datos de otros usuarios, vulnerar los controles de acceso o hacer '
      + 'ingeniería inversa sobre el Servicio.</li>'
      + '<li>Revender, sublicenciar o redistribuir el Servicio sin autorización escrita.</li>'
      + '</ul>'

      + '<h4>6. Precios, cotizaciones y responsabilidad del usuario</h4>'
      + '<p>El Servicio es una herramienta de apoyo: los precios, descuentos, impuestos, '
      + 'condiciones comerciales y demás contenidos de cada cotización son definidos y verificados '
      + 'por el usuario. El Proveedor no es parte de la relación comercial entre el usuario y sus '
      + 'clientes, ni responde por el contenido de las cotizaciones, por errores de digitación o '
      + 'de catálogo, ni por decisiones de venta tomadas con base en ellas.</p>'

      + '<h4>7. Funciones con inteligencia artificial</h4>'
      + '<p>Algunas funciones envían texto o imágenes a servicios de terceros para su '
      + 'procesamiento (ver la Política de Datos). Sus resultados son sugerencias automáticas que '
      + 'pueden contener errores y deben ser revisadas por el usuario antes de usarse. El usuario '
      + 'no debe enviar por esa vía información confidencial de terceros.</p>'

      + '<h4>8. Disponibilidad y garantías</h4>'
      + '<p>El Servicio se presta "tal como está", sin garantía de disponibilidad ininterrumpida. '
      + 'El Proveedor puede modificar, suspender o descontinuar funciones, procurando avisar con '
      + 'antelación razonable cuando el cambio sea sustancial. El usuario es responsable de '
      + 'conservar copia de la información que considere crítica.</p>'

      + '<h4>9. Limitación de responsabilidad</h4>'
      + '<p>En la medida permitida por la ley, la responsabilidad del Proveedor derivada del '
      + 'Servicio se limita al valor pagado por el usuario en los tres (3) meses anteriores al '
      + 'hecho que la origine. El Proveedor no responde por lucro cesante, pérdida de oportunidad '
      + 'ni daños indirectos. Nada en esta cláusula excluye la responsabilidad por dolo o culpa '
      + 'grave.</p>'

      + '<h4>10. Terminación</h4>'
      + '<p>Cualquiera de las partes puede terminar la relación en cualquier momento. Terminada, '
      + 'cesa el acceso al Servicio; el usuario puede solicitar copia de sus datos antes del '
      + 'cierre, conforme a la Política de Datos.</p>'

      + '<h4>11. Cambios en los términos</h4>'
      + '<p>Estos términos se identifican por versión. Cuando cambien de forma sustancial, se '
      + 'solicitará una nueva aceptación al ingresar. El uso posterior a la aceptación implica '
      + 'sujeción a la versión vigente.</p>'

      + '<h4>12. Ley aplicable y jurisdicción</h4>'
      + '<p>Estos términos se rigen por las leyes de la República de Colombia. Las controversias '
      + 'se someterán a los jueces competentes de ' + org('ciudad') + ', sin perjuicio de los '
      + 'derechos que la ley reconozca al usuario como consumidor.</p>'

      + '<h4>13. Contacto</h4>'
      + '<p>' + org('email') + ' &middot; ' + org('telefono') + '</p>';
  }

  function docPrivacidad() {
    return ''
      + '<h3>Política de Tratamiento de Datos Personales</h3>'
      + '<p class="lg-meta">Versión ' + esc(LEGAL_VERSION) + ' &middot; Ley 1581 de 2012 y Decreto 1377 de 2013</p>'

      + '<h4>1. Responsable</h4>'
      + '<p>' + org('responsable') + ', NIT ' + org('nit') + ', domicilio ' + org('domicilio')
      + ', correo ' + org('email') + ', teléfono ' + org('telefono') + '.</p>'

      + '<h4>2. Dos roles distintos</h4>'
      + '<p>Conviene distinguirlos porque las obligaciones cambian:</p>'
      + '<ul>'
      + '<li><b>Como responsable</b>, respecto de los datos de las personas que usan la '
      + 'aplicación (los asesores y administradores de cada tienda).</li>'
      + '<li><b>Como encargado</b>, respecto de los datos de los clientes finales que cada '
      + 'usuario incorpora a sus cotizaciones. Esos datos son de la tienda que los recolecta; el '
      + 'Proveedor los trata por cuenta de ella y siguiendo sus instrucciones, y no los usa para '
      + 'fines propios.</li>'
      + '</ul>'

      + '<h4>3. Qué datos se tratan</h4>'
      + '<p>De quienes usan la aplicación:</p>'
      + '<ul>'
      + '<li>Correo electrónico y nombre de la cuenta de Google con la que inician sesión.</li>'
      + '<li>Nombre del asesor y número de WhatsApp que la persona configura para sus cotizaciones.</li>'
      + '<li>Registro de inicios de sesión: fecha, hora e identificador del navegador '
      + '(<i>user agent</i>), usados para control de acceso y seguridad.</li>'
      + '<li>Datos de uso agregados: cantidad de cotizaciones por mes y búsquedas sin resultado, '
      + 'usados para métricas internas y para mejorar el catálogo.</li>'
      + '</ul>'
      + '<p>De los clientes finales, cuando el usuario los registra:</p>'
      + '<ul>'
      + '<li>Nombre o razón social, NIT, teléfono o WhatsApp, correo y ciudad.</li>'
      + '<li>Notas comerciales, estado de la negociación e historial de cotizaciones asociadas.</li>'
      + '</ul>'

      + '<h4>4. Para qué se tratan</h4>'
      + '<ul>'
      + '<li>Autenticar a la persona y controlar el acceso a la aplicación.</li>'
      + '<li>Prestar las funciones del Servicio: generar cotizaciones, conservar el historial y '
      + 'permitir el seguimiento comercial.</li>'
      + '<li>Soporte técnico y atención de solicitudes.</li>'
      + '<li>Seguridad: detectar accesos no autorizados y uso indebido.</li>'
      + '<li>Métricas de uso del producto. La analítica web solo opera con consentimiento previo '
      + 'y puede revocarse en cualquier momento desde la aplicación.</li>'
      + '</ul>'

      + '<h4>5. Terceros que intervienen</h4>'
      + '<p>La operación se apoya en proveedores de infraestructura que pueden almacenar o '
      + 'procesar datos fuera de Colombia: en Estados Unidos y, en el caso de DeepSeek, en la '
      + 'República Popular China:</p>'
      + '<ul>'
      + '<li><b>Google (Firebase Authentication y Cloud Firestore)</b>: autenticación y '
      + 'almacenamiento de la información de la aplicación.</li>'
      + '<li><b>Google Analytics</b>: métricas de uso. Solo se activa con consentimiento.</li>'
      + '<li><b>Google (API de Gemini)</b>: procesa el texto o las imágenes que el usuario envía a '
      + 'las funciones de inteligencia artificial, como el escaneo de cotizaciones y el '
      + 'asistente.</li>'
      + '<li><b>Groq</b> (Estados Unidos): genera el texto de la cotización en la función '
      + '"Generar texto", a partir de los productos, los precios y el contexto que el usuario '
      + 'escriba sobre el cliente o el caso.</li>'
      + '<li><b>DeepSeek</b> (República Popular China): procesa la solicitud que el usuario '
      + 'escribe en la función "Armar PC" junto con el catálogo, para proponer los '
      + 'componentes.</li>'
      + '<li><b>Vercel</b>: alojamiento de la aplicación web.</li>'
      + '<li><b>GitHub</b>: almacenamiento de los archivos de catálogo que publica el '
      + 'administrador.</li>'
      + '</ul>'
      + '<p>Estas transferencias se realizan para poder prestar el Servicio y quedan cubiertas por '
      + 'la autorización que se otorga al aceptar esta política.</p>'

      + '<h4>6. Datos que no salen del dispositivo</h4>'
      + '<p>Algunas preferencias se guardan únicamente en el navegador de cada persona y no se '
      + 'envían a ningún servidor: el nombre del asesor, el WhatsApp, el logo cargado, la clave de '
      + 'API de inteligencia artificial si se configura, y el catálogo propio en el plan Lite. Se '
      + 'borran al limpiar los datos del navegador.</p>'

      + '<h4>7. Derechos del titular</h4>'
      + '<p>Toda persona puede conocer, actualizar y rectificar sus datos; solicitar prueba de la '
      + 'autorización; ser informada del uso que se les ha dado; presentar quejas ante la '
      + 'Superintendencia de Industria y Comercio; y revocar la autorización o solicitar la '
      + 'supresión cuando no exista un deber legal o contractual de conservarlos.</p>'
      + '<p>Las solicitudes se reciben en ' + org('email') + '. Las consultas se atienden en un '
      + 'plazo máximo de diez (10) días hábiles y los reclamos en quince (15) días hábiles, '
      + 'prorrogables en los términos de la ley.</p>'
      + '<p>Cuando la solicitud se refiera a datos de un cliente final, se tramitará junto con la '
      + 'tienda que los recolectó, que es quien responde como responsable de esa base.</p>'

      + '<h4>8. Conservación</h4>'
      + '<p>Los datos se conservan mientras la cuenta esté activa y, después, por el tiempo '
      + 'necesario para atender obligaciones legales, contables o de defensa jurídica. Cerrada la '
      + 'cuenta, el usuario puede solicitar la eliminación de su información.</p>'

      + '<h4>9. Seguridad</h4>'
      + '<p>El acceso está restringido a cuentas autorizadas y la información viaja cifrada. '
      + 'Ninguna medida elimina por completo el riesgo; ante un incidente que comprometa datos '
      + 'personales se informará a los afectados y a la autoridad cuando corresponda.</p>'
      + '<p>Además, cada empresa puede activar el <b>cifrado de los datos de sus clientes</b>. '
      + 'Con el cifrado activo, el nombre, NIT, teléfono, correo, ciudad, notas y fotos de '
      + 'recogidas se cifran en el dispositivo antes de guardarse, con una llave que solo tiene '
      + 'la empresa: ni el Proveedor ni Google pueden leerlos en la base de datos. Si la empresa '
      + 'pierde esa llave, esos datos no se pueden recuperar. Las funciones de inteligencia '
      + 'artificial siguen recibiendo, en el momento de usarlas, el texto que el usuario les '
      + 'envía, según lo descrito en la sección 5.</p>'

      + '<h4>10. Vigencia</h4>'
      + '<p>Esta política rige desde su aceptación y permanece vigente mientras se traten los '
      + 'datos. Los cambios sustanciales se informarán solicitando una nueva aceptación.</p>';
  }

  function docPropiedad() {
    return ''
      + '<h3>Propiedad Intelectual y Contenido de Terceros</h3>'
      + '<p class="lg-meta">Versión ' + esc(LEGAL_VERSION) + '</p>'

      + '<h4>1. Titularidad del software</h4>'
      + '<p>El código, la interfaz, el diseño y la documentación de ' + esc(ORG.producto) + ' son '
      + 'propiedad de ' + org('responsable') + ' y están protegidos por la Ley 23 de 1982 y la '
      + 'Decisión Andina 351 de 1993. La licencia de uso no transfiere titularidad.</p>'

      + '<h4>2. Marcas y contenidos de cada cliente</h4>'
      + '<p>Los logotipos, nombres comerciales y catálogos que cada cliente configura siguen '
      + 'siendo suyos. El Proveedor los usa únicamente para mostrarlos dentro de la aplicación de '
      + 'ese cliente y no los emplea en material propio ni los muestra a otros clientes.</p>'

      + '<h4>3. Listas de precios y secretos empresariales</h4>'
      + '<p>Una lista de precios, un catálogo o una base de clientes puede constituir secreto '
      + 'empresarial de la empresa que la elaboró. Cargar o publicar ese material sin autorización '
      + 'puede configurar violación de secretos y actos de competencia desleal (Ley 256 de 1996), '
      + 'con responsabilidad de quien lo carga. Está prohibido hacerlo en el Servicio.</p>'

      + '<h4>4. Retiro de contenido</h4>'
      + '<p>Quien considere que un contenido alojado en el Servicio infringe sus derechos puede '
      + 'escribir a ' + org('email') + ' indicando: identificación del solicitante, descripción y '
      + 'ubicación del contenido, fundamento del derecho invocado y datos de contacto. La '
      + 'solicitud se acusa dentro de los tres (3) días hábiles siguientes; verificada, el '
      + 'contenido se retira o se restringe su acceso, y se informa al usuario que lo cargó para '
      + 'que presente sus descargos.</p>'

      + '<h4>5. Reincidencia</h4>'
      + '<p>Las cuentas que carguen de forma reiterada contenido ajeno sin autorización pueden ser '
      + 'suspendidas o cerradas.</p>';
  }

  var DOCS = {
    terminos:  { titulo: 'Términos y Condiciones', build: docTerminos },
    privacidad:{ titulo: 'Tratamiento de Datos',   build: docPrivacidad },
    propiedad: { titulo: 'Propiedad Intelectual',  build: docPropiedad }
  };

  // ── Estado de aceptación ──────────────────────────────────
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  function hasAccepted() { return lsGet(LS_ACCEPT) === LEGAL_VERSION; }

  function analyticsOn() { return lsGet(LS_ANALYTICS) === '1'; }

  // Consent Mode: el bloque gtag de index.html arranca en 'denied'. Acá solo
  // se levanta si la persona lo autorizó, y se vuelve a bajar si lo revoca.
  function applyAnalyticsConsent() {
    var granted = analyticsOn();
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: granted ? 'granted' : 'denied'
        });
      }
    } catch (e) { }
    return granted;
  }

  function setAnalytics(on) {
    lsSet(LS_ANALYTICS, on ? '1' : '0');
    applyAnalyticsConsent();
    // Dejar constancia del cambio junto a la aceptación, si hay sesión.
    recordAcceptance({ analytics: !!on, soloActualizarAnalitica: true });
  }

  // Guarda la constancia en Firestore. Si las reglas no lo permiten todavía
  // (ver FIRESTORE_RULES_LEGAL.md) NO se bloquea a nadie: la aceptación vale
  // igual y queda en el dispositivo; solo se pierde la copia del servidor.
  function recordAcceptance(opts) {
    opts = opts || {};
    var email = '';
    try {
      email = (window._slAuth && window._slAuth.currentUser && window._slAuth.currentUser.email) || lsGet('sl_user_email') || '';
    } catch (e) { }
    if (!email || !window._slDb) return Promise.resolve(false);
    var data = {
      email: email,
      version: LEGAL_VERSION,
      analytics: !!opts.analytics,
      userAgent: (navigator.userAgent || '').slice(0, 200),
      acceptedAt: Date.now()
    };
    if (opts.soloActualizarAnalitica) {
      data = { email: email, analytics: !!opts.analytics, analyticsChangedAt: Date.now() };
    }
    try {
      if (window.firebase && firebase.firestore && firebase.firestore.FieldValue) {
        data.serverTime = firebase.firestore.FieldValue.serverTimestamp();
      }
      return window._slDb.collection('legal_acceptances').doc(email)
        .set(data, { merge: true })
        .then(function () { return true; })
        .catch(function (e) {
          console.warn('[legal] no se pudo guardar la aceptación en Firestore:', e && e.code);
          return false;
        });
    } catch (e) { return Promise.resolve(false); }
  }

  // ── Pantalla de aceptación ────────────────────────────────
  var _gateEl = null;

  function buildGate() {
    var el = document.createElement('div');
    el.className = 'lg-gate';
    el.id = 'legalGate';
    el.innerHTML = ''
      + '<div class="lg-card">'
      + '  <div class="lg-card-hd">'
      + '    <div class="lg-ico">' + shieldIcon() + '</div>'
      + '    <div>'
      + '      <h2>Antes de empezar</h2>'
      + '      <p>Necesitamos tu aceptación de las condiciones de uso y del tratamiento de tus datos.</p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="lg-tabs" id="lgTabs">' + tabsHtml('terminos') + '</div>'
      + '  <div class="lg-doc" id="lgDoc">' + DOCS.terminos.build() + '</div>'
      + '  <label class="lg-check" for="lgAccept">'
      + '    <input type="checkbox" id="lgAccept">'
      + '    <span>He leído y acepto los <b>Términos y Condiciones</b>, la <b>Política de '
      + 'Tratamiento de Datos Personales</b> y el aviso de <b>Propiedad Intelectual</b>. '
      + 'Autorizo el tratamiento de mis datos para las finalidades allí descritas.</span>'
      + '  </label>'
      + '  <label class="lg-check lg-check-soft" for="lgAnalytics">'
      + '    <input type="checkbox" id="lgAnalytics">'
      + '    <span>Opcional: autorizo el uso de analítica para medir el uso de la aplicación y '
      + 'mejorarla. Puedo revocarlo cuando quiera desde Configuración.</span>'
      + '  </label>'
      + '  <div class="lg-actions">'
      + '    <button type="button" class="lg-btn-ghost" id="lgReject">No acepto</button>'
      + '    <button type="button" class="lg-btn" id="lgContinue" disabled>Aceptar y continuar</button>'
      + '  </div>'
      + '</div>';
    return el;
  }

  function shieldIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
      + 'stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z"/>'
      + '<path d="M9.5 12.5l1.8 1.8 3.5-3.6"/></svg>';
  }

  function tabsHtml(activo) {
    var out = '';
    for (var k in DOCS) {
      out += '<button type="button" class="lg-tab' + (k === activo ? ' is-active' : '')
        + '" data-doc="' + k + '">' + esc(DOCS[k].titulo) + '</button>';
    }
    return out;
  }

  function wireTabs(root, onChange) {
    root.querySelectorAll('.lg-tab').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-doc');
        root.querySelectorAll('.lg-tab').forEach(function (x) {
          x.classList.toggle('is-active', x === b);
        });
        onChange(k);
      });
    });
  }

  // ¿Están llenos los datos del responsable? Mientras quede algún
  // [COMPLETAR], la capa legal NO se impone: bloquear a todos los usuarios
  // con un documento que dice "[COMPLETAR: razón social]" en rojo es peor que
  // no mostrar nada — unos términos sin proveedor identificado no le sirven
  // a nadie. Se activa sola en cuanto se llenan los datos de ORG.
  function isConfigured() {
    for (var k in ORG) {
      if (/^\[COMPLETAR/.test(String(ORG[k] || ''))) return false;
    }
    return true;
  }

  // La entrada "Legal y privacidad" de Configuración tampoco se muestra sin
  // configurar: abriría esos mismos borradores con los pendientes a la vista.
  function syncSettingsEntry() {
    var sec = document.getElementById('secLegalSettings');
    if (sec) sec.style.display = isConfigured() ? '' : 'none';
  }
  if (document.readyState !== 'loading') syncSettingsEntry();
  else document.addEventListener('DOMContentLoaded', syncSettingsEntry);

  function requireAcceptance() {
    if (!isConfigured()) {
      console.warn('[legal] Pantalla de términos desactivada: faltan los datos del responsable (objeto ORG en ui/legal.js).');
      return;
    }
    if (hasAccepted()) { applyAnalyticsConsent(); return; }
    if (_gateEl) return;
    _gateEl = buildGate();
    document.body.appendChild(_gateEl);
    document.body.classList.add('lg-locked');

    var doc = _gateEl.querySelector('#lgDoc');
    var chk = _gateEl.querySelector('#lgAccept');
    var ana = _gateEl.querySelector('#lgAnalytics');
    var btn = _gateEl.querySelector('#lgContinue');

    wireTabs(_gateEl.querySelector('#lgTabs'), function (k) {
      doc.innerHTML = DOCS[k].build();
      doc.scrollTop = 0;
    });

    chk.addEventListener('change', function () { btn.disabled = !chk.checked; });

    btn.addEventListener('click', function () {
      if (!chk.checked) return;
      lsSet(LS_ACCEPT, LEGAL_VERSION);
      lsSet(LS_ANALYTICS, ana.checked ? '1' : '0');
      applyAnalyticsConsent();
      recordAcceptance({ analytics: ana.checked });
      close();
    });

    _gateEl.querySelector('#lgReject').addEventListener('click', function () {
      // Sin aceptación no hay servicio: se cierra la sesión y queda la
      // pantalla de login, que es el estado correcto (no un limbo). Con force:
      // sin preguntar "¿cerrar sesión?" y sin borrar cotizaciones que solo
      // estén en este dispositivo.
      if (typeof window._logout === 'function') window._logout(true);
      else close();
    });
  }

  function close() {
    if (!_gateEl) return;
    _gateEl.remove();
    _gateEl = null;
    document.body.classList.remove('lg-locked');
  }

  // ── Lector de documentos (fuera del gate) ─────────────────
  function open(docKey) {
    var k = DOCS[docKey] ? docKey : 'terminos';
    // Un solo lector abierto a la vez: sin esto, dos clics en "Ver documentos
    // legales" dejan dos modales encimados. Se cierra solo el lector anterior,
    // no el diálogo de declaración, que tiene una promesa esperando respuesta.
    document.querySelectorAll('.lg-modal-read').forEach(function (x) { x.remove(); });
    var m = document.createElement('div');
    m.className = 'lg-modal lg-modal-read';
    m.innerHTML = ''
      + '<div class="lg-card lg-card-read">'
      + '  <button type="button" class="lg-x" aria-label="Cerrar">&times;</button>'
      + '  <div class="lg-tabs">' + tabsHtml(k) + '</div>'
      + '  <div class="lg-doc"></div>'
      + '  <div class="lg-actions lg-actions-read">'
      + '    <label class="lg-check lg-check-soft" style="margin:0">'
      + '      <input type="checkbox" id="lgAnaToggle"' + (analyticsOn() ? ' checked' : '') + '>'
      + '      <span>Autorizo el uso de analítica para medir el uso de la aplicación.</span>'
      + '    </label>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(m);
    var doc = m.querySelector('.lg-doc');
    doc.innerHTML = DOCS[k].build();
    wireTabs(m, function (nk) { doc.innerHTML = DOCS[nk].build(); doc.scrollTop = 0; });
    m.querySelector('#lgAnaToggle').addEventListener('change', function () {
      setAnalytics(this.checked);
      if (typeof window.showToast === 'function') {
        showToast(this.checked ? 'Analítica autorizada' : 'Analítica desactivada', 'info');
      }
    });
    function cerrar() { m.remove(); }
    m.querySelector('.lg-x').addEventListener('click', cerrar);
    m.addEventListener('click', function (e) { if (e.target === m) cerrar(); });
  }

  // ── Declaración de derechos al publicar una lista ─────────
  // Se pide una vez por sesión de trabajo: publicar un catálogo es
  // exactamente el punto donde entra contenido de terceros.
  function confirmUploadRights() {
    if (lsGet(LS_UPLOAD_DECL) === LEGAL_VERSION) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var m = document.createElement('div');
      m.className = 'lg-modal';
      m.innerHTML = ''
        + '<div class="lg-card lg-card-sm">'
        + '  <h3>Declaración antes de publicar</h3>'
        + '  <p class="lg-p">Vas a publicar una lista de precios para todos los usuarios de esta '
        + 'instalación. Confirma que tienes derecho a hacerlo.</p>'
        + '  <label class="lg-check" for="lgUpDecl">'
        + '    <input type="checkbox" id="lgUpDecl">'
        + '    <span>Declaro que esta lista es propia o que cuento con autorización del titular '
        + 'para publicarla, y que no corresponde a información confidencial de un tercero.</span>'
        + '  </label>'
        + '  <div class="lg-actions">'
        + '    <button type="button" class="lg-btn-ghost" data-a="no">Cancelar</button>'
        + '    <button type="button" class="lg-btn" data-a="si" disabled>Publicar</button>'
        + '  </div>'
        + '</div>';
      document.body.appendChild(m);
      var chk = m.querySelector('#lgUpDecl');
      var ok = m.querySelector('[data-a="si"]');
      chk.addEventListener('change', function () { ok.disabled = !chk.checked; });
      ok.addEventListener('click', function () {
        lsSet(LS_UPLOAD_DECL, LEGAL_VERSION);
        m.remove(); resolve(true);
      });
      m.querySelector('[data-a="no"]').addEventListener('click', function () {
        m.remove(); resolve(false);
      });
    });
  }

  // Consentimiento aplicado apenas carga, sin esperar al login: si la
  // persona ya había aceptado, se respeta; si no, queda denegado.
  applyAnalyticsConsent();

  window.Legal = {
    requireAcceptance: requireAcceptance,
    open: open,
    hasAccepted: hasAccepted,
    confirmUploadRights: confirmUploadRights,
    setAnalytics: setAnalytics,
    analyticsOn: analyticsOn,
    version: LEGAL_VERSION
  };
})();
