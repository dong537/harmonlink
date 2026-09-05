"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancelDedicatedLineMigrationUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const auth_context_1 = require("../../common/auth/auth-context");
const domain_1 = require("./domain");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let CancelDedicatedLineMigrationUseCase = class CancelDedicatedLineMigrationUseCase {
    async execute(ctx, migrationId) {
        (0, auth_context_1.requireOperatorContext)(ctx);
        return db_1.prisma.$transaction(async (tx) => {
            const migration = await tx.dedicated_line_migrations.findFirst({ where: { id: migrationId, siteId: ctx.siteId }, include: { nodes: true } });
            if (!migration)
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_not_found', 404);
            const next = (0, domain_1.assertMigrationTransition)({ type: migration.type, phase: migration.phase, status: migration.status }, { type: 'CANCEL' });
            if (next.status === 'CANCELLED') {
                const projections = await tx.dedicated_line_projections.findMany({
                    where: { migrationId: migration.id },
                    select: { id: true, projectionKey: true, desiredVersion: true },
                });
                if (projections.length > 0) {
                    await tx.external_jobs.deleteMany({ where: { aggregateId: { in: projections.map((projection) => projection.id) }, kind: 'APPLY_DEDICATED_LINE_PROJECTION', status: { in: ['QUEUED', 'RETRYING'] } } });
                    for (const projection of projections) {
                        const deleteVersion = projection.desiredVersion + 1;
                        const deleteKey = `delete_dedicated_line_projection:${migration.id}:${projection.id}:v${deleteVersion}`;
                        await tx.external_jobs.create({
                            data: {
                                siteId: migration.siteId,
                                tenantId: migration.tenantId,
                                userId: migration.userId,
                                dedicatedLineId: migration.dedicatedLineId,
                                kind: 'DELETE_DEDICATED_LINE_PROJECTION',
                                aggregateType: 'dedicated_line_projection',
                                aggregateId: projection.id,
                                desiredVersion: deleteVersion,
                                idempotencyKey: deleteKey,
                                dedupeKey: deleteKey,
                                payload: { migrationId: migration.id, projectionKey: projection.projectionKey, projectionDesiredVersion: projection.desiredVersion },
                            },
                        });
                    }
                }
                const cleanupKey = `cleanup_dedicated_line_migration:${migration.id}:v${migration.targetLineVersion}`;
                await tx.external_jobs.create({
                    data: {
                        siteId: migration.siteId,
                        tenantId: migration.tenantId,
                        userId: migration.userId,
                        dedicatedLineId: migration.dedicatedLineId,
                        kind: 'CLEANUP_DEDICATED_LINE_MIGRATION',
                        aggregateType: 'dedicated_line_migration',
                        aggregateId: migration.id,
                        desiredVersion: migration.targetLineVersion,
                        idempotencyKey: cleanupKey,
                        dedupeKey: cleanupKey,
                        payload: { migrationId: migration.id },
                    },
                });
            }
            const updated = await tx.dedicated_line_migrations.updateMany({
                where: { id: migration.id, phase: migration.phase, status: migration.status },
                data: { phase: next.phase, status: next.status },
            });
            if (updated.count !== 1) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_cancel_raced', 409);
            }
            await tx.audit_logs.create({
                data: {
                    siteId: migration.siteId,
                    tenantId: migration.tenantId,
                    actorType: ctx.ownerType === 'SYSTEM' ? 'SYSTEM' : 'ADMIN_USER',
                    actorId: ctx.ownerId,
                    targetType: 'dedicated_line_migration',
                    targetId: migration.id,
                    action: 'dedicated_line.migration.cancel',
                    requestId: ctx.requestId,
                    meta: {
                        fromPhase: migration.phase,
                        fromStatus: migration.status,
                        phase: next.phase,
                        status: next.status,
                    },
                },
            });
            return { migrationId: migration.id, phase: next.phase, status: next.status };
        });
    }
};
exports.CancelDedicatedLineMigrationUseCase = CancelDedicatedLineMigrationUseCase;
exports.CancelDedicatedLineMigrationUseCase = CancelDedicatedLineMigrationUseCase = __decorate([
    (0, common_1.Injectable)()
], CancelDedicatedLineMigrationUseCase);
//# sourceMappingURL=cancel-migration.use-case.js.map