# SyncWatch同步观影

[![GitHub Pages](https://github.com/xuange6610-oss/SyncWatch/actions/workflows/pages.yml/badge.svg)](https://github.com/xuange6610-oss/SyncWatch/actions/workflows/pages.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-2b6d4f.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-356e46.svg)](https://nodejs.org/)

SyncWatch同步观影是一套开源、多端、自托管的同步观影与实时协作系统。一个人启动服务器并创建房间，其他人使用 Windows 客户端、Android 客户端、macOS 客户端或现代浏览器打开地址，就能同步播放、暂停、进度和倍速，并使用聊天、弹幕、语音、屏幕共享、网页共享、媒体管理等功能。

服务器数据保存在自己的设备上。你可以先在同一个 Wi-Fi 或局域网内使用，需要跨网络时再启用 Cloudflare Tunnel 或自己的 HTTPS 反向代理。

> 当前版本：v2.1.5 · 许可证：[Apache-2.0](LICENSE) · 作者：xuan

## 在线参观

打开 [SyncWatch同步观影 GitHub Pages 展示站](https://xuange6610-oss.github.io/SyncWatch/) 可以查看真实界面、功能流程、数据目录说明、下载入口和新手快速开始。

![SyncWatch同步观影登录与房间入口](docs/screenshots/login.png)

> GitHub Pages 只能托管静态网页。展示站不能运行 Node.js、WebSocket、文件上传、AI 中转或临时公网访问，也不保存账号和媒体。完整功能需要在自己的电脑或服务器上启动 SyncWatch同步观影。

## 新手应该下载哪个文件

不准备修改代码的用户，请打开 [GitHub Releases](https://github.com/xuange6610-oss/SyncWatch/releases/latest)。不要把仓库首页的 `Source code (zip)` 当成完整安装包。

| 类型 | 适合谁 | 作用 |
| --- | --- | --- |
| Windows 服务器版 | 房主、服务器管理员 | 启动服务、保存数据并打开完整管理界面 |
| Windows 客户端 | 普通成员 | 输入服务器地址后加入房间，不运行完整服务 |
| Android APK | Android 用户 | 加入已有房间；完整包可在受支持设备上运行手机服务器 |
| macOS 服务器/客户端 | Mac 用户 | Intel Mac 使用 x64，Apple Silicon 使用 arm64 |
| 独立服务器 ZIP | Windows/Linux 服务器管理员 | 使用 Node.js 启动服务，适合长期部署和 Docker |
| Source code | 开发者 | 阅读、修改和自行构建，需要安装 Node.js 和依赖 |

Releases 页面只应列出已经真实构建和验证的文件。某个平台没有资产时，表示该版本暂未提供对应成品，请按构建文档自行构建，不要下载名称相似的第三方文件。

## 第一次启动服务器

### 使用服务器 EXE

1. 从 Releases 下载 Windows 服务器版，放进一个普通文件夹。
2. 双击运行。Windows 防火墙询问时，只按你的实际网络环境允许访问。
3. 浏览器会打开 `http://127.0.0.1:5000`；如果端口被占用，以软件显示的地址为准。
4. 使用默认管理员账号 `admin`、密码 `admin888` 登录。
5. 立即进入安全设置修改管理员密码。
6. 创建房间，可以设置房间密码、人数限制和成员权限。
7. 先让同一 Wi-Fi 下的成员使用局域网地址连接，确认成功后再配置公网访问。

### 从源码启动

需要 Git 和 Node.js 22 或更高版本，推荐 Node.js 24 LTS。

```bash
git clone https://github.com/xuange6610-oss/SyncWatch.git
cd SyncWatch
npm ci
npm start
```

只启动独立服务端：

```bash
npm run start:server
```

默认地址是 `http://127.0.0.1:5000`。如果你使用 pnpm：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

## 让其他人加入房间

### 同一个 Wi-Fi / 局域网

1. 房主保持服务器运行，不要关闭服务器窗口。
2. 在软件中复制显示的局域网地址，例如 `http://192.0.2.10:5000`。
3. 成员在客户端中填写地址，或直接用浏览器打开。
4. 成员登录或按服务器规则注册，再选择房间。
5. 房主选择影片并开始播放，成员端会跟随共同播放状态。

示例地址使用文档保留网段，实际地址以软件显示为准。

### 跨网络连接

1. 在“服务器设置 > 公网访问”中选择临时公网访问，或配置自己的域名和 HTTPS 反向代理。
2. 源码/独立服务端第一次需要 cloudflared 时，会从 Cloudflare 官方 GitHub Release 下载与系统匹配的文件并校验 SHA-256；完整安装包优先使用内置文件。
3. 等待界面显示 HTTPS 地址并通过连接诊断。
4. 只把成员链接发给可信成员，不公开带房主权限的链接、令牌或管理密码。
5. 临时地址可能在重启后变化；需要固定域名时请阅读服务器部署教程。

## 主要功能

- **同步播放**：房主控制播放、暂停、进度、倍速和可选音量同步，客户端自动校正明显偏差。
- **媒体与字幕**：上传影片、音频、字幕、图片和文档，也可添加合法的 HTTPS 媒体直链。
- **多房间**：支持正式房间、临时房间、房间密码、人数限制和房主/管理员权限。
- **实时交流**：公聊、私聊、弹幕、表情、图片、语音消息、全麦语音和全屏公告。
- **共享能力**：浏览器、Electron 和 Android 屏幕共享；受支持的桌面端可共享电脑音源。
- **账号与管理**：好友、通知、在线状态、设备信息、权限组、封禁、注册审批和操作记录。
- **媒体处理**：FFprobe 分析媒体，FFmpeg 可生成缩略图和 H.264/AAC 浏览器兼容版本。
- **AI 工作台**：可配置兼容 Responses API 或 Chat Completions 的对话、生图和视频接口。
- **运维能力**：数据导入导出、备份恢复、回收站、邮件验证、密码找回、日志和网络诊断。

## 数据目录是做什么的

第一次启动会在程序旁创建 `SyncWatch同步观影-Data/`。这里不是源码，而是这台服务器的账号、房间、设置、媒体、聊天和安全材料。迁移服务器时，应先完全退出程序，再复制整个目录。

从旧版升级时，如果程序旁只有 `SyncWatch-Data/`，兼容迁移逻辑会优先保留已有数据。不要因为文件夹名称不同就手工删除旧目录。

| 路径 | 保存内容 | 建议 |
| --- | --- | --- |
| `config.json` | 账号、房间、权限、媒体索引和服务器设置 | 必须备份，不要手工编辑 |
| `chat-history.jsonl` | 聊天、私聊、公告、弹幕和语音记录 | 需要历史记录时备份 |
| `.secrets/`、`secrets/` | 邮件密钥、管理员密码哈希和验证材料 | 绝不能公开，随数据一起备份 |
| `uploads/` | 上传的影片、音频、字幕、图片和文档 | 必须与索引一起备份 |
| `compatible-media/` | 自动生成的浏览器兼容影片 | 可以重建，停机后可清理 |
| `subtitles/`、`thumbnails/` | 转换字幕和缩略图 | 可以重建，建议随媒体备份 |
| `avatars/`、`chat-images/`、`voice/` | 头像、聊天图片和语音消息 | 需要完整记录时备份 |
| `electron-profile/`、`cache/` | 桌面登录状态和网页/图形缓存 | 可以清理，清理后需重新登录 |
| `logs/`、`crash-dumps/` | 运行日志和异常诊断 | 提交 Issue 前先删除隐私信息 |
| `tools/` | 自动准备的 cloudflared 等运行工具 | 缺失时可重新下载，不是业务数据库 |

最简单的备份方法是使用“服务器设置 > 数据导入与导出 > 全部数据与配置”。做磁盘级迁移时必须复制整个目录，只复制 `config.json` 会造成文件或密钥不完整。

## 项目结构

```text
.github/                  Issue、PR 模板和 GitHub Actions
assets/                   应用图标等品牌资源
docs/                     展示站、截图和中文使用/部署文档
mac/                      macOS 发布清单说明
mobile/                   Android 客户端、手机服务器和构建脚本
public/                   实际 Web 界面、样式与客户端逻辑
scripts/                  跨平台构建和发布辅助脚本
server/                   HTTP、Socket.IO、认证、房间、媒体与 AI 中转
tests/                    后端、前端、Electron、Android、隧道和发布验收
build-windows.ps1         Windows 桌面程序构建入口
build-server-package.ps1  独立服务器 ZIP 构建入口
electron-pink.js          Electron 服务器桌面端入口
electron-client.js        Electron 独立客户端入口
server-standalone.js      独立服务端入口
```

Git 没有要求所有文件都必须使用英文名称。仓库采用的规则是：GitHub 约定文件使用标准名称，普通新增文件优先使用小写英文和连字符；面向用户的中文正文和产品名称保持中文。包名、协议字段、Java/JNI 路径和旧数据目录名属于兼容标识，没有迁移方案时不要只改其中一部分。

## 文档

- [普通用户使用说明](docs/user-guide.md)
- [服务器部署与使用教程](docs/server-deployment-guide.md)
- [技术架构与依赖说明](docs/architecture.md)
- [macOS 构建说明](docs/macos-build.md)
- [Android 构建说明](mobile/README.md)
- [云端媒体与商业部署说明](docs/cloud-media-deployment.md)
- [参与贡献](CONTRIBUTING.md)
- [安全报告方式](SECURITY.md)

## 构建与测试

仓库格式、模板和 Pages 检查：

```bash
npm run test:repo
```

核心集成测试：

```bash
npm test
```

完整发布验收：

```bash
npm run test:all
```

构建 Windows 服务器和客户端：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows.ps1
```

构建独立服务器包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-server-package.ps1
```

完整验收可能需要 Electron、FFmpeg、Android SDK/NDK、cloudflared 和对应平台的真实构建环境。缺少环境时，不要把“未运行”写成“测试通过”。

## GitHub Pages 自动部署

工作流位于 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)。推送到 `main` 且 `docs/`、README、许可证或展示站验收发生变化时，会执行：

1. 检出代码；
2. 运行 `node tests/repository-standards.test.js`；
3. 上传 `docs/`；
4. 部署到 GitHub Pages。

仓库所有者第一次使用时，需要在 GitHub 打开 `Settings > Pages`，确认 `Build and deployment` 的来源为 `GitHub Actions`。之后每次合并到 `main` 会自动更新展示站。

## 安全与使用边界

- 公网部署前必须修改默认管理员密码，并建议设置房间密码。
- 不公开 `SyncWatch同步观影-Data/`、`.env`、签名密钥、邮件密钥或带房主权限的链接。
- Android 正式包必须使用项目所有者自行保管的发布密钥签名，仓库不会提供密钥。
- 只上传、播放和共享自己拥有或已经取得授权的内容。
- 提交 Issue 前删除真实姓名、邮箱、IP、房间号、聊天内容、访问令牌和媒体文件名。
- 安全漏洞请按 [SECURITY.md](SECURITY.md) 私密报告，不要先发公开 Issue。

## 原创与署名说明

SyncWatch同步观影的原创项目设计和本仓库原始实现由 xuan 完成。项目按 Apache-2.0 开源，允许任何人在许可证条件下使用、研究、修改和再发布。

Apache-2.0 要求再发布者提供许可证、标注对文件的修改，并保留适用的版权、专利、商标和 NOTICE 归属信息。请不要删除原始署名，也不要将本项目或仅作少量修改的版本虚假宣称为自己的原创作品。该说明用于澄清来源和署名义务，不额外限制 Apache-2.0 已经授予的合法权利。

## 许可证与联系方式

本项目采用 [Apache License 2.0](LICENSE)，归属信息见 [NOTICE](NOTICE)。

版权所有 © 2026 xuan。

QQ: 2590813506<br>
微信: love_020804
