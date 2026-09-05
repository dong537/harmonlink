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
exports.NineEightFiveAdapter = void 0;
const common_1 = require("@nestjs/common");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const ssrf_1 = require("../../../common/utils/ssrf");
const provider_http_1 = require("../provider-http");
const upstream_log_repository_1 = require("../upstream-log.repository");
const provider_delivery_expiry_1 = require("../provider-delivery-expiry");
function parseEnvelope(raw, operation) {
    const envelope = raw;
    if (!envelope || typeof envelope !== 'object' || typeof envelope.code !== 'number') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_invalid_response', 502);
    }
    if (envelope.code === 0)
        return envelope.data;
    const msg = envelope.msg ?? 'upstream_error';
    const normalized = msg.toLowerCase();
    if (normalized.includes('stock') || normalized.includes('out of stock')) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK, msg, 422);
    }
    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, `${operation}: ${msg}`, 502);
}
function staticZone(config) {
    const value = config?.credential['zoneId']?.trim() || process.env['UPSTREAM_985PROXY_STATIC_ZONE']?.trim();
    return value ? value : undefined;
}
function staticInventoryBody(proxyType, config) {
    const body = { static_proxy_type: proxyType };
    const zone = staticZone(config);
    if (zone)
        body['zone'] = zone;
    return body;
}
function numberOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
        return Number(value);
    return null;
}
let NineEightFiveAdapter = class NineEightFiveAdapter {
    upstreamLogRepo;
    code = 'NINE_EIGHT_FIVE';
    constructor(upstreamLogRepo) {
        this.upstreamLogRepo = upstreamLogRepo;
    }
    headers(config) {
        return {
            apikey: config.credential['apikey'] ?? '',
            'Content-Type': 'application/json',
        };
    }
    async post(path, body, config, operation) {
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation,
            requestSummary: { method: 'POST', path, body },
            run: async () => {
                let raw;
                try {
                    const res = await (0, provider_http_1.fetchWithTimeout)(nineEightFiveUrl(config.baseUrl, path), { method: 'POST', headers: this.headers(config), body: JSON.stringify(body) }, config.timeoutMs);
                    if (!res.ok) {
                        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, `HTTP ${res.status}`, 502);
                    }
                    raw = await res.json();
                }
                catch (err) {
                    if (err instanceof app_error_1.AppError)
                        throw err;
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_request_failed', 502, String(err));
                }
                const value = parseEnvelope(raw, path);
                return { value, responseSummary: responseSummary(raw) };
            },
        });
    }
    async healthCheck(config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const start = Date.now();
        const path = '/res_static/inventory';
        const body = staticInventoryBody('premium', config);
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation: 'healthCheck',
            requestSummary: { method: 'POST', path, body },
            run: async () => {
                try {
                    const res = await (0, provider_http_1.fetchWithTimeout)(nineEightFiveUrl(config.baseUrl, path), { method: 'POST', headers: this.headers(config), body: JSON.stringify(body) }, config.timeoutMs);
                    const latencyMs = Date.now() - start;
                    if (!res.ok) {
                        return {
                            value: { healthy: false, latencyMs, error: `HTTP ${res.status}` },
                            status: 'ERROR',
                            errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                            responseSummary: { httpStatus: res.status },
                        };
                    }
                    const raw = (await res.json());
                    if (raw.code === 0) {
                        return { value: { healthy: true, latencyMs }, responseSummary: responseSummary(raw) };
                    }
                    return {
                        value: { healthy: false, latencyMs, error: raw.msg ?? 'api_error' },
                        status: 'ERROR',
                        errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                        responseSummary: responseSummary(raw),
                    };
                }
                catch (err) {
                    if (err instanceof app_error_1.AppError)
                        throw err;
                    const latencyMs = Date.now() - start;
                    return {
                        value: { healthy: false, latencyMs, error: String(err) },
                        status: 'ERROR',
                        errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                    };
                }
            },
        });
    }
    async syncInventory(config) {
        (0, provider_http_1.assertProviderActive)(config);
        const seen = new Map();
        for (const proxyType of ['shared', 'premium']) {
            const data = await this.post('/res_static/inventory', staticInventoryBody(proxyType, config), config, 'syncInventory');
            const records = Array.isArray(data) ? data : [];
            for (const record of records) {
                const countryCode = normalizeCountryCode(record.country_code ?? record.country);
                if (!countryCode)
                    continue;
                const key = `${countryCode}:${proxyType}`;
                const previous = seen.get(key) ?? { stock: 0, cost: null };
                seen.set(key, {
                    stock: previous.stock + Number(record.stock ?? 0),
                    cost: previous.cost ?? numberOrNull(record.price),
                });
            }
        }
        const items = [];
        for (const [key, value] of seen) {
            const [countryCode] = key.split(':');
            items.push({
                countryCode,
                countryName: countryCode,
                stock: value.stock,
                ipType: 'NATIVE',
                protocol: 'BOTH',
                providerResourceId: key,
                upstreamCost: value.cost,
                upstreamCostCurrency: 'CNY',
            });
        }
        return { providerCode: this.code, items, syncedAt: new Date() };
    }
    async buyStaticProxy(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const req = this.buildBuyRequest(input, config);
        const data = await this.post(req.path, req.body, config, 'buyStaticProxy');
        const upstreamOrderId = String(data.order_no ?? data.order_id ?? '');
        if (!upstreamOrderId)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'no_order_id_in_response', 502);
        const country = req.body.buy_data[0]?.country ?? input.countryCode;
        const rawProxies = data.proxy_list ?? data.proxies ?? [];
        const proxies = this.mapProxies(rawProxies, country, input.protocol === 'SOCKS5' ? 'SOCKS5' : 'HTTP');
        return {
            upstreamOrderId,
            status: proxies.length > 0 ? 'COMPLETED' : 'PENDING',
            proxies,
        };
    }
    buildBuyRequest(input, config) {
        let country = input.countryCode;
        let proxyType = 'premium';
        const encodedResource = input.providerResourceId ?? input.businessType;
        if (encodedResource?.includes(':')) {
            [country, proxyType] = encodedResource.split(':', 2);
        }
        else if (encodedResource) {
            proxyType = encodedResource;
        }
        if (!country)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'nine_eight_five_requires_country', 400);
        const body = {
            static_proxy_type: proxyType,
            time_period: input.durationDays,
            pay_type: 'balance',
            buy_data: [{ country, city: input.regionCode ?? '', count: input.quantity }],
        };
        const zone = staticZone(config);
        if (zone)
            body['zone'] = zone;
        return { method: 'POST', path: '/res_static/buy', body };
    }
    async queryOrder(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const data = await this.post('/res_static/order_result', { order_no: input.upstreamOrderId }, config, 'queryOrder');
        const rawProxies = data.proxy_list ?? data.proxies ?? [];
        const zone = String(data.zone ?? input.countryCode ?? '');
        const proxies = this.mapProxies(rawProxies, zone, input.protocol ?? 'HTTP');
        const rawStatus = data.status;
        let status = 'PENDING';
        if (proxies.length > 0)
            status = 'COMPLETED';
        if (rawStatus === 'failed' || rawStatus === 4 || rawStatus === 5)
            status = 'FAILED';
        return { upstreamOrderId: input.upstreamOrderId, status, proxies };
    }
    mapProxies(raw, defaultCountry, protocol = 'HTTP') {
        return raw.map((proxy) => {
            const expiry = proxy.expire_time ?? proxy.expire;
            const expiresAt = (0, provider_delivery_expiry_1.requireFutureDeliveryExpiry)(expiry, { timezoneLessUtc: true });
            return {
                upstreamProxyId: optionalString(proxy.proxy_id ?? proxy.id ?? proxy.order_item_id),
                ip: String(proxy.ip ?? ''),
                username: String(proxy.username ?? proxy.login ?? ''),
                password: String(proxy.password ?? ''),
                protocol,
                // The official static API returns a single `port` in its IP list. Some
                // account variants also expose protocol-specific ports; prefer the
                // SOCKS5 port when the dedicated-line job explicitly requested it.
                port: protocol === 'SOCKS5'
                    ? Number(proxy.port_socks ?? proxy.port ?? proxy.port_http ?? 0)
                    : Number(proxy.port_http ?? proxy.port ?? proxy.port_socks ?? 0),
                expiresAt,
                countryCode: String(proxy.zone ?? proxy.country ?? defaultCountry),
            };
        });
    }
};
exports.NineEightFiveAdapter = NineEightFiveAdapter;
exports.NineEightFiveAdapter = NineEightFiveAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upstream_log_repository_1.UpstreamLogRepository])
], NineEightFiveAdapter);
function optionalString(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return String(value);
}
function normalizeCountryCode(value) {
    if (typeof value !== 'string')
        return undefined;
    const code = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : undefined;
}
function responseSummary(raw) {
    if (!raw || typeof raw !== 'object')
        return { type: typeof raw };
    const envelope = raw;
    const data = envelope['data'];
    const summary = {
        code: envelope['code'],
        msg: envelope['msg'],
    };
    if (Array.isArray(data))
        summary['itemsCount'] = data.length;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const body = data;
        if (body['order_no'])
            summary['orderNo'] = body['order_no'];
        if (body['order_id'])
            summary['orderId'] = body['order_id'];
        if (Array.isArray(body['proxy_list']))
            summary['proxyListCount'] = body['proxy_list'].length;
        if (Array.isArray(body['proxies']))
            summary['proxiesCount'] = body['proxies'].length;
    }
    return summary;
}
function nineEightFiveUrl(baseUrl, path) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!normalizedPath.startsWith('/res_static/'))
        return (0, provider_http_1.upstreamUrl)(baseUrl, normalizedPath);
    const parsed = new URL(baseUrl);
    const basePath = parsed.pathname.replace(/\/+$/, '');
    if (basePath.toLowerCase().endsWith('/res_static')) {
        parsed.pathname = `${basePath.slice(0, -'/res_static'.length)}${normalizedPath}`;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    }
    return (0, provider_http_1.upstreamUrl)(baseUrl, normalizedPath);
}
//# sourceMappingURL=nine-eight-five.adapter.js.map