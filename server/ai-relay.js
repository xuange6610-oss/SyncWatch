'use strict';

const dns = require('dns');
const net = require('net');

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const KNOWN_OPENAI_ENDPOINT_SUFFIXES = [
  '/chat/completions', '/images/generations', '/audio/speech', '/audio/transcriptions',
  '/responses', '/models', '/videos'
];

function relayError(message, code = 'AI_RELAY_ERROR', status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeAiBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) throw relayError('请填写有效的 AI API 地址', 'AI_BASE_URL_INVALID');
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw relayError('AI API 地址格式不正确', 'AI_BASE_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw relayError('AI API 地址必须使用不含账号信息的 HTTPS 地址', 'AI_BASE_URL_INVALID');
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  const lowerPath = parsed.pathname.toLowerCase();
  const endpointSuffix = KNOWN_OPENAI_ENDPOINT_SUFFIXES.find((suffix) => lowerPath.endsWith(suffix));
  if (endpointSuffix) parsed.pathname = parsed.pathname.slice(0, -endpointSuffix.length).replace(/\/+$/, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeEndpointPath(value, fallback) {
  const path = String(value || fallback || '').trim();
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,240}$/.test(path) || path.includes('..') || path.includes('//')) {
    throw relayError('AI 接口路径格式不正确', 'AI_ENDPOINT_INVALID');
  }
  return path;
}

function endpointUrl(baseUrl, endpoint) {
  const parsed = new URL(normalizeAiBaseUrl(baseUrl));
  const basePath = parsed.pathname.replace(/\/$/, '');
  const endpointPath = normalizeEndpointPath(endpoint);
  if (!basePath) {
    parsed.pathname = endpointPath;
    return parsed;
  }
  // Providers often expose a nested base such as `/proxy/openai/v1` while
  // still documenting endpoints as `/v1/models`.  Treat the longest path
  // segment overlap as a relative join so we do not produce
  // `/proxy/openai/v1/v1/models`.  Keep the existing absolute-prefix behavior
  // for callers that pass the complete base path.
  if (endpointPath === basePath || endpointPath.startsWith(`${basePath}/`)) {
    parsed.pathname = endpointPath;
    return parsed;
  }
  const baseSegments = basePath.split('/').filter(Boolean);
  const endpointSegments = endpointPath.split('/').filter(Boolean);
  let overlap = 0;
  const maxOverlap = Math.min(baseSegments.length, endpointSegments.length);
  for (let count = maxOverlap; count > 0; count -= 1) {
    const baseTail = baseSegments.slice(-count).join('/');
    const endpointHead = endpointSegments.slice(0, count).join('/');
    if (baseTail === endpointHead) {
      overlap = count;
      break;
    }
  }
  parsed.pathname = `/${[...baseSegments, ...endpointSegments.slice(overlap)].join('/')}`;
  return parsed;
}

function modelEndpointCandidates(baseUrl, requestedPath = '/models') {
  const requested = normalizeEndpointPath(requestedPath, '/models');
  const parsed = new URL(normalizeAiBaseUrl(baseUrl));
  const basePath = parsed.pathname.replace(/\/$/, '');
  const candidates = [requested];
  if (requested === '/models' && !/(?:^|\/)v\d+(?:beta\d*)?$/i.test(basePath)) candidates.push('/v1/models');
  if (requested === '/v1/models' && /(?:^|\/)v1$/i.test(basePath)) candidates.push('/models');
  return [...new Set(candidates)];
}

function extractAiModelIds(payload, limit = 500) {
  const models = [];
  const seenModels = new Set();
  const seenObjects = new Set();
  const maxModels = Math.max(1, Math.min(2000, Number(limit) || 500));
  const add = (value) => {
    const id = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160);
    if (!id || seenModels.has(id) || /^list$/i.test(id)) return;
    seenModels.add(id);
    models.push(id);
  };
  const visit = (value, depth = 0, allowStrings = false) => {
    if (models.length >= maxModels || value === null || value === undefined || depth > 7) return;
    if (typeof value === 'string') {
      if (allowStrings) add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') add(item);
        else if (item && typeof item === 'object') {
          add(item.id || item.model || item.model_id || item.modelId || item.name || item.slug);
          visit(item, depth + 1, false);
        }
        if (models.length >= maxModels) break;
      }
      return;
    }
    if (typeof value !== 'object' || seenObjects.has(value)) return;
    seenObjects.add(value);
    const directContainers = ['data', 'models', 'items', 'results', 'result', 'list'];
    for (const key of directContainers) {
      if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key], depth + 1, true);
      if (models.length >= maxModels) return;
    }
    if (depth > 0) add(value.id || value.model || value.model_id || value.modelId || value.name || value.slug);
  };
  visit(payload);
  return models;
}

function isClashFakeIpAddress(value) {
  const address = String(value || '').split('%')[0].toLowerCase();
  if (net.isIP(address) !== 4) return false;
  const [first, second] = address.split('.').map(Number);
  return first === 198 && (second === 18 || second === 19);
}

function isPrivateNetworkAddress(value) {
  const address = String(value || '').split('%')[0].toLowerCase();
  const family = net.isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    return octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 0)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 2)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 198 && octets[1] >= 18 && octets[1] <= 19)
      || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113);
  }
  if (family === 6) {
    return address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd')
      || /^fe[89ab]/.test(address) || address.startsWith('ff') || address.startsWith('2001:db8:')
      || address.startsWith('::ffff:');
  }
  return true;
}

async function assertPublicAiUrl(url, lookup = dns.promises.lookup.bind(dns.promises)) {
  const parsed = url instanceof URL ? url : new URL(normalizeAiBaseUrl(url));
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw relayError('AI API 地址必须使用 HTTPS', 'AI_BASE_URL_INVALID');
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname)) {
    if (isPrivateNetworkAddress(hostname)) throw relayError('AI API 地址不能指向本机或内网', 'AI_PRIVATE_NETWORK_BLOCKED', 403);
    return parsed;
  }
  let answers;
  try { answers = await lookup(hostname, { all: true, verbatim: true }); }
  catch (_) { throw relayError('无法解析 AI API 域名', 'AI_DNS_FAILED', 502); }
  const records = Array.isArray(answers) ? answers : [answers];
  // Clash/TUN Fake-IP mode intentionally maps public hostnames into 198.18.0.0/15.
  // Permit that resolver result only for a hostname. A literal Fake-IP URL remains
  // blocked by the net.isIP branch above, as do all other private DNS answers.
  if (!records.length || records.some((entry) => !entry?.address
    || (isPrivateNetworkAddress(entry.address) && !isClashFakeIpAddress(entry.address)))) {
    throw relayError('AI API 域名解析到了本机、内网或保留地址，已阻止连接', 'AI_PRIVATE_NETWORK_BLOCKED', 403);
  }
  return parsed;
}

function apiErrorMessage(payload, response) {
  const candidate = payload?.error?.message || payload?.message || payload?.error_description;
  if (candidate) return String(candidate).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500);
  return `AI 服务返回 ${response.status}`;
}

function extractFirstJsonValue(text) {
  const source = String(text || '');
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{' && source[start] !== '[') continue;
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === '{' || character === '[') stack.push(character);
      else if (character === '}' || character === ']') {
        const expected = character === '}' ? '{' : '[';
        if (stack.pop() !== expected) break;
        if (!stack.length) {
          try { return JSON.parse(source.slice(start, index + 1)); } catch (_) { break; }
        }
      }
    }
  }
  return undefined;
}

function collapseAiStreamPayloads(payloads) {
  const entries = payloads.filter((payload) => payload && typeof payload === 'object');
  if (!entries.length) return {};
  if (entries.length === 1) return entries[0];
  const textParts = [];
  for (const payload of entries) {
    const delta = payload?.choices?.[0]?.delta?.content;
    const message = payload?.choices?.[0]?.message?.content;
    const responseDelta = typeof payload?.delta === 'string' && /(?:output_text|content).*delta/i.test(String(payload?.type || '')) ? payload.delta : '';
    if (typeof delta === 'string') textParts.push(delta);
    else if (typeof message === 'string') textParts.push(message);
    else if (responseDelta) textParts.push(responseDelta);
  }
  if (textParts.length) {
    return { choices: [{ message: { content: textParts.join('') } }], streamChunks: entries };
  }
  const modelRows = entries.flatMap((payload) => Array.isArray(payload?.data) ? payload.data : []);
  if (modelRows.length) return { ...entries.at(-1), data: modelRows, streamChunks: entries };
  return { ...entries.at(-1), streamChunks: entries };
}

function invalidAiResponseError(text, metadata = {}) {
  const contentType = String(metadata.contentType || '').split(';')[0].trim().toLowerCase();
  const status = Number(metadata.status) || 0;
  const statusLabel = status ? `HTTP ${status}` : '未知状态';
  const source = String(text || '').replace(/^\uFEFF/, '').trim();
  const html = contentType === 'text/html' || /<(?:!doctype|html|head|body)\b/i.test(source);
  const title = html ? source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] : '';
  const readable = String(title || source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim().slice(0, 180);
  const typeLabel = contentType || '未知内容类型';
  const detail = readable ? `：${readable}` : '';
  return relayError(
    html
      ? `AI 服务返回了网页而不是 JSON（${statusLabel}，${typeLabel}）${detail}`
      : `AI 服务返回内容无法解析为 JSON（${statusLabel}，${typeLabel}）${detail}`,
    'AI_RESPONSE_INVALID', 502
  );
}

function parseAiJsonText(value, metadata = {}) {
  const source = String(value || '').replace(/^\uFEFF/, '').trim();
  if (!source) return {};
  try { return JSON.parse(source); } catch (_) {}

  const withoutXssi = source.replace(/^\)\]\}',?\s*/, '');
  if (withoutXssi !== source) {
    try { return JSON.parse(withoutXssi); } catch (_) {}
  }

  const fence = withoutXssi.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    try { return JSON.parse(fence[1]); } catch (_) {
      const embeddedFence = extractFirstJsonValue(fence[1]);
      if (embeddedFence !== undefined) return embeddedFence;
    }
  }

  const ssePayloads = [];
  for (const line of withoutXssi.split(/\r?\n/)) {
    const match = line.match(/^\s*data:\s?(.*)$/i);
    if (!match) continue;
    const data = match[1].trim();
    if (!data || data === '[DONE]') continue;
    try { ssePayloads.push(JSON.parse(data)); } catch (_) {
      const embedded = extractFirstJsonValue(data);
      if (embedded !== undefined) ssePayloads.push(embedded);
    }
  }
  if (ssePayloads.length) return collapseAiStreamPayloads(ssePayloads);

  const ndjsonPayloads = withoutXssi.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_) { return undefined; }
  });
  if (ndjsonPayloads.length > 1 && ndjsonPayloads.every((payload) => payload !== undefined)) {
    return collapseAiStreamPayloads(ndjsonPayloads);
  }

  const embedded = extractFirstJsonValue(withoutXssi);
  if (embedded !== undefined) return embedded;
  throw invalidAiResponseError(withoutXssi, metadata);
}

async function readLimitedJson(response, maxBytes) {
  const declared = Number(response.headers.get('content-length')) || 0;
  if (declared > maxBytes) throw relayError('AI 返回内容过大，已停止接收', 'AI_RESPONSE_TOO_LARGE', 502);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw relayError('AI 返回内容过大，已停止接收', 'AI_RESPONSE_TOO_LARGE', 502);
  const text = bytes.toString('utf8');
  return parseAiJsonText(text, {
    contentType: response.headers.get('content-type') || '', status: response.status
  });
}

async function proxyAiJson(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw relayError('当前服务器运行环境不支持 AI 网络请求', 'AI_FETCH_UNAVAILABLE', 500);
  const method = String(options.method || 'POST').toUpperCase();
  const apiKey = String(options.apiKey || '').trim();
  if (!apiKey || apiKey.length > 4096) throw relayError('请填写有效的 API 密钥', 'AI_API_KEY_REQUIRED');
  const timeoutMs = Math.max(5000, Math.min(15 * 60 * 1000, Number(options.timeoutMs) || 120000));
  const maxBytes = Math.max(1024, Math.min(128 * 1024 * 1024, Number(options.maxResponseBytes) || DEFAULT_MAX_RESPONSE_BYTES));
  let current = endpointUrl(options.baseUrl, options.endpoint);
  let redirects = 0;
  while (true) {
    await assertPublicAiUrl(current, options.lookup);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    let response;
    try {
      response = await fetchImpl(current, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' })
        },
        body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
        redirect: 'manual', signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw relayError('AI 请求超时，请检查中转服务或稍后重试', 'AI_REQUEST_TIMEOUT', 504);
      throw relayError('无法连接 AI 中转服务，请检查地址和服务器网络', 'AI_NETWORK_ERROR', 502);
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) throw relayError('AI 服务重定向次数过多', 'AI_REDIRECT_LIMIT', 502);
      const location = response.headers.get('location');
      if (!location) throw relayError('AI 服务返回了无效重定向', 'AI_REDIRECT_INVALID', 502);
      const next = new URL(location, current);
      if (next.origin !== current.origin) {
        throw relayError('AI 服务尝试重定向到其他站点，已阻止发送 API 密钥', 'AI_CROSS_ORIGIN_REDIRECT_BLOCKED', 502);
      }
      current = next;
      redirects += 1;
      continue;
    }
    const payload = await readLimitedJson(response, maxBytes);
    if (!response.ok) {
      const error = relayError(apiErrorMessage(payload, response), 'AI_UPSTREAM_ERROR', response.status >= 400 && response.status < 600 ? response.status : 502);
      error.upstreamStatus = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }
}

function extractAiText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.response === 'string') return payload.response;
  if (typeof payload?.data?.output_text === 'string') return payload.data.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];
  for (const item of output) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.output_text === 'string') parts.push(content.output_text);
    }
  }
  if (parts.length) return parts.join('\n');
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((entry) => entry?.text || entry?.content || '').filter(Boolean).join('\n');
  if (content && typeof content === 'object' && typeof content.text === 'string') return content.text;
  if (typeof payload?.choices?.[0]?.text === 'string') return payload.choices[0].text;
  return '';
}

module.exports = {
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
  proxyAiJson,
  relayError
};
