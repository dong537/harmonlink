"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListDedicatedLineMigrationsUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const auth_context_1 = require("../../common/auth/auth-context");
let ListDedicatedLineMigrationsUseCase = class ListDedicatedLineMigrationsUseCase {
    async list(ctx, lineId) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        const rows = await db_1.prisma.dedicated_line_migrations.findMany({
            where: { siteId: ctx.siteId, dedicatedLineId: lineId },
            orderBy: { createdAt: 'desc' },
            include: {
                nodes: { include: { node: { select: { id: true, code: true, regionCode: true } } }, orderBy: [{ role: 'asc' }, { ordinal: 'asc' }] },
                smokeObservations: { orderBy: { observedAt: 'desc' }, take: 10 },
                dedicatedLine: { select: { id: true, status: true, desiredVersion: true, domains: { where: { status: 'ACTIVE' }, select: { hostname: true, port: true, role: true } } } },
                canaryRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } },
                cutoverRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } },
                rollbackRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } },
            },
        });
        return rows.map((row) => serialize(row));
    }
    async get(ctx, migrationId) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        const row = await db_1.prisma.dedicated_line_migrations.findFirst({ where: { id: migrationId, siteId: ctx.siteId }, include: { nodes: { include: { node: { select: { id: true, code: true, regionCode: true } } }, orderBy: [{ role: 'asc' }, { ordinal: 'asc' }] }, smokeObservations: { orderBy: { observedAt: 'desc' } }, dedicatedLine: { select: { id: true, status: true, desiredVersion: true, domains: { where: { status: 'ACTIVE' }, select: { hostname: true, port: true, role: true } } } }, canaryRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } }, cutoverRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } }, rollbackRouteImport: { select: { id: true, sourceName: true, sourceVersion: true, capturedAt: true } } } });
        return row ? serialize(row) : null;
    }
};
exports.ListDedicatedLineMigrationsUseCase = ListDedicatedLineMigrationsUseCase;
exports.ListDedicatedLineMigrationsUseCase = ListDedicatedLineMigrationsUseCase = __decorate([
    (0, common_1.Injectable)()
], ListDedicatedLineMigrationsUseCase);
function serialize(row) {
    const actions = [];
    if (row.status === 'ACTIVE') {
        if (row.phase === 'CANARY_ROUTE')
            actions.push('IMPORT_CANARY');
        if (row.phase === 'VERIFY')
            actions.push('QUEUE_VERIFY');
        if (row.phase === 'CUTOVER_ROUTE')
            actions.push('IMPORT_CUTOVER');
        if (row.phase === 'COMMIT')
            actions.push('COMMIT');
        if (row.phase === 'PREPARE' || row.phase === 'CANARY_ROUTE' || row.phase === 'VERIFY')
            actions.push('CANCEL');
    }
    if (row.status === 'NEEDS_OPERATOR' && row.phase === 'ROLLBACK')
        actions.push('IMPORT_ROLLBACK');
    if (row.status === 'NEEDS_OPERATOR' && ['PREPARE', 'VERIFY', 'CLEANUP'].includes(row.phase))
        actions.push('RETRY');
    return {
        id: row.id, lineId: row.dedicatedLineId, type: row.type, phase: row.phase, status: row.status,
        sourceLineVersion: row.sourceLineVersion, targetLineVersion: row.targetLineVersion,
        sourceExitId: row.sourceExitId, targetExitId: row.targetExitId, sourcePlacementId: row.sourcePlacementId, targetPlacementId: row.targetPlacementId,
        sourceNodes: row.nodes.filter((node) => node.role === 'SOURCE').map((node) => ({ id: node.nodeId, code: node.node.code, regionCode: node.node.regionCode, reservationStatus: node.reservationStatus })),
        targetNodes: row.nodes.filter((node) => node.role === 'TARGET').map((node) => ({ id: node.nodeId, code: node.node.code, regionCode: node.node.regionCode, reservationStatus: node.reservationStatus, projectionId: node.projectionId })),
        domains: row.dedicatedLine.domains,
        smokeObservations: row.smokeObservations.map((smoke) => ({ id: smoke.id, stage: smoke.stage, hostname: smoke.hostname, verified: smoke.verified, observedIp: smoke.observedIp, observedCountryCode: smoke.observedCountryCode, latencyMs: smoke.latencyMs, failureType: smoke.failureType, observedAt: smoke.observedAt, freshUntil: smoke.freshUntil })),
        routes: { canary: row.canaryRouteImport, cutover: row.cutoverRouteImport, rollback: row.rollbackRouteImport },
        allowedActions: actions,
        lastErrorCode: row.lastErrorCode, lastErrorDetail: row.lastErrorDetail, retryCount: row.retryCount,
        createdAt: row.createdAt, updatedAt: row.updatedAt, committedAt: row.committedAt, finishedAt: row.finishedAt,
    };
}
//# sourceMappingURL=list-migrations.use-case.js.map