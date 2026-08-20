# SyncWatch同步观影 v2.1.8

## 本次发布

v2.1.8 是本项目当前最新版本，面向 Windows、Android、macOS 与独立服务器用户。此次发布重点解决版本标识不一致、Android 服务端构建与登录协议兼容性、发布包校验和文档入口不同步问题。

## 版本范围声明

本次是从 v2.1.7 到 v2.1.8 的兼容更新，不是重新定义产品。房间、同步播放、媒体上传、聊天、弹幕、语音、屏幕/网页共享、权限模型、数据目录、启动方式和主要页面结构继续沿用 v2.1.7；已有账号、房间、媒体和配置不需要因为升级而重建。以下清单只记录实际发生的修复、版本迁移、可访问性微调、构建流程和发布文件变化。

## 完整变更清单

### 1. 版本与兼容标识

- 根目录 `package.json` 从 `2.1.7` 更新为 `2.1.8`；Electron 服务器、独立客户端、独立服务器和公开配置均返回/显示 `v2.1.8`。
- Android `versionName` 更新为 `2.1.8`，`versionCode` 更新为 `20108`；WebView User-Agent、手机服务器下载元数据和 APK 下载文件名同步更新。
- 首次登录使用协议默认版本、发现服务广播版本、媒体管理导出 JSON、服务器 JSON/二进制备份文件名统一使用 `2.1.8`。
- Windows 安装版、Windows 便携完整版、体验版、标准版、客户端、服务端和独立服务器 ZIP 的文件名与构建契约统一为 `v2.1.8`；旧的 `v2.1.7` 文件不会被新构建覆盖后继续冒充新包。
- 仓库、Pages、Wiki、Release 和下载入口统一使用当前 GitHub 地址 `xuange6610/SyncWatch`；仓库 slug 仍保持 `SyncWatch`，产品显示名称仍为 `SyncWatch同步观影`。

### 2. Android 登录与错误诊断

- 修复部分 Node.js Mobile 18 构建缺少 `crypto.randomUUID` 时，游客账号创建、登录审计或设备会话在服务端直接异常的问题；服务端现在使用符合 UUID v4 的 `crypto.randomBytes` 回退，桌面 Node/Electron 仍优先使用原生实现。
- 普通账号、游客、服务器管理员登录失败统一经过 `loginErrorMessage(result)`，不再只显示“服务器处理请求失败”。
- Socket 处理异常现在包含安全的 `SOCKET_EVENT_FAILED`、事件名和 `SW-...` 错误编号；客户端根据编号给出数据目录可写、设备时间、重新连接和联系管理员等处理建议。
- 服务端日志保留完整堆栈并关联同一个错误编号，但不会把堆栈或敏感内容发送到 Android/Web 客户端。
- 登录初始化网络异常会显示明确的连接失败信息和错误提示，不再显示没有行动指引的“正在自动重试”。

### 3. 页面与交互的兼容性微调

- 短屏横向窗口中展开聊天时，播放器和聊天栏保持双列布局，避免移动端规则把聊天栏压到视频边缘。
- 增强下拉框保留确定性的原生指示器，禁用状态仍可被辅助技术识别；不改变已有字段、选项或业务流程。
- 账户、管理中心、播放器、截图/3D 文档页和下载入口的内容与主要导航保持 v2.1.7 结构；本版本没有新增“重新设计首页”或删除旧功能。

### 4. 发布与构建流程

- Windows/macOS Actions 改为直接从 Cloudflare 官方 latest Release 获取匹配架构的 `cloudflared`，再执行体积检查；不再依赖当前 SyncWatch Release 中预先存在的同名工具资产。
- Windows Release runner 先构建并上传已签名 Android APK，再把真实 APK、Windows 客户端和 macOS ZIP 放入离线完整版；离线包验证会检查六个平台资源、最小体积和文件闭包。
- Windows、macOS 和 Android 构建脚本、Electron Builder 配置、独立服务器打包脚本以及发布契约测试全部切换到 `2.1.8`，并禁止构建阶段隐式发布或把旧资产当作新资产。
- 由于当前工作站为 Windows，macOS DMG/ZIP 只能以 macOS runner 实际产物为准；没有真实资产时，下载接口返回“尚未提供”，不会生成伪造链接。

### 5. 测试与验收

- 更新前端、服务端、Android、独立服务器、macOS 下载、Tunnel、平台契约和 Release 文件名测试中的版本期望。
- 新增普通账号登录错误编号和 `SOCKET_EVENT_FAILED` 的前端契约断言。
- 新增 `tests/android-node-compat.test.js`，主动移除原生 `crypto.randomUUID` 后启动完整服务，并验证 Android 设备信息下的服务器管理员和游客登录。
- 当前已通过仓库规范检查、54 项集成检查、Android 源码包检查、桌面 Release 契约、cloudflared/服务器包检查及相关 UI 布局检查；没有 Android 真机/模拟器时，不把真实触屏回归写成已完成。

## 与 v2.1.7 保持不变

- 同步播放权威时钟、房间密码/人数限制、成员与权限组、媒体审核/队列、聊天/私聊/弹幕、语音、屏幕共享、邮件验证、备份恢复和管理中心 11 个模块的业务规则不变。
- 默认数据目录仍为 `SyncWatch同步观影-Data/`，升级仍需停止服务并备份整个目录；同一目录仍只允许一个实例写入。
- Windows 服务器 EXE 仍内置 Node/Electron、FFmpeg、FFprobe 和 cloudflared；体验版仍只连接已有服务器，标准版仍用于 Windows 房主，完整版仍用于离线资源分发。
- Android 仍不能在 APK 内直接运行 Windows/Linux 的 cloudflared；手机公网使用场景仍需连接已开启 Tunnel 的桌面、macOS、Linux 或云服务器。
- Apache-2.0 许可证、`xuan` 署名、数据保护要求和外部贡献流程不变。

## Android 登录错误修复

- 普通账号登录此前直接显示服务端笼统的“服务器处理请求失败”，没有调用已有错误解析器；现在统一调用 `loginErrorMessage(result)`。
- 当服务端返回 `SOCKET_EVENT_FAILED` 时，安卓 WebView 与桌面网页都会显示事件名称、`SW-...` 错误编号、数据目录/设备时间/重新连接建议，并通过 toast 重复提示一次。
- 服务端仍只向客户端发送安全错误编号，不泄露堆栈；真实异常继续写入服务器日志，管理员可按错误编号检索。
- 登录初始化网络异常也改为明确的连接失败提示，不再显示“正在自动重试”但没有下一步的模糊文案。

## 登录修复验证记录

- `node tests/frontend-v205.test.js`：通过，普通账号登录错误编号契约有效。
- `node tests/ui-layout.test.js`：通过，顶部播报布局无回归。
- `node tests/android-package.test.js --source-only`：通过，生产依赖与 Android 源代码契约完整。
- `node tests/integration.test.js`：通过，54 项服务端/账户/房间/媒体/权限/同步集成检查全部通过。

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

## 本次构建产物

以下文件均由本次 v2.1.8 构建生成，Release 页面会同时显示文件大小；下载后可使用 SHA-256 校验。

| 文件 | 用途 | 大小 | SHA-256 |
| --- | --- | ---: | --- |
| `SyncWatch-Server-v2.1.8.exe` | Windows 服务端主程序 | 由 Release 页面显示 | `13C1E62AB1346C6B99BA02BF504F2B0D427A2E5DC80CB0EE1C07BEC353930369` |
| `SyncWatch-Client-v2.1.8.exe` | Windows 客户端 | 由 Release 页面显示 | `ADC878118128254E4977035F0CFFFB0FF50CC5A8B55449A68D41397A5D7D728A` |
| `SyncWatch-Experience-Client-Portable-v2.1.8-x64.exe` | Windows 体验版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-Standard-Server-Portable-v2.1.8-x64.exe` | Windows 标准版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-v2.1.8-Full-Offline-Installer-x64.exe` | Windows 完整安装版 | 由 Release 页面显示 | `46724EDF20CC567184E82F3BECC8B40875226B0EC7F39E2ACDB1F5ADBBD35C98` |
| `SyncWatch-v2.1.8-Full-Offline-Portable-x64.exe` | Windows 完整便携版 | 由 Release 页面显示 | `A34E4EFA7D978FC6699A233F3E7BCEC7115E9D742A075462B14279225E9FF403` |
| `SyncWatch-Android-v2.1.8-universal.apk` | Android 通用 APK（Node.js Mobile UUID 登录兼容修复） | 161,259,139 字节 | `5FD5AC875765FB3AB8967F8F4E7BCC5BC419765CC6636704800112C2CF9C1C5C` |
| `SyncWatch-Standalone-Server-v2.1.8.zip` | 独立服务器部署包 | 由 Release 页面显示 | `600A9B3368A76134828B96891651BB1FC6EBAC199877730E1FC13A0D92EF2E26` |

Windows 完整版安装包和便携包均内置可离线使用的服务器运行环境；体验版只连接已有服务器；标准版用于在 Windows 上启动服务器。当前构建机没有真实 macOS DMG/ZIP 产物，因此不会上传伪造的 macOS 文件，macOS 构建由 GitHub Actions 的 macOS runner 单独生成。

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
