'use strict';

// Cross-platform macOS publisher.
//
// Electron's macOS DMG target requires a macOS host (and signing requires an
// Apple Developer identity).  An unsigned .app ZIP is still a useful, real
// macOS artifact for LAN/public downloads, so this script builds that ZIP on
// Windows/Linux as well.  It starts from Electron's official Darwin ZIP,
// preserving its framework symlinks and executable bits, then replaces only
// the application payload.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plist = require('plist');
const { spawnSync } = require('child_process');
const { downloadArtifact, initializeProxy } = require('@electron/get');
const { createPackageWithOptions } = require('@electron/asar');
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip');

const ROOT = path.resolve(__dirname, '..');
const VERSION = String(require(path.join(ROOT, 'package.json')).version);
const ELECTRON_VERSION = String(require(path.join(ROOT, 'package.json')).devDependencies.electron);
const CANONICAL_ARCHES = ['x64', 'arm64'];

const labels = {
  server: '服务器',
  client: '客户端'
};

function fail(message) {
  throw new Error(`[macOS portable] ${message}`);
}

function ensureFile(file, description) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size <= 0) {
    fail(`missing or empty ${description}: ${file}`);
  }
}

function rmSafe(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyTree(source, target) {
  fs.cpSync(source, target, { recursive: true, force: true, dereference: false });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: options.env || process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed (${result.status}): ${String(result.stderr || result.stdout || '').trim()}`);
  }
  return result;
}

function readEntry(sevenZip, archivePath, entryName) {
  const result = spawnSync(sevenZip, ['e', '-so', archivePath, entryName], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`unable to read ${entryName} from ${archivePath}: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeFile(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

function updateInfoPlist(bytes, kind) {
  const info = plist.parse(bytes.toString('utf8'));
  const label = labels[kind];
  info.CFBundleDisplayName = `SyncWatch同步观影-${label}`;
  info.CFBundleName = `SyncWatch同步观影-${label}`;
  info.CFBundleIdentifier = `com.tangjingxuan.syncwatch.${kind}`;
  info.CFBundleShortVersionString = VERSION;
  info.CFBundleVersion = VERSION;
  info.LSApplicationCategoryType = 'public.app-category.entertainment';
  info.NSHighResolutionCapable = true;
  info.NSAppTransportSecurity = {
    ...(info.NSAppTransportSecurity || {}),
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true
  };
  info.NSMicrophoneUsageDescription = 'SyncWatch同步观影 需要麦克风权限用于房间语音和桌面共享语音。';
  info.NSCameraUsageDescription = 'SyncWatch同步观影 需要摄像头权限用于实时互动。';
  info.NSLocationWhenInUseUsageDescription = 'SyncWatch同步观影 仅在您授权后向当前房间显示位置。';
  info.NSScreenCaptureUsageDescription = 'SyncWatch同步观影 需要屏幕录制权限用于共享桌面画面与声音。';
  return Buffer.from(plist.build(info), 'utf8');
}

function prepareSource(kind, arch, stagingRoot) {
  const source = path.join(stagingRoot, 'source');
  fs.mkdirSync(source, { recursive: true });
  const copy = (relative) => {
    const from = path.join(ROOT, relative);
    if (!fs.existsSync(from)) fail(`required source file is missing: ${relative}`);
    copyTree(from, path.join(source, relative));
  };

  if (kind === 'client') {
    for (const relative of ['electron-client.js', 'electron-client-preload.js', 'client-launcher.html', 'assets/app-icon.png']) copy(relative);
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    packageJson.main = 'electron-client.js';
    packageJson.name = 'syncwatch-client';
    packageJson.scripts = {};
    packageJson.dependencies = {};
    packageJson.devDependencies = {};
    writeFile(path.join(source, 'package.json'), Buffer.from(JSON.stringify(packageJson, null, 2), 'utf8'));
    return source;
  }

  for (const relative of [
    'electron-pink.js', 'electron-main-preload.js', 'electron-settings-preload.js',
    'server/index.js', 'server/ai-relay.js', 'server/macos-distribution.js',
    'public', 'assets/app-icon.png'
  ]) copy(relative);

  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packagedPackageJson = { ...packageJson };
  // Keep the original dependency manifest during npm ci so the lockfile can
  // be validated exactly.  The trimmed manifest is written only afterwards.
  const lockPath = path.join(ROOT, 'package-lock.json');
  if (!fs.existsSync(lockPath)) fail('package-lock.json is required to create a reproducible server app');
  copyTree(path.join(ROOT, 'package.json'), path.join(source, 'package.json'));
  copyTree(lockPath, path.join(source, 'package-lock.json'));
  const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const npmArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd', 'ci', '--omit=dev', '--no-audit', '--no-fund']
    : ['ci', '--omit=dev', '--no-audit', '--no-fund'];
  run(npmCommand, npmArgs, {
    cwd: source,
    env: { ...process.env, npm_config_platform: 'darwin', npm_config_arch: arch }
  });

  packagedPackageJson.main = 'electron-pink.js';
  packagedPackageJson.name = 'syncwatch-server';
  packagedPackageJson.scripts = {};
  packagedPackageJson.devDependencies = {};
  writeFile(path.join(source, 'package.json'), Buffer.from(JSON.stringify(packagedPackageJson, null, 2), 'utf8'));
  rmSafe(path.join(source, 'package-lock.json'));

  const ffprobeRoot = path.join(source, 'node_modules', 'ffprobe-static', 'bin');
  for (const platform of ['linux', 'win32']) rmSafe(path.join(ffprobeRoot, platform));
  for (const otherArch of CANONICAL_ARCHES.filter((candidate) => candidate !== arch)) {
    rmSafe(path.join(ffprobeRoot, 'darwin', otherArch));
  }
  const ffmpeg = path.join(source, 'node_modules', 'ffmpeg-static', 'ffmpeg');
  ensureFile(ffmpeg, `Darwin ${arch} ffmpeg`);
  const ffprobe = path.join(ffprobeRoot, 'darwin', arch, 'ffprobe');
  ensureFile(ffprobe, `Darwin ${arch} ffprobe`);

  const apk = path.join(ROOT, 'mobile', `SyncWatch同步观影-v${VERSION}.apk`);
  if (fs.existsSync(apk)) copyTree(apk, path.join(source, 'mobile', path.basename(apk)));
  return source;
}

function zipEntries(archivePath) {
  const data = fs.readFileSync(archivePath);
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) fail(`invalid ZIP without EOCD: ${archivePath}`);
  const count = data.readUInt16LE(eocd + 10);
  let offset = data.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) fail(`invalid central directory entry in ${archivePath}`);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    entries.push({
      fileName: data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
      externalFileAttributes: data.readUInt32LE(offset + 38)
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function patchZipModes(archivePath, appName) {
  const data = fs.readFileSync(archivePath);
  const eocd = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) fail(`invalid ZIP without EOCD: ${archivePath}`);
  const count = data.readUInt16LE(eocd + 10);
  const centralOffset = data.readUInt32LE(eocd + 16);
  let offset = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) fail(`invalid central directory entry in ${archivePath}`);
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const normalizedName = name.replace(/\\/g, '/');
    const madeBy = data.readUInt16LE(offset + 4);
    const existingAttrs = data.readUInt32LE(offset + 38);
    const existingMode = existingAttrs >>> 16;
    const isAddedPayload = /\/Contents\/Resources\/app\.asar\.unpacked\//.test(normalizedName)
      || /\/Contents\/Resources\/vendor\/cloudflared-darwin-(x64|arm64)$/.test(normalizedName);
    const isDirectory = normalizedName.endsWith('/');
    const isExecutable = isAddedPayload || /\/Contents\/MacOS\//.test(normalizedName);
    const typeBits = existingMode & 0xf000;
    let mode = existingMode;
    if (isDirectory) mode = 0o040755;
    else if (isExecutable) mode = 0o100755;
    else if (!mode || typeBits !== 0o100000 && typeBits !== 0o120000 && typeBits !== 0o040000) mode = 0o100644;
    // ZIP external attributes encode Unix mode in the upper 16 bits.  Setting
    // the host OS to Unix makes unzip on macOS honor executable permissions.
    data.writeUInt16LE((3 << 8) | (madeBy & 0xff), offset + 4);
    data.writeUInt32LE((((mode << 16) >>> 0) | (existingAttrs & 0xffff)) >>> 0, offset + 38);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  fs.writeFileSync(archivePath, data);
}

async function makeAsar(kind, arch, stagingRoot) {
  const source = prepareSource(kind, arch, stagingRoot);
  const asarPath = path.join(stagingRoot, 'app.asar');
  const options = kind === 'server'
    ? { unpack: '**/{ffmpeg,ffprobe,*.apk}' }
    : {};
  await createPackageWithOptions(source, asarPath, options);
  return { source, asarPath, unpacked: `${asarPath}.unpacked` };
}

async function addPayload(sevenZip, archivePath, injectionRoot, paths) {
  run(sevenZip, ['a', '-tzip', '-mx=9', archivePath, ...paths], { cwd: injectionRoot });
}

async function buildArtifact(kind, arch, outputRoot, sevenZip, electronZip) {
  const label = labels[kind];
  const appName = `SyncWatch同步观影-${label}.app`;
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), `syncwatch-mac-${kind}-${arch}-`));
  const workZip = path.join(stagingRoot, `${appName}.zip`);
  const injectionRoot = path.join(stagingRoot, 'inject');
  try {
    fs.copyFileSync(electronZip, workZip);
    run(sevenZip, ['rn', workZip, 'Electron.app', appName]);
    const { asarPath, unpacked } = await makeAsar(kind, arch, stagingRoot);
    const infoPath = path.join(injectionRoot, appName, 'Contents', 'Info.plist');
    const info = updateInfoPlist(readEntry(sevenZip, workZip, `${appName}/Contents/Info.plist`), kind);
    writeFile(infoPath, info);
    const resources = path.join(injectionRoot, appName, 'Contents', 'Resources');
    writeFile(path.join(resources, 'app.asar'), fs.readFileSync(asarPath));
    if (fs.existsSync(unpacked)) copyTree(unpacked, path.join(resources, 'app.asar.unpacked'));

    if (kind === 'server') {
      const cloudflared = path.join(ROOT, 'vendor', `cloudflared-darwin-${arch}`);
      ensureFile(cloudflared, `cloudflared-darwin-${arch}`);
      writeFile(path.join(resources, 'vendor', path.basename(cloudflared)), fs.readFileSync(cloudflared));
    }

    const payloadPaths = [
      path.join(appName, 'Contents', 'Info.plist'),
      path.join(appName, 'Contents', 'Resources', 'app.asar')
    ];
    if (fs.existsSync(path.join(resources, 'app.asar.unpacked'))) payloadPaths.push(path.join(appName, 'Contents', 'Resources', 'app.asar.unpacked'));
    if (kind === 'server') payloadPaths.push(path.join(appName, 'Contents', 'Resources', 'vendor'));
    run(sevenZip, ['d', workZip, `${appName}/Contents/Info.plist`, `${appName}/Contents/Resources/default_app.asar`]);
    await addPayload(sevenZip, workZip, injectionRoot, payloadPaths);
    patchZipModes(workZip, appName);
    const entries = zipEntries(workZip);
    const names = new Set(entries.map((entry) => entry.fileName));
    if (!names.has(`${appName}/Contents/Resources/app.asar`)) fail(`app.asar missing from ${workZip}`);
    if (names.has(`${appName}/Contents/Resources/default_app.asar`)) fail(`default_app.asar was not replaced in ${workZip}`);
    const executable = entries.find((entry) => entry.fileName === `${appName}/Contents/MacOS/Electron`);
    if (!executable) fail(`Electron executable missing from ${workZip}`);
    const outputName = `SyncWatch同步观影-${label}-v${VERSION}-${arch}.zip`;
    const output = path.join(outputRoot, outputName);
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.copyFileSync(workZip, output);
    return { output, sha256: sha256(output), bytes: fs.statSync(output).size };
  } finally {
    rmSafe(stagingRoot);
  }
}

async function main() {
  // @electron/get supports HTTP(S)_PROXY through global-agent.  Initializing
  // it explicitly also fixes builds launched from PowerShell where the env
  // flag was not set before this module was loaded.
  initializeProxy();
  const outputRoot = path.resolve(process.env.SYNCWATCH_MAC_OUTPUT || path.join(ROOT, 'mac'));
  const missingCloudflared = CANONICAL_ARCHES.some((arch) => {
    const file = path.join(ROOT, 'vendor', `cloudflared-darwin-${arch}`);
    return !fs.existsSync(file) || fs.statSync(file).size < 1_000_000;
  });
  if (missingCloudflared) run(process.execPath, [path.join(ROOT, 'scripts', 'prepare-cloudflared-macos.js')], { stdio: 'inherit' });
  const sevenZip = await getPath7za();
  for (const arch of CANONICAL_ARCHES) {
    const electronZip = await downloadArtifact({
      version: ELECTRON_VERSION,
      artifactName: 'electron',
      platform: 'darwin',
      arch
    });
    for (const kind of ['server', 'client']) {
      const artifact = await buildArtifact(kind, arch, outputRoot, sevenZip, electronZip);
      console.log(`${path.basename(artifact.output)} ${artifact.bytes} bytes SHA256 ${artifact.sha256}`);
    }
  }
  console.log(`macOS unsigned app ZIPs are ready in ${outputRoot}`);
  console.log('DMG/signing/notarization remain macOS-host responsibilities.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  VERSION,
  ELECTRON_VERSION,
  labels,
  updateInfoPlist,
  patchZipModes
};
