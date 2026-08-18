'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');

function hasId(id) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `缺少 #${id}`);
}

for (const id of [
  'loginMusicNowPlaying', 'loginMusicProgressShell', 'loginMusicProgress', 'loginMusicTime',
  'loginVideoSettingsCard', 'loginVideoEnabled', 'loginVideoFile', 'loginVideoPreview',
  'loginVideoUploadProgress', 'saveLoginVideoBtn', 'removeLoginVideoBtn', 'loginVideoStatus',
  'saveNoticePreferenceSettingsBtn', 'clearAllToastsBtn', 'roomAllowGuests',
  'globalRoomStorageLimitMb', 'roomMediaPreviewSelectAll', 'roomMediaPreviewBatchDeleteBtn',
  'roomMediaPreviewBanUploadBtn', 'mediaProcessingDeleteSource',
  'guestConvertBtn', 'guestConvertModal', 'closeGuestConvertBtn', 'guestConvertForm',
  'guestConvertUsername', 'guestConvertPassword', 'guestConvertPasswordConfirm',
  'guestConvertEmail', 'guestConvertEmailCode', 'sendGuestConvertEmailCodeBtn', 'guestConvertStatus',
  'loginCubeModelFile', 'loginCubeModelTutorial', 'phoneOneTapLoginBtn', 'wechatLoginBtn', 'qqLoginBtn'
]) hasId(id);

assert.doesNotMatch(html, /游客模式\s*·\s*免注册，退出即删除/);
assert.match(html, /游客模式\s*·\s*免注册/);

assert.match(html, /id=["']loginCubeDisplayMode["'][\s\S]{0,600}value=["']cube["'][\s\S]{0,240}value=["']model["'][\s\S]{0,240}value=["']flat["'][\s\S]{0,240}value=["']hidden["']/);
assert.match(html, /id=["']loginCubeRotationDirection["'][\s\S]{0,700}value=["']right["'][\s\S]{0,180}value=["']left["'][\s\S]{0,180}value=["']up["'][\s\S]{0,180}value=["']down["'][\s\S]{0,180}value=["']random["']/);
assert.match(html, /id=["']loginCubeModelFile["'][^>]*accept=["'][^"']*(?:\.glb|model\/gltf-binary)[^"']*["']/);
assert.doesNotMatch(html, /id=["']loginCubeModelFile["'][^>]*(?:\.gltf|model\/gltf\+json)/);
assert.match(html, /单文件 GLB 2\.0/);
assert.match(html, /不超过 25 MB/);

assert.match(html, /id=["']f11PromptGlobalEnabled["'][^>]*checked/);
assert.match(html, /id=["']initialPasswordReminderEnabled["'][^>]*checked/);
assert.match(html, /id=["']clearAllToastsBtn["'][^>]*class=["'][^"']*is-hidden/);
assert.match(html, /id=["']roomAllowGuests["'][^>]*checked/);
assert.doesNotMatch(html, /id=["']mediaProcessingDeleteSource["'][^>]*checked/);

const registrationVerification = html.match(/<div\s+id=["']registrationEmailVerificationRow["'][^>]*>/)?.[0] || '';
assert.ok(registrationVerification, '缺少常显注册邮箱验证码行');
assert.doesNotMatch(registrationVerification, /\bis-hidden\b/, '注册邮箱验证码不能默认隐藏');
assert.match(html, /id=["']regEmailVerificationCode["'][^>]*data-required-when=["']regEmail["']/);
assert.match(html, /填写邮箱[^<]*(?:必须|需要)[^<]*验证码/);

for (const providerId of ['phoneOneTapLoginBtn', 'wechatLoginBtn', 'qqLoginBtn']) {
  assert.match(html, new RegExp(`id=["']${providerId}["'][^>]*\\bdisabled\\b`), `${providerId} 在未配置服务商时必须禁用`);
}
assert.match(html, /需(?:要)?服务商配置|服务商尚未配置/);

assert.match(html, /id=["']guestConvertModal["'][^>]*role=["']dialog["'][^>]*aria-modal=["']true["']/);
assert.match(html, /id=["']guestConvertEmailCode["'][^>]*data-required-when=["']guestConvertEmail["']/);
assert.match(html, /id=["']loginVideoEnabled["'][^>]*data-mutually-exclusive-with=["']loginMusicEnabled["']/);

assert.match(css, /login-cube-scene\[data-display-mode=["']flat["']\][\s\S]{0,900}login-cube-front/);
assert.match(css, /login-cube-scene\[data-display-mode=["']hidden["']\]/);
assert.match(css, /\.clear-all-toasts-button\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*auto;/s);
assert.match(css, /\.login-music-progress-popover\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s);
assert.match(css, /\.login-now-playing\.is-expanded\s+\.login-music-progress-popover/);
assert.match(css, /\.player-container:fullscreen\s+\.fullscreen-show-button[\s\S]{0,500}pointer-events:\s*auto/);
assert.doesNotMatch(css, /@import\s+(?:url\()?['"]?https?:\/\//i, '不得引用远程字体或样式');

console.log('Round 29 HTML/CSS structure, safe defaults, accessibility hooks, and fullscreen reachability passed.');
