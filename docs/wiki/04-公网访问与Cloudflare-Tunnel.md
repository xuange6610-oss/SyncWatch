# 公网访问与 Cloudflare Tunnel

`cloudflared` 是 Cloudflare Tunnel 连接器，负责把本机 HTTP、Socket.IO 和媒体 Range 请求转发到 Cloudflare Edge；它不保存 SyncWatch 账号或影片。

## 临时公网访问

1. 先完成局域网登录、建房和同步播放测试。
2. 打开“服务器设置 → 公网访问”，选择临时公网访问。
3. 完整服务器包优先使用 `vendor/cloudflared.exe`；源码/独立 ZIP 缺少文件时会从 Cloudflare 官方 Release 下载并校验 SHA-256。
4. 等待界面出现 HTTPS 地址，点击连接诊断确认 HTTP、WebSocket 和媒体 Range。
5. 只把地址和房间密码发给可信成员。临时地址重启后可能变化。

## 固定域名

在 Cloudflare 控制台创建 Tunnel，配置 DNS 和访问策略，把本地服务指向 `http://127.0.0.1:5000`。令牌只存放在服务器数据目录的 secrets 中，不要提交 Git。

## 连接失败

允许 cloudflared 出站访问 TCP/UDP 443、7844；VPN/TUN 或 Fake-IP DNS 可能拦截连接，建议对 cloudflared 和 Cloudflare 域名设置直连。完整错误、平台和时间应从日志中心导出并脱敏。
