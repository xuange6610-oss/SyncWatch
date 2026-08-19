'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { startSyncWatchServer } = require('../server');

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

(async () => {
  const blocker = net.createServer();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-loopback-port-'));
  let controller;
  try {
    const blockedPort = await listen(blocker, 0, '127.0.0.1');
    controller = await startSyncWatchServer({
      host: '0.0.0.0', port: blockedPort, strictPort: false, portFallbackCount: 3,
      discovery: false, dataDir
    });
    assert.notEqual(controller.port, blockedPort,
      'wildcard binding must not hide an existing 127.0.0.1 listener');
    console.log('Loopback-specific port collisions fall back to a reachable local server port.');
  } finally {
    await controller?.close();
    if (blocker.listening) await close(blocker);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
