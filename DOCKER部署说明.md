# Docker 生产部署说明

## 一、是否可以用 Docker 部署

可以。

当前项目是 Node.js 单进程服务，前端静态资源和后端 API 都由 `server.js` 提供，适合使用 Docker 或 Docker Compose 部署。

## 二、已提供的部署文件

根目录已新增：

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.example
```

说明：

- `Dockerfile`：构建生产镜像。
- `docker-compose.yml`：启动服务并挂载数据目录。
- `.dockerignore`：避免把本地数据、日志、环境变量打进镜像。
- `.env.example`：生产环境变量示例。

## 三、生产部署步骤

### 1. 准备环境变量

复制示例文件：

```bash
cp .env.example .env
```

编辑 `.env`：

```text
APP_SECRET=请替换为足够长的随机字符串
ADMIN_USER=admin
ADMIN_PASSWORD=请替换为强密码
```

注意：

如果 `data/db.json` 已经存在，`ADMIN_PASSWORD` 不会覆盖已有管理员密码。管理员初始密码只在数据库第一次初始化时生效。

### 2. 构建并启动

```bash
docker compose up -d --build
```

启动后访问：

```text
http://服务器IP:3000
```

### 3. 查看运行状态

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

### 4. 停止服务

```bash
docker compose down
```

### 5. 重启服务

```bash
docker compose restart
```

## 四、数据持久化

系统数据保存在容器内：

```text
/app/data/db.json
```

Docker Compose 已挂载到宿主机：

```text
./data:/app/data
```

因此容器删除或重建后，业务数据仍保留在宿主机的 `data` 目录中。

## 五、升级发布流程

拉取或替换新代码后执行：

```bash
docker compose up -d --build
```

正常情况下不会影响 `./data/db.json`。

建议升级前备份：

```bash
cp data/db.json data/db.json.bak
```

## 六、正式环境建议

生产环境建议不要直接暴露 `3000` 端口给公网，而是使用 Nginx 或宝塔反向代理，并开启 HTTPS。

反向代理目标：

```text
http://127.0.0.1:3000
```

IPIPD 回调地址应配置为 HTTPS 地址，例如：

```text
https://your-domain.com/api/ipipd/callback
```

## 七、安全建议

正式上线前请务必处理：

- 修改 `.env` 中的 `APP_SECRET`。
- 修改默认管理员密码。
- 后台“上游凭据”切换为 `live` 前确认 AppId 和 AppSecret 正确。
- 使用 HTTPS。
- 定期备份 `data/db.json`。
- 不要把 `.env` 和 `data/db.json` 提交到代码仓库。

## 八、常用命令

构建镜像：

```bash
docker compose build
```

后台启动：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs -f ipipd-panel
```

进入容器：

```bash
docker compose exec ipipd-panel sh
```

查看数据文件：

```bash
ls -lh data
```

停止并删除容器：

```bash
docker compose down
```
