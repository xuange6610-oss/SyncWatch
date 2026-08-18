'use strict';

require('./epipe-guard');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

const repositoryRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repositoryRoot, 'public');

function emitAck(socket, event, payload = {}, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: '服务器未返回结果' });
    });
  });
}

function nextEvent(socket, event, predicate = null, timeout = 3000) {
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

async function acceptAgreement(socket, login) {
  if (!login?.success || !login.capabilities?.agreementRequired) return login;
  const accepted = await emitAck(socket, 'agreement-accept', {
    accepted: true,
    version: login.agreement?.version
  });
  assert.equal(accepted.success, true, accepted.error);
  return login;
}

function assertFrontendContract() {
  const indexSource = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const scriptSource = fs.readFileSync(path.join(publicDir, 'js', 'avatar-tools.js'), 'utf8');
  const styleSource = fs.readFileSync(path.join(publicDir, 'css', 'avatar-tools.css'), 'utf8');
  const androidBuildSource = fs.readFileSync(path.join(repositoryRoot, 'mobile', 'build-apk.ps1'), 'utf8');

  assert.match(indexSource, /href="\/css\/avatar-tools\.css"/);
  assert.match(indexSource, /src="\/js\/avatar-tools\.js"/);
  assert.match(scriptSource, /DEFAULT_AVATAR_COUNT\s*=\s*100/);
  assert.match(scriptSource, /\/default-avatar\/\$\{id\}\.svg/);
  assert.match(scriptSource, /profileAvatarInput/);
  assert.match(scriptSource, /data-profile-action=["']save-profile["']/);
  assert.match(scriptSource, /MutationObserver/);
  assert.match(scriptSource, /data-avatar-search/);
  assert.match(scriptSource, /data-avatar-group/);
  assert.match(scriptSource, /dblclick/);
  assert.match(scriptSource, /keydown/);
  assert.match(scriptSource, /Escape/);
  assert.match(scriptSource, /avatar-preview-close/);
  assert.match(styleSource, /\.avatar-preview-overlay\s*\{/);
  assert.match(styleSource, /position:\s*fixed/);
  assert.match(styleSource, /@media\s*\(max-width:\s*720px\)/);
  assert.match(androidBuildSource, /assets\/syncwatch\/public\/js\/avatar-tools\.js/);
  assert.match(androidBuildSource, /assets\/syncwatch\/public\/css\/avatar-tools\.css/);
}

async function main() {
  assertFrontendContract();

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-default-avatar-'));
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir,
      hostControlToken: 'default-avatar-host', ffprobePath: '', ffmpegPath: '', discovery: false
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const bodies = new Set();
    for (let id = 1; id <= 100; id += 1) {
      const response = await fetch(`${baseUrl}/default-avatar/${id}.svg`);
      assert.equal(response.status, 200, `默认头像 ${id} 应可访问`);
      assert.match(response.headers.get('content-type') || '', /^image\/svg\+xml\b/i);
      assert.match(response.headers.get('cache-control') || '', /max-age=31536000/);
      assert.match(response.headers.get('cache-control') || '', /immutable/);
      const body = await response.text();
      assert.match(body, /^<svg\b/);
      assert.match(body, new RegExp(`data-avatar-id="${id}"`));
      assert.ok(body.length > 300, `默认头像 ${id} 不应为空壳 SVG`);
      bodies.add(body);
    }
    assert.equal(bodies.size, 100, '100 个默认头像必须拥有不同的 SVG 内容');

    for (const invalidPath of [
      '/default-avatar/0.svg', '/default-avatar/00.svg', '/default-avatar/01.svg',
      '/default-avatar/101.svg', '/default-avatar/-1.svg', '/default-avatar/avatar.svg',
      '/default-avatar/1.png', '/default-avatar/1.svg/extra'
    ]) {
      assert.equal((await fetch(`${baseUrl}${invalidPath}`)).status, 404, `${invalidPath} 必须返回 404`);
    }

    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    const socket = await connect(baseUrl);
    sockets.push(socket);
    assert.equal((await emitAck(socket, 'user-register', {
      username: 'AvatarOwner', password: '123456'
    })).success, true);
    const login = await acceptAgreement(socket, await emitAck(socket, 'user-login', {
      username: 'AvatarOwner', password: '123456', roomId: publicConfig.roomId,
      hostToken: 'default-avatar-host', deviceId: 'default-avatar-device'
    }));
    assert.equal(login.success, true, login.error);

    const avatarBroadcast = nextEvent(socket, 'users-list', (users) => Array.isArray(users)
      && users.some((user) => user.username === 'AvatarOwner' && user.avatar === '/default-avatar/100.svg'));
    const saved = await emitAck(socket, 'account-action', {
      action: 'update-profile', email: '', avatar: '/default-avatar/100.svg',
      signature: '默认头像测试', gender: 'private', age: ''
    });
    assert.equal(saved.success, true, saved.error);
    assert.equal(saved.profile.avatar, '/default-avatar/100.svg');
    assert.ok((await avatarBroadcast).some((user) => user.username === 'AvatarOwner'), '头像保存后应立即刷新房间成员');

    for (const invalidAvatar of [
      '/default-avatar/0.svg', '/default-avatar/01.svg', '/default-avatar/101.svg',
      '/default-avatar/1.svg?script=1', '/default-avatar/1.svg/extra'
    ]) {
      const rejected = await emitAck(socket, 'account-action', {
        action: 'update-profile', email: '', avatar: invalidAvatar,
        signature: '不应保存', gender: 'private', age: ''
      });
      assert.equal(rejected.success, false, `${invalidAvatar} 不得写入账户资料`);
      assert.equal(rejected.code, 'INVALID_AVATAR');
    }

    console.log('默认头像 100 项、严格白名单、前端选择预览与安卓资源契约通过');
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
