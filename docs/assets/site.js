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

const commands = `git clone https://github.com/xuange6610/SyncWatch.git
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

/* The architecture panel is a real navigable instrument, not a decorative tilt. */
if (architectureConsole) {
  let architectureRotateX = -3;
  let architectureRotateY = 0;
  let architectureScale = 1;
  let architecturePointer = null;
  let architectureStartX = 0;
  let architectureStartY = 0;
  let architectureStartRotateX = 0;
  let architectureStartRotateY = 0;

  const renderArchitectureView = () => {
    architectureConsole.style.setProperty('--arch-rotate-x', `${architectureRotateX}deg`);
    architectureConsole.style.setProperty('--arch-rotate-y', `${architectureRotateY}deg`);
    architectureConsole.style.setProperty('--arch-scale', architectureScale.toFixed(2));
  };
  const resetArchitectureView = () => {
    architectureRotateX = -3;
    architectureRotateY = 0;
    architectureScale = 1;
    renderArchitectureView();
  };

  architectureConsole.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, a')) return;
    architecturePointer = event.pointerId;
    architectureStartX = event.clientX;
    architectureStartY = event.clientY;
    architectureStartRotateX = architectureRotateX;
    architectureStartRotateY = architectureRotateY;
    architectureConsole.classList.add('is-dragging');
    architectureConsole.setPointerCapture(event.pointerId);
  });
  architectureConsole.addEventListener('pointermove', (event) => {
    if (architecturePointer !== event.pointerId) return;
    architectureRotateY = architectureStartRotateY + (event.clientX - architectureStartX) * 0.28;
    architectureRotateX = Math.max(-22, Math.min(22, architectureStartRotateX - (event.clientY - architectureStartY) * 0.2));
    renderArchitectureView();
  });
  const releaseArchitecturePointer = (event) => {
    if (architecturePointer !== event.pointerId) return;
    architecturePointer = null;
    architectureConsole.classList.remove('is-dragging');
    architectureConsole.releasePointerCapture?.(event.pointerId);
  };
  architectureConsole.addEventListener('pointerup', releaseArchitecturePointer);
  architectureConsole.addEventListener('pointercancel', releaseArchitecturePointer);
  architectureConsole.addEventListener('wheel', (event) => {
    event.preventDefault();
    architectureScale = Math.max(.86, Math.min(1.16, architectureScale - event.deltaY * .0008));
    renderArchitectureView();
  }, { passive: false });
  architectureConsole.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') architectureRotateY -= 6;
    else if (event.key === 'ArrowRight') architectureRotateY += 6;
    else if (event.key === 'ArrowUp') architectureRotateX = Math.max(-22, architectureRotateX - 5);
    else if (event.key === 'ArrowDown') architectureRotateX = Math.min(22, architectureRotateX + 5);
    else if (event.key === '+' || event.key === '=') architectureScale = Math.min(1.16, architectureScale + .04);
    else if (event.key === '-' || event.key === '_') architectureScale = Math.max(.86, architectureScale - .04);
    else if (event.key === '0' || event.key === 'Home') { resetArchitectureView(); return; }
    else return;
    event.preventDefault();
    renderArchitectureView();
  });
  architectureConsole.querySelector('[data-architecture-reset]')?.addEventListener('click', resetArchitectureView);
  renderArchitectureView();
}

const contactDialog = document.querySelector('[data-contact-dialog]');
const contactDialogTitle = document.getElementById('contact-dialog-title');
const contactDialogImage = contactDialog?.querySelector('img');
const contactDialogHelp = contactDialog?.querySelector('[data-contact-help]');

function openContactDialog({ image, title, alt, help }) {
  if (!contactDialog || !contactDialogTitle || !contactDialogImage || !contactDialogHelp) return;
  contactDialogTitle.textContent = title;
  contactDialogImage.src = image;
  contactDialogImage.alt = alt;
  contactDialogHelp.textContent = help;
  if (!contactDialog.open) contactDialog.showModal();
}

document.querySelectorAll('[data-contact-image]').forEach((button) => button.addEventListener('click', () => openContactDialog({
  image: button.dataset.contactImage,
  title: button.dataset.contactTitle,
  alt: button.dataset.contactAlt,
  help: button.dataset.contactTitle.includes('QQ') ? '请使用 QQ 扫一扫添加好友。' : '请使用微信扫一扫添加好友。'
})));

document.querySelectorAll('[data-support-image]').forEach((button) => {
  const openSupport = () => openContactDialog({ image: button.dataset.supportImage, title: '支持 SyncWatch同步观影', alt: '微信支付收款码', help: '自愿支持项目开发，请在付款前核对收款方信息。' });
  button.addEventListener('dblclick', openSupport);
  button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSupport(); } });
});

contactDialog?.querySelector('[data-contact-close]')?.addEventListener('click', () => contactDialog.close());
contactDialog?.addEventListener('click', (event) => { if (event.target === contactDialog) contactDialog.close(); });
