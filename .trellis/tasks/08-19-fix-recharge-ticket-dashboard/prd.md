# 修复充值、工单与仪表盘跳转

## Goal

修复线上用户端的充值订单导航、充值页面布局、工单提交和首页仪表盘跳转，使用户能完成充值申请、查看订单、提交工单并从仪表盘进入真实可用页面。

## Requirements

* 充值页面提供明确的充值订单入口并跳转到 `/billing/recharge-orders`。
* 充值页面减少无意义空白，保留金额选择、人工审核方式和提交申请主流程。
* 用户不再填写汇款凭证信息；申请幂等 ID 由系统自动生成并随请求发送。
* 工单表单使用现有后端接口提交，成功后进入工单详情或列表，失败显示可理解错误。
* 首页仪表盘中的充值、代理、订单等操作跳转到当前真实存在的用户端路由。

## Acceptance Criteria

* [ ] 充值页首屏可见充值订单入口，点击后 URL 为 `/billing/recharge-orders`。
* [ ] 充值页不显示汇款凭证 textarea，提交请求包含自动生成的 idempotencyKey，人工审核 POST 返回 201。
* [ ] 充值订单页加载 GET `/api/payments` 成功且无 4xx。
* [ ] 工单提交成功返回 2xx，页面跳转到详情或列表，网络无 4xx。
* [ ] 仪表盘主要 CTA 均能到达目标路由，浏览器无 console error。
* [ ] 前端构建产物语法检查、API 类型检查和线上 Playwright smoke 通过。

## Definition of Done

* 根因已通过代码和线上请求复现确认。
* 相关测试或可重复浏览器 smoke 已更新并通过。
* 前端部署到指定 Zeabur web 服务；不修改节点、专线开关或支付自动扣款配置。

## Out of Scope

* 不新增支付宝、微信或其他在线支付。
* 不提交真实购买、真实充值审核或上游资源申请。
* 不改动与本任务无关的专线、节点和生产数据库数据。

## Technical Notes

* 正确前端静态包：`.tmp/zeabur-frontend-correct`。
* 前端服务：`6a7c372d2d4cb87f2ba3ad35`；环境：`6a786d805f062718bc7b8dfb`。
* 充值 API：`POST /api/payments`，订单列表：`GET /api/payments`。
* 当前线上使用旧构建静态包，需同步修复对应 chunk 与路由映射。
