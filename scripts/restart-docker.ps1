# 重启 Docker Desktop
# 管理员权限执行

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  重启 Docker Desktop" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ 需要管理员权限" -ForegroundColor Red
    Write-Host ""
    Write-Host "请以管理员身份运行此脚本：" -ForegroundColor Yellow
    Write-Host "  1. 右键点击 PowerShell" -ForegroundColor White
    Write-Host "  2. 选择 '以管理员身份运行'" -ForegroundColor White
    Write-Host "  3. 执行: .\scripts\restart-docker.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "[1/4] 停止所有 Docker 进程..." -ForegroundColor Yellow
Get-Process -Name "*docker*" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  停止: $($_.Name) (PID: $($_.Id))" -ForegroundColor Gray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "✅ Docker 进程已停止" -ForegroundColor Green
Write-Host ""

Write-Host "[2/4] 停止 Docker 服务..." -ForegroundColor Yellow
Stop-Service -Name "com.docker.service" -Force -ErrorAction SilentlyContinue
Write-Host "✅ Docker 服务已停止" -ForegroundColor Green
Write-Host ""

Write-Host "[3/4] 等待 5 秒..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "✅ 清理完成" -ForegroundColor Green
Write-Host ""

Write-Host "[4/4] 重新启动 Docker Desktop..." -ForegroundColor Yellow
$dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerPath) {
    Start-Process $dockerPath -Verb RunAs
    Write-Host "✅ Docker Desktop 启动命令已发送" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ 等待 Docker Desktop 完全启动（约 60-90 秒）..." -ForegroundColor Cyan
    Write-Host ""

    $maxWait = 120
    $elapsed = 0
    $checkInterval = 5

    while ($elapsed -lt $maxWait) {
        Start-Sleep -Seconds $checkInterval
        $elapsed += $checkInterval

        $service = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
        Write-Host "[$elapsed 秒] 检查..." -ForegroundColor Gray -NoNewline

        if ($service.Status -eq 'Running') {
            docker info 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " ✅ Docker 引擎就绪！" -ForegroundColor Green
                Write-Host ""
                Write-Host "========================================" -ForegroundColor Green
                Write-Host "  🎉 Docker Desktop 已成功启动！" -ForegroundColor Green
                Write-Host "========================================" -ForegroundColor Green
                Write-Host ""
                docker --version
                Write-Host ""
                Write-Host "现在可以运行: .\scripts\setup-complete.bat" -ForegroundColor Cyan
                Write-Host ""
                exit 0
            } else {
                Write-Host " 引擎初始化中..." -ForegroundColor Yellow
            }
        } else {
            Write-Host " 等待服务..." -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "⚠️  Docker 启动时间较长" -ForegroundColor Yellow
    Write-Host "请检查 Docker Desktop 窗口是否有错误提示" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ 未找到 Docker Desktop: $dockerPath" -ForegroundColor Red
    Write-Host ""
}
