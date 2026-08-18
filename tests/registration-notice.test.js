'use strict';

require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function ack(socket, event, payload = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
    socket.emit(event, payload, (result) => { clearTimeout(timer); resolve(result || {}); });
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connection timed out')), 10000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', reject);
  });
  return socket;
}

async function loginAdmin(socket, token) {
  const result = await ack(socket, 'host-admin-login', { adminPassword: 'admin888', hostToken: token });
  assert.equal(result.success, true, result.error);
  if (result.capabilities?.agreementRequired) {
    const accepted = await ack(socket, 'agreement-accept', { accepted: true, version: result.agreement.version });
    assert.equal(accepted.success, true, accepted.error);
  }
  return result;
}

function waitForEvent(socket, event, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, onEvent); reject(new Error(`${event} timed out`)); }, timeout);
    const onEvent = (payload) => { clearTimeout(timer); resolve(payload); };
    socket.once(event, onEvent);
  });
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-registration-notice-'));
  let server; let admin; let registrar; let reconnectingAdmin;
  try {
    server = await startSyncWatchServer({ host: '127.0.0.1', port: 0, dataDir, publicDir: path.resolve(__dirname, '..', 'public'), hostControlToken: 'registration-host', ffprobePath: '', ffmpegPath: '' });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    admin = await connect(baseUrl);
    await loginAdmin(admin, 'registration-host');
    const whitelisted = await ack(admin, 'admin-action', { action: 'add-registration-whitelist', adminPassword: 'admin888', ipAddress: '127.0.0.1' });
    assert.equal(whitelisted.success, true, whitelisted.error);
    registrar = await connect(baseUrl);

    const onlineNotice = waitForEvent(admin, 'account-notification');
    const first = await ack(registrar, 'user-register', { username: 'RegistrationOnline', password: '123456' });
    assert.equal(first.success, true, first.error);
    const onlinePayload = await onlineNotice;
    assert.equal(onlinePayload.kind, 'account-registration');
    assert.equal(onlinePayload.username, 'RegistrationOnline');

    const disabled = await ack(admin, 'admin-action', { action: 'set-registration-account-notice', adminPassword: 'admin888', enabled: false });
    assert.equal(disabled.success, true, disabled.error);
    const disabledResult = await ack(registrar, 'user-register', { username: 'RegistrationDisabled', password: '123456' });
    assert.equal(disabledResult.success, true, disabledResult.error);
    await assert.rejects(() => waitForEvent(admin, 'account-notification', 500), /timed out/);

    const enabled = await ack(admin, 'admin-action', { action: 'set-registration-account-notice', adminPassword: 'admin888', enabled: true });
    assert.equal(enabled.success, true, enabled.error);
    admin.close(); admin = null;
    await new Promise((resolve) => setTimeout(resolve, 80));
    const offline = await ack(registrar, 'user-register', { username: 'RegistrationOffline', password: '123456' });
    assert.equal(offline.success, true, offline.error);
    reconnectingAdmin = await connect(baseUrl);
    const login = await loginAdmin(reconnectingAdmin, 'registration-host');
    assert.ok((login.notifications || []).some((notice) => notice.kind === 'account-registration' && notice.username === 'RegistrationOffline'));
    console.log('Online, disabled, and offline-delivered account registration notifications passed.');
  } finally {
    admin?.close(); registrar?.close(); reconnectingAdmin?.close();
    await server?.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
