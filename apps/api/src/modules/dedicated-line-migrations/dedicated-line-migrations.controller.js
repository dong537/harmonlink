"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineMigrationsController = void 0;
const common_1 = require("@nestjs/common");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
const guards_1 = require("../../common/auth/guards");
const create_migration_use_case_1 = require("./create-migration.use-case");
const commit_migration_use_case_1 = require("./commit-migration.use-case");
const cancel_migration_use_case_1 = require("./cancel-migration.use-case");
const list_migrations_use_case_1 = require("./list-migrations.use-case");
const retry_migration_use_case_1 = require("./retry-migration.use-case");
const list_recommendations_use_case_1 = require("../dedicated-line-health/list-recommendations.use-case");
let DedicatedLineMigrationsController = class DedicatedLineMigrationsController {
    createMigration;
    commitMigration;
    cancelMigration;
    retryMigration;
    listMigrations;
    recommendations;
    constructor(createMigration, commitMigration, cancelMigration, retryMigration, listMigrations, recommendations) {
        this.createMigration = createMigration;
        this.commitMigration = commitMigration;
        this.cancelMigration = cancelMigration;
        this.retryMigration = retryMigration;
        this.listMigrations = listMigrations;
        this.recommendations = recommendations;
    }
    recommendationsList(ctx) {
        return this.recommendations.execute(ctx);
    }
    list(ctx, lineId) {
        return this.listMigrations.list(ctx, lineId);
    }
    get(ctx, migrationId) {
        return this.listMigrations.get(ctx, migrationId);
    }
    create(ctx, lineId, body) {
        return this.createMigration.execute(ctx, lineId, body);
    }
    commit(ctx, migrationId) {
        return this.commitMigration.execute(ctx, migrationId);
    }
    cancel(ctx, migrationId) {
        return this.cancelMigration.execute(ctx, migrationId);
    }
    retry(ctx, migrationId, body) {
        return this.retryMigration.execute(ctx, migrationId, body);
    }
};
exports.DedicatedLineMigrationsController = DedicatedLineMigrationsController;
__decorate([
    (0, common_1.Get)('recommendations'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "recommendationsList", null);
__decorate([
    (0, common_1.Get)(':id/migrations'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id/migrations/:migrationId'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('migrationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':id/migrations'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/migrations/:migrationId/commit'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('migrationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "commit", null);
__decorate([
    (0, common_1.Post)(':id/migrations/:migrationId/cancel'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('migrationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/migrations/:migrationId/retry'),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('migrationId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DedicatedLineMigrationsController.prototype, "retry", null);
exports.DedicatedLineMigrationsController = DedicatedLineMigrationsController = __decorate([
    (0, common_1.Controller)('admin/control-plane/lines'),
    (0, guards_1.RequireAuth)(),
    __metadata("design:paramtypes", [create_migration_use_case_1.CreateDedicatedLineMigrationUseCase, commit_migration_use_case_1.CommitDedicatedLineMigrationUseCase, cancel_migration_use_case_1.CancelDedicatedLineMigrationUseCase, retry_migration_use_case_1.RetryDedicatedLineMigrationUseCase, list_migrations_use_case_1.ListDedicatedLineMigrationsUseCase, list_recommendations_use_case_1.ListDedicatedLineRecommendationsUseCase])
], DedicatedLineMigrationsController);
//# sourceMappingURL=dedicated-line-migrations.controller.js.map