# 本地 Docker 构建验证

日期：2026-09-08（Asia/Shanghai）

## 环境

- 工作目录：`C:\Users\Lenovo\Desktop\365`
- Docker Desktop / Engine：28.1.1（builder `desktop-linux`）
- 基础镜像：`node:20-alpine`
- 构建上下文：仓库根目录；`.dockerignore` 排除本地依赖、生成物、`.tmp`、环境文件和 Trellis 状态。
- `apps/web/**` 未被本次验证修改。

## API 镜像

命令：

```powershell
docker build --no-cache --progress=plain -f apps/api/Dockerfile -t 365proxy-api:local-verify-20260908 .
```

结果：退出码 `0`。

关键构建步骤：

- 构建上下文约 `124.39kB`。
- `pnpm install --frozen-lockfile --prod=false` 成功（workspace 10 项目，811 个包）。
- `pnpm --filter @ipeasy/db generate` 成功，Prisma Client v6.2.1 生成。
- `pnpm --filter @ipeasy/api... build` 成功；DB 与 API TypeScript/Nest 构建均完成。
- 镜像导出成功，digest：`sha256:9230cc7bb084b66c99a8e4e97e5466a40292e9815760f7ae016d0e894b35994b`。

入口元数据与文件探针：

- 工作目录：`/app/apps/api`
- `CMD`: `["node","dist/main"]`
- `/app/apps/api/dist/main.js` 存在。
- `/app/packages/db/generated/client` 存在。
- 镜像大小：`795649306` bytes（约 759.5 MiB）。

## Worker 镜像

命令：

```powershell
docker build --no-cache --progress=plain -f Dockerfile -t 365proxy-worker:local-verify-20260908 .
```

结果：退出码 `0`。

关键构建步骤：

- 构建上下文约 `115.61kB`。
- `pnpm install --no-frozen-lockfile --prod=false` 成功（workspace 10 项目，811 个包）。
- `pnpm --filter @ipeasy/db generate` 成功，Prisma Client v6.2.1 生成。
- `pnpm --filter @ipeasy/worker... build` 成功；DB、API 依赖和 Worker TypeScript 构建均完成。
- 镜像导出成功，digest：`sha256:3843e51852c68e90313f9d6159792f0a0f557adf096060054dcff654be3e28e7`。

构建期间曾出现一次 npm registry `ms-2.1.3.tgz` `ECONNRESET`，pnpm 自动重试后下载完成；最终构建退出码为 `0`，没有残留错误。

入口元数据与文件探针：

- 工作目录：`/app/apps/worker`
- `CMD`: `["node","dist/worker/src/main.js"]`
- `/app/apps/worker/dist/worker/src/main.js` 存在。
- `/app/packages/db/generated/client` 存在。
- 镜像大小：`797180112` bytes（约 760.9 MiB）。

## 结论与边界

API 和 Worker 的 Docker 构建链路在当前工作树上均可重复完成，且入口产物存在。该验证只证明镜像构建和静态入口完整性；没有在本地启动服务（需要生产外部 DB/Redis/供应商凭据），也不代表 IPIPD 凭据或真实履约链路已通过生产门禁。
