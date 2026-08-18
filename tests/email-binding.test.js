'use strict';

require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function emitAck(socket, event, payload = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: '服务器未返回结果' });
    });
  });
}

async function connect(baseUrl, headers = {}) {
  const socket = io(baseUrl, {
    transports: ['websocket'], reconnection: false, timeout: 10000,
    transportOptions: { websocket: { extraHeaders: headers } }
  });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function acceptAgreement(socket, result) {
  if (!result?.success || !result.capabilities?.agreementRequired || !result.agreement?.version) return result;
  const accepted = await emitAck(socket, 'agreement-accept', { accepted: true, version: result.agreement.version });
  assert.equal(accepted.success, true, accepted.error);
  return result;
}

function verificationCode(message) {
  const match = String(message?.text || '').match(/验证码：(\d{6})/);
  assert.ok(match, '邮件中应包含 6 位验证码');
  return match[1];
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-email-binding-'));
  const publicDir = path.resolve(__dirname, '..', 'public');
  const sentMails = [];
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      port: 0,
      host: '127.0.0.1',
      dataDir,
      publicDir,
      ffmpegPath: '',
      ffprobePath: '',
      hostControlToken: 'email-test-host',
      discovery: false,
      mailSender: async (message) => {
        sentMails.push({ ...message, config: { ...message.config } });
        return { messageId: `email-test-${sentMails.length}` };
      }
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const owner = await connect(baseUrl); sockets.push(owner);
    assert.equal((await emitAck(owner, 'user-register', {
      username: 'EmailOwner', password: 'owner-pass'
    })).success, true);
    const room = await acceptAgreement(owner, await emitAck(owner, 'room-create', {
      username: 'EmailOwner', password: 'owner-pass', customRoomId: 'EMAIL01', roomName: '邮箱测试房间',
      maxUsers: 8, hostToken: 'email-test-host', deviceId: 'email-owner-device'
    }));
    assert.equal(room.success, true, room.error);

    const mailSettings = await emitAck(owner, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      user: 'sender@qq.com', authCode: 'test-qq-smtp-secret', fromName: 'SyncWatch 测试'
    });
    assert.equal(mailSettings.success, true, mailSettings.error);

    const unboundRecoveryMailCount = sentMails.length;
    const unboundRecovery = await emitAck(owner, 'password-reset-request', {
      scope: 'account', identifier: 'EmailOwner'
    });
    assert.equal(unboundRecovery.success, false);
    assert.match(unboundRecovery.error, /不存在|未绑定/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(sentMails.length, unboundRecoveryMailCount,
      'An account without a verified email must not receive password-reset codes.');

    let result = await emitAck(owner, 'account-action', {
      action: 'update-profile', email: '', avatar: '', signature: '保存其他资料', gender: 'private', age: ''
    });
    assert.equal(result.success, true, result.error);
    assert.equal(result.profile.signature, '保存其他资料');

    result = await emitAck(owner, 'account-action', {
      action: 'update-profile', email: 'new@example.com', avatar: '', signature: '不应越过验证', gender: 'private', age: ''
    });
    assert.equal(result.success, false);
    assert.equal(result.code, 'EMAIL_VERIFICATION_REQUIRED');
    assert.equal(result.bindingAvailable, true);

    const requested = await emitAck(owner, 'email-bind-request', { email: 'new@example.com' });
    assert.equal(requested.success, true, requested.error);
    const bindingMail = sentMails.findLast((message) => message.to === 'new@example.com');
    const code = verificationCode(bindingMail);
    const wrongCode = `${code.slice(0, 5)}${code.endsWith('9') ? '8' : '9'}`;
    assert.equal((await emitAck(owner, 'email-bind-verify', { email: 'new@example.com', code: wrongCode })).success, false);
    const verified = await emitAck(owner, 'email-bind-verify', { email: 'new@example.com', code });
    assert.equal(verified.success, true, verified.error);
    assert.equal(verified.profile.email, 'new@example.com');
    assert.equal(verified.profile.emailVerified, true);
    assert.equal((await emitAck(owner, 'email-bind-verify', { email: 'new@example.com', code })).success, false);

    const emailLogin = await acceptAgreement(owner, await emitAck(owner, 'user-login', {
      username: 'new@example.com', password: 'owner-pass', roomId: 'EMAIL01', deviceId: 'email-login-device'
    }));
    assert.equal(emailLogin.success, true, emailLogin.error);
    assert.equal(emailLogin.user.username, 'EmailOwner');

    const unbindRequested = await emitAck(owner, 'email-unbind-request', { email: 'new@example.com' });
    assert.equal(unbindRequested.success, true, unbindRequested.error);
    const unbindCode = verificationCode(sentMails.findLast((message) => message.to === 'new@example.com'));
    const unbound = await emitAck(owner, 'email-unbind-verify', { email: 'new@example.com', code: unbindCode });
    assert.equal(unbound.success, true, unbound.error);
    assert.equal(unbound.profile.email, '');
    assert.equal(unbound.profile.emailVerified, false);
    assert.equal((await emitAck(owner, 'user-login', {
      username: 'new@example.com', password: 'owner-pass', roomId: 'EMAIL01', deviceId: 'email-login-cleared-device'
    })).success, false, 'A cleared email cannot continue to identify an account.');
    const reboundRequested = await emitAck(owner, 'email-bind-request', { email: 'new@example.com' });
    assert.equal(reboundRequested.success, true, reboundRequested.error);
    const reboundCode = verificationCode(sentMails.findLast((message) => message.to === 'new@example.com'));
    assert.equal((await emitAck(owner, 'email-bind-verify', { email: 'new@example.com', code: reboundCode })).success, true);

    const verifiedRecoveryMailCount = sentMails.length;
    assert.equal((await emitAck(owner, 'password-reset-request', {
      scope: 'account', identifier: 'EmailOwner'
    })).success, true);
    for (let index = 0; index < 100 && sentMails.length === verifiedRecoveryMailCount; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(sentMails.at(-1)?.to, 'new@example.com');

    const duplicate = await connect(baseUrl, { 'cf-connecting-ip': '203.0.113.22' }); sockets.push(duplicate);
    assert.equal((await emitAck(duplicate, 'user-register', {
      username: 'EmailOther', password: 'other-pass'
    })).success, true);
    const duplicateLogin = await acceptAgreement(duplicate, await emitAck(duplicate, 'user-login', {
      username: 'EmailOther', password: 'other-pass', roomId: 'EMAIL01', deviceId: 'email-other-device'
    }));
    assert.equal(duplicateLogin.success, true, duplicateLogin.error);
    const sameEmailRequest = await emitAck(duplicate, 'email-bind-request', { email: 'other@example.com' });
    assert.equal(sameEmailRequest.success, true, sameEmailRequest.error);
    const sameEmailCode = verificationCode(sentMails.findLast((message) => message.to === 'other@example.com'));
    const sameEmailVerified = await emitAck(duplicate, 'email-bind-verify', { email: 'other@example.com', code: sameEmailCode });
    assert.equal(sameEmailVerified.success, true, sameEmailVerified.error);
    assert.equal(sameEmailVerified.profile.emailVerified, true);
    const duplicateRequest = await emitAck(duplicate, 'email-bind-request', { email: 'new@example.com' });
    assert.equal(duplicateRequest.success, false);
    assert.match(duplicateRequest.error, /其他账号使用/);

    const admin = await connect(baseUrl); sockets.push(admin);
    const adminLogin = await acceptAgreement(admin, await emitAck(admin, 'user-login', {
      username: 'admin', password: 'admin888', roomId: 'EMAIL01', deviceId: 'email-admin-old'
    }));
    assert.equal(adminLogin.success, true, adminLogin.error);
    const recovery = await connect(baseUrl); sockets.push(recovery);
    const mailCountBeforeRecovery = sentMails.length;
    assert.equal((await emitAck(recovery, 'password-reset-request', { scope: 'admin', identifier: '' })).success, true);
    for (let index = 0; index < 100 && sentMails.length === mailCountBeforeRecovery; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(sentMails.length > mailCountBeforeRecovery, '管理员找回邮件应送达');
    const adminCode = verificationCode(sentMails.at(-1));
    const resetVerified = await emitAck(recovery, 'password-reset-verify', { scope: 'admin', identifier: '', code: adminCode });
    assert.equal(resetVerified.success, true, resetVerified.error);
    const resetCompleted = await emitAck(recovery, 'password-reset-complete', {
      resetToken: resetVerified.resetToken, newPassword: 'admin-email-pass'
    });
    assert.equal(resetCompleted.success, true, resetCompleted.error);

    const oldSessionResponse = await fetch(`${baseUrl}/api/files`, { headers: { Authorization: `Bearer ${adminLogin.token}` } });
    assert.equal(oldSessionResponse.status, 401);
    const adminAfterReset = await connect(baseUrl); sockets.push(adminAfterReset);
    assert.equal((await emitAck(adminAfterReset, 'user-login', {
      username: 'admin', password: 'admin888', roomId: 'EMAIL01', deviceId: 'email-admin-old-password'
    })).success, false);
    const newAdminLogin = await acceptAgreement(adminAfterReset, await emitAck(adminAfterReset, 'user-login', {
      username: 'admin', password: 'admin-email-pass', roomId: 'EMAIL01', deviceId: 'email-admin-new'
    }));
    assert.equal(newAdminLogin.success, true, newAdminLogin.error);
    const verifiedSettings = await emitAck(owner, 'admin-action', {
      action: 'get-settings', adminPassword: 'admin-email-pass'
    });
    assert.equal(verifiedSettings.success, true, verifiedSettings.error);
    assert.equal(verifiedSettings.admin.serverAdmin, true);

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(persisted.accounts.EmailOwner.email, 'new@example.com');
    assert.equal(persisted.accounts.EmailOwner.emailVerified, true);
    assert.equal(persisted.accounts.EmailOther.emailVerified, true);
    assert.equal(persisted.accounts.admin.mustChangePassword, false);
    assert.equal(persisted.accounts.admin.passwordHash, persisted.admin.passwordHash);
    console.log('✓ 邮箱验证绑定、唯一性、一次性验证码与 admin 邮箱找回同步闭环通过');
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
