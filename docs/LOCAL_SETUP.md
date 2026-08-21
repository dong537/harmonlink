# IPEasy 本地开发快速启动指南

## 🚀 快速开始

### 前置条件
- ✅ Node.js 20+ (已安装: v24.12.0)
- ✅ pnpm 9+ (已安装: 9.15.0)
- ⚠️ Docker Desktop (需要启动)

---

## 📋 方式 1: 一键启动脚本（Windows）

### 步骤 1: 启动 Docker Desktop
```
1. 从开始菜单打开 Docker Desktop
2. 等待 Docker Desktop 完全启动（托盘图标不再转圈）
```

### 步骤 2: 运行启动脚本
```cmd
scripts\start-local.bat
```

脚本会自动完成：
- ✅ 检查 Docker Desktop 状态
- ✅ 启动 PostgreSQL + Redis
- ✅ 安装依赖
- ✅ 生成 Prisma Client
- ✅ 运行数据库迁移

### 步骤 3: 初始化测试数据（可选）
```cmd
pnpm tsx scripts/seed-local.ts
```

**测试账号**:
- Email: `test@ipeasy.com`
- Password: `password123`
- 余额: ¥1000.00

### 步骤 4: 启动服务

**终端 1 - 后端 API**:
```cmd
pnpm --filter @ipeasy/api dev
```
访问: http://localhost:3000
API 文档: http://localhost:3000/api-docs

**终端 2 - 前端 Web**:
```cmd
pnpm --filter @ipeasy/web dev
```
访问: http://localhost:5173

**终端 3 - Worker（可选）**:
```cmd
pnpm --filter @ipeasy/worker dev
```

### 步骤 5: 验证服务
```bash
bash scripts/verify-local.sh
bash scripts/test-local.sh
```

---

## 📋 方式 2: 手动启动（跨平台）

### 1. 启动 Docker Desktop
确保 Docker Desktop 正在运行

### 2. 启动数据库服务
```bash
docker compose up -d
```

验证状态:
```bash
docker compose ps
```

预期输出:
```
NAME                IMAGE                PORTS
365-postgres-1      postgres:16-alpine   0.0.0.0:15432->5432/tcp
365-redis-1         redis:7-alpine       0.0.0.0:6379->6379/tcp
```

### 3. 安装依赖
```bash
pnpm install
```

### 4. 生成 Prisma Client
```bash
pnpm --filter @ipeasy/db generate
```

### 5. 运行数据库迁移
```bash
pnpm --filter @ipeasy/db migrate:deploy
```

验证迁移状态:
```bash
pnpm --filter @ipeasy/db migrate:status
```

### 6. 初始化测试数据（可选）
```bash
pnpm tsx scripts/seed-local.ts
```

### 7. 启动服务

在 **3 个独立终端** 中分别运行:

**终端 1**:
```bash
pnpm --filter @ipeasy/api dev
```

**终端 2**:
```bash
pnpm --filter @ipeasy/web dev
```

**终端 3** (可选):
```bash
pnpm --filter @ipeasy/worker dev
```

### 8. 验证服务
```bash
# 健康检查
bash scripts/verify-local.sh

# 功能测试
bash scripts/test-local.sh
```

---

## 🔧 常见问题

### Q1: Docker Desktop 启动失败

**症状**:
```
Error: unable to get image 'postgres:16-alpine'
```

**解决**:
1. 确保 Docker Desktop 已完全启动
2. 检查 Docker 服务状态:
   ```powershell
   Get-Service -Name "*docker*"
   ```
3. 如果服务未运行，手动启动 Docker Desktop

---

### Q2: 数据库连接失败

**症状**:
```
Error: P1001: Can't reach database server
```

**解决**:
1. 检查 PostgreSQL 容器状态:
   ```bash
   docker compose ps
   ```
2. 查看容器日志:
   ```bash
   docker compose logs postgres
   ```
3. 验证环境变量:
   ```bash
   cat .env | grep DATABASE_URL
   ```

---

### Q3: 端口被占用

**症状**:
```
Error: Port 3000 is already in use
```

**解决**:
1. 查找占用端口的进程:
   ```powershell
   netstat -ano | findstr :3000
   ```
2. 终止进程或修改 `.env` 中的 `PORT`

---

### Q4: Prisma 迁移失败

**症状**:
```
Error: Migration failed
```

**解决**:
1. 重置数据库（⚠️ 会删除所有数据）:
   ```bash
   pnpm --filter @ipeasy/db migrate:reset
   ```
2. 重新运行迁移:
   ```bash
   pnpm --filter @ipeasy/db migrate:deploy
   ```

---

## 📊 服务端口映射

| 服务 | 端口 | 访问地址 |
|------|------|---------|
| PostgreSQL | 15432 | `postgresql://ipipx:ipipx@localhost:15432/ipipx` |
| Redis | 6379 | `redis://localhost:6379` |
| API | 3000 | http://localhost:3000 |
| API Docs | 3000 | http://localhost:3000/api-docs |
| Web | 5173 | http://localhost:5173 |
| Worker | - | (无 HTTP 端口) |

---

## 🧪 测试 API

### 使用 curl

**健康检查**:
```bash
curl http://localhost:3000/health
```

**Legacy API 健康检查**:
```bash
curl http://localhost:3000/api/v1/health
```

**登录**:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ipeasy.com","password":"password123"}'
```

### 使用 Swagger UI

访问: http://localhost:3000/api-docs

---

## 📚 下一步

完成本地验证后，准备部署到 Zeabur:

1. **生成部署配置**:
   ```bash
   bash scripts/deploy-zeabur.sh
   ```

2. **阅读部署指南**:
   - [`research/zeabur-deployment-guide.md`](../research/zeabur-deployment-guide.md)
   - [`research/local-verify-and-deploy.md`](../research/local-verify-and-deploy.md)

3. **验证 Zeabur 部署**:
   ```bash
   bash scripts/health-check-zeabur.sh <api-url> <web-url>
   ```

---

## 🔗 相关文档

- [业务逻辑架构](../research/business-logic-architecture.md)
- [Zeabur 部署指南](../research/zeabur-deployment-guide.md)
- [本地验证与自动化部署](../research/local-verify-and-deploy.md)

---

**更新时间**: 2026-08-20  
**版本**: v1.0
