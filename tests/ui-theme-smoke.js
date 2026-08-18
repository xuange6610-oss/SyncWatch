'use strict';

require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { startSyncWatchServer } = require('../server');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-theme-smoke-'));
const reviewDir = path.join(os.tmpdir(), 'syncwatch-ui-review');
const logFile = path.join(reviewDir, 'run.log');
fs.mkdirSync(reviewDir, { recursive: true });
fs.writeFileSync(logFile, `boot ${process.versions.electron || 'node'} ${typeof app?.whenReady}\n`);
app.setPath('userData', path.join(dataDir, 'electron-profile'));
let server;
let window;
let closing = false;

async function waitFor(expression, description, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await window.webContents.executeJavaScript(expression, true)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待“${description}”超时`);
}

async function capture(name) {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const image = await window.webContents.capturePage();
  const target = path.join(reviewDir, `${name}.png`);
  fs.writeFileSync(target, image.toPNG());
  return target;
}

async function run() {
  fs.appendFileSync(logFile, 'starting\n');
  server = await startSyncWatchServer({
    host: '127.0.0.1', port: 0, dataDir, publicDir: path.resolve(__dirname, '..', 'public'),
    ffprobePath: '', ffmpegPath: '', hostControlToken: 'theme-host'
  });
  window = new BrowserWindow({ width: 1320, height: 840, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await window.loadURL(`http://127.0.0.1:${server.port}/#host=theme-host`);
  fs.appendFileSync(logFile, 'loaded\n');
  await waitFor(`document.getElementById('connectionBadge').classList.contains('online')`, '服务器连接');
  await window.webContents.executeJavaScript(`
    elements.showRegisterBtn.click();
    elements.regUsername.value = 'ThemeOwner';
    elements.regPassword.value = '123456';
    elements.regPasswordConfirm.value = '123456';
    elements.registerForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `, true);
  await waitFor(`elements.loginStatus.textContent.includes('注册成功')`, '账号注册');
  await window.webContents.executeJavaScript(`
    elements.username.value = 'ThemeOwner';
    elements.password.value = '123456';
    elements.createRoomBtn.click();
    elements.newRoomName.value = '主题验收房间';
    elements.newRoomId.value = 'THEMEROOM';
    elements.newRoomMaxUsers.value = '8';
    elements.createRoomForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  `, true);
  await waitFor(`
    !elements.agreementModal.classList.contains('is-hidden') ||
    (state.authenticated && !elements.mainPage.classList.contains('is-hidden'))
  `, '首次协议或主界面');
  if (!await window.webContents.executeJavaScript(`elements.agreementModal.classList.contains('is-hidden')`, true)) {
    await window.webContents.executeJavaScript(`elements.agreementCheck.click(); elements.acceptAgreementBtn.click();`, true);
  }
  await waitFor(`state.authenticated && !elements.mainPage.classList.contains('is-hidden')`, '进入主界面');

  const originalState = await window.webContents.executeJavaScript(`({ theme: document.documentElement.dataset.uiTheme || '', count: UI_THEMES.length })`, true);
  assert.equal(originalState.theme, 'silver-screen');
  assert.equal(originalState.count, 21);
  const registrationNoticeState = await window.webContents.executeJavaScript(`(() => {
    state.persistentRequests.clear();
    elements.toastRegion.innerHTML = '';
    showAccountNotification({ kind: 'account-registration', username: 'offline-one', registeredAt: '2026-08-11T01:00:00.000Z' });
    showAccountNotification({ kind: 'account-registration', username: 'offline-two', registeredAt: '2026-08-11T01:00:00.000Z' });
    const result = {
      persistentCount: state.persistentRequests.size,
      toastCount: elements.toastRegion.querySelectorAll('.toast').length,
      closableCount: elements.toastRegion.querySelectorAll('.toast .toast-close').length
    };
    state.persistentRequests.clear();
    renderPersistentRequests();
    elements.toastRegion.innerHTML = '';
    return result;
  })()`, true);
  assert.deepEqual(registrationNoticeState, { persistentCount: 0, toastCount: 2, closableCount: 2 }, '普通注册通知应逐条显示为可关闭的非持久提示');
  const desktopThemeModal = await window.webContents.executeJavaScript(`(() => {
    elements.themeModal.classList.remove('is-hidden');
    renderThemeSyncTargets();
    const card = elements.themeModal.querySelector('.theme-modal-card');
    const grid = elements.themeGrid;
    const cardRect = card.getBoundingClientRect();
    const resetRect = elements.resetThemeBtn.getBoundingClientRect();
    return {
      cardClientHeight: card.clientHeight,
      cardScrollHeight: card.scrollHeight,
      gridHeight: grid.clientHeight,
      resetVisible: resetRect.width > 0 && resetRect.right <= cardRect.right + 1 && resetRect.bottom <= cardRect.bottom + 1,
      syncTargetsVisible: !elements.themeSyncTargets.classList.contains('is-hidden')
    };
  })()`, true);
  assert.equal(desktopThemeModal.syncTargetsVisible, true);
  assert.equal(desktopThemeModal.resetVisible, true);
  assert.ok(desktopThemeModal.gridHeight > 100, `主题列表高度异常：${JSON.stringify(desktopThemeModal)}`);
  assert.ok(desktopThemeModal.cardScrollHeight <= desktopThemeModal.cardClientHeight + 2, `主题弹窗溢出：${JSON.stringify(desktopThemeModal)}`);
  await window.webContents.executeJavaScript(`elements.themeModal.classList.add('is-hidden')`, true);
  fs.appendFileSync(logFile, 'authenticated\n');
  await window.webContents.executeJavaScript(`if (typeof activeAppDialog !== 'undefined' && activeAppDialog) settleAppDialog(false);`, true);
  const images = [await capture('silver-screen-default-desktop')];
  for (const theme of ['cinema-deck', 'living-room', 'conversation-first', 'arcade-room']) {
    await window.webContents.executeJavaScript(`selectUiTheme(${JSON.stringify(theme)}); elements.themeModal.classList.add('is-hidden'); if (typeof activeAppDialog !== 'undefined' && activeAppDialog) settleAppDialog(false); elements.toastRegion.innerHTML = '';`, true);
    images.push(await capture(`${theme}-desktop`));
  }

  window.setContentSize(390, 844);
  await new Promise((resolve) => setTimeout(resolve, 250));
  await window.webContents.executeJavaScript(`selectUiTheme('modular-windows'); elements.themeModal.classList.add('is-hidden'); if (typeof activeAppDialog !== 'undefined' && activeAppDialog) settleAppDialog(false); elements.toastRegion.innerHTML = '';`, true);
  const mobileMetrics = await window.webContents.executeJavaScript(`(() => {
    elements.themeModal.classList.remove('is-hidden');
    renderThemeSyncTargets();
    const card = elements.themeModal.querySelector('.theme-modal-card');
    const modalMetrics = { cardWidth: card.getBoundingClientRect().width, gridHeight: elements.themeGrid.clientHeight, overflow: card.scrollHeight - card.clientHeight };
    elements.themeModal.classList.add('is-hidden');
    return { bodyWidth: document.body.scrollWidth, viewport: innerWidth, theme: document.documentElement.dataset.uiTheme, quality: elements.playbackQualitySelect.value, syncToggle: elements.syncNoticeToggle.checked, themeModal: modalMetrics };
  })()`, true);
  assert.ok(mobileMetrics.bodyWidth <= mobileMetrics.viewport + 2, `手机页面横向溢出：${JSON.stringify(mobileMetrics)}`);
  assert.equal(mobileMetrics.theme, 'modular-windows');
  assert.ok(mobileMetrics.themeModal.cardWidth <= mobileMetrics.viewport + 1, `手机主题弹窗超宽：${JSON.stringify(mobileMetrics.themeModal)}`);
  assert.ok(mobileMetrics.themeModal.gridHeight > 70, `手机主题列表不可见：${JSON.stringify(mobileMetrics.themeModal)}`);
  assert.ok(mobileMetrics.themeModal.overflow <= 2, `手机主题弹窗纵向溢出：${JSON.stringify(mobileMetrics.themeModal)}`);
  images.push(await capture('modular-windows-mobile'));
  fs.appendFileSync(logFile, `${JSON.stringify({ success: true, images, mobileMetrics })}\n`);
  console.log(JSON.stringify({ success: true, images, mobileMetrics }));
}

async function closeSmoke() {
  if (closing) return;
  closing = true;
  const active = server; server = null;
  try { await active?.close(); } catch (_) {}
  try { window?.destroy(); } catch (_) {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
  app.quit();
}

app.whenReady().then(run).then(closeSmoke).catch(async (error) => {
  try { fs.mkdirSync(reviewDir, { recursive: true }); fs.appendFileSync(logFile, `${error.stack || error.message}\n`); } catch (_) {}
  console.error(error.stack || error.message);
  process.exitCode = 1;
  await closeSmoke();
});

app.on('before-quit', async (event) => {
  if (closing || !server) return;
  event.preventDefault();
  await closeSmoke();
});
