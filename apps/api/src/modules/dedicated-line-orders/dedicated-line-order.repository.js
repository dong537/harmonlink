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
exports.DedicatedLineOrderRepository = void 0;
exports.releaseReservationTx = releaseReservationTx;
exports.refundReservationTx = refundReservationTx;
exports.exitIdentityFingerprint = exitIdentityFingerprint;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("../external-work/domain");
const wallet_repository_1 = require("../wallet/wallet.repository");
const ORDER_JOB_KIND = 'PROVIDER_DEDICATED_LINE_ORDER';
let DedicatedLineOrderRepository = class DedicatedLineOrderRepository {
    walletRepository;
    constructor(walletRepository) {
        this.walletRepository = walletRepository;
    }
    async findQueued(limit = 20) {
        const now = new Date();
        return db_1.prisma.external_jobs.findMany({
            where: {
                kind: ORDER_JOB_KIND,
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
        const now = new Date();
        const result = await db_1.prisma.external_jobs.updateMany({
            where: {
                id: jobId,
                kind: ORDER_JOB_KIND,
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
        if (result.count !== 1)
            return null;
        return db_1.prisma.external_jobs.findUnique({ where: { id: jobId } });
    }
    async recoverExpiredLeases() {
        const result = await db_1.prisma.external_jobs.updateMany({
            where: {
                kind: ORDER_JOB_KIND,
                status: 'LEASED',
                leaseExpiresAt: { lt: new Date() },
            },
            data: {
                status: 'NEEDS_OPERATOR',
                lastErrorCode: 'EXTERNAL_CALL_LEASE_EXPIRED',
                lastErrorDetail: { reason: 'remote_order_may_have_been_accepted' },
                leaseOwner: null,
                leaseExpiresAt: null,
            },
        });
        return result.count;
    }
    async saveUpstreamOrderId(job, workerId, upstreamOrderId, retryAt) {
        assertLease(job, workerId);
        const payload = asJsonObject(job.payload);
        const result = await db_1.prisma.external_jobs.updateMany({
            where: { id: job.id, status: 'LEASED', leaseOwner: workerId, desiredVersion: job.desiredVersion },
            data: {
                status: 'RETRYING',
                nextRunAt: retryAt,
                payload: { ...payload, upstreamOrderId },
                leaseOwner: null,
                leaseExpiresAt: null,
                lastErrorCode: 'UPSTREAM_ORDER_PENDING',
                lastErrorDetail: { upstreamOrderId },
            },
        });
        if (result.count !== 1)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_job_lease_lost', 409);
    }
    async persistCompletedOrder(input) {
        try {
            await db_1.prisma.$transaction(async (tx) => {
                const job = await tx.external_jobs.findUnique({ where: { id: input.jobId } });
                if (!job)
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'external_job_not_found', 404);
                assertLease(job, input.workerId, input.desiredVersion);
                if (job.aggregateType !== 'stock_reservation' || job.aggregateId !== input.reservationId) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_job_aggregate_mismatch', 409);
                }
                const reservation = await tx.stock_reservations.findUnique({ where: { id: input.reservationId } });
                if (!reservation)
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'stock_reservation_not_found', 404);
                if (reservation.status !== 'ACTIVE') {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'stock_reservation_not_active', 409);
                }
                // Deliberately no expiry check here. Upstream purchase is poll-based, so a
                // slow but successful delivery routinely outlives the 5-minute reservation
                // TTL. Rejecting it would strand a paid-for upstream resource. Once the
                // purchase has been issued the reservation is no longer TTL-governed; only
                // never-issued reservations are reclaimed (see reclaim-expired-reservations).
                const policy = await loadPlacementPolicy(tx, job.siteId, job.tenantId, job.userId, input.skuId, input.placementPolicyId);
                if (!policy || policy.inboundProfileId !== input.exits[0]?.inboundProfileId || policy.inboundTag !== input.inboundTag) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_placement_policy_changed', 422);
                }
                if (job.tenantId === null || job.userId === null) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_scope_missing', 422);
                }
                if (!job.dedicatedLineOrderId) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_order_snapshot_missing', 422);
                }
                for (const exit of input.exits) {
                    if (exit.inboundProfileId !== policy.inboundProfileId
                        || exit.protocol !== policy.protocol
                        || exit.maxReplicaFanout !== policy.targetReplicaCount) {
                        throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_placement_contract_changed', 422);
                    }
                }
                const allocatedNodes = await allocateProjectionNodes(tx, {
                    siteId: job.siteId,
                    tenantId: job.tenantId,
                    policy,
                    lineCount: input.exits.length,
                });
                for (const [index, exit] of input.exits.entries()) {
                    const residentialExit = await tx.residential_exits.create({
                        data: {
                            siteId: job.siteId,
                            tenantId: job.tenantId,
                            providerAccountId: input.providerAccountId,
                            providerCode: input.providerCode,
                            countryCode: input.countryCode,
                            endpointCiphertext: exit.endpointCiphertext,
                            credentialCiphertext: exit.credentialCiphertext,
                            identityFingerprint: exit.identityFingerprint,
                            maxReplicaFanout: exit.maxReplicaFanout,
                            status: 'ASSIGNED',
                            expiresAt: exit.expiresAt,
                        },
                    });
                    const line = await tx.dedicated_lines.create({
                        data: {
                            id: exit.lineId,
                            siteId: job.siteId,
                            tenantId: job.tenantId,
                            userId: job.userId,
                            skuId: input.skuId,
                            dedicatedLineOrderId: job.dedicatedLineOrderId,
                            inboundProfileId: exit.inboundProfileId,
                            status: 'PROVISIONING',
                            countryCode: input.countryCode,
                            protocol: exit.protocol,
                            clientEmail: exit.clientEmail,
                            clientIdentityCiphertext: exit.clientIdentityCiphertext,
                            clientIdentityFingerprint: exit.clientIdentityFingerprint,
                            desiredVersion: job.desiredVersion,
                            expiresAt: exit.expiresAt,
                            idempotencyKey: `${reservation.id}:${index}`,
                        },
                    });
                    const nodeIds = allocatedNodes[index] ?? [];
                    await tx.dedicated_line_placements.create({
                        data: {
                            siteId: job.siteId,
                            tenantId: job.tenantId,
                            userId: job.userId,
                            dedicatedLineId: line.id,
                            policyId: policy.id,
                            nodeGroupId: policy.nodeGroupId,
                            mode: policy.mode,
                            targetReplicaCount: policy.targetReplicaCount,
                            minReadyReplicaCount: policy.minReadyReplicaCount,
                            assignmentFingerprint: (0, node_crypto_1.createHash)('sha256').update(nodeIds.join('\0')).digest('hex'),
                            changeReason: 'RECONCILE',
                            nodes: {
                                create: nodeIds.map((nodeId, ordinal) => ({
                                    siteId: job.siteId,
                                    tenantId: job.tenantId,
                                    userId: job.userId,
                                    nodeId,
                                    ordinal,
                                })),
                            },
                        },
                    });
                    const projections = nodeIds.map((nodeId) => ({
                        siteId: job.siteId,
                        tenantId: job.tenantId,
                        userId: job.userId,
                        dedicatedLineId: line.id,
                        nodeId,
                        projectionKey: `${line.id}:${nodeId}`,
                        desiredVersion: job.desiredVersion,
                        desiredHash: exit.projectionDesiredHash,
                    }));
                    await tx.dedicated_line_projections.createMany({ data: projections });
                    for (const projection of projections) {
                        const jobKey = `projection:${projection.dedicatedLineId}:${projection.nodeId}:v${projection.desiredVersion}`;
                        const projRow = await tx.dedicated_line_projections.findUniqueOrThrow({
                            where: { siteId_projectionKey: { siteId: job.siteId, projectionKey: projection.projectionKey } },
                            select: { id: true },
                        });
                        await tx.external_jobs.create({
                            data: {
                                siteId: job.siteId,
                                tenantId: job.tenantId,
                                userId: job.userId,
                                dedicatedLineId: line.id,
                                kind: 'APPLY_DEDICATED_LINE_PROJECTION',
                                aggregateType: 'dedicated_line_projection',
                                aggregateId: projRow.id,
                                desiredVersion: job.desiredVersion,
                                idempotencyKey: jobKey,
                                dedupeKey: jobKey,
                                payload: { projectionKey: projection.projectionKey },
                            },
                        });
                    }
                    await tx.dedicated_line_exit_assignments.create({
                        data: {
                            siteId: job.siteId,
                            tenantId: job.tenantId,
                            userId: job.userId,
                            dedicatedLineId: line.id,
                            residentialExitId: residentialExit.id,
                            status: 'ACTIVE',
                        },
                    });
                }
                await tx.stock_reservations.update({
                    where: { id: reservation.id },
                    data: { status: 'CONSUMED', consumedAt: new Date() },
                });
                await tx.external_jobs.update({
                    where: { id: job.id },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                        leaseOwner: null,
                        leaseExpiresAt: null,
                        lastErrorCode: null,
                        lastErrorDetail: client_1.Prisma.JsonNull,
                    },
                });
            });
            return { status: 'COMPLETED' };
        }
        catch (error) {
            if (error instanceof app_error_1.AppError && (error.code === error_codes_1.ErrorCode.CONTROL_NODE_CAPACITY_EXHAUSTED || error.code === error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID)) {
                await persistPurchasedExitsForOperator(input, error.reasonKey);
                return { status: 'NEEDS_OPERATOR', reasonKey: error.reasonKey };
            }
            throw error;
        }
    }
    async markFailed(job, workerId, code, detail, options) {
        assertLease(job, workerId);
        if (options.retry && job.attempt < job.maxAttempts) {
            const retryAt = new Date(Date.now() + retryDelayMs(job.attempt));
            const result = await db_1.prisma.external_jobs.updateMany({
                where: { id: job.id, status: 'LEASED', leaseOwner: workerId, desiredVersion: job.desiredVersion },
                data: {
                    status: job.attempt >= job.maxAttempts ? 'FAILED' : 'RETRYING',
                    nextRunAt: retryAt,
                    lastErrorCode: code,
                    lastErrorDetail: detail,
                    completedAt: job.attempt >= job.maxAttempts ? new Date() : null,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                },
            });
            if (result.count !== 1)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_job_lease_lost', 409);
            return 'RETRYING';
        }
        await db_1.prisma.$transaction(async (tx) => {
            const result = await tx.external_jobs.updateMany({
                where: { id: job.id, status: 'LEASED', leaseOwner: workerId, desiredVersion: job.desiredVersion },
                data: {
                    status: 'NEEDS_OPERATOR',
                    lastErrorCode: code,
                    lastErrorDetail: detail,
                    completedAt: new Date(),
                    leaseOwner: null,
                    leaseExpiresAt: null,
                },
            });
            if (result.count !== 1)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'external_job_lease_lost', 409);
            if (options.releaseReservation) {
                await releaseReservationTx(tx, job.aggregateId);
                await refundReservationTx(tx, job.aggregateId, this.walletRepository);
            }
        });
        return options.retry ? 'FAILED' : 'NEEDS_OPERATOR';
    }
    async releaseReservation(job) {
        await db_1.prisma.$transaction((tx) => releaseReservationTx(tx, job.aggregateId));
    }
};
exports.DedicatedLineOrderRepository = DedicatedLineOrderRepository;
exports.DedicatedLineOrderRepository = DedicatedLineOrderRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], DedicatedLineOrderRepository);
async function loadPlacementPolicy(tx, siteId, tenantId, userId, skuId, policyId) {
    if (!tenantId || !userId)
        return null;
    return tx.line_placement_policies.findFirst({
        where: {
            id: policyId,
            siteId,
            isActive: true,
            AND: [
                { OR: [{ tenantId: null }, { tenantId }] },
                { OR: [{ userId: null }, { userId }] },
                { OR: [{ skuId: null }, { skuId }] },
            ],
            inboundProfile: { isActive: true },
            nodeGroup: { isActive: true },
        },
        select: {
            id: true,
            inboundProfileId: true,
            nodeGroupId: true,
            mode: true,
            targetReplicaCount: true,
            minReadyReplicaCount: true,
            maxUnitsPerNode: true,
            allowedNodes: { select: { nodeId: true } },
            inboundProfile: { select: { inboundTag: true, protocol: true } },
        },
    }).then((row) => row ? {
        ...row,
        inboundTag: row.inboundProfile.inboundTag,
        protocol: row.inboundProfile.protocol,
        allowedNodeIds: row.allowedNodes.map((entry) => entry.nodeId),
    } : null);
}
async function allocateProjectionNodes(tx, input) {
    const nodes = await tx.control_nodes.findMany({
        where: {
            siteId: input.siteId,
            nodeGroupId: input.policy.nodeGroupId,
            id: { in: input.policy.allowedNodeIds },
            status: 'ACTIVE',
            OR: [{ tenantId: null }, { tenantId: input.tenantId }],
        },
        orderBy: [{ allocatedUnits: 'asc' }, { code: 'asc' }],
        select: { id: true, code: true, capacityUnits: true, allocatedUnits: true },
    });
    const remaining = new Map(nodes.map((node) => [
        node.id,
        Math.max(0, Math.min(node.capacityUnits, input.policy.maxUnitsPerNode) - node.allocatedUnits),
    ]));
    const result = [];
    for (let lineIndex = 0; lineIndex < input.lineCount; lineIndex += 1) {
        const candidates = nodes
            .filter((node) => (remaining.get(node.id) ?? 0) > 0)
            .sort((left, right) => (remaining.get(right.id) ?? 0) - (remaining.get(left.id) ?? 0) || left.code.localeCompare(right.code))
            .slice(0, input.policy.targetReplicaCount);
        if (candidates.length !== input.policy.targetReplicaCount) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CAPACITY_EXHAUSTED, 'dedicated_line_control_node_capacity_exhausted', 422);
        }
        const assigned = [];
        for (const node of candidates) {
            const updated = await tx.$executeRaw(client_1.Prisma.sql `
        UPDATE "control_nodes"
        SET "allocatedUnits" = "allocatedUnits" + 1
        WHERE "id" = ${node.id}
          AND "status" = 'ACTIVE'
          AND "allocatedUnits" < "capacityUnits"
          AND "allocatedUnits" < ${input.policy.maxUnitsPerNode}
      `);
            if (updated !== 1) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CAPACITY_EXHAUSTED, 'dedicated_line_control_node_capacity_exhausted', 422);
            }
            remaining.set(node.id, (remaining.get(node.id) ?? 0) - 1);
            assigned.push(node.id);
        }
        result.push(assigned);
    }
    return result;
}
async function persistPurchasedExitsForOperator(input, reasonKey) {
    await db_1.prisma.$transaction(async (tx) => {
        const job = await tx.external_jobs.findUnique({ where: { id: input.jobId } });
        if (!job)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'external_job_not_found', 404);
        assertLease(job, input.workerId, input.desiredVersion);
        for (const exit of input.exits) {
            await tx.residential_exits.create({
                data: {
                    siteId: job.siteId,
                    tenantId: job.tenantId,
                    providerAccountId: input.providerAccountId,
                    providerCode: input.providerCode,
                    countryCode: input.countryCode,
                    endpointCiphertext: exit.endpointCiphertext,
                    credentialCiphertext: exit.credentialCiphertext,
                    identityFingerprint: exit.identityFingerprint,
                    maxReplicaFanout: exit.maxReplicaFanout,
                    expiresAt: exit.expiresAt,
                },
            });
        }
        await tx.stock_reservations.update({
            where: { id: input.reservationId },
            data: { status: 'CONSUMED', consumedAt: new Date() },
        });
        await tx.external_jobs.update({
            where: { id: job.id },
            data: {
                status: 'NEEDS_OPERATOR',
                completedAt: new Date(),
                leaseOwner: null,
                leaseExpiresAt: null,
                lastErrorCode: 'DEDICATED_LINE_ALLOCATION_NEEDS_OPERATOR',
                lastErrorDetail: { reasonKey },
            },
        });
    });
}
function assertLease(job, workerId, desiredVersion = job.desiredVersion) {
    (0, domain_1.assertLeaseCompletion)(job, { workerId, desiredVersion, now: new Date(), onStale: staleDedicatedLineOrderLease });
}
function staleDedicatedLineOrderLease() {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_order_lease_stale', 409);
}
// Sole owner of the `reservedQuantity` counter decrement. `terminalStatus`
// distinguishes a worker-decided release (RELEASED) from a TTL sweep reclaim
// (EXPIRED); both must return stock through this one path so the counter can
// never be decremented twice or by a divergent copy of this SQL.
// Returns false when the reservation is no longer ACTIVE, so a concurrent
// release and reclaim cannot both act on it.
async function releaseReservationTx(tx, reservationId, terminalStatus = 'RELEASED', releasedAt = new Date()) {
    const reservation = await tx.stock_reservations.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== 'ACTIVE')
        return false;
    const claimed = await tx.stock_reservations.updateMany({
        where: { id: reservation.id, status: 'ACTIVE' },
        data: { status: terminalStatus, releasedAt },
    });
    if (claimed.count !== 1)
        return false;
    await tx.$executeRaw(client_1.Prisma.sql `
    UPDATE "dedicated_line_inventory_snapshots"
    SET "reservedQuantity" = GREATEST(0, "reservedQuantity" - ${reservation.quantity})
    WHERE "id" = ${reservation.inventorySnapshotId}
  `);
    return true;
}
async function refundReservationTx(tx, reservationId, walletRepository) {
    const debit = await tx.ledger_entries.findFirst({
        where: { relatedId: reservationId, type: db_1.LedgerEntryType.DEBIT },
        orderBy: { createdAt: 'asc' },
    });
    if (!debit)
        return;
    const amount = debit.amount.toString();
    if (!amount.startsWith('-')) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'dedicated_line_debit_amount_invalid', 409);
    }
    await walletRepository.creditWalletTx(tx, debit.walletId, amount.slice(1), debit.currency, db_1.LedgerEntryType.REFUND, reservationId, 'dedicated_line_order_refund', `dedicated-line-refund:${reservationId}`);
}
function asJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function retryDelayMs(attempt) {
    return Math.min(60_000, Math.max(1_000, 2 ** Math.min(attempt, 6) * 1_000));
}
function exitIdentityFingerprint(siteId, providerCode, providerAccountId, providerProxyId, ip, port) {
    return (0, node_crypto_1.createHash)('sha256')
        .update([siteId, providerCode, providerAccountId, providerProxyId ?? `${ip}:${port}`].join('\0'))
        .digest('hex');
}
//# sourceMappingURL=dedicated-line-order.repository.js.map