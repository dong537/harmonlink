# 生产专线履约追踪审计（SKU -> 库存 -> 订单 -> Provider -> 节点 -> OpenUI/Xray）

- 审计日期：2026-09-13（Asia/Shanghai）
- 审计模式：只读生产观察、只读数据库查询和仓库静态审计
- 审计范围：Railway `production` worker、Zeabur `production` 的 API/Worker/数据库，以及专线订单、库存、Provider、control node、placement、projection worker 和节点数据面的证据链
- 改动边界：本次未修改业务代码、`apps/web/**`、Zone、部署配置或生产数据；未执行部署、迁移、启停节点、下单、退款或其他生产写操作
- 敏感信息边界：本文不记录生产密钥、完整数据库连接串、节点地址、用户凭据、机器认证值或 SOCKS 凭据

## 一句话结论

**当前仍是 blocked，不能开通真实专线履约。** 控制面代码和本地测试覆盖了订单、库存预留、放置、任务 lease、投影状态机等边界，但两个生产运行环境都关闭了专线执行；Zeabur 数据库没有可用 control node，节点地址还不满足客户端的 HTTPS 约束；仓库也没有 OpenUI/Xray 服务端实现或真实数据面 read-back 证据。因此健康检查 200、镜像部署成功、库存同步成功，都不能被解释为客户拿到可用的 SOCKS5/VLESS/VMESS 专线。

## 证据等级与边界

本文将证据分为三类：

1. **代码契约**：当前分支源码、Prisma schema 和单元/集成测试证明调用边界与失败语义存在；不证明生产配置或远端节点实现。
2. **运行时观察**：Railway/Zeabur CLI 状态、worker 日志和公开健康检查证明某个服务在某个时刻运行；空日志不等于无错误，`RELEASE_GIT_SHA` 也只是版本一致性标记。
3. **数据面验收**：必须从真实 control node 完成管理 API、Xray 配置/read-back、SOCKS5 握手、外网出口、到期和限制验证。本次没有获得这类证据。

历史研究文件中的节点地址、端口和部署细节只作为范围线索使用；本文不重复敏感值。Railway 与 Zeabur 是两个独立平台和运行实例，不能把其中一个平台的数据库、日志或 worker 状态当作另一个平台的生产证明。

## 数据流与 Source of Truth

```text
客户请求
  -> canonical SKU/catalog + 新鲜 dedicated inventory snapshot
  -> placement policy + ACTIVE control nodes
  -> PostgreSQL 事务（钱包预留、订单、external_job）
  -> dedicated-line order worker
  -> Provider 采购/查询与交付校验
  -> dedicated_line + exit assignment + placement + projection rows
  -> projection worker
  -> 节点 managed-projection API
  -> OpenUI/Xray 配置、reload、read-back、真实流量
```

| 对象 | 权威来源 | 不能替代的来源 |
| --- | --- | --- |
| SKU、价格、销售状态 | `service_skus` 及 canonical catalog/price use case | 前端缓存、静态国家列表、默认价格 |
| Provider 可售库存 | Provider -> `dedicated_line_inventory_snapshots`，只接受未过期快照 | 过期快照、空数组、手工测试记录 |
| 钱包、订单、预留、任务 | PostgreSQL 事务与 `external_jobs` | Redis、页面状态、Provider 返回的临时字段 |
| 放置与容量 | `line_placement_policies`、allowed-node 关系、`control_nodes` | 入站模板展示、节点 TCP 可达性 |
| 专线期望状态 | `dedicated_lines`、`dedicated_line_placements`、`dedicated_line_projections` | 节点面板中的未标记对象 |
| 节点运行时配置 | 节点侧 OpenUI/Xray（仓库外） | 控制面 `READY` 字段本身 |
| 外网出口与流量限制 | 节点实际探测、Xray stats/策略和客户连接 | 请求已发送、HTTP 200 或配置字段存在 |

控制面 PostgreSQL 是订单、资金、库存预留、专线和投影期望状态的 Source of Truth；节点侧数据库或 Xray 配置只能执行投影，不能成为价格、库存或订单状态的替代来源。

## 分平台运行状态

### Railway

| 项目 | 观察结果 | 解释 |
| --- | --- | --- |
| 项目/环境 | `ipipx-platform-live-20260526` / `production` | 与 Zeabur `untitled` 是不同生产实例 |
| 服务 | `worker` 在线，deployment status `SUCCESS` | 只证明容器部署成功 |
| 最近成功部署 | 2026-08-14 16:50:31Z；builder 为 Dockerfile，路径为仓库根 `/Dockerfile` | deployment metadata 未显示预期的 service-specific Railway manifest，存在构建/部署漂移风险 |
| 专线订单执行 | `DEDICATED_LINE_ORDER_EXECUTION_ENABLED=false` | 不会 claim queued order job |
| 专线投影执行 | `DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED=false` | 不会处理 projection job |
| 迁移/健康/Bark | 对应开关均为 `false` | 不会执行迁移、节点健康探测或告警 outbox |
| Provider 库存/履约 | `PROVIDER_INVENTORY_SYNC_ENABLED=false`、`PROVIDER_FULFILLMENT_EXECUTION_ENABLED=false` | Railway 没有库存同步或履约证据 |
| 版本标记 | `RELEASE_GIT_SHA` 前缀为旧 SHA `20e87d146751`，当前 HEAD 为 `45d38b6f6e10...` | 版本明显落后；标记本身仍不是完整镜像来源证明 |
| 日志/资源 | bounded worker log 查询为空；近 24 小时 CPU/网络接近零 | 空结果不能解释为无错误；低资源活动与执行开关关闭一致 |

结论：Railway worker 当前是一个在线但不处理专线任务的实例，不能作为履约生产源。若继续保留该实例，必须明确它是停用/灾备角色，并阻止它与 canonical 数据库形成双写或 split-brain。

### Zeabur

| 项目 | 观察结果 | 解释 |
| --- | --- | --- |
| 项目/环境 | `untitled` / `production` | 与 Railway 独立 |
| 服务 | `api`、`worker`、`openui`、`postgresql`、`redis`、`web` 均为 `RUNNING` | 只证明进程/服务状态 |
| 专线订单/投影/迁移/健康 | 对应执行开关均为 `false` | 任务不会从 PostgreSQL 队列推进 |
| Provider 履约/Bark | `PROVIDER_FULFILLMENT_EXECUTION_ENABLED=false`、`BARK_ALERTS_ENABLED=false` | 不允许真实采购或依赖 Bark 告警完成上线门槛 |
| Provider 库存 | `PROVIDER_INVENTORY_SYNC_ENABLED=true` | 仅库存同步被允许 |
| 版本标记 | API/Worker `RELEASE_GIT_SHA` 前缀均为当前 HEAD `45d38b6f6e10` | 版本标记一致，但不是完整 deployment provenance |
| 镜像来源 | 当前 worker 为 direct Docker deployment，`commitSHA` 为空 | 必须另行核对构建上下文、镜像 digest 和运行入口 |
| runtime log | 大量 `fulfillment_worker_disabled`；没有专线订单、projection、migration、health 执行记录 | 与开关关闭一致，不是成功/失败履约证据 |
| `NINE_EIGHT_FIVE` 库存 | attempted 53、updated 53、synced 53、failed 0 | 证明该 provider 的同步请求在该时刻成功，不证明客户订单或 SOCKS5 可用 |
| `IPIPD` 库存 | 上游 HTTP 401，`reasonKey=upstream_auth_failed` | IPIPD 必须保持履约阻塞，不能用静态库存代替 |

公开 API/Web 健康检查、DB/Redis readiness 和登录 401 只证明既有 transport/auth 路径；没有专线执行或数据面验收含义。

## Zeabur PostgreSQL 只读快照

以下为审计时对 Zeabur production 数据库执行的聚合只读结果。未输出连接变量或行级凭据；数量是快照，不应被当作实时监控。

| 表/对象 | 计数或状态 | 生产含义 |
| --- | --- | --- |
| `control_nodes` | 3；全部 `DISABLED`；每个 capacity 1000、allocated 0；均无 `lastHealthyAt` | 没有可供下单的 ACTIVE 节点 |
| `node_groups` | 1 个，状态 active | 组存在不代表节点可用 |
| `inbound_profiles` | 3 个 active；未绑定具体 control node | 不能据此证明 Xray 入站存在 |
| `line_placement_policies` | 6 个 active；均 `US_DEDICATED`，target/min-ready 为 `1/1` | 策略存在，但执行前仍需节点和 allowed-node |
| policy allowed nodes | 每个策略允许 3 个节点，但 active allowed nodes 为 0 | placement 解析会失败 |
| `dedicated_line_orders` | 4 | 主要是遗留/测试状态，不能直接当生产成功量 |
| `dedicated_lines` / placements / projections | 0 / 0 / 0 | 没有已落库的可交付线路、节点放置或 READY 投影 |
| `residential_exits` / `delivery_routes` | 0 / 0 | 没有可用于数据面交付的出口/路由记录 |
| `external_jobs` | 3：2 个 `PROCESS_DEDICATED_LINE_ORDER` 为 `QUEUED`；1 个 `PROVIDER_DEDICATED_LINE_ORDER` 为 `FAILED` | 队列未被专线 worker 消费；失败原因为 `STOCK_RESERVATION_EXPIRED` |
| `stock_reservations` | 1 个，`EXPIRED` | 不能把预留记录解释为已采购 |
| migrations/recommendations | 0 / 0 | 没有迁移执行或自动建议证据 |
| Provider accounts | `IPIPD`、`NINE_EIGHT_FIVE` 各 1 个，均 active | active 只表示控制面记录状态，不代表认证/余额/可售 |
| `US_DEDICATED` inventory source | `NINE_EIGHT_FIVE` 有 2 个 resource IDs | 有映射候选，但仍需 SKU、国家、价格和新鲜度闭环 |
| `SV` / `ZB` SKU | active/visible，但无 `capabilities.inventorySource` | 默认 SKU 不会自动映射到 Provider 资源 |
| dedicated inventory snapshots | 约 4186 条，只有 24 条未过期 | 大多数库存快照 stale，不能支撑放量 |
| generic inventory snapshots | 约 110877 条，仅 636 条按 TTL 新鲜 | 泛库存数量不能替代 dedicated-line snapshot |

部分订单使用 `MANUAL_TEST`/`test` price source；它们可以帮助审计状态机，但不能作为生产价格、扣款或履约成功证据。

## 代码契约证据

### 配置与 Worker

- `apps/api/src/common/config/config-guard.ts:34-82`：生产环境要求基础密钥；Provider 履约要求 allowlist；专线订单执行要求投影执行、库存同步和 Bark；迁移执行要求投影执行及 HTTPS、非 loopback smoke URL；库存同步间隔必须小于 freshness TTL。
- `apps/worker/src/main.ts:45-175`：注册订单、库存、projection、migration、health、Bark、reservation reclaim worker。执行开关关闭时只记录 disabled，不消费任务。
- `apps/worker/src/dedicated-line-order-worker.ts:41-76`：订单执行关闭时直接返回，不 recovery、claim 或执行 queued job。
- `apps/worker/src/dedicated-line-projection-worker.ts:41-71`：projection 执行关闭时直接返回。

### 库存、SKU 与放置

- `apps/api/src/modules/dedicated-line-orders/dedicated-line-inventory.repository.ts:31-94`：只读取 `expiresAt > now` 的快照，并检查 Provider account active、租户范围和剩余库存。
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-inventory.repository.ts:103-163,779-790`：SKU 必须通过 `capabilities.inventorySource` 显式映射 provider/resource；没有映射就不会写入对应 dedicated snapshot。
- `apps/api/src/modules/catalog/sku-seed.ts:16-42`：默认 `SV`、`ZB` 只有 dedicated-line、协议和多节点能力，没有 inventory source。
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-placement.repository.ts:60-88`：只查询 `control_nodes.status = ACTIVE`，按容量选择；无足够节点时报 `dedicated_line_control_node_capacity_exhausted`。

### Provider 交付契约

- Provider registry 当前包含 `IPIPD`、`NINE_EIGHT_FIVE`、`PR` 和 `UPSTREAM_API`；adapter 的静态实现不能证明账户余额、资源可售或节点可连通。
- 订单创建/处理路径把协议固定为 SOCKS5，并校验数量、国家、host、port、用户名、密码和未来到期时间；这些校验只证明上游响应满足字段约束，不证明从 control node 的真实 SOCKS5 握手或外网出口成功。
- `availableCountriesForProvider()` 当前直接返回空数组。任何依赖该函数的库存/国家展示都不能被解释为“无库存”或“国家已同步”；必须先接通真实快照投影并保留 typed upstream error。

### 订单、任务与投影

- `packages/db/prisma/schema.prisma:1225-1257,1260-1319`：control node、inbound profile、node group、容量、状态和加密节点凭据的持久化模型。
- `packages/db/prisma/schema.prisma:1327-1505,1801-1893`：订单、专线、placement、projection、inventory snapshot、stock reservation 和 `external_jobs` 是控制面 Source of Truth。
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-order.repository.ts:46-97`：订单 job 的 queued/retrying/leased、lease recovery 和上游订单 ID 持久化。
- `apps/api/src/modules/dedicated-line-projections/dedicated-line-projection.repository.ts:46-105,229-309`：projection job claim、lease recovery、版本校验、READY/read-back 和失败/重试/`NEEDS_OPERATOR` 状态。

### 节点 Adapter 与安全约束

- `apps/api/src/modules/dedicated-line-projections/managed-line-projection.adapter.ts:109-124`：向 `{baseUrl}/panel/api/managed-line-projections/:projectionKey` 发送 PUT/GET/DELETE，并使用加密节点 API 凭据、超时和远端状态映射。
- `apps/api/src/common/utils/ssrf.ts:17-31`：只允许 HTTPS，拒绝私有、loopback 和 link-local 地址。
- 本仓库没有该 managed-projection 路径的服务端 controller/service，也没有 OpenUI/Xray 配置写入、ownership marker、SQLite 持久化、reload、运行时 stats 或 egress probe。

## OpenUI/Xray 数据面验证矩阵

| 验收项 | 当前证据 | 状态 |
| --- | --- | --- |
| 节点管理 API 路径存在且版本匹配 | 只有 API 客户端代码；仓库无服务端实现 | 未验证 |
| TLS、证书链和机器认证 | Adapter 强制 HTTPS；数据库节点 URL 为 HTTP | 阻塞 |
| PUT 后真实写入 client/inbound | 无节点 read-back | 未验证 |
| SOCKS5 outbound、routing rule 和唯一 ownership | 仓库无 Xray 写入实现 | 未验证 |
| reload 后进程健康 | 无外部运行时证据 | 未验证 |
| GET 返回实际 observed version/hash | 仅 mock adapter 测试 | 未验证 |
| 从目标节点完成 SOCKS5 握手、外网访问和出口国家 | 未执行真实受控探测 | 未验证 |
| 到期、暂停、删除后的失效 | 无真实流量/连接测试 | 未验证 |
| quota、上/下行速率、IP 数、并发连接限制 | 控制面字段存在，但无 usage counter、Xray stats 或 enforcement 代码 | 未验证 |
| 多节点 min-ready、故障转移和迁移回滚 | 有控制面 migration worker，但无节点数据面演练 | 未验证 |

对数据库中 3 个节点执行的无凭据 `/health` 和 managed-projection probe 共 6 次请求均约 3 秒超时。该结果不能证明节点一定离线，但结合 HTTP `baseUrl` 和 `DISABLED` 状态，当前不能进入执行阶段。

## 阻塞清单

### P0

1. **专线执行全面关闭。** Railway 与 Zeabur 的订单、projection、migration、health 均关闭；Zeabur 仅同步库存，queued jobs 不会完成，Bark 也不会发送告警。
2. **没有可用 control node。** Zeabur 3 个节点全部 `DISABLED`，策略没有 active allowed node；订单放置必然无法满足 target replica。节点 URL 还是 HTTP，而 Adapter 明确拒绝非 HTTPS。
3. **数据面无验收证据。** 没有可证明的 OpenUI managed projection 服务端、Xray client/outbound/routing/reload、SOCKS5 出口、到期和限速/配额行为。不能把控制面 `READY`、HTTP 健康或库存同步当作代理可用。

### P1

1. `SV`/`ZB` 缺少 provider/resource inventory mapping；即使同步成功，也不会自动形成订单所需的 dedicated snapshot。
2. dedicated snapshot 新鲜度严重不足（约 4186 条中仅 24 条新鲜）；必须先恢复稳定同步和 TTL 观测。
3. IPIPD inventory 返回 401；Provider 认证未修复前不得启用该账户履约。
4. Railway 与 Zeabur 的配置、数据库和版本不一致；Railway SHA 落后，Zeabur direct Docker 的 commitSHA 为空。必须选定唯一 canonical 平台，避免 split-brain。
5. 当前订单、失败任务、过期 reservation 和 manual/test price source 主要是遗留/测试信号，不能作为生产成功率或可交付线路数量。
6. 控制面限制字段没有运行时 enforcement 证据；尤其要先定义 bps 单位、quota 为 0 的语义、IP 统计口径和到期动作。

## 受控恢复顺序

1. **确定唯一生产边界。** 书面指定 Railway 或 Zeabur 为 canonical API/Worker/DB；另一平台保持停用或只读，禁止两个 worker 连接同一队列并行履约。
2. **固定发布来源。** 核对 Docker build context、Dockerfile、镜像 digest、运行入口、端口、完整 commit SHA 和 deployment log；清理旧 SHA/空 provenance，不以环境变量单独作证明。
3. **先处理安全与节点配置。** 轮换曾被 CLI 读取过的生产凭据，配置每节点 HTTPS、证书链、独立机器凭据和非 loopback URL；将节点置为 `ACTIVE` 前完成健康、能力和管理 API 探针。
4. **修复 placement。** 将 active node 与 node group、inbound profile、policy allowed-node 正确绑定；验证容量、target replica、min-ready 和并发下单锁定。
5. **补齐 SKU/库存 Source of Truth。** 为 `SV`/`ZB` 明确 provider、resource ID、国家、协议、价格和租户范围；修复 IPIPD 认证；只接受新鲜快照，观察至少一个完整 TTL 周期。
6. **只开启库存同步并观察。** 先确认同步成功、快照数量/过期率、告警和审计日志；失败必须呈现 typed upstream error，不得回退到静态库存。
7. **单笔 allowlist 订单。** 使用 NINE_EIGHT_FIVE 的受控测试账户和真实价格，验证预留、Provider 采购/查询、交付字段、幂等键、lease recovery、钱包账务和失败处理。订单完成前不扩大 allowlist。
8. **单节点 projection smoke。** 开启 projection worker，验证 PUT -> 节点真实写入 -> Xray reload -> GET read-back，且 desired/observed version/hash 一致；从该节点完成 SOCKS5 握手和外网出口探测。
9. **再验证限制和生命周期。** 用短时受控线路验证到期、删除、暂停、quota、速率、IP/连接限制；记录单位、边界和客户可见错误。
10. **最后扩展多节点与迁移。** 在 min-ready、节点禁用、容量竞争、worker 重启、上游超时和 projection 冲突下验证 prepare/commit、旧投影保留、回滚和 `NEEDS_OPERATOR` 路径，再逐步开放客户购买。

## 最终验收门槛

只有同时满足以下条件，才可以把专线购买开关从 blocked 改为可用：

- 选定一个 canonical 平台/数据库，运行镜像来源、完整 SHA、部署日志和 worker 入口可复核；另一平台不会消费同一生产队列。
- 至少一个 control node 为 `ACTIVE`，使用 HTTPS、有效证书和独立机器凭据；健康、managed-projection capability 和 Xray 进程均有成功证据。
- placement policy 的 active allowed nodes 数量满足 target replica，容量分配和并发预留在真实 PostgreSQL 上通过。
- SKU、Provider account、resource/country/price 映射完整；新鲜 inventory snapshot 在 TTL 内，IPIPD 401 已关闭或该 Provider 明确禁用且不会被选择。
- 一笔真实 allowlist 订单完成：`external_jobs`、reservation、wallet ledger、provider order/query、`dedicated_lines`、placements 和 projections 的状态相互一致；没有隐藏的 manual/test 价格。
- 每个 projection 的 observed version/hash 与 desired 一致，节点侧能证明 client、outbound、routing 和 reload；从客户入口完成真实 SOCKS5/VLESS/VMESS 连接和外网出口验证。
- 到期、删除、限速、quota、IP/连接上限以及多节点故障/迁移/回滚均有可重复的浏览器/API/节点探测记录。
- worker 重启、lease 过期、Provider 超时、节点不可达和远端 409/5xx 会进入可观测的 retry 或 `NEEDS_OPERATOR`，不会退款错误、伪造成功或静默变成空库存。
- 日志、报告和监控不泄露生产凭据；Bark/等价告警通道已验证接收，审计字段包含 request/job/projection/node 关联信息。

## 安全提醒

此前读取生产变量的运维过程曾使凭据出现在 CLI 输出或操作者终端。本文没有记录这些值；在任何恢复动作前，应按影响范围轮换数据库、JWT、应用加密密钥、Provider/API、Redis、节点管理和 SOCKS 相关凭据，并检查审计日志与访问记录。应用加密密钥轮换必须采用受控的密文重加密/回滚方案，不能直接覆盖密钥后让既有 credential 失效。轮换完成前不要打开专线执行开关。

## 参考证据

- `apps/api/src/common/config/config-guard.ts:34-82`
- `apps/worker/src/main.ts:45-175`
- `apps/worker/src/dedicated-line-order-worker.ts:41-76`
- `apps/worker/src/dedicated-line-projection-worker.ts:41-71`
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-inventory.repository.ts:31-163,779-790`
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-placement.repository.ts:60-88`
- `apps/api/src/modules/dedicated-line-projections/managed-line-projection.adapter.ts:109-203`
- `apps/api/src/common/utils/ssrf.ts:17-31`
- `apps/api/src/modules/dedicated-line-orders/dedicated-line-order.repository.ts:46-97`
- `apps/api/src/modules/dedicated-line-projections/dedicated-line-projection.repository.ts:46-105,229-309`
- `packages/db/prisma/schema.prisma:1225-1505,1801-1893`
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/xui-multinode-audit.md`
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/production-smoke-20260908.md`
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/zeabur-worker-cli-runtime.md`
- `.trellis/tasks/09-07-fix-frozen-frontend-resource-requests/research/zones-and-deploy.md`
