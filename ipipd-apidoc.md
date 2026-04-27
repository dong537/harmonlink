IPIPD OPENAPI V2 1.0.0
URL: https://ipipd.cn
IPIPD OPENAPI v2 文档
本文档描述了IPIPD代理服务的完整API接口，包括账户管理、位置查询、订单管理和实例操作等功能。

认证方式
本API使用签名认证方式，需要在请求头中包含以下参数：

X-API-AppId: 应用ID
X-API-Timestamp: 时间戳（秒级Unix时间戳）
X-API-Nonce: 随机数（UUID格式）
X-API-Signature: 签名
签名算法
签名使用HMAC-SHA256算法，签名字符串格式为：

METHOD + URI + timestamp + nonce + body
Java示例代码：

/**
 * 生成HMAC-SHA256签名
 */
public static String generateSignature(String method, String uri, String timestamp,
                                     String nonce, String body, String appSecret) {
    try {
        // 构建签名字符串
        String signString = method + uri + timestamp + nonce + (body != null ? body : "");

        // 计算HMAC-SHA256签名
        return calculateHmacSha256(signString, appSecret);
    } catch (Exception e) {
        throw new RuntimeException("签名生成失败", e);
    }
}

/**
 * 计算HMAC-SHA256签名
 */
private static String calculateHmacSha256(String data, String secret)
        throws NoSuchAlgorithmException, InvalidKeyException {
    Mac mac = Mac.getInstance("HmacSHA256");
    SecretKeySpec secretKeySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    mac.init(secretKeySpec);
    byte[] digest = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(digest);
}
安全说明
时间戳验证：请求时间戳与服务器时间差不能超过5分钟，防止重放攻击
随机数：每次请求使用不同的随机数
HTTPS：生产环境必须使用HTTPS协议
密钥安全：appSecret必须妥善保管，不能暴露在客户端代码中
错误码说明
200: 请求成功
400: 请求参数错误
401: 认证失败
403: 权限不足
404: 资源不存在
500: 服务器内部错误
回调通知机制
系统提供完整的事件回调机制，支持订单创建和代理实例状态变更的实时通知。

配置要求
配置项	要求	说明
回调地址	HTTPS URL	必须是有效的HTTPS协议URL地址
响应状态	HTTP 200	回调接口必须返回200状态码表示成功
超时时间	30秒	回调请求的最大等待时间
重试策略	指数退避	失败时自动重试，最多10次
回调数据格式
所有回调请求均采用统一的数据结构：

{
  "type": "回调类型",
  "data": "具体数据内容",
  "timestamp": "时间戳",
  "requestId": "请求唯一标识"
}
支持的回调类型
1. CREATE_STATIC_ORDER - 静态代理订单创建
当静态代理订单创建成功时触发此回调：

{
  "type": "CREATE_STATIC_ORDER",
  "data": {
    "orderNo": "SO20250913121743001",
    "externalOrderNo": "EXT_ORDER_1234564",
    "status": 3,
    "totalPrice": 1,
    "currency": "CNY",
    "instances": [
      {
        "proxyId": "SI20250913121745004",
        "ip": "46.203.176.66",
        "port": 9008,
        "username": "e0H3R3S3S0u2",
        "password": "s9G8W6w6X7b2",
        "status": 2,
        "cityCode": "CHNHKGHKG",
        "autoRenew": false,
        "createdAt": "1757737065858",
        "activatedAt": "1757737065858",
        "expiresAt": "1760329065854"
      }
    ]
  },
  "timestamp": 1703250000000,
  "requestId": "req_1703250000000_abc123"
}
2. UPDATE_STATIC_INSTANCE - 代理实例状态变更
当代理实例发生状态变更（如IP变更）时触发此回调，每次状态变更仅通知一次：

{
  "type": "UPDATE_STATIC_INSTANCE",
  "proxyId": "SI20250907132413004",
  "changeType": "IP_CHANGE",
  "data": {
    "proxyId": "SI20250907132413004",
    "ip": "192.168.36.147",
    "port": 30717,
    "username": "nO0nW44ZMPdg",
    "password": "H0fjwHDVn25a",
    "status": 2,
    "ispType": 1,
    "autoRenew": false,
    "createdAt": "1757251453571",
    "activatedAt": "1757251453597",
    "expiresAt": "1762406654820"
  },
  "timestamp": "1757736800604"
}
变更类型说明：

EXPIRY: 代理实例过期
RENEWAL: 代理实例续费
IP_CHANGE: 代理IP地址发生变更
CREDENTIALS_CHANGE: 代理账号密码发生变更
重试机制详细说明
系统采用指数退避策略进行回调重试，具体规则如下：

重试间隔计算：

第1次重试：1分钟后
第2次重试：2分钟后
第3次重试：4分钟后
第4次重试：8分钟后
第5次重试：16分钟后
第6次重试：32分钟后
第7次重试：60分钟后
第8次重试：120分钟后
第9次重试：240分钟后
第10次重试：480分钟后
重试触发条件：

HTTP状态码非200
连接超时（30秒）
网络异常
响应格式错误
重试停止条件：

收到HTTP 200响应
达到最大重试次数（10次）
回调地址配置被删除
API SERVER
 https://api.ipipd.cn - 生产环境
 https://api.sandbox.ipipd.cn - 测试环境
 https://api.ipipd.cn
SELECTED: https://api.ipipd.cn
AUTHENTICATION
No API key applied
静态代理
获取所有业务类型
get /openapi/v2/static/business-types
获取系统中所有可用的静态代理业务类型列表，用于创建订单时选择业务类型

REQUEST
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X GET "https://api.ipipd.cn/openapi/v2/static/business-types" \
 -H 'accept: application/json' 
RESPONSE
200
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: [{
响应数据
⮕ [ 静态代理业务类型信息 ]

code: string
业务类型唯一代码

name: string
业务类型名称，根据I18n设置返回对应语言

}]
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
搜索实例
post /openapi/v2/static/instances
根据条件搜索用户的静态代理实例，支持按状态、位置、到期时间等条件筛选

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
代理实例搜索请求

{
status: integer
实例状态：0=创建中, 1=激活, 2=过期, 3=停用

proxyIds: [string]
要搜索的代理ID列表

countryCode: string
国家代码过滤（ISO 3166-1 alpha-3）

cityCode: string
城市代码过滤

ispType: integer
ISP类型：0=无, 1=广播, 2=原生

orderNo: string
关联的订单号

ip: string
模糊搜索IP地址

expiringSoon: boolean
是否只查询即将在7天内到期的实例

current: integer
当前页码，从0开始

size: integer
每页数据条数

}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/instances" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
size: integer
current: integer
total: integer
records: [{...}]
⮕ [ 静态代理实例信息 ]

offset: integer
}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
批量更换IP
post /openapi/v2/static/instances/change-ip
批量为多个代理实例更换IP地址

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
{
proxyIds*: [string]
Min Items: 1 Max Items: 100

remark: string
}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/instances/change-ip" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
successCount: integer
failureCount: integer
totalCount: integer
successList: [{...}]
failedList: [{...}]
remark: string
}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
批量续费实例
post /openapi/v2/static/instances/renew
批量为多个代理实例续费，支持指定续费天数

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
批量续费代理实例请求

{
proxyIds*: [string]
要续费的代理ID列表
Min Items: 1

days*: integer
续费天数，必须大于0

Constraints: Min 1
currency: string
支付货币代码，不指定则使用默认货币

remark: string
批量续费备注信息

orderNo: string
外部系统的订单号

}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/instances/renew" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
批量续费操作结果

orderNo: string
本地订单号

externalOrderNo: string
远程订单号（客户提供）

successCount: integer
成功续费的实例数量

failureCount: integer
失败的实例数量

totalCost: number
批量续费总费用

currency: string
货币代码

renewalDays: integer
续费天数

successList: [{...}]
成功续费的实例列表
⮕ [ 单个实例续费结果 ]

failedList: [{...}]
失败的实例列表
⮕ [ 单个实例续费结果 ]

remark: string
批量操作备注

}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
批量更新用户名密码
post /openapi/v2/static/instances/update-credentials
批量为多个代理实例更新用户名和密码，支持随机生成

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
{
proxyIds*: [string]
Min Items: 1 Max Items: 100

username: string
password: string
random: boolean
remark: string
}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/instances/update-credentials" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
successCount: integer
failureCount: integer
totalCount: integer
successList: [{...}]
failedList: [{...}]
remark: string
}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
获取可用线路
post /openapi/v2/static/lines
根据条件搜索可用的静态代理线路，支持按位置、ISP类型、业务类型等条件筛选

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
线路信息搜索请求

{
countryCode: string
国家代码（ISO 3166-1 alpha-3）

cityCode: string
城市代码

businessType: string
业务类型代码

tag: string
标签代码

ispType: integer
ISP类型：0=无, 1=广播, 2=原生

lineId: string
线路ID

current: integer
当前页码，从0开始

size: integer
每页数据条数

}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/lines" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
size: integer
current: integer
total: integer
records: [{...}]
⮕ [ 静态代理线路信息 ]

offset: integer
}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
获取可用位置
get /openapi/v2/static/lines/locations/available
获取所有有可用线路的位置，支持按国家代码、ISP类型、业务类型代码、标签代码过滤，返回城市级别的位置信息

REQUEST
QUERY-STRING PARAMETERS
businessTypeCode
string
业务类型代码

Examples: WEB
countryCode
string
国家代码（ISO 3166-1 alpha-3），如果提供则只返回该国家的可用城市

Examples: USA
ispType
int32
ISP类型：0=无, 1=广播, 2=原生

Examples: 1
tag
string
标签代码

Examples: PREMIUM
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X GET "https://api.ipipd.cn/openapi/v2/static/lines/locations/available" \
 -H 'accept: application/json' 
RESPONSE
200
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: [{
响应数据
⮕ [ 地理位置信息 ]

code: string
位置唯一代码（ISO 3166-1 alpha-3，国家层级时）

name: string
位置名称（本地化）

nameEn: string
位置英文名称

type: string
位置层级类型

parentCode: string
父级位置的代码（ISO 3166-1 alpha-3，国家层级时）

active: boolean
位置是否可用

children: [{recursive: LocationV2DTO} ]
子位置列表，用于构建树形结构

availableCount: integer
该位置可用的代理数量

}]
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
搜索订单
post /openapi/v2/static/orders
根据条件搜索用户的订单，支持按状态、订单号、时间范围等条件筛选

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
订单搜索请求参数

{
status: integer
订单状态：0=待付款, 1=处理中, 2=已完成, 3=已取消, 4=已失败

orderNo: string
内部订单号（精确匹配）

externalOrderNo: string
外部订单号（精确匹配）

createdAfter: date-time
createdBefore: date-time
current: integer
当前页码（从0开始）

Constraints: Min 0 Default: 0
size: integer
每页记录数

Constraints: Min 1┃Max 100 Default: 20
}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/orders" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
size: integer
current: integer
total: integer
records: [{...}]
⮕ [ 静态代理订单信息 ]

offset: integer
}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
创建代理订单
post /openapi/v2/static/orders/create
创建静态代理订单，支持通过线路ID或国家/城市代码两种方式创建订单

REQUEST
REQUEST BODY
*
application/json
EXAMPLE
SCHEMA
object
创建代理订单请求

{
lineId: string
线路ID（与国家/城市代码二选一）

countryCode: string
目标国家代码（ISO 3166-1 alpha-3，与线路ID二选一）

cityCode: string
目标城市代码（与线路ID二选一）

businessType: string
业务类型代码（使用国家/城市代码时必需）

ispType: integer
ISP类型：0=无, 1=广播, 2=原生（使用国家/城市代码时必需）

tag: string
标签代码（可选）

quantity*: integer
购买代理数量

Constraints: Min 1
days*: integer
购买天数

Constraints: Min 1
currency: string
货币类型

discountPackageId: string
折扣包ID（可选）

orderNo: string
外部订单号（客户系统中的订单号）

sync: boolean
是否同步处理

Default: false
}
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X POST "https://api.ipipd.cn/openapi/v2/static/orders/create" \
 -H 'accept: application/json'\
 -H 'content-type: application/json' 
RESPONSE
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
静态代理订单信息

orderNo: string
内部订单号

externalOrderNo: string
外部订单号（客户提供）

status: integer
订单状态：0=待付款,1=已付款, 2=处理中, 3=已完成, 4=已失败, 5=已取消, 6=已退款

type: integer
订单类型：0=购买, 1=续费

quantity: integer
代理实例数量

Constraints: Min 1
days: integer
购买天数

Constraints: Min 1
totalPrice: number
订单总金额

currency: string
货币类型

instances: [{...}]
订单包含的代理实例列表
⮕ [ 静态代理实例信息 ]

}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
位置信息
获取所有位置
get /openapi/v2/locations
获取系统中所有可用的地理位置信息，包括国家、州/省、城市等层级结构

REQUEST
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X GET "https://api.ipipd.cn/openapi/v2/locations" \
 -H 'accept: application/json' 
RESPONSE
200
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: [{
响应数据
⮕ [ 地理位置信息 ]

code: string
位置唯一代码（ISO 3166-1 alpha-3，国家层级时）

name: string
位置名称（本地化）

nameEn: string
位置英文名称

type: string
位置层级类型

parentCode: string
父级位置的代码（ISO 3166-1 alpha-3，国家层级时）

active: boolean
位置是否可用

children: [{recursive: LocationV2DTO} ]
子位置列表，用于构建树形结构

availableCount: integer
该位置可用的代理数量

}]
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
获取位置树形结构
get /openapi/v2/locations/tree
获取所有地理位置的层级树形结构，根据父子关系组织位置数据

REQUEST
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X GET "https://api.ipipd.cn/openapi/v2/locations/tree" \
 -H 'accept: application/json' 
RESPONSE
200
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: [{
响应数据
⮕ [ 地理位置信息 ]

code: string
位置唯一代码（ISO 3166-1 alpha-3，国家层级时）

name: string
位置名称（本地化）

nameEn: string
位置英文名称

type: string
位置层级类型

parentCode: string
父级位置的代码（ISO 3166-1 alpha-3，国家层级时）

active: boolean
位置是否可用

children: [{recursive: LocationV2DTO} ]
子位置列表，用于构建树形结构

availableCount: integer
该位置可用的代理数量

}]
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
账户管理
获取账户信息
get /openapi/v2/account
获取当前认证用户的详细账户信息，包括基本信息、钱包余额等

REQUEST
API Server
https://api.ipipd.cn
Authentication
Not Required
Copy
curl -X GET "https://api.ipipd.cn/openapi/v2/account" \
 -H 'accept: application/json' 
RESPONSE
200
OK

EXAMPLE
SCHEMA
application/json
object
API通用响应结果

{
success: boolean
操作是否成功

code: string
响应码，成功时为SUCCESS

message: string
响应消息

data: {
用户账户信息

userId: string
用户唯一标识

username: string
用户名

email: string
用户邮箱地址

phone: string
用户手机号码

status: string
账户状态

registeredAt: string
用户注册时间

lastLoginAt: string
用户最后登录时间

currency: string
用户默认货币

balance: number
用户默认货币的余额

}
timestamp: string
响应时间戳

traceId: string
请求追踪ID

}
