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
exports.FulfillStaticProxyUseCase = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const db_1 = require("@ipeasy/db");
const provider_registry_service_1 = require("../../providers/provider-registry.service");
const wallet_repository_1 = require("../../wallet/wallet.repository");
const fulfillment_repository_1 = require("../fulfillment.repository");
const proxies_repository_1 = require("../../proxies/proxies.repository");
const config_service_1 = require("../../../common/config/config.service");
const allowlist_1 = require("../../../common/config/allowlist");
const aes_gcm_1 = require("../../../common/crypto/aes-gcm");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
let FulfillStaticProxyUseCase = class FulfillStaticProxyUseCase {
    fulfillmentRepo;
    providerRegistry;
    walletRepo;
    proxiesRepo;
    config;
    constructor(fulfillmentRepo, providerRegistry, walletRepo, proxiesRepo, config) {
        this.fulfillmentRepo = fulfillmentRepo;
        this.providerRegistry = providerRegistry;
        this.walletRepo = walletRepo;
        this.proxiesRepo = proxiesRepo;
        this.config = config;
    }
    async execute(jobId) {
        const job = await this.fulfillmentRepo.claimRunnableJob(jobId);
        if (!job)
            return { status: 'NOOP', jobId };
        const order = await db_1.prisma.orders.findUnique({ where: { id: job.orderId } });
        if (!order) {
            await this.fulfillmentRepo.updateJobStatus(job.id, 'FAILED', {
                attempts: job.attempts + 1,
                lastError: 'order_not_found',
            });
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'fulfillment_order_not_found', 500);
        }
        try {
            const providerCode = job.providerCode;
            // Get resource for provider input and account binding.
            const resource = await db_1.prisma.platform_resources.findUnique({ where: { id: order.resourceId } });
            if (!resource || resource.siteId !== order.siteId) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
            }
            const boundUpstreamAccountId = job.upstreamAccountId ?? resource.upstreamAccountId ?? null;
            const providerConfig = boundUpstreamAccountId
                ? await this.providerRegistry.getConfigForProviderAccount(providerCode, order.siteId, boundUpstreamAccountId)
                : await this.providerRegistry.getConfig(providerCode, order.siteId, order.tenantId);
            if (providerConfig.status === 'DISABLED') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_disabled', 503);
            }
            if (this.config.get('PROVIDER_FULFILLMENT_EXECUTION_ENABLED') !== 'true') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_fulfillment_execution_disabled', 503);
            }
            const fulfillmentAllowed = (0, allowlist_1.allowsAny)([
                { value: providerConfig.code, allowlist: this.config.get('PROVIDER_FULFILLMENT_PROVIDER_ALLOWLIST') },
                { value: providerConfig.upstreamAccountId, allowlist: this.config.get('PROVIDER_FULFILLMENT_UPSTREAM_ACCOUNT_ALLOWLIST') },
            ]);
            if (!fulfillmentAllowed) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_not_allowed_for_fulfillment', 503);
            }
            const upstreamAccountId = boundUpstreamAccountId ?? providerConfig.upstreamAccountId ?? null;
            // Resolve the upstream resource id (IPIPD lineId / 985Proxy "CC:type")
            // from resource_mappings so the adapter orders the exact upstream line.
            const mapping = await db_1.prisma.resource_mappings.findFirst({
                where: {
                    siteId: order.siteId,
                    resourceId: order.resourceId,
                    providerCode: job.providerCode,
                    ...(upstreamAccountId !== null ? { upstreamAccountId } : {}),
                },
                orderBy: { weight: 'desc' },
            });
            const quoteSnapshot = asJsonObject(order.quoteSnapshot);
            const businessType = typeof quoteSnapshot['businessType'] === 'string'
                ? quoteSnapshot['businessType']
                : mapping?.providerResourceId;
            const buyInput = {
                countryCode: orderResourceCountryCode(resource),
                regionCode: orderResourceRegion(resource, mapping?.providerResourceId),
                quantity: order.quantity,
                durationDays: order.durationDays,
                currency: order.currency,
                ipType: resource.ipType === 'BOTH' ? 'NATIVE' : resource.ipType,
                protocol: resource.protocol === 'BOTH' ? 'HTTP' : resource.protocol,
                providerResourceId: mapping?.providerResourceId,
                businessType,
                idempotencyKey: order.idempotencyKey,
            };
            const adapter = this.providerRegistry.getAdapter(providerCode);
            const existingMirror = await db_1.prisma.upstream_order_mirrors.findFirst({
                where: {
                    orderId: order.id,
                    fulfillmentJobId: job.id,
                    providerCode,
                    ...(upstreamAccountId !== null ? { upstreamAccountId } : {}),
                },
                orderBy: { createdAt: 'desc' },
            });
            const buyResult = existingMirror
                ? await adapter.queryOrder({
                    upstreamOrderId: existingMirror.upstreamOrderId,
                    protocol: buyInput.protocol === 'SOCKS5' ? 'SOCKS5' : 'HTTP',
                    countryCode: buyInput.countryCode,
                }, providerConfig)
                : await createUpstreamOrderMirror(await adapter.buyStaticProxy(buyInput, providerConfig), order, job.id, providerCode, upstreamAccountId);
            if (buyResult.status === 'FAILED') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, buyResult.failReason ?? 'upstream_order_failed', 502);
            }
            if (buyResult.status === 'PENDING' || buyResult.proxies.length === 0) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_order_pending', 502);
            }
            if (buyResult.proxies.length !== order.quantity) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_proxy_count_mismatch', 502);
            }
            const encKey = this.config.get('APP_ENCRYPTION_KEY');
            await db_1.prisma.$transaction(async (tx) => {
                const mirror = await tx.upstream_order_mirrors.findFirst({
                    where: {
                        orderId: order.id,
                        fulfillmentJobId: job.id,
                        providerCode,
                        upstreamOrderId: buyResult.upstreamOrderId,
                        ...(upstreamAccountId !== null ? { upstreamAccountId } : {}),
                    },
                });
                if (!mirror) {
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'upstream_order_mirror_missing', 500);
                }
                await tx.upstream_order_mirrors.update({
                    where: { id: mirror.id },
                    data: {
                        status: buyResult.status,
                        rawResponse: { proxiesCount: buyResult.proxies.length },
                    },
                });
                const proxyData = buyResult.proxies.map((p) => ({
                    id: (0, crypto_1.randomUUID)(),
                    siteId: order.siteId,
                    tenantId: order.tenantId,
                    userId: order.userId,
                    orderId: order.id,
                    upstreamOrderMirrorId: mirror.id,
                    upstreamProxyId: p.upstreamProxyId,
                    providerCode,
                    upstreamAccountId,
                    ip: p.ip,
                    port: p.port,
                    username: p.username,
                    password: (0, aes_gcm_1.encryptAesGcm)(p.password, encKey),
                    protocol: p.protocol,
                    countryCode: p.countryCode,
                    regionCode: orderResourceRegion(resource, mapping?.providerResourceId),
                    ipType: (resource.ipType === 'BOTH' ? 'NATIVE' : resource.ipType),
                    status: 'ACTIVE',
                    expiresAt: p.expiresAt,
                    businessType,
                }));
                await this.proxiesRepo.createMany(tx, proxyData);
                await tx.orders.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
                await tx.fulfillment_jobs.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date(), attempts: { increment: 1 } } });
            });
            return { status: 'COMPLETED', jobId: job.id, orderId: order.id };
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const newAttempts = job.attempts + 1;
            if (newAttempts >= job.maxAttempts) {
                const wallet = await this.walletRepo.getWalletByUserId(order.userId, order.siteId, order.tenantId);
                await db_1.prisma.$transaction(async (tx) => {
                    await this.walletRepo.creditWalletTx(tx, wallet.id, order.totalPrice.toString(), order.currency, 'REFUND', order.id, 'fulfillment_failed_refund', fulfillmentRefundLedgerKey(order));
                    await tx.orders.update({ where: { id: order.id }, data: { status: 'FAILED', failReason: errorMsg } });
                    await tx.fulfillment_jobs.update({
                        where: { id: job.id },
                        data: { status: 'FAILED', attempts: newAttempts, lastError: errorMsg, completedAt: new Date() },
                    });
                    await tx.audit_logs.create({
                        data: {
                            siteId: order.siteId,
                            tenantId: order.tenantId,
                            actorType: 'SYSTEM',
                            actorId: 'worker',
                            targetType: 'orders',
                            targetId: order.id,
                            action: 'order.fulfillment_failed',
                            requestId: (0, crypto_1.randomUUID)(),
                            meta: { jobId, attempts: newAttempts, error: errorMsg },
                        },
                    });
                });
                return { status: 'FAILED_REFUNDED', jobId: job.id, orderId: order.id, attempts: newAttempts, error: errorMsg };
            }
            else {
                await this.fulfillmentRepo.updateJobStatus(jobId, 'RETRYING', {
                    attempts: newAttempts,
                    lastError: errorMsg,
                    scheduledAt: nextRetryAt(newAttempts),
                });
                return { status: 'RETRYING', jobId: job.id, orderId: order.id, attempts: newAttempts, error: errorMsg };
            }
        }
    }
};
exports.FulfillStaticProxyUseCase = FulfillStaticProxyUseCase;
exports.FulfillStaticProxyUseCase = FulfillStaticProxyUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [fulfillment_repository_1.FulfillmentRepository,
        provider_registry_service_1.ProviderRegistryService,
        wallet_repository_1.WalletRepository,
        proxies_repository_1.ProxiesRepository,
        config_service_1.ConfigService])
], FulfillStaticProxyUseCase);
async function createUpstreamOrderMirror(buyResult, order, fulfillmentJobId, providerCode, upstreamAccountId) {
    await db_1.prisma.upstream_order_mirrors.create({
        data: {
            id: (0, crypto_1.randomUUID)(),
            siteId: order.siteId,
            orderId: order.id,
            fulfillmentJobId,
            providerCode,
            upstreamAccountId,
            upstreamOrderId: buyResult.upstreamOrderId,
            status: buyResult.status,
            rawResponse: { proxiesCount: buyResult.proxies.length },
        },
    });
    return buyResult;
}
function asJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function orderResourceRegion(resource, providerResourceId) {
    if (resource.providerCode === 'PR') {
        return extractPrResourceRegion(resource.code)
            ?? extractPrResourceRegion(providerResourceId ?? undefined)
            ?? extractPrResourceRegion(resource.displayName)
            ?? extractPrResourceRegion(resource.name);
    }
    if (resource.type !== 'REGION')
        return undefined;
    const parts = resource.code.split(':');
    return parts.length === 1 ? resource.code : undefined;
}
function extractPrResourceRegion(value) {
    if (!value)
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    const parts = trimmed.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length <= 1)
        return undefined;
    const detailParts = parts.slice(1);
    if (detailParts.length > 1 && /^\d+$/.test(detailParts[0] ?? '')) {
        detailParts.shift();
    }
    const region = detailParts.join(':').trim();
    return region || undefined;
}
function orderResourceCountryCode(resource) {
    const [country] = resource.code.trim().toUpperCase().split(':');
    return country && /^[A-Z]{2}$/.test(country) ? country : resource.code;
}
function nextRetryAt(attempts) {
    const backoffSeconds = Math.min(300, attempts * 30);
    return new Date(Date.now() + backoffSeconds * 1000);
}
function fulfillmentRefundLedgerKey(order) {
    return `refund-${order.siteId}-${order.tenantId}-${order.userId}-${order.id}-${order.idempotencyKey}`;
}
//# sourceMappingURL=fulfill-static-proxy.use-case.js.map