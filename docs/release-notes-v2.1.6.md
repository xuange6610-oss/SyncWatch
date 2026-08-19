# SyncWatch同步观影 v2.1.6

和朋友、家人、情侣远程一起看电影。v2.1.6 提供 Windows 一键安装/便携运行、Android、独立服务器，以及由真实 macOS runner 构建的 Intel / Apple Silicon 包。

> 第一次使用请立即修改默认管理员密码，并先在局域网完成连接测试，再开启公网访问。

## 普通用户怎么选

### 体验版

- **在线展示**：直接打开 [GitHub Pages](https://xuange6610.github.io/SyncWatch/)，查看真实界面、功能截图和逐步教程。它是静态展示，不运行真实服务器。
- **Windows 客户端**：`SyncWatch-Client-Portable-v2.1.6-x64.exe`。适合成员连接已经运行的服务器，不在本机启动服务端。

### 标准版

- **Windows 安装版**：`SyncWatch-Server-Setup-v2.1.6-x64.exe`。安装、卸载、桌面快捷方式、开始菜单和安装后启动。
- **Windows 绿色便携版**：`SyncWatch-Server-Portable-v2.1.6-x64.exe`。双击即用，不需要 Git、Node.js 或 npm。
- **Android 完整 APK**：`SyncWatch-Android-v2.1.6-universal.apk`。可加入房间；受支持设备可运行手机服务器。
- **独立服务器 ZIP**：`SyncWatch-Standalone-Server-v2.1.6.zip`。适合 Node.js、Linux、Windows Server 或 Docker 长期部署。

### 跨平台完整套装

完整使用不是把 Windows、Android、macOS 运行时伪装进同一个 EXE，而是按设备下载本页对应资产：

1. 房主下载 Windows/macOS 服务器包或独立服务器 ZIP。
2. Windows 成员下载客户端 EXE。
3. Android 成员下载通用 APK。
4. Mac 成员按 Intel x64 / Apple Silicon arm64 下载客户端。
5. 临时公网访问所需 cloudflared 已内置在正式服务器包，也提供独立工具供管理员手工部署。

不同系统有不同签名、CPU 架构和权限模型，不能互相替代。不会为了达到约 1 GB 人为填充无用文件。

## 一键运行包含什么

Windows 正式服务器包内置 Electron/Node.js 运行时、应用前后端、生产依赖、Socket.IO、FFmpeg、FFprobe 和 Windows cloudflared。启动时会初始化数据目录、读取配置、检测端口、启动 HTTP/WebSocket 服务、显示启动状态并打开 Electron 界面。

同一数据目录只允许一个实例写入。连续双击时会显示已运行实例的聚焦/安全退出操作，不会启动两个服务写坏数据。不同目录仍可运行互相隔离的服务器。

## macOS

macOS 服务器/客户端各提供：

- Intel 客户端：`SyncWatch-Client-macOS-v2.1.6-x64.dmg` / `.zip`
- Apple Silicon 客户端：`SyncWatch-Client-macOS-v2.1.6-arm64.dmg` / `.zip`
- Intel 服务器：`SyncWatch-Server-macOS-v2.1.6-x64.dmg` / `.zip`
- Apple Silicon 服务器：`SyncWatch-Server-macOS-v2.1.6-arm64.dmg` / `.zip`

这些资产由 GitHub Actions 的真实 `macos-14` runner 构建并检查文件大小、SHA-256 和隐私字段。现代 macOS 不支持 32 位应用，因此不会提供虚假的 macOS 32 位包。

## 架构支持边界

- Windows 正式桌面包：x64。当前 Electron 41 和媒体工具发布链不提供可完整验证的 Windows 32 位组合。
- Android：通用 APK 包含 `armeabi-v7a`（32 位）、`arm64-v8a` 和 `x86_64`。
- macOS：Intel x64 与 Apple Silicon arm64；无现代 macOS 32 位。
- 独立服务端：以 Node.js 22+ 对目标系统和架构的官方支持为准。

## cloudflared 独立工具

- `cloudflared-windows-x64.exe`
- `cloudflared-macos-x64`
- `cloudflared-macos-arm64`

cloudflared 是 Cloudflare Tunnel 连接器，把本机 HTTP、Socket.IO 和媒体 Range 请求转发成 HTTPS 公网入口。它不保存 SyncWatch 的账号或影片。完整服务器包优先使用内置文件；独立工具仅供手工部署、诊断或修复。

## Node.js 官方环境包

Node.js 只用于源码开发和独立服务端，Windows 正式 EXE 不需要另装 Node.js。本 Release 附带 Node.js 24.19.0 官方包：

- Windows x64 MSI
- Windows arm64 MSI
- macOS x64 PKG
- macOS arm64 TAR.GZ

安装后使用 `node --version` 和 `npm --version` 验证。来源为 [nodejs.org](https://nodejs.org/)，下载后请核对本页显示的 SHA-256。

## 首次启动

1. 下载与你的平台和角色匹配的文件。
2. 双击 Windows 安装版/便携版，或安装 Android/macOS 包。
3. 使用 `admin` / `admin888` 首次登录。
4. 立即修改管理员密码。
5. 创建带密码的房间，上传合法媒体并等待分析。
6. 先用同一 Wi-Fi 的第二台设备验证同步播放。
7. 需要异地连接时再开启 Cloudflare Tunnel 或自己的 HTTPS 域名。
8. 结束后停止 Tunnel，并备份整个 `SyncWatch同步观影-Data/`。

完整教程：[GitHub Pages](https://xuange6610.github.io/SyncWatch/) · [仓库文档](https://github.com/xuange6610-oss/SyncWatch/tree/main/docs) · [Wiki](https://github.com/xuange6610-oss/SyncWatch/wiki)

## 安全与许可

本版本已通过仓库规范、隐私字段、桌面发布、Android 包、Cloudflared bundle 和核心集成检查。发布包未签署商业代码签名证书时，Windows/macOS 可能显示系统来源提示；请只从本 Release 下载并核对摘要。

SyncWatch同步观影按 Apache-2.0 开源。原创项目设计和本仓库原始实现由 xuan 完成。再发布必须保留许可证、NOTICE 和适用的原始署名，标注修改，不得把原始项目或少量修改虚假宣称为自己的原创作品。
