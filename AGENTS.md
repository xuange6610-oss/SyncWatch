# SyncWatch 项目工作规则

## 项目导航

- **项目名称**：SyncWatch同步观影
- **用途**：开源、自托管、跨平台的同步观影与实时协作系统。
- **技术栈**：Node.js 22+、Express 5、Socket.IO 4、原生 HTML/CSS/JavaScript、Electron 41、Android Java/C++/WebView、FFmpeg/FFprobe、Gradle、PowerShell/Bash。
- **主要入口**：`public/index.html`（Web UI）、`server/index.js`（HTTP/Socket.IO 服务）、`electron-pink.js`（桌面服务器）、`electron-client.js`（独立客户端）、`server-standalone.js`（Node 独立服务端）、`mobile/app/src/main/java/com/xuan/syncwatch/MainActivity.java`（Android）。
- **核心目录**：`public/` 前端；`server/` 后端与隧道；`mobile/` Android；`scripts/` 构建辅助；`tests/` 自动化验收；`docs/` 展示站与文档；`.github/` CI、Pages、Release 工作流；`release/` 本地成品（被 Git 忽略）。

## 每次开始新任务

1. 首先读取 `AGENTS.md`。
2. 根据任务内容读取 `PRODUCT.md`。
3. 涉及 UI、交互、架构时读取 `DESIGN.md`。
4. 涉及安装、部署、使用说明时读取 `README.md`。
5. 根据任务内容搜索 `docs/` 中的相关文档。
6. 检查当前实际代码、配置、测试和生成脚本。
7. 检查最近相关 Git 历史、当前分支、remote、Actions 与 Release 状态。
8. 不得仅根据聊天上下文猜测当前项目状态。
9. 当前磁盘代码、Git 历史和最新项目文档是项目真实状态的最高依据。

## 开发规范

- 遵守 `.editorconfig`、`.gitattributes` 和现有模块边界；优先小范围、可验证的改动。
- 用户可见功能必须同时考虑权限、错误、加载、空状态和移动端布局。
- 不把静态 GitHub Pages 展示页描述成可运行的 Node.js、WebSocket、上传或公网服务。
- 新增功能应补充对应测试；修改文档时保持链接和代码示例可定位。

## 禁止事项

- 不提交 `node_modules/`、构建产物、真实运行数据、`.env`、密钥、签名文件或个人隐私。
- 不删除或重写重要 Git 历史，不覆盖未审计的用户备份目录。
- 不绕过服务端权限、认证、数据目录锁或 Release 验收。
- 不把计划功能写成已经实现，也不凭旧截图或聊天记录声明当前行为。

## 构建命令

- 安装依赖：`npm ci`（或按锁文件使用 `pnpm install --frozen-lockfile`）。
- 开发启动：`npm start`；独立服务端：`npm run start:server`。
- Windows 构建：`powershell -NoProfile -ExecutionPolicy Bypass -File .\build-windows.ps1`；独立服务器包：`.\build-server-package.ps1`。
- Android 构建：`powershell -NoProfile -ExecutionPolicy Bypass -File .\mobile\build-apk.ps1`；macOS 构建需 macOS 主机或 GitHub Actions。

## 测试命令

- 仓库检查：`npm run test:repo`；核心测试：`npm test`；完整验收：`npm run test:all`。

## Git 提交规范

- 提交信息使用 `feat:`、`fix:`、`perf:`、`style:`、`refactor:`、`docs:` 等清晰前缀。

## GitHub 发布规范

- `main` 是稳定分支；功能在分支和 Pull Request 中验证后合并。版本由 `package.json`、Android `versionName`、Release tag 和发布说明共同更新，当前版本以源码和最新 Release 为准。
- GitHub Pages 由 `.github/workflows/pages.yml` 发布 `docs/`；Windows/macOS Release 由对应 Actions 构建并上传，发布前必须先通过仓库规范和成品契约测试。
- 每个正式版本必须按 v2.1.7 的发布规模准备 **28 个可见文件**：GitHub 自动生成的 `Source code (zip)` 与 `Source code (tar.gz)` 计 2 个，维护者实际上传的 Release 资产必须计 26 个。不得只上传 Windows/Android 的子集就宣称完整发布。
- 26 个维护者资产的固定清单为：Windows 体验版、标准版、完整版安装 EXE、完整版便携 EXE（4）；Android 通用 APK（1）；macOS 客户端 x64/arm64 的 DMG/ZIP（4）；macOS 服务器 x64/arm64 的 DMG/ZIP（4）；macOS 完整离线版 x64/arm64 的 DMG/ZIP（4）；Node.js x64 MSI、ARM64 MSI、macOS x64 PKG、macOS arm64 tar.gz（4）；cloudflared Windows x64 EXE、Windows x64/x86 MSI、macOS x64/arm64 二进制（5）。合计 26 个。
- 发布前必须逐项核对文件名、版本号、平台/架构、非空大小、SHA-256 和 Release 资产数量；缺少任一真实构建产物时，标记版本未完成并停止上传，不用改名文件或占位文件凑数。资产清单以 [docs/release/release-manifest.md](docs/release/release-manifest.md) 为准。

## 自动版本规则

- 版本号必须在 `package.json`、Android `versionName`/`versionCode`、Release tag 和 `docs/release-notes-vX.Y.Z.md` 中保持一致；补丁版本递增用于兼容修复，功能版本递增前必须更新发布说明。
- GitHub Actions 只根据受保护分支、Release tag 或手动 workflow 输入发布；不得把未验证的本地 `release/` 文件直接当作 Release 资产。

## 每次任务完成

1. 检查 `git diff`、`git status` 和新增文件是否符合范围。
2. 运行相关测试；必要时运行 `npm run test:repo`、`npm test` 和对应 build。
3. 如果功能发生变化，同步更新 `PRODUCT.md`。
4. 如果 UI、架构、技术方案发生变化，同步更新 `DESIGN.md`。
5. 如果用户使用方式、安装方式、功能介绍发生变化，同步更新 `README.md`。
6. 如果需要长期保留的技术知识发生变化，同步更新 `docs/`。
7. 不要因为小型代码调整无意义地重写整个文档；文档必须与实际代码保持一致。

## GitHub 与安全规则

- 外部贡献通过 Fork/分支/ Pull Request 进入，维护者审核后合并；不得直接强制覆盖 `main`。
- 发布说明必须列出真实资产、平台/架构、校验或已知限制；没有成品就明确标记未提供。
- 默认管理员密码、SMTP 授权码、Tunnel 令牌、运行数据目录、IP、聊天记录和媒体文件名不得进入提交、截图或 Issue。
- 发现安全问题按 `SECURITY.md` 私密报告；公开 Issue 只提交脱敏日志和最小复现。
