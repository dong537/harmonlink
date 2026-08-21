@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   IPEasy 本地环境 - 完整启动流程
echo ========================================
echo.

REM ============================================
REM 步骤 1: 检查 Docker Desktop
REM ============================================
echo [步骤 1/7] 检查 Docker Desktop...
echo.

:CHECK_DOCKER_SERVICE
sc query "com.docker.service" | findstr "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Desktop 服务未运行
    echo.
    echo 请启动 Docker Desktop 后按任意键继续...
    pause >nul
    goto CHECK_DOCKER_SERVICE
)

echo ✅ Docker 服务正在运行
echo.
echo 验证 Docker 引擎...

:CHECK_DOCKER_ENGINE
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ⏳ Docker 引擎尚未就绪，等待 5 秒...
    timeout /t 5 /nobreak >nul
    goto CHECK_DOCKER_ENGINE
)

echo ✅ Docker 引擎就绪
echo.

REM ============================================
REM 步骤 2: 启动数据库服务
REM ============================================
echo [步骤 2/7] 启动数据库服务 (PostgreSQL + Redis)...
echo.

docker compose up -d
if %errorlevel% neq 0 (
    echo ❌ 数据库启动失败
    echo.
    echo 请检查 docker-compose.yml 文件和 Docker Desktop 日志
    pause
    exit /b 1
)

echo ✅ 数据库服务已启动
echo.
echo 等待数据库就绪...
timeout /t 5 /nobreak >nul

docker compose ps
echo.

REM ============================================
REM 步骤 3: 验证环境变量
REM ============================================
echo [步骤 3/7] 验证环境变量...
echo.

if not exist ".env" (
    echo ❌ .env 文件不存在
    echo.
    echo 正在从 .env.example 创建 .env...
    copy .env.example .env >nul
    echo ⚠️  请编辑 .env 文件，填入必要的配置
    pause
)

echo ✅ .env 文件存在
echo.

REM ============================================
REM 步骤 4: 安装依赖
REM ============================================
echo [步骤 4/7] 安装项目依赖...
echo.

call pnpm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo ✅ 依赖安装完成
echo.

REM ============================================
REM 步骤 5: 生成 Prisma Client
REM ============================================
echo [步骤 5/7] 生成 Prisma Client...
echo.

call pnpm --filter @ipeasy/db generate
if %errorlevel% neq 0 (
    echo ❌ Prisma Client 生成失败
    pause
    exit /b 1
)

echo ✅ Prisma Client 已生成
echo.

REM ============================================
REM 步骤 6: 运行数据库迁移
REM ============================================
echo [步骤 6/7] 运行数据库迁移...
echo.

call pnpm --filter @ipeasy/db migrate:deploy
if %errorlevel% neq 0 (
    echo ❌ 数据库迁移失败
    echo.
    echo 可能的原因:
    echo   - 数据库连接配置错误
    echo   - PostgreSQL 容器未就绪
    echo   - 迁移文件存在问题
    echo.
    echo 请检查上述输出的错误信息
    pause
    exit /b 1
)

echo ✅ 数据库迁移完成
echo.

REM ============================================
REM 步骤 7: 初始化测试数据 (可选)
REM ============================================
echo [步骤 7/7] 初始化测试数据 (可选)...
echo.
echo 是否要初始化测试数据？(Y/N)
set /p INIT_DATA="请选择 (默认 N): "

if /i "%INIT_DATA%"=="Y" (
    echo.
    echo 正在初始化测试数据...
    call pnpm tsx scripts/seed-local.ts
    if %errorlevel% neq 0 (
        echo ⚠️  测试数据初始化失败
        echo.
    ) else (
        echo ✅ 测试数据初始化完成
        echo.
        echo 测试账号:
        echo   Email: test@ipeasy.com
        echo   Password: password123
        echo   余额: ¥1000.00
        echo.
    )
) else (
    echo ⏭️  跳过测试数据初始化
    echo.
)

REM ============================================
REM 完成
REM ============================================
echo ========================================
echo   ✅ 本地环境准备完成！
echo ========================================
echo.
echo 📝 下一步: 启动开发服务
echo.
echo 请打开 3 个独立的终端窗口，分别运行:
echo.
echo 终端 1 - 后端 API:
echo   pnpm --filter @ipeasy/api dev
echo   访问: http://localhost:3000
echo   文档: http://localhost:3000/api-docs
echo.
echo 终端 2 - 前端 Web:
echo   pnpm --filter @ipeasy/web dev
echo   访问: http://localhost:5173
echo.
echo 终端 3 - Worker (可选):
echo   pnpm --filter @ipeasy/worker dev
echo.
echo ========================================
echo.
echo 🧪 验证服务:
echo   bash scripts/verify-local.sh
echo   bash scripts/test-local.sh
echo.
echo 📚 查看完整文档:
echo   docs/LOCAL_SETUP.md
echo   README-DEPLOYMENT.md
echo.
echo ========================================
echo.
pause
