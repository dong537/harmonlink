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
exports.ProcessDedicatedLineProjectionUseCase = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const build_managed_line_projection_request_1 = require("./build-managed-line-projection-request");
const dedicated_line_projection_repository_1 = require("./dedicated-line-projection.repository");
const domain_1 = require("./domain");
const managed_line_projection_adapter_1 = require("./managed-line-projection.adapter");
let ProcessDedicatedLineProjectionUseCase = class ProcessDedicatedLineProjectionUseCase {
    projections;
    adapter;
    config;
    constructor(projections, adapter, config) {
        this.projections = projections;
        this.adapter = adapter;
        this.config = config;
    }
    async execute(jobId, workerId = 'dedicated-line-projection-worker') {
        const job = await this.projections.claimRunnableJob(jobId, workerId);
        if (!job)
            return { status: 'NOOP', jobId };
        try {
            const work = await this.projections.loadClaimedWork(job, workerId);
            validateWork(work);
            const request = (0, build_managed_line_projection_request_1.buildManagedLineProjectionRequest)(work, this.config.get('APP_ENCRYPTION_KEY'));
            if ((0, domain_1.managedLineProjectionDesiredHash)(request) !== work.desiredHash) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'managed_line_projection_desired_hash_mismatch', 409);
            }
            const observed = await this.adapter.upsert({
                baseUrl: work.nodeBaseUrl,
                apiCredentialCiphertext: work.nodeApiCredentialCiphertext,
            }, work.projectionKey, request);
            if (observed.projectionKey !== work.projectionKey
                || observed.desiredVersion !== work.desiredVersion
                || observed.observedVersion !== work.desiredVersion
                || observed.status !== 'ACTIVE'
                || !observed.observedHash
                || observed.desiredHash !== observed.observedHash) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_projection_readback_mismatch', 502);
            }
            await this.projections.markReady(job, workerId, {
                projectionId: work.projectionId,
                observedVersion: observed.observedVersion,
                observedHash: observed.observedHash,
                nodeExternalId: observed.projectionKey,
            });
            return { status: 'COMPLETED', jobId: job.id, projectionId: work.projectionId, observedVersion: observed.observedVersion };
        }
        catch (error) {
            const code = error instanceof app_error_1.AppError ? error.code : error_codes_1.ErrorCode.INTERNAL_ERROR;
            const reasonKey = error instanceof app_error_1.AppError ? error.reasonKey : 'managed_line_projection_processing_failed';
            const retry = code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT || code === error_codes_1.ErrorCode.UPSTREAM_ERROR;
            const status = await this.projections.markFailed(job, workerId, String(code), { reasonKey }, { retry });
            if (status === 'NEEDS_OPERATOR')
                return { status, jobId: job.id, error: reasonKey };
            return { status, jobId: job.id, attempts: job.attempt };
        }
    }
};
exports.ProcessDedicatedLineProjectionUseCase = ProcessDedicatedLineProjectionUseCase;
exports.ProcessDedicatedLineProjectionUseCase = ProcessDedicatedLineProjectionUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dedicated_line_projection_repository_1.DedicatedLineProjectionRepository,
        managed_line_projection_adapter_1.ManagedLineProjectionAdapter,
        config_service_1.ConfigService])
], ProcessDedicatedLineProjectionUseCase);
function validateWork(work) {
    if (work.nodeStatus === 'DISABLED')
        invalid('control_node_disabled');
    if (!work.inboundIsActive)
        invalid('dedicated_line_inbound_inactive');
    if (work.inboundControlNodeId && work.inboundControlNodeId !== work.nodeId)
        invalid('dedicated_line_inbound_node_mismatch');
    const expectedExitStatus = work.migrationId && work.migrationTargetExit ? 'RESERVED' : 'ASSIGNED';
    if (work.exitStatus !== expectedExitStatus)
        invalid(expectedExitStatus === 'RESERVED' ? 'dedicated_line_migration_exit_not_reserved' : 'dedicated_line_exit_not_assigned');
    if (work.exitExpiresAt && work.exitExpiresAt.getTime() <= Date.now())
        invalid('dedicated_line_exit_expired');
    if (work.expiresAt && work.expiresAt.getTime() <= Date.now())
        invalid('dedicated_line_expired');
}
function invalid(reasonKey) {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, reasonKey, 500);
}
//# sourceMappingURL=process-dedicated-line-projection.use-case.js.map