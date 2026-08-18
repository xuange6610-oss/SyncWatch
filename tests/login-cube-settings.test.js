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
    const timer = setTimeout(() => reject(new Error(`${event} response timed out`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: 'No acknowledgement returned' });
    });
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], reconnection: false, timeout: 10000 });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

function nextEvent(socket, event, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} event timed out`)), timeout);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

async function acceptAgreement(socket, result) {
  if (result?.success && result.capabilities?.agreementRequired && result.agreement?.version) {
    const accepted = await ack(socket, 'agreement-accept', { accepted: true, version: result.agreement.version });
    assert.equal(accepted.success, true, accepted.error);
  }
  return result;
}

const customFaces = [
  { id: 'front', icon: '🎞️', title: '今晚开场', text: '登录后一起同步观看', image: 'https://images.example.test/front.webp' },
  { id: 'back', icon: '📺', title: '稳定同步', text: '播放状态保持一致', image: '' },
  { id: 'right', icon: '💬', title: '一起交流', text: '聊天与弹幕实时送达', image: '' },
  { id: 'left', icon: '🎙️', title: '实时语音', text: '观影时自然交流', image: '' },
  { id: 'top', icon: '☁️', title: '多端连接', text: '电脑网页手机同步', image: '' },
  { id: 'bottom', icon: '✨', title: 'SyncWatch同步观影', text: '轻扫立方体查看每一面', image: '' }
];

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-login-cube-'));
  const publicDir = path.resolve(__dirname, '..', 'public');
  let server;
  let admin;
  let ordinary;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir, discovery: false,
      hostControlToken: 'login-cube-host', ffmpegPath: '', ffprobePath: ''
    });
    let baseUrl = `http://127.0.0.1:${server.port}`;
    let publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    assert.deepEqual(publicConfig.loginCube.faces.map((face) => face.id), ['front', 'back', 'right', 'left', 'top', 'bottom']);

    ordinary = await connect(baseUrl);
    assert.equal((await ack(ordinary, 'user-register', { username: 'CubeViewer', password: '123456' })).success, true);
    const ordinaryLogin = await acceptAgreement(ordinary, await ack(ordinary, 'user-login', {
      username: 'CubeViewer', password: '123456', roomId: publicConfig.roomId
    }));
    assert.equal(ordinaryLogin.success, true, ordinaryLogin.error);
    assert.equal((await ack(ordinary, 'admin-action', { action: 'set-login-cube-settings', faces: customFaces })).success, false);

    admin = await connect(baseUrl);
    const adminLogin = await acceptAgreement(admin, await ack(admin, 'host-admin-login', {
      adminPassword: 'admin888', hostToken: 'login-cube-host', roomId: publicConfig.roomId
    }));
    assert.equal(adminLogin.success, true, adminLogin.error);

    const updatedEvent = nextEvent(ordinary, 'login-cube-updated');
    const saved = await ack(admin, 'admin-action', {
      action: 'set-login-cube-settings', autoRotate: true, faces: customFaces
    });
    assert.equal(saved.success, true, saved.error);
    assert.equal(saved.loginCube.faces[0].title, '今晚开场');
    assert.equal((await updatedEvent).faces[0].image, 'https://images.example.test/front.webp');

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    assert.equal((await ack(ordinary, 'admin-action', {
      action: 'set-login-cube-image', faceId: 'front', dataUrl: tinyPng
    })).success, false, 'ordinary members must not upload login cube images');
    const imageEvent = nextEvent(ordinary, 'login-cube-updated');
    const uploaded = await ack(admin, 'admin-action', {
      action: 'set-login-cube-image', faceId: 'front', dataUrl: tinyPng
    });
    assert.equal(uploaded.success, true, uploaded.error);
    assert.match(uploaded.image, /^\/login-cube-image\/front\?v=\d+$/);
    assert.equal((await imageEvent).faces[0].image, uploaded.image);
    const imageResponse = await fetch(`${baseUrl}${uploaded.image}`);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.ok((await imageResponse.arrayBuffer()).byteLength > 20);
    assert.equal((await ack(admin, 'admin-action', {
      action: 'set-login-cube-image', faceId: 'front', dataUrl: 'data:text/plain;base64,aGVsbG8='
    })).success, false);
    assert.equal((await fetch(`${baseUrl}${uploaded.image}`)).status, 200, 'a rejected replacement must keep the old image');

    const settings = await ack(admin, 'admin-action', { action: 'get-settings' });
    assert.equal(settings.admin.loginCube.faces[0].image, uploaded.image);

    ordinary.disconnect(); ordinary = null;
    admin.disconnect(); admin = null;
    await server.close(); server = null;

    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir, discovery: false,
      hostControlToken: 'login-cube-host', ffmpegPath: '', ffprobePath: ''
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
    publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    assert.equal(publicConfig.loginCube.faces[0].title, '今晚开场');
    assert.match(publicConfig.loginCube.faces[0].image, /^\/login-cube-image\/front\?v=\d+$/);
    assert.equal((await fetch(`${baseUrl}${publicConfig.loginCube.faces[0].image}`)).status, 200);

    // If the media directory is copied without the image payload, startup must
    // clear the stale local URL instead of publishing an unavoidable 404.
    fs.rmSync(path.join(dataDir, 'login-cube'), { recursive: true, force: true });
    await server.close(); server = null;
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir, discovery: false,
      hostControlToken: 'login-cube-host', ffmpegPath: '', ffprobePath: ''
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
    publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    assert.equal(publicConfig.loginCube.faces[0].image, '', 'missing local image files must be scrubbed from config');

    const appSource = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    assert.match(appSource, /loginCubeVelocityX/);
    assert.match(appSource, /requestAnimationFrame\(stepLoginCubeMotion\)/);
    assert.match(appSource, /set-login-cube-settings/);
    assert.match(html, /id="loginCubeSettingsCard"/);
    assert.match(html, /id="loginCubeSettingsGrid"/);
    console.log('Login cube inertia, six-face configuration, image upload, authorization, broadcast, and persistence passed.');
  } finally {
    ordinary?.disconnect();
    admin?.disconnect();
    if (server) await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
