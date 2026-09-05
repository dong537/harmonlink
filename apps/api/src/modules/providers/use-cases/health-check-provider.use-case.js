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
var HealthCheckProviderUseCase_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckProviderUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const request_id_context_1 = require("../../../common/logging/request-id.context");
const providers_repository_1 = require("../providers.repository");
const provider_registry_service_1 = require("../provider-registry.service");
const admin_access_1 = require("../admin-access");
/**
 * Runs a live connectivity probe against one provider account (PLATFORM_ADMIN
 * only). The result is never persisted — this is an on-demand probe.
 *
 * Error model:
 *  - permission / ownership errors throw (403 / NOT_FOUND) BEFORE the probe, so
 *    a cross-site id is indistinguishable from a missing one.
 *  - any failure of the probe itself (decrypt, adapter lookup, unreachable,
 *    timeout, upstream, unsafe base URL) converges into `reachable: false` +
 *    a stable `reasonKey`.
 *    It must never surface as a 500.
 */
let HealthCheckProviderUseCase = HealthCheckProviderUseCase_1 = class HealthCheckProviderUseCase {
    repo;
    registry;
    logger = new common_1.Logger(HealthCheckProviderUseCase_1.name);
    constructor(repo, registry) {
        this.repo = repo;
        this.registry = registry;
    }
    async execute(ctx, id) {
        (0, admin_access_1.requireProviderAdmin)(ctx);
        const account = await this.repo.findForSite(ctx.siteId, id);
        if (!account) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
        }
        const base = {
            accountId: account.id,
            providerCode: account.providerCode,
            checkedAt: new Date(),
        };
        let runtimeConfig;
        try {
            runtimeConfig = await this.registry.getConfigForProviderAccount(account.providerCode, account.siteId, account.id);
        }
        catch (error) {
            this.logger.warn(`provider.health_check config resolution failed for account ${account.id}: ${formatAuditError(error)}`);
            return { ...base, ...mapProbeError(error), latencyMs: null };
        }
        const result = await this.probe(account, runtimeConfig);
        await this.tryWriteAudit(ctx, account, result);
        return result;
    }
    async probe(account, runtimeConfig) {
        const base = {
            accountId: account.id,
            providerCode: account.providerCode,
            checkedAt: new Date(),
        };
        let adapter;
        try {
            adapter = this.registry.getAdapter(account.providerCode);
        }
        catch (error) {
            this.logger.warn(`provider.health_check adapter lookup failed for account ${account.id}: ${formatAuditError(error)}`);
            return { ...base, ...mapProbeError(error), latencyMs: null };
        }
        const start = Date.now();
        try {
            const health = await adapter.healthCheck(runtimeConfig);
            return {
                ...base,
                reachable: health.healthy,
                latencyMs: health.latencyMs,
                reasonKey: health.healthy ? null : normalizeProbeReasonKey(health.error),
                detail: health.error ?? null,
            };
        }
        catch (error) {
            return { ...base, ...mapProbeError(error), latencyMs: Date.now() - start };
        }
    }
    async writeAudit(ctx, account, result) {
        await db_1.prisma.audit_logs.create({
            data: {
                siteId: account.siteId,
                tenantId: account.tenantId,
                actorType: 'ADMIN_USER',
                actorId: ctx.ownerId,
                targetType: 'provider_account',
                targetId: account.id,
                action: 'provider.health_check',
                requestId: request_id_context_1.requestIdStorage.getStore() ?? ctx.requestId,
                meta: { providerCode: account.providerCode, reachable: result.reachable },
            },
        });
    }
    async tryWriteAudit(ctx, account, result) {
        try {
            await this.writeAudit(ctx, account, result);
        }
        catch (error) {
            this.logger.warn(`provider.health_check audit write failed for account ${account.id}: ${formatAuditError(error)}`);
        }
    }
};
exports.HealthCheckProviderUseCase = HealthCheckProviderUseCase;
exports.HealthCheckProviderUseCase = HealthCheckProviderUseCase = HealthCheckProviderUseCase_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [providers_repository_1.ProvidersRepository,
        provider_registry_service_1.ProviderRegistryService])
], HealthCheckProviderUseCase);
/**
 * Maps a thrown probe error into the result shape. Connectivity-class failures
 * keep their reasonKey; anything unexpected converges to `provider_unreachable`
 * so the endpoint never 500s on a probe.
 */
function mapProbeError(error) {
    if (error instanceof app_error_1.AppError) {
        return { reachable: false, reasonKey: error.reasonKey, detail: error.message };
    }
    return {
        reachable: false,
        reasonKey: 'provider_unreachable',
        detail: error instanceof Error ? error.message : String(error),
    };
}
function normalizeProbeReasonKey(error) {
    const reason = error?.trim();
    if (!reason)
        return 'provider_unreachable';
    if (/^HTTP \d{3}$/i.test(reason))
        return 'provider_unreachable';
    if (/^[a-z][a-z0-9_]*$/i.test(reason))
        return reason;
    return 'provider_unreachable';
}
function formatAuditError(error) {
    if (error instanceof Error)
        return `${error.name}: ${error.message}`;
    return String(error);
}
//# sourceMappingURL=health-check-provider.use-case.js.map