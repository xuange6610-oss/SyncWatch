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

async function connect(baseUrl, forwardedIp) {
  const socket = io(baseUrl, {
    transports: ['websocket'], forceNew: true, reconnection: false,
    extraHeaders: { 'x-forwarded-for': forwardedIp }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket connection timed out')), 12000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

function verificationCode(message) {
  const match = String(message?.text || message?.html || '').match(/(?:验证码[^0-9]*|>)(\d{6})(?:<|\b)/);
  assert.ok(match, 'registration email should contain a six-digit verification code');
  return match[1];
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-registration-email-required-'));
  const dataDir = path.join(root, 'SyncWatch-Data');
  const sockets = [];
  const sentMails = [];
  let server;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, discovery: false,
      publicDir: path.resolve(__dirname, '..', 'public'),
      ffprobePath: '', ffmpegPath: '', hostControlToken: 'strict-email-host',
      mailSender: async (message) => {
        sentMails.push(message);
        return { messageId: `strict-email-${sentMails.length}`, accepted: [message.to] };
      },
      mailVerifier: async () => true
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const unavailable = await connect(baseUrl, '203.0.113.20'); sockets.push(unavailable);
    const unavailableEmail = await ack(unavailable, 'user-register', {
      username: 'UnavailableEmail', password: 'email-pass', email: 'unavailable@example.com'
    });
    assert.equal(unavailableEmail.success, false,
      '填写邮箱时，SMTP 未启用不能降级成未验证邮箱注册');
    assert.equal(unavailableEmail.code, 'REGISTRATION_EMAIL_SMTP_UNAVAILABLE');

    const manager = await connect(baseUrl, '203.0.113.21'); sockets.push(manager);
    const managerRegistration = await ack(manager, 'user-register', {
      username: 'StrictMailManager', password: 'manager-pass'
    });
    assert.equal(managerRegistration.success, true, managerRegistration.error);
    const managerAuth = await ack(manager, 'room-create', {
      username: 'StrictMailManager', password: 'manager-pass', customRoomId: 'STRICTMAIL',
      roomName: 'Strict mail', hostToken: 'strict-email-host', deviceId: 'strict-mail-manager'
    }, 30000);
    assert.equal(managerAuth.success, true, managerAuth.error);
    if (managerAuth.capabilities?.agreementRequired) {
      const accepted = await ack(manager, 'agreement-accept', { accepted: true, version: managerAuth.agreement.version });
      assert.equal(accepted.success, true, accepted.error);
    }
    const configured = await ack(manager, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      host: 'smtp.example.com', port: 465, secure: true, useTls: true,
      user: 'sender@example.com', password: 'smtp-secret', fromEmail: 'sender@example.com', fromName: 'SyncWatch',
      registrationVerificationEnabled: false, bindingVerificationEnabled: true,
      accountRecoveryEnabled: true, adminRecoveryEnabled: true
    });
    assert.equal(configured.success, true, configured.error);
    assert.equal(configured.mail.registrationVerificationEnabled, false,
      '测试必须覆盖服务器未全局强制邮箱的可选邮箱场景');

    const noEmail = await connect(baseUrl, '203.0.113.22'); sockets.push(noEmail);
    const noEmailRegistration = await ack(noEmail, 'user-register', {
      username: 'NoEmailMember', password: 'no-email-pass'
    });
    assert.equal(noEmailRegistration.success, true, noEmailRegistration.error);

    const legacyClient = await connect(baseUrl, '203.0.113.23'); sockets.push(legacyClient);
    const bypassAttempt = await ack(legacyClient, 'user-register', {
      username: 'StrictEmailMember', password: 'strict-email-pass', email: 'strict@example.com'
    });
    assert.equal(bypassAttempt.success, false,
      '旧客户端/API 未请求验证码时不能创建带邮箱的账号');
    assert.equal(bypassAttempt.code, 'REGISTRATION_EMAIL_CODE_INVALID');

    const requested = await ack(legacyClient, 'registration-email-code-request', {
      username: 'StrictEmailMember', email: 'strict@example.com'
    });
    assert.equal(requested.success, true, requested.error);
    const code = verificationCode(sentMails.at(-1));

    const missingCode = await ack(legacyClient, 'user-register', {
      username: 'StrictEmailMember', password: 'strict-email-pass', email: 'strict@example.com'
    });
    assert.equal(missingCode.success, false);
    assert.equal(missingCode.code, 'REGISTRATION_EMAIL_CODE_INVALID');

    const wrongCode = await ack(legacyClient, 'user-register', {
      username: 'StrictEmailMember', password: 'strict-email-pass', email: 'strict@example.com',
      emailVerificationCode: code === '000000' ? '000001' : '000000'
    });
    assert.equal(wrongCode.success, false);
    assert.equal(wrongCode.code, 'REGISTRATION_EMAIL_CODE_INVALID');

    const verified = await ack(legacyClient, 'user-register', {
      username: 'StrictEmailMember', password: 'strict-email-pass', email: 'strict@example.com',
      emailVerificationCode: code
    });
    assert.equal(verified.success, true, verified.error);
    assert.equal(verified.emailVerified, true);

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.equal(persisted.accounts.StrictEmailMember.email, 'strict@example.com');
    assert.equal(persisted.accounts.StrictEmailMember.emailVerified, true);
    assert.equal(persisted.accounts.UnavailableEmail, undefined,
      'SMTP 不可用时提交的邮箱账号不得落库');

    console.log('registration email verification enforcement regression passed');
  } finally {
    for (const socket of sockets) socket.disconnect();
    await server?.close().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('registration email verification regression failed:', error);
  process.exitCode = 1;
});
