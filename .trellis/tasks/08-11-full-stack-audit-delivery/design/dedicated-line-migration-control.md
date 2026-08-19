# 客户专线指定分配与迁移控制设计

状态：需求已确认，等待最终设计确认后进入实施计划。本设计细化主动-主动总体设计中的节点约束、
独占域名和迁移事务，不改变 NY 面板属于外部 Source of Truth 的边界。

## 目标、用户与成功标准

平台管理员需要为客户/SKU 规定可用 3x-ui 节点集合，新订单只在集合内按容量分配；对既有线路，
管理员可以分别执行仅迁移节点、仅更换住宅出口或完整迁移。单客户、单订单、单线路的变更不能影响
其他线路，失败必须可重试、可取消或进入明确人工处理状态，不能产生静默切换。

成功标准：

- 新订单不会落到客户策略允许集合之外，容量不足时明确拒绝，不用其他节点兜底。
- 每条线路独占一个主域名和至少一个备用域名；域名不跨线路共享。
- 完整迁移在目标投影、目标出口、NY canary 路由和外部连接验证完成前不修改当前生效快照。
- 并发请求只能产生一个活动迁移；所有阶段可幂等重放并记录操作者、原因和失败证据。
- 节点故障只告警并生成建议，管理员确认后才能启动和提交迁移。

明确不做：平台不直接写 NY、DNS 或防火墙；不把 DNS/TCP 可达当成协议认证成功；不自动故障转移；
不在目标容量不足、出口国家未验证或 NY 路由证据缺失时使用 fallback。

## 已确认产品规则

1. 支持 `NODE_ONLY`、`EXIT_ONLY`、`FULL` 三种迁移类型。
2. 客户策略保存允许节点集合，系统在集合内按实时容量选择；管理员可对单线指定具体目标节点。
3. 策略只约束新订单和自动推荐，修改策略不改变既有线路的当前 placement。
4. 每条线路独占域名组，必须有且仅有一个主域名，并至少有一个备用域名。
5. 完整迁移采用准备、NY canary、外部验证、NY cutover、提交、清理的显式流程。
6. 节点故障只自动告警和生成迁移建议，不自动创建或提交迁移。

## Source of Truth 与 Module 边界

| 领域 | Source of Truth | 写入路径 |
| --- | --- | --- |
| 客户允许节点集合 | PostgreSQL placement policy + allowed-node relation | 管理端 policy use case |
| 当前节点、出口、交付路由 | PostgreSQL current placement/assignment/route | 迁移 commit transaction |
| 迁移阶段及源/目标证据 | PostgreSQL migration aggregate | migration use cases + worker |
| 目标节点运行配置 | 365Proxy desired projection + OpenUI observed hash | projection worker/adapter |
| NY 实际转发 | NY 面板 | 管理员操作后导入只读快照 |
| 域名权属 | PostgreSQL line domain binding；DNS 只作外部观测 | 管理端绑定/import validation |
| 出口健康与国家 | 最新成功的外部 SOCKS5 probe observation | exit health worker |

Controller 只负责认证、DTO 和统一 envelope；migration use case 拥有状态转换；repository 在 PostgreSQL
事务中持久化迁移、容量预留、当前版本和审计；OpenUI、Provider、外部连接探测均通过 Adapter；后台
页面只组合 server state 和表单，不在前端推导可提交状态。

## 数据模型

### 允许节点集合

新增 `line_placement_policy_nodes`：`policyId`、`nodeId`、`createdAt`，唯一键为
`(policyId, nodeId)`。节点必须与 policy 的 `nodeGroupId` 一致、状态为 `ACTIVE`、与 inbound profile
兼容；允许节点数不得少于目标副本数。空集合是配置错误，不能解释为“任意节点”。

下单时 repository 只查询 allowed nodes，并按 `allocatedUnits / capacityUnits`、剩余容量和稳定节点码
排序。容量仍在事务内原子预留；候选在并发下失去容量时应重选同一允许集合内的节点，集合耗尽后返回
`CONTROL_NODE_CAPACITY_EXHAUSTED`。

### 稳定域名权属

新增稳定的 `dedicated_line_domains`，包含 `siteId`、`dedicatedLineId`、`hostname`、`port`、
`role(PRIMARY|BACKUP)`、`status(ACTIVE|RETIRED)` 和审计时间。`(siteId, hostname, port)` 全局唯一，
避免一个入口同时交付给两条线路；同一线路通过 use case 保证一个 active PRIMARY 和至少一个 active
BACKUP。历史 `delivery_route_domains` 继续保存每次 NY 导入快照，但只能引用或匹配该线路拥有的域名。

首次导入不能偷偷认领任意域名。域名必须先由管理员从受控域名池绑定给线路；NY route import 必须
匹配绑定关系、角色和端口。解绑/退休必须是显式操作，且不能让可交付线路失去主域名或最后一个备用域名。

### 迁移聚合

新增 `dedicated_line_migrations`：

- 归属：`siteId`、`tenantId`、`userId`、`dedicatedLineId`；
- 身份：`type`、`idempotencyKey`、`requestedBy`、`reason`、`createdAt/updatedAt`；
- 状态：正交的 `status(ACTIVE|NEEDS_OPERATOR|COMPLETED|CANCELLED|FAILED)` 与
  `phase(PREPARE|CANARY_ROUTE|VERIFY|CUTOVER_ROUTE|COMMIT|CLEANUP|ROLLBACK)`；
- 版本：`sourceLineVersion`、`targetLineVersion`、源/目标 placement version；
- 出口：`sourceExitId`、`targetExitId`，目标可以来自已有可用出口或显式 Provider allocation job；
- 路由证据：canary/final route import id、外部 smoke observation id；
- 诊断：`lastErrorCode`、结构化脱敏 detail、retry count、committed/finished 时间。

新增 `dedicated_line_migration_nodes` 保存 `migrationId`、`role(SOURCE|TARGET)`、`nodeId`、ordinal、
capacity reservation 和 projection reference。源/目标快照不能只放进不可查询的 JSON。线路保存唯一
`activeMigrationId`，数据库约束与串行事务共同保证一条线路至多一个活动迁移；终态清空该指针但保留历史。

现有 placement 和 exit assignment 仍表示“当前生效值”。迁移只在 commit transaction 中更新它们；
迁移记录保存前后快照，因此不需要让多个 current 记录并存。

## 状态机与数据流

```text
管理员确认
  -> PREPARE: 锁定线路版本、预留目标容量/出口、创建目标 projection jobs
  -> CANARY_ROUTE: 目标 projection READY 后输出 NY target manifest
  -> VERIFY: 导入备用域名 canary snapshot，运行真实协议/认证/出口国家 smoke
  -> CUTOVER_ROUTE: 管理员切换主域名和全部 active 别名并导入 final snapshot
  -> COMMIT: 单事务切换 current placement/exit/route/version，写审计
  -> CLEANUP: 禁用并删除旧 projection，释放旧节点容量/旧出口
  -> COMPLETED
```

### PREPARE

- `NODE_ONLY` 目标节点集合必须与源集合至少有一个差异，但可以保留部分健康旧节点。容量只为
  `target - source` 节点新增预留，清理时只释放 `source - target` 节点；交集节点沿用现有容量占用和
  projection identity，避免重复计数或误删仍在使用的投影。目标集合与源集合完全相同是 reconcile，
  不是迁移。
- `FULL` 为保证蓝绿切换，目标节点集合必须与源节点集合完全分离。若资源不足，拒绝启动而非降低保证。
- `EXIT_ONLY` 保持当前节点，先验证目标出口可用、国家匹配、未过期且 fanout 足够，再对当前副本执行
  受控版本更新。多副本会短暂处于新旧出口混合状态；需要严格无混合出口时必须使用 `FULL`。
- 需要新增的目标容量在准备前原子递增，需要移除的旧容量在清理完成前保持占用。完整迁移会暂时
  双占全部容量；部分节点迁移只双占发生变化的节点，不会因清理失败超卖。
- 新投影必须全部达到 desired/observed version/hash 一致；仅达到 `minReadyReplicaCount` 不足以提交迁移。

### NY canary 与外部验证

平台输出不含 secret 的 target manifest：迁移 id、专线 id、一个备用域名、目标节点/端口、协议和目标
版本。管理员在 NY 只把该备用域名指向目标，再以 `migrationId + stage=CANARY` 导入快照。当前主域名和
current delivery route 仍保持旧目标。

外部 smoke 必须从平台节点之外使用真实专线凭据连接 canary 域名，验证协议握手、认证、目标站可达、
实际出口国家及稳定时间窗。DNS 解析、TCP connect 或管理员勾选不能替代该证据。失败保持当前线路不变，
记录可重试失败并告警。

### CUTOVER 与 COMMIT

canary 成功后管理员在 NY 将主域名和所有 active 备用域名切到目标，并导入
`migrationId + stage=CUTOVER` 的最终快照。导入只创建 staged route，不直接把旧 route 的
`isCurrent` 改为 false。导入必须验证：

- 域名集合与稳定 binding 完全一致且仅一个 primary；
- targets 与 migration target nodes、端口、protocol、target version 完全一致；
- 所有目标 projection 仍为 READY，目标出口 health observation 仍在 freshness 窗口内；
- 线路 current version 仍等于 source version，活动迁移 id 未改变。

管理员执行最终提交后，单个 serializable transaction 更新 line desired version、placement nodes/version、
exit assignment、route current 标志、line status 和 audit。任何前置条件漂移都返回 conflict，不做部分提交。

### CLEANUP 与回滚

提交成功后不把 cleanup 失败伪装成线路失败：客户线路按新 current route 交付，迁移显示
`NEEDS_OPERATOR/CLEANUP`。清理 job 先禁用再删除旧 OpenUI managed projection，read-back 确认后释放
旧节点容量；旧出口仅在没有其他 assignment/reservation 后释放。失败产生去重 Bark 告警，因为旧节点上
残留有效凭据是安全风险。

提交前取消分两类：

- 尚未导入 canary：自动删除目标投影并释放目标容量/出口预留，进入 `CANCELLED`。
- 已在 NY 修改 canary/cutover：进入 `ROLLBACK/NEEDS_OPERATOR`，要求管理员恢复源 route 并导入
  `stage=ROLLBACK` 快照；校验通过后才能释放目标资源。平台不能假装已回滚外部 NY。

提交后不提供“取消”按钮。反向切换必须创建新的迁移事务，保留完整审计链。

## 故障检测与迁移建议

节点健康状态转为 `DRAINING`、持续不可达或容量越界时，系统按 `lineId + nodeId + incident version`
生成去重 Bark 告警和迁移建议，建议只列出策略允许集合内且容量可用的节点。建议不是迁移，不预留容量，
不修改 line status、placement、NY route 或出口。管理员打开建议后确认目标与原因，才创建迁移事务。

## API 契约

- `GET /api/admin/control-plane/lines`：分页返回当前节点、掩码出口、域名组、版本、健康和活动迁移摘要。
- `POST /api/admin/control-plane/lines/:id/migrations`：完整 replacement body，包含 type、目标节点选择、
  目标出口来源、reason、idempotencyKey。
- `GET /api/admin/control-plane/migrations` 与 `GET /:id`：统一分页/详情，返回阶段、阻塞原因和可执行动作。
- `GET /api/admin/control-plane/migrations/:id/target-manifest`：返回 NY canary/cutover 所需非 secret 清单。
- `POST /api/admin/delivery-routes/import`：扩展 `migrationId`、`stage`；普通初次交付和迁移导入明确区分。
- `POST /api/admin/control-plane/migrations/:id/verify`：排队真实外部 smoke，不接受客户端提交“成功”。
- `POST /api/admin/control-plane/migrations/:id/commit|retry|cancel`：均要求 reason、幂等和状态前置条件。

所有列表使用 `{page,pageSize,total,items}`；所有写操作返回稳定错误码与当前迁移摘要。平台管理员可跨租户
操作当前 site，租户管理员只能操作自身 tenant；客户只读自身交付，不可看到节点 baseUrl、出口凭据、
迁移内部错误或 NY manifest。

关键错误包括：`LINE_MIGRATION_ALREADY_ACTIVE`、`LINE_VERSION_CONFLICT`、
`TARGET_NODE_NOT_ALLOWED`、`TARGET_CAPACITY_EXHAUSTED`、`TARGET_EXIT_UNHEALTHY`、
`ROUTE_DOMAIN_OWNERSHIP_MISMATCH`、`ROUTE_TARGET_MISMATCH`、`MIGRATION_PROJECTION_NOT_READY`、
`MIGRATION_SMOKE_NOT_VERIFIED` 和 `MIGRATION_PHASE_INVALID`。

## 管理端交互

控制面“专线”表格显示客户、SKU、状态、当前节点容量、域名组、出口国家/健康和活动迁移，不把内部 ID
作为主要信息。行级“迁移”命令打开短表单：分段控件选择类型，节点使用允许集合内多选，出口选择现有
资源或 Provider 分配，必须填写原因。提交前摘要明确双占容量、NY 人工步骤和提交后不可取消。

迁移是异步多阶段任务，创建后进入独立详情页而非塞进 modal。详情页以阶段时间线展示 current 与 target
对比、投影 read-back、出口健康、canary/final route、smoke 证据、审计和唯一下一步。只有后端返回
`allowedActions` 时显示提交/重试/取消按钮；前端不自行猜测状态机。

需要覆盖 initial/loading/empty/error/permission/pending/success/needs-operator，长域名/节点码可复制但关键
状态不可截断。目标桌面优先，同时在 320、375、768、1024、1440px 和 200% zoom 验证表格横向滚动、
drawer/页面焦点和操作可达。

## 验证与发布

测试必须穿过 use case/public API，至少覆盖：

- 策略 allowed nodes 校验、容量并发竞争、集合耗尽不越界 fallback；
- 三种迁移的成功路径、幂等 replay、并发活动迁移冲突、源版本漂移；
- 目标投影部分失败、出口国家不符/过期、canary/final NY snapshot 不匹配；
- staged import 不切 current、commit 原子性、提交前两种取消路径；
- cleanup 失败保留待释放容量并告警、重试成功后对 `source - target` 精确释放一次，交集节点不变；
- site/tenant/user 权限隔离、审计字段与 secret 脱敏；
- 管理端键盘、状态、极值和真实后端 contract。

上线顺序：数据库 migration -> API/worker（迁移 gate 默认关闭）-> Web -> 创建域名绑定与节点策略 ->
只读核对 -> 测试线路 NODE_ONLY/FULL 演练 -> 开启迁移。回滚只能关闭新迁移入口和保留 worker cleanup/retry，
不能删除迁移表或覆盖历史。生产验收必须用真实测试线路完成 canary 认证、出口国家、final cutover、旧节点
禁用 read-back 和容量释放；没有该证据时只能标记“代码已部署，真实迁移未验证”。

## 决策记录

**背景**：原地覆盖 placement/route 会在 NY 或 OpenUI 部分失败时丢失当前可用线路；仅双写而不保存迁移
事务无法可靠重试、回滚和审计。

**决策**：采用显式迁移聚合和 prepare/canary/verify/cutover/commit/cleanup 流程；策略使用显式 allowed
nodes；域名是线路独占的稳定绑定；故障检测只生成告警和建议。

**后果**：迁移期间新旧节点同时占用容量，数据库和后台交互更复杂，但 current 状态在提交前稳定，外部
NY 变化有证据，清理失败可见且不会造成容量超卖。`EXIT_ONLY` 的多节点滚动更新无法提供严格的全局原子
切换；要求零混合出口时必须选择 `FULL`。
