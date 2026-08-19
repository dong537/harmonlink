# 修复线上认证接口并部署

## Goal

修复 Zeabur 上 Railway 前端静态包的注册/登录接口契约错位，并将修复后的 API 与前端重新部署到目标 Zeabur 项目。用户访问注册页后，合法表单应能命中真实站点上下文；非法空请求应返回可解释的业务错误，不得产生 500。

## What I Already Know

* 线上前端实际请求 `/api/v1/auth/register`，当前平台 API 契约是 `/api/auth/register`。
* 前端注册/登录请求不提交 `siteId`，平台 API 的认证用例要求站点上下文。
* 当前 API `POST /api/auth/login` 收到空对象时会因为 Prisma 查询使用 `undefined` 产生 500；带明确空字段时会返回 `AUTH_REQUIRED`。
* `GET /api/sites/current` 可通过公开 Host 解析当前站点，Zeabur 当前站点和租户数据可用。
* Zeabur `web` 服务由 `.tmp/zeabur-frontend-correct` 的静态镜像提供，不能把静态资源误当成本地 `apps/web` 源码。

## Requirements

* API 登录和注册在缺少 email/password/siteId 时先做显式校验，返回统一业务错误，不访问 Prisma。
* API 允许公开认证请求通过 Host 解析当前站点；显式 `siteId` 仍优先并保持现有测试契约。
* 前端静态包使用 Zeabur API 的 `/api` 契约，注册/登录自动读取 `/api/sites/current` 的站点 ID，并兼容平台 envelope/token 字段。
* 保留现有前端视觉、路由和非认证页面；本任务不重写旧版专线业务 API。
* 重新部署 `api` 和 `web` 到项目 `untitled`，不修改节点、数据库数据、充值、订单或专线执行开关。

## Acceptance Criteria

* [ ] API 单测覆盖空登录、空注册和 Host 站点解析。
* [ ] API typecheck/lint/相关测试通过。
* [ ] Zeabur `/health`、`/ready` 返回 200，DB/Redis ready 检查为 ok。
* [ ] 线上注册页提交合规的合成测试账号时不再返回 `/api/v1/auth/register` 404；请求包含有效站点上下文。
* [ ] 线上空登录请求不再返回 500。
* [ ] 前端关键路由及静态资源无 404、浏览器控制台无错误。
* [ ] 不输出或提交任何密码、token、API key。

## Definition of Done

* 代码、部署配置和生成静态包的变更可追溯。
* 通过匹配风险的单测、typecheck、lint、构建和线上 smoke test。
* 明确记录未覆盖的真实账号认证/订单流程及回滚路径。

## Technical Approach

1. 在 `LoginUseCase`/认证边界增加显式输入校验，并在认证控制器中复用 `SitesRepository.resolvePublicContext` 解析 Host 站点。
2. 为静态 Railway bundle 增加可重复的认证契约转换：API base `/api`、成功 envelope 解包、token 别名和站点上下文注入。
3. 使用现有 Zeabur service IDs 发布 API，再发布静态 web 镜像；轮询部署状态后做线上验证。

## Out Of Scope

* 不迁移或重写旧版前端所有 `/api/v1` 业务接口。
* 不创建真实用户订单、充值、专线、节点或上游账号。
* 不删除服务，不操作不存在的 `webv2`。

## Technical Notes

* API source: `apps/api/src/modules/auth`, `apps/api/src/modules/sites`。
* Frontend artifact: `.tmp/zeabur-frontend-correct`，来源为用户指定 Railway URL。
* Zeabur target: project `6a786d80e4a69d66638d62e1`, env `6a786d805f062718bc7b8dfb`, api service `6a7c0cb82d4cb87f2ba391e1`, web service `6a7c372d2d4cb87f2ba3ad35`。
