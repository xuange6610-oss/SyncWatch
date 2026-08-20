# SyncWatch同步观影 v2.1.8

## 本次发布

v2.1.8 是本项目当前最新版本，面向 Windows、Android、macOS 与独立服务器用户。此次发布重点解决版本标识不一致、Android 服务端构建与登录协议兼容性、发布包校验和文档入口不同步问题。

## 本次 UI/UX 重构（完整记录）

本次不是只调整颜色，而是按 Taste、UI UX Pro Max 和 Impeccable 的操作型界面规范重新组织现有界面；所有原有按钮、文字、弹窗、管理模块和业务事件仍保留。

### 视觉系统

- 新增 `public/css/ui-v218.css`，作为 v2.1.8 的独立界面层，加载在原有样式之后，避免破坏旧功能选择器。
- 页面底色从混杂的主题默认值统一为近黑影院墨色 `#090c0f`，工作区分层使用 `#10161a`、`#151d22` 和 `#1c272d`；这些颜色已同步登记在 `DESIGN.md`，不再由各组件临时写色值。
- 统一同步信号色为 `#39d8a2`：只用于连接成功、可继续操作、当前同步状态和主按钮；错误使用行动珊瑚色，键盘焦点使用焦点琥珀色，避免颜色承担多重含义。
- 统一控件圆角为 4-6px，减少大胶囊和嵌套玻璃卡片；静态内容使用细边框，只有悬停、弹窗和主按钮使用阴影。
- 字体继续使用系统中文字体，代码/状态数字使用 Cascadia Code/Consolas 等宽回退，确保 Windows、macOS 与 Android 无需额外下载字体。

### 登录页

- 重新排布为“左侧产品证据 + 右侧连接动作”的双列结构，3D 立方体保留，但不再与登录表单争夺同一视觉层级。
- 新增 `01 / CONNECT` 连接步骤标识、统一错误横幅和明确的登录版本信息。
- 账号、密码、房间号、房间密码和在线房间选择保持原字段与功能，表单输入高度、焦点、占位文本和错误状态统一。
- 手机宽度自动改为表单优先、产品视觉下移；桌面端保留完整产品视觉，避免新手不知道软件是什么。
- 所有主按钮、次按钮、密码显示、在线房间刷新、下载入口继续使用原有 ID 和事件绑定，因此没有删除任何业务入口。

### 房间工作区

- 顶部改为三段层级：品牌身份、房间/在线/同步状态、操作区；操作区允许横向滚动或进入移动菜单，不再把所有按钮压成同一层级。
- 桌面端工作区固定为“片库 260px + 播放器主区 + 成员 320px”三列，播放器获得最大面积；窄屏自动收为播放器主区，片库使用抽屉式面板。
- 当前影片、在线人数、本机延迟、播放同步、实时上传、实时下载六项状态使用稳定网格，异步更新不会让布局跳动。
- 影片库、队列、成员列表、聊天消息、工具栏和设置面板统一表面、边框和悬停反馈；原有上传、播放、队列、聊天、屏幕共享、公网访问、管理中心入口全部保留。
- 移动端保留观影、片库、聊天、成员四个模块入口，并保证触控目标不小于 44px；桌面端不显示多余的移动导航。

### 动效、无障碍与性能

- 只为表单进入、悬停、焦点和状态切换添加 160-420ms 的动效，使用 `transform` 和 `opacity`，不动画化宽高和位置以免页面抖动。
- 增加统一的键盘焦点轮廓；焦点不依赖颜色变化，鼠标和键盘都能看到当前控件。
- 增加 `prefers-reduced-motion: reduce` 降级规则，用户关闭动态效果时 3D 旋转和进入动画不会阻塞操作。
- 未新增第三方前端依赖，避免增加首屏下载和 Electron/Android 包体积。
- 根据最终 Impeccable 检查移除了装饰性网格背景，登录页现在只保留纯影院底色、真实 3D 产品视觉和结构边界，避免通用“科技模板”特征。

### Android 登录错误修复

- 普通账号登录此前直接显示服务端笼统的“服务器处理请求失败”，没有调用已有错误解析器；现在统一调用 `loginErrorMessage(result)`。
- 当服务端返回 `SOCKET_EVENT_FAILED` 时，安卓 WebView 与桌面网页都会显示事件名称、`SW-...` 错误编号、数据目录/设备时间/重新连接建议，并通过 toast 重复提示一次。
- 服务端仍只向客户端发送安全错误编号，不泄露堆栈；真实异常继续写入服务器日志，管理员可按错误编号检索。
- 登录初始化网络异常也改为明确的连接失败提示，不再显示“正在自动重试”但没有下一步的模糊文案。

### 测试与发布记录

- `node tests/frontend-v205.test.js`：通过，新增检查 v2.1.8 样式入口、设计契约、普通登录错误编号和减少动态效果。
- `node tests/ui-layout.test.js`：通过，顶部播报布局无回归。
- `node tests/android-package.test.js --source-only`：通过，生产依赖与 Android 源代码契约完整。
- `node tests/integration.test.js`：通过，54 项服务端/账户/房间/媒体/权限/同步集成检查全部通过。
- Impeccable detector：无结构性 slop 阻断项；新 UI token 已补写入 `DESIGN.md`，检测器提出的非阻断字号/透明度提示属于明确的状态层 token。
- 已使用 Playwright Chromium 检查桌面登录页和 390×844 移动登录页，确认表单、3D 视觉、顶部导航和移动布局无重叠。

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
| `SyncWatch-Server-v2.1.8.exe` | Windows 服务端主程序 | 由 Release 页面显示 | `81D3B62D55819BD6011AC729B08D0C6FDBADCB8ADBDEE5C3FE15AD79BF3C32BB` |
| `SyncWatch-Client-v2.1.8.exe` | Windows 客户端 | 由 Release 页面显示 | `5BBED9DFCD3EFA3795C186FB0B83EF5F1BAA84EA3CC6156704420B3A3A36BD4F` |
| `SyncWatch-Experience-Client-Portable-v2.1.8-x64.exe` | Windows 体验版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-Standard-Server-Portable-v2.1.8-x64.exe` | Windows 标准版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-v2.1.8-Full-Offline-Installer-x64.exe` | Windows 完整安装版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-v2.1.8-Full-Offline-Portable-x64.exe` | Windows 完整便携版 | 由 Release 页面显示 | 以 Release 页面为准 |
| `SyncWatch-Android-v2.1.8-universal.apk` | Android 通用 APK | 由 Release 页面显示 | `15B2DDEE00268B02BEF117DD8F22CD9DB4D6F1DE9D5A5D864960DB9D9803C142` |
| `SyncWatch-Standalone-Server-v2.1.8.zip` | 独立服务器部署包 | 由 Release 页面显示 | `C15E6BDE608AB7688F10EEA5B98BB031126EB6898AB0CA37C5930D75B7DC9B30` |

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
