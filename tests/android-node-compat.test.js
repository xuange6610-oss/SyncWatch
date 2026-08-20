'use strict';

require('./epipe-guard');

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');

const nativeRandomUUID = crypto.randomUUID;
const nativeIntl = globalThis.Intl;
crypto.randomUUID = undefined;
globalThis.Intl = undefined;
const { startSyncWatchServer } = require('../server');

function ack(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), 12000);
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

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-android-node-compat-'));
  const sockets = [];
  let server;
  try {
    assert.equal(typeof crypto.randomUUID, 'function', 'server must install the Node.js Mobile UUID fallback');
    assert.match(crypto.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir: path.join(root, 'data'),
      publicDir: path.resolve(__dirname, '..', 'public'),
      hostControlToken: 'android-node-compat', ffprobePath: '', ffmpegPath: '', discovery: false
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const admin = await connect(baseUrl); sockets.push(admin);
    const adminLogin = await ack(admin, 'host-admin-login', {
      adminPassword: 'admin888', hostToken: 'android-node-compat', deviceId: 'android-admin',
      deviceName: 'Android phone', platform: 'Android', browser: 'WebView'
    });
    assert.equal(adminLogin.success, true, adminLogin.error);

    const guest = await connect(baseUrl); sockets.push(guest);
    const guestLogin = await ack(guest, 'guest-login', {
      roomId: adminLogin.user.roomId,
      deviceId: 'android-guest', deviceName: 'Android phone', platform: 'Android', browser: 'WebView'
    });
    assert.equal(guestLogin.success, true, guestLogin.error);
    assert.equal(guestLogin.user.guest, true);
    assert.ok(guestLogin.token);

    const presence = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('member presence notice timed out')), 12000);
      admin.on('system-notification', function onNotice(notice) {
        if (notice?.kind !== 'member-leave' || notice?.actor !== guestLogin.user.username) return;
        clearTimeout(timer);
        admin.off('system-notification', onNotice);
        resolve(notice);
      });
      guest.close();
    });
    assert.match(presence.timeText, /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.match(presence.message, /退出房间$/);

    const reconnect = await connect(baseUrl); sockets.push(reconnect);
    const reconnectLogin = await ack(reconnect, 'guest-login', {
      deviceId: 'android-guest-reconnect', deviceName: 'Android phone', platform: 'Android', browser: 'WebView'
    });
    assert.equal(reconnectLogin.success, true, reconnectLogin.error);

    console.log('Android Node.js Mobile crypto and Intl compatibility login regression passed.');
  } finally {
    for (const socket of sockets) socket.close();
    await server?.close().catch(() => {});
    crypto.randomUUID = nativeRandomUUID;
    globalThis.Intl = nativeIntl;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  crypto.randomUUID = nativeRandomUUID;
  globalThis.Intl = nativeIntl;
  console.error('Android Node.js Mobile crypto compatibility regression failed:', error);
  process.exitCode = 1;
});
