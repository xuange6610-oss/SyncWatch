'use strict';

require('./epipe-guard');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function emitAck(socket, event, payload = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
    socket.emit(event, payload, (result) => { clearTimeout(timer); resolve(result || {}); });
  });
}

function nextEvent(socket, event, predicate = () => true, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`${event} timed out`)); }, timeout);
    const listener = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer); socket.off(event, listener); resolve(value);
    };
    socket.on(event, listener);
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}

function mailCode(message) {
  const match = String(message?.text || '').match(/验证码：(\d{6})/);
  assert.ok(match, 'verification email should include a six-digit code');
  return match[1];
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-latest26-backend-'));
  const sentMails = [];
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      port: 0, host: '127.0.0.1', dataDir, discovery: false,
      publicDir: path.resolve(__dirname, '..', 'public'), ffmpegPath: '', ffprobePath: '',
      hostControlToken: 'latest26-host',
      mailSender: async (message) => { sentMails.push(message); return { messageId: `mail-${sentMails.length}`, accepted: [message.to] }; },
      mailVerifier: async () => true
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const host = await connect(baseUrl); sockets.push(host);
    assert.equal((await emitAck(host, 'user-register', { username: 'RoundHost', password: 'host-pass' })).success, true);
    const hostAuth = await emitAck(host, 'room-create', {
      username: 'RoundHost', password: 'host-pass', customRoomId: 'ROUND26', roomName: 'Round 26',
      hostToken: 'latest26-host', deviceId: 'round-host-device'
    });
    assert.equal(hostAuth.success, true, hostAuth.error);
    if (hostAuth.capabilities?.agreementRequired) assert.equal((await emitAck(host, 'agreement-accept', { accepted: true, version: hostAuth.agreement.version })).success, true);

    const configuredMail = await emitAck(host, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      host: 'smtp.example.com', port: 465, secure: true, useTls: true,
      user: 'sender@example.com', password: 'mail-secret', fromEmail: 'sender@example.com', fromName: 'SyncWatch同步观影',
      registrationVerificationEnabled: false, bindingVerificationEnabled: true,
      accountRecoveryEnabled: true, adminRecoveryEnabled: true
    });
    assert.equal(configuredMail.success, true, configuredMail.error);

    const candidate = await connect(baseUrl); sockets.push(candidate);
    const codeRequest = await emitAck(candidate, 'registration-email-code-request', { username: 'VerifiedOptional', email: 'verified-optional@example.com' });
    assert.equal(codeRequest.success, true, codeRequest.error);
    const missingCode = await emitAck(candidate, 'user-register', { username: 'VerifiedOptional', email: 'verified-optional@example.com', password: 'verified-pass' });
    assert.equal(missingCode.success, false);
    assert.equal(missingCode.code, 'REGISTRATION_EMAIL_CODE_INVALID');
    const registration = await emitAck(candidate, 'user-register', {
      username: 'VerifiedOptional', email: 'verified-optional@example.com', password: 'verified-pass',
      emailVerificationCode: mailCode(sentMails.at(-1))
    });
    assert.equal(registration.success, true, registration.error);
    assert.equal(registration.emailVerified, true);
    assert.match(registration.accountId, /^SW-\d{6}$/);

    const nonexistent = await emitAck(candidate, 'password-reset-request', { scope: 'account', identifier: 'missing-account@example.com' });
    assert.equal(nonexistent.success, false);
    assert.match(nonexistent.error, /不存在|未绑定/);

    const idPolicy = await emitAck(host, 'admin-action', {
      action: 'set-account-number-policy', adminPassword: 'admin888', prefix: 'USER', separator: '-', digits: 5, nextNumber: 80
    });
    assert.equal(idPolicy.success, true, idPolicy.error);
    const second = await emitAck(candidate, 'user-register', { username: 'NumberedUser', password: 'numbered-pass' });
    assert.equal(second.success, true, second.error);
    assert.equal(second.accountId, 'USER-00080');
    const changedId = await emitAck(host, 'admin-action', {
      action: 'set-account-number', adminPassword: 'admin888', username: 'NumberedUser', accountId: 'VIP-90001'
    });
    assert.equal(changedId.success, true, changedId.error);
    assert.equal(changedId.accountId, 'VIP-90001');

    const records = await emitAck(host, 'admin-action', { action: 'get-verification-codes', adminPassword: 'admin888' });
    assert.equal(records.success, true, records.error);
    assert.ok(records.records.some((record) => record.type === 'registration' && record.recipientEmail === 'verified-optional@example.com'));
    assert.ok(records.records.every((record) => !Object.hasOwn(record, 'code') && !Object.hasOwn(record, 'digest')));
    const recordId = records.records[0]?.id;
    assert.ok(recordId);
    assert.equal((await emitAck(host, 'admin-action', { action: 'delete-verification-codes', adminPassword: 'admin888', ids: [recordId] })).success, true);

    const loginMusicUrl = 'https://media.example.com/login-theme.mp3';
    const musicSaved = await emitAck(host, 'admin-action', {
      action: 'set-login-music', adminPassword: 'admin888', enabled: true,
      title: '登录序曲', url: loginMusicUrl, volume: 0.35, loop: true
    });
    assert.equal(musicSaved.success, true, musicSaved.error);
    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    assert.equal(publicConfig.loginMusic.enabled, true);
    assert.equal(publicConfig.loginMusic.url, loginMusicUrl);

    const viewer = await connect(baseUrl); sockets.push(viewer);
    const viewerLogin = await emitAck(viewer, 'user-login', {
      username: 'VerifiedOptional', password: 'verified-pass', roomId: 'ROUND26', deviceId: 'round-viewer-device'
    });
    assert.equal(viewerLogin.success, true, viewerLogin.error);
    if (viewerLogin.capabilities?.agreementRequired) assert.equal((await emitAck(viewer, 'agreement-accept', { accepted: true, version: viewerLogin.agreement.version })).success, true);

    const aiRequestEvent = nextEvent(viewer, 'ai-config-sync-requested');
    const sync = await emitAck(host, 'ai-config-sync-request', {
      scope: 'room', preview: { baseUrl: 'https://api.example.com/v1', chatModel: 'example-chat' },
      config: { baseUrl: 'https://api.example.com/v1', apiKey: 'shared-secret', chatModel: 'example-chat', imageApiKey: 'image-secret', videoApiKey: 'video-secret' }
    });
    assert.equal(sync.success, true, sync.error);
    const aiRequest = await aiRequestEvent;
    assert.equal(Object.hasOwn(aiRequest, 'config'), false, 'secret config must not be sent before acceptance');
    const hostResolved = nextEvent(host, 'ai-config-sync-resolved', (value) => value.requestId === aiRequest.id);
    const accepted = await emitAck(viewer, 'ai-config-sync-response', { requestId: aiRequest.id, accepted: true });
    assert.equal(accepted.success, true, accepted.error);
    assert.equal(accepted.config.apiKey, 'shared-secret');
    assert.equal((await hostResolved).accepted, true);

    const pinResult = await emitAck(viewer, 'account-action', { action: 'friend-update', username: 'RoundHost', pinned: true });
    assert.equal(pinResult.success, false, 'friend pinning must still require an established friendship');

    console.log('Latest 26 backend mail, account-number, verification, login-music and AI sync contracts passed.');
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
