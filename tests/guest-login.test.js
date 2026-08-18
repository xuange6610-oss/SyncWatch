'use strict';

require('./epipe-guard');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function ack(socket, event, payload = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: 'empty response' });
    });
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connection timed out')), 12000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await predicate()) return true;
    await sleep(150);
  }
  throw new Error(`waitFor timeout: ${label}`);
}

async function adminSettings(admin, baseUrl, token) {
  const result = await ack(admin, 'admin-action', { action: 'get-settings' });
  assert.equal(result.success, true, result.error);
  return result.admin;
}

async function adminFiles(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/files`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  return response.json();
}

async function uploadGuestVideo(baseUrl, token) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('syncwatch-guest-test-video')], { type: 'video/mp4' }), 'guest-film.mp4');
  const response = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
  });
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.success, true, result.error);
  return result.file;
}

async function logout(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-guest-login-'));
  const dataDir = path.join(root, 'SyncWatch同步观影-Data');
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir,
      publicDir: path.resolve(__dirname, '..', 'public'),
      hostControlToken: 'guest-login-host', ffprobePath: '', ffmpegPath: '', discovery: false
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    const roomId = publicConfig.roomId;

    const admin = await connect(baseUrl); sockets.push(admin);
    const adminLogin = await ack(admin, 'host-admin-login', {
      adminPassword: 'admin888', roomId, hostToken: 'guest-login-host', deviceId: 'guest-admin'
    });
    assert.equal(adminLogin.success, true, adminLogin.error);
    if (adminLogin.capabilities?.agreementRequired) {
      const accepted = await ack(admin, 'agreement-accept', { accepted: true, version: adminLogin.agreement.version });
      assert.equal(accepted.success, true, accepted.error);
    }

    const guestA = await connect(baseUrl); sockets.push(guestA);
    const firstLogin = await ack(guestA, 'guest-login', {
      deviceName: '游客测试设备', platform: 'Windows', browser: 'TestBrowser', deviceId: 'guest-a-device'
    });
    assert.equal(firstLogin.success, true, firstLogin.error);
    assert.equal(firstLogin.user.guest, true);
    assert.ok(firstLogin.token);
    assert.ok(firstLogin.room?.id);
    const guestAName = firstLogin.user.username;
    const guestARoomId = firstLogin.room.id;
    assert.ok(guestAName.startsWith('游客'), guestAName);
    if (firstLogin.capabilities?.agreementRequired) {
      const accepted = await ack(guestA, 'agreement-accept', { accepted: true, version: firstLogin.agreement.version });
      assert.equal(accepted.success, true, accepted.error);
    }

    const guestB = await connect(baseUrl); sockets.push(guestB);
    const occupied = await ack(guestB, 'guest-login', { deviceId: 'guest-b-device' });
    assert.equal(occupied.success, false);
    assert.equal(occupied.code, 'GUEST_IP_OCCUPIED');
    assert.match(occupied.error, /已有游客在线/);

    const file = await uploadGuestVideo(baseUrl, firstLogin.token);
    await logout(baseUrl, firstLogin.token);

    await waitFor(async () => {
      const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
      return !persisted.accounts[guestAName] && !persisted.files.some((entry) => entry.uploadedBy === guestAName);
    }, 'guest account and uploaded file are purged after logout');
    const afterFirstLogout = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(afterFirstLogout.rooms[guestARoomId], undefined,
      'the original guest-owned temporary room must be destroyed after logout');

    const guestC = await connect(baseUrl); sockets.push(guestC);
    const secondLogin = await ack(guestC, 'guest-login', { roomId: guestARoomId, deviceId: 'guest-c-device' });
    assert.equal(secondLogin.success, true, secondLogin.error);
    assert.equal(secondLogin.user.guest, true);
    assert.notEqual(secondLogin.user.username, guestAName);
    assert.equal(secondLogin.room.temporary, true);
    assert.notEqual(secondLogin.room.id, guestARoomId,
      'a missing room number must create a new temporary room, not revive the deleted room');
    assert.deepEqual(secondLogin.roomFallback, {
      requestedRoomId: guestARoomId,
      temporaryRoomId: secondLogin.room.id
    });
    const guestCName = secondLogin.user.username;
    const guestCRoomId = secondLogin.room.id;
    if (secondLogin.capabilities?.agreementRequired) {
      const accepted = await ack(guestC, 'agreement-accept', { accepted: true, version: secondLogin.agreement.version });
      assert.equal(accepted.success, true, accepted.error);
    }

    await logout(baseUrl, secondLogin.token);
    await waitFor(async () => {
      const settings = await adminSettings(admin, baseUrl, adminLogin.token);
      const accounts = settings.accounts || [];
      return !accounts.some((entry) => entry.username === guestCName);
    }, 'second guest account is purged after logout');

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(Object.values(persisted.accounts).some((account) => account.guest === true), false);
    assert.equal(persisted.rooms[guestARoomId], undefined);
    assert.equal(persisted.rooms[guestCRoomId], undefined);
    assert.equal(persisted.files.some((entry) => entry.uploadedBy === guestAName || entry.uploadedBy === guestCName), false);
    console.log('guest login lifecycle regression passed');
  } finally {
    for (const socket of sockets) socket.close();
    await server?.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('guest login regression failed:', error);
  process.exitCode = 1;
});
