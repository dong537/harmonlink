# 🚀 立即开始 - 3 分钟快速指南

## 当前状态
✅ 所有脚本和配置已就绪  
❌ Docker Desktop 遇到启动问题  
✅ 可以使用云端数据库继续  

---

## 🎯 推荐：使用 Zeabur 云端数据库

### 第一步：获取 Zeabur 数据库连接字符串

访问你的 Zeabur 项目：
https://zeabur.com/projects/6a786d80e4a69d66638d62e1/services

**获取 PostgreSQL 连接字符串**:
1. 点击 PostgreSQL 服务
2. 找到 "Connection String" 或 "DATABASE_URL"
3. 复制完整连接字符串（格式：`postgresql://username:password@host:port/database`）

**获取 Redis 连接字符串**:
1. 点击 Redis 服务
2. 找到 "Connection String" 或 "REDIS_URL"
3. 复制完整连接字符串（格式：`redis://host:port`）

---

### 第二步：运行自动化设置脚本

在项目根目录打开终端（PowerShell 或 CMD），执行：

```cmd
scripts\setup-without-docker.bat
```

**脚本会提示你**:
```
请选择数据库来源 (1-4):
  1. Zeabur 云端数据库（推荐）
  2. Railway 云端数据库
  3. 其他云端数据库
  4. 暂时跳过（稍后手动配置）

请选择: 1

PostgreSQL 连接字符串: [粘贴你的连接字符串]
Redis 连接字符串: [粘贴你的连接字符串]
```

**然后脚本会自动**:
- ✅ 保存配置到 `.env.cloud`
- ✅ 合并到 `.env`
- ✅ 安装所有依赖（`pnpm install`）
- ✅ 生成 Prisma Client
- ✅ 运行数据库迁移

---

### 第三步：启动开发服务

**打开 3 个终端窗口**:

**终端 1 - 后端 API**:
```bash
pnpm --filter @ipeasy/api dev
```
等待看到：`Nest application successfully started`  
访问: http://localhost:3000/health

**终端 2 - 前端 Web**:
```bash
pnpm --filter @ipeasy/web dev
```
等待看到：`VITE ready in xxx ms`  
访问: http://localhost:5173

**终端 3 - Worker (可选)**:
```bash
pnpm --filter @ipeasy/worker dev
```

---

### 第四步：测试功能

**健康检查**:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/health
```

**登录测试账号** (需要先初始化数据):
```bash
pnpm tsx scripts/seed-local.ts
```

然后访问 http://localhost:5173 并使用：
- Email: `test@ipeasy.com`
- Password: `password123`

---

### 第五步：部署到 Zeabur

**确保代码已提交**:
```bash
git add .
git commit -m "chore: ready for deployment"
git push origin main
```

**运行自动部署脚本**:
```bash
bash scripts/deploy-zeabur.sh
```

脚本会：
1. 生成 `.env.zeabur` 模板
2. 检查 Git 状态
3. 提示你在 Zeabur Dashboard 的操作步骤
4. 提供健康检查命令

---

## 📋 检查清单

在部署前确认：

- [ ] Zeabur PostgreSQL 服务已创建并运行
- [ ] Zeabur Redis 服务已创建并运行
- [ ] 已获取两个数据库的连接字符串
- [ ] 本地环境变量已配置（`.env` 文件）
- [ ] 依赖已安装（`node_modules` 存在）
- [ ] Prisma Client 已生成
- [ ] 数据库迁移已运行
- [ ] 本地服务可以启动
- [ ] 代码已推送到 Git 远程仓库

---

## 🆘 遇到问题？

### 问题 1: 脚本运行失败
```bash
# 查看详细错误
pnpm install --verbose
```

### 问题 2: 数据库连接失败
```bash
# 测试连接
node -e "const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.\$connect().then(() => console.log('✅ 连接成功')).catch(e => console.log('❌ 连接失败:', e.message))"
```

### 问题 3: 端口已占用
```bash
# 查看占用端口的进程
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# 结束进程（替换 <PID>）
taskkill /F /PID <PID>
```

### 问题 4: Prisma 生成失败
```bash
# 清理并重新生成
pnpm --filter @ipeasy/db prisma:clean
pnpm --filter @ipeasy/db generate
```

---

## 📚 相关文档

- 完整部署流程: [`README-DEPLOYMENT.md`](README-DEPLOYMENT.md)
- Zeabur 详细指南: [`research/zeabur-deployment-guide.md`](research/zeabur-deployment-guide.md)
- 业务逻辑架构: [`research/business-logic-architecture.md`](research/business-logic-architecture.md)
- Docker 问题排查: [`DOCKER_TROUBLESHOOTING.md`](DOCKER_TROUBLESHOOTING.md)

---

## ⚡ 极速模式（跳过本地测试）

如果你想直接部署到 Zeabur，跳过本地验证：

```bash
# 1. 确保代码已提交
git add . && git commit -m "deploy" && git push

# 2. 直接运行部署脚本
bash scripts/deploy-zeabur.sh

# 3. 按照提示在 Zeabur Dashboard 配置
#    - 创建服务
#    - 配置环境变量
#    - 触发部署

# 4. 验证部署
bash scripts/health-check-zeabur.sh https://api.your-domain.zeabur.app https://your-domain.zeabur.app
```

---

## 🎉 准备好了吗？

**立即开始**:
```cmd
scripts\setup-without-docker.bat
```

**我会全程协助你！遇到任何问题随时告诉我。**
