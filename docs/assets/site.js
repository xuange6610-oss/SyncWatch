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
