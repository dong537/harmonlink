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
exports.ProcessMigrationSmokeUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const client_1 = require("@ipeasy/db/generated/client");
const migration_smoke_adapter_1 = require("./migration-smoke.adapter");
const domain_1 = require("./domain");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let ProcessMigrationSmokeUseCase = class ProcessMigrationSmokeUseCase {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async execute(migrationId, stage) {
        const migration = await db_1.prisma.dedicated_line_migrations.findUnique({ where: { id: migrationId }, include: { dedicatedLine: { include: { domains: { where: { status: 'ACTIVE' } } } }, targetExit: true, nodes: true, smokeObservations: { where: { stage, verified: true, freshUntil: { gt: new Date() } }, orderBy: { observedAt: 'desc' }, take: 1 } } });
        if (!migration)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'migration_not_found', 404);
        const existing = migration.smokeObservations[0];
        if (existing && existing.freshUntil.getTime() > Date.now())
            return existing;
        if (migration.phase !== 'VERIFY' || migration.status !== 'ACTIVE') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'migration_phase_invalid', 409);
        }
        const domain = migration.dedicatedLine.domains.find((item) => stage === 'CANARY' ? item.role === 'BACKUP' : item.role === 'PRIMARY');
        if (!domain)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'migration_smoke_domain_missing', 422);
        let result;
        try {
            result = await this.adapter.verify(domain.hostname, domain.port);
        }
        catch (error) {
            if (!(error instanceof app_error_1.AppError))
                throw error;
            result = {
                verified: false,
                observedIp: null,
                observedCountry: null,
                latencyMs: null,
                stabilitySamples: 0,
                failureCode: error.code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT
                    ? 'TIMEOUT'
                    : error.reasonKey === 'dedicated_line_migration_smoke_network_error'
                        ? 'NETWORK_ERROR'
                        : error.code,
                detail: { reasonKey: error.reasonKey },
            };
        }
        if (result.verified && !sameCountry(result.observedCountry, migration.dedicatedLine.countryCode)) {
            result = {
                ...result,
                verified: false,
                failureCode: 'COUNTRY_MISMATCH',
                detail: {
                    ...result.detail,
                    expectedCountry: migration.dedicatedLine.countryCode,
                    observedCountry: result.observedCountry,
                },
            };
        }
        return db_1.prisma.$transaction(async (tx) => {
            const observation = await tx.dedicated_line_smoke_observations.create({ data: { siteId: migration.siteId, tenantId: migration.tenantId, userId: migration.userId, dedicatedLineId: migration.dedicatedLineId, migrationId: migration.id, stage, hostname: domain.hostname, verified: result.verified, observedIp: result.observedIp, observedCountryCode: result.observedCountry, latencyMs: result.latencyMs, failureType: result.failureCode, failureDetail: result.detail, freshUntil: new Date(Date.now() + 5 * 60_000) } });
            let transitionApplied = false;
            if (result.verified && stage !== 'ROLLBACK') {
                const next = (0, domain_1.assertMigrationTransition)({ type: migration.type, phase: migration.phase, status: migration.status }, { type: 'SMOKE_VERIFIED' });
                const updated = await tx.dedicated_line_migrations.updateMany({
                    where: { id: migration.id, phase: migration.phase, status: migration.status },
                    data: { phase: next.phase, status: next.status },
                });
                transitionApplied = updated.count === 1;
            }
            await tx.audit_logs.create({
                data: {
                    siteId: migration.siteId,
                    tenantId: migration.tenantId,
                    actorType: 'SYSTEM',
                    actorId: 'dedicated-line-migration-worker',
                    targetType: 'dedicated_line_migration',
                    targetId: migration.id,
                    action: 'dedicated_line.migration.smoke',
                    requestId: `migration-smoke:${observation.id}`,
                    meta: {
                        stage,
                        hostname: domain.hostname,
                        verified: result.verified,
                        observedCountryCode: result.observedCountry,
                        failureType: result.failureCode,
                        transitionApplied,
                    },
                },
            });
            return observation;
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
};
exports.ProcessMigrationSmokeUseCase = ProcessMigrationSmokeUseCase;
exports.ProcessMigrationSmokeUseCase = ProcessMigrationSmokeUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [migration_smoke_adapter_1.MigrationSmokeAdapter])
], ProcessMigrationSmokeUseCase);
function sameCountry(observed, expected) {
    return typeof observed === 'string'
        && observed.trim().length > 0
        && observed.trim().toUpperCase() === expected.trim().toUpperCase();
}
//# sourceMappingURL=process-migration-smoke.use-case.js.map