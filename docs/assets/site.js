'use strict';

const galleryItems = [...document.querySelectorAll('[data-gallery-item]')];
const lightbox = document.querySelector('[data-lightbox]');
const lightboxImage = lightbox?.querySelector('img');
const lightboxCaption = document.getElementById('lightbox-caption');
let activeGalleryIndex = 0;

function showGalleryItem(index) {
  if (!lightbox || !lightboxImage || !lightboxCaption || galleryItems.length === 0) return;
  activeGalleryIndex = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[activeGalleryIndex];
  lightboxImage.src = item.dataset.image;
  lightboxImage.alt = item.dataset.caption;
  lightboxCaption.textContent = item.dataset.caption;
  if (!lightbox.open) lightbox.showModal();
}

galleryItems.forEach((item, index) => {
  item.addEventListener('click', () => showGalleryItem(index));
});

lightbox?.querySelector('[data-lightbox-close]')?.addEventListener('click', () => lightbox.close());
lightbox?.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => showGalleryItem(activeGalleryIndex - 1));
lightbox?.querySelector('[data-lightbox-next]')?.addEventListener('click', () => showGalleryItem(activeGalleryIndex + 1));
lightbox?.addEventListener('click', (event) => {
  if (event.target === lightbox) lightbox.close();
});
lightbox?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') showGalleryItem(activeGalleryIndex - 1);
  if (event.key === 'ArrowRight') showGalleryItem(activeGalleryIndex + 1);
});

const commands = `git clone https://github.com/xuange6610-oss/SyncWatch.git
cd SyncWatch
npm ci
npm start`;
const copyButton = document.querySelector('[data-copy-command]');
const copyStatus = document.getElementById('copy-status');

copyButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(commands);
    copyStatus.textContent = '命令已复制。';
  } catch (_) {
    copyStatus.textContent = '浏览器未允许自动复制，请手动选择上方命令。';
  }
});

for (const year of document.querySelectorAll('[data-current-year]')) {
  year.textContent = String(new Date().getFullYear());
}

const revealItems = [...document.querySelectorAll('[data-reveal]')];
if (revealItems.length > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove('is-pending');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const item of revealItems) revealObserver.observe(item);
}

const architectureConsole = document.querySelector('[data-architecture-console]');
const architectureSteps = [...document.querySelectorAll('[data-architecture-step]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let architectureTimer = 0;
let architectureIndex = 0;

function stopArchitectureAnimation() {
  if (architectureTimer) window.clearInterval(architectureTimer);
  architectureTimer = 0;
}

function showArchitectureStep(index) {
  architectureSteps.forEach((step, stepIndex) => step.classList.toggle('is-active', stepIndex === index));
}

function startArchitectureAnimation() {
  if (reduceMotion || architectureSteps.length === 0 || architectureTimer || document.hidden) return;
  showArchitectureStep(architectureIndex);
  architectureTimer = window.setInterval(() => {
    architectureIndex = (architectureIndex + 1) % architectureSteps.length;
    showArchitectureStep(architectureIndex);
  }, 1200);
}

if (architectureConsole && architectureSteps.length > 0) {
  if (reduceMotion || !('IntersectionObserver' in window)) {
    architectureSteps.forEach((step) => step.classList.add('is-active'));
  } else {
    const architectureObserver = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) startArchitectureAnimation();
      else stopArchitectureAnimation();
    }, { threshold: 0.18 });
    architectureObserver.observe(architectureConsole);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopArchitectureAnimation();
      else if (architectureConsole.getBoundingClientRect().top < window.innerHeight && architectureConsole.getBoundingClientRect().bottom > 0) startArchitectureAnimation();
    });
  }
}
