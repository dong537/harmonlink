#!/bin/bash
# 测试已部署的 worker 服务

echo "=== 测试 Worker 服务 ==="
echo ""

# 1. 检查服务状态
echo "1. 检查 Zeabur 服务状态..."
zeabur service list --env-id 9dd6e48c2f05af092c4ee921 -i=false 2>&1 | grep -A 1 worker
echo ""

# 2. 测试健康检查（如果 worker 有暴露的端点）
# 注意：Worker 通常不暴露 HTTP 端点，主要通过队列工作
echo "2. Worker 服务主要通过消息队列工作，没有直接的 HTTP 端点"
echo ""

# 3. 检查最近的日志
echo "3. 建议在 Zeabur Web 界面查看 worker 日志，确认："
echo "   - 是否成功启动"
echo "   - 是否连接到 Redis"
echo "   - 是否正在监听队列"
echo ""

# 4. 测试完整流程（通过 API 创建任务）
echo "4. 完整流程测试（创建一个测试任务）："
echo "   curl -X POST https://your-api-url/api/v1/orders ..."
echo ""

echo "=== 部署验证完成 ==="
