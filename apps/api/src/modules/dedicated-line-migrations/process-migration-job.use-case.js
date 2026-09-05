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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessMigrationJobUseCase = void 0;
const common_1 = require("@nestjs/common");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const managed_line_projection_adapter_1 = require("../dedicated-line-projections/managed-line-projection.adapter");
const dedicated_line_migration_job_repository_1 = require("./dedicated-line-migration-job.repository");
const process_migration_cleanup_use_case_1 = require("./process-migration-cleanup.use-case");
const process_migration_smoke_use_case_1 = require("./process-migration-smoke.use-case");
let ProcessMigrationJobUseCase = class ProcessMigrationJobUseCase {
    jobs;
    projectionAdapter;
    smoke;
    cleanup;
    constructor(jobs, projectionAdapter, smoke, cleanup) {
        this.jobs = jobs;
        this.projectionAdapter = projectionAdapter;
        this.smoke = smoke;
        this.cleanup = cleanup;
    }
    async execute(jobId, workerId = 'dedicated-line-migration-worker') {
        const job = await this.jobs.claimRunnableJob(jobId, workerId);
        if (!job)
            return { status: 'NOOP', jobId };
        try {
            if (job.kind === 'DELETE_DEDICATED_LINE_PROJECTION') {
                const work = await this.jobs.loadProjectionDeleteWork(job, workerId);
                if (!work)
                    return this.defer(job, workerId);
                await this.projectionAdapter.delete({ baseUrl: work.nodeBaseUrl, apiCredentialCiphertext: work.nodeApiCredentialCiphertext }, work.projectionKey, work.desiredVersion);
            }
            else if (job.kind === 'VERIFY_DEDICATED_LINE_MIGRATION') {
                const observation = await this.smoke.execute(job.aggregateId, smokeStage(job.payload));
                if (!observation.verified) {
                    const reasonKey = observation.failureType ?? 'migration_smoke_failed';
                    return this.fail(job, workerId, error_codes_1.ErrorCode.UPSTREAM_ERROR, {
                        reasonKey,
                    }, isRetryableSmokeFailure(reasonKey));
                }
            }
            else if (job.kind === 'CLEANUP_DEDICATED_LINE_MIGRATION') {
                const result = await this.cleanup.execute(job.aggregateId);
                if (result.status === 'WAITING')
                    return this.defer(job, workerId);
            }
            else {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_job_kind_invalid', 409);
            }
            await this.jobs.markCompleted(job, workerId);
            return { status: 'COMPLETED', jobId: job.id };
        }
        catch (error) {
            const code = error instanceof app_error_1.AppError ? error.code : error_codes_1.ErrorCode.INTERNAL_ERROR;
            const reasonKey = error instanceof app_error_1.AppError ? error.reasonKey : 'dedicated_line_migration_processing_failed';
            return this.fail(job, workerId, String(code), { reasonKey }, code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT || code === error_codes_1.ErrorCode.UPSTREAM_ERROR);
        }
    }
    async defer(job, workerId) {
        await this.jobs.deferClaimed(job, workerId);
        return { status: 'WAITING', jobId: job.id };
    }
    async fail(job, workerId, code, detail, retry) {
        const status = await this.jobs.markFailed(job, workerId, code, detail, { retry });
        if (status === 'NEEDS_OPERATOR')
            return { status, jobId: job.id, error: String(detail['reasonKey'] ?? code) };
        return { status, jobId: job.id, attempts: job.attempt };
    }
};
exports.ProcessMigrationJobUseCase = ProcessMigrationJobUseCase;
exports.ProcessMigrationJobUseCase = ProcessMigrationJobUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dedicated_line_migration_job_repository_1.DedicatedLineMigrationJobRepository,
        managed_line_projection_adapter_1.ManagedLineProjectionAdapter,
        process_migration_smoke_use_case_1.ProcessMigrationSmokeUseCase,
        process_migration_cleanup_use_case_1.ProcessMigrationCleanupUseCase])
], ProcessMigrationJobUseCase);
function isRetryableSmokeFailure(reasonKey) {
    return reasonKey === 'TIMEOUT'
        || reasonKey === 'NETWORK_ERROR'
        || reasonKey === 'HTTP_408'
        || reasonKey === 'HTTP_429'
        || /^HTTP_5\d\d$/.test(reasonKey);
}
function smokeStage(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_smoke_stage_invalid', 400);
    }
    const stage = payload['stage'];
    if (stage !== 'CANARY' && stage !== 'CUTOVER' && stage !== 'ROLLBACK') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_smoke_stage_invalid', 400);
    }
    return stage;
}
//# sourceMappingURL=process-migration-job.use-case.js.map