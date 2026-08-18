'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'public', 'js', 'ai-workbench.js'), 'utf8');
const aiCss = fs.readFileSync(path.join(root, 'public', 'css', 'ai-workbench.css'), 'utf8');

function hasControl(id) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing HTML control ${id}`);
  assert.match(app, new RegExp(`\\b${id}\\b`), `missing app binding for ${id}`);
}

for (const id of [
  'accountAdminPresence', 'accountAdminSort', 'accountOverviewPresence', 'accountOverviewSort',
  'mailTemplatePreset', 'verificationCodeList', 'loginMusicEnabled', 'loginMusicUrl', 'appDialogBackBtn'
]) hasControl(id);

assert.match(app, /function filterAndSortAccounts\(/);
assert.match(app, /function verificationDestination\([\s\S]*maskEmailAddress/);
assert.match(app, /const MAIL_TEMPLATE_PRESETS\s*=/);
assert.match(app, /adminAction\('get-verification-codes'/);
assert.match(app, /adminAction\('delete-verification-codes'/);
assert.match(app, /APP_DIALOG_BACK/);
assert.match(app, /allowBack:\s*true/);

// Clipboard and QR sharing must remain usable without the async Clipboard API.
assert.match(app, /document\.execCommand\('copy'\)/);
assert.match(app, /title:\s*'生成房间二维码'[\s\S]{0,600}value:\s*'public'[\s\S]{0,300}value:\s*'lan'/);

// Login music is paused after authentication without mutating the public config.
assert.match(app, /elements\.loginMusicAudio\?\.pause\(\)/);
assert.doesNotMatch(app, /applyLoginMusic\(\{\s*\.\.\.\(state\.publicConfig\.loginMusic[\s\S]{0,80}enabled:\s*false/);

// Friends are rendered before discovery and support local organization.
const friendListIndex = app.indexOf('friend-list-card');
const friendDirectoryIndex = app.indexOf('friend-directory-card', friendListIndex);
assert.ok(friendListIndex > 0 && friendDirectoryIndex > friendListIndex, 'friend list must render before account discovery');
assert.match(app, /data-profile-action="friend-directory-toggle"/);
assert.match(app, /data-profile-action="friend-directory-clear"/);
assert.match(app, /data-profile-action="friend-pin"/);
assert.match(app, /data-profile-action="friend-group"/);
assert.match(css, /\.friend-profile-item\.is-pinned/);

// AI providers are independently configurable and secrets are never revealable in the UI.
for (const id of ['aiApiKey', 'aiImageApiKey', 'aiVideoApiKey']) {
  assert.match(ai, new RegExp(`id=["']${id}["'][^>]*type=["']password["']`), `${id} must remain masked`);
}
assert.doesNotMatch(ai, /toggleAiApiKeyBtn/);
assert.match(ai, /id="aiImageBaseUrl"/);
assert.match(ai, /id="aiVideoBaseUrl"/);
assert.match(ai, /function aiShareableConfig\([\s\S]{0,260}apiKey:[\s\S]{0,120}imageApiKey:[\s\S]{0,120}videoApiKey:/);
assert.match(ai, /scope[\s\S]{0,500}value:\s*'room'[\s\S]{0,300}value:\s*'online'/);
assert.match(ai, /emitAck\('ai-config-sync-request'/);
assert.match(ai, /emitAck\('ai-config-sync-response'/);
assert.match(ai, /ai-config-sync-delivered/);
assert.match(ai, /ai-config-sync-resolved/);
assert.match(aiCss, /\.ai-provider-config/);
assert.match(aiCss, /@media \(max-width: 820px\)[\s\S]*\.ai-provider-config\s*\{\s*grid-template-columns:\s*1fr/);

console.log('Latest 26 frontend account, dialog, clipboard, friend, mail, login-music and AI sync contracts passed.');
