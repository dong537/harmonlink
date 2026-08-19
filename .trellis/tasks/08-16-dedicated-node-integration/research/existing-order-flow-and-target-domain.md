# 现有订单链路与专线目标领域研究

## 结论

现有仓库只有静态住宅代理购买与发货链路，没有专线节点、线路聚合、OpenUI 投影或迁移模型。专线不能通过给 `CreateStaticProxyOrderUseCase` 增加几个条件来实现，也不能继续把结果写入 `proxy_instances`。正确落点是新增专线订单 use case、专线聚合、节点控制 Adapter 和独立 worker saga，同时复用现有报价、钱包账本、租户隔离、审计、加密与错误契约。

此前设计文档中的 NY 导入与主动双副本不再是本任务的目标。当前业务规则是一条订单只有一个活动节点；节点故障自动摘除并告警，管理员确认后执行蓝绿迁移。三台 VPS 是同一香港节点池的三个可选执行面，不是同一线路的三个同时活动副本。

## 当前 Source of Truth 与调用链

### 静态代理订单

`apps/api/src/modules/orders/use-cases/create-static-proxy-order.use-case.ts` 当前执行：

1. 校验用户/租户权限与 `idempotencyKey`。
2. 通过 `QuoteUseCase` 获取价格与可售状态。
3. 在一个 PostgreSQL 事务中扣钱包、创建 `STATIC_PROXY_BUY` 订单、创建 `fulfillment_jobs` 并写审计。
4. `apps/worker` 调用 `FulfillStaticProxyUseCase` 领取任务。

`apps/api/src/modules/fulfillment/use-cases/fulfill-static-proxy.use-case.ts` 当前执行：

1. 根据资源映射和上游账号获取 Provider Adapter 配置。
2. 调用 `buyStaticProxy`，创建或查询 `upstream_order_mirrors`。
3. 将供应商返回的代理凭据加密后写入 `proxy_instances`。
4. 成功时完成订单；达到重试上限时退款并写审计。

这条链路的领域终点是“向客户交付一组静态代理实例”。专线的领域终点是“创建一条绑定节点、共享入站客户、专用出口和稳定入口的生命周期线路”，两者不等价。

### 当前数据库能力

`packages/db/prisma/schema.prisma` 已有：

- `platform_resources`、`inventory_snapshots`、`resource_mappings`：商品资源、库存快照和供应商映射；
- `orders`、`fulfillment_jobs`、`upstream_order_mirrors`：订单、异步发货和上游订单镜像；
- `proxy_instances`：静态代理实例交付；
- 钱包、审计、通知、上游账号与 AES-GCM 加密所需基础能力。

当前缺少：

- 节点、节点凭据、健康状态和容量；
- SKU 到 OpenUI 入站模板的映射；
- 专线、出口分配、节点 placement、期望/观测投影；
- 稳定交付入口、迁移事务、outbox/reconcile jobs；
- 库存 reservation 与 Bark 去重事件。

## 目标 Module 边界

### `dedicated-lines`

拥有专线订单、生命周期状态、客户身份、SKU、到期时间、当前节点、出口绑定和迁移规则。Controller 只做认证、DTO 与统一响应；状态转换只能由 use case 执行。

### `control-nodes`

拥有节点注册、能力、容量、健康判定和可分配状态。OpenUI 只提供 observed runtime，不拥有订单归属。节点选择使用数据库事务内的容量预留和稳定排序，不在 worker 中随机选择。

### `line-projections`

拥有 `projectionKey + desiredVersion` 的期望状态和观测状态。OpenUI Adapter 只处理共享入站客户、受控出站、Email 路由和 read-back，不读取订单或钱包。

### `dedicated-exits`

拥有 985Proxy/IPIPD/手工导入出口的库存快照、reservation、购买镜像、加密凭据和健康观测。SK5 库存不足时，use case 必须在 Provider 调用前终止并创建去重 Bark 事件。

### `delivery-endpoints`

拥有客户主/备入口的期望目标和切换状态。不再依赖 NY。若使用 DNS，DNS Provider 是实际记录的 Source of Truth，365Proxy 保存期望值和读回证据；若仅使用节点 IP，则迁移会改变客户配置，不能宣称透明迁移。

### Worker

Worker 只领取 outbox/reconcile job、调用 use case 并维护 lease，不拥有业务决策。购买、投影、健康、迁移和清理使用不同 job 类型与并发预算。

## 推荐数据流

```text
客户下单
  -> 专线报价与可售校验
  -> SK5 新鲜库存快照 + 原子 reservation
  -> 事务内扣款 + 创建订单/专线 + 节点容量预留 + outbox
  -> purchase worker 幂等购买出口并加密保存
  -> projection worker 在已分配节点 reconcile 客户/出站/路由
  -> OpenUI read-back 校验 desiredVersion/configHash
  -> delivery endpoint 指向活动节点并读回
  -> 专线 ACTIVE，订单 COMPLETED，返回不含出口凭据的交付信息
```

任一步失败都保留明确阶段。Provider 超时不能推断购买失败并直接重买；OpenUI HTTP 200 不能替代 read-back；入口未切换不能标记迁移完成。

## 入站与节点分配

- 每个节点为每个线路模板维护一个共享入站。首期配置数据为 `SV:60701`、`ZB:60702`，后续新增 SKU/协议通过模板数据扩展。
- 每条专线在共享入站中使用稳定且不可猜测的客户 UUID/email；该身份跨迁移保持不变。
- 每条专线只有一个活动节点投影。目标迁移验证期间可以同时存在源/目标投影，但 `currentNodeId` 只在入口切换成功后的提交事务中改变。
- 默认 placement 在健康且兼容的候选中按 `allocatedUnits / capacityUnits`、剩余容量、稳定节点码排序；客户固定节点策略优先，但仍必须满足健康、模板和容量约束。
- 节点健康失败只改变可分配状态、影响列表和告警，不自动移动现有线路。

## 与旧设计的取舍

`active-active-dedicated-line-control-plane.md` 中可复用的部分：独立专线 saga、共享入站、受控出站与 Email route、desired/observed read-back、库存 gate、外部凭据加密。

本任务明确替换的部分：

- NY route snapshot 不再是交付前置条件；
- 不为每条线路默认投影到多个节点；
- 不在首期承诺 cluster-wide 主动-主动限速；
- 迁移使用单 active 蓝绿切换，管理员确认后执行；
- 前端保持只读，本任务先交付 API、worker、运维 bootstrap 和真实 smoke 证据。

## 实施风险

1. OpenUI 管理通道当前仍是 HTTP；未完成 IP HTTPS、Bearer Token 和续期验证前不能注册为生产可用节点。
2. DNS Provider 及凭据尚未确认；没有稳定入口时只能完成直连测试，不能完成透明迁移验收。
3. 985Proxy 的 SK5 库存与购买真实字段必须以供应商成功样本验证，不能从现有静态资源字段猜测。
4. 三台节点需要真实创建共享入站并验证客户增改删、出站/路由、连接链接和外部出口国家。
5. 现有 `FulfillStaticProxyUseCase` 达到上限即退款的补偿语义不能原样复制；专线部分成功时必须进入 reconcile/needs-operator，避免重复购买或误退款。

