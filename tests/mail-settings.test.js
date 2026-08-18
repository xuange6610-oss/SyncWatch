'use strict';

require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function emitAck(socket, event, payload = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), timeout);
    socket.emit(event, payload, (result) => { clearTimeout(timer); resolve(result || {}); });
  });
}

async function connect(baseUrl, ip = '') {
  const socket = io(baseUrl, {
    transports: ['websocket'], reconnection: false,
    transportOptions: { websocket: { extraHeaders: ip ? { 'cf-connecting-ip': ip } : {} } }
  });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}

function codeFrom(message) {
  const match = String(message?.text || '').match(/验证码：(\d{6})/);
  assert.ok(match, `邮件中未找到验证码：${message?.text || ''}`);
  return match[1];
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-mail-settings-'));
  const sentMails = [];
  const verifiedConfigs = [];
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      port: 0, host: '127.0.0.1', dataDir,
      publicDir: path.resolve(__dirname, '..', 'public'), ffmpegPath: '', ffprobePath: '', discovery: false,
      hostControlToken: 'mail-settings-host',
      mailSender: async (message) => { sentMails.push(message); return { messageId: `mail-${sentMails.length}` }; },
      mailVerifier: async ({ config }) => { verifiedConfigs.push(config); return true; }
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const manager = await connect(baseUrl); sockets.push(manager);
    assert.equal((await emitAck(manager, 'user-register', { username: 'MailManager', password: 'manager-pass' })).success, true);
    const created = await emitAck(manager, 'room-create', {
      username: 'MailManager', password: 'manager-pass', customRoomId: 'MAILSET', roomName: '邮件设置测试',
      hostToken: 'mail-settings-host', deviceId: 'mail-manager-device'
    });
    assert.equal(created.success, true, created.error);
    if (created.capabilities?.agreementRequired) {
      const accepted = await emitAck(manager, 'agreement-accept', { accepted: true, version: created.agreement.version });
      assert.equal(accepted.success, true, accepted.error);
    }

    const secret = 'SMTP_GENERIC_SECRET_2026';
    const templates = {
      'verification:zh-CN': {
        subject: '[{{site_name}}] 自定义{{action_name}}验证码',
        html: '<!doctype html><html><head><meta charset="UTF-8"></head><body><h1>{{action_name}}</h1><p>{{recipient_name}}</p><strong>{{verification_code}}</strong><p>{{expires_in_minutes}} 分钟内有效</p></body></html>'
      }
    };
    const saved = await emitAck(manager, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      host: 'smtp.example.com', port: 587, secure: false, useTls: true,
      user: 'smtp-user@example.com', password: secret, recoveryEmail: 'admin-recovery@example.com', fromEmail: 'noreply@example.com', fromName: 'SyncWatch同步观影 测试',
      registrationVerificationEnabled: true, bindingVerificationEnabled: true,
      accountRecoveryEnabled: true, adminRecoveryEnabled: true, defaultLocale: 'zh-CN', templates
    });
    assert.equal(saved.success, true, saved.error);
    assert.equal(saved.mail.host, 'smtp.example.com');
    assert.equal(saved.mail.port, 587);
    assert.equal(saved.mail.secure, false);
    assert.equal(saved.mail.useTls, true);
    assert.equal(saved.mail.registrationVerificationEnabled, true);
    assert.equal(saved.mail.recoveryEmail, 'admin-recovery@example.com');
    assert.equal(Object.hasOwn(saved.mail, 'encryptedAuthCode'), false);

    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    assert.equal(publicConfig.registrationEmailVerificationRequired, true);
    assert.equal(publicConfig.passwordRecoveryAvailable, true);
    assert.equal(publicConfig.emailBindingAvailable, true);

    const connection = await emitAck(manager, 'admin-action', { action: 'test-mail-connection', adminPassword: 'admin888' });
    assert.equal(connection.success, true, connection.error);
    assert.equal(verifiedConfigs.at(-1).host, 'smtp.example.com');
    assert.equal(verifiedConfigs.at(-1).useTls, true);
    assert.equal(verifiedConfigs.at(-1).password, secret);

    const testMail = await emitAck(manager, 'admin-action', {
      action: 'test-mail-settings', adminPassword: 'admin888', recipient: 'delivery@example.com'
    });
    assert.equal(testMail.success, true, testMail.error);
    assert.equal(sentMails.at(-1).to, 'delivery@example.com');
    assert.equal(sentMails.at(-1).config.fromEmail, 'noreply@example.com');

    const adminRecoverySocket = await connect(baseUrl); sockets.push(adminRecoverySocket);
    const dedicatedRecoveryCount = sentMails.length;
    assert.equal((await emitAck(adminRecoverySocket, 'password-reset-request', { scope: 'admin', identifier: '' })).success, true);
    for (let index = 0; index < 100 && sentMails.length === dedicatedRecoveryCount; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sentMails.at(-1)?.to, 'admin-recovery@example.com', '管理员找回应发送到专用恢复邮箱，而不是发件人别名');

    const fallbackSettings = await emitAck(manager, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      host: 'smtp.example.com', port: 587, secure: false, useTls: true,
      user: 'smtp-user@example.com', fromEmail: 'noreply@example.com', recoveryEmail: '', fromName: 'SyncWatch同步观影 测试',
      registrationVerificationEnabled: true, bindingVerificationEnabled: true,
      accountRecoveryEnabled: true, adminRecoveryEnabled: true, defaultLocale: 'zh-CN', templates: saved.mail.templates
    });
    assert.equal(fallbackSettings.success, true, fallbackSettings.error);
    const fallbackRecoveryCount = sentMails.length;
    assert.equal((await emitAck(adminRecoverySocket, 'password-reset-request', { scope: 'admin', identifier: '' })).success, true);
    for (let index = 0; index < 100 && sentMails.length === fallbackRecoveryCount; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(sentMails.at(-1)?.to, 'smtp-user@example.com', '未填写专用恢复邮箱时应回退 SMTP 登录邮箱');

    const candidate = await connect(baseUrl, '203.0.113.77'); sockets.push(candidate);
    const requested = await emitAck(candidate, 'registration-email-code-request', {
      username: 'VerifiedUser', email: 'verified@example.com'
    });
    assert.equal(requested.success, true, requested.error);
    const registrationMail = sentMails.findLast((message) => message.to === 'verified@example.com');
    assert.match(registrationMail.subject, /自定义注册邮箱验证码/);
    const code = codeFrom(registrationMail);
    const missing = await emitAck(candidate, 'user-register', {
      username: 'VerifiedUser', password: 'verified-pass', email: 'verified@example.com'
    });
    assert.equal(missing.code, 'REGISTRATION_EMAIL_CODE_INVALID');
    const registered = await emitAck(candidate, 'user-register', {
      username: 'VerifiedUser', password: 'verified-pass', email: 'verified@example.com', emailVerificationCode: code
    });
    assert.equal(registered.success, true, registered.error);
    assert.equal(registered.emailVerified, true);

    const recoveryCount = sentMails.length;
    assert.equal((await emitAck(candidate, 'password-reset-request', { scope: 'account', identifier: 'VerifiedUser' })).success, true);
    for (let index = 0; index < 100 && sentMails.length === recoveryCount; index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(sentMails.length > recoveryCount);
    assert.match(sentMails.at(-1).subject, /密码重置验证码/);

    const unsafe = await emitAck(manager, 'admin-action', {
      action: 'set-mail-settings', adminPassword: 'admin888', enabled: true,
      host: 'smtp.example.com', port: 587, secure: false, useTls: true,
      user: 'smtp-user@example.com', fromEmail: 'noreply@example.com', fromName: 'SyncWatch同步观影 测试',
      registrationVerificationEnabled: true, templates: {
        ...saved.mail.templates,
        'verification:zh-CN': { subject: 'unsafe', html: '<script>alert(1)</script>' }
      }
    });
    assert.equal(unsafe.success, false);
    assert.match(unsafe.error, /不能包含/);

    const restored = await emitAck(manager, 'admin-action', {
      action: 'restore-mail-template', adminPassword: 'admin888', event: 'verification', locale: 'zh-CN'
    });
    assert.equal(restored.success, true, restored.error);
    assert.match(restored.template.subject, /\{\{action_name\}\}/);

    const persistedText = fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8');
    assert.equal(persistedText.includes(secret), false);
    const persisted = JSON.parse(persistedText);
    assert.match(persisted.admin.mail.encryptedAuthCode, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
    assert.equal(persisted.accounts.VerifiedUser.emailVerified, true);

    // A lost mail encryption key must not leave registration advertised as
    // available while every verification code is undeliverable.
    for (const socket of sockets) socket.disconnect();
    sockets.length = 0;
    await server.close();
    server = null;
    fs.rmSync(path.join(dataDir, '.secrets', 'mail.key'), { force: true });
    server = await startSyncWatchServer({
      port: 0, host: '127.0.0.1', dataDir,
      publicDir: path.resolve(__dirname, '..', 'public'), ffmpegPath: '', ffprobePath: '', discovery: false,
      hostControlToken: 'mail-settings-host',
      mailSender: async (message) => { sentMails.push(message); return { messageId: `mail-restarted-${sentMails.length}` }; }
    });
    const restartedUrl = `http://127.0.0.1:${server.port}`;
    const brokenMailClient = await connect(restartedUrl); sockets.push(brokenMailClient);
    const publicAfterKeyLoss = await (await fetch(`${restartedUrl}/api/public-config`)).json();
    assert.equal(publicAfterKeyLoss.registrationEmailVerificationRequired, false);
    const unavailableCode = await emitAck(brokenMailClient, 'registration-email-code-request', {
      username: 'BrokenMailUser', email: 'broken-mail@example.com'
    });
    assert.equal(unavailableCode.success, false);
    assert.equal(unavailableCode.code, 'REGISTRATION_EMAIL_SMTP_UNAVAILABLE');
    const unavailableRegistration = await emitAck(brokenMailClient, 'user-register', {
      username: 'BrokenMailUser', email: 'broken-mail@example.com', password: 'broken-mail-pass'
    });
    assert.equal(unavailableRegistration.success, false);
    assert.equal(unavailableRegistration.code, 'REGISTRATION_EMAIL_SMTP_UNAVAILABLE');
    console.log('✓ 通用 SMTP、TLS、加密凭据、注册验证、密码找回、模板预览边界与恢复官方模板通过');
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
