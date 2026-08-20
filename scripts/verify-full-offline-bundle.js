'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'release', 'offline-bundle');
const expected = [
  ['windows/SyncWatch同步观影-Client-v2.1.9.exe', 50 * 1024 * 1024],
  ['android/SyncWatch同步观影-v2.1.9.apk', 50 * 1024 * 1024],
  ['mac/SyncWatch同步观影-服务器-v2.1.9-x64.zip', 100 * 1024 * 1024],
  ['mac/SyncWatch同步观影-服务器-v2.1.9-arm64.zip', 100 * 1024 * 1024],
  ['mac/SyncWatch同步观影-客户端-v2.1.9-x64.zip', 100 * 1024 * 1024],
  ['mac/SyncWatch同步观影-客户端-v2.1.9-arm64.zip', 100 * 1024 * 1024]
];

let total = 0;
for (const [relative, minimum] of expected) {
  const filename = path.join(root, ...relative.split('/'));
  assert.ok(fs.existsSync(filename), `Full offline bundle is missing ${relative}`);
  const size = fs.statSync(filename).size;
  assert.ok(size >= minimum, `Full offline bundle file is unexpectedly small: ${relative} (${size} bytes)`);
  total += size;
}
assert.ok(total >= 900 * 1024 * 1024, `Full offline payload is unexpectedly small (${total} bytes)`);
console.log(`Full offline bundle verified: ${expected.length} platform files, ${total} bytes.`);
