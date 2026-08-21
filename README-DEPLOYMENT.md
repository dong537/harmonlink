# 🚀 IPEasy 本地验证与 Zeabur 部署 - 完整工作流

**生成时间**: 2026-08-20  
**当前分支**: `railway-fixes-merge`  
**状态**: ✅ 所有脚本和文档已准备就绪

---

## 📊 工作流总览

```
┌─────────────────────────────────────────────────────────┐
│                   完整工作流                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  阶段 1: 本地环境准备                                      │
│  ├── 启动 Docker Desktop                                │
│  ├── 启动数据库 (PostgreSQL + Redis)                    │
│  ├── 安装依赖 & 生成 Prisma Client                      │
│  ├── 运行数据库迁移                                      │
│  └── 初始化测试数据                                      │
│                                                         │
│  阶段 2: 本地服务验证                                      │
│  ├── 启动后端 API                                       │
│  ├── 启动前端 Web                                       │
│  ├── 启动 Worker (可选)                                 │
│  ├── 健康检查                                          │
│  └── 功能测试                                          │
│                                                         │
│  阶段 3: Zeabur 部署准备                                  │
│  ├── 推送代码到 Git 仓库                                 │
│  ├── 生成环境变量                                       │
│  ├── 配置 Zeabur 服务                                   │
│  └── 运行数据库迁移                                      │
│                                                         │
│  阶段 4: Zeabur 部署验证                                  │
│  ├── 健康检查                                          │
│  ├── 功能测试                                          │
│  └── 性能监控                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 已生成的文件清单

### 🔧 脚本文件

| 文件 | 用途 | 平台 |
|------|------|------|
| `scripts/start-local.bat` | 一键启动本地环境 | Windows |
| `scripts/generate-secrets.js` | 生成安全密钥 | 跨平台 |
| `scripts/seed-local.ts` | 初始化测试数据 | 跨平台 |
| `scripts/verify-local.sh` | 本地健康检查 | Bash |
| `scripts/test-local.sh` | 本地功能测试 | Bash |
| `scripts/deploy-zeabur.sh` | Zeabur 自动化部署 | Bash |
| `scripts/health-check-zeabur.sh` | Zeabur 健康检查 | Bash |

### 📚 文档文件

| 文件 | 内容 |
|------|------|
| `docs/LOCAL_SETUP.md` | 本地开发快速启动指南 |
| `research/business-logic-architecture.md` | 业务逻辑全景架构 |
| `research/zeabur-deployment-guide.md` | Zeabur 部署完整指南 |
| `research/local-verify-and-deploy.md` | 本地验证与自动化部署方案 |

### ⚙️ 配置文件

| 文件 | 用途 |
|------|------|
| `.env` | 本地开发环境变量 |
| `zeabur.yaml` | Zeabur 项目配置 |
| `docker-compose.yml` | 本地数据库服务 (已存在) |

---

## 🎯 立即执行：本地验证流程

### Step 1: 启动 Docker Desktop

**操作**:
```
1. 打开 Docker Desktop 应用
2. 等待托盘图标不再转圈（完全启动）
```

**验证**:
```powershell
Get-Service -Name "*docker*"
```

预期输出: `Status: Running`

---

### Step 2: 运行一键启动脚本

**Windows 用户（推荐）**:
```cmd
scripts\start-local.bat
```

**或手动执行**:
```bash
# 启动数据库
docker compose up -d

# 安装依赖
pnpm install

# 生成 Prisma Client
pnpm --filter @ipeasy/db generate

# 运行迁移
pnpm --filter @ipeasy/db migrate:deploy
```

**验证数据库**:
```bash
docker compose ps
```

预期输出:
```
NAME                IMAGE                STATUS
365-postgres-1      postgres:16-alpine   Up
365-redis-1         redis:7-alpine       Up
```

---

### Step 3: 初始化测试数据

```bash
pnpm tsx scripts/seed-local.ts
```

**预期输出**:
```
✅ 站点创建成功: IPEasy 本地开发
✅ 租户创建成功: 默认租户
✅ 用户创建成功: test@ipeasy.com
✅ 钱包创建成功，余额: 1000.00
🎉 本地数据初始化完成！
```

**测试账号**:
- Email: `test@ipeasy.com`
- Password: `password123`
- 余额: ¥1000.00

---

### Step 4: 启动服务（3 个终端）

**终端 1 - 后端 API**:
```bash
pnpm --filter @ipeasy/api dev
```

预期输出:
```
🚀 NestJS application successfully started
🌐 Listening on http://localhost:3000
✅ Health: http://localhost:3000/health
✅ Legacy API: http://localhost:3000/api/v1/health
```

**终端 2 - 前端 Web**:
```bash
pnpm --filter @ipeasy/web dev
```

预期输出:
```
VITE ready in xxx ms
➜  Local: http://localhost:5173/
```

**终端 3 - Worker (可选)**:
```bash
pnpm --filter @ipeasy/worker dev
```

---

### Step 5: 验证服务

**健康检查**:
```bash
bash scripts/verify-local.sh
```

**功能测试**:
```bash
bash scripts/test-local.sh
```

**预期结果**:
```
✅ 登录成功
✅ 用户信息获取成功
✅ 用户资料获取成功
✅ SKU 列表获取成功
✅ 位置列表获取成功
✅ 专线列表获取成功
```

---

## 🚀 立即执行：Zeabur 部署流程

### 前提条件
- ✅ 本地验证已通过
- ✅ 有 Git 远程仓库（GitHub/GitLab）
- ✅ 有 Zeabur 账号

---

### Step 1: 运行自动化部署脚本

```bash
bash scripts/deploy-zeabur.sh
```

**脚本会自动完成**:
1. ✅ 检查 Git 状态
2. ✅ 推送代码到远程仓库
3. ✅ 生成安全密钥
4. ✅ 创建 `.env.zeabur` 文件
5. ✅ 显示部署说明

**生成的文件**:
- `.env.zeabur` (包含生产环境变量)

---

### Step 2: 在 Zeabur Dashboard 配置服务

**访问**: https://zeabur.com/projects/6a786d80e4a69d66638d62e1

**创建服务（如果尚未创建）**:

#### 2.1 PostgreSQL (托管数据库)
```
1. 点击 "Add Service" → "PostgreSQL"
2. 选择区域
3. 记录 DATABASE_URL
```

#### 2.2 Redis (托管缓存)
```
1. 点击 "Add Service" → "Redis"
2. 选择同区域
3. 记录 REDIS_URL
```

#### 2.3 ipeasy-api (后端)
```
Source: GitHub Repository
Branch: railway-fixes-merge
Dockerfile: apps/api/Dockerfile
Port: 8080
Health Check: /health
```

**环境变量**: 复制 `.env.zeabur` 的内容，替换以下占位符:
- `your-domain.zeabur.app` → 你的实际域名
- `<REPLACE_WITH_YOUR_SITE_ID>` → 站点 ID
- 供应商 API 密钥（如果启用）

#### 2.4 ipeasy-web (前端)
```
Source: 同一 GitHub Repository
Branch: railway-fixes-merge
Dockerfile: apps/web/Dockerfile
Port: 4173
```

**环境变量**: 复制 `.env.zeabur` 的 Web 部分

#### 2.5 ipeasy-worker (后台任务)
```
Source: 同一 GitHub Repository
Branch: railway-fixes-merge
Dockerfile: apps/worker/Dockerfile
```

**环境变量**: 复制 API 的环境变量

---

### Step 3: 运行数据库迁移

**方式 1: Zeabur CLI**
```bash
zeabur exec ipeasy-api -- sh -c 'cd /app && pnpm --filter @ipeasy/db migrate:deploy'
```

**方式 2: Zeabur Web Shell**
```
1. 在 Zeabur Dashboard 打开 ipeasy-api 服务
2. 点击 "Shell" 标签
3. 运行:
   cd /app
   pnpm --filter @ipeasy/db migrate:deploy
```

---

### Step 4: 验证 Zeabur 部署

```bash
bash scripts/health-check-zeabur.sh \
  https://api.your-domain.zeabur.app \
  https://your-domain.zeabur.app
```

**预期结果**:
```
✅ API 健康检查通过
✅ Legacy API 健康检查通过
✅ Web 健康检查通过
```

---

## 🔍 故障排查

### 问题 1: Docker Desktop 未运行

**症状**:
```
Error: unable to get image 'postgres:16-alpine'
```

**解决**:
```powershell
# 检查服务状态
Get-Service -Name "*docker*"

# 如果状态是 Stopped，手动启动 Docker Desktop
```

---

### 问题 2: 端口被占用

**症状**:
```
Error: Port 3000 is already in use
```

**解决**:
```powershell
# 查找占用端口的进程
netstat -ano | findstr :3000

# 终止进程
taskkill /PID <PID> /F

# 或修改 .env 中的 PORT
```

---

### 问题 3: 数据库连接失败

**症状**:
```
Error: P1001: Can't reach database server
```

**解决**:
```bash
# 检查容器状态
docker compose ps

# 查看日志
docker compose logs postgres

# 重启容器
docker compose restart postgres
```

---

## 📊 完成检查清单

### 本地验证
- [ ] Docker Desktop 已启动
- [ ] PostgreSQL + Redis 容器运行正常
- [ ] 依赖已安装
- [ ] Prisma Client 已生成
- [ ] 数据库迁移已完成
- [ ] 测试数据已初始化
- [ ] 后端 API 启动成功
- [ ] 前端 Web 启动成功
- [ ] Worker 启动成功（可选）
- [ ] 健康检查通过
- [ ] 功能测试通过

### Zeabur 部署
- [ ] 代码已推送到远程仓库
- [ ] PostgreSQL 服务已创建
- [ ] Redis 服务已创建
- [ ] ipeasy-api 服务已创建并配置环境变量
- [ ] ipeasy-web 服务已创建并配置环境变量
- [ ] ipeasy-worker 服务已创建并配置环境变量
- [ ] 数据库迁移已运行
- [ ] API 健康检查通过
- [ ] Legacy API 健康检查通过
- [ ] Web 健康检查通过
- [ ] 自定义域名已配置（可选）

---

## 🔗 快速导航

### 文档
- [本地开发快速启动](../docs/LOCAL_SETUP.md)
- [业务逻辑架构](./business-logic-architecture.md)
- [Zeabur 部署指南](./zeabur-deployment-guide.md)
- [本地验证与自动化部署](./local-verify-and-deploy.md)

### 脚本
- Windows 一键启动: `scripts\start-local.bat`
- 健康检查: `bash scripts/verify-local.sh`
- 功能测试: `bash scripts/test-local.sh`
- Zeabur 部署: `bash scripts/deploy-zeabur.sh`
- Zeabur 健康检查: `bash scripts/health-check-zeabur.sh`

### 外部链接
- Zeabur 项目: https://zeabur.com/projects/6a786d80e4a69d66638d62e1
- Zeabur 文档: https://zeabur.com/docs

---

## 💡 下一步建议

### 立即执行
1. ✅ 启动 Docker Desktop
2. ✅ 运行 `scripts\start-local.bat`
3. ✅ 初始化测试数据
4. ✅ 启动服务并验证

### 完成本地验证后
1. 运行 `bash scripts/deploy-zeabur.sh`
2. 在 Zeabur Dashboard 配置服务
3. 运行数据库迁移
4. 验证生产部署

---

**文档版本**: v1.0  
**生成工具**: Claude Code (Opus 5)  
**更新时间**: 2026-08-20

---

## ❓ 需要帮助？

如果遇到问题：
1. 查看对应的故障排查章节
2. 检查相关文档
3. 查看服务日志：
   - 本地: `docker compose logs`
   - Zeabur: 在 Dashboard 查看日志

**祝部署顺利！🚀**
