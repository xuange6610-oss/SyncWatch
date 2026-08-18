'use strict';

require('./epipe-guard');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function ack(socket, event, payload = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: '服务器未返回结果' });
    });
  });
}

function nextEvent(socket, event, predicate = null, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`等待 ${event} 超时`));
    }, timeout);
    const listener = (payload) => {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO 连接超时')), 10000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

async function login(socket, credentials) {
  const result = await ack(socket, 'user-login', credentials);
  if (result.success && result.capabilities?.agreementRequired) {
    const accepted = await ack(socket, 'agreement-accept', { accepted: true, version: result.agreement.version });
    assert.equal(accepted.success, true, accepted.error);
    result.capabilities.agreementRequired = false;
  }
  return result;
}

function assertPresenceNotice(notice, { kind, actor, roomId, reason }) {
  assert.equal(notice.kind, kind);
  assert.equal(notice.actor, actor);
  assert.equal(notice.roomId, roomId);
  assert.equal(notice.reason, reason);
  assert.ok(Number.isFinite(notice.timestamp));
  assert.match(notice.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(notice.timeText && notice.message.includes(notice.timeText));
  assert.ok(notice.message.includes(notice.actorName));
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-member-presence-'));
  const publicDir = path.resolve(__dirname, '..', 'public');
  const sockets = [];
  const graceMs = 220;
  let server;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir,
      hostControlToken: 'member-presence-host', ffprobePath: '', ffmpegPath: '',
      memberDisconnectGraceMs: graceMs
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    const lobbyRoomId = publicConfig.roomId;

    const host = await connect(baseUrl);
    const watcher = await connect(baseUrl);
    let guest = await connect(baseUrl);
    sockets.push(host, watcher, guest);

    assert.equal((await ack(host, 'user-register', { username: 'PresenceHost', password: '123456' })).success, true);
    const hostAuth = await login(host, {
      username: 'PresenceHost', password: '123456', roomId: lobbyRoomId,
      hostToken: 'member-presence-host', deviceId: 'presence-host-device'
    });
    assert.equal(hostAuth.success, true, hostAuth.error);
    const whitelist = await ack(host, 'admin-action', {
      action: 'add-registration-whitelist', ipAddress: '127.0.0.1', adminPassword: 'admin888'
    });
    assert.equal(whitelist.success, true, whitelist.error);

    assert.equal((await ack(watcher, 'user-register', { username: 'PresenceWatcher', password: '123456' })).success, true);
    const watcherAuth = await login(watcher, {
      username: 'PresenceWatcher', password: '123456', roomId: lobbyRoomId, deviceId: 'presence-watcher-device'
    });
    assert.equal(watcherAuth.success, true, watcherAuth.error);

    assert.equal((await ack(guest, 'user-register', { username: 'PresenceGuest', password: '123456' })).success, true);
    const firstJoinPromise = nextEvent(host, 'system-notification', (notice) => notice.kind === 'member-join' && notice.actor === 'PresenceGuest');
    const guestAuth = await login(guest, {
      username: 'PresenceGuest', password: '123456', roomId: lobbyRoomId, deviceId: 'presence-guest-device'
    });
    assert.equal(guestAuth.success, true, guestAuth.error);
    assertPresenceNotice(await firstJoinPromise, { kind: 'member-join', actor: 'PresenceGuest', roomId: lobbyRoomId, reason: 'login' });

    const reconnectNotices = [];
    const reconnectListener = (notice) => {
      if (notice.actor === 'PresenceGuest' && ['member-join', 'member-leave'].includes(notice.kind)) reconnectNotices.push(notice);
    };
    host.on('system-notification', reconnectListener);
    const disconnected = new Promise((resolve) => guest.once('disconnect', resolve));
    guest.io.engine.close();
    await disconnected;
    await delay(50);
    const resumedGuest = await connect(baseUrl);
    sockets.push(resumedGuest);
    const resumed = await ack(resumedGuest, 'session-resume', {
      token: guestAuth.token, deviceId: 'presence-guest-device'
    });
    assert.equal(resumed.success, true, resumed.error);
    guest = resumedGuest;
    await delay(graceMs + 100);
    host.off('system-notification', reconnectListener);
    assert.deepEqual(reconnectNotices, [], '瞬时断线恢复不应广播退出或再次进入');

    const created = await ack(host, 'room-create', {
      username: 'PresenceHost', password: '123456', roomName: '成员通知测试房间', maxUsers: 8,
      deviceId: 'presence-host-room'
    });
    assert.equal(created.success, true, created.error);
    const targetRoomId = created.room.id;

    const oldRoomLeave = nextEvent(watcher, 'system-notification', (notice) => notice.kind === 'member-leave' && notice.actor === 'PresenceGuest');
    const newRoomJoin = nextEvent(host, 'system-notification', (notice) => notice.kind === 'member-join' && notice.actor === 'PresenceGuest');
    const switched = await ack(guest, 'room-switch', { roomId: targetRoomId });
    assert.equal(switched.success, true, switched.error);
    const leaveNotice = await oldRoomLeave;
    const joinNotice = await newRoomJoin;
    assertPresenceNotice(leaveNotice, { kind: 'member-leave', actor: 'PresenceGuest', roomId: lobbyRoomId, reason: 'room-switch' });
    assert.equal(leaveNotice.targetRoomId, targetRoomId);
    assertPresenceNotice(joinNotice, { kind: 'member-join', actor: 'PresenceGuest', roomId: targetRoomId, reason: 'room-switch' });
    assert.equal(joinNotice.previousRoomId, lobbyRoomId);
    assert.equal(joinNotice.timestamp, leaveNotice.timestamp, '换房两侧通知应共享同一个操作时间');

    const explicitLeave = nextEvent(host, 'system-notification', (notice) => notice.kind === 'member-leave' && notice.actor === 'PresenceGuest');
    guest.disconnect();
    assertPresenceNotice(await explicitLeave, { kind: 'member-leave', actor: 'PresenceGuest', roomId: targetRoomId, reason: 'disconnect' });

    const finalGuest = await connect(baseUrl);
    sockets.push(finalGuest);
    const finalJoin = nextEvent(host, 'system-notification', (notice) => notice.kind === 'member-join' && notice.actor === 'PresenceGuest');
    const finalResume = await ack(finalGuest, 'session-resume', { token: guestAuth.token, deviceId: 'presence-guest-device' });
    assert.equal(finalResume.success, true, finalResume.error);
    assertPresenceNotice(await finalJoin, { kind: 'member-join', actor: 'PresenceGuest', roomId: targetRoomId, reason: 'login' });

    let earlyLeave = false;
    const earlyListener = (notice) => {
      if (notice.kind === 'member-leave' && notice.actor === 'PresenceGuest') earlyLeave = true;
    };
    host.on('system-notification', earlyListener);
    const delayedLeave = nextEvent(host, 'system-notification', (notice) => notice.kind === 'member-leave' && notice.actor === 'PresenceGuest');
    const finalDisconnected = new Promise((resolve) => finalGuest.once('disconnect', resolve));
    finalGuest.io.engine.close();
    await finalDisconnected;
    await delay(Math.floor(graceMs / 2));
    assert.equal(earlyLeave, false, '传输层瞬断不应立即广播退出');
    const timedOutLeave = await delayedLeave;
    host.off('system-notification', earlyListener);
    assertPresenceNotice(timedOutLeave, { kind: 'member-leave', actor: 'PresenceGuest', roomId: targetRoomId, reason: 'disconnect-timeout' });

    const noticeSettings = await ack(host, 'admin-action', {
      action: 'set-room-entry-notice', adminPassword: 'admin888', enabled: true, text: '进入房间后请文明观影。'
    });
    assert.equal(noticeSettings.success, true, noticeSettings.error);
    const settings = await ack(host, 'admin-action', { action: 'get-settings', adminPassword: 'admin888' });
    assert.equal(settings.success, true, settings.error);
    assert.equal(settings.admin.roomEntryNotice.enabled, true);
    assert.equal(settings.admin.roomEntryNotice.text, '进入房间后请文明观影。');
    assert.ok(settings.admin.roomEntryNotice.version);

    // A room owner can override the server default, and the override is sent
    // to a newly joined member without changing the global setting.
    const roomOverride = await ack(host, 'admin-action', {
      action: 'set-room-entry-notice', scope: 'room', roomId: targetRoomId,
      enabled: true, text: 'Room-specific entry notice', timeoutSeconds: 10
    });
    assert.equal(roomOverride.success, true, roomOverride.error);
    assert.equal(roomOverride.scope, 'room');
    const overrideGuest = await connect(baseUrl);
    sockets.push(overrideGuest);
    const overrideNotice = nextEvent(overrideGuest, 'room-entry-notice', (notice) => notice.roomId === targetRoomId);
    const overrideAuth = await login(overrideGuest, {
      username: 'PresenceGuest', password: '123456', roomId: targetRoomId, deviceId: 'presence-override-device'
    });
    assert.equal(overrideAuth.success, true, overrideAuth.error);
    assert.equal((await overrideNotice).text, 'Room-specific entry notice');
    const overrideHistory = await ack(host, 'chat-history', { limit: 300 });
    assert.equal(overrideHistory.success, true, overrideHistory.error);
    assert.ok(overrideHistory.messages.some((message) => message.type === 'system'
      && message.systemKind === 'member-join' && message.actor === 'PresenceGuest'),
    'member presence events must be persisted in chat history');
    const resetOverride = await ack(host, 'admin-action', {
      action: 'set-room-entry-notice', scope: 'room', roomId: targetRoomId, inheritGlobal: true
    });
    assert.equal(resetOverride.success, true, resetOverride.error);

    const appSource = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');
    assert.match(appSource, /roomEntryNoticeSettingsCard\?\.classList\.toggle\('is-hidden', !\(result\.admin\.serverAdmin \|\| result\.admin\.roomEntryNoticeTargets\?\.length\)\)/);
    assert.match(appSource, /elements\.roomEntryNoticeEnabled\) elements\.roomEntryNoticeEnabled\.checked = Boolean\(notice\.enabled\)/);
    assert.match(appSource, /elements\.roomEntryNoticeText\) elements\.roomEntryNoticeText\.value = notice\.text \|\| ''/);
    assert.match(appSource, /elements\.roomEntryNoticeStatus\.textContent = inherited/);

    console.log('成员进入、换房、主动退出、断线宽限恢复/超时通知与进房公告配置回归通过');
  } finally {
    for (const socket of sockets) socket?.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
