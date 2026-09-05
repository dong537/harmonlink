# 生产就绪状态 — 已验证事实

日期 2026-08-23。所有结论均来自实际执行的命令，不是推断。

## 已完成

### 上游 provider 凭据（两家，已加密入库并回读验证）

```
NINE_EIGHT_FIVE  ACTIVE  https://open-api.985proxy.com
  apikey 48字符 / zoneId 4sd72p1bvlha        解密回读一致
IPIPD            ACTIVE  https://api.ipipd.cn
  appId APP13618B8748 / appSecret 64字符      解密回读一致
```

siteId `7f486516-aeee-4b80-9d6b-0c364c94c54a`（MAIN）。用**生产** `APP_ENCRYPTION_KEY` 加密，
生产 API 可直接解密，无需再同步。密钥全程只经进程环境变量，未落盘、未进命令行。

`inventorySync: false`（默认值，未改动）。

### 专线价格（已配置，不再是阻断项）

```
sku_price_rules = 2
  SV  CNY unit=120 days=30 minQty=1   tpl=1c2e394d
  ZB  CNY unit=120 days=30 minQty=1   tpl=1c2e394d
price_templates = 1
  1c2e394d "Default line pricing" isDefault=true tenantId=null
```

命中 `SITE_DEFAULT_TEMPLATE` 层。租户 `ownerUserId=null`，不触发分销商站点层截断。

## 生产环境实测（https://365proxy-api.zeabur.app）

线上 AppModule 启动正常，DI 无故障，openapi 注册 **156** 条路由。

```
GET  /health                              200
POST /api/auth/login {}                   500   <-- 缺陷，应为 400
POST /api/dedicated-line-orders           401   （鉴权正常）
GET  /api/admin/control-plane/references   401   （鉴权正常）
POST /api/admin/control-plane/node-groups 404   （工作区新端点，未部署）
```

注意：用 GET 打 POST-only 路由会得到 404，不代表路由缺失。早前的 404 判断源于此测法错误。

## 代码缺口

### 1. app.module.ts 缺 PrismaModule import（已在工作区修复，未提交）

`@Global()` 只在模块被导入一次后才广播 exports。`775e1f9` 修过，`9a719d4` 又删除。
worker 侧 `apps/worker/src/main.ts:39` 保留了该 import，只有 API 根模块回归。

662 个单元测试全绿是因为它们从不构建完整依赖图；`/health` 不经过 DI，故线上状态未暴露此问题。
线上部署的构建产物包含该 import，只有当前源码树缺失。

### 2. 控制面无法自举（已在工作区补端点，未提交）

`POST admin/control-plane/nodes` 要求 `nodeGroupId` 已存在，但全 `src` + `scripts` 内
`node_groups.create` / `inbound_profiles.create` **零命中**（仅测试与 integration-setup 有）。
新增：`POST admin/control-plane/node-groups`、`POST admin/control-plane/inbound-profiles`。

### 3. auth 入口零运行时校验（修复进行中）

`main.ts` 无 `useGlobalPipes`；`class-validator` 非本项目依赖、全库零使用。
`LoginDto` 仅编译期类型，`{}` 直接进 use case → 500。

## 开线路的实际阻断点

### 三台机器上没有控制面板

TCP 全部开放：

```
185.216.118.241 / .242 / .243   端口 22 / 41094 / 57323 均开放
```

但 HTTP 探测结果：

```
http://185.216.118.241:57323/  404（/login /panel /xui /panel/setting /app/api 全 404）
http://185.216.118.243:41094/  404（同上）
其余组合无响应；HTTPS 全部无响应
```

无 title、无 Server 头、全路径 404 —— 这是代理服务本身对非协议流量的响应，
不是 3x-ui 或任何带 Web 面板的软件。`managed-line-projection.adapter.ts:113` 需要的
`{baseUrl}/panel/api/managed-line-projections/{key}` 接口不存在。

**结论：必须先在机器上安装控制面板，而安装需要能登入机器。**

### SSH 仍不可用

历史尝试 5 次：openssh 三台均 `Connection timed out during banner exchange`；
带 key 时 `Connection closed by ... port 22`；paramiko 带密码时
`Error reading SSH protocol banner` → `No existing session`。

TCP/22 接受连接但服务端发送零字节，**密码从未进入验证阶段**。这是传输层阻断，非认证失败。
已停止重试以避免加深 fail2ban 封禁。

需要从面板 VNC 控制台确认：`systemctl status sshd`、`ss -tlnp | grep :22`、
`fail2ban-client status sshd`，或提供真实 SSH 端口 / 白名单当前出口 IP。

### 地域约束（回答"香港能否转发到美国"）

三台均为 HK.CLD.B 香港节点，IPv6 `2404:8c80:` 属 APNIC，同子网同批次。
IP 地域由 RIR 注册决定，转发无法改变：要么香港做出口（网络侧看到香港），
要么香港中继到一台真实美国机器（那台仍需你拥有）。

架构已通过 `control_nodes.regionCode` 建模此约束。开美国线路的正确路径：
取得美国机器 → 装控制面 → 登记 `regionCode='US'` 的 `control_nodes` 行 → 配置落点策略。
香港机器可登记为 `regionCode='HK'`，无需改代码即可端到端验证整条链路。

## 未处理（已确认存在，需你决策）

- `api_keys.scopes` 存储并传播但**从不校验**（`scopes.includes`/`hasScope`/`requireScope` 全库零命中），
  任何 ACTIVE key 权限等于其 ownerType 全量。
- `OPERATOR` 在 `jwt.strategy.ts:34` 被静默提升为 `PLATFORM_ADMIN`，`RequirePlatformAdmin()` 拦不住运营。
- `maintenance.middleware.ts:32` 的 `where: { OR: [{ domain: host }, {}] }` 中 `{}` 匹配所有行，
  永远返回最老站点；且在 `AuthGuard` 之前读 `req.authContext`，管理员绕行分支永不触发。
- `users.email` / `admin_users.email` 全局 `@unique` 而非 `[siteId, email]`，与共库多站要求冲突。
- `ledger_entries.idempotencyKey` / `payment_orders.idempotencyKey` 全局唯一；
  `20260612120000_scope_order_idempotency` 只修了 `orders`。
- 租户隔离仅靠 ~240 处手写 `where`，无 middleware / RLS；124 个文件直接 import `@ipeasy/db` 单例
  绕过 `PrismaService`，故无法在客户端层统一加隔离。
