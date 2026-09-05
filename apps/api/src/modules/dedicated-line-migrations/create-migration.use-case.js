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
exports.CreateDedicatedLineMigrationUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const auth_context_1 = require("../../common/auth/auth-context");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const domain_1 = require("./domain");
const config_service_1 = require("../../common/config/config.service");
const build_managed_line_projection_request_1 = require("../dedicated-line-projections/build-managed-line-projection-request");
const domain_2 = require("../dedicated-line-projections/domain");
let CreateDedicatedLineMigrationUseCase = class CreateDedicatedLineMigrationUseCase {
    config;
    constructor(config) {
        this.config = config;
    }
    async execute(ctx, lineId, body) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        const input = normalizeInput(body);
        return db_1.prisma.$transaction(async (tx) => {
            const line = await tx.dedicated_lines.findFirst({
                where: { id: lineId, siteId: ctx.siteId },
                include: {
                    inboundProfile: true,
                    placement: { include: { nodes: true } },
                    exitAssignment: { include: { residentialExit: true } },
                    activeMigration: true,
                },
            });
            if (!line?.placement || !line.exitAssignment)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
            const replay = await tx.dedicated_line_migrations.findUnique({
                where: { siteId_idempotencyKey: { siteId: ctx.siteId, idempotencyKey: input.idempotencyKey } },
                include: { nodes: true },
            });
            if (replay) {
                if (replay.dedicatedLineId !== line.id || replay.type !== input.type || replay.reason !== input.reason) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_idempotency_conflict', 409);
                }
                return summary(replay, replay.nodes);
            }
            if (line.activeMigration)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'line_migration_already_active', 409);
            const sourceNodeIds = line.placement.nodes.map((node) => node.nodeId);
            const targetNodeIds = input.type === 'EXIT_ONLY' ? sourceNodeIds : input.targetNodeIds;
            const delta = (0, domain_1.computeNodeDelta)(sourceNodeIds, targetNodeIds);
            if (input.type === 'EXIT_ONLY') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_exit_only_staging_unsupported', 422);
            }
            if (delta.retained.length > 0) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_retained_node_staging_unsupported', 422);
            }
            const policy = line.placement.policyId
                ? await tx.line_placement_policies.findUnique({ where: { id: line.placement.policyId }, include: { allowedNodes: true } })
                : null;
            if (!policy || policy.allowedNodes.length === 0)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'migration_placement_policy_missing', 422);
            const allowed = new Set(policy.allowedNodes.map((node) => node.nodeId));
            if (targetNodeIds.some((nodeId) => !allowed.has(nodeId)))
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_target_node_not_allowed', 422);
            if (targetNodeIds.length !== line.placement.targetReplicaCount)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_target_replica_count_invalid', 422);
            const targetNodes = await tx.control_nodes.findMany({ where: { id: { in: targetNodeIds }, siteId: ctx.siteId, status: 'ACTIVE' }, select: { id: true, capacityUnits: true, allocatedUnits: true } });
            if (targetNodes.length !== targetNodeIds.length || targetNodes.some((node) => delta.reserve.includes(node.id) && Math.min(node.capacityUnits, policy.maxUnitsPerNode) - node.allocatedUnits < 1)) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CAPACITY_EXHAUSTED, 'migration_target_node_capacity_exhausted', 422);
            }
            if (input.targetExitId) {
                const targetExit = await tx.residential_exits.findFirst({ where: {
                        id: input.targetExitId, siteId: ctx.siteId, tenantId: line.tenantId, status: 'AVAILABLE', countryCode: line.countryCode,
                        expiresAt: { gt: new Date() }, maxReplicaFanout: { gte: line.placement.targetReplicaCount },
                    }, select: { id: true } });
                if (!targetExit)
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_target_exit_invalid', 422);
                const reserved = await tx.residential_exits.updateMany({ where: { id: targetExit.id, status: 'AVAILABLE' }, data: { status: 'RESERVED' } });
                if (reserved.count !== 1)
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK, 'migration_target_exit_unavailable', 422);
            }
            for (const nodeId of delta.reserve) {
                const updated = await tx.control_nodes.updateMany({ where: { id: nodeId, status: 'ACTIVE', allocatedUnits: { lt: policy.maxUnitsPerNode } }, data: { allocatedUnits: { increment: 1 } } });
                if (updated.count !== 1)
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CAPACITY_EXHAUSTED, 'migration_target_node_capacity_exhausted', 422);
            }
            const migration = await tx.dedicated_line_migrations.create({
                data: {
                    siteId: ctx.siteId, tenantId: line.tenantId, userId: line.userId, dedicatedLineId: line.id, type: input.type,
                    reason: input.reason, idempotencyKey: input.idempotencyKey, requestedBy: ctx.ownerId,
                    sourceLineVersion: line.desiredVersion, targetLineVersion: line.desiredVersion + 1,
                    sourcePlacementId: line.placement.id, sourceExitId: line.exitAssignment.residentialExitId,
                    targetExitId: input.targetExitId,
                    nodes: { create: [
                            ...sourceNodeIds.map((nodeId, ordinal) => ({ nodeId, role: 'SOURCE', ordinal, reservedUnits: 0, reservationStatus: 'RELEASED' })),
                            ...targetNodeIds.map((nodeId, ordinal) => ({ nodeId, role: 'TARGET', ordinal, reservedUnits: delta.reserve.includes(nodeId) ? 1 : 0, reservationStatus: delta.reserve.includes(nodeId) ? 'RESERVED' : 'RELEASED' })),
                        ] },
                },
                include: { nodes: true },
            });
            const targetExitId = input.targetExitId ?? line.exitAssignment.residentialExitId;
            const targetExit = input.targetExitId ? await tx.residential_exits.findUnique({ where: { id: input.targetExitId } }) : line.exitAssignment.residentialExit;
            if (!targetExit)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_target_exit_not_found', 404);
            const targetRequest = (0, build_managed_line_projection_request_1.buildManagedLineProjectionRequest)({ desiredVersion: line.desiredVersion + 1, inboundTag: line.inboundProfile?.inboundTag ?? '', protocol: line.protocol, clientEmail: line.clientEmail, clientIdentityCiphertext: line.clientIdentityCiphertext, lineStatus: line.status, expiresAt: line.expiresAt, quotaBytes: line.quotaBytes, uplinkLimitBps: line.uplinkLimitBps, downlinkLimitBps: line.downlinkLimitBps, maxConnections: line.maxConnections, ipLimit: line.ipLimit, endpointCiphertext: targetExit.endpointCiphertext, credentialCiphertext: targetExit.credentialCiphertext }, this.config.get('APP_ENCRYPTION_KEY'));
            const targetHash = (0, domain_2.managedLineProjectionDesiredHash)(targetRequest);
            const targetVersion = line.desiredVersion + 1;
            for (const nodeId of targetNodeIds) {
                const projection = await tx.dedicated_line_projections.create({
                    data: {
                        siteId: ctx.siteId, tenantId: line.tenantId, userId: line.userId, dedicatedLineId: line.id, migrationId: migration.id,
                        nodeId, projectionKey: `${line.id}:${nodeId}:v${targetVersion}`, desiredVersion: targetVersion, desiredHash: targetHash,
                    },
                });
                await tx.dedicated_line_migration_nodes.update({ where: { migrationId_nodeId_role: { migrationId: migration.id, nodeId, role: 'TARGET' } }, data: { projectionId: projection.id } });
                const jobKey = `migration-projection:${migration.id}:${nodeId}:v${targetVersion}`;
                await tx.external_jobs.create({
                    data: { siteId: ctx.siteId, tenantId: line.tenantId, userId: line.userId, dedicatedLineId: line.id, kind: 'APPLY_DEDICATED_LINE_PROJECTION', aggregateType: 'dedicated_line_projection', aggregateId: projection.id, desiredVersion: targetVersion, idempotencyKey: jobKey, dedupeKey: jobKey, payload: { projectionKey: projection.projectionKey, migrationId: migration.id, exitId: targetExitId } },
                });
            }
            await tx.dedicated_lines.update({ where: { id: line.id }, data: { activeMigrationId: migration.id } });
            await tx.audit_logs.create({ data: { siteId: ctx.siteId, tenantId: line.tenantId, actorType: ctx.ownerType === 'SYSTEM' ? 'SYSTEM' : 'ADMIN_USER', actorId: ctx.ownerId, targetType: 'dedicated_line_migration', targetId: migration.id, action: 'dedicated_line.migration.create', reason: input.reason, requestId: ctx.requestId, meta: { type: input.type, sourceNodeIds, targetNodeIds, sourceExitId: line.exitAssignment.residentialExitId, targetExitId: input.targetExitId } } });
            return summary(migration, migration.nodes);
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
};
exports.CreateDedicatedLineMigrationUseCase = CreateDedicatedLineMigrationUseCase;
exports.CreateDedicatedLineMigrationUseCase = CreateDedicatedLineMigrationUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService])
], CreateDedicatedLineMigrationUseCase);
function normalizeInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_body_invalid', 400);
    const value = body;
    const type = value.type;
    if (type !== 'NODE_ONLY' && type !== 'EXIT_ONLY' && type !== 'FULL')
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_type_invalid', 400);
    const targetNodeIds = type === 'EXIT_ONLY' ? [] : stringList(value.targetNodeIds, 'migration_target_nodes_required');
    const targetExitId = type === 'NODE_ONLY' ? null : token(value.targetExitId, 'migration_target_exit_required');
    return { type, targetNodeIds, targetExitId, reason: token(value.reason, 'migration_reason_required'), idempotencyKey: token(value.idempotencyKey, 'migration_idempotency_required') };
}
function token(value, reasonKey) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 256)
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400); return value.trim(); }
function stringList(value, reasonKey) { if (!Array.isArray(value) || value.length === 0)
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400); const result = value.map((item) => token(item, 'migration_target_node_invalid')); if (new Set(result).size !== result.length)
    throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'migration_target_nodes_duplicate', 422); return result; }
function summary(row, nodes) { return { id: row.id, lineId: row.dedicatedLineId, type: row.type, phase: row.phase, status: row.status, sourceNodeIds: nodes.filter((node) => node.role === 'SOURCE').map((node) => node.nodeId), targetNodeIds: nodes.filter((node) => node.role === 'TARGET').map((node) => node.nodeId), sourceExitId: row.sourceExitId, targetExitId: row.targetExitId }; }
//# sourceMappingURL=create-migration.use-case.js.map