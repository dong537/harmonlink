# 3x-ui/Xray、多节点、任务队列与 SOCKS5 链路审计

- 审计日期：2026-09-11
- 审计范围：本仓库 `C:\Users\Lenovo\Desktop\365` 的 API、Worker、Prisma schema、provider adapter、专线控制面，以及历史 OpenUI/节点验证记录
- 审计模式：只读代码审计与证据整理；本次未修改业务代码、未调用生产凭据、未输出任何 secret/token/password
- 结论等级：`代码已存在` 只代表当前仓库有实现；`外部未验证` 代表需要在真实 OpenUI/Xray 节点上复核；两者不能互相替代

## 执行摘要

仓库已经形成一个相对完整的专线控制面：PostgreSQL 持久化节点、节点组、入站模板、放置策略、专线、投影、库存、预留、外部任务和迁移；API 通过 DB 事务建立订单/资金/库存边界，Worker 通过 PostgreSQL lease 轮询执行 provider 采购和节点投影。当前没有在本仓库发现 3x-ui/OpenUI 或 Xray 服务端实现，因此无法仅凭本仓库证明以下数据面事实：

- 远端节点是否真的存在并启用了 `/panel/api/managed-line-projections`；
- 投影是否真的写入 Xray client、SOCKS5 outbound、routing rule，并触发 reload；
- Xray 是否实际执行流量配额、上下/下行速率、IP 数和并发连接限制；
- 供应商返回的 SOCKS5 是否能从目标节点完成握手、访问外网并在到期后失效；
- 三节点故障、容量竞争、迁移和回滚是否在生产环境可重复。

因此当前状态应标记为：**控制面代码就绪，数据面和生产接受仍 blocked**。执行开关默认关闭时不会把这些缺口伪装成成功。

## 证据约定与来源边界

本文中的“已确认”来自当前仓库静态代码、单元测试或已保存的历史验证文件；“未证明”不等于实现一定不存在，而是当前仓库没有足够证据。历史文档中的节点 IP、端口和部署 SHA 仅用于说明验证范围，不在本文重复任何凭据或敏感连接信息。

主要证据：

- `packages/db/prisma/schema.prisma:1204-1515,1858-1922`：节点、放置、专线、投影、外部任务和 outbox 模型。
- `apps/api/src/modules/dedicated-line-projections/managed-line-projection.adapter.ts`：调用远端 managed projection API 的客户端契约。
- `apps/api/src/modules/dedicated-line-projections/process-dedicated-line-projection.use-case.ts` 与 `dedicated-line-projection.repository.ts`：任务 claim、投影 read-back、READY 状态和 lease。
- `apps/worker/src/main.ts`：Worker 进程和轮询任务注册。
- `apps/api/src/modules/dedicated-line-orders/create-dedicated-line-order.use-case.ts`、`process-dedicated-line-order.use-case.ts`：库存、放置、计费预留、provider 采购、交付校验和投影入库。
- `apps/api/src/modules/providers/*`：provider 注册、库存同步、采购和协议映射。
- `apps/api/src/modules/dedicated-lines/update-dedicated-line-limits.use-case.ts` 与 `build-managed-line-projection-request.ts`：限制值的持久化和投影请求构造。
- `.trellis/tasks/08-16-dedicated-node-integration/verification-2026-08-18.md`：历史节点端口/TLS/managed projection 验证记录。
- `.trellis/tasks/08-16-dedicated-node-integration/research/openui-api-and-management-channel.md`、`openui-managed-projection-implementation.md`：OpenUI 扩展设计和接口研究；这些文件是研究建议，不等于当前节点已部署。

## 1. 架构与数据流

### 1.1 控制面对象

| 领域 | Source of Truth | 关键字段/约束 | 结论 |
| --- | --- | --- | --- |
| 节点组 | `node_groups` | `siteId + code` 唯一、区域、启用状态 | 支持按区域组织多节点 |
| 控制节点 | `control_nodes` | `baseUrl`、加密 API credential、fingerprint、状态、容量/已分配单位、健康时间 | 控制面保存节点连接和容量，不保存 Xray 运行时状态 |
| 入站模板 | `inbound_profiles` | 协议、tag、监听端口、可选节点绑定 | 入站 tag/协议由控制面持有；真实 Xray 入站在外部 |
| 放置策略 | `line_placement_policies` + allowed nodes | replica 数、最小 ready 数、每节点上限、优先级 | 订单前解析放置，支持多节点 fan-out |
| 专线 | `dedicated_lines` | 协议、client identity、到期、desiredVersion、配额/速率/连接/IP 限制 | 业务状态和期望状态的权威记录 |
| 节点放置 | `dedicated_line_placements` + `_nodes` | placement 版本、节点序号、assignment fingerprint | 控制面记录目标节点，不代表节点已成功应用 |
| 投影 | `dedicated_line_projections` | projection key、desired/observed version/hash、节点外部 ID、错误与重试 | 用于把期望配置与远端观察值对账 |
| 任务 | `external_jobs` | 状态、attempt、lease、nextRunAt、dedupe/idempotency key | PostgreSQL 队列和执行审计的主要载体 |
| 事件 | `outbox_events` | lease、发布状态、去重键 | Bark/外部通知等异步副作用的 outbox |

### 1.2 订单到数据面的链路

```text
客户请求
  -> canonical order use case
  -> fresh inventory snapshot + placement policy + SKU quote
  -> PostgreSQL transaction: wallet reservation/debit + order + external_job
  -> dedicated-line order worker (DB lease)
  -> provider adapter: buy/query SOCKS5
  -> delivery validation (数量/国家/协议/凭据/到期)
  -> dedicated_line + exit assignment + placement + projection rows
  -> projection worker (DB lease)
  -> HTTPS Bearer PUT /panel/api/managed-line-projections/:key
  -> 外部 OpenUI service -> Xray config/reload/read-back (仓库外，未验证)
```

这条链路中，PostgreSQL 是业务订单、资金、库存预留、专线和投影状态的权威来源；OpenUI SQLite/Xray（若存在）只能是节点侧执行投影，不能反过来成为订单或价格来源。

## 2. 3x-ui/OpenUI/Xray 边界

### 2.1 当前仓库已经实现的客户端契约

`ManagedLineProjectionAdapter` 实现了以下客户端行为：

- `PUT /panel/api/managed-line-projections/:projectionKey`：发送 `desiredVersion`、入站 tag/协议、client identity、SOCKS5 egress 和 lifecycle 限制。
- `GET /panel/api/managed-line-projections/:projectionKey`：读取投影摘要。
- `DELETE /panel/api/managed-line-projections/:projectionKey?desiredVersion=...`：删除后再次 read-back，确认 `DELETED` 和版本一致。
- 从 `control_nodes.apiCredentialCiphertext` 解密 Bearer token；使用 SSRF URL 检查、超时和远端 HTTP 状态映射。
- 将 404/409/401/403/408/429/4xx/5xx 映射为本地 typed `AppError`，不把失败伪装成空数据。

证据：`apps/api/src/modules/dedicated-line-projections/managed-line-projection.adapter.ts:9-203`。

### 2.2 投影 Worker 的一致性检查

`ProcessDedicatedLineProjectionUseCase` 会：

1. 从 `external_jobs` claim 带 lease 的任务；
2. 读取节点、入站、专线和出口的加密资料，验证节点未禁用、入站活动且绑定节点匹配、出口状态/到期有效；
3. 重新构造投影请求并计算 desired hash，阻止任务 payload 与数据库期望不一致；
4. 调用 adapter `upsert`；
5. 要求远端返回相同 projection key、desired/observed version、`ACTIVE` 状态以及 desired hash == observed hash；
6. 通过 repository 将投影设为 `READY`，并记录 observed hash/version；失败则按错误类型重试或转 `NEEDS_OPERATOR`。

证据：`apps/api/src/modules/dedicated-line-projections/process-dedicated-line-projection.use-case.ts:24-63`、`dedicated-line-projection.repository.ts:61-322`。

### 2.3 未在仓库发现的关键实现

本仓库没有 `/panel/api/managed-line-projections` 的服务端 controller/service，也没有 3x-ui/OpenUI 的 Xray 配置写入、ownership marker、SQLite 持久化、reload、运行时统计或出口探测代码。Adapter 测试使用 mock `fetch`，只能证明客户端错误映射和 read-back 判断，不证明真实节点行为。

因此以下问题必须在外部 OpenUI 仓库/部署中单独交付并验收：

- projection key 到 inbound client、outbound 和 routing rule 的唯一 ownership；
- desiredVersion 冲突返回 409，禁止全量模板覆盖人工修改；
- 局部 JSON patch 的事务性、配置校验和 reload；
- Xray reload 后真实 read-back，而不是仅返回请求体；
- verify 接口提供 `xrayHealthy`、egress reachable、限制生效状态；
- 删除只删除同 ownership marker 的对象，避免误删非平台配置；
- 节点版本/capability 探针和迁移兼容性。

### 2.4 管理通道安全

历史研究建议使用每节点独立 Bearer token、HTTPS、证书链验证和 allowlist；adapter 当前会拒绝不安全 URL，但是否每台节点实际启用 HTTPS 尚未被当前仓库证明。不能以 `rejectUnauthorized=false`、公网 HTTP、浏览器 Cookie 或共享管理员 token 代替机器到机器认证。

## 3. 任务系统与 Worker

### 3.1 队列形态

主链路不是 BullMQ/Redis 队列，而是 PostgreSQL `external_jobs`：

- `QUEUED -> LEASED -> COMPLETED/RETRYING/FAILED/NEEDS_OPERATOR`；
- `leaseOwner`/`leaseExpiresAt` 防止多 Worker 重复执行；
- `attempt/maxAttempts`、`nextRunAt` 支持退避和过期 lease 回收；
- `idempotencyKey` 与 `dedupeKey` 由数据库唯一约束兜底；
- payload 记录 provider、库存、放置、投影版本等执行快照。

`fulfillment_jobs` 是另一条较早的静态代理履约队列，不应与 dedicated-line `external_jobs` 混称。代码检索未发现 Redis 负责专线任务调度；`REDIS_URL` 主要用于 API readiness/config gate，不能据此推断已有 Redis queue。

### 3.2 Worker 进程

`apps/worker/src/main.ts` 注册并轮询：

- fulfillment worker；
- inventory sync worker；
- dedicated-line order worker；
- dedicated-line projection worker；
- dedicated-line migration worker；
- Bark outbox worker；
- control-node health probe；
- reservation reclaim sweep。

各执行开关由环境变量控制，且启动时 `ConfigGuard.verify()` 校验配置。专线订单、库存、投影、迁移默认 gate 关闭；这是一项正确的上线保护，但不等于数据面已验收。

### 3.3 失败语义和风险

订单处理器在发出 provider 请求前后区分是否可能已经扣款：未发出请求的失败释放预留；已发出请求的失败不自动退款，而是重试或 `NEEDS_OPERATOR`，避免上游已购买但本地误退款。该逻辑位于 `process-dedicated-line-order.use-case.ts:36-151`，应配合外部订单查询和运营告警验证。

仍需真实验证：Worker 重启、lease 过期、provider 超时后订单状态、重复 provider 查询、数据库故障和告警是否可观测。单元测试不能替代这些故障演练。

## 4. Provider 与 SOCKS5 路径

### 4.1 已注册 provider

`providers.module.ts`/`provider-registry.service.ts` 注册：`IPIPD`、`NINE_EIGHT_FIVE`、`PR`、`UPSTREAM_API`。provider credential 在 `provider_accounts` 中加密保存，adapter 通过统一 `ProviderAdapter` 接口实现 health、inventory、buy、query。

### 4.2 订单侧协议契约

`CreateDedicatedLineOrderUseCase` 在 job payload 中写入 `protocol: 'SOCKS5'`；`parseRequest` 对任何非 SOCKS5 请求直接报 `dedicated_line_requires_socks5`。`ProcessDedicatedLineOrderUseCase` 的 `assertDelivery` 要求：

- 返回数量与购买数量相等；
- 国家代码与请求一致；
- 协议为 SOCKS5；
- host、port、username、password 有效；
- expiresAt 在未来。

然后才把出口凭据加密写入 `dedicated_line_exit_assignments`，并构造投影。证据：`process-dedicated-line-order.use-case.ts:156-264`。

### 4.3 Adapter 观察

- **NINE_EIGHT_FIVE**：真实调用 `/res_static/inventory`、`/res_static/buy`、`/res_static/order_result`；对 SOCKS5 优先取 `port_socks`，并把异步订单先保存 upstream order ID 再轮询。
- **IPIPD**：使用签名 API，按 `providerResourceId` 或国家/城市/业务类型构造订单；将上游协议映射并校验返回协议、到期时间和国家。
- **PR**：调用 Proxy-Seller 风格 API 的 resident inventory/order 端点；可由 `UPSTREAM_PROXY_SELLER_SOCKS5_URL` 改变请求传输代理，但当前 `mapProxy` 默认协议映射需以真实上游返回契约和受控订单验证为准。
- **UPSTREAM_API**：存在统一 adapter 注册，但本审计未把其生产资源映射和价格视为已验收。

这些 adapter 的静态实现不证明供应商账户有余额、资源真实可售、国家/端口语义稳定或返回的 SOCKS5 能从每个控制节点连通。必须用新鲜 inventory snapshot 和一笔 allowlist 受控订单做真实 smoke。

### 4.4 库存、价格与资源映射风险

订单先查新鲜库存快照，再解析放置策略和 SKU 价格，最后在事务中预留库存/扣款并入队。`availableCountriesForProvider()` 当前直接返回空数组；`sku-seed.ts` 只定义 SV/ZB 的能力（VLESS/VMESS/MIXED、多节点），未提供完整 provider-resource/country/price 生产映射。任何启用 provider 前都必须补齐并审计这些 Source of Truth；不能用空数组、默认价格或静态国家列表掩盖上游失败。

## 5. 多节点放置、健康与迁移

### 5.1 放置与容量

订单阶段由 `line_placement_policies` 选择 node group、inbound profile、目标副本数、最小 ready 数和每节点单位上限；`control_nodes.capacityUnits/allocatedUnits` 和 allowed-node 关系用于容量约束。预留和订单事务保证控制面不在未解析放置时扣款。

多节点 placement 会为同一专线生成多个 projection rows/jobs。`dedicated_line_projections` 的 unique key、desiredVersion/hash 和 node id 能防止不同版本混写，但实际“至少 N 个节点同时可用”的运行时路由语义仍在 OpenUI/Xray 外部。

### 5.2 健康探针

Worker 的 control-node health use case 会对节点做读/回读检查，记录健康观察并生成迁移建议；当前没有证据表明它会自动修复配置、自动 drain 节点或自动切换所有在线连接。TCP 端口可达不能替代 Bearer、TLS、projection capability、Xray 状态和 egress 检测。

### 5.3 迁移

当前代码已经有 `DedicatedLineMigrationWorker`、迁移 job repository 和 migration API；不要沿用旧报告中“完全没有迁移 worker”的说法。仍未由真实节点 smoke 证明：

- 源/目标节点投影的 prepare/commit 顺序；
- 出口导入后的 SOCKS5 握手和流量连续性；
- 目标 READY 不足时的回滚与旧投影保留；
- 节点被禁用、容量变化或 provider 出口过期时的 operator 路径。

历史 migration smoke 通过 `MigrationSmokeAdapter` 验证 delivery domain，不等价于节点侧 Xray/egress 验证。

## 6. 流量、速率、IP 和连接保护

### 6.1 控制面字段

`dedicated_lines` 持久化：

- `quotaBytes`（数据库字段；API 输入名 `trafficLimitBytes`）；
- `uplinkLimitBps`；
- `downlinkLimitBps`；
- `maxConnections`；
- `ipLimit`。

`UpdateDedicatedLineLimitsUseCase` 对非负整数和 Prisma 范围做校验，更新 `desiredVersion`，重置所有 projection observed 状态，创建投影 job，并写审计日志。`buildManagedLineProjectionRequest` 将这些值发送到远端 lifecycle。证据：`apps/api/src/modules/dedicated-lines/update-dedicated-line-limits.use-case.ts:24-146`。

### 6.2 未证明的运行时行为

本仓库没有 usage counter、周期性 quota consumption、Xray stats 采集、流量断开/限速实现，也没有能证明 `maxConnections`/`ipLimit` 在实际连接上的 enforcement。尤其要确认：

- Bps 是 bit/s 还是 byte/s，是否按连接或专线聚合；
- quota 是否以字节累计，达到边界是拒绝新连接、断开现有连接还是仅标记；
- `0` 是“无限制”还是“禁止”；当前订单创建时 lifecycle 限制被置为 0，必须由外部契约明确；
- IP 统计按源 IP、认证 client 还是出口 IP；IPv4/IPv6、NAT 和重连如何处理；
- 到期、暂停、续期和迁移时计数是否重置或继承。

在这些语义和真实 Xray 行为有证据前，不能把控制面字段称为“已启用限速/配额保护”。

## 7. 已发现的管理 API

### 7.1 控制面管理

- `GET /admin/control-plane/nodes`
- `GET /admin/control-plane/references`
- `POST /admin/control-plane/node-groups`
- `POST /admin/control-plane/inbound-profiles`
- `POST /admin/control-plane/nodes`
- `PUT /admin/control-plane/nodes/:id`
- `POST/GET /admin/control-plane/placement-policies`
- `PUT /admin/control-plane/lines/:id/domains`
- `PUT /admin/control-plane/lines/:id/limits`
- `GET /admin/control-plane/lines`
- `GET /admin/control-plane/lines/recommendations`
- migration list/get/create/commit/cancel/retry endpoints

### 7.2 客户专线

- `GET /dedicated-lines`
- `GET /dedicated-lines/:id`
- `POST /dedicated-lines/:id/renew`
- `POST /dedicated-lines/:id/suspend`
- `POST /dedicated-lines/:id/resume`

这些路由只代表控制面 API 存在；每个状态转换是否最终反映到 Xray、是否可在节点失联时正确显示 `PENDING/DEGRADED/NEEDS_OPERATOR`，需要端到端测试。

## 8. 风险与阻塞清单

| 严重度 | 发现 | 当前证据 | 影响 |
| --- | --- | --- | --- |
| P0 | 外部 managed projection API/3x-ui 实现不在本仓库 | 全仓库未找到该 route 的服务端实现；仅有 adapter | 订单可在 DB 完成但节点未开通，或投影永远失败 |
| P0 | 三节点 HTTPS/TLS 和 capability 未验收 | 历史记录只证明 TCP；部分节点 HTTP 404、TLS 握手失败/超时 | Bearer 管理通道不可安全使用 |
| P0 | Xray 数据面 enforcement 未证明 | 无运行时 usage、reload、egress、limits 实现 | 配额/限速/IP/连接保护可能只是数据库字段 |
| P1 | provider 真实库存/采购/SOCKS5 未做生产受控 smoke | adapter 有代码和 mock 测试，缺真实账户证据 | 供应商协议、余额、端口和返回格式漂移会导致付费失败 |
| P1 | SKU/provider 资源映射和价格不完整 | SKU seed 只有 SV/ZB 能力；available countries 返回空数组 | 可能无法安全开放国家、价格和库存 |
| P1 | 多节点容量/故障/迁移未做并发与真实节点演练 | 控制面模型和 worker 存在，迁移仅有代码级路径 | 节点失联或容量竞争时可能无法维持最小 ready 副本 |
| P1 | 观测字段不足以证明数据面 | 有 job/projection 错误和审计，但缺外部 request ID、Xray stats、quota usage 等统一指标 | 运维无法判断“DB READY”与“真实可用”差异 |
| P2 | `REDIS_URL` 容易被误解为任务队列依赖 | 代码使用 PostgreSQL polling；Redis 主要 readiness/config | 部署者可能错误扩容/监控队列组件 |
| P2 | 历史验证与当前 release 可能漂移 | 历史报告注明 online SHA 非当前本地 release | 不能把旧测试结果直接当当前生产证据 |

## 9. 生产门禁与验证矩阵

在以下证据全部具备前，保持执行开关关闭：

1. **节点能力门禁**：每个节点运行同一 OpenUI build；HTTPS 证书链、Bearer token、版本/capability 探针通过；token 按节点加密保存并可轮换。
2. **Managed projection 门禁**：对 SV、ZB 各执行 create/update/read-back/delete/verify；覆盖 ownership 冲突、desiredVersion 冲突、重复请求、reload 失败和节点重启恢复。
3. **数据面门禁**：从实际节点完成 Xray 健康检查、SOCKS5 handshake、目标域名/IPv4/IPv6 egress；确认 client、outbound、routing tag 与返回连接一致。
4. **Provider 门禁**：同步新鲜 inventory；核对 provider account 余额、国家、端口和到期；仅对 allowlist 账户执行一笔受控订单并保存 upstream request ID、返回摘要和握手证据。
5. **多节点门禁**：先单节点，再三节点；验证容量并发、最小 ready 副本、健康降级、节点 drain、手动迁移、迁移回滚和重复 job 幂等。
6. **限制门禁**：用真实连接压测验证 quota、上下行速率、IP 数、并发连接、暂停/到期/续期边界；明确单位和 `0` 语义，并采集 usage。
7. **运维门禁**：外部 request ID、节点 ID、projection key、desired/observed version、延迟、重试、lease、quota 使用和告警可查询；secret、client identity、完整连接 URL 不进日志。

建议每个门禁保存：时间、release/build、节点标识、测试 fixture、命令/请求摘要、HTTP 状态、数据库审计 ID、Xray read-back、失败原因和回滚结果。不要用 mock response、TCP connect 或静态截图代替。

## 10. 建议实施阶段

### 阶段 A：冻结并建立能力门禁

保持所有 provider/order/projection/migration execution gate 关闭；注册节点和放置策略，完成 HTTPS/TLS、token、备份/恢复和版本一致性。对不具备 capability 的节点标为 `NOT_READY`，不得接单。

### 阶段 B：交付外部 OpenUI 合同

在独立的 OpenUI/Xray 代码线实现 managed projection service：ownership marker、局部 patch、版本冲突、SQLite 持久化、Xray reload/read-back、verify/egress 检查和删除边界。以同一 release 部署全部节点并做真实 smoke。

### 阶段 C：受控 Provider/SOCKS5 路径

补齐 provider-resource、国家和 SKU 价格映射；先同步库存，再对 IPIPD、NINE_EIGHT_FIVE、PR 各选一个 allowlist 账户做受控购买、查询、SOCKS5 握手、到期和退款/人工处理演练。失败必须是 typed error，不得 fallback 到静态库存。

### 阶段 D：多节点上线

单节点稳定后扩到三节点，验证容量预留、placement fingerprint、projection fan-out、健康降级和手动迁移。为每个迁移阶段定义 operator 可见状态和回滚点。

### 阶段 E：真实限额与运营硬化

实现/接入 usage telemetry 和 Xray enforcement，补齐单位、计数、重置、暂停/到期语义；建立 projection drift、provider failure、quota nearing/exhausted、lease exhausted 和节点 TLS 过期告警及 runbook。

## 11. 当前可复用的验证结果

历史 `verification-2026-08-18.md` 记录过 API/Worker 测试、lint、typecheck、build、Prisma schema validation，以及 OpenUI worktree 的 `go test/go build/go vet`。同一记录明确说明：三台管理端口仅 TCP 可达，HTTP/TLS 不足以生产接受，执行 gates 保持关闭；online release SHA 也不是当前本地 release。本文沿用这一边界，不把历史代码级通过写成当前生产通过。

本次审计没有运行生产订单、没有访问真实 provider credential、没有修改代码，也没有宣称节点、Xray、SOCKS5 或迁移 smoke 已通过。

## 12. 结论

当前仓库适合作为“控制面和异步执行框架”继续推进：数据模型、预留/幂等、provider adapter、投影版本/hash、lease worker 和迁移骨架已经具备。它还不是一套可独立证明 3x-ui/Xray 数据面正确性的完整交付物。下一步优先级应是外部 managed projection + HTTPS/capability + 真实 SOCKS5/limits smoke；在这些证据形成前，任何把专线标为可售、把 projection `READY` 等同于 Xray 可用、或把限额字段等同于运行时保护的做法都应视为生产风险。
