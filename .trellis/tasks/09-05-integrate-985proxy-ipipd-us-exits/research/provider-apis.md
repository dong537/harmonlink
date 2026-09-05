# Research: 985Proxy 和 ipipd 美国代理库存查询 API

- **Query**: 研究 985Proxy 和 ipipd 的 API 文档，找出如何使用 API key/zone ID 和 app ID/app secret 查询可用的美国代理库存/地区
- **Scope**: external + internal (代码实现验证)
- **Date**: 2026-09-06

---

## Findings

### 985Proxy API

#### 认证方式
- **认证头**: `apikey` (HTTP header)
- **生产网关**: `https://open-api.985proxy.com`
- **沙盒网关**: `https://sandbox-open-api.985proxy.com`
- **时区**: UTC
- **成功标识**: `code=0` 表示成功，任何其他 code 表示上游失败

#### 库存查询端点

**Endpoint**: `POST /res_static/inventory`

**Request Body**:
```json
{
  "static_proxy_type": "premium" | "shared",
  "zone": "4sd72p1bvlha"  // 可选，从 credential.zoneId 获取
}
```

**Response Envelope**:
```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "country_code": "US",
      "country": "US",
      "city": "New York",
      "city_name": "纽约",
      "stock": 150,
      "price": 8.50,
      "type": "premium"
    }
  ]
}
```

**关键字段**:
- `country_code` / `country`: 国家代码 (ISO Alpha-2, 如 "US")
- `city` / `city_name`: 城市标识 (可选)
- `stock`: 可用库存数量
- `price`: 单价 (CNY)
- `type`: 代理类型 (`premium` 或 `shared`)

**Zone 参数说明**:
- 用户提供的 `zoneId: "4sd72p1bvlha"` 是 985Proxy 的区域标识
- 该参数在请求体中传递，用于筛选特定区域的库存
- 如果账号配置了 zone，所有库存和购买请求都应包含此参数

#### 其他相关端点

- **价格计算**: `POST /res_static/calculate`
- **购买**: `POST /res_static/buy`
- **订单结果查询**: `POST /res_static/order_result`
- **IP 列表**: `GET /res_static/ip_list` (推荐用于运营读取)

---

### ipipd API

#### 认证方式
- **认证协议**: HMAC-SHA256 签名
- **必需头部**:
  - `X-API-AppId`: 应用ID
  - `X-API-Timestamp`: Unix 秒级时间戳
  - `X-API-Nonce`: 随机 UUID
  - `X-API-Signature`: HMAC-SHA256 签名 (小写十六进制)
- **签名字符串**: `METHOD + URI + timestamp + nonce + body`
  - `METHOD`: 大写 HTTP 方法 (如 "POST")
  - `URI`: 签名路径 (如 `/openapi/v2/static/lines`)，不包括 query string
  - `body`: 请求体 JSON 字符串，空请求签名为空字符串

#### 环境配置
- **生产 Base URL**: `https://api.ipipd.cn`
- **沙盒 Base URL**: `https://api.sandbox.ipipd.cn`
- **API 路径前缀**: `/openapi/v2`
- **遗留沙盒 URL**: `https://sandbox.ipipd.cn` 需要在路径中挂载 `/api/openapi/v2/...`

#### 库存查询端点

**Endpoint**: `POST /openapi/v2/static/lines`

**Request Body** (`LineSearchRequest`):
```json
{
  "current": 0,        // 页码 (从 0 开始)
  "size": 200,         // 每页大小
  "countryCode": "USA" // 可选，国家过滤 (ISO Alpha-3)
}
```

**Response Envelope**:
```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "ok",
  "data": {
    "size": 200,
    "current": 0,
    "total": 450,
    "records": [
      {
        "id": "line-12345",
        "countryCode": "USA",
        "cityCode": "NYC",
        "businessTypeCode": "residential",
        "ispType": 1,
        "protocols": 3,
        "tag": "premium",
        "quantity": 50,
        "minDays": 1,
        "maxDays": 365,
        "price": 12.50,
        "currency": "CNY",
        "active": true,
        "status": 0,
        "cidrs": [
          {
            "cidr": "198.51.100.0/24",
            "availableCount": 20
          }
        ]
      }
    ],
    "offset": 0
  },
  "timestamp": "2026-09-06T12:34:56Z",
  "traceId": "abc-123"
}
```

**关键字段**:
- `id`: 线路ID (购买时使用 `lineId`)
- `countryCode`: 国家代码 (ISO Alpha-3, 如 "USA")
- `cityCode`: 城市代码 (可选)
- `businessTypeCode`: 业务类型 (如 "residential", "datacenter")
- `quantity`: 可用数量
- `price`: 单价
- `currency`: 货币 (通常为 "CNY")
- `active`: 是否激活
- `status`: 状态 (`0=ACTIVE`, `1=INACTIVE`, `2=MAINTENANCE`)
- `cidrs`: CIDR 子网列表，每个包含 `cidr` 和 `availableCount`

**国家代码说明**:
- ipipd 使用 ISO Alpha-3 代码 (如 "USA")
- 需要转换为平台使用的 Alpha-2 代码 (如 "US")
- 代码中已实现 `IPIPD_ALPHA3_TO_ALPHA2` 映射表

**分页逻辑**:
- `current` 字段从 0 开始
- 需要循环请求直到 `records.length < size`
- 代码中实现了完整分页逻辑 (见 `ipipd.adapter.ts:265-282`)

#### 其他相关端点

- **账户查询** (健康检查): `GET /openapi/v2/account`
- **创建订单**: `POST /openapi/v2/static/orders/create`
- **查询订单**: `POST /openapi/v2/static/orders`

---

## 代码实现验证

### 985Proxy Adapter 实现

**文件**: `apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts`

**库存同步逻辑** (行 164-215):
```typescript
async syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult> {
  // 查询两种代理类型: shared 和 premium
  for (const proxyType of ['shared', 'premium'] as const) {
    const data = await this.post<InventoryRecord[]>(
      '/res_static/inventory',
      staticInventoryBody(proxyType, config),  // 包含 zone 参数
      config,
      'syncInventory',
    );
    
    // 聚合相同国家的库存
    for (const record of records) {
      const countryCode = normalizeCountryCode(record.country_code ?? record.country);
      const key = `${countryCode}:${proxyType}`;
      seen.set(key, {
        stock: previous.stock + Number(record.stock ?? 0),
        cost: previous.cost ?? numberOrNull(record.price),
      });
    }
  }
}
```

**Zone 参数处理** (行 44-54):
```typescript
function staticZone(config?: ProviderRuntimeConfig): string | undefined {
  // 优先从 credential.zoneId 获取，fallback 到环境变量
  const value = config?.credential['zoneId']?.trim() || 
                process.env['UPSTREAM_985PROXY_STATIC_ZONE']?.trim();
  return value ? value : undefined;
}

function staticInventoryBody(proxyType: string, config: ProviderRuntimeConfig): Record<string, unknown> {
  const body: Record<string, unknown> = { static_proxy_type: proxyType };
  const zone = staticZone(config);
  if (zone) body['zone'] = zone;  // 添加 zone 参数
  return body;
}
```

**测试覆盖** (`nine-eight-five-adapter.spec.ts:26-58`):
- 验证了 zone 参数正确传递到请求体
- 确认了库存同步调用两次 (premium + shared)
- 验证了价格字段正确映射到 `upstreamCost`

### ipipd Adapter 实现

**文件**: `apps/api/src/modules/providers/adapters/ipipd.adapter.ts`

**库存同步逻辑** (行 265-323):
```typescript
async syncInventory(config: ProviderRuntimeConfig): Promise<InventorySyncResult> {
  const pageSize = 200;
  const records: StaticLineV2DTO[] = [];
  let current = 0;
  
  // 分页获取所有线路
  for (;;) {
    const page = await this.request<PageResultV2<StaticLineV2DTO>>(
      'POST',
      `${API_PREFIX}/static/lines`,
      { current, size: pageSize },
      config,
    );
    const pageRecords = Array.isArray(page?.records) ? page.records : [];
    records.push(...pageRecords);
    if (pageRecords.length < pageSize) break;
    current += 1;
  }

  // 转换为库存条目
  for (const line of records) {
    const alpha2 = normalizeIpipdCountryCode(line.countryCode);  // Alpha-3 -> Alpha-2
    const available = line.active !== false && (line.status === undefined || line.status === 0);
    
    // 支持 CIDR 级别的库存
    if (cidrs.length > 0) {
      for (const cidr of cidrs) {
        items.push({
          countryCode: alpha2,
          networkCidr: cidr.cidr,
          stock: available ? cidr.availableCount : 0,
          providerResourceId: encodeIpipdLineCidr(String(line.id), cidr.cidr),
          upstreamCost: line.price,
          upstreamCostCurrency: line.currency,
        });
      }
    }
  }
}
```

**HMAC 签名实现** (行 118-137):
```typescript
private buildAuthHeaders(
  method: string,
  uri: string,
  body: string,
  config: ProviderRuntimeConfig,
): Record<string, string> {
  const appId = config.credential['appId'] ?? '';
  const appSecret = config.credential['appSecret'] ?? '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signString = `${method.toUpperCase()}${uri}${timestamp}${nonce}${body}`;
  const signature = createHmac('sha256', appSecret).update(signString).digest('hex');
  return {
    'X-API-AppId': appId,
    'X-API-Timestamp': timestamp,
    'X-API-Nonce': nonce,
    'X-API-Signature': signature,
    'Content-Type': 'application/json',
  };
}
```

**国家代码转换** (行 524-531):
```typescript
function normalizeIpipdCountryCode(value: unknown): string | undefined {
  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;  // 已经是 Alpha-2
  if (/^[A-Z]{3}$/.test(normalized)) return IPIPD_ALPHA3_TO_ALPHA2[normalized];  // 转换
  return undefined;
}
```

---

## 查询美国库存的具体步骤

### 985Proxy

1. **配置 Provider Account**:
   ```sql
   INSERT INTO provider_accounts (code, credential, baseUrl, status) VALUES (
     'NINE_EIGHT_FIVE',
     '{"apikey":"yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==","zoneId":"4sd72p1bvlha"}',
     'https://open-api.985proxy.com',
     'ACTIVE'
   );
   ```

2. **调用库存同步 API**:
   ```bash
   curl -X POST https://open-api.985proxy.com/res_static/inventory \
     -H "apikey: yR_7WPGbMxp-eVJfN1dQR2JNeHA0Y2MwMTc2NDk5MDc1MQ==" \
     -H "Content-Type: application/json" \
     -d '{"static_proxy_type":"premium","zone":"4sd72p1bvlha"}'
   ```

3. **过滤美国库存**:
   ```typescript
   const usInventory = inventoryItems.filter(item => item.countryCode === 'US');
   ```

### ipipd

1. **配置 Provider Account**:
   ```sql
   INSERT INTO provider_accounts (code, credential, baseUrl, status) VALUES (
     'IPIPD',
     '{"appId":"APP13618B8748","appSecret":"fzEE0vF014A7WfdpCp0pek2ufnRo65E4HN6Ni3rZjitx9sjpNSy0beIyo6UKGbi7"}',
     'https://api.ipipd.cn/api',
     'ACTIVE'
   );
   ```

2. **调用库存查询 API** (需要 HMAC 签名):
   ```typescript
   // 签名逻辑已在 IpipdAdapter.buildAuthHeaders() 中实现
   const response = await adapter.request(
     'POST',
     '/openapi/v2/static/lines',
     { current: 0, size: 200, countryCode: 'USA' },  // 过滤美国
     config
   );
   ```

3. **响应处理**:
   - 自动分页获取所有线路
   - 国家代码从 "USA" 转换为 "US"
   - 支持 CIDR 级别的精细库存管理

---

## 环境变量配置

从 `.env.example` 文件中找到的相关配置:

```bash
# Provider 执行开关
PROVIDER_INVENTORY_SYNC_ENABLED=false  # 需要设置为 true
DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST=  # 添加 NINE_EIGHT_FIVE,IPIPD

# ipipd 配置
UPSTREAM_IPIPD_STATUS=DISABLED  # 需要改为 ACTIVE
UPSTREAM_IPIPD_BASE_URL=https://api.ipipd.cn
UPSTREAM_IPIPD_APP_ID=
UPSTREAM_IPIPD_APP_SECRET=
UPSTREAM_IPIPD_TIMEOUT_MS=15000
UPSTREAM_IPIPD_INVENTORY_SYNC_ENABLED=false  # 需要改为 true

# 985Proxy 配置
UPSTREAM_985PROXY_STATUS=DISABLED  # 需要改为 ACTIVE
UPSTREAM_985PROXY_BASE_URL=https://open-api.985proxy.com
UPSTREAM_985PROXY_APIKEY=
UPSTREAM_985PROXY_STATIC_ZONE=  # 可选，设置为 4sd72p1bvlha
```

---

## External References

- [985Proxy 官方文档](https://docs.985proxy.com/)
  - [业务列表](https://docs.985proxy.com/414120986e0)
  - [价格计算](https://docs.985proxy.com/414122338e0)
  - [订单结果](https://docs.985proxy.com/414122933e0)
  - [IP 列表](https://docs.985proxy.com/414119981e0)

- [ipipd OpenAPI v2 文档](https://api-docs.ipipd.cn/)
  - 认证协议: HMAC-SHA256
  - 静态线路查询: `POST /openapi/v2/static/lines`
  - 账户查询: `GET /openapi/v2/account`

---

## Related Specs

- `.trellis/tasks/09-05-integrate-985proxy-ipipd-us-exits/prd.md` - 集成任务需求文档
- `.trellis/tasks/08-16-dedicated-node-integration/research/985-sk5-api-contract.md` - 985Proxy API 调研
- `.trellis/tasks/06-25-purchase-random-pricing-ui/research/ipipd-openapi-v2-2026-06-26.md` - ipipd OpenAPI v2 调研

---

## Caveats / Not Found

### 已验证的限制

1. **985Proxy Zone 参数**:
   - Zone ID 必须从用户账号配置中获取
   - 文档中未详细说明 zone 的具体含义，但代码和测试显示它是区域过滤参数
   - 不传 zone 可能返回所有区域的库存，传入 zone 则只返回该区域

2. **ipipd 国家代码**:
   - API 使用 ISO Alpha-3 代码 ("USA")
   - 平台使用 ISO Alpha-2 代码 ("US")
   - 必须在同步时转换，已有映射表 `IPIPD_ALPHA3_TO_ALPHA2`

3. **库存实时性**:
   - 两个 provider 的库存都不保证实时准确
   - 购买前应重新查询库存 (freshn