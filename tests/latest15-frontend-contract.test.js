'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');

function hasHtmlId(id) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing HTML control ${id}`);
  assert.match(app, new RegExp(`\\b${id}\\b`), `missing JS binding for ${id}`);
}

for (const id of [
  'playbackRateSelect', 'playbackRateBadge',
  'authorizeLocationBtn', 'revokeLocationBtn',
  'loginCubeScene', 'loginCube',
  'chatEmojiCategory', 'chatEmojiCollapseBtn',
  'liveVoiceFloating', 'voiceFloatingCollapseBtn', 'voiceFloatingMuteBtn',
  'voicePushToTalkBtn', 'voiceFloatingLeaveBtn',
  'chatViewFilterBtn', 'chatViewChannel', 'chatViewUser', 'chatViewUserMode', 'chatViewQuery',
  'videoManagementModal', 'videoManagementList'
]) hasHtmlId(id);

// Verified email login and code-confirmed email unbinding.
assert.match(html, /账号或邮箱[\s\S]{0,180}请输入账号或已绑定邮箱/);
assert.match(app, /emitAck\('email-unbind-request'/);
assert.match(app, /emitAck\('email-unbind-verify'/);

// Room-wide playback rate synchronization, including the visible status badge.
assert.match(app, /function canonicalPlayback\([\s\S]*playbackRate/);
assert.match(app, /emitAck\('playback-command',[\s\S]{0,200}playbackRate/);
assert.match(app, /function changePlaybackRate\(/);
assert.match(app, /applyPlaybackRateUi\(accepted\.playbackRate\)/);
assert.match(app, /performance\.now\(\) - anchor\.receivedAt\) \/ 1000 \* \(anchor\.playbackRate \|\| 1\)/,
  'projected room time must advance at the synchronized playback rate');
assert.match(css, /\.playback-rate-badge/);

// Administrator experience changes must refresh the profile and level highlight.
assert.match(app, /adminAction\('set-account-level'/);
assert.match(app, /account-level-updated/);
assert.match(app, /accountLevelHighlightUntil\s*=\s*Date\.now\(\)\s*\+\s*5000/);
assert.match(css, /\.level-progress-card\.level-up-highlight\s*\{[^}]*animation:\s*level-up-highlight 1s ease-in-out 5/s);

// Friend directory profile viewing and editable/withdrawable outgoing requests.
assert.match(app, /accountContent\.addEventListener\('dblclick',\s*handleAccountDoubleClick\)/);
assert.match(app, /function handleAccountDoubleClick\([\s\S]*openMemberProfile/);
assert.match(app, /friend-request-edit/);
assert.match(app, /friend-request-withdraw/);
assert.match(app, /friend-request-updated/);
assert.match(app, /friend-request-withdrawn/);
assert.match(app, /pendingRequestId[\s\S]{0,500}data-profile-action="friend-request-edit"[\s\S]{0,500}data-profile-action="friend-request-withdraw"/);
assert.match(app, /bringMemberProfileToFront/);
assert.match(css, /#memberProfileModal\s*\{[^}]*z-index:\s*240/);

// Voice controls remain available in a collapsible floating surface.
assert.match(app, /voiceFloatingMuteBtn\?\.addEventListener\('click',\s*toggleLiveVoiceMute\)/);
assert.match(app, /voiceFloatingLeaveBtn\?\.addEventListener\('click',[\s\S]{0,100}leaveLiveVoice/);
assert.match(app, /voicePushToTalkBtn\?\.addEventListener\('pointerdown',\s*beginPushToTalk\)/);
assert.match(app, /function toggleLiveVoiceFloatingCollapsed\(/);
assert.match(css, /\.live-voice-floating\.is-collapsed\s+\.live-voice-floating-body\s*\{\s*display:\s*none/);

// Emoji categories must rerender and can be collapsed again.
assert.match(app, /const EMOJI_CATALOG\s*=\s*\{/);
assert.match(app, /chatEmojiCategory\?\.addEventListener\('change',[\s\S]{0,160}changeEmojiCategory/);
assert.match(app, /function changeEmojiCategory\(/);
assert.match(app, /function hideEmojiBar\(/);

// Position authorization can be revoked by the member or requested by an administrator.
assert.match(app, /emitAck\('member-location-revoke'/);
assert.match(app, /emitAck\('member-location-request'/);
assert.match(app, /socket\.on\('location-authorization-requested'/);

// Room chat supports channel/member include-or-exclude/query filtering.
assert.match(app, /chatViewFilter:\s*\{\s*channel:[\s\S]*userMode:[\s\S]*query:/);
assert.match(app, /function chatViewMessageMatches\(/);
assert.match(app, /userMode[\s\S]{0,120}exclude/);
assert.match(app, /function filteredChatMessages\([\s\S]{0,200}messages\.filter\(chatViewMessageMatches\)/);

// Media management is permission gated and exposes a persistent request flow.
assert.match(app, /state\.permissions\.manageMedia/);
assert.match(app, /data-video-manage=["']request-access["']/);
assert.match(app, /emitAck\('media-management-request'/);
assert.match(app, /media-management-requested/);
assert.match(app, /media-management-request-resolved/);
assert.match(app, /resolve-media-management-request/);
assert.match(app, /function renderVideoManagementList\([\s\S]{0,900}control\.disabled\s*=\s*!allowed/);
assert.match(app, /function handleMediaManagementPermissionUpdated\([\s\S]{0,500}state\.permissions\.manageMedia\s*=\s*update\.granted === true/);
assert.match(css, /\.permission-denied-view \.video-management-modal-card/,
  'permission-denied state must visually dim the modal controls on the actual outer-state element');

// Global scrollbars inherit the active theme rather than a hard-coded palette.
assert.match(css, /:root\s*\{[^}]*scrollbar-color:[^;}]*var\(--theme-accent/);
assert.match(css, /\*::\-webkit-scrollbar-thumb\s*\{[^}]*var\(--theme-accent/);

// The login visual must be a real pointer-draggable 3D cube.
assert.match(app, /loginCubeScene[\s\S]{0,500}addEventListener\('pointerdown'/);
assert.match(app, /addEventListener\('pointermove',[\s\S]{0,500}loginCubeRotationY/);
assert.match(app, /event\.isPrimary === false/);
assert.match(app, /function stopLoginCubeMotion[\s\S]{0,240}cancelAnimationFrame/);
assert.match(app, /document\.visibilityState === 'hidden'\) stopLoginCubeMotion/);
assert.match(app, /loginCubeEditorObjectUrls: new Map\(\)/);
assert.match(app, /previous\?\.file === selectedFile/);
assert.match(app, /function closeManagementHub[\s\S]{0,180}revokeLoginCubeEditorObjectUrls/);
assert.match(css, /\.login-cube\s*\{[^}]*transform-style:\s*preserve-3d/);
assert.match(css, /\.login-cube-(front|back|right|left|top|bottom)/);
assert.match(css, /@media \(max-width: 924px\)[\s\S]{0,180}\.login-visual\s*\{[^}]*display:\s*grid/);

console.log('Latest 15 frontend protocol, permission, interaction, and theme contracts passed.');
