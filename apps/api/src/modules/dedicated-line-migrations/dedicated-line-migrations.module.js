"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineMigrationsModule = void 0;
const common_1 = require("@nestjs/common");
const create_migration_use_case_1 = require("./create-migration.use-case");
const dedicated_line_migrations_controller_1 = require("./dedicated-line-migrations.controller");
const migration_smoke_adapter_1 = require("./migration-smoke.adapter");
const process_migration_smoke_use_case_1 = require("./process-migration-smoke.use-case");
const commit_migration_use_case_1 = require("./commit-migration.use-case");
const cancel_migration_use_case_1 = require("./cancel-migration.use-case");
const process_migration_cleanup_use_case_1 = require("./process-migration-cleanup.use-case");
const list_migrations_use_case_1 = require("./list-migrations.use-case");
const dedicated_line_health_module_1 = require("../dedicated-line-health/dedicated-line-health.module");
const config_service_1 = require("../../common/config/config.service");
const dedicated_line_projections_module_1 = require("../dedicated-line-projections/dedicated-line-projections.module");
const dedicated_line_migration_job_repository_1 = require("./dedicated-line-migration-job.repository");
const process_migration_job_use_case_1 = require("./process-migration-job.use-case");
const retry_migration_use_case_1 = require("./retry-migration.use-case");
let DedicatedLineMigrationsModule = class DedicatedLineMigrationsModule {
};
exports.DedicatedLineMigrationsModule = DedicatedLineMigrationsModule;
exports.DedicatedLineMigrationsModule = DedicatedLineMigrationsModule = __decorate([
    (0, common_1.Module)({ imports: [dedicated_line_health_module_1.DedicatedLineHealthModule, dedicated_line_projections_module_1.DedicatedLineProjectionsModule], controllers: [dedicated_line_migrations_controller_1.DedicatedLineMigrationsController], providers: [config_service_1.ConfigService, { provide: 'MIGRATION_SMOKE_FETCH', useValue: fetch }, create_migration_use_case_1.CreateDedicatedLineMigrationUseCase, migration_smoke_adapter_1.MigrationSmokeAdapter, dedicated_line_migration_job_repository_1.DedicatedLineMigrationJobRepository, process_migration_job_use_case_1.ProcessMigrationJobUseCase, process_migration_smoke_use_case_1.ProcessMigrationSmokeUseCase, commit_migration_use_case_1.CommitDedicatedLineMigrationUseCase, cancel_migration_use_case_1.CancelDedicatedLineMigrationUseCase, retry_migration_use_case_1.RetryDedicatedLineMigrationUseCase, process_migration_cleanup_use_case_1.ProcessMigrationCleanupUseCase, list_migrations_use_case_1.ListDedicatedLineMigrationsUseCase], exports: [create_migration_use_case_1.CreateDedicatedLineMigrationUseCase, dedicated_line_migration_job_repository_1.DedicatedLineMigrationJobRepository, process_migration_job_use_case_1.ProcessMigrationJobUseCase, process_migration_smoke_use_case_1.ProcessMigrationSmokeUseCase, commit_migration_use_case_1.CommitDedicatedLineMigrationUseCase, cancel_migration_use_case_1.CancelDedicatedLineMigrationUseCase, retry_migration_use_case_1.RetryDedicatedLineMigrationUseCase, process_migration_cleanup_use_case_1.ProcessMigrationCleanupUseCase, list_migrations_use_case_1.ListDedicatedLineMigrationsUseCase] })
], DedicatedLineMigrationsModule);
//# sourceMappingURL=dedicated-line-migrations.module.js.map