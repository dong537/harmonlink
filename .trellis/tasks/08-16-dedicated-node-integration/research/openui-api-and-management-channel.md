# OpenUI API 与管理通道研究

## 结论

三台节点可以继续使用当前 OpenUI 代码线，不需要通过浏览器登录 Cookie 自动化，也不需要为管理面绑定域名。推荐使用每节点独立 Bearer Token 调用 `/panel/api/*`，并通过 Let’s Encrypt IP 地址短期证书建立 HTTPS 管理通道。

但当前 v3.0.7 Bearer API 只足以管理入站和客户，不能原子、受限地管理“某客户对应的 SOCKS 出站与 Email 路由”。365Proxy 的完整自动发货必须先在 OpenUI 增加窄的 `managed-line-projections` API，并将包含该接口的同一版本部署到三台节点。仅使用现有 `addClient` 无法证明每个客户走指定的 985Proxy 出口。

公网 HTTP 不能作为生产管理通道。OpenUI API Token 是全管理员凭据，泄露后可读取和修改全部入站与客户配置。

## 本地源码证据

本地仓库：`C:/Users/Lenovo/Desktop/3xui/OpenUI`，远端为 `https://github.com/helloandworlder/OpenUI.git`。

### Bearer 认证

- `web/controller/api.go` 在 `/panel/api` 路由组前检查 `Authorization: Bearer <token>`。
- Token 匹配成功后设置 `api_authed`，程序调用无需浏览器 Cookie 和 CSRF Token。
- `web/service/api_token.go` 提供 Token 的创建、列表、禁用、删除和匹配能力。
- 本地生产安全设计要求 Token 创建时仅显示一次，列表只返回预览，不能返回完整 Token。

### 节点与入站 API

- `GET /panel/api/server/status`：读取 CPU、内存、Xray 状态、版本和运行时间。
- `GET /panel/api/inbounds/list`、`GET /panel/api/inbounds/get/:id`：读取入站与客户状态。
- `POST /panel/api/inbounds/addClient`：向已有入站添加客户。
- `POST /panel/api/inbounds/updateClient/:clientId`：更新单个客户。
- `POST /panel/api/inbounds/:id/delClient/:clientId`：删除客户。
- `GET /panel/api/inbounds/getClientLinks/:id/:email`：读回客户连接地址。
- `web/runtime/remote.go` 已包含远程节点调用实现，证明 OpenUI 自身也用 Bearer Token 访问上述接口，并按入站 tag 解析远端 ID。

这些接口足以实现健康检查、共享入站客户管理和连接地址读回，但不足以完成专线投影。365Proxy 仍应使用自己的 Adapter，不能把 OpenUI 的 Node 表作为业务 Source of Truth。

### 现有全量 Xray 配置接口的限制

- `web/controller/xray_setting.go` 的 `/panel/xray/` 与 `/panel/xray/update` 可以读取或覆盖整份 Xray 配置模板，包括 outbounds 和 routing。
- 这些路由由 `XUIController` 注册，只接受网页登录 session + CSRF，不在 Bearer `/panel/api` 认证组内。
- `update` 接口以完整 `xraySetting` 字符串覆盖模板，没有 projection ownership、desired version、局部冲突检测或受管对象边界。

因此不能让 365Proxy 模拟网页登录并读改写整份模板。并发订单、管理员手工修改或重试都会产生丢失更新和误删非平台配置的风险。

### 必需的 OpenUI 扩展

新增 Bearer 保护的 `/panel/api/managed-line-projections` 模块，Interface 至少包括：

- `PUT /:projectionKey`：以 `desiredVersion` 幂等创建/更新共享入站客户、专线 SOCKS outbound 和 Email 精确路由；
- `GET /:projectionKey`：返回受管对象的 observed version、config hash、enabled、client/outbound/route 摘要；
- `DELETE /:projectionKey`：只禁用/删除带相同 ownership marker 的受管对象；
- `POST /:projectionKey/verify`：运行配置校验、出站探测和 Xray reload/read-back。

接口必须在单一配置变更锁内读改写，校验入站 allowlist、ownership tag、Email 唯一性、出口协议、目标 IP/端口和 secret 字段；任何非受管对象冲突都返回 409，不得覆盖。响应不得返回出口密码或完整客户连接凭据。OpenUI SQLite/配置只保存执行投影，365Proxy PostgreSQL 仍是业务 Source of Truth。

## 官方资料证据

- Let’s Encrypt 于 2026-01-15 宣布 IPv4/IPv6 地址证书正式可用：<https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability.html>
- Let’s Encrypt Profiles 文档说明 `shortlived` 证书支持 DNS/IP 标识符，有效期 160 小时：<https://letsencrypt.org/docs/profiles/>
- OpenUI 安装脚本 `install.sh` 和 `open-ui.sh` 已使用 `--certificate-profile shortlived` 为公网 IP 申请证书，并配置自动续期。
- 上游 3x-ui OpenAPI 也明确支持 API Token Bearer 认证，Token 是全管理员凭据：<https://github.com/MHSanaei/3x-ui/blob/main/frontend/public/openapi.json>

## 管理通道选项

### A. IP HTTPS 短期证书（推荐）

每台 VPS 直接为公网 IP 申请 `shortlived` 证书，OpenUI 继续使用当前随机管理端口和路径。365Proxy Adapter 校验证书链与 IP SAN，不允许 `rejectUnauthorized=false`。

优点：不需要域名；Railway/Zeabur 等托管平台可以直接访问；运维组件最少。

代价：证书只有约 6 天，必须验证自动续期；监控需要在剩余有效期低于 24 小时时告警，并阻止新节点接入。

此前安装时申请失败的直接原因是 ACME 联系邮箱使用了无效公共后缀，而不是 IP 证书功能不可用。重新申请时必须使用有效邮箱。

### B. 私有覆盖网络

使用 WireGuard、Tailscale 或 Headscale 将控制面和节点置于私网。

优点：面板端口不暴露公网。

代价：托管容器可能没有 TUN 权限；需要额外的密钥轮换、路由与高可用运维。当前托管环境尚未证明支持，因此不作为首期默认方案。

### C. SSH 隧道

由 worker 维护到每台节点的 SSH 端口转发。

优点：无需改面板 TLS。

代价：长连接、重连、主机密钥、凭据和并发管理复杂，worker 重启时容易产生控制面中断，不适合首期生产主通道。

## 推荐生产约束

- 每台节点创建一个名为 `365proxy-control-plane` 的独立 API Token；Token 不复用面板管理员密码。
- Token 在数据库中使用现有 AES-GCM 能力加密，运行时只在 Adapter 调用边界解密。
- 节点 URL 必须是 `https://<ip>:<port>/<base-path>/`；生产配置拒绝 `http://`。
- HTTP 客户端必须设置连接/总超时、响应大小上限、IP/端口 allowlist、证书校验和稳定错误映射。
- 日志只记录 node ID、projection ID、状态码、reason key、耗时和 request ID；不得记录 Token、客户 UUID、完整连接 URL 或面板响应体。
- Token 一节点一个，支持单独禁用和轮换；轮换采用新旧 Token 短暂并存、健康验证后禁用旧 Token。
- 节点健康检查不能仅判断 TCP 端口；必须认证调用 `/panel/api/server/status` 并确认 Xray 正常。
- 三台节点必须运行同一受支持 OpenUI build，并通过 managed projection capability/version 探针；缺少该 capability 的节点只能注册为 `NOT_READY`，不能接收订单。

## 未决验证

- 在三台真实节点上创建 Token 后，分别验证 `server/status`、入站读、客户增改删和连接地址读回。
- 实现并测试 `managed-line-projections`，构建同一 release，部署到三台服务器并验证 create/update/read/delete/verify 的幂等和 ownership 边界。
- 验证三台服务器运行的二进制 build ID、API capability 与数据库迁移一致；不一致的节点保持摘除。
- 重新申请 IP 证书并观测一次自动续期；未完成续期验证前节点不能标记为 production-ready。
