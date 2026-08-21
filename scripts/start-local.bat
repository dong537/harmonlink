@echo off
echo ========================================
echo   IPEasy 本地开发环境启动脚本
echo ========================================
echo.

echo [1/6] 检查 Docker Desktop...
sc query "com.docker.service" | findstr "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Desktop 未运行
    echo.
    echo 请先启动 Docker Desktop，然后重新运行此脚本。
    echo.
    echo 启动方式：
    echo   1. 从开始菜单打开 Docker Desktop
    echo   2. 等待 Docker Desktop 完全启动（托盘图标不再转圈）
    echo   3. 再次运行此脚本
    echo.
    pause
    exit /b 1
) else (
    echo ✅ Docker Desktop 正在运行
)

echo.
echo [2/6] 启动 PostgreSQL 和 Redis...
docker compose up -d
if %errorlevel% neq 0 (
    echo ❌ Docker Compose 启动失败
    pause
    exit /b 1
)
echo ✅ 数据库服务已启动

echo.
echo [3/6] 等待数据库就绪...
timeout /t 5 /nobreak >nul
echo ✅ 数据库就绪

echo.
echo [4/6] 安装依赖...
call pnpm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成

echo.
echo [5/6] 生成 Prisma Client...
call pnpm --filter @ipeasy/db generate
if %errorlevel% neq 0 (
    echo ❌ Prisma Client 生成失败
    pause
    exit /b 1
)
echo ✅ Prisma Client 已生成

echo.
echo [6/6] 运行数据库迁移...
call pnpm --filter @ipeasy/db migrate:deploy
if %errorlevel% neq 0 (
    echo ❌ 数据库迁移失败
    pause
    exit /b 1
)
echo ✅ 数据库迁移完成

echo.
echo ========================================
echo   ✅ 本地环境准备完成！
echo ========================================
echo.
echo 📝 下一步：
echo.
echo 1. 初始化测试数据（可选）:
echo    pnpm tsx scripts/seed-local.ts
echo.
echo 2. 启动后端 API（终端 1）:
echo    pnpm --filter @ipeasy/api dev
echo.
echo 3. 启动前端 Web（终端 2）:
echo    pnpm --filter @ipeasy/web dev
echo.
echo 4. 启动 Worker（终端 3，可选）:
echo    pnpm --filter @ipeasy/worker dev
echo.
echo 5. 验证服务:
echo    bash scripts/verify-local.sh
echo.
pause
