# 服务器探测与专线平台初始化报告

**日期**: 2026-08-22  
**状态**: 🔴 系统未就绪 - 需要初始化控制节点

---

## 一、服务器连通性探测结果

### 1.1 德国上游代理服务器（985Proxy/ipipd）

| IP 地址 | SSH (22) | 端口 57323 | 端口 41094 | 用途 |
|---------|----------|-----------|-----------|------|
| 185.216.118.241 | ✅ OpenSSH_9.9 | ⚠️ HTTP 404 | - | 上游代理 |
| 185.216.118.242 | ✅ OpenSSH_9.9 | - | - | 上游代理 |
| 185.216.118.243 | ✅ OpenSSH_9.2p1 | - | ⚠️ HTTP 404 | 上游代理 |

**发现**：端口 57323 和 41094 运行了 Web 应用（返回带 CSP 头的 404），但不是控制面板 API。

### 1.2 香港控制节点 ⭐ 关键服务器

**IP**: 91.149.237.33

| 端口 | 状态 | 服务类型 | 测试结果 |
|------|------|---------|---------|
| 22 | ✅ OPEN | SSH | 可连接 |
| 80 | ✅ OPEN | HTTP | 可连接 |
| 443 | ✅ OPEN | HTTPS | 可连接 |
| 57323 | ⚠️ 部分可用 | 控制面板? | TCP连接成功，HTTP层超时 |
| 41094 | ⚠️ 部分可用 | 控制面板? | TCP连接成功，HTTP层超时 |
| 60701 | ✅ OPEN | 代理入站 | 可连接 |
| 60702 | ✅ OPEN | 代理入站 | 可连接 |

**HTTP 测试**：
- `GET http://91.149.237.33:57323/panel/api/managed-line-projections/test-key`
  - TCP 握手成功
  - 应用层响应超时（5秒无数据）
  - **可能原因**：需要 Bearer token 鉴权 或 服务未启动

### 1.3 中国大陆专线入口

**IP**: 14.116.138.238

| 端口 | 状态 | 测试域名 | 备注 |
|------|------|---------|------|
| 60701 | ✅ OPEN | test-sv-1.yisukj.top | 短视频测试入口 |
| 60702 | ✅ OPEN | test-zb-1.yisukj.top | 直播测试入口 |

**DNS 解析**：
```
test-sv-1.yisukj.top → 14.116.138.238
test-zb-1.yisukj.top → 14.116.138.238
```

**链路设计**：
```
测试域名:60701/60702 → 专线入口 14.116.138.238 → 香港节点 91.149.237.33
```

---

## 二、数据库状态检查

### 2.1 控制节点表查询

```sql
SELECT * FROM control_nodes;
```

**结果**: `(0 rows)` 🔴

### 2.2 关键发现

**数据库中没有任何控制节点记录！**

这意味着：
1. ❌ 无法下发投影配置到控制节点
2. ❌ 专线订单会在「分配节点」阶段失败
3. ❌ 系统无法完成端到端的专线交付流程

---

## 三、必需的初始化操作

### 3.1 创建节点组（node_groups）

**接口**: `POST /api/admin/control-plane/node-groups`  
**权限**: OPERATOR

```json
{
  "code": "hk-primary",
  "name": "香港主节点组",
  "regionCode": "HK",
  "tenantId": null
}
```

### 3.2 创建控制节点（control_nodes）

**接口**: `POST /api/admin/control-plane/nodes`  
**权限**: OPERATOR

```json
{
  "nodeGroupId": "<从上一步获取>",
  "code": "hk-node-01",
  "name": "香港控制节点-01",
  "regionCode": "HK",
  "baseUrl": "http://91.149.237.33:57323",
  "apiToken": "<需要确认的 Bearer token>",
  "capacityUnits": 100,
  "status": "ACTIVE"
}
```

**⚠️ 未知项**：
- `apiToken` 的正确值（需要从控制节点服务配置中获取）
- 端口 57323 vs 41094 哪个是正确的控制面板端口

### 3.3 创建入站配置（inbound_profiles）

**接口**: `POST /api/admin/control-plane/inbound-profiles`  
**权限**: OPERATOR

```json
{
  "nodeGroupId": "<节点组ID>",
  "controlNodeId": "<控制节点ID>",
  "code": "hk-mixed-60701",
  "protocol": "MIXED",
  "inboundTag": "sv-in",
  "listenPort": 60701
}
```

### 3.4 创建落点策略（line_placement_policies）

**接口**: `POST /api/admin/control-plane/placement-policies`  
**权限**: OPERATOR

```json
{
  "nodeGroupId": "<节点组ID>",
  "inboundProfileId": "<入站配置ID>",
  "code": "default-hk-policy",
  "name": "默认香港落点策略",
  "targetReplicaCount": 1,
  "minReadyReplicaCount": 1,
  "allowedNodeIds": ["<控制节点ID>"]
}
```

---

## 四、待验证的技术细节

### 4.1 控制节点服务

**需要 SSH 登录 91.149.237.33 确认**：

1. 控制面板服务是否运行？
   ```bash
   ps aux | grep -E "panel|control"
   systemctl status <service-name>
   ```

2. 监听的端口：
   ```bash
   netstat -tlnp | grep -E "57323|41094"
   ```

3. 服务配置文件中的 API token：
   ```bash
   cat /etc/<service>/config.yml | grep -i token
   ```

4. 日志检查：
   ```bash
   tail -f /var/log/<service>/app.log
   ```

### 4.2 鉴权机制

根据代码 `managed-line-projection.adapter.ts:119`：

```typescript
headers: {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json'
}
```

需要确认：
- Bearer token 的生成方式（固定配置 vs 动态签发）
- token 是否有过期时间
- 是否需要额外的请求签名

---

## 五、985Proxy 和 ipipd 对接信息

### 5.1 985Proxy 生产凭证

- **API 文档**: https://docs.985proxy.com/
- **正式环境**: https://open-api.985proxy.com
- **API Key**: `yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==`
- **Zone ID**: `4sd72p1bvlha`

**要求**：
1. 平台原有的"家宽"功能需彻底禁用或降级
2. 专线库存 SK5 不足时，不得调用 985Proxy API 下单
3. 库存不足时，需自动发送 Bark 提醒管理员

### 5.2 ipipd 测试/生产环境

**测试环境**：
- 网址: https://sandbox.ipipd.cn/
- 可自行注册，邮箱验证码: `123456`

**生产应用密钥**：
- 应用名称: `365Proxy Bai`
- App ID: `APP13618B8748`
- App Secret: `fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7`

---

## 六、行动清单

### 立即行动（P0）

- [ ] SSH 登录 `91.149.237.33`，确认控制面板服务状态
- [ ] 获取正确的 API token
- [ ] 确认控制面板端口（57323 vs 41094）
- [ ] 创建节点组 → 控制节点 → 入站配置 → 落点策略
- [ ] 手动测试投影下发接口

### 后续配置（P1）

- [ ] 集成 985Proxy API
- [ ] 集成 ipipd API
- [ ] 配置 Bark 告警（库存不足触发）
- [ ] 禁用或降级原有"家宽"功能

### 验证测试（P1）

- [ ] 完整下单流程端到端测试
- [ ] 使用测试域名验证代理链路
- [ ] 验证故障切换和降级行为

---

**报告生成时间**: 2026-08-22  
**下次更新**: 完成控制节点初始化后
