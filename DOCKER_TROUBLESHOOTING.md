# Docker Desktop 启动问题处理指南

## 当前状态
- ✅ Docker Desktop 应用进程运行中
- ❌ Docker 引擎服务未启动
- ⏱️ 已等待约 5 分钟

---

## 方案 A: 重启 Docker Desktop（推荐）

### 步骤 1: 完全关闭 Docker
```powershell
# 以管理员身份运行 PowerShell，执行：
Get-Process -Name "*docker*" | Stop-Process -Force
```

### 步骤 2: 清理并重启
```powershell
# 重新启动（以管理员身份）
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -Verb RunAs
```

### 步骤 3: 等待并验证
```powershell
# 等待 60 秒后验证
Start-Sleep -Seconds 60
docker info
```

---

## 方案 B: 使用已有数据库（快速继续）

如果你有 Zeabur 或其他云端数据库，可以直接使用。

### 修改 .env 文件
```bash
# 将 DATABASE_URL 和 REDIS_URL 改为远程地址
DATABASE_URL=postgresql://user:pass@host:port/dbname
REDIS_URL=redis://host:port
```

### 跳过 Docker，直接运行迁移和服务
```bash
# 1. 安装依赖
pnpm install

# 2. 生成 Prisma Client
pnpm --filter @ipeasy/db generate

# 3. 运行迁移
pnpm --filter @ipeasy/db migrate:deploy

# 4. 启动服务
pnpm --filter @ipeasy/api dev
```

---

## 方案 C: 检查 Docker Desktop 日志

### 查看日志位置
```
%APPDATA%\Docker\log.txt
```

### 常见错误和解决方案

#### 错误 1: WSL2 未启用
```powershell
# 以管理员身份运行
wsl --install
wsl --set-default-version 2
```

#### 错误 2: Hyper-V 未启用
```powershell
# 以管理员身份运行
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
```

#### 错误 3: 虚拟化未启用
需要进入 BIOS 启用 Intel VT-x 或 AMD-V

---

## 立即执行的脚本

我已经为你准备了自动化脚本：

### 重启 Docker Desktop
```powershell
.\scripts\restart-docker.ps1
```

### 跳过 Docker，直接继续
```bash
.\scripts\setup-without-docker.bat
```

---

## 需要我做什么？

请告诉我：
1. **"重启 Docker"** - 我帮你执行方案 A
2. **"跳过 Docker"** - 我帮你执行方案 B（如果你有远程数据库）
3. **"查看日志"** - 我帮你诊断 Docker 日志
4. **"其他问题"** - 描述你看到的错误信息
