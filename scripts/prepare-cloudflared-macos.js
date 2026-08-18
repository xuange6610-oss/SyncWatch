'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const vendorDirectory = path.join(repositoryRoot, 'vendor');
const releaseApi = 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest';

function curlBytes(url, headers = []) {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const args = ['-fsSL', '--retry', '3', '--connect-timeout', '20', '--max-time', '300'];
  for (const header of headers) args.push('-H', header);
  args.push(url);
  const result = spawnSync(curl, args, { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`curl 下载失败（退出码 ${result.status}）：${String(result.stderr || '').trim()}`);
  return Buffer.from(result.stdout || '');
}

async function downloadAsset(asset, architecture) {
  if (!asset?.browser_download_url || !/^sha256:[a-f0-9]{64}$/i.test(String(asset.digest || ''))) {
    throw new Error(`Cloudflare ${architecture} 发布资产缺少可信下载地址或 SHA256 摘要`);
  }
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `syncwatch-cloudflared-${architecture}-`));
  const archivePath = path.join(temporaryDirectory, asset.name);
  try {
    const bytes = curlBytes(asset.browser_download_url, [
      'User-Agent: SyncWatch-macOS-builder',
      'Accept: application/octet-stream'
    ]);
    if (!bytes.length) throw new Error('下载结果为空');
    const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
    const expectedDigest = String(asset.digest).slice('sha256:'.length).toLowerCase();
    if (actualDigest !== expectedDigest) throw new Error(`SHA256 校验失败：期望 ${expectedDigest}，实际 ${actualDigest}`);
    fs.writeFileSync(archivePath, bytes, { flag: 'wx' });
    const extractedDirectory = path.join(temporaryDirectory, 'extracted');
    fs.mkdirSync(extractedDirectory);
    const extraction = spawnSync('tar', ['-xzf', archivePath, '-C', extractedDirectory], { encoding: 'utf8' });
    if (extraction.status !== 0) throw new Error(`无法解压官方组件：${String(extraction.stderr || '').trim()}`);
    const binary = fs.readdirSync(extractedDirectory, { recursive: true })
      .map((entry) => path.join(extractedDirectory, String(entry)))
      .find((entry) => path.basename(entry) === 'cloudflared' && fs.statSync(entry).isFile());
    if (!binary || fs.statSync(binary).size < 1_000_000) throw new Error('官方压缩包内没有完整的 cloudflared 可执行文件');
    const destination = path.join(vendorDirectory, `cloudflared-darwin-${architecture}`);
    const staging = `${destination}.${process.pid}.tmp`;
    fs.mkdirSync(vendorDirectory, { recursive: true });
    fs.copyFileSync(binary, staging, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
    if (process.platform === 'darwin' && process.arch === architecture) {
      const version = spawnSync(destination, ['--version'], { encoding: 'utf8', timeout: 10_000 });
      if (version.status !== 0 || !/cloudflared version/i.test(String(version.stdout || version.stderr || ''))) {
        fs.rmSync(destination, { force: true });
        throw new Error('下载后的 cloudflared 无法在当前 macOS 主机执行');
      }
    }
    console.log(`${path.basename(destination)} 已验证：${actualDigest}`);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const release = JSON.parse(curlBytes(releaseApi, [
    'User-Agent: SyncWatch-macOS-builder',
    'Accept: application/vnd.github+json'
  ]).toString('utf8'));
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const x64 = assets.find((asset) => asset.name === 'cloudflared-darwin-amd64.tgz');
  const arm64 = assets.find((asset) => asset.name === 'cloudflared-darwin-arm64.tgz');
  if (!x64 || !arm64) throw new Error('Cloudflare 最新版本没有同时提供 Intel 与 Apple Silicon 资产');
  await downloadAsset(x64, 'x64');
  await downloadAsset(arm64, 'arm64');
}

main().catch((error) => { console.error(`准备 macOS cloudflared 失败：${error.message}`); process.exitCode = 1; });
