'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { startSyncWatchServer, _test } = require('../server');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

(async () => {
  assert.equal(_test.downloadMimeType('client.exe'), 'application/vnd.microsoft.portable-executable');
  assert.match(_test.attachmentContentDisposition('中文客户端.exe'), /filename\*=UTF-8''/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-download-path-'));
  const unicodeRoot = path.join(tempRoot, '中文【服务器目录】');
  const dataDir = path.join(unicodeRoot, 'SyncWatch-Data');
  const clientPath = path.join(unicodeRoot, '客户端.exe');
  const apkPath = path.join(unicodeRoot, '安卓客户端.apk');
  const clientPayload = Buffer.from('syncwatch-client-download-payload');
  const apkPayload = Buffer.from('syncwatch-android-download-payload');
  fs.mkdirSync(unicodeRoot, { recursive: true });
  fs.writeFileSync(clientPath, clientPayload);
  fs.writeFileSync(apkPath, apkPayload);

  let controller = null;
  try {
    const port = await freePort();
    controller = await startSyncWatchServer({
      host: '127.0.0.1', port, strictPort: true, dataDir,
      publicDir: path.join(__dirname, '..', 'public'), clientDownloadPath: clientPath,
      androidApkPath: apkPath, discovery: false
    });
    const base = `http://127.0.0.1:${controller.port}`;

    const clientResponse = await fetch(`${base}/api/client-download`);
    assert.equal(clientResponse.status, 200);
    assert.equal(clientResponse.headers.get('accept-ranges'), 'bytes');
    assert.equal(clientResponse.headers.get('content-length'), String(clientPayload.length));
    assert.deepEqual(Buffer.from(await clientResponse.arrayBuffer()), clientPayload);

    const rangeResponse = await fetch(`${base}/api/client-download`, { headers: { Range: 'bytes=2-7' } });
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get('content-range'), `bytes 2-7/${clientPayload.length}`);
    assert.deepEqual(Buffer.from(await rangeResponse.arrayBuffer()), clientPayload.subarray(2, 8));

    const apkResponse = await fetch(`${base}/api/android-apk`);
    assert.equal(apkResponse.status, 200);
    assert.equal(apkResponse.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.deepEqual(Buffer.from(await apkResponse.arrayBuffer()), apkPayload);
  } finally {
    await controller?.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('Unicode Windows paths, full downloads, and HTTP Range downloads passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
