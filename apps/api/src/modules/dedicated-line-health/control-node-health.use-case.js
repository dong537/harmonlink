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
exports.ProcessControlNodeHealthUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const managed_line_projection_adapter_1 = require("../dedicated-line-projections/managed-line-projection.adapter");
let ProcessControlNodeHealthUseCase = class ProcessControlNodeHealthUseCase {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async execute(limit = 50) {
        const nodes = await db_1.prisma.control_nodes.findMany({
            where: { status: { in: ['ACTIVE', 'DRAINING'] }, projections: { some: { migrationId: null } } },
            include: { projections: { where: { migrationId: null }, select: { projectionKey: true, dedicatedLineId: true, desiredVersion: true, desiredHash: true, dedicatedLine: { include: { placement: { include: { policy: { include: { allowedNodes: true } } } } } } } } },
            orderBy: { code: 'asc' },
            take: limit,
        });
        let observations = 0;
        let recommendations = 0;
        for (const node of nodes) {
            for (const projection of node.projections) {
                let reachable = false;
                let observedVersion = null;
                let observedHash = null;
                let latencyMs = null;
                let failureType = null;
                let failureDetail;
                const started = Date.now();
                try {
                    const response = await this.adapter.get(node, projection.projectionKey);
                    latencyMs = Date.now() - started;
                    observedVersion = response.observedVersion;
                    observedHash = response.observedHash;
                    reachable = response.observedVersion === projection.desiredVersion && response.observedHash === projection.desiredHash;
                    if (!reachable)
                        failureType = 'PROJECTION_DRIFT';
                }
                catch (error) {
                    latencyMs = Date.now() - started;
                    failureType = 'CONTROL_NODE_UNREACHABLE';
                    failureDetail = { message: error instanceof Error ? error.message.slice(0, 500) : String(error) };
                }
                await db_1.prisma.$transaction(async (tx) => {
                    await tx.control_node_health_observations.create({ data: { siteId: node.siteId, nodeId: node.id, projectionKey: projection.projectionKey, reachable, observedVersion, observedHash, latencyMs, failureType, failureDetail } });
                    if (reachable) {
                        await tx.control_nodes.update({ where: { id: node.id }, data: { lastHealthyAt: new Date() } });
                        return;
                    }
                    const placement = projection.dedicatedLine.placement;
                    if (!placement?.policy)
                        return;
                    const allowedNodeIds = placement.policy.allowedNodes.map((entry) => entry.nodeId).filter((id) => id !== node.id);
                    if (allowedNodeIds.length === 0)
                        return;
                    const candidates = await tx.control_nodes.findMany({ where: { id: { in: allowedNodeIds }, siteId: node.siteId, status: 'ACTIVE' }, orderBy: [{ allocatedUnits: 'asc' }, { code: 'asc' }], select: { id: true, allocatedUnits: true, capacityUnits: true } });
                    const eligible = candidates.filter((candidate) => candidate.allocatedUnits < Math.min(candidate.capacityUnits, placement.policy.maxUnitsPerNode));
                    const existing = await tx.dedicated_line_migration_recommendations.findFirst({ where: { dedicatedLineId: projection.dedicatedLineId, sourceNodeId: node.id, incidentVersion: projection.desiredVersion, status: 'ACTIVE' }, select: { id: true } });
                    if (existing)
                        return;
                    await tx.dedicated_line_migration_recommendations.create({ data: { siteId: node.siteId, tenantId: projection.dedicatedLine.tenantId, userId: projection.dedicatedLine.userId, dedicatedLineId: projection.dedicatedLineId, sourceNodeId: node.id, incidentVersion: projection.desiredVersion, reasonCode: failureType ?? 'CONTROL_NODE_UNHEALTHY', reasonDetail: failureDetail, candidates: { create: candidates.map((candidate, rank) => ({ siteId: node.siteId, nodeId: candidate.id, rank, eligible: eligible.some((item) => item.id === candidate.id), reasonCode: eligible.some((item) => item.id === candidate.id) ? null : 'CAPACITY_EXHAUSTED' })) } } });
                    recommendations += 1;
                });
                observations += 1;
            }
        }
        return { nodes: nodes.length, observations, recommendations };
    }
};
exports.ProcessControlNodeHealthUseCase = ProcessControlNodeHealthUseCase;
exports.ProcessControlNodeHealthUseCase = ProcessControlNodeHealthUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [managed_line_projection_adapter_1.ManagedLineProjectionAdapter])
], ProcessControlNodeHealthUseCase);
//# sourceMappingURL=control-node-health.use-case.js.map