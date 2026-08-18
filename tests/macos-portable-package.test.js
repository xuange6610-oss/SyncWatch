require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const portable = require('../scripts/build-macos-portable');

function crc32Unsigned(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(buffer, value, offset) { buffer.writeUInt16LE(value, offset); }
function writeUInt32(buffer, value, offset) { buffer.writeUInt32LE(value >>> 0, offset); }

function createStoredZip(file, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const bytes = Buffer.from(entry.contents || '');
    const crc = crc32Unsigned(bytes);
    const local = Buffer.alloc(30 + name.length);
    writeUInt32(local, 0x04034b50, 0);
    writeUInt16(local, 20, 4);
    writeUInt16(local, 0x800, 6);
    writeUInt16(local, 0, 8);
    writeUInt16(local, 0, 10);
    writeUInt16(local, 0, 12);
    writeUInt32(local, crc, 14);
    writeUInt32(local, bytes.length, 18);
    writeUInt32(local, bytes.length, 22);
    writeUInt16(local, name.length, 26);
    writeUInt16(local, 0, 28);
    name.copy(local, 30);
    chunks.push(local, bytes);
    const record = Buffer.alloc(46 + name.length);
    writeUInt32(record, 0x02014b50, 0);
    writeUInt16(record, (3 << 8) | 20, 4);
    writeUInt16(record, 20, 6);
    writeUInt16(record, 0x800, 8);
    writeUInt16(record, 0, 10);
    writeUInt16(record, 0, 12);
    writeUInt16(record, 0, 14);
    writeUInt32(record, crc, 16);
    writeUInt32(record, bytes.length, 20);
    writeUInt32(record, bytes.length, 24);
    writeUInt16(record, name.length, 28);
    writeUInt16(record, 0, 30);
    writeUInt16(record, 0, 32);
    writeUInt16(record, 0, 34);
    writeUInt16(record, 0, 36);
    writeUInt32(record, (entry.mode || 0o100644) << 16, 38);
    writeUInt32(record, offset, 42);
    name.copy(record, 46);
    central.push(record);
    offset += local.length + bytes.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((size, entry) => size + entry.length, 0);
  const ending = Buffer.alloc(22);
  writeUInt32(ending, 0x06054b50, 0);
  writeUInt16(ending, 0, 4);
  writeUInt16(ending, 0, 6);
  writeUInt16(ending, entries.length, 8);
  writeUInt16(ending, entries.length, 10);
  writeUInt32(ending, centralSize, 12);
  writeUInt32(ending, centralOffset, 16);
  writeUInt16(ending, 0, 20);
  fs.writeFileSync(file, Buffer.concat([...chunks, ...central, ending]));
}

function findMode(file, name) {
  const data = fs.readFileSync(file);
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = data.readUInt32LE(eocd + 16);
  const count = data.readUInt16LE(eocd + 10);
  for (let index = 0; index < count; index += 1) {
    const length = data.readUInt16LE(offset + 28);
    const extra = data.readUInt16LE(offset + 30);
    const comment = data.readUInt16LE(offset + 32);
    const actual = data.subarray(offset + 46, offset + 46 + length).toString('utf8');
    if (actual === name) {
      return {
        host: data.readUInt16LE(offset + 4) >>> 8,
        mode: data.readUInt32LE(offset + 38) >>> 16
      };
    }
    offset += 46 + length + extra + comment;
  }
  return null;
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-macos-portable-test-'));
try {
  const appName = 'SyncWatch同步观影-服务器.app';
  const fixture = path.join(temp, 'fixture.zip');
  createStoredZip(fixture, [
    { name: `${appName}/Contents/MacOS/Electron`, contents: 'binary', mode: 0o100644 },
    { name: `${appName}/Contents/Resources/app.asar`, contents: 'asar', mode: 0o100644 },
    { name: `${appName}/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg`, contents: 'ffmpeg', mode: 0o100644 },
    { name: `${appName}/Contents/Resources/vendor/cloudflared-darwin-x64`, contents: 'cloudflared', mode: 0o100644 },
    { name: `${appName}/Contents/Frameworks/Current`, contents: 'Versions/A', mode: 0o120777 }
  ]);
  portable.patchZipModes(fixture, appName);
  assert.deepEqual(findMode(fixture, `${appName}/Contents/MacOS/Electron`), { host: 3, mode: 0o100755 });
  assert.deepEqual(findMode(fixture, `${appName}/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg`), { host: 3, mode: 0o100755 });
  assert.deepEqual(findMode(fixture, `${appName}/Contents/Resources/vendor/cloudflared-darwin-x64`), { host: 3, mode: 0o100755 });
  assert.deepEqual(findMode(fixture, `${appName}/Contents/Frameworks/Current`), { host: 3, mode: 0o120777 });

  const info = portable.updateInfoPlist(Buffer.from('<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>'), 'client');
  const parsed = require('plist').parse(info.toString('utf8'));
  assert.equal(parsed.CFBundleExecutable, 'Electron');
  assert.equal(parsed.CFBundleDisplayName, 'SyncWatch同步观影-客户端');
  assert.equal(parsed.CFBundleShortVersionString, portable.VERSION);
  assert.equal(parsed.NSAppTransportSecurity.NSAllowsLocalNetworking, true);

  const source = fs.readFileSync(path.join(root, 'scripts', 'build-macos-portable.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'scripts', 'build-macos.sh'), 'utf8');
  assert.match(source, /downloadArtifact\(\{[\s\S]*platform: 'darwin'/);
  assert.match(source, /createPackageWithOptions/);
  assert.match(source, /cloudflared-darwin-\$\{arch\}/);
  assert.match(source, /ffmpeg-static/);
  assert.match(source, /ffprobe-static/);
  assert.match(source, /app\.asar\.unpacked/);
  assert.match(source, /initializeProxy/);
  assert.doesNotMatch(source, /\.dmg/);
  assert.match(shell, /build-macos-portable\.js/);
  assert.match(shell, /DMG、Developer ID 签名和 Apple 公证/);

  const cloudScript = fs.readFileSync(path.join(root, 'scripts', 'prepare-cloudflared-macos.js'), 'utf8');
  assert.match(cloudScript, /curlBytes/);
  assert.doesNotMatch(cloudScript, /process\.platform !== 'darwin'/);

  console.log('macOS portable app ZIP packaging contract tests passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
