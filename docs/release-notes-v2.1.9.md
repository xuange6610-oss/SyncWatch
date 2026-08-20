# SyncWatch同步观影 v2.1.9

和朋友、家人、情侣远程一起看电影。v2.1.9 提供 Windows 一键安装与便携运行、Android 通用 APK，以及由真实 macOS runner 构建的 Intel / Apple Silicon 客户端、服务器和完整离线包。

> 第一次使用请立即修改默认管理员密码，并先在局域网完成连接测试，再开启公网访问。

| 下载文件 | 版本标识 | 最适合谁 | 一句话说明 |
| --- | --- | --- | --- |
| [`SyncWatch-Experience-Client-Portable-v2.1.9-x64.exe`](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Experience-Client-Portable-v2.1.9-x64.exe) | 体验版 | Windows 普通成员 | 连接已有服务器，不在本机启动服务端 |
| [`SyncWatch-Standard-Server-Portable-v2.1.9-x64.exe`](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Standard-Server-Portable-v2.1.9-x64.exe) | 标准版 | 不想安装的 Windows 房主 | 内置运行环境和 cloudflared，绿色便携运行 |
| [`SyncWatch-v2.1.9-Full-Offline-Installer-x64.exe`](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-v2.1.9-Full-Offline-Installer-x64.exe) | 完整版 | 需要离线全平台下载中心的 Windows 房主 | 安装向导、完整服务器运行时，并离线内嵌 Windows、Android 与 macOS 发布文件 |
| [`SyncWatch-v2.1.9-Full-Offline-Portable-x64.exe`](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-v2.1.9-Full-Offline-Portable-x64.exe) | 完整版 | 不想安装的 Windows 房主 | 独立 EXE，直接双击运行；功能和离线资源与安装完整版相同 |
| [macOS Intel 完整版 DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-x64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-x64.zip) | 完整版 | Intel Mac 房主 | x64 完整服务器、cloudflared 和全平台离线下载中心 |
| [macOS Apple 芯片完整版 DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-arm64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-arm64.zip) | 完整版 | Apple Silicon 房主 | arm64 完整服务器、cloudflared 和全平台离线下载中心 |
| [cloudflared Windows x64 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-windows-x64-installer.msi) / [x86 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-windows-x86-installer.msi) | 公网工具 | 需要手工安装 Tunnel 的 Windows 用户 | 双击 MSI 安装，不要双击命令行 EXE；安装后运行 `cloudflared --version` |
| [Node.js Windows x64 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-x64.msi) / [Windows ARM64 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-arm64.msi) / [macOS Intel PKG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-macos-x64.pkg) / [macOS Apple 芯片包](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-darwin-arm64.tar.gz) | 开发环境 | 源码开发或独立服务器用户 | 安装后运行 `node --version`；正式 SyncWatch EXE 已内置运行环境，无需另装 Node.js |

## v2.1.9 更新公告

v2.1.9 是本项目当前最新版本，面向 Windows、Android、macOS 与独立服务器用户。此次发布重点更新超级管理员登录后的管理入口、统一 `v` 前缀版本规则，并重新构建和校验全部平台发布文件。

## 版本范围声明

本次是从 v2.1.8 到 v2.1.9 的兼容更新，不是重新定义产品。房间、同步播放、媒体上传、聊天、弹幕、语音、屏幕/网页共享、权限模型、数据目录和普通账号入房方式继续沿用 v2.1.8；已有账号、房间、媒体和配置不需要因为升级而重建。以下清单只记录实际发生的管理入口、版本、文档、构建和发布变化。

## 完整变更清单

### 1. 版本与兼容标识

- 根目录 `package.json` 从 `2.1.8` 更新为 `2.1.9`；Electron 服务器、独立客户端、独立服务器和公开配置均返回/显示 `v2.1.9`。
- Android `versionName` 更新为 `2.1.9`，`versionCode` 更新为 `20109`；WebView User-Agent、手机服务器下载元数据和 APK 下载文件名同步更新。
- 首次登录使用协议默认版本、发现服务广播版本、媒体管理导出 JSON、服务器 JSON/二进制备份文件名统一使用 `2.1.9`。
- Windows 安装版、Windows 便携完整版、体验版、标准版、客户端、服务端和独立服务器 ZIP 的文件名与构建契约统一为 `v2.1.9`；旧的 `v2.1.8` 文件不会被改名后继续冒充新包。
- Git 标签、Release 标题/URL、发布分支和用户可见版本统一使用 `vX.Y.Z`；已经移除无 `v` 的重复标签。`package.json` 与 Android `versionName` 仍按工具链要求使用纯数字 SemVer。
- 仓库、Pages、Wiki、Release 和下载入口统一使用当前 GitHub 地址 `xuange6610/SyncWatch`；仓库 slug 仍保持 `SyncWatch`，产品显示名称仍为 `SyncWatch同步观影`。

### 2. 超级管理员登录流程

- 服务器设备在登录页点击“超级管理员登录”并验证成功后，直接打开“管理中心 → 服务器设置”。
- 管理专用会话继续显示登录页并隐藏观影主界面，不再先创建或进入临时房间，也不会写成下次启动的普通登录令牌。
- 管理员可以先完成端口、局域网、公网、上传和权限策略设置，再主动进入房间；普通账号、游客和成员的登录入房流程保持不变。
- 管理中心再次要求验证超级管理员时复用同一管理专用会话，减少重复跳转。

### 3. 页面、文档与交互

- 增加浏览器回归断言，验证管理员成功登录后服务器设置为默认模块、登录页仍可见、观影主界面保持隐藏。
- README、PRODUCT、DESIGN、管理中心教程、Wiki 镜像和生成的 HTML 教程同步到 v2.1.9 管理流程。
- 账户、播放器、截图/3D 文档页和下载入口继续保持 v2.1.8 的界面基线；本版本没有恢复已经撤销的 UI 重构，也没有删除旧功能。

### 4. 发布与构建流程

- Windows 和 macOS Release 工作流输入统一要求 `vX.Y.Z`；无 `v` 的输入会在构建开始时直接失败，避免再次产生重复标签或错误下载路径。
- 历史 v2.1.7/v2.1.8 公告中的下载 URL 已修正为真实的 `/releases/download/vX.Y.Z/` 路径。
- Android 正式 APK 从 v2.1.9 源码重新构建和签名，工作流锁定其 SHA-256；Windows 和 macOS 应用包由对应平台 runner 从同一 v2.1.9 标签构建。
- 正式发布仍执行 26 个维护者资产加两个 GitHub 源码归档的 28 文件门禁，禁止空文件、旧应用包改名和缺项发布。

### 5. 测试与验收

- 核心集成测试、仓库规范、隐私、浏览器 UI、Electron、Android 源码/包契约和桌面发布契约均按 v2.1.9 重新执行。
- Android 正式 APK 已通过 Gradle 构建、badging、签名、124 个生产 Node 包、36 个前端文件和三种 ABI 校验。
- 当前工作站没有连接 Android 真机，因此不把小米 14/HyperOS 真机兼容写成已经通过；v2.1.8 的 Android 15 模拟器记录仅作为继承基线。

## 与 v2.1.8 保持不变

- 同步播放权威时钟、房间密码/人数限制、成员与权限组、媒体审核/队列、聊天/私聊/弹幕、语音、屏幕共享、邮件验证、备份恢复和管理中心 11 个模块的业务规则不变。
- 默认数据目录仍为 `SyncWatch同步观影-Data/`，升级仍需停止服务并备份整个目录；同一目录仍只允许一个实例写入。
- Windows 服务器 EXE 仍内置 Node/Electron、FFmpeg、FFprobe 和 cloudflared；体验版仍只连接已有服务器，标准版仍用于 Windows 房主，完整版仍用于离线资源分发。
- Android 仍不能在 APK 内直接运行 Windows/Linux 的 cloudflared；手机公网使用场景仍需连接已开启 Tunnel 的桌面、macOS、Linux 或云服务器。
- Apache-2.0 许可证、`xuan` 署名、数据保护要求和外部贡献流程不变。

## Android 版本与兼容性

- Android `versionName` 已统一为 `2.1.9`，`versionCode` 为 `20109`。
- APK 使用 Node.js Mobile `18.20.4`，并包含 SyncWatch 服务端运行所需的生产依赖和静态资源。
- 通用 APK 已验证包含 `arm64-v8a`、`armeabi-v7a` 与 `x86_64` 三种 ABI，可覆盖常见 ARM 手机、32 位 ARM 设备和 x86_64 模拟器。
- 构建脚本会检查 APK badging、版本号、ABI、Node.js 运行时、生产包数量和前端资源，避免“能安装但缺少服务文件”的不完整包。
- Android 本机服务支持本机访问以及同一 Wi-Fi/热点内的局域网访问；WebView 登录、房间、播放同步、聊天和原生屏幕共享桥接沿用同一套服务端协议。
- v2.1.8 已验证的 Node.js Mobile 兼容处理、错误编号和局域网服务器能力继续沿用；v2.1.9 没有重新实现登录协议或宣称新的厂商兼容修复。
- 本版本只同步 Android WebView User-Agent、手机服务器 APK 下载元数据、内嵌 APK 文件名、`versionName`/`versionCode` 和构建契约，避免手机端入口继续指向旧版本。
- 本工作站没有连接 Android 真机或模拟器，不能把小米 14/HyperOS 的登录、后台保活和屏幕共享写成已验证；请按排错文档检查权限、电池优化、局域网地址和 HTTPS/Tunnel。

### 公网访问边界

Android APK 不内置也不执行 Windows/Linux 的 `cloudflared` 二进制。Cloudflare 官方没有一个可以安全、通用地直接嵌入 Android APK 的同等运行包，因此不能把手机本机 Tunnel 宣称为已支持。手机用户需要连接一台已经在 Windows、macOS、Linux 或云服务器上启动并开启 Cloudflare Tunnel 的 SyncWatch 服务器；该连接路径支持公网登录和同步观影。Android 本机仍可正常启动服务器并在局域网使用。

## 桌面与服务器更新

- 源码、公共配置、Dockerfile、构建脚本、下载入口、GitHub Pages 与 Wiki 当前版本统一为 `2.1.9`。
- 统一替换残留的旧版本路径和文案，修复下载链接、运行时提示、备份文件名、发现服务广播和公开配置可能继续显示旧版本的问题。
- 超级管理员在登录页完成验证后进入管理中心的“服务器设置”，登录页保持可见且不会先进入观影房间；管理员完成设置后再主动进入房间，普通用户流程不变。
- 登录页顶部间距在桌面和窄屏规则中收紧，减少短屏打开时的空白；字段、按钮和主要业务布局保持原有结构。
- 发布工作流现在只接受 `vX.Y.Z` 标签，并将同一标签作为 Windows/macOS 构建和下载输入，避免无 `v` 的重复标签和半成品下载路径。
- Windows 工作流直接用 ASCII 标准文件名上传 Android APK，避免中文本地别名在 runner 上编码损坏后生成重复资产；Release 只保留 `SyncWatch-Android-v2.1.9-universal.apk`。
- Windows/macOS 构建流程保留平台架构边界：Windows 桌面发布包提供 x64；macOS 通过 GitHub Actions 的 macOS runner 构建 Intel x64 与 Apple Silicon arm64。现代 Electron/macOS 不提供可验证的 32 位桌面包，因此不上传虚假的 32 位文件。
- 完整包、标准包、体验包、独立服务器包和运行时资产必须使用真实构建产物；禁止仅修改旧文件名冒充新版本。

## 验证记录

本次已通过：

```text
node tests/integration.test.js
node tests/account-v205-backend.test.js
node tests/android-package.test.js --source-only
Android APK Gradle build: BUILD SUCCESSFUL
APK payload: 124 production Node.js packages, 36 public files, 3 native ABIs
APK signing: v1/v2/v3 verified
GitHub Actions: contribution checks and Pages deployment passed for the v2.1.9 source commit
```

上面的 APK 构建、签名、包内容和源码契约证据来自本次 v2.1.9 构建；本工作站没有 Android 真机或模拟器运行证据，因此不宣称已完成设备安装、登录、断线重连或小米 14/HyperOS 验证。

## 普通用户怎么选

### 体验版

- **在线展示**：[打开 GitHub Pages](https://xuange6610.github.io/SyncWatch/)，查看真实界面、功能截图和逐步教程。它是静态展示，不运行真实服务器。
- **Windows 客户端**：[下载体验版独立 EXE](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Experience-Client-Portable-v2.1.9-x64.exe)，适合成员连接已经运行的服务器，不在本机启动服务端。

### 标准版与完整版

- **Windows 标准服务器**：[下载标准版独立 EXE](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Standard-Server-Portable-v2.1.9-x64.exe)，双击启动，无需安装 Git、Node.js 或 npm。
- **Windows 安装完整版**：[下载安装程序](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-v2.1.9-Full-Offline-Installer-x64.exe)，提供安装、卸载、桌面快捷方式、开始菜单和完整离线下载资源。
- **Windows 独立 EXE 完整版**：[下载便携完整版](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-v2.1.9-Full-Offline-Portable-x64.exe)，无需安装，放在普通文件夹后直接双击，功能和内嵌跨平台资源与安装完整版一致。
- **Android 完整 APK**：[下载通用 APK](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Android-v2.1.9-universal.apk)，可加入房间，也可在受支持设备上运行手机服务器。

## 跨平台完整套装

完整版把已真实构建的离线下载资源放进 Windows/macOS 房主端。房主启动 SyncWatch 后，成员可以从登录页或账号菜单下载适合自己设备的文件：

1. Windows 成员下载客户端 EXE。
2. Android 成员下载通用 APK。
3. Intel Mac 成员下载 x64 客户端。
4. Apple Silicon Mac 成员下载 arm64 客户端。
5. Mac 房主下载对应架构的服务器包。
6. 临时公网访问优先使用服务器内置的 cloudflared；独立工具资产用于手工部署、诊断和修复。

管理中心的“通知/通告设置”可以隐藏 Windows、macOS、Android 和服务器下载按钮，但隐藏入口不会从完整版中删除文件。升级或迁移前请停止服务并备份完整的 `SyncWatch同步观影-Data/`。

## 一键运行包含什么

Windows 正式服务器包内置 Electron/Node.js 运行时、应用前后端、生产依赖、Socket.IO、FFmpeg、FFprobe 和 Windows cloudflared。启动时会初始化数据目录、读取配置、检查端口、启动 HTTP/WebSocket 服务、显示局域网地址并打开应用窗口。

同一数据目录只允许一个实例写入。连续双击时，后启动的实例会提示已有进程，而不会创建两个服务器同时写数据。不同目录运行互不影响。

## macOS

macOS 客户端、服务器和完整离线版均提供 Intel x64 与 Apple Silicon arm64：

- **Intel 客户端**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Client-macOS-v2.1.9-x64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Client-macOS-v2.1.9-x64.zip)
- **Apple Silicon 客户端**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Client-macOS-v2.1.9-arm64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Client-macOS-v2.1.9-arm64.zip)
- **Intel 服务器**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Server-macOS-v2.1.9-x64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Server-macOS-v2.1.9-x64.zip)
- **Apple Silicon 服务器**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Server-macOS-v2.1.9-arm64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Server-macOS-v2.1.9-arm64.zip)
- **Intel 完整版**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-x64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-x64.zip)
- **Apple Silicon 完整版**：[DMG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-arm64.dmg) / [ZIP](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/SyncWatch-Full-Offline-macOS-v2.1.9-arm64.zip)

这些产物由 GitHub Actions 的真实 `macos-14` runner 分架构构建，并执行文件大小、SHA-256 和隐私字符串检查。现代 macOS 与 Electron 不支持 32 位应用，因此不提供虚假的 macOS 32 位包。

## 架构支持边界

- **Windows 正式桌面包**：x64。当前 Electron 41 和媒体工具发布链没有提供完整验证的 Windows 32 位组合。
- **Android 通用 APK**：包含 `armeabi-v7a`（32 位）、`arm64-v8a` 和 `x86_64`。
- **macOS**：Intel x64 与 Apple Silicon arm64，无现代 macOS 32 位。
- **独立服务器**：以 Node.js 22+ 对目标系统和架构的官方支持为准。

## cloudflared 独立工具

- [Windows x64 EXE](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-windows-x64.exe)
- [Windows x64 安装包 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-windows-x64-installer.msi)
- [Windows x86 安装包 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-windows-x86-installer.msi)
- [macOS Intel x64](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-macos-x64)
- [macOS Apple Silicon arm64](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/cloudflared-macos-arm64)

cloudflared 是 Cloudflare Tunnel 连接器，用于把本机 HTTP、Socket.IO 和媒体 Range 请求转发为 HTTPS 公网入口。它不保存 SyncWatch 账号或影片。完整服务器包优先使用内置文件；独立工具用于手工部署和网络诊断。官方文档：[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)。

## Node.js 官方环境包

Windows 正式 EXE 已内置运行时，不需要另装 Node.js。源码开发和独立服务器用户可下载：

- [Windows x64 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-x64.msi)
- [Windows arm64 MSI](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-arm64.msi)
- [macOS Intel x64 PKG](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-macos-x64.pkg)
- [macOS Apple Silicon arm64 tar.gz](https://github.com/xuange6610/SyncWatch/releases/download/v2.1.9/node-v24.19.0-darwin-arm64.tar.gz)

安装后在终端执行 `node --version` 和 `npm --version` 验证。Node.js 官网：[nodejs.org](https://nodejs.org/)。完整图文教程见 [cloudflared 与 Node.js 安装使用教程](https://xuange6610.github.io/SyncWatch/runtime-installation.html)。

## 本次构建产物与数量

v2.1.9 完整发布严格沿用 v2.1.7 的资产标准：Release API 有 26 个手动资产；加上 GitHub 自动生成的两个源码归档，页面共显示 28 个文件。所有资产必须是真实构建或经哈希核对的官方运行时，不用改名旧版本或空文件凑数，也不增加重复用途的额外文件。

所有下载文件以 GitHub Release 页面展示的大小和 SHA-256 为准。Android v2.1.9 通用 APK 大小为 `161,259,736` 字节，SHA-256 为 `67E6B06080A52F52EE456353ADBF8CBB3EA625E0B1A7D176A737D8B80E4F6886`。

## 已知限制

1. Android 本机不能直接运行 cloudflared；请使用桌面或云服务器 Tunnel。
2. macOS 32 位桌面包不存在于现代系统和 Electron 支持矩阵中，因此仅提供 x64 与 arm64。
3. v2.1.8 的 Android 15 模拟器记录只能作为继承基线，不等同于 v2.1.9 的小米/HyperOS 真机验证；厂商 ROM 的权限弹窗、后台保活和屏幕共享授权仍需按 Wiki 的 Android 排错页检查电池优化、局域网权限和服务器地址。
