'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const clientLauncher = fs.readFileSync(path.join(root, 'client-launcher.html'), 'utf8');

function hasControl(id) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing HTML control ${id}`);
  assert.match(app, new RegExp(`\\b${id}\\b`), `missing JS binding ${id}`);
}

for (const id of [
  'loginCubeDisplayMode', 'loginCubeRotationDirection',
  'loginMusicShowTitle', 'loginMusicNowPlaying', 'loginMusicUploadProgress',
  'loginVideoEnabled', 'loginVideoFile', 'loginVideoPreview',
  'f11PromptGlobalEnabled', 'initialPasswordReminderEnabled',
  'clearAllToastsBtn', 'guestConvertBtn', 'roomAllowGuests',
  'mediaProcessingDeleteSource', 'globalRoomStorageLimitMb'
]) hasControl(id);

assert.doesNotMatch(html, /游客模式\s*·\s*免注册，退出即删除/);
assert.match(html, /游客模式\s*·\s*免注册/);

assert.match(app, /openManagementHub\('server',\s*\{\s*allowLogin:\s*true\s*\}\)/,
  'server settings must open its own super-admin sign-in surface');
assert.match(app, /APP_DIALOG_BACK[\s\S]{0,5000}promptRequiredAccountPasswordChange/,
  'required-password wizard must support a real back transition');
assert.match(app, /verify-current-password/,
  'required-password wizard must validate the current password before advancing');
const requiredPasswordBranch = app.match(/if \(state\.capabilities\.mustChangeAccountPassword\) \{([\s\S]{0,800}?)\n  \} else if \(state\.capabilities\.mustChangeAdminPassword\)/);
assert.ok(requiredPasswordBranch, 'authenticated login must retain the required-password branch');
assert.match(requiredPasswordBranch[1], /await promptRequiredAccountPasswordChange\(\);\s*await showClaimedRegistrationRequests\(result\.claimedRegistrationRequests\);/,
  'claimed registration requests must be shown after the password prompt returns, including when that reminder is globally disabled');
assert.match(app, /guest-convert-account/,
  'guest conversion must use an authenticated migration API');

assert.match(server, /guest-convert-account/);
assert.match(server, /allowGuests/);
assert.match(server, /initialPasswordReminderEnabled/);
assert.match(server, /f11PromptEnabled/);
assert.match(server, /temporary:\s*Boolean\(room\.temporary\)/,
  'room scan results must identify temporary rooms');

assert.match(app, /deleteSource:\s*elements\.mediaProcessingDeleteSource/);
assert.match(app, /set-room-storage-limit/);
assert.match(app, /delete-room-files/);
assert.match(app, /set-media-upload-ban/);

assert.match(app, /loginVideo/);
assert.match(server, /loginVideo/);
assert.match(app, /loginMusicUploadProgress/);
assert.match(css, /\.login-now-playing/);

assert.match(clientLauncher, /login-cube|client-login-cube/i,
  'standalone Windows client launcher should provide the same login cube experience');
assert.match(clientLauncher, /id="loginCubeModel"/,
  'standalone Windows client launcher should provide a canvas for the configured GLB model');
assert.match(clientLauncher, /\['cube', 'model', 'flat', 'hidden'\]/,
  'standalone Windows client launcher should accept the same model display mode as the server login page');
assert.match(clientLauncher, /THREE\.GLTFLoader/,
  'standalone Windows client launcher should parse the configured GLB with the bundled renderer');

const clientBuild = fs.readFileSync(path.join(root, 'electron-builder-client.json'), 'utf8');
assert.match(clientBuild, /public\/vendor\/three\/three\.min\.js/);
assert.match(clientBuild, /public\/vendor\/three\/GLTFLoader\.js/);

console.log('Round 29 login, guest, room, media, notice, visual and client contracts passed.');
