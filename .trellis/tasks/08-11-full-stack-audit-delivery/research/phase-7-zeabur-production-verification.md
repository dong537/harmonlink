# Zeabur 生产验证记录

## 2026-08-13 线上继续验证

- Zeabur 项目 `untitled` 的 `openui`、`api`、`worker`、`web`、`postgresql`、`redis` 服务均为 `RUNNING`。
- Web 临时转发验证：`/healthz` 返回 200，首页返回 200；未认证请求到目录、专线列表和价格接口返回 401。验证结束后 Web 临时转发已关闭。
- DNS/TCP：`test-sv-1.yisukj.top` 与 `test-zb-1.yisukj.top` 解析到 `14.116.138.238`；该地址的 60701/60702 端口可建立 TCP 连接。TCP 可达不等同于 VLESS/VMess/mixed 协议握手成功。

## OpenUI GeoIP 根因与修复

- 旧部署虽然显示 `RUNNING`，但运行日志持续报 `/app/bin/geoip.dat` 不存在，Xray 每 2 秒退出；容器内仅留下部分 RU 规则文件。
- 根因：`DockerInit.sh` 下载失败后没有 `set -e`，最后的 `cd` 覆盖失败退出码，导致下载不完整仍构建并发布镜像。构建日志可见 GitHub 下载出现 `curl: (56) Connection died`。
- 修复：`DockerInit.sh` 增加 `set -eu`、`curl --retry 5 --retry-all-errors`、连接/总时长限制，以及六个规则文件的 `test -s` 完整性校验；发布校验脚本增加相应断言。
- OpenUI 部署 `6a7cbc72408580a2d37ec80e` 已成功。容器内六个规则文件均为非空文件；运行日志显示 `Xray 26.5.9 started` 和 `Web server running HTTP on [::]:8080`。
- OpenUI 临时转发首页返回 200；`/healthz` 返回 404，表示 OpenUI 没有该路由，不作为健康失败。OpenUI 临时转发已关闭。

## 生产闸门

- 真实专线下单、3x-ui 投影、供应商 fulfillment/inventory allowlist、Bark 通知仍保持关闭。
- 当前尚未执行真实下单/协议握手：缺少经确认的生产 SKU 价格、供应商生产凭据、3x-ui 节点/API 信息和 NY 面板线路快照；不能把 TCP 可达性冒充完整链路成功。
