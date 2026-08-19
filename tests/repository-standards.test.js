'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const requiredFiles = [
  '.editorconfig',
  '.gitattributes',
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/CODEOWNERS',
  '.github/workflows/ci.yml',
  '.github/workflows/release-macos.yml',
  '.github/workflows/pages.yml',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'DESIGN.md',
  'LICENSE',
  'NOTICE',
  '.impeccable/design.json',
  'SECURITY.md',
  'docs/index.html',
  'docs/management-center.html',
  'docs/assets/site.css',
  'docs/assets/site.js',
  'docs/server-deployment-guide.md',
  'docs/architecture.md',
  'docs/user-guide.md',
  'docs/cloud-media-deployment.md',
  'docs/macos-build.md',
  'docs/troubleshooting.md',
  'docs/runtime-installation.md',
  'docs/runtime-installation.html',
  'docs/screenshots/main-interface.png',
  'docs/wiki/10-Cloudflared与Node安装.md',
  'docs/tips-and-advantages.md',
  'docs/standalone-server.md',
  'build-windows.ps1',
  'assets/app-icon.png',
  'assets/app-icon.ico'
];

for (const relative of requiredFiles) {
  assert.ok(exists(relative), `missing repository file: ${relative}`);
}

for (const obsolete of [
  '服务器部署与使用教程.md',
  '技术架构与依赖说明.md',
  '使用说明.md',
  '云端视频与商业部署说明.md',
  'MACOS-BUILD.md',
  'SERVER-README.md',
  '生成EXE.ps1',
  '同步观影图标2026.png',
  '同步观影图标2026.ico',
  'SyncWatch-main.zip'
]) {
  assert.ok(!exists(obsolete), `obsolete repository path still exists: ${obsolete}`);
}

const license = read('LICENSE');
assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
assert.match(license, /http:\/\/www\.apache\.org\/licenses\//);
assert.match(read('NOTICE'), /SyncWatch同步观影/);
assert.match(read('NOTICE'), /Copyright 2026 xuan/);

const manifest = JSON.parse(read('package.json'));
assert.equal(manifest.license, 'Apache-2.0');
assert.equal(manifest.description, 'SyncWatch同步观影');
assert.equal(manifest.build.productName, 'SyncWatch同步观影');
assert.equal(manifest.scripts['test:repo'], 'node tests/repository-standards.test.js');

const designMetadata = JSON.parse(read('.impeccable/design.json'));
assert.equal(designMetadata.schemaVersion, 2);
assert.match(read('DESIGN.md'), /^name: SyncWatch同步观影$/m);

const readme = read('README.md');
assert.match(readme, /^# SyncWatch同步观影/m);
assert.match(readme, /Apache-2\.0/);
assert.match(readme, /QQ:\s*2590813506/);
assert.match(readme, /微信:\s*love_020804/);
assert.match(readme, /xuange6610-oss\.github\.io\/SyncWatch\//);
assert.match(readme, /docs\/screenshots\/main-interface\.png/);
assert.match(readme, /SyncWatch-v2\.1\.7-Full-Offline-Installer-x64\.exe/);

const pages = read('.github/workflows/pages.yml');
assert.match(pages, /pages:\s*write/);
assert.match(pages, /id-token:\s*write/);
assert.match(pages, /actions\/upload-pages-artifact@v3/);
assert.match(pages, /path:\s*docs/);
assert.match(pages, /actions\/deploy-pages@v4/);

const contributionChecks = read('.github/workflows/ci.yml');
assert.match(contributionChecks, /pull_request:/);
assert.match(contributionChecks, /npm run test:repo/);
assert.match(contributionChecks, /npm test/);
assert.match(read('.github/CODEOWNERS'), /@xuange6610-oss/);
assert.match(read('CONTRIBUTING.md'), /Pull Request/);
assert.match(read('CONTRIBUTING.md'), /分支保护/);

const site = read('docs/index.html');
assert.match(site, /<html\s+lang="zh-CN">/);
assert.match(site, /<title>SyncWatch同步观影/);
assert.match(site, /<h1[^>]*>[^<]*SyncWatch同步观影/s);
assert.match(site, /GitHub Pages 仅提供静态展示/);

for (const relative of ['build-server-package.ps1', 'mobile/app/build.gradle']) {
  assert.doesNotMatch(read(relative), /[A-Z]:[\\/]Users[\\/]Administrator/i,
    `machine-specific user path found in ${relative}`);
}

for (const match of site.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const target = match[1];
  if (/^(?:https?:|mailto:|tel:|#)/.test(target)) continue;
  const clean = target.split(/[?#]/, 1)[0];
  assert.ok(fs.existsSync(path.resolve(root, 'docs', clean)), `broken Pages asset: ${target}`);
}

console.log('repository standards and GitHub Pages contract passed.');
