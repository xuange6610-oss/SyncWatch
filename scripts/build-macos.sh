#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js 22+。" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前不是 macOS：生成可运行但未签名的 macOS x64/arm64 .app ZIP。"
  echo "DMG、Developer ID 签名和 Apple 公证仍需在 macOS 构建机完成。"
  node scripts/build-macos-portable.js
  exit 0
fi

node scripts/prepare-cloudflared-macos.js

VERSION="$(node -p "require('./package.json').version")"

for architecture in x64 arm64; do
  echo "Preparing locked dependencies for macOS ${architecture}..."
  npm_config_arch="$architecture" npm ci --no-audit --no-fund
  node_modules/.bin/electron-builder --config electron-builder-mac-client.json --mac --"$architecture"
  node_modules/.bin/electron-builder --config electron-builder-mac-server.json --mac --"$architecture"
  client_dmg="dist-mac-client/SyncWatch同步观影-客户端-v${VERSION}-${architecture}.dmg"
  server_dmg="dist-mac-server/SyncWatch同步观影-服务器-v${VERSION}-${architecture}.dmg"
  client_zip="dist-mac-client/SyncWatch同步观影-客户端-v${VERSION}-${architecture}.zip"
  server_zip="dist-mac-server/SyncWatch同步观影-服务器-v${VERSION}-${architecture}.zip"
  if [[ ! -s "$client_dmg" || ! -s "$server_dmg" || ! -s "$client_zip" || ! -s "$server_zip" ]]; then
    echo "macOS ${architecture} 构建完成但缺少预期 DMG 或 ZIP。" >&2
    exit 3
  fi
  for artifact in "$client_dmg" "$server_dmg" "$client_zip" "$server_zip"; do
    cp -f "$artifact" "$(basename "$artifact")"
  done
  shasum -a 256 "$client_dmg" "$server_dmg" "$client_zip" "$server_zip"
done

echo "macOS 客户端和服务器 x64/arm64 DMG/ZIP 已发布到项目根目录；构建副本位于 dist-mac-client/ 和 dist-mac-server/."
