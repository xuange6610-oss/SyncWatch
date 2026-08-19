# SyncWatch同步观影 Wiki

和朋友、家人、情侣远程一起看电影。SyncWatch 是开源、自托管、跨平台的 Watch Party / 同步观影系统：房主启动自己的服务器，成员通过 Windows、Android、macOS 或浏览器加入同一房间，播放、暂停、拖动进度和倍速会保持同步。

你的服务器、你的影片、你的数据。GitHub Pages 只能展示界面和教程，不能替代真实服务器；要创建房间、上传媒体、聊天和开启公网访问，请下载 [最新 Release](https://github.com/xuange6610-oss/SyncWatch/releases/latest) 或按部署教程运行自己的实例。

## Wiki 导航

1. [新手快速开始](01-新手快速开始) - 下载、双击启动、首次登录、修改密码、建房和邀请成员。
2. [管理中心逐按钮教程](02-管理中心) - 11 个模块、操作步骤、验证结果和真实截图。
3. [成员连接与同步播放](03-成员连接与同步播放) - 局域网、公网、浏览器、客户端、Android 和播放控制。
4. [公网访问与 Cloudflare Tunnel](04-公网访问与Cloudflare-Tunnel) - cloudflared、临时地址、固定域名和诊断。
5. [发布文件与下载](05-发布文件与下载) - Windows、Android、macOS、服务器 ZIP、体验版和完整套装边界。
6. [数据结构与备份迁移](06-数据结构与备份迁移) - Data 目录每个文件夹的作用、备份和恢复顺序。
7. [故障排查](07-故障排查) - 端口、启动、媒体、邮件、APK、Tunnel 和权限问题。
8. [开发与贡献](08-开发与贡献) - 分支、测试、构建、PR 审核和 Apache-2.0 许可。
9. [技术原理与架构](09-技术原理与架构) - Node.js、Express、Socket.IO、Electron、Android、FFmpeg 和调用链。

## 快速入口

- 在线展示：[xuange6610-oss.github.io/SyncWatch](https://xuange6610-oss.github.io/SyncWatch/)
- 源码仓库：[github.com/xuange6610-oss/SyncWatch](https://github.com/xuange6610-oss/SyncWatch)
- 常见错误：[仓库文档](https://github.com/xuange6610-oss/SyncWatch/blob/main/docs/troubleshooting.md)
- 使用技巧：[仓库文档](https://github.com/xuange6610-oss/SyncWatch/blob/main/docs/tips-and-advantages.md)

## 安全边界

- 首次登录后立即修改 `admin888`，公网房间必须设置房间密码。
- 不要公开 `.secrets/`、`secrets/`、令牌、授权码、真实 IP 或私人媒体名称。
- 迁移必须复制整个 `SyncWatch同步观影-Data/`，不能只复制 `config.json`。
- 外部贡献通过 Fork、分支和 Pull Request 进入 `main`，维护者审核并通过 Actions 后合并。

原创项目设计和本仓库原始实现由 xuan 完成，许可证为 Apache-2.0。再发布时请保留许可证、NOTICE 和原始署名，不要虚假宣称原始实现属于自己。
