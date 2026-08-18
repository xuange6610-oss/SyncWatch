'use strict';

(() => {
  const themes = new Set([
    'original', 'cinema-deck', 'command-orbit', 'living-room', 'screening-journal',
    'director-console', 'timeline-room', 'poster-library', 'pure-screening',
    'conversation-first', 'spatial-room', 'browser-workspace', 'ten-foot-tv',
    'fluid-desktop', 'mono-screening', 'friends-party', 'arcade-room', 'audio-stage',
    'city-watch', 'modular-windows', 'silver-screen'
  ]);
  let theme = 'silver-screen';
  try {
    const savedTheme = localStorage.getItem('syncwatchUiTheme');
    if (savedTheme && themes.has(savedTheme)) theme = savedTheme;
    const savedFont = localStorage.getItem('syncwatchUiFont');
    if (savedFont) document.documentElement.dataset.uiFont = savedFont;
  } catch (_) {}
  if (theme !== 'original') document.documentElement.dataset.uiTheme = theme;
})();
