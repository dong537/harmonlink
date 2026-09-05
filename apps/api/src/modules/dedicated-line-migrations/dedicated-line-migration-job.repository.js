"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineMigrationJobRepository = exports.MIGRATION_JOB_KINDS = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("../external-work/domain");
exports.MIGRATION_JOB_KINDS = [
    'VERIFY_DEDICATED_LINE_MIGRATION',
    'DELETE_DEDICATED_LINE_PROJECTION',
    'CLEANUP_DEDICATED_LINE_MIGRATION',
];
let DedicatedLineMigrationJobRepository = class DedicatedLineMigrationJobRepository {
    async enqueueRunnableJobs(limit = 20) {
        const migrations = await db_1.prisma.dedicated_line_migrations.findMany({
            where: {
                OR: [
                    { phase: 'VERIFY', status: 'ACTIVE' },
                    { phase: 'CLEANUP', status: { in: ['ACTIVE', 'CANCELLED'] } },
                ],
            },
            include: {
                nodes: { where: { role: 'TARGET' }, select: { projectionId: true } },
                projections: { select: { id: true, desiredVersion: true } },
            },
            orderBy: { updatedAt: 'asc' },
            take: limit,
        });
        let created = 0;
        for (const migration of migrations) {
            if (migration.phase === 'VERIFY') {
                created += await this.enqueueMigrationJob(migration, 'VERIFY_DEDICATED_LINE_MIGRATION', {
                    stage: migration.type === 'EXIT_ONLY' ? 'CUTOVER' : 'CANARY',
                });
                continue;
            }
            if (!migration.committedAt) {
                const targetProjectionIds = new Set(migration.nodes.map((node) => node.projectionId).filter((id) => Boolean(id)));
                for (const projection of migration.projections.filter((item) => targetProjectionIds.has(item.id))) {
                    created += await this.enqueueProjectionDeleteJob(migration, projection.id, projection.desiredVersion + 1);
                }
            }
            created += await this.enqueueMigrationJob(migration, 'CLEANUP_DEDICATED_LINE_MIGRATION', {});
        }
        return created;
    }
    async findQueued(limit = 20) {
        const now = new Date();
        return db_1.prisma.external_jobs.findMany({
            where: {
                kind: { in: [...exports.MIGRATION_JOB_KINDS] },
                status: { in: ['QUEUED', 'RETRYING'] },
                nextRunAt: { lte: now },
                OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
            },
            orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            select: { id: true },
        });
    }
    async claimRunnableJob(jobId, workerId, leaseMs = 60_000) {
        return db_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const claimed = await tx.external_jobs.updateMany({
                where: {
                    id: jobId,
                    kind: { in: [...exports.MIGRATION_JOB_KINDS] },
                    status: { in: ['QUEUED', 'RETRYING'] },
                    nextRunAt: { lte: now },
                    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
                },
                data: {
                    status: 'LEASED', attempt: { increment: 1 }, leaseOwner: workerId,
                    leaseExpiresAt: new Date(now.getTime() + leaseMs),
                },
            });
            if (claimed.count !== 1)
                return null;
            return tx.external_jobs.findUniqueOrThrow({ where: { id: jobId } });
        });
    }
    async recoverExpiredLeases() {
        return db_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const expired = await tx.external_jobs.findMany({
                where: { kind: { in: [...exports.MIGRATION_JOB_KINDS] }, status: 'LEASED', leaseExpiresAt: { lt: now } },
                select: { id: true, attempt: true, maxAttempts: true, aggregateType: true, aggregateId: true, payload: true },
            });
            let recovered = 0;
            const retryIds = expired.filter((job) => job.attempt < job.maxAttempts).map((job) => job.id);
            if (retryIds.length > 0) {
                const retried = await tx.external_jobs.updateMany({
                    where: { id: { in: retryIds }, status: 'LEASED', leaseExpiresAt: { lt: now } },
                    data: {
                        status: 'RETRYING', nextRunAt: now, leaseOwner: null, leaseExpiresAt: null,
                        lastErrorCode: 'MIGRATION_JOB_LEASE_EXPIRED', lastErrorDetail: { reasonKey: 'idempotent_migration_job_retry' },
                    },
                });
                recovered += retried.count;
            }
            for (const job of expired.filter((item) => item.attempt >= item.maxAttempts)) {
                const failed = await tx.external_jobs.updateMany({
                    where: { id: job.id, status: 'LEASED', leaseExpiresAt: { lt: now } },
                    data: {
                        status: 'FAILED', completedAt: now, leaseOwner: null, leaseExpiresAt: null,
                        lastErrorCode: 'MIGRATION_JOB_LEASE_ATTEMPTS_EXHAUSTED',
                        lastErrorDetail: { reasonKey: 'migration_job_lease_attempts_exhausted' },
                    },
                });
                if (failed.count !== 1)
                    continue;
                recovered += 1;
                const migrationId = migrationIdFromJob(job);
                if (migrationId)
                    await tx.dedicated_line_migrations.updateMany({
                        where: { id: migrationId, status: { in: ['ACTIVE', 'CANCELLED'] } },
                        data: {
                            status: 'NEEDS_OPERATOR', retryCount: { increment: 1 },
                            lastErrorCode: 'MIGRATION_JOB_LEASE_ATTEMPTS_EXHAUSTED',
                            lastErrorDetail: { reasonKey: 'migration_job_lease_attempts_exhausted' },
                        },
                    });
            }
            return recovered;
        });
    }
    async loadProjectionDeleteWork(job, workerId) {
        assertJobLease(job, workerId);
        if (job.kind !== 'DELETE_DEDICATED_LINE_PROJECTION' || job.aggregateType !== 'dedicated_line_projection') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_delete_job_aggregate_invalid', 409);
        }
        const activeApply = await db_1.prisma.external_jobs.count({
            where: { aggregateId: job.aggregateId, kind: 'APPLY_DEDICATED_LINE_PROJECTION', status: 'LEASED' },
        });
        if (activeApply > 0)
            return null;
        await db_1.prisma.external_jobs.updateMany({
            where: { aggregateId: job.aggregateId, kind: 'APPLY_DEDICATED_LINE_PROJECTION', status: { in: ['QUEUED', 'RETRYING'] } },
            data: {
                status: 'FAILED', completedAt: new Date(), lastErrorCode: 'PROJECTION_DELETE_SCHEDULED',
                lastErrorDetail: { reasonKey: 'projection_delete_scheduled' },
            },
        });
        const projection = await db_1.prisma.dedicated_line_projections.findFirst({
            where: { id: job.aggregateId, siteId: job.siteId },
            include: { node: true },
        });
        if (!projection)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'dedicated_line_projection_not_found', 404);
        if (projection.tenantId !== job.tenantId || projection.userId !== job.userId || projection.dedicatedLineId !== job.dedicatedLineId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'dedicated_line_projection_scope_violation', 403);
        }
        if (job.desiredVersion !== projection.desiredVersion + 1) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_delete_desired_version_invalid', 409);
        }
        return {
            projectionId: projection.id,
            projectionKey: projection.projectionKey,
            desiredVersion: job.desiredVersion,
            nodeBaseUrl: projection.node.baseUrl,
            nodeApiCredentialCiphertext: projection.node.apiCredentialCiphertext,
        };
    }
    async markCompleted(job, workerId) {
        const now = new Date();
        const updated = await db_1.prisma.external_jobs.updateMany({
            where: activeLeaseWhere(job, workerId, now),
            data: {
                status: 'COMPLETED', completedAt: now, leaseOwner: null, leaseExpiresAt: null,
                lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull,
            },
        });
        if (updated.count !== 1)
            staleMigrationLease();
    }
    async deferClaimed(job, workerId) {
        const now = new Date();
        const updated = await db_1.prisma.external_jobs.updateMany({
            where: activeLeaseWhere(job, workerId, now),
            data: {
                status: 'RETRYING', attempt: { decrement: 1 }, nextRunAt: new Date(now.getTime() + 5_000),
                leaseOwner: null, leaseExpiresAt: null,
            },
        });
        if (updated.count !== 1)
            staleMigrationLease();
    }
    async markFailed(job, workerId, code, detail, options) {
        return db_1.prisma.$transaction(async (tx) => {
            const current = await tx.external_jobs.findUnique({ where: { id: job.id } });
            if (!current)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_job_not_found', 404);
            assertJobLease(current, workerId, job.desiredVersion);
            const status = options.retry
                ? (current.attempt >= current.maxAttempts ? 'FAILED' : 'RETRYING')
                : 'NEEDS_OPERATOR';
            const now = new Date();
            const updated = await tx.external_jobs.updateMany({
                where: activeLeaseWhere(current, workerId, now),
                data: {
                    status,
                    nextRunAt: status === 'RETRYING' ? new Date(now.getTime() + retryDelayMs(current.attempt)) : current.nextRunAt,
                    completedAt: status === 'RETRYING' ? null : now,
                    leaseOwner: null, leaseExpiresAt: null, lastErrorCode: code,
                    lastErrorDetail: detail,
                },
            });
            if (updated.count !== 1)
                staleMigrationLease();
            if (status !== 'RETRYING') {
                const migrationId = migrationIdFromJob(current);
                if (migrationId)
                    await tx.dedicated_line_migrations.updateMany({
                        where: { id: migrationId, status: { in: ['ACTIVE', 'CANCELLED'] } },
                        data: { status: 'NEEDS_OPERATOR', lastErrorCode: code, lastErrorDetail: detail, retryCount: { increment: 1 } },
                    });
            }
            return status;
        });
    }
    async enqueueMigrationJob(migration, kind, payload) {
        const key = `${kind.toLowerCase()}:${migration.id}:v${migration.targetLineVersion}`;
        const result = await db_1.prisma.external_jobs.createMany({
            data: [{
                    siteId: migration.siteId, tenantId: migration.tenantId, userId: migration.userId,
                    dedicatedLineId: migration.dedicatedLineId, kind, aggregateType: 'dedicated_line_migration',
                    aggregateId: migration.id, desiredVersion: migration.targetLineVersion,
                    idempotencyKey: key, dedupeKey: key, payload: { migrationId: migration.id, ...payload },
                }],
            skipDuplicates: true,
        });
        return result.count;
    }
    async enqueueProjectionDeleteJob(migration, projectionId, desiredVersion) {
        const key = `delete_dedicated_line_projection:${migration.id}:${projectionId}:v${desiredVersion}`;
        const result = await db_1.prisma.external_jobs.createMany({
            data: [{
                    siteId: migration.siteId, tenantId: migration.tenantId, userId: migration.userId,
                    dedicatedLineId: migration.dedicatedLineId, kind: 'DELETE_DEDICATED_LINE_PROJECTION',
                    aggregateType: 'dedicated_line_projection', aggregateId: projectionId, desiredVersion,
                    idempotencyKey: key, dedupeKey: key, payload: { migrationId: migration.id },
                }],
            skipDuplicates: true,
        });
        return result.count;
    }
};
exports.DedicatedLineMigrationJobRepository = DedicatedLineMigrationJobRepository;
exports.DedicatedLineMigrationJobRepository = DedicatedLineMigrationJobRepository = __decorate([
    (0, common_1.Injectable)()
], DedicatedLineMigrationJobRepository);
function assertJobLease(job, workerId, desiredVersion = job.desiredVersion) {
    (0, domain_1.assertLeaseCompletion)(job, { workerId, desiredVersion, now: new Date() });
}
function activeLeaseWhere(job, workerId, now) {
    return { id: job.id, desiredVersion: job.desiredVersion, status: 'LEASED', leaseOwner: workerId, leaseExpiresAt: { gt: now } };
}
function staleMigrationLease() {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_job_lease_stale', 409);
}
function migrationIdFromJob(job) {
    if (job.aggregateType === 'dedicated_line_migration')
        return job.aggregateId;
    if (!job.payload || typeof job.payload !== 'object' || Array.isArray(job.payload))
        return null;
    const migrationId = job.payload['migrationId'];
    return typeof migrationId === 'string' && migrationId.trim() ? migrationId : null;
}
function retryDelayMs(attempt) {
    return Math.min(60_000, Math.max(1_000, 2 ** Math.min(attempt, 6) * 1_000));
}
//# sourceMappingURL=dedicated-line-migration-job.repository.js.map