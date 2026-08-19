# 三台 VPS 节点接入 365Proxy 专线控制面

## Goal

将三台已安装 OpenUI v3.0.7 的香港 VPS 接入 365Proxy 专线业务，使 SV（短视频）和 ZB（直播）订单能够在库存约束下稳定分配到不同节点，保存客户的节点与线路归属，并支持故障摘除、幂等重试和单客户迁移。目标是形成可审计、可恢复、可扩容的生产控制面，而不是在下单代码中硬编码三组 IP。

## What I Already Know

- 平台业务是专线，不是家宽；本任务不恢复或扩展家宽购买能力。
- 已确认采用“持久化控制面 + 异步投影/对账 worker”方案，不在订单请求内同步直连面板完成全部配置。
- 节点 `185.216.118.241`：CentOS Stream 9，OpenUI 管理端口 `57323`，服务已显示 `active/enabled`；SELinux 执行上下文问题已处理。
- 节点 `185.216.118.242`：CentOS，OpenUI 管理端口 `22607`；安装完成，但仍需自动化健康与权限复核。
- 节点 `185.216.118.243`：Debian 12，OpenUI 管理端口 `41094`，服务已显示 `active`。
- 三台节点当前管理面均为 HTTP；随机管理路径与凭据只出现在服务器侧，不能提交到 Git、日志或前端。
- 既有业务 SKU 至少包括 `SV` 与 `ZB`，并要求模型能支持后续新增 SKU。
- 原计划测试入口端口为 `SV:60701`、`ZB:60702`；首期采用每节点、每线路模板共享入站，订单通过独立客户身份和受控出站区分，不为每个订单创建新端口。
- NY 面板转发不属于本次控制面；当前目标是使用 VPS 节点，不依赖 NY 面板完成订单交付。
- 当前仓库没有可直接复用的 `node-control`、专线投影或多节点分配实现；既有 `proxy_instances` 不能作为新专线节点模型的权威来源。

## Assumptions (Temporary)

- 365Proxy 数据库是节点、分配、订单和投影期望状态的 Source of Truth；OpenUI 是执行面和实际状态来源。
- 一个客户订单在任一时刻只有一个活动节点归属；迁移通过版本化投影切换，不允许双节点同时被当作活动交付。
- 节点异常时自动停止向该节点分配新订单并发送 Bark 告警；已有线路只标记为受影响，不自动跨节点切换，由管理员确认后触发可恢复迁移。
- 线路入口域名/端口是独立资源，不能由节点 IP 临时拼接；订单只引用已验证且未占用的入口。
- 面板管理 API 需要稳定的机器身份认证；不使用网页登录 cookie/CSRF 会话作为生产集成接口。
- 管理流量必须经过加密或私有隧道，不能在公网 HTTP 上传输 Bearer Token、客户 UUID 或代理配置。

## Requirements (Evolving)

- 持久化三台节点的身份、地区、状态、容量、管理端点、执行面版本和最后健康时间。
- 节点密钥仅存储为加密密文或 secret 引用；API 和日志只返回脱敏信息。
- 为 SV/ZB 定义可扩展的线路配置模板，并按模板生成每个订单的期望投影。
- 每个节点按线路模板维护共享入站；首期默认 `SV:60701`、`ZB:60702`，订单投影只创建或更新客户、受控出站和路由规则。
- 下单事务必须先校验 SK5/专线库存并预占，再选择健康且有容量的节点；库存不足时不得调用 985Proxy 下单 API，并触发 Bark 管理员告警。
- 节点分配必须可解释、可重放，避免随机选择导致单节点超载；首期使用容量约束下的最少已分配连接数策略，并支持客户固定节点覆盖。
- worker 使用幂等 projection key 和 desired version 调用面板 Adapter，成功后读回并记录 observed version/config hash。
- OpenUI 必须提供 Bearer 保护的窄 `managed-line-projections` API，只能修改带 365Proxy ownership marker 的客户、出站和路由；禁止平台通过网页登录或全量模板覆盖完成自动化。
- 投影状态至少包含 `pending`、`applying`、`active`、`retry_wait`、`failed`、`migrating`、`disabled`。
- 节点离线或投影失败时不得把订单标记为已交付；重试必须有上限、退避和可人工恢复路径。
- 节点健康连续失败达到阈值后自动进入 `draining/unhealthy`，立即停止新分配、标记受影响线路并发送去重 Bark 告警；不得自动迁移已有客户。
- 单客户迁移需要创建目标节点投影、验证可用、切换线路入口，再回收旧投影；任何失败都必须保留可回滚状态。
- API 权限、审计日志、request/trace ID 和错误形状遵循项目统一契约。
- 不修改现有前端视觉；如果现有管理接口无法承载节点状态，先提供后端 API 和运维命令，不新增另一套前端。

## Acceptance Criteria (Evolving)

- [ ] 三台节点均能通过受保护的管理通道完成健康检查、版本读取和幂等投影操作。
- [ ] 三台节点运行同一受支持 OpenUI build，managed projection capability/version 一致，且 ownership 冲突会拒绝而不是覆盖非平台配置。
- [ ] 节点、SKU/线路模板、客户归属、入口、库存预占、投影和审计记录均有明确数据库 Source of Truth。
- [ ] 并发下单不会超卖库存、不会把同一入口或面板资源分配给两个活动订单。
- [ ] 节点不可用时新订单不会再分配到该节点，已有订单状态可被识别为降级并触发告警。
- [ ] 节点故障不会自动迁移现有线路；管理员可以查看影响范围并触发单客户或批次迁移。
- [ ] worker 重试不会重复创建 OpenUI 客户或入站；读回状态与期望版本一致后才标记 `active`。
- [ ] 单客户可以在三台节点之间迁移，迁移中断后能够继续或回滚。
- [ ] 库存不足时 985Proxy API 调用次数为零，并产生 Bark 告警事件。
- [ ] 相关迁移、单元/集成测试、lint、typecheck、build 和生产 smoke check 全部通过。
- [ ] 前端文件无本任务引入的行为或视觉变更。

## Definition of Done

- 数据模型和迁移已审查并能在生产数据库安全执行与回滚。
- 控制面、面板 Adapter、worker、健康检查、告警和迁移流程均通过真实接口测试。
- 三台节点以生产配置注册，secret 不出现在仓库、日志、构建产物或前端响应中。
- 部署后完成一笔 SV 和一笔 ZB 的端到端测试订单，并验证连接、归属、到期和回收。
- 生产监控、运维手册、故障恢复和回滚步骤齐全。

## Decision (ADR-lite)

**Context**：同步下单时直接调用单个面板会产生部分成功、重复创建、无法对账、难迁移和单节点过载问题。

**Decision**：采用 365Proxy 持久化控制面作为期望状态 Source of Truth，通过 outbox/reconcile worker 异步驱动可替换的 OpenUI/3x-ui Adapter，并对执行面状态做读回确认。

**Consequences**：订单创建与线路激活成为明确的状态机；实现量高于直接调用，但获得幂等、重试、审计、容量控制、故障摘除和迁移能力。OpenUI API 不稳定时只替换 Adapter，不污染订单域模型。

### 故障迁移策略

**Decision**：采用“自动检测与摘除 + Bark 告警 + 管理员确认迁移”。健康检查负责停止新分配和建立影响清单，不直接改变客户的活动节点。管理员触发迁移后，系统按 `prepare target -> read-back verify -> switch delivery endpoint -> cleanup source` 执行。

**Reason**：首期三台节点没有独立的全局流量切换面，自动迁移可能在瞬时抖动、目标节点容量不足或入口尚未切换时扩大故障。人工确认保留业务判断，状态机仍保证迁移可继续、可回滚和可审计。

### 入站资源模型

**Decision**：SV/ZB 使用每节点、每线路模板共享入站，订单使用稳定的客户 UUID/email 区分；节点上的受控出站与路由把该客户绑定到其专线出口。模板和端口是数据，不在代码中按 SKU 写死。

**Reason**：每订单独立入站会快速消耗端口、增加 Xray 配置体积和迁移复杂度。共享入站符合 OpenUI 的客户增改删 API，并允许后续添加新 SKU 或协议模板。

## Out of Scope

- 不修改或重做用户前端视觉。
- 不把 NY 面板纳入当前控制面，也不依赖 NY 面板完成转发。
- 不恢复家宽购买入口或把 `proxy_instances` 复用为专线节点表。
- 不在生产路径使用 mock、默认假库存、静态成功响应或登录 cookie 自动化。
- 不在首期实现自动跨地域调度；三台节点均按香港资源管理。

## Open Questions

- 三台节点的 IP HTTPS 证书自动续期必须在生产接入前完成真实验证。
- 客户交付入口是否由现有 DNS 服务商自动维护尚未取得生产凭据；不使用 NY 面板后，透明迁移仍需要稳定的主/备域名或等价 L4 入口。管理面板域名与客户交付域名是两个独立问题。

## Technical Notes

- 现有总体方案：`docs/superpowers/plans/2026-08-11-365proxy-full-delivery.md`。
- 现有控制面基础方案：`docs/superpowers/plans/2026-08-11-365proxy-control-plane-foundation.md`。
- 当前三节点专线控制面正式设计：`docs/superpowers/specs/2026-08-16-dedicated-node-control-plane-design.md`。
- OpenUI API 与管理通道研究：`.trellis/tasks/08-16-dedicated-node-integration/research/openui-api-and-management-channel.md`。
- 现有订单链路与专线目标领域研究：`.trellis/tasks/08-16-dedicated-node-integration/research/existing-order-flow-and-target-domain.md`。
- 预计影响 `packages/db`、`apps/api`、`apps/worker`；前端保持只读。
- 实现前必须研究并保存 OpenUI v3.0.7 的管理 API、认证和安全通道证据。
