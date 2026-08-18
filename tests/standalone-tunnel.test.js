'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { createStandaloneTunnelManager, extractPublicUrl, connectorRegistered, sanitizeEnvironment, requestPublicConfig } = require('../server/standalone-tunnel');

assert.equal(extractPublicUrl('INF https://api.trycloudflare.com/provision https://bright-river-123.trycloudflare.com'), 'https://bright-river-123.trycloudflare.com');
assert.equal(extractPublicUrl('https://api.trycloudflare.com'), '');
assert.equal(connectorRegistered('Registered tunnel connection connIndex=0'), true);
assert.equal(connectorRegistered('quick tunnel created'), false);

const originalProxy = process.env.HTTP_PROXY;
process.env.HTTP_PROXY = 'http://proxy.invalid:8080';
const directEnvironment = sanitizeEnvironment(true);
assert.equal(directEnvironment.HTTP_PROXY, undefined);
assert.equal(directEnvironment.NO_PROXY, '*');
const systemEnvironment = sanitizeEnvironment(false);
assert.equal(systemEnvironment.HTTP_PROXY, 'http://proxy.invalid:8080');
if (originalProxy === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = originalProxy;

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-standalone-tunnel-'));
  const probeServer = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ success: true }));
  });
  try {
    await new Promise((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', resolve);
    });
    const probePort = probeServer.address().port;
    const boundProbe = await requestPublicConfig(`http://127.0.0.1:${probePort}`, 2000, { localAddress: '127.0.0.1' });
    assert.equal(boundProbe.ok, true, boundProbe.error);
    const manager = createStandaloneTunnelManager({ rootDir: dataDir, dataDir, getPort: () => 5000 });
    const initial = await manager.status();
    assert.equal(initial.state, 'stopped');
    const saved = await manager.saveStartupSettings({ autoStartTunnel: false, bypassProxy: false });
    assert.equal(saved.bypassProxy, false);
    const unchanged = await manager.saveStartupSettings({ autoStartTunnel: false });
    assert.equal(unchanged.bypassProxy, false, 'omitted bypass setting should not silently toggle the proxy mode');
    const startup = await manager.startupSettings();
    assert.equal(startup.bypassProxy, false);
    console.log('standalone tunnel supervisor contract passed.');
  } finally {
    await new Promise((resolve) => probeServer.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
