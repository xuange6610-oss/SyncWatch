'use strict';

require('./epipe-guard');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let activePublicUrl = '';
const probeCredentials = { username: 'ProtocolProbeShared', password: 'probe-pass-123' };
let probeAccountCreated = false;

async function waitForPublicUrl(getUrl, timeoutMs = 90000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    const publicUrl = getUrl();
    if (publicUrl) {
      try {
        const response = await fetch(`${publicUrl}/api/public-config`, { signal: AbortSignal.timeout(10000) });
        if (response.ok) return publicUrl;
        lastError = `HTTP ${response.status}`;
      } catch (error) { lastError = error.message; }
    }
    await delay(1000);
  }
  throw new Error(`公网地址验证超时：${lastError || '尚未生成地址'}`);
}

async function socketPing(socket, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setTimeout(() => reject(new Error(`network-ping 超时（connected=${socket.connected} transport=${socket.io.engine?.transport?.name || ''}）`)), timeoutMs);
    socket.emit('network-ping', { sentAt: startedAt }, (result) => {
      clearTimeout(timer);
      if (!result?.success) reject(new Error(result?.error || 'network-ping 失败'));
      else resolve(Date.now() - startedAt);
    });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000).then(() => { try { child.kill('SIGKILL'); } catch (_) {} })
  ]);
}

async function diagnose(protocol, serverPort, binary) {
  let publicUrl = '';
  let output = '';
  let probeRoomId = '';
  let probeUsername = '';
  let localSocket = null;
  const child = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${serverPort}`, '--protocol', protocol, '--no-autoupdate'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const capture = (data) => {
    output = `${output}${data}`.slice(-30000);
    publicUrl ||= output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] || '';
    if (publicUrl) activePublicUrl = publicUrl;
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  try {
    const verifiedUrl = await waitForPublicUrl(() => publicUrl);
    const localUrl = `http://127.0.0.1:${serverPort}`;
    localSocket = io(localUrl, { transports: ['websocket'], upgrade: false, forceNew: true, reconnection: false, timeout: 15000 });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('本机诊断登录连接超时')), 20000);
        localSocket.once('connect', () => { clearTimeout(timer); resolve(); });
        localSocket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      });
      const login = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('本机服务器主机登录超时')), 20000);
        localSocket.emit('host-admin-login', {
          adminPassword: 'admin888', hostToken: 'protocol-diagnostic', deviceId: `protocol-${protocol}`
        }, (result) => { clearTimeout(timer); resolve(result); });
      });
      if (!login?.success) throw new Error(login?.error || '本机服务器主机登录失败');
      if (login.capabilities?.agreementRequired) {
        const agreement = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('本机使用协议确认超时')), 10000);
          localSocket.emit('agreement-accept', { accepted: true, version: login.agreement?.version }, (result) => {
            clearTimeout(timer); resolve(result);
          });
        });
        if (!agreement?.success) throw new Error(agreement?.error || '本机使用协议确认失败');
      }
      probeRoomId = login.room?.id || login.user?.roomId || login.roomId || '';
      if (!probeRoomId) throw new Error('本机诊断登录没有返回房间号');
      probeUsername = probeCredentials.username;
      if (!probeAccountCreated) {
        const registration = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('本机诊断账号注册超时')), 20000);
          localSocket.emit('user-register', { username: probeCredentials.username, password: probeCredentials.password, deviceId: `register-${protocol}` }, (result) => {
            clearTimeout(timer); resolve(result);
          });
        });
        if (!registration?.success && !/已存在/.test(String(registration?.error || ''))) throw new Error(registration?.error || '本机诊断账号注册失败');
        probeAccountCreated = true;
      }
      const statusResponse = await fetch(`${localUrl}/api/host/tunnel/status`, {
        headers: { Authorization: `Bearer ${login.token}` }, signal: AbortSignal.timeout(10000)
      });
      if (!statusResponse.ok) throw new Error(`登记公网地址失败：HTTP ${statusResponse.status}`);
    const socket = io(verifiedUrl, {
      transports: ['websocket'], upgrade: false, forceNew: true, reconnection: false,
      timeout: 30000, extraHeaders: { Origin: verifiedUrl }
    });
    const disconnects = [];
    socket.on('disconnect', (reason, details) => disconnects.push({ reason, message: details?.message || '' }));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), 45000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
    });
    const latencies = [];
    try {
      const login = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('公网诊断账号登录超时')), 20000);
        socket.emit('user-login', { username: probeUsername, password: probeCredentials.password, roomId: probeRoomId, deviceId: `remote-login-${protocol}` }, (result) => {
          clearTimeout(timer); resolve(result);
        });
      });
      if (!login?.success) throw new Error(login?.error || '公网诊断账号登录失败');
      if (login.capabilities?.agreementRequired) {
        const agreement = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('公网使用协议确认超时')), 10000);
          socket.emit('agreement-accept', { accepted: true, version: login.agreement?.version }, (result) => {
            clearTimeout(timer); resolve(result);
          });
        });
        if (!agreement?.success) throw new Error(agreement?.error || '公网使用协议确认失败');
      }
      for (let index = 0; index < 5; index += 1) {
        latencies.push(await socketPing(socket));
        await delay(500);
      }
      return {
        protocol, success: true, publicUrl: verifiedUrl, transport: socket.io.engine.transport.name,
        latencies, disconnects, selectedProtocol: output.match(/protocol=(quic|http2)/i)?.[1]?.toLowerCase() || '',
        logTail: output.split(/\r?\n/).filter(Boolean).slice(-8)
      };
    } finally { socket.close(); localSocket?.close(); }
  } catch (error) {
    localSocket?.close();
    return {
      protocol, success: false, error: error.message, publicUrl,
      selectedProtocol: output.match(/protocol=(quic|http2)/i)?.[1]?.toLowerCase() || '',
      logTail: output.split(/\r?\n/).filter(Boolean).slice(-12)
    };
  } finally { activePublicUrl = ''; await stopChild(child); }
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-tunnel-protocol-'));
  const binary = path.resolve(__dirname, '..', 'vendor', 'cloudflared.exe');
  if (!fs.existsSync(binary)) throw new Error('缺少 vendor/cloudflared.exe');
  const server = await startSyncWatchServer({
    host: '127.0.0.1', port: 0, dataDir, publicDir: path.resolve(__dirname, '..', 'public'),
    ffprobePath: '', ffmpegPath: '', hostControlToken: 'protocol-diagnostic',
    tunnelManager: {
      status: async () => activePublicUrl
        ? { state: 'running', publicUrl: activePublicUrl }
        : { state: 'stopped', publicUrl: '' },
      stop: async () => ({ state: 'stopped', publicUrl: '' })
    }
  });
  try {
    const results = [];
    for (const protocol of ['http2', 'auto']) {
      console.log(`\n=== ${protocol} ===`);
      const result = await diagnose(protocol, server.port, binary);
      results.push(result);
      console.log(JSON.stringify(result, null, 2));
      await delay(1500);
    }
    console.log(`TUNNEL_PROTOCOL_RESULTS=${JSON.stringify(results)}`);
    if (!results.some((result) => result.success)) process.exitCode = 1;
  } finally {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
