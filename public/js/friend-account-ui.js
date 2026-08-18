'use strict';

(function exposeFriendAccountUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SyncWatchFriendAccountUi = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  function messagePreview(message = {}) {
    if (message.type === 'image') return message.text ? `[图片] ${message.text}` : '[图片消息]';
    return String(message.text || '发来一条好友消息').trim().slice(0, 160);
  }

  function syncLayerVisibility(layer) {
    layer?.classList.toggle('is-hidden', !layer.querySelector('[data-friend-video-notice]'));
  }

  function dismissVideoNotice(layer, username) {
    if (!layer || !username) return;
    for (const item of layer.querySelectorAll('[data-friend-video-notice]')) {
      if (item.dataset.friendVideoNotice === username) item.remove();
    }
    syncLayerVisibility(layer);
  }

  function showVideoNotice(layer, message = {}, options = {}) {
    const username = String(message.from || message.username || '').trim();
    if (!layer || !username) return null;
    let item = [...layer.querySelectorAll('[data-friend-video-notice]')]
      .find((entry) => entry.dataset.friendVideoNotice === username);
    if (!item) {
      item = document.createElement('article');
      item.className = 'friend-video-notice';
      item.dataset.friendVideoNotice = username;
      item.innerHTML = '<button class="friend-video-notice-close" type="button" aria-label="关闭此好友消息">×</button><div><strong></strong><p></p><small></small></div><button class="friend-video-notice-open" type="button">打开对话</button>';
      item.querySelector('.friend-video-notice-close').addEventListener('click', () => {
        dismissVideoNotice(layer, username);
        options.onClose?.(username);
      });
      item.querySelector('.friend-video-notice-open').addEventListener('click', () => {
        item._syncWatchOpen?.();
      });
      layer.prepend(item);
    }
    const previousCount = Number(item.dataset.messageCount) || 0;
    const count = previousCount + 1;
    item.dataset.messageCount = String(count);
    item._syncWatchOpen = () => {
      dismissVideoNotice(layer, username);
      options.onOpen?.(username);
    };
    const displayName = String(message.fromName || message.displayName || username).trim();
    item.querySelector('strong').textContent = `${displayName} 发来好友消息${count > 1 ? ` (${count})` : ''}`;
    item.querySelector('p').textContent = messagePreview(message);
    item.querySelector('small').textContent = '消息会保留在好友聊天记录中';
    item.remove();
    layer.prepend(item);
    while (layer.querySelectorAll('[data-friend-video-notice]').length > 5) layer.lastElementChild?.remove();
    layer.classList.remove('is-hidden');
    return item;
  }

  return { dismissVideoNotice, messagePreview, showVideoNotice };
});
