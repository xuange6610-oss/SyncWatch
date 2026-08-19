'use strict';

const moduleImages = [...document.querySelectorAll('[data-module-image]')];
const stage = document.querySelector('[data-module-stage]');
const stageImage = stage?.querySelector('img');
const stageLabel = stage?.querySelector('[data-stage-label]');
const stageButtons = [...(stage?.querySelectorAll('[data-stage-index]') || [])];
const lightbox = document.querySelector('[data-module-lightbox]');
const lightboxImage = lightbox?.querySelector('img');
const lightboxCaption = lightbox?.querySelector('[data-lightbox-caption]');
let currentIndex = 0;

function showStage(index) {
  if (!stageImage || moduleImages.length === 0) return;
  currentIndex = (index + moduleImages.length) % moduleImages.length;
  const item = moduleImages[currentIndex];
  stageImage.src = item.dataset.src;
  stageImage.alt = item.dataset.alt;
  if (stageLabel) stageLabel.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${item.dataset.title}`;
  stageButtons.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === currentIndex)));
}

stageButtons.forEach((button) => button.addEventListener('click', () => showStage(Number(button.dataset.stageIndex))));

if (stage && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.matchMedia('(pointer: fine)').matches) {
  const screen = stage.querySelector('.module-stage__screen');
  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    screen.style.transform = `rotateX(${(4 - y * 5).toFixed(2)}deg) rotateY(${(-7 + x * 8).toFixed(2)}deg) translateZ(10px)`;
  });
  stage.addEventListener('pointerleave', () => { screen.style.transform = ''; });
}

function openLightbox(index) {
  if (!lightbox || !lightboxImage || !lightboxCaption || moduleImages.length === 0) return;
  currentIndex = (index + moduleImages.length) % moduleImages.length;
  const item = moduleImages[currentIndex];
  lightboxImage.src = item.dataset.src;
  lightboxImage.alt = item.dataset.alt;
  lightboxCaption.textContent = item.dataset.title;
  if (!lightbox.open) lightbox.showModal();
}

moduleImages.forEach((item, index) => item.closest('button')?.addEventListener('click', () => openLightbox(index)));
lightbox?.querySelector('[data-lightbox-close]')?.addEventListener('click', () => lightbox.close());
lightbox?.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => openLightbox(currentIndex - 1));
lightbox?.querySelector('[data-lightbox-next]')?.addEventListener('click', () => openLightbox(currentIndex + 1));
lightbox?.addEventListener('click', (event) => { if (event.target === lightbox) lightbox.close(); });
lightbox?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') openLightbox(currentIndex - 1);
  if (event.key === 'ArrowRight') openLightbox(currentIndex + 1);
});

showStage(0);
