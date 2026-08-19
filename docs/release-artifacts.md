# 发布文件与下载说明

GitHub Release 是给普通用户下载成品的地方；仓库首页的 `Source code (zip)` 只是源码快照，不是完整安装包。每一个上传文件都必须有版本号、平台、角色和架构说明。

## 文件分类

| 文件类型 | 文件名模式 | 谁下载 | 能做什么 | 注意事项 |
| --- | --- | --- | --- | --- |
| Windows 服务器 EXE | `SyncWatch同步观影-v版本.exe` | 房主、服务器管理员 | 启动完整服务器、管理房间、上传媒体和配置公网访问 | 当前构建为 Windows x64；首次登录后立即修改 `admin888` |
| Windows 客户端 EXE | `SyncWatch同步观影-Client-v版本.exe` | 普通成员 | 输入服务器地址加入房间，不在本机运行服务器 | 当前构建为 Windows x64；需要房主先启动服务 |
| Android APK | `SyncWatch同步观影-v版本.apk` | Android 用户 | 加入房间；支持的设备可以启动手机服务器 | 包含 `arm64-v8a`、`armeabi-v7a` 和 `x86_64` ABI |
| 独立服务器 ZIP | `SyncWatch同步观影-Server-v版本.zip` | Windows/Linux/Docker 管理员 | 使用 Node.js、启动脚本或 Docker 长期部署 | 包含生产依赖、FFmpeg/FFprobe、cloudflared、客户端和 APK |
| macOS 服务器 DMG/ZIP | `SyncWatch同步观影-服务器-v版本-x64/arm64.*` | Mac 房主 | Intel 或 Apple Silicon 上运行服务器 | 必须由 macOS 主机或 macOS CI 生成，不能用 Windows 文件冒充 |
| macOS 客户端 DMG/ZIP | `SyncWatch同步观影-客户端-v版本-x64/arm64.*` | Mac 成员 | Intel 或 Apple Silicon 上加入房间 | 需要系统允许网络、麦克风或屏幕共享权限时按提示授权 |
| cloudflared 安装包 | `cloudflared-平台-架构` | 需要手工配置 Tunnel 的管理员 | 把本地 HTTP 服务安全映射到 Cloudflare 网络 | 只从 Cloudflare 官方 Release 下载并校验 SHA-256 |

## 选择流程

1. 你是房主：Windows 下载服务器 EXE；Mac 下载 macOS 服务器包；Linux 优先下载独立服务器 ZIP 或使用 Docker。
2. 你是成员：下载对应平台的客户端；也可以直接用浏览器打开房主发来的地址。
3. 你只想试用：先看 GitHub Pages 展示站；它展示真实界面，但不能替代服务器。
4. 你要开发：下载源码，安装 Node.js 22+，执行 `npm ci` 和 `npm start`。
5. 看到不存在的平台资产：不要下载相似名称的第三方文件；按 `docs/macos-build.md` 或构建脚本自行生成。

## 下载后校验

在 Release 页面打开对应文件旁的 SHA-256 校验值，PowerShell 使用：

```powershell
Get-FileHash .\SyncWatch同步观影-v2.1.6.exe -Algorithm SHA256
```

Linux/macOS 使用：

```bash
shasum -a 256 SyncWatch同步观影-v2.1.6.apk
```

如果哈希不同、文件大小为 0，或者文件名中的版本与 Release 不一致，请删除文件并重新下载。

## 为什么不把所有平台塞进一个 EXE

Windows、macOS、Android 的运行时、签名方式、CPU 架构和系统权限不同。服务器 EXE 不嵌入客户端 EXE、APK 或 macOS 文件，避免下载体积膨胀和错误启动；独立服务器 ZIP 才会按文档需要附带可下载的客户端和 APK。

## Release 备注应包含的内容

每次发布说明至少写明：版本号、构建提交、支持的平台和架构、服务器/客户端区别、默认登录后的安全动作、是否包含 cloudflared、已验证的测试、已知未提供的成品，以及数据备份和授权内容边界。
