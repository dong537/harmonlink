@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   跳过本地 Docker，直接部署到 Zeabur
echo ========================================
echo.

echo 此脚本会帮你：
echo   1. 配置环境变量（使用云端数据库）
echo   2. 安装依赖
echo   3. 生成 Prisma Client
echo   4. 准备部署配置
echo.
echo ========================================
echo.

REM ============================================
REM 步骤 1: 选择数据库来源
REM ============================================
echo [步骤 1/6] 选择数据库来源
echo.
echo 你有以下选项：
echo   1. Zeabur 云端数据库（推荐）
echo   2. Railway 云端数据库
echo   3. 其他云端数据库
echo   4. 暂时跳过（稍后手动配置）
echo.
set /p DB_CHOICE="请选择 (1-4): "
echo.

if "%DB_CHOICE%"=="1" (
    echo 已选择：Zeabur 云端数据库
    echo.
    echo 📝 请提供以下信息：
    echo.

    set /p ZEABUR_PG_URL="PostgreSQL 连接字符串: "
    set /p ZEABUR_REDIS_URL="Redis 连接字符串: "

    echo DATABASE_URL=!ZEABUR_PG_URL! > .env.cloud
    echo REDIS_URL=!ZEABUR_REDIS_URL! >> .env.cloud

    echo.
    echo ✅ 数据库配置已保存到 .env.cloud
    echo.

) else if "%DB_CHOICE%"=="2" (
    echo 已选择：Railway 云端数据库
    echo.
    echo 📝 请提供以下信息：
    echo.

    set /p RAILWAY_PG_URL="PostgreSQL 连接字符串: "
    set /p RAILWAY_REDIS_URL="Redis 连接字符串: "

    echo DATABASE_URL=!RAILWAY_PG_URL! > .env.cloud
    echo REDIS_URL=!RAILWAY_REDIS_URL! >> .env.cloud

    echo.
    echo ✅ 数据库配置已保存到 .env.cloud
    echo.

) else if "%DB_CHOICE%"=="3" (
    echo 已选择：其他云端数据库
    echo.
    echo 📝 请提供以下信息：
    echo.

    set /p CUSTOM_PG_URL="PostgreSQL 连接字符串: "
    set /p CUSTOM_REDIS_URL="Redis 连接字符串: "

    echo DATABASE_URL=!CUSTOM_PG_URL! > .env.cloud
    echo REDIS_URL=!CUSTOM_REDIS_URL! >> .env.cloud

    echo.
    echo ✅ 数据库配置已保存到 .env.cloud
    echo.

) else (
    echo ⏭️  跳过数据库配置
    echo.
    echo ⚠️  稍后请手动编辑 .env 文件，添加：
    echo     DATABASE_URL=postgresql://...
    echo     REDIS_URL=redis://...
    echo.
)

REM ============================================
REM 步骤 2: 合并环境变量
REM ============================================
echo [步骤 2/6] 准备环境变量...
echo.

if exist ".env.cloud" (
    echo 正在合并云端数据库配置到 .env...

    REM 复制 .env.example 到 .env（如果不存在）
    if not exist ".env" (
        copy .env.example .env >nul
    )

    REM 追加云端配置
    type .env.cloud >> .env

    echo ✅ 环境变量已准备就绪
) else (
    echo ⚠️  使用本地 .env 配置
)
echo.

REM ============================================
REM 步骤 3: 安装依赖
REM ============================================
echo [步骤 3/6] 安装项目依赖...
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
REM 步骤 4: 生成 Prisma Client
REM ============================================
echo [步骤 4/6] 生成 Prisma Client...
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
REM 步骤 5: 测试数据库连接（可选）
REM ============================================
echo [步骤 5/6] 测试数据库连接...
echo.

set /p TEST_DB="是否要测试数据库连接？(Y/N，默认 Y): "
if /i "%TEST_DB%"=="" set TEST_DB=Y

if /i "%TEST_DB%"=="Y" (
    echo 正在测试数据库连接...
    call pnpm --filter @ipeasy/db migrate:deploy
    if %errorlevel% neq 0 (
        echo ❌ 数据库连接失败
        echo.
        echo 可能的原因：
        echo   - 连接字符串错误
        echo   - 网络问题
        echo   - 数据库服务未启动
        echo.
        echo 请检查 .env 文件中的 DATABASE_URL 配置
        echo.
        pause
        exit /b 1
    ) else (
        echo ✅ 数据库连接成功，迁移已完成
    )
) else (
    echo ⏭️  跳过数据库连接测试
)
echo.

REM ============================================
REM 步骤 6: 准备部署
REM ============================================
echo [步骤 6/6] 准备 Zeabur 部署配置...
echo.

echo 正在检查 Git 仓库状态...
git status >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  当前目录不是 Git 仓库
    echo.
    echo 是否要初始化 Git 仓库？(Y/N)
    set /p INIT_GIT="请选择: "
    if /i "%INIT_GIT%"=="Y" (
        git init
        echo ✅ Git 仓库已初始化
    )
) else (
    echo ✅ Git 仓库已就绪
)
echo.

REM ============================================
REM 完成
REM ============================================
echo ========================================
echo   ✅ 云端部署准备完成！
echo ========================================
echo.
echo 📝 下一步操作：
echo.
echo 1. 启动本地开发服务（使用云端数据库）:
echo    终端 1: pnpm --filter @ipeasy/api dev
echo    终端 2: pnpm --filter @ipeasy/web dev
echo.
echo 2. 部署到 Zeabur:
echo    方式 A - 自动部署:
echo      bash scripts/deploy-zeabur.sh
echo.
echo    方式 B - 手动部署:
echo      a. 推送代码: git push origin main
echo      b. 在 Zeabur Dashboard 连接仓库
echo      c. 配置环境变量
echo      d. 部署
echo.
echo 3. 验证部署:
echo    bash scripts/health-check-zeabur.sh ^<api-url^> ^<web-url^>
echo.
echo ========================================
echo.
echo 📚 相关文档:
echo    - research/zeabur-deployment-guide.md
echo    - README-DEPLOYMENT.md
echo.
echo ========================================
echo.
pause
