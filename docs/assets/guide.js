'use strict';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupDiagnosticConsole() {
  const consoleElement = document.querySelector('[data-diagnostic-console]');
  if (!consoleElement) return;
  const steps = [...consoleElement.querySelectorAll('[data-diagnostic-step]')];
  const output = consoleElement.querySelector('[data-diagnostic-output]');
  const toggle = consoleElement.querySelector('[data-motion-toggle]');
  let active = 0;
  let timer = 0;
  let visible = true;
  let running = !reduceMotion;

  const render = () => {
    steps.forEach((step, index) => {
      step.classList.toggle('is-active', index === active);
      step.classList.toggle('is-done', index < active);
    });
    if (output) output.textContent = steps[active]?.dataset.output || '等待诊断结果';
  };
  const stop = () => { window.clearInterval(timer); timer = 0; };
  const start = () => {
    if (!running || !visible || document.hidden || timer || steps.length === 0) return;
    timer = window.setInterval(() => { active = (active + 1) % steps.length; render(); }, 1450);
  };
  render();
  if (reduceMotion) {
    steps.forEach((step) => step.classList.add('is-done'));
    if (toggle) { toggle.textContent = '已减少动画'; toggle.disabled = true; }
  } else {
    start();
    toggle?.addEventListener('click', () => {
      running = !running;
      toggle.textContent = running ? '暂停动画' : '继续动画';
      if (running) start(); else stop();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) start(); else stop();
      }, { threshold: .12 }).observe(consoleElement);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  }
}

function setupTriage() {
  const result = document.querySelector('[data-triage-result]');
  const buttons = [...document.querySelectorAll('[data-symptom]')];
  const issues = [...document.querySelectorAll('[data-issue]')];
  const search = document.querySelector('[data-issue-search]');
  if (result && buttons.length) {
    buttons.forEach((button) => button.addEventListener('click', () => {
      buttons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      result.innerHTML = `<h3>${button.dataset.title}</h3><p>${button.dataset.summary}</p><ol><li>${button.dataset.step1}</li><li>${button.dataset.step2}</li><li>${button.dataset.step3}</li></ol><a class="button primary small" href="#${button.dataset.target}">打开对应处理步骤</a>`;
    }));
    buttons[0].click();
  }
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('zh-CN');
    issues.forEach((issue) => { issue.hidden = Boolean(query && !issue.textContent.toLocaleLowerCase('zh-CN').includes(query)); });
  });
}

function setupCopyCommands() {
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const command = button.closest('.command')?.querySelector('code')?.textContent || '';
    try {
      await navigator.clipboard.writeText(command);
      button.textContent = '已复制';
    } catch (_) {
      button.textContent = '请手动复制';
    }
    window.setTimeout(() => { button.textContent = '复制'; }, 1600);
  }));
}

function setupControlMap() {
  const map = document.querySelector('[data-control-map]');
  if (!map) return;
  const nodes = [...map.querySelectorAll('.map-node')];
  const toggle = document.querySelector('[data-map-toggle]');
  let active = 0;
  let timer = 0;
  let running = !reduceMotion;
  let visible = true;
  const render = () => nodes.forEach((node, index) => node.classList.toggle('is-active', index === active));
  const stop = () => { window.clearInterval(timer); timer = 0; map.classList.remove('is-running'); };
  const start = () => {
    if (!running || !visible || document.hidden || timer) return;
    map.classList.add('is-running');
    timer = window.setInterval(() => { active = (active + 1) % nodes.length; render(); }, 1200);
  };
  render();
  if (reduceMotion) {
    if (toggle) { toggle.textContent = '已减少动画'; toggle.disabled = true; }
  } else {
    start();
    toggle?.addEventListener('click', () => {
      running = !running;
      toggle.textContent = running ? '暂停动画' : '继续动画';
      if (running) start(); else stop();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) start(); else stop();
      }, { threshold: .12 }).observe(map);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  }
}

function setupChapterNavigation() {
  const links = [...document.querySelectorAll('.guide-toc a[href^="#"]')];
  const chapters = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if (!links.length || !chapters.length || !('IntersectionObserver' in window)) return;
  new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-15% 0px -70% 0px', threshold: [0, .2, .6] }).observe(chapters[0]);
  chapters.slice(1).forEach((chapter) => {
    new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.isIntersecting);
      if (!entry) return;
      links.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
    }, { rootMargin: '-15% 0px -70% 0px', threshold: .1 }).observe(chapter);
  });
}

function setupTilt() {
  if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll('[data-tilt]').forEach((surface) => {
    surface.addEventListener('pointermove', (event) => {
      const rect = surface.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      surface.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
      surface.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`);
      surface.classList.add('is-tilting');
    });
    surface.addEventListener('pointerleave', () => {
      surface.style.setProperty('--tilt-x', '0deg');
      surface.style.setProperty('--tilt-y', '0deg');
      surface.classList.remove('is-tilting');
    });
  });
}

function setupArchitectureStage() {
  const stage = document.querySelector('[data-architecture-stage]');
  if (!stage) return;
  const nodes = [...stage.querySelectorAll('.architecture-node')];
  const toggle = document.querySelector('[data-architecture-toggle]');
  let active = 0;
  let timer = 0;
  let running = !reduceMotion;
  let visible = true;
  const render = () => nodes.forEach((node, index) => node.classList.toggle('is-active', index === active));
  const stop = () => { window.clearInterval(timer); timer = 0; stage.classList.remove('is-running'); };
  const start = () => {
    if (!running || !visible || document.hidden || timer) return;
    stage.classList.add('is-running');
    timer = window.setInterval(() => { active = (active + 1) % nodes.length; render(); }, 860);
  };
  render();
  if (reduceMotion) {
    if (toggle) { toggle.textContent = '已减少动画'; toggle.disabled = true; }
  } else {
    start();
    toggle?.addEventListener('click', () => {
      running = !running;
      toggle.textContent = running ? '暂停动画' : '继续动画';
      if (running) start(); else stop();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) start(); else stop();
      }, { threshold: .12 }).observe(stage);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  }
}

setupDiagnosticConsole();
setupTriage();
setupCopyCommands();
setupControlMap();
setupChapterNavigation();
setupTilt();
setupArchitectureStage();
