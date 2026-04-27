# Railway 部署说明

## 一、当前项目是否适合 Railway

适合。

当前项目是一个 Node.js Web 服务，前端静态资源和后端 API 都由 `server.js` 提供。Railway 会在运行时注入 `PORT` 环境变量，本项目已经使用：

```js
process.env.PORT
```

因此可以直接部署到 Railway。

## 二、已新增 Railway 配置

根目录已新增：

```text
railway.json
```

配置内容：

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

作用：

- 使用根目录 `Dockerfile` 构建。
- 使用 `/api/health` 作为健康检查。
- 服务异常退出后自动重启。

## 三、Railway 部署步骤

### 1. 推送代码到 GitHub

将整个项目推送到 GitHub 仓库。

不要提交：

```text
.env
data/db.json
```

### 2. Railway 创建项目

进入 Railway：

```text
https://railway.com
```

操作：

1. New Project
2. Deploy from GitHub repo
3. 选择本项目仓库
4. Railway 会自动识别根目录的 `Dockerfile`

### 3. 配置环境变量

在 Railway 项目的 Variables 中添加：

```text
APP_SECRET=替换为足够长的随机字符串
ADMIN_USER=admin
ADMIN_PASSWORD=替换为强密码
CORS_ORIGIN=https://你的正式域名
TZ=Asia/Shanghai
```

说明：

- `PORT` 不需要手动配置，Railway 会自动注入。
- 如果你还没有正式域名，`CORS_ORIGIN` 可以先不填。
- `ADMIN_PASSWORD` 只在第一次初始化数据库时生效。

### 4. 配置持久化 Volume

当前项目默认使用本地 JSON 文件：

```text
/app/data/db.json
```

Railway 容器文件系统默认不适合长期保存业务数据，因此需要创建 Volume。

Volume 挂载路径：

```text
/app/data
```

这样订单、用户、额度、价格、上游配置等数据会保存在 Railway Volume 中。

### 5. 部署并访问

部署完成后，Railway 会生成一个公开域名。

访问：

```text
https://你的-railway-域名
```

健康检查地址：

```text
https://你的-railway-域名/api/health
```

返回 `success: true` 说明后端正常。

## 四、IPIPD 上游配置

部署完成后，使用管理员账号登录后台。

进入：

```text
上游凭据
```

填写：

```text
模式：live
API Base URL：https://api.ipipd.cn
AppId：IPIPD 开放平台 App ID
AppSecret：IPIPD 开放平台 App Secret
```

保存后点击“查询上游账户”测试。

## 五、IPIPD 回调地址

如果需要配置 IPIPD 回调，使用 Railway 域名：

```text
https://你的-railway-域名/api/ipipd/callback
```

如果绑定了自定义域名，则使用：

```text
https://你的域名/api/ipipd/callback
```

## 六、上线注意事项

正式环境建议：

- 一定要配置 Railway Volume，挂载到 `/app/data`。
- 修改默认管理员密码。
- 配置强随机 `APP_SECRET`。
- 使用自定义域名和 HTTPS。
- 定期备份 `data/db.json`。
- 后续正式商用建议迁移到 PostgreSQL，而不是长期使用 JSON 文件存储资金和订单数据。

## 七、常见问题

### 1. Railway 部署后打不开

检查：

- Logs 是否显示服务启动。
- `/api/health` 是否返回 200。
- 服务是否监听 Railway 注入的 `PORT`。

本项目已经监听 `process.env.PORT`。

### 2. 数据重启后丢失

说明没有配置 Volume。

请在 Railway 创建 Volume，并挂载到：

```text
/app/data
```

### 3. 健康检查失败

确认 `railway.json` 中的健康检查路径：

```text
/api/health
```

然后访问：

```text
https://你的域名/api/health
```

### 4. 官方 IPIPD 调不通

检查后台“上游凭据”：

- 是否为 `live`
- AppId 是否正确
- AppSecret 是否正确
- API Base URL 是否为 `https://api.ipipd.cn`

### 5. 下单失败但用户额度被扣

当前系统已经处理了这种情况。若上游下单失败，会自动生成额度退回流水，并将订单标记为：

```text
upstream_failed
```
