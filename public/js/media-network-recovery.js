'use strict';

(function attachMediaNetworkRecoveryPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.SyncWatchMediaNetworkRecovery = policy;
})(typeof globalThis === 'object' ? globalThis : this, function createMediaNetworkRecoveryPolicy() {
  const DELAYS_MS = Object.freeze([250, 500, 1000]);

  function nextAttempt(completedAttempts) {
    const index = Math.max(0, Math.floor(Number(completedAttempts) || 0));
    if (index >= DELAYS_MS.length) return null;
    return { attempt: index + 1, delayMs: DELAYS_MS[index] };
  }

  function isEligible({ errorCode, sourceType, source, pageHref }) {
    if (Number(errorCode) !== 2 || sourceType === 'remote') return false;
    try {
      const page = new URL(pageHref);
      const media = new URL(source, page);
      const firstSegment = media.pathname.split('/').filter(Boolean)[0] || '';
      return media.origin === page.origin && ['media', 'compatible-media'].includes(firstSegment);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({
    MAX_ATTEMPTS: DELAYS_MS.length,
    DELAYS_MS,
    nextAttempt,
    isEligible
  });
});
