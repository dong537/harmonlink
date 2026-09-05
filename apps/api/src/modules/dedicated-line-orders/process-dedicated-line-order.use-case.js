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
exports.ProcessDedicatedLineOrderUseCase = void 0;
exports.parseRequest = parseRequest;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const provider_registry_service_1 = require("../providers/provider-registry.service");
const allowlist_1 = require("../../common/config/allowlist");
const config_service_1 = require("../../common/config/config.service");
const aes_gcm_1 = require("../../common/crypto/aes-gcm");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const dedicated_line_order_repository_1 = require("./dedicated-line-order.repository");
const domain_1 = require("../dedicated-line-projections/domain");
let ProcessDedicatedLineOrderUseCase = class ProcessDedicatedLineOrderUseCase {
    jobs;
    providers;
    config;
    constructor(jobs, providers, config) {
        this.jobs = jobs;
        this.providers = providers;
        this.config = config;
    }
    async execute(jobId, workerId = 'dedicated-line-worker') {
        const job = await this.jobs.claimRunnableJob(jobId, workerId);
        if (!job)
            return { status: 'NOOP', jobId };
        // Whether we have handed a purchase/query request to the upstream provider.
        // Once true, the reservation must never be released on failure: the upstream
        // resource may already be paid for, so refunding would lose money silently.
        let upstreamCallIssued = false;
        try {
            const request = parseRequest(job);
            const providerCode = requiredString(job.payload, 'providerCode');
            const providerAccountId = requiredString(job.payload, 'providerAccountId');
            const skuId = requiredString(job.payload, 'skuId');
            const countryCode = requiredString(job.payload, 'countryCode').toUpperCase();
            const quantity = requiredPositiveInteger(job.payload, 'quantity');
            const reservationId = requiredString(job.payload, 'reservationId');
            const config = await this.providers.getConfigForProviderAccount(providerCode, job.siteId, providerAccountId);
            if (config.status === 'DISABLED') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_disabled', 503);
            }
            if (this.config.get('DEDICATED_LINE_ORDER_EXECUTION_ENABLED') !== 'true') {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'dedicated_line_order_execution_disabled', 503);
            }
            if (!(0, allowlist_1.allowsAny)([
                { value: config.code, allowlist: this.config.get('DEDICATED_LINE_ORDER_PROVIDER_ALLOWLIST') },
                { value: config.upstreamAccountId, allowlist: this.config.get('DEDICATED_LINE_ORDER_ACCOUNT_ALLOWLIST') },
            ])) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'dedicated_line_provider_not_allowed', 503);
            }
            const adapter = this.providers.getAdapter(providerCode);
            const payload = asJsonObject(job.payload);
            const upstreamOrderId = optionalString(payload['upstreamOrderId']);
            const buyInput = {
                countryCode,
                regionCode: request.regionCode,
                quantity,
                durationDays: request.durationDays,
                ipType: 'NATIVE',
                protocol: request.protocol,
                currency: request.currency,
                providerResourceId: request.providerResourceId,
                businessType: request.businessType,
                idempotencyKey: job.dedupeKey,
            };
            upstreamCallIssued = true;
            const result = upstreamOrderId
                ? await adapter.queryOrder({ upstreamOrderId, protocol: request.protocol, countryCode }, config)
                : await adapter.buyStaticProxy(buyInput, config);
            if (result.status === 'FAILED') {
                const status = await this.jobs.markFailed(job, workerId, error_codes_1.ErrorCode.UPSTREAM_ERROR, {
                    reason: result.failReason ?? 'provider_order_failed',
                }, { retry: true, releaseReservation: true });
                return status === 'RETRYING'
                    ? { status, jobId: job.id, attempts: job.attempt, upstreamOrderId: upstreamOrderId ?? '' }
                    : { status: 'NEEDS_OPERATOR', jobId: job.id, error: result.failReason ?? 'provider_order_failed' };
            }
            if (result.status === 'PENDING' || result.proxies.length === 0) {
                if (!result.upstreamOrderId) {
                    await this.jobs.markFailed(job, workerId, 'UPSTREAM_ORDER_ID_MISSING', {
                        reason: 'provider_accepted_without_order_id',
                    }, { retry: false, releaseReservation: false });
                    return { status: 'NEEDS_OPERATOR', jobId: job.id, error: 'provider_accepted_without_order_id' };
                }
                await this.jobs.saveUpstreamOrderId(job, workerId, result.upstreamOrderId, nextPollAt());
                return { status: 'RETRYING', jobId: job.id, attempts: job.attempt, upstreamOrderId: result.upstreamOrderId };
            }
            assertDelivery(result, countryCode, quantity, request.protocol);
            const encryptionKey = this.config.get('APP_ENCRYPTION_KEY');
            const lines = result.proxies.map((proxy, index) => createLinePlan({
                job,
                proxy,
                index,
                encryptionKey,
                request,
                providerCode,
                providerAccountId,
            }));
            const persisted = await this.jobs.persistCompletedOrder({
                jobId: job.id,
                workerId,
                desiredVersion: job.desiredVersion,
                reservationId,
                providerCode,
                providerAccountId,
                skuId,
                countryCode,
                placementPolicyId: request.placementPolicyId,
                inboundTag: request.inboundTag,
                exits: lines,
            });
            if (persisted.status === 'NEEDS_OPERATOR') {
                return { status: 'NEEDS_OPERATOR', jobId: job.id, error: persisted.reasonKey };
            }
            return { status: 'COMPLETED', jobId: job.id, reservationId, exits: result.proxies.length };
        }
        catch (error) {
            const detail = errorContext(error);
            const code = error instanceof app_error_1.AppError ? error.code : error_codes_1.ErrorCode.UPSTREAM_ERROR;
            // Nothing was purchased, so the customer must get their money and the
            // stock back. Enumerating "known safe" error codes is what let a payload
            // VALIDATION_ERROR strand paid-for reservations: any new pre-purchase
            // failure was silently treated as post-purchase. Position in the flow is
            // the real signal, not the error code.
            const releaseReservation = !upstreamCallIssued;
            const isTransientFailure = code === error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK || code === error_codes_1.ErrorCode.UPSTREAM_DISABLED;
            const status = await this.jobs.markFailed(job, workerId, String(code), detail, { retry: isTransientFailure, releaseReservation });
            return {
                status: status === 'RETRYING' ? 'RETRYING' : 'NEEDS_OPERATOR',
                jobId: job.id,
                ...(status === 'RETRYING' ? { attempts: job.attempt, upstreamOrderId: '' } : { error: detail.error }),
            };
        }
    }
};
exports.ProcessDedicatedLineOrderUseCase = ProcessDedicatedLineOrderUseCase;
exports.ProcessDedicatedLineOrderUseCase = ProcessDedicatedLineOrderUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dedicated_line_order_repository_1.DedicatedLineOrderRepository,
        provider_registry_service_1.ProviderRegistryService,
        config_service_1.ConfigService])
], ProcessDedicatedLineOrderUseCase);
function parseRequest(payload) {
    const request = asJsonObject(asJsonObject(payload.payload)['request']);
    const protocol = requiredString(request, 'protocol');
    if (protocol !== 'SOCKS5')
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_requires_socks5', 400);
    const maxReplicaFanout = requiredPositiveInteger(request, 'maxReplicaFanout');
    return {
        durationDays: requiredPositiveInteger(request, 'durationDays'),
        currency: requiredString(request, 'currency'),
        protocol,
        providerResourceId: requiredString(request, 'providerResourceId'),
        placementPolicyId: requiredString(request, 'placementPolicyId'),
        inboundProfileId: requiredString(request, 'inboundProfileId'),
        inboundTag: requiredString(request, 'inboundTag'),
        lineProtocol: requiredLineProtocol(request),
        maxReplicaFanout,
        regionCode: optionalString(request['regionCode']),
        businessType: optionalString(request['businessType']),
    };
}
function requiredLineProtocol(request) {
    const protocol = requiredString(request, 'lineProtocol');
    if (protocol !== 'VLESS' && protocol !== 'VMESS' && protocol !== 'MIXED') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_lineProtocol_invalid', 400);
    }
    return protocol;
}
function assertDelivery(result, countryCode, quantity, protocol) {
    if (result.proxies.length !== quantity) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'dedicated_line_proxy_count_mismatch', 502);
    }
    for (const proxy of result.proxies) {
        if (proxy.countryCode.trim().toUpperCase() !== countryCode || proxy.protocol !== protocol) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'dedicated_line_exit_country_or_protocol_mismatch', 502);
        }
        if (!proxy.ip || !Number.isInteger(proxy.port) || proxy.port < 1 || !proxy.username || !proxy.password) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'dedicated_line_exit_credentials_invalid', 502);
        }
        if (!(proxy.expiresAt instanceof Date) || proxy.expiresAt.getTime() <= Date.now()) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'dedicated_line_exit_expiry_invalid', 502);
        }
    }
}
function createLinePlan(input) {
    const lineId = deterministicUuid(input.encryptionKey, `${input.job.id}:line:${input.index}`);
    const clientEmail = `line-${lineId}@365proxy.internal`;
    const identity = input.request.lineProtocol === 'MIXED'
        ? {
            user: `line-${lineId.slice(0, 18)}`,
            password: deterministicSecret(input.encryptionKey, `${input.job.id}:password:${input.index}`),
        }
        : { id: deterministicUuid(input.encryptionKey, `${input.job.id}:client:${input.index}`) };
    const projectionRequest = {
        desiredVersion: input.job.desiredVersion,
        inboundTag: input.request.inboundTag,
        protocol: input.request.lineProtocol,
        client: input.request.lineProtocol === 'MIXED'
            ? { email: clientEmail, user: identity.user, password: identity.password }
            : { email: clientEmail, id: identity.id },
        egress: {
            host: input.proxy.ip,
            port: input.proxy.port,
            username: input.proxy.username,
            password: input.proxy.password,
        },
        lifecycle: {
            enabled: true,
            expiresAtMs: input.proxy.expiresAt.getTime(),
            trafficLimitBytes: 0,
            ipLimit: 0,
            uplinkLimitBps: 0,
            downlinkLimitBps: 0,
            maxConnections: 0,
        },
    };
    return {
        lineId,
        inboundProfileId: input.request.inboundProfileId,
        protocol: input.request.lineProtocol,
        clientEmail,
        clientIdentityCiphertext: (0, aes_gcm_1.encryptAesGcm)(JSON.stringify(identity), input.encryptionKey),
        clientIdentityFingerprint: (0, node_crypto_1.createHash)('sha256')
            .update([input.job.siteId, input.request.lineProtocol, JSON.stringify(identity)].join('\0'))
            .digest('hex'),
        projectionDesiredHash: (0, domain_1.managedLineProjectionDesiredHash)(projectionRequest),
        providerProxyId: input.proxy.upstreamProxyId ?? null,
        endpointCiphertext: (0, aes_gcm_1.encryptAesGcm)(JSON.stringify({ host: input.proxy.ip, port: input.proxy.port, protocol: input.proxy.protocol }), input.encryptionKey),
        credentialCiphertext: (0, aes_gcm_1.encryptAesGcm)(JSON.stringify({ username: input.proxy.username, password: input.proxy.password }), input.encryptionKey),
        identityFingerprint: (0, dedicated_line_order_repository_1.exitIdentityFingerprint)(input.job.siteId, input.providerCode, input.providerAccountId, input.proxy.upstreamProxyId ?? null, input.proxy.ip, input.proxy.port),
        maxReplicaFanout: input.request.maxReplicaFanout,
        expiresAt: input.proxy.expiresAt,
    };
}
function deterministicUuid(key, purpose) {
    const bytes = (0, node_crypto_1.createHmac)('sha256', key).update(purpose).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function deterministicSecret(key, purpose) {
    return (0, node_crypto_1.createHmac)('sha256', key).update(purpose).digest('base64url');
}
function asJsonObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
}
function requiredString(value, key) {
    const record = asJsonObject(value);
    const candidate = record[key];
    if (typeof candidate !== 'string' || !candidate.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, `dedicated_line_${key}_required`, 400);
    }
    return candidate.trim();
}
function optionalString(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function requiredPositiveInteger(value, key) {
    const record = asJsonObject(value);
    const candidate = record[key];
    if (!Number.isInteger(candidate) || candidate < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, `dedicated_line_${key}_invalid`, 400);
    }
    return candidate;
}
function nextPollAt() {
    return new Date(Date.now() + 5_000);
}
function errorContext(error) {
    if (!error || typeof error !== 'object')
        return { error: String(error) };
    const record = error;
    return {
        error: error instanceof Error ? error.message : String(error),
        ...(typeof record['code'] === 'string' ? { code: record['code'] } : {}),
        ...(typeof record['reasonKey'] === 'string' ? { reasonKey: record['reasonKey'] } : {}),
        ...(record['details'] !== undefined ? { details: record['details'] } : {}),
    };
}
//# sourceMappingURL=process-dedicated-line-order.use-case.js.map