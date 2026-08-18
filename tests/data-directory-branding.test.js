'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveDefaultDataDir } = require('../server');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-data-branding-'));
const legacy = path.join(root, 'SyncWatch-Data');
const preferred = path.join(root, 'SyncWatch同步观影-Data');

try {
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'marker.txt'), 'existing data');
  assert.equal(resolveDefaultDataDir(root), preferred);
  assert.equal(fs.readFileSync(path.join(preferred, 'marker.txt'), 'utf8'), 'existing data');
  assert.equal(fs.existsSync(legacy), false);

  fs.rmSync(preferred, { recursive: true, force: true });
  fs.mkdirSync(legacy);
  const renameSync = fs.renameSync;
  fs.renameSync = () => { throw new Error('simulated migration failure'); };
  try { assert.equal(resolveDefaultDataDir(root), legacy); }
  finally { fs.renameSync = renameSync; }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('branded data directory migration and fallback passed.');
