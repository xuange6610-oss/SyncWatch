# 安全策略

## 支持范围

安全修复优先提供给 GitHub Releases 中的最新版本。旧版本可能不再单独修复，请先确认问题在最新代码或最新发布版中仍然存在。

## 私密报告漏洞

请使用 GitHub 的 [Private vulnerability reporting](https://github.com/xuange6610/SyncWatch/security/advisories/new) 私密提交。不要在公开 Issue 中粘贴可直接利用的漏洞细节、密码、访问令牌、真实 IP、房间链接、聊天记录或媒体文件名。

报告请包含：

- 受影响版本、系统和安装方式；
- 可以稳定复现的最少步骤；
- 预期结果与实际结果；
- 影响范围和你已尝试的缓解方法；
- 已脱敏的日志或截图。

如果 GitHub 页面暂时不可用，可通过 README 中的 QQ 或微信联系维护者，只发送“需要私密报告安全问题”，不要先发送密钥或完整漏洞利用代码。

## 使用者安全建议

- 第一次启动后立即修改默认管理员密码。
- 公网部署使用 HTTPS、房间密码和最小权限。
- 不公开 `SyncWatch同步观影-Data/`、`.env`、`.secrets/`、`secrets/` 或 Android 签名文件。
- 迁移和备份前先停止服务器，并复制完整数据目录。
