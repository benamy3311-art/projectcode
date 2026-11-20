// ============================================================
// SUPERVISAR CHATS (dueño / jefe, PC)
// ============================================================
// Una sección aparte (en "Más", no lo primero que ve el dueño) para mirar
// todos los chats del equipo de un vistazo:
//   - quién atiende cada uno y si el cliente lleva más de 10 minutos sin
//     respuesta (en rosa),
//   - transferir un chat a otro asesor (o dejarlo libre),
//   - "Repartir los libres": asigna los chats sin dueño por turnos entre los
//     asesores, al que menos chats abiertos tenga,
//   - abrirlo para contestar él mismo (en Chats).
// Las reglas (firestore.rules, wa_conversations) solo dejan transferir al jefe.
//
// Globales que expone (window.*):
//   Supervisar.abrir()
//
// Depende de: whatsapp-inbox.js (WaInbox), firebase-auth.js (_slDb,
//             _slUserRol), domain.js (esc), ui.js (switchTab, showToast)
// Estilos: styles/supervisar.css
// ============================================================
(function () {
  'use strict';

  var _equipo = null; // [{ email, nombre }]

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s); }
  function toast(m, t) { if (window.showToast) showToast(m, t || 'info', null, 2600); }
  function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0); }
  function esJefe() { return ['jefe', 'admin'].indexOf(window._slUserRol) >= 0; }
  function visible() { var p = $('panel-supervision'); return !!p && p.style.display !== 'none'; }
  function hace(t) {
    if (!t) return '';
    var m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'ahora' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.floor(m / 60) + ' h' : 'hace ' + Math.floor(m / 1440) + ' d';
  }
  function nombreDe(email, datos) {
    var n = datos && (datos.nombre || datos.displayName);
    if (n) return String(n).split(' ')[0];
    var l = String(email || '').split('@')[0].split(/[._-]/)[0];
    return l ? l.charAt(0).toUpperCase() + l.slice(1) : email;
  }

  function cargarEquipo() {
    if (_equipo || !window._slDb) return;
    _equipo = [];
    window._slDb.collection('approved_users').get().then(function (snap) {
      var lista = [];
      snap.forEach(function (d) {
        var x = d.data() || {};
        if (x.lite) return;
        lista.push({ email: d.id.toLowerCase(), nombre: nombreDe(d.id, x), rol: x.rol || 'asesor' });
      });
      lista.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
      _equipo = lista;
      if (visible()) pintar();
    }, function () { _equipo = []; });
  }

  function panel() {
    var p = $('panel-supervision');
    if (p) return p;
    var pv = document.querySelector('.pv');
    if (!pv) return null;
    p = document.createElement('div');
    p.id = 'panel-supervision';
    p.className = 'ivapanel sv';
    p.style.display = 'none';
    pv.appendChild(p);
    p.addEventListener('change', function (e) {
      var s = e.target.closest('[data-sv-asignar]');
      if (s) asignar(s.getAttribute('data-sv-asignar'), s.value);
    });
    p.addEventListener('click', function (e) {
      var a = e.target.closest('[data-sv-abrir]');
      if (a && window.WaInbox) { window.WaInbox.abrir(a.getAttribute('data-sv-abrir')); return; }
      if (e.target.closest('[data-sv-repartir]')) repartir();
    });
    return p;
  }

  function asignar(waId, email) {
    if (!window._slDb || !window.firebase) return Promise.resolve();
    var quien = (_equipo || []).filter(function (x) { return x.email === email; })[0];
    return window._slDb.collection('wa_conversations').doc(waId).update({
      asignado: email || '', asignadoNombre: quien ? quien.nombre : '', asignadoAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      toast(email ? 'Chat transferido a ' + (quien ? quien.nombre : email) : 'Chat liberado', 'success');
    }, function (e) { toast(e && e.code === 'permission-denied' ? 'Solo el jefe puede transferir (o faltan las reglas nuevas).' : 'No se pudo transferir', 'warn'); });
  }

  // Los chats libres se reparten por turnos: cada uno al asesor con menos
  // chats abiertos en ese momento.
  function repartir() {
    if (!window.WaInbox) return;
    var asesores = (_equipo || []).filter(function (x) { return x.rol !== 'jefe' && x.rol !== 'bodega'; });
    if (!asesores.length) { toast('No hay asesores en el equipo', 'warn'); return; }
    var convs = window.WaInbox.convs();
    var carga = {};
    asesores.forEach(function (a) { carga[a.email] = 0; });
    convs.forEach(function (c) { var k = String(c.asignado || '').toLowerCase(); if (k in carga && (c.noLeidos > 0 || window.WaInbox.sinRespuesta(c))) carga[k]++; });
    var libres = convs.filter(function (c) { return !c.asignado && c.noLeidos > 0; });
    if (!libres.length) { toast('No hay chats libres por repartir', 'info'); return; }
    var pasos = libres.map(function (c) {
      var a = asesores.slice().sort(function (x, y) { return carga[x.email] - carga[y.email]; })[0];
      carga[a.email]++;
      return asignar(c.id, a.email);
    });
    Promise.all(pasos).then(function () { toast(libres.length + (libres.length === 1 ? ' chat repartido' : ' chats repartidos'), 'success'); });
  }

  function pintar() {
    var p = panel();
    if (!p) return;
    if (!esJefe()) { p.innerHTML = '<div class="sv-in"><p class="sv-sub">Solo el jefe supervisa los chats del equipo.</p></div>'; return; }
    cargarEquipo();
    var convs = window.WaInbox ? window.WaInbox.convs() : [];
    var sinResp = convs.filter(function (c) { return window.WaInbox.sinRespuesta(c); });
    var libres = convs.filter(function (c) { return !c.asignado && c.noLeidos > 0; });
    var orden = convs.slice().sort(function (a, b) {
      var pa = window.WaInbox.sinRespuesta(a) ? 0 : (!a.asignado && a.noLeidos > 0) ? 1 : a.noLeidos > 0 ? 2 : 3;
      var pb = window.WaInbox.sinRespuesta(b) ? 0 : (!b.asignado && b.noLeidos > 0) ? 1 : b.noLeidos > 0 ? 2 : 3;
      return pa - pb || ms(b.ultimoAt) - ms(a.ultimoAt);
    });
    var opciones = function (c) {
      var actual = String(c.asignado || '').toLowerCase();
      var lista = (_equipo || []).slice();
      if (actual && !lista.some(function (x) { return x.email === actual; })) lista.push({ email: actual, nombre: c.asignadoNombre || actual });
      return '<option value="">Sin asignar</option>' + lista.map(function (x) { return '<option value="' + esc(x.email) + '"' + (x.email === actual ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('');
    };
    var filas = orden.map(function (c) {
      var estado = window.WaInbox.sinRespuesta(c) ? '<span class="sv-est sv-rojo">Sin respuesta ' + esc(hace(Math.max(ms(c.ultimoAt), ms(c.asignadoAt)))) + '</span>'
        : (!c.asignado && c.noLeidos > 0) ? '<span class="sv-est sv-dur">Libre · ' + c.noLeidos + ' sin leer</span>'
        : c.noLeidos > 0 ? '<span class="sv-est sv-cie">' + c.noLeidos + ' sin leer</span>'
        : '<span class="sv-est">Al día</span>';
      var tono = window.tonoAvatar ? window.tonoAvatar(c.nombre || c.id) : '';
      var ini = String(c.nombre || '#').split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
      return '<div class="sv-fila">'
        + '<span class="wa-av ' + tono + '">' + esc(ini) + '</span>'
        + '<span class="sv-quien"><b>' + esc(c.nombre || '+' + c.id) + '</b><small>' + esc(c.ultimoTexto || '') + '</small></span>'
        + '<span class="sv-hora">' + esc(hace(ms(c.ultimoAt))) + '</span>'
        + estado
        + '<label class="sv-atiende"><span class="solo-lector">Quién atiende a ' + esc(c.nombre || c.id) + '</span><select data-sv-asignar="' + esc(c.id) + '">' + opciones(c) + '</select></label>'
        + '<button type="button" class="sv-btn" data-sv-abrir="' + esc(c.id) + '">Abrir chat</button>'
        + '</div>';
    }).join('') || '<p class="sv-vacio">Todavía no hay chats.</p>';

    p.innerHTML = '<div class="sv-in">'
      + '<header class="sv-cab"><div><p class="sv-eti">Supervisar chats</p><h1>' + (sinResp.length ? sinResp.length + (sinResp.length === 1 ? ' cliente espera respuesta' : ' clientes esperan respuesta') : 'El equipo está al día') + '</h1>'
      + '<p class="sv-sub">Quién atiende cada chat. Si alguien lleva 10 minutos sin responder, sale primero y en rosa: transfiérelo o ábrelo y respóndelo tú.</p></div>'
      + '<button type="button" class="sv-btn sv-btn-tinta" data-sv-repartir' + (libres.length ? '' : ' disabled') + '>Repartir los libres' + (libres.length ? ' (' + libres.length + ')' : '') + '</button></header>'
      + '<section class="sv-lista">' + filas + '</section>'
      + '</div>';
  }

  if (typeof window.switchTab === 'function') {
    var original = window.switchTab;
    var envuelta = function (t) {
      if (t === 'supervision') panel();
      var r = original.apply(this, arguments);
      if (t === 'supervision') pintar();
      return r;
    };
    envuelta._riel = original._riel;
    window.switchTab = envuelta;
  }
  document.addEventListener('sl:wa-convs', function () { if (visible()) pintar(); });
  setInterval(function () { if (visible()) pintar(); }, 60000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
  else panel();

  window.Supervisar = { abrir: function () { switchTab('supervision'); } };
})();
