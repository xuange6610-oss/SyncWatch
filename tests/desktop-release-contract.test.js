'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

const manifest = json('package.json');
const clientConfig = json('electron-builder-client.json');
const macClientConfig = json('electron-builder-mac-client.json');
const macServerConfig = json('electron-builder-mac-server.json');
const electronServer = read('electron-pink.js');
const electronClient = read('electron-client.js');
const clientPreload = read('electron-client-preload.js');
const launcher = read('client-launcher.html');
const windowsBuildPath = path.join(root, '生成EXE.ps1');
const windowsBuildBytes = fs.readFileSync(windowsBuildPath);
const windowsBuild = windowsBuildBytes.toString('utf8').replace(/^\uFEFF/, '');

const DESKTOP_NAME = '同步观影';

// Windows PowerShell 5.1 decodes BOM-less scripts using the system code page.
// Keep such scripts ASCII-only, and load localized product metadata as UTF-8.
const windowsBuildHasUtf8Bom = windowsBuildBytes.length >= 3
  && windowsBuildBytes[0] === 0xef && windowsBuildBytes[1] === 0xbb && windowsBuildBytes[2] === 0xbf;
assert.ok(windowsBuildHasUtf8Bom || !/[^\x00-\x7f]/.test(windowsBuild),
  'a BOM-less Windows PowerShell build script must not contain non-ASCII literals');
assert.match(windowsBuild, /Get-Content[^\r\n]+-Encoding UTF8[^\r\n]+package\.json/,
  'the Windows build must decode package.json explicitly as UTF-8');
assert.match(windowsBuild, /\$expectedProductName\s*=\s*\[string\]\$buildManifest\.build\.productName/,
  'the Windows build must derive its localized executable name from package.json');

// Windows/macOS metadata, Electron runtime identity, window titles and tray
// identity must all present one product name. Artifact filenames remain free to
// include the SyncWatch brand and version for distribution.
for (const config of [manifest.build, clientConfig, macClientConfig, macServerConfig]) {
  assert.equal(config.productName, DESKTOP_NAME);
}
assert.equal(manifest.description, DESKTOP_NAME);
assert.equal(manifest.build.win.executableName, DESKTOP_NAME);
assert.equal(clientConfig.win.executableName, DESKTOP_NAME);
assert.equal(clientConfig.extraMetadata.description, DESKTOP_NAME);
assert.equal(macClientConfig.extraMetadata.description, DESKTOP_NAME);
assert.match(electronServer, /app\.setName\(['"]同步观影['"]\)/);
assert.match(electronClient, /app\.setName\(['"]同步观影['"]\)/);
assert.match(electronServer, /tray\.setToolTip\(['"]同步观影['"]\)/);
assert.match(electronServer, /title:\s*['"]同步观影['"]/);
assert.match(electronClient, /title:\s*['"]同步观影['"]/);
assert.doesNotMatch(electronServer, /SyncWatch-服务器/);
assert.doesNotMatch(electronClient, /SyncWatch-客户端/);

// The standalone client launcher renders the same configurable six-face
// identity as the web login. It asks the main process to read /api/public-config
// and keeps a complete offline fallback when the configured server is absent.
for (const face of ['front', 'back', 'right', 'left', 'top', 'bottom']) {
  assert.match(launcher, new RegExp(`data-login-cube-face=["']${face}["']`));
}
assert.match(launcher, /id=["']loginCubeScene["']/);
assert.match(launcher, /id=["']loginCube["']/);
assert.match(launcher, /function\s+normalizeLoginCube\s*\(/);
assert.match(launcher, /function\s+applyLoginCube\s*\(/);
assert.match(launcher, /displayMode/);
assert.match(launcher, /rotationDirection/);
assert.match(launcher, /SyncWatchClient\.inspect\(/);
assert.match(clientPreload, /inspect:\s*\(address\)\s*=>\s*ipcRenderer\.invoke\(['"]syncwatch-client:inspect['"]/);
assert.match(electronClient, /ipcMain\.handle\(['"]syncwatch-client:inspect['"]/);
assert.match(electronClient, /new URL\(['"]\/api\/public-config['"]/);
assert.match(electronClient, /config:\s*verified\.config/);
for (const rendererResource of ['public/vendor/three/three.min.js', 'public/vendor/three/GLTFLoader.js']) {
  assert.ok(clientConfig.files.includes(rendererResource), `Windows client must package ${rendererResource}`);
  assert.ok(macClientConfig.files.includes(rendererResource), `macOS client must package ${rendererResource}`);
}

// The main desktop executable contains only its Windows server runtime. Large
// client, Android and macOS downloads are released beside it, never inside it.
const mainFiles = manifest.build.files.map(String);
const mainUnpacked = (manifest.build.asarUnpack || []).map(String);
const mainResources = (manifest.build.extraResources || []).map((entry) => String(entry.from || ''));
for (const required of [
  'electron-pink.js', 'electron-main-preload.js', 'electron-settings-preload.js',
  'server/index.js', 'server/ai-relay.js', 'public/**/*', 'package.json'
]) assert.ok(mainFiles.includes(required), `main desktop package missing ${required}`);
for (const value of [...mainFiles, ...mainUnpacked, ...mainResources]) {
  assert.doesNotMatch(value, /(^|[\\/])(?:mobile|mac)(?:[\\/]|$)|SyncWatch-Client-v2\.1\.5\.exe/i,
    `main desktop package embeds a separately released payload: ${value}`);
}
assert.match(windowsBuild, /release[\\/]windows-server/i);
assert.match(windowsBuild, /release[\\/]windows-client/i);
assert.match(windowsBuild, /release[\\/]android/i);
assert.match(windowsBuild, /release[\\/]macos/i);
assert.match(windowsBuild, /release[\\/]server-deployment/i);
assert.doesNotMatch(windowsBuild, /win-unpacked\\resources\\mac/);
assert.doesNotMatch(windowsBuild, /app\.asar\.unpacked\\mobile/);

// The deployable server ZIP remains a separate offline artifact and is still
// built after the two Windows executables have passed their own checks.
assert.match(windowsBuild, /build-server-package\.ps1/);
assert.match(windowsBuild, /SyncWatch-Client-v2\.1\.5\.exe/);
assert.match(windowsBuild, /SyncWatch-Server-v/i);

console.log('desktop login visual, metadata and split-release contracts passed.');
