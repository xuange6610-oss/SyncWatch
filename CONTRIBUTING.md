# 为 SyncWatch同步观影 贡献代码

感谢你愿意改进项目。第一次参与开源也没有关系，请按下面的顺序操作。

## 开始之前

1. 安装 Git、Node.js 22 或更高版本，推荐 Node.js 24 LTS。
2. Fork 本仓库，再把你的 Fork 克隆到电脑。
3. 从 `main` 新建分支，名称使用小写英文和连字符，例如 `fix/mobile-server-start`。
4. 不要提交 `SyncWatch同步观影-Data/`、账号、密钥、真实 IP、聊天记录、媒体文件或构建产物。

## 本地运行

```bash
npm ci
npm start
```

只运行独立服务端：

```bash
npm run start:server
```

## 修改规范

- 面向用户显示的产品名称统一写作 `SyncWatch同步观影`。
- 文件名优先使用小写英文和连字符；GitHub 约定文件保留标准大写名称，如 `README.md`、`LICENSE`。
- 文本文件使用 UTF-8；普通源码使用 LF，Windows PowerShell 和 CMD 脚本使用 CRLF。
- 保留既有包名、协议字段和迁移兼容逻辑，除非变更同时提供升级方案和测试。
- 修复缺陷时请添加最小回归测试，不要顺手重构无关代码。

## 提交前检查

```bash
npm run test:repo
npm test
```

影响多个模块、构建或发布时，再运行：

```bash
npm run test:all
```

完整测试会使用 Electron、FFmpeg、Android 或 cloudflared，缺少相应环境时请在 Pull Request 中写明未运行的项目和原因。

## 提交 Pull Request

1. 使用简短、明确的提交说明，例如 `修复 Android 手机服务器资源打包`。
2. 在 Pull Request 中说明问题、修改内容、验证命令和界面截图。
3. 一个 Pull Request 只解决一个主题，避免混入格式化整个仓库等无关修改。
4. 提交代码即表示你同意按本项目的 [Apache-2.0 License](LICENSE) 发布该贡献。
