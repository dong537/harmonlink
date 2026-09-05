"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryDedicatedLineMigrationUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const auth_context_1 = require("../../common/auth/auth-context");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let RetryDedicatedLineMigrationUseCase = class RetryDedicatedLineMigrationUseCase {
    async execute(ctx, migrationId, body) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        const reason = retryReason(body);
        return db_1.prisma.$transaction(async (tx) => {
            const migration = await tx.dedicated_line_migrations.findFirst({
                where: { id: migrationId, siteId: ctx.siteId },
            });
            if (!migration)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_not_found', 404);
            if (migration.status !== 'NEEDS_OPERATOR') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_retry_not_required', 409);
            }
            if (migration.phase === 'ROLLBACK') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_rollback_route_required', 422);
            }
            if (!['PREPARE', 'VERIFY', 'CLEANUP'].includes(migration.phase)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_retry_phase_invalid', 422);
            }
            const candidates = await tx.external_jobs.findMany({
                where: {
                    dedicatedLineId: migration.dedicatedLineId,
                    status: { in: ['FAILED', 'NEEDS_OPERATOR'] },
                    kind: { in: [
                            'APPLY_DEDICATED_LINE_PROJECTION',
                            'VERIFY_DEDICATED_LINE_MIGRATION',
                            'DELETE_DEDICATED_LINE_PROJECTION',
                            'CLEANUP_DEDICATED_LINE_MIGRATION',
                        ] },
                },
                select: { id: true, kind: true, aggregateType: true, aggregateId: true, payload: true },
            });
            const retryableKinds = migrationRetryableKinds(migration.phase, Boolean(migration.committedAt));
            const owned = candidates.filter((job) => retryableKinds.has(job.kind) && migrationIdFromJob(job) === migration.id);
            if (owned.length === 0) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_failed_job_not_found', 404);
            }
            const jobIds = owned.map((job) => job.id);
            const requeued = await tx.external_jobs.updateMany({
                where: { id: { in: jobIds }, status: { in: ['FAILED', 'NEEDS_OPERATOR'] } },
                data: {
                    status: 'QUEUED', attempt: 0, nextRunAt: new Date(), leaseOwner: null, leaseExpiresAt: null,
                    completedAt: null, lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull,
                },
            });
            if (requeued.count !== jobIds.length) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_retry_job_conflict', 409);
            }
            const projectionIds = owned
                .filter((job) => job.kind === 'APPLY_DEDICATED_LINE_PROJECTION' && job.aggregateType === 'dedicated_line_projection')
                .map((job) => job.aggregateId);
            if (projectionIds.length > 0)
                await tx.dedicated_line_projections.updateMany({
                    where: { id: { in: projectionIds }, dedicatedLineId: migration.dedicatedLineId },
                    data: { status: 'PENDING', lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull },
                });
            if (migration.phase === 'CLEANUP' && migration.committedAt)
                await tx.dedicated_lines.updateMany({
                    where: { id: migration.dedicatedLineId, activeMigrationId: migration.id, status: 'FAILED' },
                    data: { status: 'PROVISIONING' },
                });
            const retryStatus = migration.phase === 'CLEANUP' && !migration.committedAt ? 'CANCELLED' : 'ACTIVE';
            await tx.dedicated_line_migrations.update({
                where: { id: migration.id },
                data: { status: retryStatus, lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull },
            });
            await tx.audit_logs.create({
                data: {
                    siteId: migration.siteId, tenantId: migration.tenantId,
                    actorType: ctx.ownerType === 'SYSTEM' ? 'SYSTEM' : 'ADMIN_USER', actorId: ctx.ownerId,
                    targetType: 'dedicated_line_migration', targetId: migration.id,
                    action: 'dedicated_line.migration.retry', reason, requestId: ctx.requestId,
                    meta: { phase: migration.phase, requeuedJobIds: jobIds },
                },
            });
            return { migrationId: migration.id, phase: migration.phase, status: retryStatus, requeuedJobs: requeued.count };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
};
exports.RetryDedicatedLineMigrationUseCase = RetryDedicatedLineMigrationUseCase;
exports.RetryDedicatedLineMigrationUseCase = RetryDedicatedLineMigrationUseCase = __decorate([
    (0, common_1.Injectable)()
], RetryDedicatedLineMigrationUseCase);
function migrationRetryableKinds(phase, committed) {
    if (phase === 'PREPARE')
        return new Set(['APPLY_DEDICATED_LINE_PROJECTION']);
    if (phase === 'VERIFY')
        return new Set(['VERIFY_DEDICATED_LINE_MIGRATION']);
    if (phase === 'CLEANUP' && committed)
        return new Set([
            'APPLY_DEDICATED_LINE_PROJECTION',
            'DELETE_DEDICATED_LINE_PROJECTION',
            'CLEANUP_DEDICATED_LINE_MIGRATION',
        ]);
    return new Set(['DELETE_DEDICATED_LINE_PROJECTION', 'CLEANUP_DEDICATED_LINE_MIGRATION']);
}
function migrationIdFromJob(job) {
    if (job.aggregateType === 'dedicated_line_migration')
        return job.aggregateId;
    if (!job.payload || typeof job.payload !== 'object' || Array.isArray(job.payload))
        return null;
    const value = job.payload['migrationId'];
    return typeof value === 'string' && value.trim() ? value : null;
}
function retryReason(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_retry_body_invalid', 400);
    }
    const value = body['reason'];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 256) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_retry_reason_required', 400);
    }
    return value.trim();
}
//# sourceMappingURL=retry-migration.use-case.js.map