# 实施笔记：集成 985Proxy/ipipd 美国出口

## 待解决的阻塞问题

### 1. 控制节点 API Token（高优）

**问题**: 初始化 `control_nodes` 需要控制面板的 Bearer token，但当前未知。

**影响**: 无法完成 Phase 2（控制节点初始化）。

**解决方案**:
1. SSH 到 91.149.237.33
2. 查找控制面板服务配置文件（可能路径）：
   - `/etc/xray-panel/config.json`
   - `/opt/panel/config.yaml`
   - `~/.config/panel/auth.json`
   - Docker 容器环境变量：`docker inspect <container_id> | grep -i api`
3. 读取 `apiToken` 或 `bearerToken` 字段
4. 如果使用 systemd 管理，检查：`systemctl cat xray-panel.service`

**临时绕过**（仅测试）: 如果只测试订单流程，可以暂时跳过 control_nodes 初始化，直接测试 provider adapter 购买流程。

---

### 2. 控制面板端口确认（中优）

**问题**: 91.149.237.33 的控制面板端口是 57323 还是 41094？

**影响**: baseUrl 配置错误会导致 managed line projection 推送失败。

**解决方案**:
```bash
# 测试端口连通性
nc -zv 91.149.237.33 57323
nc -zv 91.149.237.33 41094

# 如果两个都通，尝试 HTTP 请求
curl -v http://91.149.237.33:57323/panel/api/health
curl -v http://91.149.237.33:41094/panel/api/health
```

---

### 3. Site ID 确认（中优）

**问题**: 所有配置需要关联到正确的 `siteId`，但当前未知用户的站点 ID。

**解决方案**:
```sql
-- 查询现有站点
SELECT id, code, name FROM sites;

-- 如果是单站点系统，使用唯一站点
SELECT id FROM sites LIMIT 1;
```

---

## 快速启动检查清单

在开始实施前，确认以下环境就绪：

### 数据库连接
```bash
# 测试数据库连接
docker run --rm -it postgres:16-alpine \
  psql "postgresql://365_user:F7R5AxnD2K8gWqPy@91.149.237.33:5432/365_prod" \
  -c "SELECT version();"
```

### 环境变量
```bash
# 必需的环境变量
echo $APP_ENCRYPTION_KEY  # 应为 32 字节 hex
echo $DEDICATED_LINE_ORDER_EXECUTION_ENABLED  # 应为 "true"
echo $DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST  # 应包含 "NINE_EIGHT_FIVE,IPIPD"
```

### API 访问
```bash
# 获取管理员 token
export ADMIN_TOKEN="<your-admin-token>"

# 测试 API 可访问
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.yisukj.top/api/admin/providers
```

---

## 分阶段执行策略

### 策略 A：最小可行路径（推荐，2-3小时）
1. ✅ 跳过控制节点初始化
2. ✅ 只配置 provider accounts
3. ✅ 只测试 provider adapter 购买流程
4. ✅ 手动插入 `residential_exits` 模拟订单完成
5. ⏭️ 后续再初始化控制节点和入站配置

**优势**: 快速验证核心流程（985/ipipd 购买能力）

### 策略 B：完整端到端（4-6小时）
1. 解决控制节点 API token 阻塞问题
2. 完整执行 Phase 1-4
3. 端到端验证订单 → 购买 → 出口 → 专线

**优势**: 一次性完成全流程

### 策略 C：先静态代理，再专线（备选）
1. 先配置 provider accounts 作为静态代理产品
2. 用户可以立即购买美国静态代理（IP:port:user:pass）
3. 并行进行控制节点初始化
4. 完成后切换到专线产品

**优势**: 快速交付价值，降低初始风险

---

## 已知约束和假设

### 假设
- 91.149.237.33 上的控制面板服务已部署且运行正常
- 104.233.233.233:60701, 60702 已配置为入站监听端口
- 用户的 985Proxy/ipipd 账号有足够余额购买美国代理
- 数据库 `sites` 表至少有 1 条记录

### 约束
- 控制节点只支持 SOCKS5 出口协议（`process-dedicated-line-order.use-case.ts:159`）
- 985Proxy 和 ipipd 返回的 expiresAt 必须是未来时间（`provider-delivery-expiry.ts`）
- 专线订单要求 `lineProtocol` 为 VLESS、VMESS 或 MIXED（`process-dedicated-line-order.use-case.ts:176-181`）

---

## 参考资料

### 代码文件
- [process-dedicated-line-order.use-case.ts:63-81](../../apps/api/src/modules/dedicated-line-orders/process-dedicated-line-order.use-case.ts#L63-L81) - provider adapter 调用
- [nine-eight-five.adapter.ts](../../apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts) - 985Proxy 实现
- [ipipd.adapter.ts](../../apps/api/src/modules/providers/adapters/ipipd.adapter.ts) - ipipd 实现

### 生成的文档
- [server-discovery-report.md](../../docs/infrastructure/server-discovery-report.md) - 服务器连通性报告
- [control-node-init-guide.sh](../../docs/infrastructure/control-node-init-guide.sh) - 控制节点初始化脚本

### 数据库 Schema
- `packages/db/prisma/schema.prisma` - 完整数据模型定义
