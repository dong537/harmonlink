"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineProjectionRepository = exports.DEDICATED_LINE_PROJECTION_JOB_KIND = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("../external-work/domain");
const domain_2 = require("../dedicated-line-migrations/domain");
exports.DEDICATED_LINE_PROJECTION_JOB_KIND = 'APPLY_DEDICATED_LINE_PROJECTION';
let DedicatedLineProjectionRepository = class DedicatedLineProjectionRepository {
    async findQueued(limit = 20) {
        const now = new Date();
        return db_1.prisma.external_jobs.findMany({
            where: {
                kind: exports.DEDICATED_LINE_PROJECTION_JOB_KIND,
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
            const candidate = await tx.external_jobs.findFirst({
                where: { id: jobId, kind: exports.DEDICATED_LINE_PROJECTION_JOB_KIND },
                select: { aggregateId: true },
            });
            if (!candidate)
                return null;
            const deleteScheduled = await tx.external_jobs.count({
                where: { aggregateId: candidate.aggregateId, kind: 'DELETE_DEDICATED_LINE_PROJECTION' },
            });
            if (deleteScheduled > 0) {
                await tx.external_jobs.updateMany({
                    where: { id: jobId, kind: exports.DEDICATED_LINE_PROJECTION_JOB_KIND, status: { in: ['QUEUED', 'RETRYING'] } },
                    data: {
                        status: 'FAILED', completedAt: now, lastErrorCode: 'PROJECTION_DELETE_SCHEDULED',
                        lastErrorDetail: { reasonKey: 'projection_delete_scheduled' },
                    },
                });
                return null;
            }
            const claimed = await tx.external_jobs.updateMany({
                where: {
                    id: jobId,
                    kind: exports.DEDICATED_LINE_PROJECTION_JOB_KIND,
                    status: { in: ['QUEUED', 'RETRYING'] },
                    nextRunAt: { lte: now },
                    OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
                },
                data: {
                    status: 'LEASED',
                    attempt: { increment: 1 },
                    leaseOwner: workerId,
                    leaseExpiresAt: new Date(now.getTime() + leaseMs),
                },
            });
            if (claimed.count !== 1)
                return null;
            const job = await tx.external_jobs.findUniqueOrThrow({ where: { id: jobId } });
            await tx.dedicated_line_projections.updateMany({
                where: { id: job.aggregateId, desiredVersion: job.desiredVersion },
                data: { status: 'APPLYING', lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull },
            });
            return job;
        });
    }
    async recoverExpiredLeases() {
        return db_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const expired = await tx.external_jobs.findMany({
                where: {
                    kind: exports.DEDICATED_LINE_PROJECTION_JOB_KIND,
                    status: 'LEASED',
                    leaseExpiresAt: { lt: now },
                },
                select: { id: true, aggregateId: true, attempt: true, maxAttempts: true, payload: true },
            });
            if (expired.length === 0)
                return 0;
            let recovered = 0;
            for (const job of expired) {
                const terminal = job.attempt >= job.maxAttempts;
                const result = await tx.external_jobs.updateMany({
                    where: { id: job.id, status: 'LEASED', leaseExpiresAt: { lt: now } },
                    data: {
                        status: terminal ? 'FAILED' : 'RETRYING', nextRunAt: now, completedAt: terminal ? now : null,
                        leaseOwner: null, leaseExpiresAt: null,
                        lastErrorCode: terminal ? 'PROJECTION_LEASE_ATTEMPTS_EXHAUSTED' : 'PROJECTION_LEASE_EXPIRED',
                        lastErrorDetail: { reasonKey: terminal ? 'projection_lease_attempts_exhausted' : 'idempotent_projection_retry' },
                    },
                });
                if (result.count !== 1)
                    continue;
                recovered += 1;
                await tx.dedicated_line_projections.updateMany({
                    where: { id: job.aggregateId, status: 'APPLYING' },
                    data: {
                        status: 'FAILED', retryCount: { increment: 1 },
                        lastErrorCode: terminal ? 'PROJECTION_LEASE_ATTEMPTS_EXHAUSTED' : 'PROJECTION_LEASE_EXPIRED',
                        lastErrorDetail: { reasonKey: terminal ? 'projection_lease_attempts_exhausted' : 'idempotent_projection_retry' },
                    },
                });
                const migrationId = migrationIdFromPayload(job.payload);
                if (terminal && migrationId)
                    await tx.dedicated_line_migrations.updateMany({
                        where: { id: migrationId, status: { in: ['ACTIVE', 'CANCELLED'] } },
                        data: {
                            status: 'NEEDS_OPERATOR', retryCount: { increment: 1 },
                            lastErrorCode: 'PROJECTION_LEASE_ATTEMPTS_EXHAUSTED',
                            lastErrorDetail: { reasonKey: 'projection_lease_attempts_exhausted' },
                        },
                    });
            }
            return recovered;
        });
    }
    async loadClaimedWork(job, workerId) {
        assertLease(job, workerId);
        if (job.kind !== exports.DEDICATED_LINE_PROJECTION_JOB_KIND || job.aggregateType !== 'dedicated_line_projection') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'projection_job_aggregate_invalid', 409);
        }
        const projection = await db_1.prisma.dedicated_line_projections.findFirst({
            where: { id: job.aggregateId, siteId: job.siteId, desiredVersion: job.desiredVersion },
            include: {
                node: true,
                dedicatedLine: {
                    include: {
                        inboundProfile: true,
                        exitAssignment: { include: { residentialExit: true } },
                    },
                },
                migration: { include: { targetExit: true } },
            },
        });
        if (!projection)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'dedicated_line_projection_not_found', 404);
        const line = projection.dedicatedLine;
        if (job.dedicatedLineId !== line.id
            || job.tenantId !== line.tenantId
            || job.userId !== line.userId
            || projection.tenantId !== line.tenantId
            || projection.userId !== line.userId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'dedicated_line_projection_scope_violation', 403);
        }
        const assignment = line.exitAssignment;
        const migration = projection.migration;
        const migrationTarget = migration?.targetExit;
        if (projection.migrationId && !migration) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_migration_missing', 500);
        }
        if (migration && migration.type !== 'NODE_ONLY' && !migrationTarget) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_migration_target_exit_missing', 500);
        }
        if (!migrationTarget && (!assignment || assignment.status !== 'ACTIVE')) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_exit_assignment_missing', 500);
        }
        const exit = migrationTarget ?? assignment.residentialExit;
        return {
            projectionId: projection.id,
            projectionKey: projection.projectionKey,
            desiredVersion: projection.desiredVersion,
            desiredHash: projection.desiredHash,
            nodeId: projection.nodeId,
            nodeStatus: projection.node.status,
            nodeBaseUrl: projection.node.baseUrl,
            nodeApiCredentialCiphertext: projection.node.apiCredentialCiphertext,
            inboundTag: line.inboundProfile.inboundTag,
            inboundIsActive: line.inboundProfile.isActive,
            inboundControlNodeId: line.inboundProfile.controlNodeId,
            lineStatus: line.status,
            protocol: line.protocol,
            clientEmail: line.clientEmail,
            clientIdentityCiphertext: line.clientIdentityCiphertext,
            expiresAt: line.expiresAt,
            quotaBytes: line.quotaBytes,
            uplinkLimitBps: line.uplinkLimitBps,
            downlinkLimitBps: line.downlinkLimitBps,
            maxConnections: line.maxConnections,
            ipLimit: line.ipLimit,
            migrationId: projection.migrationId,
            migrationTargetExit: Boolean(migrationTarget),
            exitStatus: exit.status,
            exitCountryCode: exit.countryCode,
            exitExpiresAt: exit.expiresAt,
            endpointCiphertext: exit.endpointCiphertext,
            credentialCiphertext: exit.credentialCiphertext,
        };
    }
    async markReady(job, workerId, observed) {
        await db_1.prisma.$transaction(async (tx) => {
            const now = new Date();
            const completed = await tx.external_jobs.updateMany({
                where: activeProjectionLeaseWhere(job, workerId, now),
                data: {
                    status: 'COMPLETED', completedAt: now, leaseOwner: null, leaseExpiresAt: null,
                    lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull,
                },
            });
            if (completed.count !== 1)
                staleProjectionLease();
            const deleteScheduled = await tx.external_jobs.count({
                where: { aggregateId: job.aggregateId, kind: 'DELETE_DEDICATED_LINE_PROJECTION' },
            });
            if (deleteScheduled > 0) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'projection_delete_scheduled', 409);
            }
            if (job.aggregateId !== observed.projectionId) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'projection_job_aggregate_mismatch', 409);
            }
            const updated = await tx.dedicated_line_projections.updateMany({
                where: { id: observed.projectionId, desiredVersion: job.desiredVersion },
                data: {
                    status: 'READY', observedVersion: observed.observedVersion, observedHash: observed.observedHash,
                    nodeExternalId: observed.nodeExternalId, lastErrorCode: null, lastErrorDetail: client_1.Prisma.JsonNull,
                    lastAppliedAt: now, lastObservedAt: now,
                },
            });
            if (updated.count !== 1)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'projection_desired_version_stale', 409);
            await updateLineReadiness(tx, job.dedicatedLineId);
            await advanceMigrationTargetReadiness(tx, migrationIdFromPayload(job.payload));
        });
    }
    async markFailed(job, workerId, code, detail, options) {
        return db_1.prisma.$transaction(async (tx) => {
            const current = await tx.external_jobs.findUnique({ where: { id: job.id } });
            if (!current)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'projection_job_not_found', 404);
            assertLease(current, workerId, job.desiredVersion);
            const status = options.retry
                ? (current.attempt >= current.maxAttempts ? 'FAILED' : 'RETRYING')
                : 'NEEDS_OPERATOR';
            const now = new Date();
            const failed = await tx.external_jobs.updateMany({
                where: activeProjectionLeaseWhere(current, workerId, now),
                data: {
                    status,
                    nextRunAt: status === 'RETRYING' ? new Date(now.getTime() + retryDelayMs(current.attempt)) : current.nextRunAt,
                    completedAt: status === 'RETRYING' ? null : now,
                    leaseOwner: null, leaseExpiresAt: null, lastErrorCode: code,
                    lastErrorDetail: detail,
                },
            });
            if (failed.count !== 1)
                staleProjectionLease();
            await tx.dedicated_line_projections.updateMany({
                where: { id: current.aggregateId, desiredVersion: current.desiredVersion },
                data: {
                    status: 'FAILED', retryCount: { increment: 1 }, lastErrorCode: code,
                    lastErrorDetail: detail,
                },
            });
            if (status !== 'RETRYING') {
                const migrationId = migrationIdFromPayload(current.payload);
                if (migrationId)
                    await tx.dedicated_line_migrations.updateMany({
                        where: { id: migrationId, status: { in: ['ACTIVE', 'CANCELLED'] } },
                        data: { status: 'NEEDS_OPERATOR', retryCount: { increment: 1 }, lastErrorCode: code, lastErrorDetail: detail },
                    });
                await updateLineReadiness(tx, current.dedicatedLineId, true);
            }
            return status;
        });
    }
};
exports.DedicatedLineProjectionRepository = DedicatedLineProjectionRepository;
exports.DedicatedLineProjectionRepository = DedicatedLineProjectionRepository = __decorate([
    (0, common_1.Injectable)()
], DedicatedLineProjectionRepository);
function assertLease(job, workerId, desiredVersion = job.desiredVersion) {
    (0, domain_1.assertLeaseCompletion)(job, { workerId, desiredVersion, now: new Date() });
}
function activeProjectionLeaseWhere(job, workerId, now) {
    return { id: job.id, desiredVersion: job.desiredVersion, status: 'LEASED', leaseOwner: workerId, leaseExpiresAt: { gt: now } };
}
function staleProjectionLease() {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'projection_job_lease_stale', 409);
}
async function updateLineReadiness(tx, dedicatedLineId, terminalFailure = false) {
    if (!dedicatedLineId)
        return;
    const line = await tx.dedicated_lines.findUnique({
        where: { id: dedicatedLineId },
        include: { placement: true, projections: { where: { migrationId: null }, select: { status: true, observedVersion: true, desiredVersion: true, migrationId: true } } },
    });
    if (!line?.placement || !['PROVISIONING', 'ACTIVE', 'DEGRADED'].includes(line.status))
        return;
    const ready = line.projections.filter((projection) => projection.desiredVersion === line.desiredVersion
        && projection.status === 'READY'
        && projection.observedVersion === projection.desiredVersion).length;
    const routeCount = await tx.delivery_routes.count({ where: { dedicatedLineId: line.id, isCurrent: true } });
    const status = ready >= line.placement.minReadyReplicaCount && routeCount === 0
        ? 'MIGRATING_AWAITING_ROUTE_IMPORT'
        : ready >= line.placement.targetReplicaCount
            ? 'ACTIVE'
            : ready >= line.placement.minReadyReplicaCount
                ? 'DEGRADED'
                : terminalFailure
                    ? (line.status === 'ACTIVE' ? 'DEGRADED' : 'FAILED')
                    : 'PROVISIONING';
    await tx.dedicated_lines.update({ where: { id: line.id }, data: { status } });
}
function migrationIdFromPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return null;
    const migrationId = payload.migrationId;
    return typeof migrationId === 'string' && migrationId.trim() ? migrationId : null;
}
async function advanceMigrationTargetReadiness(tx, migrationId) {
    if (!migrationId)
        return;
    const migrationTable = tx.dedicated_line_migrations;
    const projectionTable = tx.dedicated_line_projections;
    if (!migrationTable || typeof projectionTable.findMany !== 'function')
        return;
    const migration = await migrationTable.findUnique({
        where: { id: migrationId },
        select: { type: true, phase: true, status: true, nodes: { where: { role: 'TARGET' }, select: { projectionId: true } } },
    });
    if (!migration || migration.phase !== 'PREPARE' || migration.status !== 'ACTIVE')
        return;
    const expectedProjectionIds = migration.nodes.map((node) => node.projectionId);
    if (expectedProjectionIds.length === 0 || expectedProjectionIds.some((id) => !id) || new Set(expectedProjectionIds).size !== expectedProjectionIds.length)
        return;
    const projections = await projectionTable.findMany({ where: { migrationId }, select: { id: true, status: true, desiredVersion: true, observedVersion: true } });
    if (projections.length !== expectedProjectionIds.length
        || projections.some((projection) => projection.status !== 'READY' || projection.observedVersion !== projection.desiredVersion)
        || projections.some((projection) => !expectedProjectionIds.includes(projection.id)))
        return;
    const next = (0, domain_2.assertMigrationTransition)({ type: migration.type, phase: migration.phase, status: migration.status }, { type: 'TARGET_PROJECTIONS_READY' });
    await migrationTable.updateMany({
        where: { id: migrationId, phase: migration.phase, status: migration.status },
        data: { phase: next.phase, status: next.status },
    });
}
function retryDelayMs(attempt) {
    return Math.min(60_000, Math.max(1_000, 2 ** Math.min(attempt, 6) * 1_000));
}
//# sourceMappingURL=dedicated-line-projection.repository.js.map