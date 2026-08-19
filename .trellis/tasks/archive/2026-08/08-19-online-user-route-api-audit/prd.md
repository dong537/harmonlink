# 继续修复线上用户路由与接口错误

## Goal

对 Zeabur 生产前端执行真实登录后的用户路由审计，消除前端调用不存在后端接口造成的 404、控制台错误和无效页面；页面只能使用当前 API 契约或明确重定向到受支持的用户页面。

## Requirements

* 修复 `/proxy/dynamic/channels` 的线上 404，不伪造动态渠道数据。
* 修复 `/billing/transactions`、`/billing/expenses` 的线上 404，优先映射到真实钱包流水接口或重定向到受支持的账单页面。
* 修复 `/account/event-log` 的线上 404；该接口仅允许管理员，普通用户不得调用管理员审计接口。
* 修复 `/notifications/settings` 的线上 404；当前后端没有设置接口，不得伪造保存成功。
* 保持已有充值、充值订单、工单、仪表盘跳转修复不回归。
* 重新部署到现有 Zeabur web service，并使用真实浏览器登录态复测用户路由、接口状态和控制台错误。

## Acceptance Criteria

* [x] 新建测试用户后，所有已登录用户路由最终页面无 4xx 网络请求。
* [x] 关键路由无 `console.error`、`Failed to load` 或资源 404。
* [x] 充值页、充值订单、工单新建/详情、仪表盘 CTA 可完成真实页面跳转。
* [x] 测试工单提交成功并能打开详情页，ID 保持字符串 UUID。
* [x] API `/health`、`/api/sites/current` 和静态资源返回 200。
* [x] 修改后的静态 bundle 可通过语法检查，部署后远端内容包含修复。

## Definition of Done

* 只提交本任务涉及的静态 bundle、测试/审计脚本和 Trellis 记录。
* 运行线上浏览器回归脚本，并记录路由、HTTP 4xx、控制台错误和关键 mutation 结果。
* 不提交生产密码、token、Cookie 或其他敏感输入。
* 明确记录无法覆盖的管理员认证范围及残余风险。

## Technical Approach

以后端 controller 路由为 Source of Truth。对普通用户不可用或不存在的功能使用现有受支持页面重定向；对有真实用户钱包流水接口的账单页面，在静态 API adapter 中做字段映射，避免添加假的后端接口。使用同一份线上浏览器审计脚本先复现 RED，再部署后重复 GREEN。

## Decision (ADR-lite)

**Context**: 生产 bundle 仍包含部分旧页面，它们请求 `/api/proxy/dynamic/channels`、`/api/billing/transactions`、`/api/event-logs/my`、`/api/notifications/settings`，而当前 API 没有这些普通用户接口。

**Decision**: 不在 API 层添加没有产品契约的假接口；路由重定向到真实用户页面，账单流水仅在确认钱包 ledger 契约后复用真实 endpoint。

**Consequences**: 普通用户不会看到未实现的设置/审计 surface；账单流水页面可能展示后端 ledger 的统一字段映射。管理员专属审计流程不在本次普通用户回归范围内。

## Out of Scope

* 不修改节点、专线开关、上游账号或真实支付渠道。
* 不新增管理员登录页面或生产认证凭据。
* 不伪造库存、充值、通知设置、审计日志或动态渠道数据。
* 不清理工作区中与本任务无关的已有改动。

## Technical Notes

* Zeabur web service: `6a7c372d2d4cb87f2ba3ad35`，environment: `6a786d805f062718bc7b8dfb`。
* Web: `https://365proxy-untitled.zeabur.app`；API: `https://365proxy-api.zeabur.app`。
* 已复现的生产失败：dynamic channels、billing transactions/expenses、account event-log、notifications settings。
* 后端现状：普通用户可用 wallet ledger、payments、notifications list；audit controller 仅管理员可用。
