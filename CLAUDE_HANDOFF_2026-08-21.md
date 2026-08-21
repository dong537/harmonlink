# 365Proxy Claude 接管手册（2026-08-21）

> 本文用于 Claude 直接接管 `C:\Users\Lenovo\Desktop\365`。不包含密码、token、数据库连接串、上游凭据或私钥。需要运维时只按“敏感信息入口”读取本机原文件，禁止把值输出到聊天、日志、测试产物或 Git。

## 1. 当前目标与优先级

最终要部署的仓库固定为：

```text
C:\Users\Lenovo\Desktop\365
```

只读业务参考仓库：

```text
C:\Users\Lenovo\Desktop\365-railway-reference-20260819
```

当前目标不是删除本地新增能力，而是：

1. 恢复 Railway 线上已经验证过的管理端、用户端、SKU、报价、下单、线路交付和控制面业务链路。
2. 管理端和用户端必须复用同一套 Source of Truth、报价 use case、订单 use case 和线路状态机，不能维护两套 SKU/订单模型。
3. 保留当前仓库中额外的健康检查、迁移、投影、告警、上游节点等能力，但它们不得改写 Railway 核心表语义、重复注册路由或绕过统一订单链路。
4. 前端必须同时核对路由、接口、权限、页面行为和线上视觉；不能只让页面“看起来类似”。
5. 通过完整质量门禁后才能部署 Zeabur。不要用线上热修、手工 SQL 或数据库自动迁移掩盖源码冲突。

## 2. 接管后的第一组命令

```powershell
Set-Location C:\Users\Lenovo\Desktop\365
Get-Content -Raw AGENTS.md
Get-Content -Raw CLAUDE.md
Get-Content -Raw .trellis\workflow.md
python .\.trellis\scripts\task.py current --source
git status --short
git diff --stat
git diff --cached --stat
```

当前 Codex session 指针仍指向已经不存在的旧任务：

```text
.trellis/tasks/08-20-admin-customer-dedicated-parity (stale)
```

当前实际可继续的 Trellis 任务是：

```text
.trellis/tasks/08-21-fix-all-errors-production-ready
```

该任务状态为 `in_progress`。Claude 阅读 PRD、`implement.jsonl` 和 `check.jsonl` 后，应在自己的 session 中运行：

```powershell
python .\.trellis\scripts\task.py start 08-21-fix-all-errors-production-ready
```

另有一个近似命名、内容不完整的目录：

```text
.trellis/tasks/08-21-fix-all-errors-to-production-ready
```

不要自行删除或合并它；忽略即可，除非先确认归属。

## 3. Git 与工作区状态

截至本文生成时：

```text
Branch: railway-fixes-merge
HEAD: 4f640ce41026d9b34d656606becd6470f0b43ff0
HEAD message: ops: add reversible legacy API proxy rollout
Dirty paths: 103
  - staged_or_both: 9
  - unstaged: 34
  - untracked: 61
```

重要约束：

- 这些修改来自此前的 Railway 恢复、生产修复和测试工作，全部视为用户工作。
- 禁止 `git reset --hard`、宽泛 `checkout`、`clean`、递归删除或用参考目录整体覆盖根目录。
- 先逐文件比较、合并；本地额外逻辑只要不冲突就保留。
- 当前 staged 的主要内容是恢复后的 `catalog` 模块；不要无故取消暂存。
- 不要因为已有报告声称“0 errors”就认定当前工作树通过，必须基于当前 HEAD + dirty files 重新运行检查。
- `.env`、`.env.cloud`、`.env.backup.*` 已被 `.gitignore` 排除，严禁强制添加。

只读参考仓库状态：

```text
Path: C:\Users\Lenovo\Desktop\365-railway-reference-20260819
Branch: master
HEAD: 2371e7c753d07772203549fb26342e074d66c155
Status: clean
```

## 4. 已确认的核心事实

### 4.1 数据库 Source of Truth

当前根目录的 `packages/db/prisma/schema.prisma` 与只读 Railway 参考文件哈希完全一致。核心表是：

```text
service_skus
sku_price_rules
sku_price_overrides
user_sku_price_overrides
price_templates
user_price_bindings
dedicated_line_orders
dedicated_lines
node_groups
control_nodes
inbound_profiles
line_placement_policies
dedicated_line_placements
```

此前冲突版本使用过另一套 `dedicated_sku_profiles` / `dedicated_nodes` / `dedicated_exits` 模型，生产数据库没有这些表。该模型不能重新成为购买链路的权威来源。

生产数据库最后确认与 Railway 迁移链一致，至少到：

```text
20260815030000_add_legacy_dedicated_line_fields
```

部署前必须重新执行迁移审计；不要直接对生产运行 `prisma migrate deploy`。尤其不要重新引入此前的 `20260817*` / `20260818*` 第二套专线 schema，除非先有明确的数据迁移、回滚和停机方案。

### 4.2 管理端与用户端的统一业务流

应保持以下单一链路：

```text
管理员配置 service_skus / 价格 / 可见性 / 线路能力
  -> CatalogRepository
  -> SkuQuoteUseCase
  -> 用户目录与报价 API
  -> CreateDedicatedLineOrderUseCase
  -> 库存与 placement policy
  -> 钱包扣款与幂等
  -> dedicated_line_orders
  -> dedicated_lines
  -> delivery routes / domains / lifecycle / projections
```

管理员代操作、管理员报价和用户自行购买应复用同一 domain/use case，只能在身份、权限、审计主体和可见范围上不同。禁止管理员页面直接写表、前端自行算价、或用户端读取另一套 SKU 表。

### 4.3 Railway 参考 API 契约

目录和报价：

```text
GET /api/catalog/skus
GET /api/catalog/admin/skus
GET /api/catalog/quote
GET /api/catalog/admin/quote
```

下单和线路：

```text
POST /api/dedicated-line-orders
GET  /api/dedicated-lines
GET  /api/dedicated-lines/:id
POST /api/dedicated-lines/:id/renew
POST /api/dedicated-lines/:id/suspend
POST /api/dedicated-lines/:id/resume
```

标准下单字段：

```json
{
  "skuCode": "string",
  "countryCode": "string",
  "quantity": 1,
  "durationDays": 30,
  "currency": "CNY",
  "idempotencyKey": "string",
  "regionCode": "optional string",
  "businessType": "optional string"
}
```

控制面至少包括：

```text
GET  /api/admin/control-plane/nodes
GET  /api/admin/control-plane/references
POST /api/admin/control-plane/nodes
PUT  /api/admin/control-plane/nodes/:id
GET  /api/admin/control-plane/placement-policies
POST /api/admin/control-plane/placement-policies
GET  /api/admin/control-plane/lines
PUT  /api/admin/control-plane/lines/:id/domains
PUT  /api/admin/control-plane/lines/:id/limits
```

当前根目录已经恢复 `CatalogModule`、`DedicatedLineOrdersModule`、`DedicatedLinesModule`、`DedicatedLineHealthModule`、`ProductionReadinessModule` 和 `ApiV1CompatModule` 的注册；但以下关键文件仍与参考仓库不完全相同，必须逐项证明差异是保留能力而非业务分叉：

```text
apps/api/src/app.module.ts
apps/api/src/modules/dedicated-line-orders/dedicated-line-orders.controller.ts
apps/api/src/modules/dedicated-lines/dedicated-line-control-plane.admin.controller.ts
apps/web/src/app/router.tsx
apps/web/Dockerfile
apps/web/serve.mjs
```

已确认完全一致的关键文件包括：

```text
packages/db/prisma/schema.prisma
apps/api/src/modules/catalog/catalog.controller.ts
```

## 5. 前端必须特别处理的分叉

Railway 参考仓库的生产 `Dockerfile.web` 不重编当前 React 源码，而是直接发布冻结的线上前端：

```text
C:\Users\Lenovo\Desktop\365-railway-reference-20260819\frozen\frontend-railway-6f71aaa1\dist
```

并用参考版 `apps/web/serve.mjs` 提供静态文件和 `/api` 反向代理。当前根目录的 `apps/web/Dockerfile` 会重新构建 React 应用，因此“源码能编译”不等于与 Railway 线上页面一模一样。

Claude 需要明确区分两条路径：

1. **线上视觉/交互完全复刻**：保留当前 React 源码，但增加不冲突的冻结前端部署入口，发布参考 `dist`；不要删除当前页面。
2. **长期 React 迁移**：逐页迁移冻结前端的路由、字段、状态和操作，并用浏览器对比证明等价。在证明完成前不能替换冻结前端。

Railway 页面参考入口：

```text
https://frontend-test-a8da.up.railway.app/proxy/dedicated/buy
https://frontend-test-a8da.up.railway.app/proxy/dedicated/manage
https://frontend-test-a8da.up.railway.app/admin/users
```

至少核对：

- 用户购买页按 SKU 展示产品、周期、国家、库存和价格；协议由 SKU 能力固定，不允许客户自由选择。
- 管理端可创建公共或用户专属 SKU、设置线路/能力/价格/可见性；用户端只看到自己有权购买的 SKU。
- 管理端节点、入口组、出口池、placement policy 与用户下单使用同一条数据链。
- 登录后的管理员/用户路由由服务端角色与权限决定，不能仅靠前端 local state。
- 历史需求还包括注册错误映射、人工充值审核、充值订单号、Zone、工单、用户中心和个人中心不能出现“请求的资源不存在”。这些页面即使不属于本轮专线核心，也必须纳入回归矩阵。

关于登录存在一项历史需求冲突：用户此前要求“用户登录页自动识别管理员、不要独立管理员认证逻辑”，而 Railway 参考路由包含 `/admin/login`。建议把业务契约统一为同一个 `/api/auth/login` 和同一会话/角色识别；如果保留 `/admin/login` 路由，它只能是 UI 入口，不能形成第二套账号、密码或 session 体系。最终页面是否保留需按用户最新确认处理。

## 6. 环境配置（只列键名，不列值）

权威模板：

```text
C:\Users\Lenovo\Desktop\365\.env.example
```

本地受控配置：

```text
C:\Users\Lenovo\Desktop\365\.env
C:\Users\Lenovo\Desktop\365\.env.cloud
C:\Users\Lenovo\Desktop\365\.env.backup.20260820-190707
```

模板当前有 95 个键，本地 `.env` 只有 46 个键，不能假设生产变量完整。关键配置族：

```text
# 公共站点与 URL
APP_PUBLIC_BRAND_NAME
APP_PUBLIC_SITE_URL
APP_PUBLIC_API_URL
APP_PUBLIC_SUPPORT_EMAIL
APP_PLATFORM_CURRENCY
APP_TIMEZONE
APP_ADMIN_BASE_PATH
WEB_PUBLIC_URL
API_PUBLIC_URL
API_INTERNAL_URL
VITE_API_BASE_URL
WEB_API_PROXY_TARGET
CORS_ORIGINS

# 基础设施与安全（必须通过 secret store）
DATABASE_URL
REDIS_URL
APP_ENCRYPTION_KEY
JWT_SECRET

# 核心执行开关
PROVIDER_FULFILLMENT_EXECUTION_ENABLED
PROVIDER_INVENTORY_SYNC_ENABLED
DEDICATED_LINE_ORDER_EXECUTION_ENABLED
DEDICATED_LINE_PROJECTION_EXECUTION_ENABLED
DEDICATED_LINE_MIGRATION_EXECUTION_ENABLED
DEDICATED_LINE_HEALTH_EXECUTION_ENABLED
PAYMENT_CONFIRMATION_ENABLED

# allowlist 与节流
PROVIDER_FULFILLMENT_UPSTREAM_ACCOUNT_ALLOWLIST
PROVIDER_FULFILLMENT_PROVIDER_ALLOWLIST
DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST
DEDICATED_LINE_ORDER_ACCOUNT_ALLOWLIST
WORKER_FULFILLMENT_POLL_INTERVAL_MS
WORKER_FULFILLMENT_BATCH_SIZE
WORKER_DEDICATED_LINE_ORDER_POLL_INTERVAL_MS
WORKER_DEDICATED_LINE_ORDER_BATCH_SIZE
WORKER_DEDICATED_LINE_PROJECTION_POLL_INTERVAL_MS
WORKER_DEDICATED_LINE_PROJECTION_BATCH_SIZE
WORKER_DEDICATED_LINE_MIGRATION_POLL_INTERVAL_MS
WORKER_DEDICATED_LINE_MIGRATION_BATCH_SIZE

# 上游和告警
UPSTREAM_IPIPD_*
UPSTREAM_985PROXY_*
UPSTREAM_PROXY_SELLER_*
BARK_*
CONTROL_NODE_REQUEST_TIMEOUT_MS
```

本地 `.env` 还存在一批不在当前模板中的旧别名，例如：

```text
PROVIDER_PLATFORM365_*
PROVIDER_NINE_EIGHT_FIVE_*
PROVIDER_IPIPD_*
BARK_ENABLED / BARK_BASE_URL / BARK_DEVICE_KEY
WORKER_ENABLED / WORKER_CONCURRENCY / WORKER_POLL_INTERVAL_MS
```

不要让新旧变量名同时成为 Source of Truth。先沿 `apps/api/src/common/config` 和 env schema 查清实际读取路径，再迁移变量。配置缺失必须显式失败，不能用默认值或 broad catch 隐藏。

所有真实执行开关在完成 HTTPS、凭据、allowlist、库存、幂等、投影读回和回滚验证前保持关闭。不要为了 smoke test 提交真实订单、扣款、线路迁移或节点修改。

## 7. Railway 与 Zeabur 信息

### Railway

```text
Project: ipipx-platform-live-20260526
Environment: production
Services: backend, frontend, worker, Postgres
Backend: https://backend-production-43893.up.railway.app
Frontend: https://frontend-production-1870.up.railway.app
Reference/test frontend: https://frontend-test-a8da.up.railway.app
```

Railway 线上用于行为对比，不要直接修改。若要启动本地参考服务，应先在只读参考目录确认依赖和环境，不要改变其 Git 状态。

### Zeabur

```text
Project ID: 6a786d80e4a69d66638d62e1
Environment ID: 6a786d805f062718bc7b8dfb

api service:        6a7c0cb82d4cb87f2ba391e1
worker service:     6a7c3306f6f33e269eb321f8
old web service:    6a7c372d2d4cb87f2ba3ad35
web-react service:  6a862e4528b68717e8fe942a
legacy/openui ID:   6a78a71ae4a69d66638d798a

API domain: https://365proxy-api.zeabur.app
New web domain: https://365proxy-react.zeabur.app
```

`365proxy-untitled.zeabur.app` 曾被删除/解绑，最后一次检查为不可解析，不要再把它写成当前可用入口。

2026-08-20 最后确认 `api`、`worker`、`web-react` 为 RUNNING，但随后一次从 Railway 参考部署 API/Worker 的 CLI 命令超时，可能已经提交、也可能没有完成。接手后第一件外部操作必须查询当前 deployment，而不是盲目再部署：

```powershell
npx zeabur@latest service get --id 6a7c0cb82d4cb87f2ba391e1 --env-id 6a786d805f062718bc7b8dfb --json -i=false
npx zeabur@latest service get --id 6a7c3306f6f33e269eb321f8 --env-id 6a786d805f062718bc7b8dfb --json -i=false
npx zeabur@latest service get --id 6a862e4528b68717e8fe942a --env-id 6a786d805f062718bc7b8dfb --json -i=false

npx zeabur@latest deployment list --service-id 6a7c0cb82d4cb87f2ba391e1 --env-id 6a786d805f062718bc7b8dfb --json -i=false
npx zeabur@latest deployment list --service-id 6a7c3306f6f33e269eb321f8 --env-id 6a786d805f062718bc7b8dfb --json -i=false
npx zeabur@latest deployment list --service-id 6a862e4528b68717e8fe942a --env-id 6a786d805f062718bc7b8dfb --json -i=false
```

CLI 0.21 中 `deployment list` 使用 `--env-id`，而 `deploy` 使用 `--environment-id`。部署必须始终带 `--service-id`，否则会创建重复服务。

不要直接运行当前根目录的 `zeabur.yaml`：它仍含占位仓库 `your-org/your-repo`，Dockerfile 路径也未与当前实际入口完全对齐，只能作为草稿。

## 8. 敏感信息入口

只有执行明确授权的运维/部署时才读取：

```text
C:\Users\Lenovo\.codex\handoffs\365-sensitive-2026-08-18.md
C:\Users\Lenovo\Desktop\365\.env
C:\Users\Lenovo\Desktop\365\.env.cloud
C:\Users\Lenovo\Desktop\3xui\rd01_openui_local_creds.json
C:\Users\Lenovo\Desktop\3xui\rd01_vmess_local_creds.json
C:\Users\Lenovo\Desktop\3xui\rd01_purchase_result.json
C:\Users\Lenovo\Desktop\3xui\rd01_openui_candidate_config.json
C:\Users\Lenovo\Desktop\3xui\rd01_vmess_candidate_config.json
```

规则：

- 不在聊天或文档中回显密码、token、cookie、连接串、VMess 链接或上游账号。
- 不把敏感值放进命令行参数；优先使用受控环境变量或平台 secret store。
- 不读取浏览器 cookie 数据库。
- 管理员密码不要从历史聊天抄入仓库；通过生产 secret/受控重置流程获取。
- 三个 OpenUI 节点在 2026-08-18 的 HTTPS/Bearer 健康验证并未全部通过。未完成证书、Bearer、投影读回前不得开启真实专线执行。

## 9. 当前质量状态（必须重新验证）

`.trellis/tasks/08-21-fix-all-errors-production-ready/prd.md` 记录的基线是：

```text
api:    typecheck 0；build 通过；510/510 tests；lint 曾有 7 个错误
web:    typecheck 0；build/lint 通过；测试曾为 12 failures / 341
worker: 曾有 2 个 typecheck 错误，projection worker 调用点为活跃状态
```

这些是任务建立时的基线，不是当前完成证明。`RAILWAY_RESTORE_REPORT.md` 声称类型错误已经清零，但它的日期/编码和验证证据不可靠，只能作线索。

推荐验证顺序：

```powershell
pnpm --filter @ipeasy/db generate

pnpm --filter @ipeasy/api typecheck
pnpm --filter @ipeasy/api lint
pnpm --filter @ipeasy/api test
pnpm --filter @ipeasy/api build

pnpm --filter @ipeasy/worker typecheck
pnpm --filter @ipeasy/worker lint
pnpm --filter @ipeasy/worker test
pnpm --filter @ipeasy/worker build

pnpm --filter @ipeasy/web typecheck
pnpm --filter @ipeasy/web lint
pnpm --filter @ipeasy/web test
pnpm --filter @ipeasy/web build

pnpm run predeploy:check
```

当前根仓库使用 `pnpm@9.15.0`；只读 Railway 参考仓库锁定 `pnpm@10.34.5`。不要在同一工作区随意切换 package manager 并重写 lockfile。若决定同步参考工具链，必须作为显式变更验证。

## 10. 线上 smoke matrix

先做只读和无副作用检查：

```text
GET /health
GET /ready
GET /api/sites/current
POST /api/auth/login          # 只验证合法测试账号，不输出凭据
GET /api/auth/me
GET /api/catalog/skus         # customer session
GET /api/catalog/admin/skus   # admin session
GET /api/catalog/quote
GET /api/catalog/admin/quote
GET /api/dedicated-lines
GET /api/admin/control-plane/nodes
GET /api/admin/control-plane/references
GET /api/admin/control-plane/placement-policies
GET /api/admin/control-plane/lines
```

浏览器至少覆盖：

```text
/
/login
/register
/dashboard
/proxy/dedicated/buy
/proxy/dedicated/manage
/billing/recharge-orders
/account/profile
/zones 或实际 Zone 路由
/tickets 与新建工单
/admin/users
/admin/control-plane
/admin/pricing
```

断言：

- 页面目标路由真实可达，无 404/“请求的资源不存在”。
- 无 console error、失败 XHR 或被当成空数据的服务端错误。
- 管理员修改 SKU/价格/可见性后，用户目录和报价读取同一数据。
- 用户不能选择 SKU 未允许的协议。
- 订单号、充值申请 ID 由服务端生成且列表可见。
- 注册时 `password_too_weak` 有明确规则；`email_taken` 表示邮箱已注册，不应被误判为系统故障。
- 充值只保留人工审核路径时，不展示支付宝/微信，也不要求填写汇款凭证文本。
- 键盘、focus、窄屏和 200% zoom 不出现遮挡或不可达操作。

禁止在 smoke 阶段执行：

- 真实专线下单、真实钱包扣款或支付确认。
- 节点配置修改、真实迁移、批量线路操作。
- 在不可猜测的 SKU、国家、节点、上游账号缺失时用默认值代替。

## 11. 推荐实施顺序

1. 固定当前任务并保存 `git status` 快照。
2. 以 Railway 参考目录为只读基线，对 `schema -> repository/use case -> controller -> frontend API adapter -> route/page` 做逐层 diff。
3. 先解决 API/Worker 的单一 Source of Truth 和编译/测试问题；不要先补 UI 假数据。
4. 保留额外模块，但删除或停用它们与参考核心重复的路由注册和表依赖；“不删除多余逻辑”不等于允许两套生产链路同时生效。
5. 决定冻结前端部署还是 React 等价迁移，并写入 Trellis PRD；未证明等价前优先冻结前端。
6. 运行全部质量门禁并记录真实结果。
7. 部署顺序：API -> Worker -> Web。每步检查 deployment log 和健康状态后再继续。
8. 先无副作用线上 smoke，再在用户明确提供生产 SKU/节点/上游账号并确认执行开关后做受控订单验收。
9. 把非显而易见的 schema/部署经验更新到 `.trellis/spec/`，再按 Trellis 流程提交；不要把全部 103 个脏文件一次性混成一个不可审查提交。

## 12. 最关键的不要做

- 不要用参考目录整体覆盖根目录。
- 不要恢复 `dedicated_sku_profiles` 作为生产购买 Source of Truth。
- 不要同时维护 `/api/dedicated-lines/catalog` 新链路和 `/api/catalog/*` Railway 链路。
- 不要在前端计算价格、库存或权限。
- 不要把 API 失败 catch 成空数组、零余额或成功状态。
- 不要直接运行生产 migration、真实订单或节点修改来“测试”。
- 不要部署 `zeabur.yaml` 的占位配置。
- 不要信任超时的 CLI 发布请求；先查 deployment ID 和日志。
- 不要提交任何 `.env*`、凭据 JSON、token、cookie 或生成的带敏感信息测试产物。

## 13. Claude 的完成定义

只有同时满足以下条件才能向用户声明完成：

1. 当前根目录的 Railway 核心 schema、API 契约和管理端/用户端数据流已逐项对齐。
2. 额外逻辑保留且没有重复路由、重复模型、影子定价或并行订单链路。
3. API、Worker、Web 的 typecheck、lint、test、build 和 predeploy gate 全绿。
4. 前端与 Railway 参考页面完成真实浏览器对比，核心页面无资源不存在、404、XHR/console error。
5. Zeabur 三个目标服务的部署 ID、状态、日志和公开 URL 均已现场验证。
6. 管理端配置 SKU 后，用户端目录/报价的可观察结果来自同一条服务端链路。
7. 未泄漏或提交任何 secret，未擅自开启真实订单/迁移/节点执行。

