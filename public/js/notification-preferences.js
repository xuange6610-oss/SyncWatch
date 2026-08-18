'use strict';

(() => {
  const STORAGE_KEY = 'syncwatchNoticeSuppressionsV1';
  const SESSION_KEY = 'syncwatchSessionNoticeSuppressionsV1';
  const MARQUEE_KEY = 'room-marquee';
  let activeTarget = null;

  function readMap(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function writeMap(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function cleanExpired() {
    const entries = readMap(localStorage, STORAGE_KEY); const now = Date.now(); let changed = false;
    for (const [key, entry] of Object.entries(entries)) {
      if (Number(entry?.until) > 0 && Number(entry.until) <= now) { delete entries[key]; changed = true; }
    }
    if (changed) writeMap(localStorage, STORAGE_KEY, entries);
    return entries;
  }

  function isSuppressed(key) {
    if (readMap(sessionStorage, SESSION_KEY)[key]) return true;
    const entry = cleanExpired()[key];
    return Boolean(entry && (entry.until === 'never' || Number(entry.until) > Date.now()));
  }

  function normalizeMessage(message) {
    return String(message || '通知')
      .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/g, '#')
      .replace(/\b\d+(?:\.\d+)?\b/g, '#').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index); result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function toastKey(item) {
    const variant = String(item.dataset.variant || '').split(':')[0];
    return `toast-${hash(`${variant}|${normalizeMessage(item.dataset.message || item.textContent)}`)}`;
  }

  function ensureDialog() {
    let dialog = document.getElementById('noticeSnoozeModal');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'noticeSnoozeModal'; dialog.className = 'modal notice-snooze-modal is-hidden';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'noticeSnoozeTitle');
    dialog.innerHTML = `<div class="modal-card notice-snooze-card">
      <button class="modal-close" data-notice-snooze-close type="button" aria-label="关闭提醒设置">×</button>
      <p class="eyebrow">提醒偏好</p><h2 id="noticeSnoozeTitle">暂停此类提醒</h2><p id="noticeSnoozeDescription" class="muted"></p>
      <div class="notice-snooze-presets"><button type="button" data-notice-snooze="once">仅本次</button><button type="button" data-notice-snooze="600000">10 分钟</button><button type="button" data-notice-snooze="3600000">1 小时</button><button type="button" data-notice-snooze="86400000">1 天</button><button type="button" data-notice-snooze="604800000">7 天</button><button type="button" data-notice-snooze="never">永久</button></div>
      <div class="notice-snooze-custom"><label>自定义时长<input id="noticeSnoozeCustomValue" type="number" min="1" max="9999" value="30" inputmode="numeric"></label><div class="segmented-control" role="radiogroup" aria-label="自定义时长单位"><label><input type="radio" name="noticeSnoozeUnit" value="60000" checked><span>分钟</span></label><label><input type="radio" name="noticeSnoozeUnit" value="3600000"><span>小时</span></label><label><input type="radio" name="noticeSnoozeUnit" value="86400000"><span>天</span></label></div></div>
      <p id="noticeSnoozeError" class="app-dialog-error is-hidden" role="alert"></p><div class="app-dialog-actions"><button data-notice-snooze-close class="secondary-button" type="button">取消</button><button id="applyCustomNoticeSnoozeBtn" class="primary-button" type="button">应用自定义时长</button></div>
    </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', handleDialogClick);
    dialog.querySelector('#applyCustomNoticeSnoozeBtn')?.addEventListener('click', applyCustomDuration);
    return dialog;
  }

  function openDialog(target) {
    activeTarget = target; const dialog = ensureDialog();
    dialog.querySelector('#noticeSnoozeDescription').textContent = `“${String(target.label || '此类通知').slice(0, 120)}”`;
    dialog.querySelector('#noticeSnoozeError')?.classList.add('is-hidden'); dialog.classList.remove('is-hidden');
    dialog.querySelector('#noticeSnoozeCustomValue')?.focus();
  }

  function closeDialog() { document.getElementById('noticeSnoozeModal')?.classList.add('is-hidden'); activeTarget = null; }

  function saveDuration(value) {
    if (!activeTarget?.key) return;
    if (value === 'once') {
      const entries = readMap(sessionStorage, SESSION_KEY); entries[activeTarget.key] = { label: activeTarget.label || '通知' };
      writeMap(sessionStorage, SESSION_KEY, entries);
    } else {
      const entries = cleanExpired();
      entries[activeTarget.key] = { label: activeTarget.label || '通知', until: value === 'never' ? 'never' : Date.now() + Number(value) };
      writeMap(localStorage, STORAGE_KEY, entries);
    }
    const apply = activeTarget.apply; closeDialog(); apply?.(); renderSettings(); applyMarqueePreference();
  }

  function handleDialogClick(event) {
    if (event.target.closest('[data-notice-snooze-close]')) return closeDialog();
    const button = event.target.closest('[data-notice-snooze]'); if (button) saveDuration(button.dataset.noticeSnooze);
  }

  function applyCustomDuration() {
    const dialog = ensureDialog(); const error = dialog.querySelector('#noticeSnoozeError');
    const amount = Number(dialog.querySelector('#noticeSnoozeCustomValue')?.value);
    const unit = Number(dialog.querySelector('input[name="noticeSnoozeUnit"]:checked')?.value);
    if (!Number.isInteger(amount) || amount < 1 || !Number.isFinite(unit)) {
      error.textContent = '请输入大于 0 的整数时长'; error.classList.remove('is-hidden'); return;
    }
    saveDuration(Math.min(amount * unit, 3650 * 86400000));
  }

  function enhanceToast(item) {
    if (!(item instanceof HTMLElement) || !item.classList.contains('toast') || item.dataset.snoozeEnhanced === '1') return;
    const key = toastKey(item); if (isSuppressed(key)) { item.remove(); return; }
    item.dataset.snoozeEnhanced = '1'; item.classList.add('has-snooze');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'toast-snooze'; button.textContent = '⏱';
    button.title = '设置多久不再提示此类通知'; button.setAttribute('aria-label', '设置多久不再提示此类通知');
    button.addEventListener('click', () => openDialog({ key, label: item.dataset.message || item.textContent, apply: () => item.remove() }));
    item.insertBefore(button, item.querySelector('.toast-close'));
  }

  function ensureMarqueeClose(marquee) {
    if (!(marquee instanceof HTMLElement) || marquee.querySelector('.marquee-snooze-button')) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'marquee-snooze-button'; button.textContent = '×';
    button.title = '关闭或暂停滚动公告'; button.setAttribute('aria-label', '关闭或暂停滚动公告');
    button.addEventListener('click', () => openDialog({ key: MARQUEE_KEY, label: '实时公告滚动词条', apply: applyMarqueePreference }));
    marquee.appendChild(button);
  }

  function applyMarqueePreference() {
    for (const marquee of document.querySelectorAll('#roomMarquee, #loginMarquee')) {
      ensureMarqueeClose(marquee); marquee.classList.toggle('notice-preference-hidden', isSuppressed(MARQUEE_KEY));
    }
  }

  function escapeText(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function formatUntil(until) {
    if (until === 'never') return '永久暂停';
    const date = new Date(Number(until)); return Number.isNaN(date.getTime()) ? '已暂停' : `暂停至 ${date.toLocaleString('zh-CN')}`;
  }

  function renderSettings() {
    const host = document.getElementById('accountContent');
    if (!host?.querySelector('[data-profile-action="restore-all-prompts"]')) return;
    let card = document.getElementById('noticeSuppressionSettings');
    if (!card) { card = document.createElement('div'); card.id = 'noticeSuppressionSettings'; card.className = 'settings-card notice-suppression-settings'; host.appendChild(card); }
    const entries = Object.entries(cleanExpired());
    const signature = JSON.stringify(entries);
    if (card.dataset.signature === signature) return;
    card.dataset.signature = signature;
    card.innerHTML = `<h3>通知暂停管理</h3><p>恢复右下角提醒、通报或滚动公告后，它们会从下一次事件开始重新显示。</p><div class="notice-suppression-list">${entries.length ? entries.map(([key, entry]) => `<div><span><strong>${escapeText(entry.label || '通知')}</strong><small>${escapeText(formatUntil(entry.until))}</small></span><button type="button" data-restore-notice-key="${escapeText(key)}">恢复</button></div>`).join('') : '<p class="muted">当前没有被暂停的通知。</p>'}</div>${entries.length ? '<button class="secondary-button" type="button" data-restore-all-notices>恢复全部通知</button>' : ''}`;
  }

  function handleRestoreClick(event) {
    const one = event.target.closest('[data-restore-notice-key]');
    if (one) {
      const entries = cleanExpired(); delete entries[one.dataset.restoreNoticeKey]; writeMap(localStorage, STORAGE_KEY, entries);
      renderSettings(); applyMarqueePreference(); return;
    }
    if (event.target.closest('[data-restore-all-notices], [data-profile-action="restore-all-prompts"]')) {
      try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
      setTimeout(() => { renderSettings(); applyMarqueePreference(); }, 0);
    }
  }

  function initialize() {
    ensureDialog(); applyMarqueePreference(); document.querySelectorAll('.toast').forEach(enhanceToast);
    document.addEventListener('click', handleRestoreClick);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDialog(); });
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains('toast')) enhanceToast(node);
          node.querySelectorAll?.('.toast').forEach(enhanceToast);
        }
      }
      applyMarqueePreference(); renderSettings();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
