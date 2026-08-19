# 合并线上与本地业务并发布

## 目标

恢复 Railway 测试环境中五月版本的 365Proxy 专线平台，将可恢复的线上版本与本地专线业务代码合并，并直接覆盖发布到 `dong537/demo`。线上前端必须保持五月版本，不做视觉、交互或业务改版。

## 用户与成功标准

- 用户：365Proxy 平台管理员和专线客户。
- Railway 测试前端、后端和原 PostgreSQL 数据能够重新运行。
- GitHub `master` 保存本地业务源码和从线上恢复的五月前端制品。
- 线上 `/proxy/dedicated/buy` 保持用户指定截图对应的五月版本。
- 恢复过程不写入或伪造业务数据，不泄露 Railway、数据库或 3x-ui 密钥。

## Source of Truth

- 线上五月前端：Railway `frontend` 服务当前成功部署的静态制品。
- 线上五月后端运行行为：Railway `backend` 历史部署镜像。
- 订单、专线部署和 3x-ui 节点状态：Railway `Postgres` 原卷中的数据库记录。
- 本地新增业务：`C:\Users\Lenovo\Desktop\365-dedicated-line-control-plane`，复制时保留现状，不擅自回退用户改动。
- 发布仓库：`https://github.com/dong537/demo` 的 `master`，按用户要求覆盖原有内容。

## 模块与数据流

- 前端：五月静态制品 -> Railway frontend -> 浏览器；本任务冻结制品，不重新设计或改写。
- 后端：Railway backend 历史镜像 -> `/api/v1` -> PostgreSQL / 3x-ui / 上游代理服务。
- 新代码仓库：本地专线控制平面源码 + 冻结前端制品 -> GitHub。
- 3x-ui：数据库节点配置 -> 后端 `XuiHttpClient` -> 节点面板；线路流量端口独立于控制面板。

## 接口契约

- 前端继续调用现有 `/api/v1` 契约，不用本地新 API 替换线上历史后端。
- 健康检查为 `/api/v1/health`，成功响应 HTTP 200。
- CORS 必须允许 `https://frontend-test-a8da.up.railway.app`。
- 数据库只做恢复和只读诊断；未经用户明确批准，不更新订单、部署或管理员记录。

## 已确认要求

- 直接覆盖 `dong537/demo` 原内容，不保留其旧项目。
- 合并本地和线上两套内容。
- 不修改前端。
- 恢复 `https://frontend-test-a8da.up.railway.app` 及对应后端、数据库。
- 能恢复的线上后端源码或构建产物应继续导出并纳入恢复材料。

## 验收标准

- [x] GitHub `master` 指向已验证的合并提交。
- [x] 冻结前端制品与线上五月制品哈希一致。
- [x] 前端专线购买路由返回 HTTP 200。
- [x] Railway PostgreSQL 原卷恢复并运行。
- [x] Railway 后端部署成功，健康检查返回 HTTP 200。
- [x] 前端来源的 CORS 预检通过。
- [x] 核对 Railway 后端容器是否还保留可导出的源码或 source map，并保存可恢复内容。
- [x] 记录 3x-ui 控制面异常的根因边界和现有有效订单影响。

## 风险与验证

- Railway 历史镜像可能只有编译产物，没有 TypeScript 源码；必须区分“完整源码”和“可运行构建产物”。
- 3x-ui 面板不可达会影响新下单、迁移和流量同步，但不等价于线路数据端口不可用。
- 历史过期部署的自动修复循环会制造日志风暴；在未确认业务语义前不直接更新数据库状态。
- 验证包括 Railway 部署状态、HTTP 健康检查、CORS、数据库只读查询、3x-ui TCP/HTTP/SSH 分层探测和 Git 远端提交核对。

## 明确不做

- 不重做、改版或重新构建五月前端。
- 不把住宅代理 UI 或业务重新加入专线平台前端。
- 不用新后端替换仍依赖旧 `/api/v1` 契约的线上后端。
- 不修改过期订单和部署状态来掩盖日志错误。
- 不将聊天中出现的密码、API Key、App Secret 或数据库连接信息提交到 Git。

## 决策记录

- 采用“历史运行镜像恢复 + 冻结前端制品 + 本地新业务源码并存”的恢复方式，因为 Railway 当前部署可恢复运行，但历史服务未连接 Git 仓库，无法假定 Railway 保存了原始 Git 历史。
- 线上继续运行历史后端，避免新旧 API 契约不兼容导致五月前端再次失效。
