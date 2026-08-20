# SyncWatch同步观影 v2.1.9

和朋友、家人、情侣远程一起看电影。`v2.1.9` 是在 v2.1.8 基础上更新的源码版本，保留原有同步播放、聊天、媒体、权限、多端和公网访问能力。

> **发布状态**：本分支已完成源码、文档和回归测试更新，但当前工作站尚未生成并验证 v2.1.9 的 26 个 Release 资产。因此本公告不把任何未构建文件标记为可下载，也不会用旧文件改名冒充新版本。真实成品必须按 [26+2 文件清单](release/release-manifest.md) 完成后再创建 Release。

## 本次更新（v2.1.8 → v2.1.9）

### 管理员登录流程

- 服务器设备在登录页点击“超级管理员登录”并验证成功后，直接进入“管理中心 → 服务器设置”。
- 管理专用会话保持登录页可见并隐藏观影主界面，不再先进入临时房间，也不会自动把管理会话写成下次启动的普通登录令牌。
- 管理员完成端口、局域网、公网、上传和权限策略设置后，可以从管理中心主动进入房间；普通账号登录和普通成员入房流程保持不变。
- 管理中心再次要求验证超级管理员时复用同一管理专用会话，避免重复跳转和无意义的临时房间。

### 前端、服务端与文档

- 统一源码、公开配置、协议广播、备份/导出文件名、Electron 构建配置、Android 构建配置和当前文档的版本标识为 `v2.1.9`（`package.json`/Android `versionName` 仍按工具链要求使用无 `v` 的 SemVer 值 `2.1.9`）。
- 增加浏览器回归断言：超级管理员验证后管理中心可见、服务器设置为默认模块、登录页仍可见、观影主界面保持隐藏。
- 同步更新 README、PRODUCT、DESIGN、管理中心教程、Wiki 镜像和生成的 HTML 教程，明确管理员快捷入口与验证边界。
- 保留 v2.1.8 历史公告和历史标签；无前缀的重复 Git 标签不再作为新版本命名，v2.1.9 统一使用 `v2.1.9`。

## 保持不变的能力

- 播放、暂停、进度、倍速、队列和房间状态仍由服务端通过 Socket.IO 广播，媒体通过 HTTP Range 播放。
- 房间密码/人数限制、成员与权限组、聊天、私聊、弹幕、语音、网页/屏幕共享、媒体上传、字幕、FFmpeg/FFprobe 处理、备份恢复、邮件、日志、网络诊断和 Cloudflare Tunnel 路径均保持 v2.1.8 的实现。
- Windows、Android、macOS、浏览器、独立服务端和数据目录结构不因本次管理员入口调整而改变；已有账号、房间、媒体和配置无需重建。
- Android APK 仍不内置 Windows/Linux cloudflared；手机跨网需要连接已经开启 Tunnel/HTTPS 的桌面、macOS、Linux 或云服务器。

## 验证记录

本次源码更新使用以下门禁进行验证：

```text
npm test
node tests/browser-ui-smoke.js
npm run test:electron
npm run test:repo
npm run test:privacy
node --check public/js/app.js
npm run build
```

构建和测试结果以本次推送前的终端输出为准；macOS、Android 真机和 Release 26 项成品在没有对应平台或真实资产前标记为“未验证”，不在公告中虚构通过。

## 下载与发布说明

v2.1.9 正式发布时必须提供与 v2.1.7/v2.1.8 相同的 26 个维护者资产，加 GitHub 自动生成的两个源码归档，共 28 个可见文件：

| 分组 | 必须包含 |
| --- | --- |
| Windows | 体验版、标准版、完整版安装 EXE、完整版便携 EXE |
| Android | 通用 APK（arm64-v8a、armeabi-v7a、x86_64） |
| macOS | 客户端、服务器、完整离线版的 x64/arm64 DMG 与 ZIP |
| 运行环境 | Node.js x64/arm64 Windows MSI、macOS x64 PKG、macOS arm64 tar.gz |
| 公网工具 | cloudflared Windows x64 EXE、Windows x64/x86 MSI、macOS x64/arm64 |

在真实资产上传前，请从 [Releases 页面](https://github.com/xuange6610/SyncWatch/releases)选择已存在的版本；不要下载本分支文档中尚未生成的 v2.1.9 文件名。

## 首次使用与安全

首次启动后立即修改默认管理员密码，再用同一 Wi-Fi 完成局域网登录和播放测试，最后才开启公网访问。不要提交 `SyncWatch同步观影-Data/`、`.env`、邮件密钥、Tunnel 令牌、签名密钥、真实 IP、聊天记录或私人媒体名称。

## 许可证与来源

本项目采用 [Apache License 2.0](../LICENSE)，原始设计和仓库实现由 `xuan` 完成。再发布者必须保留许可证、NOTICE、版权和修改说明；不得把原始项目或仅作少量修改的版本虚假宣称为自己的原创。
