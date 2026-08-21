@echo off
echo ========================================
echo   等待 Docker Desktop 启动...
echo ========================================
echo.

:CHECK_DOCKER
sc query "com.docker.service" | findstr "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    echo [%time%] Docker Desktop 尚未启动，等待中...
    timeout /t 5 /nobreak >nul
    goto CHECK_DOCKER
)

echo.
echo ✅ Docker Desktop 已启动！
echo.
echo 正在验证 Docker 引擎...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker 服务已启动，但引擎尚未就绪，继续等待...
    timeout /t 3 /nobreak >nul
    goto CHECK_DOCKER
)

echo ✅ Docker 引擎就绪！
echo.
echo 现在可以继续执行 start-local.bat
echo.
pause
