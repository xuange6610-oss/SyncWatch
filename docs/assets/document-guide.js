'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.querySelector('[data-guide-stage]');
const toggle = document.querySelector('[data-guide-toggle]');
const nodes = [...(stage?.querySelectorAll('.doc-node') || [])];

function setupStage() {
  if (!stage || nodes.length === 0) return;
  let active = 0;
  let timer = 0;
  let visible = true;
  let running = !reduceMotion;
  let rotateX = -12;
  let rotateY = 18;
  let scale = 1;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const reset = stage.querySelector('[data-guide-reset]');
  const renderView = () => {
    stage.style.setProperty('--doc-rotate-x', `${rotateX}deg`);
    stage.style.setProperty('--doc-rotate-y', `${rotateY}deg`);
    stage.style.setProperty('--doc-scale', scale.toFixed(2));
  };
  const resetView = () => { rotateX = -12; rotateY = 18; scale = 1; renderView(); };
  const render = () => nodes.forEach((node, index) => node.classList.toggle('is-active', index === active));
  const stop = () => { window.clearInterval(timer); timer = 0; stage.classList.remove('is-running'); };
  const start = () => {
    if (!running || !visible || document.hidden || timer) return;
    stage.classList.add('is-running');
    timer = window.setInterval(() => { active = (active + 1) % nodes.length; render(); }, 920);
  };
  render();
  renderView();
  reset?.addEventListener('click', resetView);
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.classList.add('is-dragging');
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    rotateY += (event.clientX - lastX) * .45;
    rotateX = Math.max(-80, Math.min(80, rotateX - (event.clientY - lastY) * .35));
    lastX = event.clientX;
    lastY = event.clientY;
    renderView();
  });
  const stopDrag = (event) => {
    dragging = false;
    stage.classList.remove('is-dragging');
    if (event?.pointerId != null) stage.releasePointerCapture?.(event.pointerId);
  };
  stage.addEventListener('pointerup', stopDrag);
  stage.addEventListener('pointercancel', stopDrag);
  stage.addEventListener('pointerleave', (event) => { if (dragging && event.buttons === 0) stopDrag(event); });
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    scale = Math.max(.78, Math.min(1.18, scale - event.deltaY * .001));
    renderView();
  }, { passive: false });
  stage.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 12 : 5;
    if (event.key === 'ArrowLeft') rotateY -= step;
    else if (event.key === 'ArrowRight') rotateY += step;
    else if (event.key === 'ArrowUp') rotateX = Math.max(-80, rotateX - step);
    else if (event.key === 'ArrowDown') rotateX = Math.min(80, rotateX + step);
    else if (event.key === '0') return resetView();
    else return;
    event.preventDefault();
    renderView();
  });
  if (reduceMotion) { if (toggle) { toggle.textContent = '已减少动画'; toggle.disabled = true; } return; }
  start();
  toggle?.addEventListener('click', () => { running = !running; toggle.textContent = running ? '暂停动画' : '继续动画'; if (running) start(); else stop(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); if (visible) start(); else stop(); }, { threshold: .12 }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
}

function setupProgress() {
  const root = document.documentElement;
  const update = () => { const max = document.documentElement.scrollHeight - window.innerHeight; root.style.setProperty('--doc-progress', `${max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0}%`); };
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function setupToc() {
  const links = [...document.querySelectorAll('.doc-toc a[href^="#"]')];
  const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (!links.length || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) links.forEach((link) => link.classList.toggle('is-active', link.hash === `#${entry.target.id}`)); }), { rootMargin: '-18% 0px -68% 0px', threshold: .1 });
  sections.forEach((section) => observer.observe(section));
}

function setupTilt() {
  if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('[data-doc-tilt]').forEach((surface) => {
    surface.addEventListener('pointermove', (event) => { const rect = surface.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width - .5; const y = (event.clientY - rect.top) / rect.height - .5; surface.style.setProperty('--tilt-x', `${(-y * 4).toFixed(2)}deg`); surface.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`); });
    surface.addEventListener('pointerleave', () => { surface.style.setProperty('--tilt-x', '0deg'); surface.style.setProperty('--tilt-y', '0deg'); });
  });
}

setupStage();
setupProgress();
setupToc();
setupTilt();
