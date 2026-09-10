# Legacy API 固定站点隔离研究

日期：2026-09-08

本报告只读审计了认证上下文、`LEGACY_API_SITE_ID` 配置和兼容层测试；没有修改业务源码、配置或部署资源。

## 结论

`LEGACY_API_SITE_ID` 目前只在 legacy 登录、刷新和 dedicated 资源的部分配置读取路径中发挥作用。已认证请求的 `ctx.siteId` 来自 JWT session 或 API key，`AuthGuard` 只验证凭证和 owner type；两个兼容 controller 的受保护资源方法没有统一比较 `ctx.siteId` 与配置站点。因此，持有其他站点的合法 session/API key 的调用者可以进入 `/api/v1` 兼容路由，调用方传给 canonical use case 的 site scope 也会变成该凭证自己的站点。

这不是“跨站读取一定成功”的理由：许多 repository 会因资源不存在而返回空结果或 404；问题在于固定站点 contract 没有在兼容边界执行，而且 `auth/me` 等端点会直接暴露其他站点上下文，写操作也不能依赖下游模块偶然拒绝。

## 事实链

### 认证上下文

- `AuthenticatedContext` 的 `siteId` 是必填字符串，和 `ownerId`、`ownerType`、`tenantId`、`scopes` 同级：[apps/api/src/common/auth/auth-context.ts:6-13](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/auth-context.ts:6)。`requireAuthenticatedContext()` 只做字段存在检查，不做站点值或配置匹配：[auth-context.ts:15-28](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/auth-context.ts:15)。
- `JwtStrategy.authenticate()` 从 `sessions` 行原样返回 `session.siteId`：[apps/api/src/common/auth/jwt.strategy.ts:14-53](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/jwt.strategy.ts:14)。
- `ApiKeyStrategy.authenticate()` 从 `api_keys` 行原样返回 `apiKey.siteId`：[apps/api/src/common/auth/apikey.strategy.ts:13-37](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/apikey.strategy.ts:13)。
- `AuthGuard` 只负责选择 JWT/API key、设置 `req.authContext` 和 credential type；`UserGuard`、`OperatorGuard` 等只检查 `ownerType`，没有 site gate：[apps/api/src/common/auth/guards.ts:42-65](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/guards.ts:42)、[guards.ts:68-116](C:/Users/Lenovo/Desktop/365/apps/api/src/common/auth/guards.ts:68)。

因此 `siteId` 是可靠的认证 source of truth，但不是 legacy 固定站点的校验结果。

### 配置与启动守卫

- `LEGACY_API_V1_ENABLED` 默认 `false`，`LEGACY_API_SITE_ID` 默认空字符串：[apps/api/src/common/config/env.schema.ts:16-20](C:/Users/Lenovo/Desktop/365/apps/api/src/common/config/env.schema.ts:16)。schema 没有把 site ID 做成无条件必填，这符合兼容功能可关闭的场景。
- 生产启动时，`ConfigGuard.verify()` 仅在开关为 `true` 时要求 `LEGACY_API_SITE_ID.trim()` 非空，失败则 `process.exit(1)`：[apps/api/src/common/config/config-guard.ts:6-19](C:/Users/Lenovo/Desktop/365/apps/api/src/common/config/config-guard.ts:6)。启动入口在监听前调用该守卫：[apps/api/src/main.ts:15-22](C:/Users/Lenovo/Desktop/365/apps/api/src/main.ts:15)。
- 该守卫只证明“配置有值”，不证明每个请求的认证上下文属于该站点；非 production 环境也不会走启动守卫，所以 controller 运行时仍必须拒绝空配置和站点不匹配。

### 两个兼容 controller 的差异

`ApiV1CompatController`：

- `assertEnabled()` 读取开关和配置 site ID，空配置返回 `legacy_api_site_not_configured` 500：[apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:350-356](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:350)。
- legacy login 使用该返回值构造 `{ email, password, siteId }`，refresh 也检查 `session.siteId !== siteId`：[api-v1-compat.controller.ts:78-99](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:78)、[api-v1-compat.controller.ts:280-293](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:280)。这两条路径已经是固定站点的。
- 但 `auth/me`、logout、profile、SKU、locations、preview、purchase、mine、renew、QR、remark 等受保护方法都调用无参数的 `this.assertEnabled()`，随后继续使用 `ctx.siteId`：[api-v1-compat.controller.ts:102-277](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:102)。`lock()` 甚至没有注入 `@CurrentContext()`，因此没有位置执行请求站点检查：[api-v1-compat.controller.ts:244-249](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.ts:244)。

`LegacyCustomerResourcesController`：

- 所有订单、通知、工单和 admin 工单方法都调用只检查开关的 `assertEnabled()`；该方法不读取 `LEGACY_API_SITE_ID`，也不接收 context：[apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:57-270](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:57)。
- `cancelOrder()` 和 `deleteNotification()` 是受保护但没有 `@CurrentContext()` 参数的两个例外：[legacy-customer-resources.controller.ts:111-116](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:111)、[legacy-customer-resources.controller.ts:170-175](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.ts:170)。即使其他方法增加 site check，这两个端点也必须补 context 参数，或改为共享 guard。

Trellis contract 已规定兼容登录由配置 site ID 提供 tenant scope、禁止按 hostname/default site 猜测：[.trellis/spec/backend/legacy-api-v1.md:37-51](C:/Users/Lenovo/Desktop/365/.trellis/spec/backend/legacy-api-v1.md:37)。但目前没有把“authenticated context site 必须等于 configured site”落实为边界不变量。

## 现有测试覆盖

- `legacy-customer-resources.controller.spec.ts` 的 mock config 在非开关 key 上统一返回 `site-1`，测试 context 也固定为 `site-1`；没有异站 context、空 site 或 downstream 未被调用的断言：[apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.spec.ts:5-16](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/legacy-customer-resources.controller.spec.ts:5)。
- `api-v1-compat.controller.spec.ts` 同样只把 `LEGACY_API_SITE_ID` mock 为 `site-1`，已有用例验证登录/报价/下单映射，但没有受保护路由使用 `site-2` 的用例：[apps/api/src/modules/api-v1-compat/api-v1-compat.controller.spec.ts:5-20](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/api-v1-compat.controller.spec.ts:5)。
- integration suite 在 `beforeEach` 只创建一个 site，并把配置对象字段改为该 site：[apps/api/src/modules/api-v1-compat/tests/api-v1-compat-integration.spec.ts:20-50](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/tests/api-v1-compat-integration.spec.ts:20)。没有第二站点 token 访问 `/api/v1` 的回归用例。
- integration config 注入了 `NODE_ENV`、数据库、Redis、密钥等变量，但没有注入 `LEGACY_API_V1_ENABLED` 或 `LEGACY_API_SITE_ID`：[apps/api/vitest.integration.config.ts:41-55](C:/Users/Lenovo/Desktop/365/apps/api/vitest.integration.config.ts:41)。`integration-setup.ts` 会在 `createTestApp()` 中把 options 写入 `process.env`，而 `env.schema`/`ConfigService` 是模块级解析和读取：[apps/api/src/test-utils/integration-setup.ts:30-58](C:/Users/Lenovo/Desktop/365/apps/api/src/test-utils/integration-setup.ts:30)、[apps/api/src/common/config/config.service.ts:1-8](C:/Users/Lenovo/Desktop/365/apps/api/src/common/config/config.service.ts:1)。之后 `beforeEach` 再修改 `config.LEGACY_API_SITE_ID`：[api-v1-compat-integration.spec.ts:45-50](C:/Users/Lenovo/Desktop/365/apps/api/src/modules/api-v1-compat/tests/api-v1-compat-integration.spec.ts:45)，这依赖模块加载时序，不能作为可靠的 site isolation 证据。运行集成测试前，应先确认测试 app 中 `ConfigService.get('LEGACY_API_SITE_ID')` 的真实值，而不是只看测试变量对象。
- `config-guard.spec.ts` 的 env mock 没有 `LEGACY_API_V1_ENABLED` 和 `LEGACY_API_SITE_ID` 字段：[apps/api/src/common/config/config-guard.spec.ts:5-27](C:/Users/Lenovo/Desktop/365/apps/api/src/common/config/config-guard.spec.ts:5)。因此当前测试没有覆盖“production + legacy enabled + missing site ID 必须退出”。

## 最小可测改法（建议给实现代理）

### 1. 在兼容边界集中做开关、配置和请求站点检查

推荐新增兼容模块内部的纯 helper（例如 `apps/api/src/modules/api-v1-compat/legacy-site-access.ts`），或者将相同逻辑短暂放入两个 controller 的 `assertEnabled`；helper 的 interface 应是 `config + optional AuthenticatedContext -> configuredSiteId`，核心不变量如下：

```ts
if (config.get('LEGACY_API_V1_ENABLED') !== 'true') {
  throw new AppError(ErrorCode.NOT_FOUND, 'legacy_api_disabled', 404);
}
const siteId = config.get('LEGACY_API_SITE_ID').trim();
if (!siteId) {
  throw new AppError(ErrorCode.INTERNAL_ERROR, 'legacy_api_site_not_configured', 500);
}
if (ctx && ctx.siteId !== siteId) {
  throw new AppError(ErrorCode.PERMISSION_DENIED, 'legacy_api_site_mismatch', 403);
}
return siteId;
```

`PERMISSION_DENIED/403` 表达“凭证有效但不属于此固定 API site”；不要把 context 的 site 改写成配置值，也不要从 hostname、body 或默认值推断 site。若项目希望隐藏兼容端点存在性，可统一选择 404，但必须在错误契约和测试中固定一种语义；当前权限错误体系更适合 403。

### 2. 逐一传入 context

- `ApiV1CompatController.assertEnabled(ctx?)`：保留无 context 的 health、capabilities、login、refresh 调用；所有带 `@RequireAuth/@RequireUser` 的方法改为 `this.assertEnabled(ctx)`。给 `lock()` 增加 `@CurrentContext() ctx`，在抛出 unsupported capability 前执行 site check。
- `LegacyCustomerResourcesController.assertEnabled(ctx?)`：所有已有 context 的订单/通知/工单/admin 工单方法传入 `ctx`；给 `cancelOrder()`、`deleteNotification()` 增加 `@CurrentContext() ctx` 后再 gate。该 controller 当前 helper 不读取配置 site，不能只在 `ApiV1CompatController` 修复。
- 共享 helper 的单元测试应覆盖：关闭 -> 404、开启但空 site -> 500、同站 -> 放行、异站 -> 403；controller 测试只需证明 context 被传入及下游 use case 在异站时未调用。

### 3. 补两层回归测试

**单元层（无数据库）**

- 在 `legacy-customer-resources.controller.spec.ts` 增加 `site-2` context，调用 `listOrders` 或 `listNotifications`，断言 `legacy_api_site_mismatch/403`，并断言对应 repository mock 未调用；增加 `cancelOrder` 或 `deleteNotification` 的异站用例，确保无 context 的旧 bypass 不会留下。
- 在 `api-v1-compat.controller.spec.ts` 增加 `site-2` context 调用 `profile` 或 `dedicatedSkus`，同样断言 403 和 downstream 未调用；单独覆盖 `lock`。
- 在 `config-guard.spec.ts` mock 和 `beforeEach` 显式加入 `LEGACY_API_V1_ENABLED: 'false'`、`LEGACY_API_SITE_ID: ''`，增加 production 开启但空 site 的退出测试，以及配置非空时不退出的测试。这样不会让缺失字段以 `undefined` 偶然绕过断言。

**真实 PostgreSQL integration**

- 在 `api-v1-compat-integration.spec.ts` 同一 setup 中创建 `foreignSiteId/foreignTenantId/foreignUser`，通过 canonical `POST /api/auth/login`（带 `siteId: foreignSiteId`）获得合法 foreign token；请求 `/api/v1/users/profile` 或 `/api/v1/auth/me`，应得到 raw legacy `403`、`errorCode: 'PERMISSION_DENIED'`、`message: 'legacy_api_site_mismatch'`，且没有读取/写入固定站点数据。
- 先修正或显式验证 integration app 的 `ConfigService` 初始化：配置值必须在 `env.schema` 加载前注入，或通过测试专用 provider override 提供固定 site；不要仅在 app 已创建后修改局部 `config` 对象。测试运行仍必须使用显式 `DATABASE_URL_TEST` 和隔离数据库。

## 不建议的改法

- 不要在 `JwtStrategy` 或 `ApiKeyStrategy` 中把所有 session/API key 改写成 legacy site；这会破坏 canonical API 的多站点语义。
- 不要只依赖 repository 的 `siteId` where 条件，或只修 login/refresh；兼容端点的 `me`、unsupported capability 和 admin 资源仍需要边界 gate。
- 不要把 `LEGACY_API_SITE_ID` 改成 hostname、请求头或可选 body 字段；Trellis contract 明确禁止猜测和默认站点。

## 验证命令建议

实现后至少运行：

```text
pnpm --filter @ipeasy/api exec vitest run src/modules/api-v1-compat/*.spec.ts src/common/config/config-guard.spec.ts
DATABASE_URL_TEST=<disposable-loopback-postgres> pnpm --filter @ipeasy/api test:integration -- src/modules/api-v1-compat/tests/api-v1-compat-integration.spec.ts
pnpm --filter @ipeasy/api typecheck
```

集成测试若因数据库不可用未执行，应报告为环境阻塞，不能用单元 mock 代替跨站真实 session 验证。
