'use strict';

require('./epipe-guard');

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');
const { startSyncWatchServer } = require('../server');

function ack(socket, event, payload = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} 响应超时`)), timeout);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result || { success: false, error: '服务器未返回结果' });
    });
  });
}

function nextEvent(socket, event, predicate = null, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`等待 ${event} 超时`));
    }, timeout);
    const listener = (payload) => {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

async function connect(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO 连接超时')), 10000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', reject);
  });
  return socket;
}

async function acceptAgreement(socket, result) {
  if (!result?.success || !result.capabilities?.agreementRequired) return result;
  const accepted = await ack(socket, 'agreement-accept', { accepted: true, version: result.agreement.version });
  assert.equal(accepted.success, true, accepted.error);
  result.capabilities.agreementRequired = false;
  return result;
}

async function login(socket, credentials) {
  return acceptAgreement(socket, await ack(socket, 'user-login', credentials));
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncwatch-friend-system-'));
  const publicDir = path.resolve(__dirname, '..', 'public');
  const sockets = [];
  let server;
  try {
    server = await startSyncWatchServer({
      host: '127.0.0.1', port: 0, dataDir, publicDir,
      hostControlToken: 'friend-system-host', ffprobePath: '', ffmpegPath: ''
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const publicConfig = await (await fetch(`${baseUrl}/api/public-config`)).json();
    const lobbyRoomId = publicConfig.roomId;

    const alice = await connect(baseUrl); const bob = await connect(baseUrl); const charlie = await connect(baseUrl);
    sockets.push(alice, bob, charlie);
    assert.equal((await ack(alice, 'user-register', { username: 'FriendAlice', password: '123456' })).success, true);
    let aliceAuth = await login(alice, {
      username: 'FriendAlice', password: '123456', roomId: lobbyRoomId,
      hostToken: 'friend-system-host', deviceId: 'friend-alice-device'
    });
    assert.equal(aliceAuth.success, true, aliceAuth.error);
    const whitelist = await ack(alice, 'admin-action', {
      action: 'add-registration-whitelist', ipAddress: '127.0.0.1', adminPassword: 'admin888'
    });
    assert.equal(whitelist.success, true, whitelist.error);

    assert.equal((await ack(bob, 'user-register', { username: 'FriendBob', password: '123456' })).success, true);
    assert.equal((await ack(charlie, 'user-register', { username: 'FriendCharlie', password: '123456' })).success, true);
    let bobAuth = await login(bob, { username: 'FriendBob', password: '123456', roomId: lobbyRoomId, deviceId: 'friend-bob-device' });
    const charlieAuth = await login(charlie, { username: 'FriendCharlie', password: '123456', roomId: lobbyRoomId, deviceId: 'friend-charlie-device' });
    assert.equal(bobAuth.success, true, bobAuth.error);
    assert.equal(charlieAuth.success, true, charlieAuth.error);

    const offline = await connect(baseUrl);
    sockets.push(offline);
    assert.equal((await ack(offline, 'user-register', { username: 'FriendOffline', password: '123456' })).success, true);
    offline.disconnect();
    const browseAccounts = await ack(alice, 'account-action', { action: 'friend-search', query: '' });
    assert.equal(browseAccounts.success, true, browseAccounts.error);
    assert.deepEqual(new Set(browseAccounts.accounts.map((entry) => entry.username)), new Set(['admin', 'FriendBob', 'FriendCharlie', 'FriendOffline']));
    assert.equal(browseAccounts.accounts.at(-1).username, 'FriendOffline', '好友浏览应将在线账号排在离线账号前面');

    const defaultNoteRequest = await ack(alice, 'account-action', { action: 'friend-request', username: 'FriendOffline', message: '' });
    assert.equal(defaultNoteRequest.success, true, defaultNoteRequest.error);
    const storedDefaultNote = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'))
      .accounts.FriendOffline.friendRequests.find((entry) => entry.from === 'FriendAlice')?.message;
    assert.ok(storedDefaultNote && storedDefaultNote.length <= 160, '空好友附言应由服务器补充轻量默认问候');

    const friendRequestEvent = nextEvent(bob, 'friend-request');
    const friendRequest = await ack(alice, 'account-action', { action: 'friend-request', username: 'FriendBob', message: '一起观影' });
    assert.equal(friendRequest.success, true, friendRequest.error);
    const pendingRequest = await friendRequestEvent;
    const pendingSearch = await ack(alice, 'account-action', { action: 'friend-search', query: 'FriendBob' });
    assert.equal(pendingSearch.success, true, pendingSearch.error);
    assert.equal(pendingSearch.accounts[0].pending, true, '发起方搜索好友时应显示申请正在处理');
    const friendResolutionEvent = nextEvent(alice, 'friend-request-resolved', (entry) => entry.requestId === pendingRequest.id);
    const friendAccepted = await ack(bob, 'account-action', { action: 'friend-respond', requestId: pendingRequest.id, accepted: true });
    assert.equal(friendAccepted.success, true, friendAccepted.error);
    assert.equal((await friendResolutionEvent).accepted, true);

    const sameRoomInvite = await ack(alice, 'account-action', { action: 'friend-room-invite', username: 'FriendBob' });
    assert.equal(sameRoomInvite.success, true, sameRoomInvite.error);
    assert.equal(sameRoomInvite.alreadyTogether, true);
    assert.match(sameRoomInvite.message, /已经在同一个房间|正在一起观影/);

    const bobPrivacy = await ack(bob, 'account-action', {
      action: 'friend-settings', allowFriendRequests: false, messageNotifications: true
    });
    assert.equal(bobPrivacy.success, true, bobPrivacy.error);
    const rejectedByPrivacy = await ack(charlie, 'account-action', { action: 'friend-request', username: 'FriendBob' });
    assert.equal(rejectedByPrivacy.success, false);
    assert.equal(rejectedByPrivacy.code, 'FRIEND_REQUESTS_DISABLED');

    const firstMessageEvent = nextEvent(bob, 'friend-message');
    const firstMessage = await ack(alice, 'account-action', {
      action: 'friend-message', username: 'FriendBob', text: '第一条好友消息'
    });
    assert.equal(firstMessage.success, true, firstMessage.error);
    const deliveredFirstMessage = await firstMessageEvent;
    assert.equal(deliveredFirstMessage.notificationMuted, false);
    assert.equal(deliveredFirstMessage.floatingNoticeMuted, false);
    assert.ok(firstMessage.message.deliveredAt, '在线好友消息应标记为已送达');

    const disableFloatingNotice = await ack(bob, 'account-action', {
      action: 'friend-update', username: 'FriendAlice', floatingNotice: false
    });
    assert.equal(disableFloatingNotice.success, true, disableFloatingNotice.error);
    assert.equal(disableFloatingNotice.profile.friends.find((entry) => entry.username === 'FriendAlice').floatingNotice, false);
    const floatingMutedEvent = nextEvent(bob, 'friend-message');
    assert.equal((await ack(alice, 'account-action', {
      action: 'friend-message', username: 'FriendBob', text: '关闭悬浮后仍然收件'
    })).success, true);
    assert.equal((await floatingMutedEvent).floatingNoticeMuted, true);
    const updateRemarkWithoutResettingFloating = await ack(bob, 'account-action', {
      action: 'friend-update', username: 'FriendAlice', remark: '影院搭子'
    });
    assert.equal(updateRemarkWithoutResettingFloating.success, true, updateRemarkWithoutResettingFloating.error);
    assert.equal(updateRemarkWithoutResettingFloating.profile.friends.find((entry) => entry.username === 'FriendAlice').floatingNotice, false);

    const readReceiptEvent = nextEvent(alice, 'friend-message-read', (entry) => entry.messageIds?.includes(firstMessage.message.id));
    const bobHistory = await ack(bob, 'account-action', { action: 'friend-history', username: 'FriendAlice' });
    assert.equal(bobHistory.success, true, bobHistory.error);
    assert.ok(bobHistory.receipt.ids.includes(firstMessage.message.id));
    assert.ok((await readReceiptEvent).readAt);
    const aliceHistoryAfterRead = await ack(alice, 'account-action', { action: 'friend-history', username: 'FriendBob' });
    assert.ok(aliceHistoryAfterRead.messages.find((entry) => entry.id === firstMessage.message.id)?.readAt, '发送方历史应同步已读状态');

    const forgedReply = await ack(alice, 'account-action', {
      action: 'friend-message', username: 'FriendBob', text: '不能伪造引用',
      replyTo: { id: 'forged', from: 'admin', text: '伪造内容' }
    });
    assert.equal(forgedReply.success, true, forgedReply.error);
    assert.equal(forgedReply.message.replyTo, null);
    const realReply = await ack(bob, 'account-action', {
      action: 'friend-message', username: 'FriendAlice', text: '真实引用回复', replyToId: firstMessage.message.id,
      replyTo: { from: 'admin', text: '客户端伪造内容' }
    });
    assert.equal(realReply.success, true, realReply.error);
    assert.equal(realReply.message.replyTo.id, firstMessage.message.id);
    assert.equal(realReply.message.replyTo.from, 'FriendAlice');
    assert.equal(realReply.message.replyTo.text, '第一条好友消息');

    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const imageForm = new FormData();
    imageForm.append('image', new Blob([onePixelPng], { type: 'image/png' }), 'friend.png');
    imageForm.append('to', 'FriendBob');
    imageForm.append('text', '好友图片');
    const imageResponse = await fetch(`${baseUrl}/api/friend-image`, {
      method: 'POST', headers: { Authorization: `Bearer ${aliceAuth.token}` }, body: imageForm
    });
    const imageResult = await imageResponse.json();
    assert.equal(imageResponse.status, 200, JSON.stringify(imageResult));
    assert.equal(imageResult.success, true, imageResult.error);
    assert.equal(imageResult.message.type, 'image');
    const imageDownload = await fetch(`${baseUrl}${imageResult.message.imageUrl}`, {
      headers: { Authorization: `Bearer ${bobAuth.token}` }
    });
    assert.equal(imageDownload.status, 200);
    assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()), onePixelPng);

    const deleteOwnImage = await ack(alice, 'account-action', {
      action: 'friend-delete-messages', username: 'FriendBob', messageIds: [imageResult.message.id]
    });
    assert.equal(deleteOwnImage.success, true, deleteOwnImage.error);
    const aliceHistoryAfterDelete = await ack(alice, 'account-action', { action: 'friend-history', username: 'FriendBob' });
    const bobHistoryAfterDelete = await ack(bob, 'account-action', { action: 'friend-history', username: 'FriendAlice' });
    assert.equal(aliceHistoryAfterDelete.messages.some((entry) => entry.id === imageResult.message.id), false);
    assert.equal(bobHistoryAfterDelete.messages.some((entry) => entry.id === imageResult.message.id), true, '单侧删除不能删除对方记录');

    const globalMute = await ack(bob, 'account-action', { action: 'friend-settings', messageNotifications: false });
    assert.equal(globalMute.success, true, globalMute.error);
    const globallyMutedEvent = nextEvent(bob, 'friend-message');
    assert.equal((await ack(alice, 'account-action', { action: 'friend-message', username: 'FriendBob', text: '全局关闭提醒仍应收件' })).success, true);
    assert.equal((await globallyMutedEvent).notificationMuted, true);
    assert.equal((await ack(bob, 'account-action', { action: 'friend-settings', messageNotifications: true })).success, true);
    const perFriendMute = await ack(bob, 'account-action', {
      action: 'friend-notification-mute', username: 'FriendAlice', durationMs: 60 * 60 * 1000
    });
    assert.equal(perFriendMute.success, true, perFriendMute.error);
    const individuallyMutedEvent = nextEvent(bob, 'friend-message');
    assert.equal((await ack(alice, 'account-action', { action: 'friend-message', username: 'FriendBob', text: '单个好友免打扰仍应收件' })).success, true);
    assert.equal((await individuallyMutedEvent).notificationMuted, true);

    const blockedWords = await ack(alice, 'admin-action', {
      action: 'set-blocked-words', adminPassword: 'admin888', blockedWords: ['ｂａｄ　ｗｏｒｄ']
    });
    assert.equal(blockedWords.success, true, blockedWords.error);
    assert.deepEqual(blockedWords.blockedWords, ['bad word']);
    for (const [event, payload] of [
      ['account-action', { action: 'friend-message', username: 'FriendBob', text: '包含 BAD    WORD 的消息' }],
      ['chat-message', { channel: 'public', text: '包含 Bad Word 的聊天' }],
      ['danmaku', { text: '包含 ＢＡＤ　ＷＯＲＤ 的弹幕' }]
    ]) {
      const rejected = await ack(alice, event, payload);
      assert.equal(rejected.success, false, `${event} 应拒绝屏蔽词`);
      assert.equal(rejected.code, 'BLOCKED_WORD');
      assert.equal(rejected.blockedWord, 'bad word');
    }

    aliceAuth = await acceptAgreement(alice, await ack(alice, 'room-create', {
      customRoomId: 'ALICE1', roomName: 'Alice 房间', roomPassword: 'alice-room-pass', maxUsers: 8
    }));
    bobAuth = await acceptAgreement(bob, await ack(bob, 'room-create', {
      customRoomId: 'BOBROOM', roomName: 'Bob 房间', roomPassword: 'bob-room-pass', maxUsers: 8
    }));
    assert.equal(aliceAuth.success, true, aliceAuth.error);
    assert.equal(bobAuth.success, true, bobAuth.error);

    const directDenied = await ack(alice, 'account-action', { action: 'friend-room-direct-join', username: 'FriendBob' });
    assert.equal(directDenied.success, false);
    assert.equal(directDenied.code, 'FRIEND_APPROVAL_REQUIRED');
    const directSetting = await ack(bob, 'account-action', {
      action: 'friend-settings', allowPasswordlessOwnRoomJoin: true
    });
    assert.equal(directSetting.success, true, directSetting.error);
    const directJoin = await ack(alice, 'account-action', { action: 'friend-room-direct-join', username: 'FriendBob' });
    assert.equal(directJoin.success, true, directJoin.error);
    assert.equal(directJoin.auth.room.id, 'BOBROOM');
    const aliceBack = await ack(alice, 'room-switch', { roomId: 'ALICE1', roomPassword: 'alice-room-pass' });
    assert.equal(aliceBack.success, true, aliceBack.error);

    const inviteEvent = nextEvent(bob, 'friend-room-request', (entry) => entry.kind === 'invite');
    const invite = await ack(alice, 'account-action', { action: 'friend-room-invite', username: 'FriendBob' });
    assert.equal(invite.success, true, invite.error);
    const inviteRequest = await inviteEvent;
    const inviteAccepted = await ack(bob, 'account-action', {
      action: 'friend-room-respond', requestId: inviteRequest.id, accepted: true
    });
    assert.equal(inviteAccepted.success, true, inviteAccepted.error);
    assert.equal(inviteAccepted.auth.room.id, 'ALICE1', '接受好友邀请应免输房间密码并切换房间');
    assert.equal((await ack(bob, 'room-switch', { roomId: 'BOBROOM' })).success, true);

    const joinRequestEvent = nextEvent(bob, 'friend-room-request', (entry) => entry.kind === 'join');
    assert.equal((await ack(alice, 'account-action', { action: 'friend-room-join-request', username: 'FriendBob' })).success, true);
    const joinRequest = await joinRequestEvent;
    const requesterMoved = nextEvent(alice, 'friend-room-request-resolved', (entry) => entry.requestId === joinRequest.id && entry.accepted);
    const joinAccepted = await ack(bob, 'account-action', {
      action: 'friend-room-respond', requestId: joinRequest.id, accepted: true
    });
    assert.equal(joinAccepted.success, true, joinAccepted.error);
    const joinResolution = await requesterMoved;
    assert.equal(joinResolution.auth.room.id, 'BOBROOM', '好友批准加入后应直接免密切换申请人');
    const ordinaryViewerJoined = await ack(charlie, 'room-switch', { roomId: 'BOBROOM', roomPassword: 'bob-room-pass' });
    assert.equal(ordinaryViewerJoined.success, true, ordinaryViewerJoined.error);

    const uploadForm = new FormData();
    uploadForm.append('file', new Blob([Buffer.from('friend-playback-test')], { type: 'video/mp4' }), 'friend-test.mp4');
    uploadForm.append('collection', '好友测试');
    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${bobAuth.token}` }, body: uploadForm
    });
    const uploadResult = await uploadResponse.json();
    assert.equal(uploadResponse.status, 200, JSON.stringify(uploadResult));
    const playbackRequest = await ack(charlie, 'request-playback', { fileId: uploadResult.file.id });
    assert.equal(playbackRequest.success, true, playbackRequest.error);
    const duplicatePlaybackRequest = await ack(charlie, 'request-playback', { fileId: uploadResult.file.id });
    assert.equal(duplicatePlaybackRequest.success, false);
    assert.equal(duplicatePlaybackRequest.code, 'PLAYBACK_REQUEST_DUPLICATE');
    const playbackRejected = await ack(bob, 'playback-request-action', {
      requestId: playbackRequest.request.id, approved: false, suppressDurationMs: 60 * 60 * 1000
    });
    assert.equal(playbackRejected.success, true, playbackRejected.error);
    const suppressedPlaybackRequest = await ack(charlie, 'request-playback', { fileId: uploadResult.file.id });
    assert.equal(suppressedPlaybackRequest.success, false);
    assert.equal(suppressedPlaybackRequest.code, 'PLAYBACK_REQUEST_SUPPRESSED');

    const persistedProfile = await ack(bob, 'account-action', { action: 'get-profile' });
    assert.equal(persistedProfile.profile.friendSettings.allowFriendRequests, false);
    assert.equal(persistedProfile.profile.friendSettings.allowPasswordlessOwnRoomJoin, true);
    const persistedAliceFriend = persistedProfile.profile.friends.find((entry) => entry.username === 'FriendAlice');
    assert.ok(Date.parse(persistedAliceFriend.muteUntil) > Date.now());
    assert.equal(persistedAliceFriend.floatingNotice, false);
    assert.equal(persistedAliceFriend.remark, '影院搭子');
    const persistedState = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'));
    assert.deepEqual(persistedState.admin.blockedWords, ['bad word']);
    assert.equal(persistedState.accounts.FriendBob.friendSettings.allowFriendRequests, false);
    assert.equal(persistedState.accounts.FriendBob.friendSettings.allowPasswordlessOwnRoomJoin, true);

    const unauthorizedPromotion = await ack(alice, 'admin-action', {
      action: 'set-super-admin', username: 'FriendCharlie', enabled: true, adminPassword: 'admin888'
    });
    assert.equal(unauthorizedPromotion.success, false);
    assert.match(unauthorizedPromotion.error, /只有内置 admin|仅 admin/);

    const builtinAdmin = await connect(baseUrl);
    sockets.push(builtinAdmin);
    const builtinAdminAuth = await login(builtinAdmin, {
      username: 'admin', password: 'admin888', roomId: lobbyRoomId, deviceId: 'friend-system-admin-device'
    });
    assert.equal(builtinAdminAuth.success, true, builtinAdminAuth.error);
    const promotedCharlie = await ack(builtinAdmin, 'admin-action', {
      action: 'set-super-admin', username: 'FriendCharlie', enabled: true
    });
    assert.equal(promotedCharlie.success, true, promotedCharlie.error);
    const charlieCannotPromote = await ack(charlie, 'admin-action', {
      action: 'set-super-admin', username: 'FriendBob', enabled: true
    });
    assert.equal(charlieCannotPromote.success, false);
    assert.match(charlieCannotPromote.error, /只有内置 admin|仅 admin/);
    const adminSettings = await ack(builtinAdmin, 'admin-action', { action: 'get-settings' });
    assert.equal(adminSettings.admin.canManageSuperAdmins, true);
    assert.equal(adminSettings.admin.accounts.find((entry) => entry.username === 'FriendCharlie').superAdmin, true);
    const charlieSettings = await ack(charlie, 'admin-action', { action: 'get-settings' });
    assert.equal(charlieSettings.admin.canManageSuperAdmins, false);
    assert.equal(charlieSettings.admin.accounts.find((entry) => entry.username === 'admin').superAdmin, false, '非 admin 不应获得完整超管名单');

    const removedWhitelist = await ack(builtinAdmin, 'admin-action', {
      action: 'remove-registration-whitelist', ipAddress: '127.0.0.1'
    });
    assert.equal(removedWhitelist.success, true, removedWhitelist.error);
    const allowanceRequester = await connect(baseUrl);
    sockets.push(allowanceRequester);
    const allowanceRequest = await ack(allowanceRequester, 'registration-request', {
      username: 'AllowanceOne', requestedCount: 3, reason: '家庭网络需要三个独立账号', deviceName: '额度测试设备'
    });
    assert.equal(allowanceRequest.success, true, allowanceRequest.error);
    assert.equal(allowanceRequest.request.requestedCount, 3);
    const allowanceApproved = await ack(builtinAdmin, 'admin-action', {
      action: 'approve-registration-request', requestId: allowanceRequest.request.id
    });
    assert.equal(allowanceApproved.success, true, allowanceApproved.error);
    for (const username of ['AllowanceOne', 'AllowanceTwo', 'AllowanceThree']) {
      const registrationSocket = await connect(baseUrl);
      sockets.push(registrationSocket);
      const registration = await ack(registrationSocket, 'user-register', { username, password: '123456' });
      assert.equal(registration.success, true, `${username}: ${registration.error || ''}`);
    }
    const fourthRegistrationSocket = await connect(baseUrl);
    sockets.push(fourthRegistrationSocket);
    const fourthRegistration = await ack(fourthRegistrationSocket, 'user-register', { username: 'AllowanceFour', password: '123456' });
    assert.equal(fourthRegistration.success, false);
    assert.equal(fourthRegistration.code, 'REGISTRATION_IP_LIMIT');

    const revokeDevices = await ack(bob, 'account-action', {
      action: 'revoke-devices', deviceIds: [persistedProfile.profile.devices.find((device) => device.current).id]
    });
    assert.equal(revokeDevices.success, true, revokeDevices.error);
    assert.equal(revokeDevices.current, true);
    assert.equal(revokeDevices.revoked, 1);

    const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(publicDir, 'js', 'app.js'), 'utf8');
    const css = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');
    for (const id of ['friendChatEmojiBar', 'friendChatContextMenu', 'friendChatImageInput', 'friendChatReplyPreview', 'friendVideoNoticeLayer', 'blockedWordsInput']) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(app, /发来好友消息[\s\S]{0,180}打开对话/);
    assert.match(app, /friend-message-read/);
    assert.match(app, /friend-delete-messages/);
    assert.match(app, /friend-room-direct-join/);
    assert.match(app, /revoke-devices/);
    assert.match(app, /data-device-select-all/);
    assert.match(app, /friend-request[\s\S]{0,1200}required:\s*false/);
    assert.match(html, /id="friendChatFloatingBtn"/);
    assert.match(app, /floatingNoticeMuted[\s\S]{0,500}showDanmaku/);
    assert.match(app, /action:\s*'friend-update'[\s\S]{0,180}floatingNotice/);
    assert.match(app, /scrollIntoView\(\{\s*behavior:\s*'smooth'/);
    assert.match(app, /friendChatEmojiBar[\s\S]{0,500}classList\.toggle/);
    assert.match(css, /\.friend-chat-context-menu/);
    assert.match(css, /\.friend-chat-emoji-bar/);
    assert.match(css, /\.friend-video-notice-layer/);

    console.log('✓ 好友提醒、隐私、已读、引用、图片、删除、房间邀请、屏蔽词和播放申请冷却通过');
  } finally {
    for (const socket of sockets) socket.disconnect();
    await server?.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
