# 当前技术设计索引

已确认的架构契约：`.trellis/tasks/08-11-full-stack-audit-delivery/design/active-active-dedicated-line-control-plane.md`

执行计划：`docs/superpowers/plans/2026-08-11-365proxy-full-delivery.md`

下方内容是确认主动-主动架构前形成的基础范围记录，仅保留为研究历史。它不能覆盖或替代上方的
完整设计与实施计划。

## 历史基础范围

本阶段只建立可独立验证的专线控制面基础，不把未完成 UI 暴露给用户。PostgreSQL 保存
`dedicated_lines` desired state、`residential_exits`、`control_nodes` 和每节点
`dedicated_line_projections` observed state；SKU 首批固定为 `SV`/`ZB`，家宽资源不进入可售池。
NY 转发规则不由平台写入，平台只保存管理员导入的 route/domain 快照和版本。3x-ui HTTP API 被
封装成窄 Adapter；worker 只负责 claim 和受控并发调度，业务状态变化留在后端 use case/repository。

现有静态代理订单和 `proxy_instances` 保持原行为，但专线目录明确禁用家宽/静态住宅售卖。
后续阶段通过明确订单/专线关联进入新域，不会用兼容读取或默认值让旧模型冒充专线。

关键验证：Prisma migration、状态机、site/tenant/user scope、lease owner + desired version 条件更新、
3x-ui Bearer auth 脱敏、read-after-write、受控并发和进程重启恢复。第一阶段只实现有官方
接口证据的 client projection；后续补齐用于住宅 SOCKS 出口的 outbound/route projection，并
单独实现 NY 导入校验，不建立 NY 写入 Adapter。
没有真实 3x-ui 凭据时只能完成 Adapter contract 测试，不能宣称线上专线已交付。
