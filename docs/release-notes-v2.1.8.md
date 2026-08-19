# SyncWatch同步观影 v2.1.8

## 本次发布

v2.1.8 是本项目当前最新版本，面向 Windows、Android、macOS 与独立服务器用户。此次发布重点解决版本标识不一致、Android 服务端构建与登录协议兼容性、发布包校验和文档入口不同步问题。

## Android 更新

- Android `versionName` 已统一为 `2.1.8`，`versionCode` 为 `20108`。
- APK 使用 Node.js Mobile `18.20.4`，并包含 SyncWatch 服务端运行所需的生产依赖和静态资源。
- 通用 APK 已验证包含 `arm64-v8a`、`armeabi-v7a` 与 `x86_64` 三种 ABI，可覆盖常见 ARM 手机、32 位 ARM 设备和 x86_64 模拟器。
- 构建脚本会检查 APK badging、版本号、ABI、Node.js 运行时、生产包数量和前端资源，避免“能安装但缺少服务文件”的不完整包。
- Android 本机服务支持本机访问以及同一 Wi-Fi/热点内的局域网访问；WebView 登录、房间、播放同步、聊天和原生屏幕共享桥接沿用同一套服务端协议。
- 修正了 Android 运行时生成 `mobile-index.js` 时的 Unicode 用户名正则和 `path-to-regexp` 兼容补丁，避免部分账号或路由在手机端启动失败。
- 修复 Socket 处理异常只返回笼统提示的问题：服务端日志现在带事件名和错误编号，客户端收到安全错误码，安卓登录失败时可将编号交给管理员定位；堆栈不会发送给客户端。
- 修复 Windows PowerShell 构建脚本的 UTF-8 编码标记，避免中文 APK/客户端文件名在 Windows PowerShell 下变成乱码并导致旧版本文件未被覆盖。

### 公网访问边界

Android APK 不内置也不执行 Windows/Linux 的 `cloudflared` 二进制。Cloudflare 官方没有一个可以安全、通用地直接嵌入 Android APK 的同等运行包，因此不能把手机本机 Tunnel 宣称为已支持。手机用户需要连接一台已经在 Windows、macOS、Linux 或云服务器上启动并开启 Cloudflare Tunnel 的 SyncWatch 服务器；该连接路径支持公网登录和同步观影。Android 本机仍可正常启动服务器并在局域网使用。

## 桌面与服务器更新

- 源码、公共配置、Dockerfile、构建脚本、下载入口、GitHub Pages 与 Wiki 当前版本统一为 `2.1.8`。
- 修复旧版本硬编码 `2.1.7` 导致下载链接、运行时提示和发布说明显示旧版本的问题。
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
```

当前环境没有连接 Android 真机或模拟器（无 `adb` 设备），因此本次不能声称完成真实触屏登录回归。发布前应使用一台 Android 设备按《Android 安装与连接》逐步验证登录、创建房间、播放同步、聊天、局域网访问，并把连接已开启公网 Tunnel 的桌面服务器作为公网回归环境。

## 下载建议

- **体验版**：仅作为成员连接已有服务器，体积小，不在本机启动服务器。
- **标准版**：适合 Windows 房主直接启动服务器，包含桌面运行时和公网访问所需组件。
- **完整版**：离线资源最完整，适合没有网络或需要一次性分发多端客户端的房主。
- **Android 通用 APK**：`SyncWatch-Android-v2.1.8-universal.apk`，安装前请在手机中允许当前浏览器/文件管理器安装未知来源应用。
- **独立服务器包**：适合 Windows Server、Linux、Docker 或手动 Node.js 部署。

所有下载文件应以 GitHub Release `2.1.8` 页面展示的 SHA-256 为准。Windows 正式 EXE 已内置运行时，不要求用户另装 Node.js；Node.js 与 cloudflared 独立安装包仅供源码部署、手动运维和诊断使用。

## 已知限制

1. Android 本机不能直接运行 cloudflared；请使用桌面或云服务器 Tunnel。
2. macOS 32 位桌面包不存在于现代系统和 Electron 支持矩阵中，因此仅提供 x64 与 arm64。
3. 未连接真机时无法验证厂商 ROM 的权限弹窗、后台保活和屏幕共享授权，遇到问题请按照 Wiki 的 Android 排错页检查电池优化、局域网权限和服务器地址。
