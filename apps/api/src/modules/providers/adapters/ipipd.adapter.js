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
exports.IpipdAdapter = void 0;
exports.ipipdUrl = ipipdUrl;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const ssrf_1 = require("../../../common/utils/ssrf");
const provider_http_1 = require("../provider-http");
const upstream_log_repository_1 = require("../upstream-log.repository");
const provider_country_coverage_1 = require("../provider-country-coverage");
const provider_delivery_expiry_1 = require("../provider-delivery-expiry");
const API_PREFIX = '/openapi/v2';
let IpipdAdapter = class IpipdAdapter {
    upstreamLogRepo;
    code = 'IPIPD';
    constructor(upstreamLogRepo) {
        this.upstreamLogRepo = upstreamLogRepo;
    }
    /**
     * Builds IPIPD HMAC-SHA256 auth headers.
     * Signature string: METHOD + URI + timestamp + nonce + body.
     */
    buildAuthHeaders(method, uri, body, config) {
        const appId = config.credential['appId'] ?? '';
        const appSecret = config.credential['appSecret'] ?? '';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = (0, node_crypto_1.randomUUID)();
        const signString = `${method.toUpperCase()}${uri}${timestamp}${nonce}${body}`;
        const signature = (0, node_crypto_1.createHmac)('sha256', appSecret).update(signString).digest('hex');
        return {
            'X-API-AppId': appId,
            'X-API-Timestamp': timestamp,
            'X-API-Nonce': nonce,
            'X-API-Signature': signature,
            'Content-Type': 'application/json',
        };
    }
    /**
     * Parses the IPIPD response envelope and throws AppError on upstream failure.
     */
    parseEnvelope(raw) {
        const env = raw;
        if (!env || typeof env !== 'object') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_invalid_response', 502);
        }
        if (env.success !== true || env.code !== 'SUCCESS') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, env.message || 'upstream_error', 502);
        }
        return env.data;
    }
    /**
     * Sends one signed IPIPD request and parses the response envelope.
     */
    async request(method, uri, bodyObj, config) {
        const url = ipipdUrl(config.baseUrl, uri);
        // Build the body string once so signing and transport use identical bytes.
        const body = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
        const headers = this.buildAuthHeaders(method, uri, body, config);
        const opts = { method, headers };
        if (method === 'POST') {
            opts.body = body;
        }
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation: operationFromUri(uri),
            requestSummary: { method, path: uri, body: bodyObj ?? null },
            run: async () => {
                let raw;
                try {
                    const res = await (0, provider_http_1.fetchWithTimeout)(url, opts, config.timeoutMs);
                    if (!res.ok) {
                        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, upstreamHttpErrorReason(res.status), 502, `HTTP ${res.status}`);
                    }
                    raw = await res.json();
                }
                catch (err) {
                    if (err instanceof app_error_1.AppError)
                        throw err;
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_error', 502, String(err));
                }
                const value = this.parseEnvelope(raw);
                return { value, responseSummary: responseSummary(raw) };
            },
        });
    }
    /**
     * Maps IPIPD order status integers into platform order status.
     */
    mapOrderStatus(status) {
        if (status === 3)
            return 'COMPLETED';
        if (status >= 4 && status <= 8)
            return 'FAILED';
        return 'PENDING';
    }
    /**
     * Maps IPIPD static proxy instances into platform delivery records.
     */
    mapInstance(inst, requestedProtocol) {
        const alpha2 = inst.countryCode ? provider_country_coverage_1.IPIPD_ALPHA3_TO_ALPHA2[inst.countryCode] ?? inst.countryCode : '';
        const upstreamProtocol = ipipdInstanceProtocol(inst.protocol);
        if (upstreamProtocol && upstreamProtocol !== requestedProtocol) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'provider_delivery_protocol_mismatch', 502);
        }
        return {
            upstreamProxyId: String(inst.proxyId),
            ip: String(inst.ip),
            port: Number(inst.port),
            username: String(inst.username),
            password: String(inst.password),
            protocol: requestedProtocol,
            expiresAt: (0, provider_delivery_expiry_1.requireFutureDeliveryExpiry)(inst.expiresAt),
            countryCode: alpha2,
        };
    }
    async healthCheck(config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const start = Date.now();
        const uri = `${API_PREFIX}/account`;
        const url = ipipdUrl(config.baseUrl, uri);
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation: 'healthCheck',
            requestSummary: { method: 'GET', path: uri },
            run: async () => {
                try {
                    const headers = this.buildAuthHeaders('GET', uri, '', config);
                    const res = await (0, provider_http_1.fetchWithTimeout)(url, { method: 'GET', headers }, config.timeoutMs);
                    const latencyMs = Date.now() - start;
                    if (!res.ok) {
                        return {
                            value: { healthy: false, latencyMs, error: upstreamHttpErrorReason(res.status) },
                            status: 'ERROR',
                            errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                            responseSummary: { httpStatus: res.status },
                        };
                    }
                    const raw = (await res.json());
                    if (!raw || raw.success !== true || raw.code !== 'SUCCESS') {
                        return {
                            value: { healthy: false, latencyMs, error: raw?.message ?? 'upstream_error' },
                            status: 'ERROR',
                            errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                            responseSummary: responseSummary(raw),
                        };
                    }
                    return { value: { healthy: true, latencyMs }, responseSummary: responseSummary(raw) };
                }
                catch (err) {
                    if (err instanceof app_error_1.AppError)
                        throw err;
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_error', 502, String(err));
                }
            },
        });
    }
    async syncInventory(config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const pageSize = 200;
        const records = [];
        let current = 0;
        for (;;) {
            const page = await this.request('POST', `${API_PREFIX}/static/lines`, { current, size: pageSize }, config);
            const pageRecords = Array.isArray(page?.records) ? page.records : [];
            records.push(...pageRecords);
            if (pageRecords.length < pageSize)
                break;
            current += 1;
        }
        const items = [];
        for (const line of records) {
            const alpha2 = normalizeIpipdCountryCode(line.countryCode);
            if (!alpha2)
                continue;
            const countryName = (0, provider_country_coverage_1.providerCountryName)(this.code, alpha2) ?? alpha2;
            const available = line.active !== false && (line.status === undefined || line.status === 0);
            const regionCode = [line.cityCode, line.tag, line.businessTypeCode]
                .map((value) => value?.trim())
                .filter((value) => Boolean(value))
                .join(' ');
            const baseItem = {
                countryCode: alpha2,
                countryName,
                regionCode: regionCode || undefined,
                ipType: 'NATIVE',
                protocol: 'BOTH',
                upstreamCost: line.price,
                upstreamCostCurrency: line.currency,
            };
            const cidrs = normalizeLineCidrs(line.cidrs);
            if (cidrs.length > 0) {
                for (const cidr of cidrs) {
                    items.push({
                        ...baseItem,
                        networkCidr: cidr.cidr,
                        stock: available ? cidr.availableCount : 0,
                        providerResourceId: encodeIpipdLineCidr(String(line.id), cidr.cidr),
                    });
                }
            }
            else {
                items.push({
                    ...baseItem,
                    stock: available ? Number(line.quantity ?? 0) : 0,
                    providerResourceId: String(line.id),
                });
            }
        }
        return { providerCode: this.code, items, syncedAt: new Date() };
    }
    async buyStaticProxy(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const req = this.buildBuyRequest(input);
        const order = await this.request(req.method, req.path, req.body, config);
        const status = this.mapOrderStatus(order.status);
        const requestedProtocol = input.protocol === 'SOCKS5' ? 'SOCKS5' : 'HTTP';
        const proxies = Array.isArray(order.instances)
            ? order.instances.map((instance) => this.mapInstance(instance, requestedProtocol))
            : [];
        return {
            upstreamOrderId: String(order.orderNo),
            status,
            proxies,
            failReason: status === 'FAILED' ? `order_status_${order.status}` : undefined,
        };
    }
    // Builds the /static/orders/create request body. Pure: no network, no creds.
    // IPIPD supports two order paths:
    //  1) lineId direct purchase from syncInventory resource mapping.
    //  2) countryCode(alpha-3) + cityCode + businessType + ispType
    // lineId avoids country/city/business/isp combination ambiguity.
    buildBuyRequest(input) {
        let body;
        if (input.providerResourceId) {
            const upstream = decodeIpipdLineCidr(input.providerResourceId);
            body = {
                lineId: upstream.lineId,
                ...(upstream.cidr ? { cidr: upstream.cidr } : {}),
                quantity: input.quantity,
                days: input.durationDays,
                orderNo: input.idempotencyKey,
                isTest: false,
                sync: true,
            };
        }
        else {
            if (!input.businessType) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'ipipd_business_type_required', 400, 'IPIPD country order requires businessType');
            }
            const alpha3 = provider_country_coverage_1.IPIPD_ALPHA2_TO_ALPHA3[input.countryCode] ?? input.countryCode;
            body = {
                countryCode: alpha3,
                cityCode: input.regionCode,
                businessType: input.businessType,
                ispType: 1,
                quantity: input.quantity,
                days: input.durationDays,
                orderNo: input.idempotencyKey,
                isTest: false,
                sync: true,
            };
        }
        return { method: 'POST', path: `${API_PREFIX}/static/orders/create`, body };
    }
    async queryOrder(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const page = await this.request('POST', `${API_PREFIX}/static/orders`, { orderNo: input.upstreamOrderId, current: 0, size: 10 }, config);
        const order = Array.isArray(page?.records) ? page.records[0] : undefined;
        if (!order) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'order_not_found', 404, input.upstreamOrderId);
        }
        const requestedProtocol = input.protocol ?? 'HTTP';
        const proxies = Array.isArray(order.instances)
            ? order.instances.map((instance) => this.mapInstance(instance, requestedProtocol))
            : [];
        return {
            upstreamOrderId: String(order.orderNo),
            status: this.mapOrderStatus(order.status),
            proxies,
        };
    }
};
exports.IpipdAdapter = IpipdAdapter;
exports.IpipdAdapter = IpipdAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upstream_log_repository_1.UpstreamLogRepository])
], IpipdAdapter);
function ipipdInstanceProtocol(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.trim().toUpperCase();
    if (normalized === 'HTTP' || normalized === 'SOCKS5')
        return normalized;
    return null;
}
function operationFromUri(uri) {
    if (uri.endsWith('/account'))
        return 'healthCheck';
    if (uri.endsWith('/static/lines'))
        return 'syncInventory';
    if (uri.endsWith('/static/orders/create'))
        return 'buyStaticProxy';
    if (uri.endsWith('/static/orders'))
        return 'queryOrder';
    return 'upstreamRequest';
}
function ipipdUrl(baseUrl, signedUri) {
    const parsed = new URL(baseUrl);
    const pathPrefix = parsed.pathname.replace(/\/+$/, '');
    const lowerPrefix = pathPrefix.toLowerCase();
    const signedSuffix = signedUri.startsWith(API_PREFIX) ? signedUri.slice(API_PREFIX.length) || '/' : signedUri;
    let requestPath;
    let hostname = parsed.hostname.toLowerCase();
    if (hostname === 'sandbox.ipipd.cn') {
        parsed.hostname = 'api.sandbox.ipipd.cn';
        hostname = parsed.hostname.toLowerCase();
    }
    if (isCanonicalIpipdHost(hostname) && lowerPrefix === '/api') {
        requestPath = signedUri;
    }
    else if (isCanonicalIpipdHost(hostname) && lowerPrefix.endsWith(`/api${API_PREFIX}`)) {
        const basePrefix = pathPrefix.slice(0, -(`/api${API_PREFIX}`).length).replace(/\/+$/, '');
        requestPath = `${basePrefix}${API_PREFIX}${signedSuffix}`;
    }
    else if (lowerPrefix.endsWith(API_PREFIX)) {
        requestPath = `${pathPrefix}${signedSuffix}`;
    }
    else {
        requestPath = `${pathPrefix}${signedUri}`;
    }
    parsed.pathname = requestPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
}
function isCanonicalIpipdHost(hostname) {
    return hostname === 'api.ipipd.cn' || hostname === 'api.sandbox.ipipd.cn';
}
function responseSummary(raw) {
    if (!raw || typeof raw !== 'object')
        return { type: typeof raw };
    const data = raw;
    const payload = data['data'];
    const summary = {
        success: data['success'],
        code: data['code'],
        message: data['message'],
        traceId: data['traceId'],
    };
    if (payload && typeof payload === 'object') {
        const body = payload;
        if (Array.isArray(body['records']))
            summary['recordsCount'] = body['records'].length;
        if (Array.isArray(body['instances']))
            summary['instancesCount'] = body['instances'].length;
        if (body['orderNo'])
            summary['orderNo'] = body['orderNo'];
    }
    return summary;
}
function upstreamHttpErrorReason(status) {
    if (status === 401 || status === 403)
        return 'upstream_auth_failed';
    return 'upstream_error';
}
const IPIPD_LINE_CIDR_SEPARATOR = '|cidr=';
function encodeIpipdLineCidr(lineId, cidr) {
    return `${lineId}${IPIPD_LINE_CIDR_SEPARATOR}${encodeURIComponent(cidr)}`;
}
function decodeIpipdLineCidr(value) {
    const separatorIndex = value.indexOf(IPIPD_LINE_CIDR_SEPARATOR);
    if (separatorIndex < 0)
        return { lineId: value };
    const lineId = value.slice(0, separatorIndex);
    const encodedCidr = value.slice(separatorIndex + IPIPD_LINE_CIDR_SEPARATOR.length);
    if (!lineId || !encodedCidr)
        return { lineId: value };
    try {
        return { lineId, cidr: decodeURIComponent(encodedCidr) };
    }
    catch {
        return { lineId: value };
    }
}
function normalizeLineCidrs(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => {
        const cidr = typeof item?.cidr === 'string' ? item.cidr.trim() : '';
        if (!cidr)
            return null;
        const availableCount = Number(item.availableCount ?? 0);
        return {
            cidr,
            availableCount: Number.isFinite(availableCount) && availableCount > 0 ? Math.floor(availableCount) : 0,
        };
    })
        .filter((item) => Boolean(item));
}
function normalizeIpipdCountryCode(value) {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim().toUpperCase();
    if (!normalized)
        return undefined;
    if (/^[A-Z]{2}$/.test(normalized))
        return normalized;
    if (/^[A-Z]{3}$/.test(normalized))
        return provider_country_coverage_1.IPIPD_ALPHA3_TO_ALPHA2[normalized];
    return undefined;
}
//# sourceMappingURL=ipipd.adapter.js.map