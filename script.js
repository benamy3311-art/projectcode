'use strict';

// All panels remain readable when JavaScript is unavailable.
document.querySelectorAll('[data-tabs]').forEach((group) => {
  const list = group.querySelector('[role="tablist"]');
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  if (panels.some((panel) => !panel)) return;

  function activate(index, moveFocus = false) {
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
      if (!selected) panels[i].querySelectorAll('video').forEach((video) => video.pause());
    });
    if (moveFocus) tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(index));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(next, true);
    });
  });

  function revealLinkedPanel() {
    const index = panels.findIndex((panel) => `#${panel.id}` === window.location.hash);
    if (index !== -1) {
      activate(index);
      panels[index].scrollIntoView({ block: 'start' });
    }
  }

  activate(0);
  group.classList.add('js-tabs');
  list.hidden = false;
  revealLinkedPanel();
  window.addEventListener('hashchange', revealLinkedPanel);
});

// Playback is always voluntary, including after changing tabs.
const videos = Array.from(document.querySelectorAll('video'));
videos.forEach((video) => {
  video.addEventListener('play', () => {
    videos.forEach((other) => { if (other !== video) other.pause(); });
  });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) videos.forEach((video) => video.pause());
});

const heroVideo = document.getElementById('hero-video');
const speedSelect = document.getElementById('hero-speed');
if (heroVideo && speedSelect) {
  const guideStep = document.getElementById('guide-step');
  const guideText = document.getElementById('guide-text');
  // Times are positions in the original recording, independent of playback rate.
  const chapters = [
    { start: 0, title: '01 / Consulte el catálogo', text: 'Mire el panel central: cada producto aparece con su referencia y precio.' },
    { start: 2.3, title: '02 / Encuentre el producto', text: 'Mire el buscador superior: al escribir «RTX 5070», aparecen las referencias relacionadas.' },
    { start: 5.8, title: '03 / Añada productos', text: 'Mire los botones «Añadir»: se seleccionan dos productos para la cotización.' },
    { start: 10.3, title: '04 / Compruebe el total', text: 'Mire el panel izquierdo: el total incluye los dos productos seleccionados.' },
    { start: 12.3, title: '05 / Revise la cotización', text: 'Mire el documento: reúne los productos y sus precios para revisar la propuesta.' }
  ];
  let currentChapter = -1;
  function updateGuide() {
    let next = 0;
    chapters.forEach((chapter, index) => { if (heroVideo.currentTime >= chapter.start) next = index; });
    if (next === currentChapter) return;
    currentChapter = next;
    guideStep.textContent = chapters[next].title;
    guideText.textContent = chapters[next].text;
  }
  function setSpeed() {
    const rate = Number(speedSelect.value);
    heroVideo.defaultPlaybackRate = rate;
    heroVideo.playbackRate = rate;
  }
  setSpeed();
  heroVideo.addEventListener('loadedmetadata', setSpeed);
  speedSelect.addEventListener('change', setSpeed);
  heroVideo.addEventListener('ratechange', () => {
    const rate = String(heroVideo.playbackRate);
    if (!Array.from(speedSelect.options).some((option) => option.value === rate)) {
      speedSelect.add(new Option(`${rate.replace('.', ',')}×`, rate));
    }
    speedSelect.value = rate;
  });
  heroVideo.addEventListener('play', updateGuide);
  heroVideo.addEventListener('timeupdate', updateGuide);
  heroVideo.addEventListener('seeked', updateGuide);
  document.getElementById('speed-control').hidden = false;
}

// Image links work on their own; supported browsers add an accessible detail view.
const dialog = document.getElementById('image-dialog');
if (dialog && typeof dialog.showModal === 'function') {
  const detailImage = document.getElementById('image-detail');
  const title = document.getElementById('image-title');
  const scroller = document.getElementById('image-scroll');
  const sizeButton = document.getElementById('image-size');
  const closeButton = document.getElementById('image-close');
  let returnFocus;

  document.querySelectorAll('a[data-zoom]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      returnFocus = link;
      title.textContent = link.dataset.zoom;
      const sourceImage = link.closest('figure')?.querySelector('img');
      detailImage.alt = sourceImage?.alt || link.dataset.zoom;
      detailImage.src = link.href;
      scroller.classList.remove('is-original');
      sizeButton.setAttribute('aria-pressed', 'false');
      sizeButton.textContent = 'Tamaño original';
      dialog.showModal();
      scroller.scrollTop = 0;
      scroller.scrollLeft = 0;
    });
  });

  sizeButton.addEventListener('click', () => {
    const original = scroller.classList.toggle('is-original');
    sizeButton.setAttribute('aria-pressed', String(original));
    sizeButton.textContent = original ? 'Ajustar a la pantalla' : 'Tamaño original';
    scroller.scrollTop = 0;
    scroller.scrollLeft = 0;
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { if (returnFocus) returnFocus.focus({ preventScroll: true }); });
}
