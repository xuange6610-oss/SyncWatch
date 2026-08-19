'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const WebSocket = require('ws');
const { startSyncWatchServer } = require('../server');

const root = path.resolve(__dirname, '..');
const chromeCandidates = [
  process.env.SYNCWATCH_CHROME_PATH,
  path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitFor(fn, label, timeout = 18000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return; } catch (_) {}
    await delay(100);
  }
  throw new Error(`等待“${label}”超时`);
}

function ack(socket, event, payload = {}) {
  return new Promise((resolve) => socket.timeout(15000).emit(event, payload, (error, result) => resolve(error ? { success: false, error: error.message } : result)));
}

class Cdp {
  constructor(url) { this.id = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
  async open() {
    await new Promise((resolve, reject) => { this.socket.once('open', resolve); this.socket.once('error', reject); });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result || {});
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  close() { try { this.socket.close(); } catch (_) {} }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || '页面脚本执行失败');
  return result.result?.value;
}

async function capture(cdp, target) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
}

async function stopProcess(child) {
  if (!child?.pid) return;
  await new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    killer.once('exit', resolve); killer.once('error', resolve);
  });
}

function removeTempDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error) {
    console.warn(`临时目录稍后由系统清理: ${directory} (${error.code || error.message})`);
  }
}

const plans = {
  room: [
    ['room-settings', `document.querySelector('[data-management-panel="room"]')?.scrollIntoView({block:'start'})`],
    ['room-storage', `elements.roomStorageCard?.scrollIntoView({block:'start'})`],
    ['upload-limits', `elements.uploadLimitMb.value='2048'; elements.uploadTimeLimit.value='7200'; elements.uploadLimitMb.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['upload-limit-tutorial', `elements.uploadLimitTutorialBtn?.click()`],
    ['room-password-review', `elements.managementHubModal.classList.remove('is-hidden'); showManagementSection('room'); elements.accessPassword.closest('.settings-card')?.scrollIntoView({block:'start'})`]
  ],
  rooms: [
    ['all-rooms-dashboard', `elements.globalRoomDashboardCard?.scrollIntoView({block:'start'})`],
    ['room-search', `elements.globalRoomSearch.value='同步观影'; elements.globalRoomSearch.dispatchEvent(new Event('input',{bubbles:true})); elements.globalRoomSearch.scrollIntoView({block:'center'})`],
    ['room-batch-controls', `elements.selectAllRooms?.click(); elements.globalRoomStorageLimitMb?.scrollIntoView({block:'center'})`],
    ['room-result-list', `elements.globalRoomList?.scrollIntoView({block:'center'})`],
    ['room-dashboard-mobile', `elements.globalRoomDashboardCard?.scrollIntoView({block:'start'})`]
  ],
  permissions: [
    ['permission-context', `document.getElementById('permissionContextCard')?.scrollIntoView({block:'start'})`],
    ['member-permissions', `elements.permissionUser?.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['permission-switches', `elements.permControl.checked=true; elements.permUpload.checked=true; elements.permSendNotice.checked=true; elements.permControl.scrollIntoView({block:'center'})`],
    ['permission-groups', `elements.permissionGroupList?.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['new-permission-group', `elements.newPermissionGroupBtn?.click(); elements.permissionGroupEditor?.scrollIntoView({block:'start'})`]
  ],
  chat: [
    ['chat-command-center', `elements.managementChatManageBtn?.scrollIntoView({block:'center'})`],
    ['chat-record-manager', `elements.managementChatManageBtn?.click()`],
    ['chat-filters', `elements.managementChatManageBtn?.click(); elements.chatManageType.value='danmaku'; elements.chatManageQuery.value='演示'; elements.chatManageQuery.dispatchEvent(new Event('input',{bubbles:true})); elements.chatManageQuery.scrollIntoView({block:'center'})`],
    ['operation-history', `elements.managementOperationHistoryBtn?.click()`],
    ['operation-filters', `elements.managementOperationHistoryBtn?.click(); elements.operationHistoryQuery.value='房间'; elements.operationHistoryScope.value='room'; elements.operationHistoryQuery.dispatchEvent(new Event('input',{bubbles:true})); elements.operationHistoryScope.dispatchEvent(new Event('change',{bubbles:true})); elements.operationHistoryQuery.scrollIntoView({block:'center'})`]
  ],
  accounts: [
    ['account-management', `elements.accountAdminList?.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['account-search-and-view', `elements.accountAdminSearch.value='xuan'; elements.accountViewMode.value='table'; elements.accountAdminSearch.dispatchEvent(new Event('input',{bubbles:true})); elements.accountAdminSearch.scrollIntoView({block:'center'})`],
    ['account-overview', `elements.openAccountOverviewBtn?.click()`],
    ['account-audit-log', `elements.accountAuditLogBtn?.click()`],
    ['account-policies', `elements.accountNumberPolicyCard?.scrollIntoView({block:'start'})`]
  ],
  applications: [
    ['application-center', `elements.applicationRefreshCard?.scrollIntoView({block:'start'})`],
    ['refresh-applications', `elements.refreshAllApplicationsBtn?.click(); elements.applicationRefreshCard?.scrollIntoView({block:'start'})`],
    ['pending-uploads', `elements.pendingList?.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['registration-applications', `elements.registrationRequestList?.closest('.settings-card')?.scrollIntoView({block:'start'})`],
    ['room-quota-applications', `elements.roomQuotaRequestList?.closest('.settings-card')?.scrollIntoView({block:'start'})`]
  ],
  tiers: [
    ['account-tier-list', `elements.accountTierCard?.scrollIntoView({block:'start'})`],
    ['new-account-tier', `elements.newAccountTierBtn?.click(); elements.accountTierId.value='family_plus'; elements.accountTierName.value='家庭协作'; elements.accountTierEditor?.scrollIntoView({block:'start'})`],
    ['tier-quotas', `elements.accountTierUploadGb.value='50'; elements.accountTierRoomQuota.value='5'; elements.accountTierUploadGb.scrollIntoView({block:'center'})`],
    ['experience-policy', `elements.watchLevelSettingsCard?.scrollIntoView({block:'start'})`],
    ['watch-level-list', `elements.watchLevelSettingsList?.scrollIntoView({block:'center'})`]
  ],
  notices: [
    ['notice-preferences', `document.querySelector('[data-management-panel="notices"]')?.scrollIntoView({block:'start'})`],
    ['branding-and-marquee', `elements.brandingSettingsCard?.scrollIntoView({block:'start'})`],
    ['login-media', `elements.loginMusicSettingsCard?.scrollIntoView({block:'start'})`],
    ['login-cube-3d', `elements.loginCubeSettingsCard?.scrollIntoView({block:'start'})`],
    ['entry-and-legal-notices', `elements.roomEntryNoticeSettingsCard?.scrollIntoView({block:'start'})`]
  ],
  mail: [
    ['smtp-settings', `elements.mailSettingsCard?.scrollIntoView({block:'start'})`],
    ['mail-tutorial', `elements.mailTutorialBtn?.click(); elements.mailTutorialPanel?.scrollIntoView({block:'start'})`],
    ['mail-template-editor', `elements.mailTemplateHtml?.scrollIntoView({block:'center'})`],
    ['mail-preview-and-test', `elements.mailTestRecipient.value='demo@example.com'; elements.mailTestRecipient?.closest('.settings-card')?.scrollIntoView({block:'center'})`],
    ['verification-codes', `elements.verificationCodeList?.scrollIntoView({block:'start'})`]
  ],
  logs: [
    ['server-log-center', `elements.serverLogsCard?.scrollIntoView({block:'start'})`],
    ['log-category-filter', `elements.serverLogCategory.value='server'; elements.serverLogCategory.dispatchEvent(new Event('change',{bubbles:true})); elements.serverLogCategory.scrollIntoView({block:'center'})`],
    ['log-level-filter', `elements.serverLogLevel.value='warn'; elements.serverLogLevel.dispatchEvent(new Event('change',{bubbles:true})); elements.serverLogLevel.scrollIntoView({block:'center'})`],
    ['log-search', `elements.serverLogQuery.value='启动'; elements.serverLogQuery.dispatchEvent(new Event('input',{bubbles:true})); elements.serverLogQuery.scrollIntoView({block:'center'})`],
    ['log-results', `elements.serverLogList?.scrollIntoView({block:'center'})`]
  ],
  server: [
    ['public-tunnel', `elements.hostTunnelCard?.scrollIntoView({block:'start'})`],
    ['tunnel-tutorial', `elements.tunnelTutorialBtn?.click()`],
    ['lan-access', `elements.tunnelTutorialModal?.classList.add('is-hidden'); elements.managementHubModal.classList.remove('is-hidden'); showManagementSection('server'); elements.lanAccessCard?.scrollIntoView({block:'start'})`],
    ['backup-and-restore', `elements.dataBackupCard?.scrollIntoView({block:'start'})`],
    ['security-policies', `elements.passwordPolicyCard?.scrollIntoView({block:'start'})`]
  ]
};

async function main() {
  if (!chromePath) throw new Error('未找到 Chrome 或 Edge。');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-doc-capture-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-doc-chrome-'));
  let server; let socket; let chrome; let cdp;
  try {
    server = await startSyncWatchServer({ host: '127.0.0.1', port: 0, dataDir, publicDir: path.join(root, 'public'), ffprobePath: '', ffmpegPath: '', hostControlToken: 'xuan-doc-host' });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    socket = io(baseUrl, { transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    await ack(socket, 'user-register', { username: 'xuan-demo', password: 'demo-123456' });
    const login = await ack(socket, 'room-create', { username: 'xuan-demo', password: 'demo-123456', customRoomId: 'DEMO217', roomName: '同步观影演示房间', maxUsers: 8, hostToken: 'xuan-doc-host', deviceId: 'xuan-doc-device' });
    if (!login.success) throw new Error(login.error || '创建演示房间失败');
    if (login.capabilities?.agreementRequired) await ack(socket, 'agreement-accept', { accepted: true, version: login.agreement?.version });
    socket.close(); socket = null;

    const debugPort = await availablePort();
    chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    const targets = await waitFor(async () => { const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`); return response.ok ? response.json() : null; }, '浏览器调试端口').then(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json());
    const target = targets.find((item) => item.type === 'page');
    cdp = new Cdp(target.webSocketDebuggerUrl); await cdp.open();
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(baseUrl)}){localStorage.setItem('syncwatchToken',${JSON.stringify(login.token)});localStorage.setItem('syncwatchDeviceId','xuan-doc-device');localStorage.setItem('syncwatchF11Prompt','-1');}` });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1.25, mobile: false });
    await cdp.send('Page.navigate', { url: `${baseUrl}/?room=${login.room.id}` });
    try {
      await waitFor(() => evaluate(cdp, `Boolean(typeof state!=='undefined'&&state.authenticated&&!elements.mainPage.classList.contains('is-hidden'))`), '登录真实管理中心');
    } catch (error) {
      const diagnostic = await evaluate(cdp, `({ href:location.href, ready:document.readyState, token:localStorage.getItem('syncwatchToken'), stateReady:typeof state!=='undefined', connected:typeof state!=='undefined'&&Boolean(state.socket?.connected), authenticated:typeof state!=='undefined'&&state.authenticated, socketAuthenticated:typeof state!=='undefined'&&state.socketAuthenticated, room:typeof state!=='undefined'&&state.room?.id, loginStatus:document.getElementById('loginStatus')?.textContent, agreementVisible:Boolean(document.getElementById('agreementModal')&&!document.getElementById('agreementModal').classList.contains('is-hidden')), body:document.body?.innerText?.slice(0,500) })`);
      throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`);
    }
    await evaluate(cdp, `if(typeof activeAppDialog!=='undefined'&&activeAppDialog) settleAppDialog(false); elements.adminPassword.value='admin888'; true`);
    await evaluate(cdp, `(async()=>{await loadAdminSettings({silent:true});openManagementHub('room');return true})()`);
    await waitFor(() => evaluate(cdp, `Boolean(state.adminSettings?.serverAdmin&&!elements.managementHubModal.classList.contains('is-hidden'))`), '加载管理员设置');
    await delay(500);

    const outputs = [];
    for (const [section, captures] of Object.entries(plans)) {
      for (let index = 0; index < captures.length; index += 1) {
        const [name, setup] = captures[index];
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1.25, mobile: false });
        await evaluate(cdp, `(() => {
          document.querySelectorAll('.modal').forEach((modal) => modal.classList.add('is-hidden'));
          document.querySelectorAll('.toast').forEach((toast) => toast.remove());
          elements.toastRegion.style.visibility = 'hidden';
          openManagementHub(${JSON.stringify(section)});
          elements.adminTab.querySelectorAll('[data-management-panel="${section}"]').forEach((card) => {
            card.classList.remove('is-hidden', 'management-filtered');
          });
          ${setup};
          return true;
        })()`);
        await waitFor(() => evaluate(cdp, `(() => {
          const openModal = [...document.querySelectorAll('.modal:not(.is-hidden)')]
            .find((modal) => modal !== elements.managementHubModal);
          if (openModal) {
            const rect = openModal.getBoundingClientRect();
            return rect.width > 320 && rect.height > 240 && openModal.innerText.trim().length > 20;
          }
          const cards = [...elements.adminTab.querySelectorAll('[data-management-panel="${section}"]')]
            .filter((card) => !card.classList.contains('is-hidden') && !card.classList.contains('management-filtered'));
          return cards.some((card) => {
            const rect = card.getBoundingClientRect();
            return rect.width > 320 && rect.height > 80 && card.innerText.trim().length > 20;
          });
        })()`), `${section}/${name} 目标模块可见`);
        await delay(650);
        const targetPath = path.join(root, 'docs', 'screenshots', 'management', section, `${String(index + 1).padStart(2, '0')}-${name}.png`);
        await capture(cdp, targetPath); outputs.push(path.relative(root, targetPath));
      }
    }
    console.log(JSON.stringify({ success: true, count: outputs.length, outputs }, null, 2));
  } finally {
    cdp?.close();
    await stopProcess(chrome);
    socket?.close();
    await server?.close().catch(() => {});
    removeTempDirectory(dataDir);
    removeTempDirectory(profileDir);
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
