# Cherry-pick 冲突解决报告

## 冲突概览

**提交**: `fff9393` - "fix: harden dedicated-line production delivery"  
**冲突类型统计**:
- DU (删除/修改) 冲突: 22 个文件
- UU (双方修改) 冲突: 14 个文件
- **总计**: 36 个冲突文件

## 根本原因分析

当前分支（master）**删除了整个 dedicated-line 迁移系统**，但 Railway 在生产环境中**强化并修复了这个系统**。

这是一个**严重的业务逻辑回退**：
- ❌ 当前分支移除了专线迁移功能
- ✅ Railway 保留并强化了专线迁移功能
- ⚠️ 这解释了为什么"还是没有一比一满足之前的业务逻辑"

## DU 冲突（22个）- 需要恢复的文件

### 专线迁移核心模块（16个文件）
```
apps/api/src/modules/dedicated-line-migrations/
├── cancel-migration.use-case.ts ⭐
├── cancel-migration.use-case.spec.ts (新增)
├── commit-migration.use-case.ts ⭐
├── commit-migration.use-case.spec.ts ⭐
├── create-migration.use-case.ts ⭐
├── create-migration.use-case.spec.ts ⭐
├── dedicated-line-migrations.controller.ts ⭐
├── dedicated-line-migrations.module.ts ⭐
├── domain.ts ⭐
├── domain.spec.ts ⭐
├── list-migrations.use-case.ts ⭐
├── migration-smoke.adapter.ts ⭐
├── migration-smoke.adapter.spec.ts (新增)
├── process-migration-cleanup.use-case.ts ⭐
├── process-migration-cleanup.use-case.spec.ts (新增)
├── process-migration-smoke.use-case.ts ⭐
└── process-migration-smoke.use-case.spec.ts ⭐
```

### 专线投影模块（3个文件）
```
apps/api/src/modules/dedicated-line-projections/
├── dedicated-line-projection.repository.ts
├── managed-line-projection.adapter.ts
└── managed-line-projection.adapter.spec.ts
```

### 专线交付模块（2个文件）
```
apps/api/src/modules/dedicated-lines/
├── delivery-route-import.use-case.ts
└── delivery-route-import.use-case.spec.ts
```

### 其他（3个文件）
```
apps/api/scripts/seed-line-skus.ts
apps/api/src/modules/catalog/sku-seed.spec.ts
apps/api/src/modules/providers/tests/nine-eight-five-socks-delivery.spec.ts
```

## UU 冲突（14个）- 需要合并的文件

### 配置文件（3个）⚠️ 关键
```
apps/api/src/common/config/config-guard.ts
apps/api/src/common/config/config-guard.spec.ts
apps/api/src/common/config/env.schema.ts
```

### Worker 配置（2个）
```
apps/api/src/worker.ts
apps/worker/src/main.ts
```

### 依赖配置（2个）
```
apps/api/package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

### Trellis 任务配置（4个）
```
.trellis/tasks/08-11-full-stack-audit-delivery/check.jsonl
.trellis/tasks/08-11-full-stack-audit-delivery/implement.jsonl
.trellis/tasks/08-11-full-stack-audit-delivery/task.json
```

### 其他（3个）
```
.env.example
apps/api/src/test-utils/integration-setup.ts
apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts
```

## 解决策略

### 策略 A：接受 Railway 的完整版本（推荐⭐）

**原理**：Railway 版本是生产验证过的，直接接受可以恢复完整的业务逻辑

```bash
# 1. 接受所有 DU 冲突（恢复被删除的文件）
git checkout --theirs apps/api/scripts/seed-line-skus.ts
git checkout --theirs apps/api/src/modules/catalog/sku-seed.spec.ts
git checkout --theirs apps/api/src/modules/dedicated-line-migrations/
git checkout --theirs apps/api/src/modules/dedicated-line-projections/
git checkout --theirs apps/api/src/modules/dedicated-lines/delivery-route-import.use-case.ts
git checkout --theirs apps/api/src/modules/dedicated-lines/delivery-route-import.use-case.spec.ts
git checkout --theirs apps/api/src/modules/providers/tests/nine-eight-five-socks-delivery.spec.ts

# 2. 接受 Railway 的配置文件版本
git checkout --theirs apps/api/src/common/config/config-guard.ts
git checkout --theirs apps/api/src/common/config/config-guard.spec.ts
git checkout --theirs apps/api/src/common/config/env.schema.ts
git checkout --theirs apps/api/src/worker.ts
git checkout --theirs apps/worker/src/main.ts
git checkout --theirs apps/api/package.json
git checkout --theirs .env.example

# 3. 接受 Railway 的测试配置
git checkout --theirs apps/api/src/test-utils/integration-setup.ts
git checkout --theirs apps/api/src/modules/providers/adapters/nine-eight-five.adapter.ts

# 4. 接受 Railway 的依赖锁文件
git checkout --theirs pnpm-lock.yaml
git checkout --theirs pnpm-workspace.yaml

# 5. 接受 Railway 的 Trellis 任务配置
git checkout --theirs .trellis/tasks/08-11-full-stack-audit-delivery/

# 6. 添加所有解决的文件
git add -A

# 7. 继续 cherry-pick
git cherry-pick --continue
```

**优点**：
- ✅ 快速（一次性解决所有冲突）
- ✅ 完整恢复生产验证的逻辑
- ✅ 避免手动合并错误

**缺点**：
- ⚠️ 会覆盖当前分支的一些改动（但这些改动导致了业务逻辑回退）

### 策略 B：手动逐个合并（不推荐，耗时 2-3 小时）

逐个打开冲突文件，手动合并内容。

## 建议

**立即执行策略 A**，原因：
1. 当前分支删除 dedicated-line 系统是错误的（导致业务逻辑不完整）
2. Railway 版本是生产验证过的
3. 你的目标是"一比一满足之前的业务逻辑"，直接接受 Railway 版本最直接

## 风险

执行策略 A 后，当前分支的以下改动会被覆盖：
- 当前的 config-guard.ts 中的自定义检查
- 当前的 worker.ts 配置
- 当前的依赖版本

但这些改动可能本身就是导致业务逻辑不完整的原因。

## 下一步

需要你确认：
1. **立即执行策略 A**（推荐）- 完全接受 Railway 版本
2. **中止 cherry-pick，重新评估** - 先分析为什么 dedicated-line 被删除
3. **手动合并**（不推荐）- 耗时且容易出错
