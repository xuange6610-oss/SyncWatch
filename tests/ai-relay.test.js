'use strict';

require('./epipe-guard');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertPublicAiUrl,
  endpointUrl,
  extractAiModelIds,
  extractAiText,
  isClashFakeIpAddress,
  isPrivateNetworkAddress,
  modelEndpointCandidates,
  normalizeAiBaseUrl,
  normalizeEndpointPath,
  parseAiJsonText,
  proxyAiJson
} = require('../server/ai-relay');
const { aiNormalizeBaseUrl, aiNormalizeImportedConfig, aiNormalizeModelCatalog, aiParseConfigText, aiVideoPollKey } = require('../public/js/ai-workbench');

async function expectReject(promise, code) {
  let caught = null;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `expected ${code} error`);
  assert.equal(caught.code, code);
  return caught;
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const pageSource = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const workbenchSource = fs.readFileSync(path.join(root, 'public', 'js', 'ai-workbench.js'), 'utf8');
  const workbenchStyle = fs.readFileSync(path.join(root, 'public', 'css', 'ai-workbench.css'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pageSource, /\/css\/ai-workbench\.css/);
  assert.match(pageSource, /\/js\/ai-workbench\.js/);
  assert.match(workbenchSource, /insertBefore\(button, document\.getElementById\('masterMuteBtn'\)/);
  assert.match(workbenchSource, /const ids = `[^`]*\baiWorkbenchTitle\b[^`]*`\.split/);
  assert.doesNotMatch(pageSource, /data-desktop-share-tab="client"|data-desktop-share-panel="client"/);
  assert.doesNotMatch(pageSource, /data-desktop-share-tab="ai"|data-desktop-share-panel="ai"/);
  assert.match(workbenchSource, /\/api\/ai\/chat/);
  assert.match(workbenchSource, /\/api\/ai\/image/);
  assert.match(workbenchSource, /\/api\/ai\/video/);
  assert.match(workbenchSource, /aiPollVideo/);
  assert.match(workbenchSource, /videoPollers: new Map\(\)/);
  assert.match(workbenchSource, /aiConversationById\(task\.conversationId\)/);
  assert.doesNotMatch(workbenchSource, /videoPollTimer/);
  assert.match(workbenchSource, /id="exportAiConfigBtn"/);
  assert.match(workbenchSource, /id="importAiConfigBtn"/);
  assert.match(workbenchSource, /id="pasteAiConfigBtn"/);
  assert.match(workbenchSource, /id="aiModelPicker"/);
  assert.match(workbenchSource, /modelCatalogUpdatedAt/);
  assert.match(workbenchSource, /class="ai-advanced-config"/);
  assert.match(workbenchSource, /readClipboardTextFromAvailableSources/);
  assert.match(workbenchSource, /format: AI_CONFIG_FORMAT/);
  assert.match(workbenchStyle, /\.ai-workbench-layout/);
  assert.match(workbenchStyle, /\.ai-model-control/);
  assert.match(workbenchStyle, /@media \(max-width: 820px\) \{\s*\.ai-workbench-modal \{ padding: 0; \}\s*\.ai-workbench-card \{ width: 100%; height: 100dvh;/);
  assert.ok(manifest.build.files.includes('server/ai-relay.js'), 'Electron 包必须包含 AI relay 模块');

  assert.deepEqual(aiParseConfigText(JSON.stringify({
    format: 'syncwatch-ai-config', version: 1,
    config: { baseUrl: 'https://relay.example/v1/', apiKey: 'Bearer secret-key', protocol: 'RESPONSES', chatModel: 'gpt-demo' }
  })), { baseUrl: 'https://relay.example/v1', apiKey: 'secret-key', protocol: 'responses', chatModel: 'gpt-demo' });
  assert.deepEqual(aiParseConfigText('OPENAI_BASE_URL=https://relay.example/v1\nOPENAI_API_KEY=sk-test-1234567890\nOPENAI_MODEL=gpt-env'), {
    baseUrl: 'https://relay.example/v1', apiKey: 'sk-test-1234567890', chatModel: 'gpt-env'
  });
  assert.deepEqual(aiNormalizeImportedConfig({ openai: { api_base: 'https://relay.example/v1', api_key: 'secret', model: 'gpt-nested' } }), {
    baseUrl: 'https://relay.example/v1', apiKey: 'secret', chatModel: 'gpt-nested'
  });
  assert.deepEqual(aiNormalizeImportedConfig({ provider: {
    baseURL: 'https://relay.example/v1/chat/completions', secretKey: 'provider-secret',
    models: [{ id: 'gpt-a' }, { name: 'gpt-b' }, 'gpt-a']
  } }), {
    baseUrl: 'https://relay.example/v1', apiKey: 'provider-secret', modelCatalog: ['gpt-a', 'gpt-b']
  });
  assert.deepEqual(aiParseConfigText('OPENAI_API_HOST=https://relay.example/v1\nOPENAI_API_KEY=sk-test-1234567890\nOPENAI_CHAT_MODEL=gpt-chat\nOPENAI_MODELS_PATH=/models'), {
    baseUrl: 'https://relay.example/v1', apiKey: 'sk-test-1234567890', modelsPath: '/models', chatModel: 'gpt-chat'
  });
  assert.deepEqual(aiParseConfigText('https://relay.example/v1\nsk-plain-1234567890123456'), {
    baseUrl: 'https://relay.example/v1', apiKey: 'sk-plain-1234567890123456'
  });
  assert.equal(aiNormalizeBaseUrl('https://relay.example/v1/responses?ignored=1'), 'https://relay.example/v1');
  assert.deepEqual(aiNormalizeModelCatalog(['gpt-a', { id: 'gpt-b' }, 'gpt-a', null]), ['gpt-a', 'gpt-b']);
  assert.notEqual(aiVideoPollKey('conversation-a', 'message-1'), aiVideoPollKey('conversation-b', 'message-1'));
  assert.notEqual(aiVideoPollKey('conversation-a', 'message-1'), aiVideoPollKey('conversation-a', 'message-2'));
  assert.throws(() => aiParseConfigText('{"baseUrl":"http://127.0.0.1/v1"}'), /HTTPS/);
  assert.throws(() => aiParseConfigText('{"unknown":"value"}'), /没有识别/);

  assert.equal(normalizeAiBaseUrl('https://relay.example/v1/'), 'https://relay.example/v1');
  assert.equal(normalizeAiBaseUrl('https://relay.example/v1/chat/completions?ignored=1'), 'https://relay.example/v1');
  assert.equal(endpointUrl('https://relay.example/v1', '/responses').toString(), 'https://relay.example/v1/responses');
  assert.equal(endpointUrl('https://relay.example/v1', '/v1/models').toString(), 'https://relay.example/v1/models');
  assert.equal(endpointUrl('https://relay.example/openai/v1', '/v1/models').toString(), 'https://relay.example/openai/v1/models');
  assert.equal(endpointUrl('https://relay.example/openai/v1', '/v1/chat/completions').toString(), 'https://relay.example/openai/v1/chat/completions');
  assert.equal(endpointUrl('https://relay.example/api/chat', '/chat/completions').toString(), 'https://relay.example/api/chat/completions');
  assert.deepEqual(modelEndpointCandidates('https://relay.example', '/models'), ['/models', '/v1/models']);
  assert.deepEqual(modelEndpointCandidates('https://relay.example/v1', '/models'), ['/models']);
  assert.deepEqual(extractAiModelIds({ data: [{ id: 'gpt-a' }, { model: 'gpt-b' }] }), ['gpt-a', 'gpt-b']);
  assert.deepEqual(extractAiModelIds({ result: { models: ['gpt-c', { name: 'gpt-d' }] } }), ['gpt-c', 'gpt-d']);
  assert.deepEqual(extractAiModelIds([{ id: 'gpt-e' }, 'gpt-f', { model_id: 'gpt-g' }]), ['gpt-e', 'gpt-f', 'gpt-g']);
  assert.equal(normalizeEndpointPath('/images/generations'), '/images/generations');
  assert.throws(() => normalizeEndpointPath('/../internal'), /接口路径/);
  assert.throws(() => normalizeAiBaseUrl('http://relay.example/v1'), /HTTPS/);
  assert.equal(isPrivateNetworkAddress('127.0.0.1'), true);
  assert.equal(isPrivateNetworkAddress('192.168.1.2'), true);
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false);
  assert.equal(isClashFakeIpAddress('198.18.0.1'), true);
  assert.equal(isClashFakeIpAddress('198.19.255.254'), true);
  assert.equal(isClashFakeIpAddress('198.20.0.1'), false);

  await expectReject(assertPublicAiUrl('https://relay.example/v1', async () => [{ address: '10.0.0.3' }]), 'AI_PRIVATE_NETWORK_BLOCKED');
  await expectReject(assertPublicAiUrl('https://198.18.0.3/v1', async () => [{ address: '8.8.8.8' }]), 'AI_PRIVATE_NETWORK_BLOCKED');
  await assertPublicAiUrl('https://relay.example/v1', async () => [{ address: '198.18.0.3' }]);
  await expectReject(assertPublicAiUrl('https://relay.example/v1', async () => [{ address: '198.18.0.3' }, { address: '127.0.0.1' }]), 'AI_PRIVATE_NETWORK_BLOCKED');
  await assertPublicAiUrl('https://relay.example/v1', async () => [{ address: '8.8.8.8' }]);

  let request = null;
  const payload = await proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/responses', apiKey: 'secret',
    body: { model: 'demo', input: 'hello' }, lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ output_text: '你好' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(request.url, 'https://relay.example/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request.options.body), { model: 'demo', input: 'hello' });
  assert.equal(extractAiText(payload), '你好');
  assert.equal(extractAiText({ choices: [{ message: { content: '兼容结果' } }] }), '兼容结果');
  assert.equal(extractAiText({ choices: [{ text: '旧式 completions 结果' }] }), '旧式 completions 结果');
  assert.equal(extractAiText({ data: { output_text: '嵌套中转结果' } }), '嵌套中转结果');
  assert.deepEqual(parseAiJsonText('\uFEFF```json\n{"output_text":"代码块兼容"}\n```'), { output_text: '代码块兼容' });
  assert.deepEqual(parseAiJsonText('prefix\n{"data":[{"id":"gpt-wrapped"}]}\nsuffix'), { data: [{ id: 'gpt-wrapped' }] });
  const streamed = parseAiJsonText('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n');
  assert.equal(extractAiText(streamed), '你好');

  const streamedPayload = await proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/chat/completions', apiKey: 'secret',
    body: { model: 'demo', messages: [] }, lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async () => new Response('data: {"choices":[{"delta":{"content":"流"}}]}\n\ndata: {"choices":[{"delta":{"content":"式"}}]}\n\ndata: [DONE]\n', {
      status: 200, headers: { 'content-type': 'text/event-stream' }
    })
  });
  assert.equal(extractAiText(streamedPayload), '流式');

  const htmlResponse = await expectReject(proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/models', apiKey: 'secret', method: 'GET',
    lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async () => new Response('<html><head><title>Cloud gateway timeout</title></head><body>upstream unavailable</body></html>', {
      status: 502, headers: { 'content-type': 'text/html; charset=utf-8' }
    })
  }), 'AI_RESPONSE_INVALID');
  assert.match(htmlResponse.message, /网页而不是 JSON/);
  assert.match(htmlResponse.message, /Cloud gateway timeout/);

  let redirectRequests = 0;
  await expectReject(proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/responses', apiKey: 'must-not-leak',
    body: { input: 'redirect' }, lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async () => {
      redirectRequests += 1;
      return new Response('', { status: 307, headers: { location: 'https://attacker.example/collect' } });
    }
  }), 'AI_CROSS_ORIGIN_REDIRECT_BLOCKED');
  assert.equal(redirectRequests, 1, '跨源重定向不得发起第二次携带密钥的请求');

  const sameOriginHeaders = [];
  const sameOriginPayload = await proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/responses', apiKey: 'same-origin-secret',
    body: { input: 'redirect' }, lookup: async () => [{ address: '198.18.2.3' }],
    fetchImpl: async (url, options) => {
      sameOriginHeaders.push({ url: String(url), authorization: options.headers.Authorization });
      if (sameOriginHeaders.length === 1) return new Response('', { status: 307, headers: { location: '/v1/responses-final' } });
      return new Response(JSON.stringify({ output_text: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.equal(sameOriginPayload.output_text, 'ok');
  assert.equal(sameOriginHeaders.length, 2);
  assert.ok(sameOriginHeaders.every((entry) => entry.authorization === 'Bearer same-origin-secret'));

  const upstream = await expectReject(proxyAiJson({
    baseUrl: 'https://relay.example/v1', endpoint: '/images/generations', apiKey: 'secret',
    body: { prompt: 'test' }, lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'model unavailable' } }), { status: 400 })
  }), 'AI_UPSTREAM_ERROR');
  assert.equal(upstream.message, 'model unavailable');
  assert.equal(upstream.upstreamStatus, 400);

  console.log('AI relay URL validation, SSRF guard, endpoint proxy and response parsing passed.');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
