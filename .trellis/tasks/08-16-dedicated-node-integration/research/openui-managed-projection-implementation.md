# Research: OpenUI managed projection implementation

- Query: 在 OpenUI 中为 365Proxy 增加受 ownership、版本和回读约束的 `managed-line-projections` API，确认认证、持久化、Xray 配置修改和路由文档测试的正确落点。
- Scope: internal / mixed
- Date: 2026-08-18

## Findings

### 推荐的模块落点

1. **路由与认证**：新增 `web/controller/managed_line_projection.go`，由 `web/controller/api.go` 的 `APIController.initRouter` 注册。不要把新接口直接放进现有 `api := g.Group("/panel/api")` 后再依赖 Cookie 会话，因为 `checkAPIAuth` 同时接受 Bearer 和浏览器 session（`web/controller/api.go:33-56`）。建议从 `g` 单独建立完整路径组 `/panel/api/managed-line-projections`，显式挂载严格 Bearer-only middleware，再挂载 CSRF middleware；这样浏览器 cookie 永远不能进入写接口。
2. **业务服务**：新增 `web/service/managed_line_projection.go`（名称可按项目风格调整）。服务层负责 projection key 校验、节点 allowlist、ownership marker、desired/observed version 冲突、配置互斥锁、SQLite 事务、局部 Xray JSON patch、配置校验、reload、read-back 和稳定 hash。Controller 只做请求解析、调用 service、映射 HTTP 状态和脱敏响应。
3. **持久化**：在 `database/model/model.go` 增加专用 `ManagedLineProjection` 模型，并在 `database/db.go:initModels`（`database/db.go:32-49`）加入 `AutoMigrate`。不要把投影状态塞入 `Setting` 或把完整 Xray 模板当作业务 Source of Truth；365Proxy PostgreSQL 仍拥有订单和客户，OpenUI SQLite 只保存执行投影、版本和回读摘要。
4. **契约与实体**：可在 `web/entity/managed_line_projection.go` 定义请求/响应结构。响应沿用 `entity.Msg` envelope，但冲突和节点不可用必须设置真实 HTTP 409/503；现有 `jsonMsg` 类 helper 多数只返回 HTTP 200，不能直接用于这些错误。任何 UUID、出口 secret、完整连接 URL、Bearer token 都不得进入响应或日志。

### 受控接口建议

- `PUT /panel/api/managed-line-projections/:projectionKey`：按 `desiredVersion` 创建或更新一个投影，最多修改带 ownership marker 的入站 client、SOCKS outbound 和 route rule。
- `GET /panel/api/managed-line-projections/:projectionKey`：返回 observed version、config hash、启用状态及 client/outbound/route 摘要，不返回 secret。
- `DELETE /panel/api/managed-line-projections/:projectionKey`：仅删除或禁用仍带相同 ownership marker 的对象；缺失或归属冲突不能扩大删除范围。
- `POST /panel/api/managed-line-projections/:projectionKey/verify`：执行配置校验、出口探测、Xray reload/read-back，并报告可判定的失败原因。

所有写操作必须在同一配置变更锁内完成：读取当前模板 -> 找到 marker -> 检查版本和期望对象 -> 局部修改 -> JSON/Xray 校验 -> 持久化 -> reload -> read-back -> 更新 observed version/hash。管理员手动修改造成 marker、版本或 hash 不一致时返回 409，不能用全量模板覆盖解决冲突；read-back 或节点控制面不可达返回 503。

### Xray 配置边界

- `web/service/xray_setting.go:17-32` 的 `SaveXraySetting` 接受并保存完整 `xrayTemplateConfig`，并会做整份 JSON 校验和 stats routing hoist；它不是受控 patch API。365Proxy 不能调用浏览器式 `/panel/xray/update` 或提交整份模板。
- `web/service/xray.go:95` 的 `GetXrayConfig` 会将模板与入站合成；`web/service/xray.go:239` 的 `RestartXray` 负责运行时重启。建议在 service 层复用这些能力，必要时增加“局部 patch + 读取 marker 对象”的深接口，而不是在 controller 中直接改 Setting。
- 现有 `model.Inbound`（`database/model/model.go:46`）把 client、stream 和 tag 存在 JSON/字段中，且没有 365Proxy ownership 字段。应在新投影表保存期望映射，并在生成的 client/comment、outbound tag、routing rule tag 中写入稳定 marker；read-back 只接受 marker 匹配的对象。不要把“按 tag 猜测”当作唯一 ownership 证明。
- 现有 `InboundService.AddInbound`/`UpdateInbound`（`web/service/inbound.go:408`、`web/service/inbound.go:642`）会做端口冲突、客户校验和运行时同步，但其远程路径最终是完整 inbound API；可复用校验和运行时接口，不能把它们当作 projection 级授权边界。

### 认证与远程调用约束

- `web/service/api_token.go:14-18,117-142` 的 `ApiTokenService.Match` 会遍历所有启用 token 做常量时间比较；`model.ApiToken`（`database/model/model.go:93`）为明文 token 且没有 scope/node ownership。它适合兼容现有全管理 Bearer API，不适合直接作为生产投影 token。优先新增专用 token 模型/服务（哈希或加密存储、节点/用途 scope、可轮换），至少也要在 managed route 上做独立 allowlist，绝不能在日志中打印全 token。
- `web/middleware/security.go:41-52` 的 CSRF middleware 会对 `api_authed` Bearer 请求放行，但这不等于 Bearer-only；严格 middleware 仍需拒绝没有 `Authorization: Bearer ...` 的请求。
- `web/runtime/remote.go:83-137` 的 `Remote.do` 已提供 Bearer、超时、私网地址策略和 `entity.Msg` envelope 解析；`web/runtime/remote.go:205` 的 `AddInbound` 使用全量 `/panel/api/inbounds/add`。可参考 transport 处理，但 managed adapter 必须调用窄接口，并拒绝未加密公网 HTTP。
- `web/web.go:134-143,146-235,361-432` 表明 OpenUI 支持直接 TLS listener，但只有配置有效证书/私钥才启用 HTTPS；当前三台节点若仍是 HTTP，不得标记为 production-ready。IP 证书、自动续期、私网覆盖网络均需真实 smoke check，客户端不能以 `rejectUnauthorized=false` 兜底。

### 路由文档与测试

- `web/controller/api_docs_test.go:16-18,22-29,55-106` 会扫描 controller 文件中的 `g|api.(GET|POST|PUT|DELETE|...)` 路由，并要求在 `frontend/src/pages/api-docs/endpoints.js` 有对应文档。新增文件后必须在该测试的 `switch entry.Name()` 增加 `managed_line_projection.go` 的 base path（若使用该文件名），并为四个方法补文档；否则测试会失败。
- 路由注册保持直接形式，例如 `g.PUT("/:projectionKey", ...)`，避免测试正则无法识别的动态封装。文档中要明确这是 Bearer-only managed API，与旧版 `/panel/api/*` 的 session/Bearer 兼容语义不同。

## Files found

- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/controller/api.go`：现有 `/panel/api` 路由组、混合 session/Bearer 认证和 CSRF 顺序。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/controller/api_docs_test.go`：controller 路由与前端 API 文档一致性测试。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/middleware/security.go`：安全响应头和 CSRF 例外规则。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/service/api_token.go`：全局 Bearer token 的明文存储、匹配、启停和预览逻辑。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/database/model/model.go`：Inbound、Node、ApiToken 等 GORM 模型；没有 managed projection 模型。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/database/db.go`：SQLite 初始化及 AutoMigrate 模型清单。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/service/inbound.go`：入站/客户校验、保存和运行时同步入口。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/runtime/remote.go`：节点间 Bearer HTTP transport 和全量 inbound 远程调用。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/service/xray_setting.go`：完整 Xray 模板校验、存储和 stats routing 处理。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/service/xray.go`：模板与入站合成、Xray restart 入口。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/web/web.go`：路由初始化、TLS listener 和 HTTP/HTTPS 启动分支。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/config/version`：当前 OpenUI build version `3.0.7`。
- `C:/Users/Lenovo/Desktop/3xui/OpenUI/README.md`：项目定位和生产使用风险提示。

## Code patterns

- 现有 controller 依赖 constructor 注册子路由：`web/web.go:233-235` 调用 `NewAPIController`，`web/controller/api.go:27-31` 再调用 `initRouter`。managed controller 应保持同样的初始化链。
- 现有 API 认证入口：`web/controller/api.go:33-56`；严格 managed middleware 应在此之外增加 Bearer presence、专用 scope 和 token 轮换检查。
- 现有 API token 视图会隐藏列表中的完整 token：`web/service/api_token.go:20-42`；managed API 的响应也应只返回摘要/hash。
- GORM 模型通过统一列表自动迁移：`database/db.go:32-49`；新增投影模型必须显式加入列表，并提供唯一 projection key 索引。
- 远程调用统一设置 `Authorization: Bearer`、超时和 `entity.Msg` envelope：`web/runtime/remote.go:83-137`；managed adapter 应沿用错误映射但拒绝全量 inbound 语义。
- 完整模板保存是单入口：`web/service/xray_setting.go:17-32`；受控投影不能将请求 body 直接传给该入口。

## External references

- Local source metadata reports OpenUI version `3.0.7` (`config/version:1`); all three nodes must expose the same managed API build before accepting production orders.
- The repository README explicitly positions this fork for personal/non-production use. This is an operational caveat, not a substitute for a release audit, security review, and rollback plan.
- No additional external browsing was required for this implementation-location research; network/API behavior still needs a real-node smoke test after the managed route is implemented.

## Related specs

- `.trellis/tasks/08-16-dedicated-node-integration/PRD.md`：三节点接入、受控 projection API、版本/ownership 冲突和生产门禁。
- `.trellis/tasks/08-16-dedicated-node-integration/research/openui-api-and-management-channel.md`：现有 Bearer API、Xray 全量更新风险、HTTPS/私网管理通道和生产约束。
- `.trellis/spec/api-contract.md`：365Proxy API envelope、错误码、版本和敏感字段脱敏约定（若该文件已存在，以当前仓库版本为准）。

## Caveats / Not Found

- 未找到 `managed-line-projections`、projection ownership marker、desired/observed version、配置 hash 或 capability/version 探针的现有实现；这些必须作为一个版本化 OpenUI 扩展一起开发并部署到三台节点。
- 未找到按节点/用途 scope 限制的 token；现有 `ApiToken` 是全局管理凭据，且数据库字段为明文。若暂时复用，生产门禁只能标记为 blocked。
- 未找到针对局部 outbound/routing patch 的现成 service；需要新增深 service 或可测试 adapter，不能在 route handler 中拼接整份 Xray 模板。
- 未在真实节点上验证 TLS、reload/read-back、出口探测、并发冲突、重启恢复或 SQLite migration；这些属于实现后的必跑 smoke/故障演练，不应以静态代码研究替代。
- 研究只读外部 OpenUI 仓库，未修改任何代码、配置、数据库或服务器状态。
