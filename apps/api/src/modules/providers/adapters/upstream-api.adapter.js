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
exports.UpstreamApiAdapter = void 0;
const common_1 = require("@nestjs/common");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const ssrf_1 = require("../../../common/utils/ssrf");
const provider_http_1 = require("../provider-http");
const provider_country_coverage_1 = require("../provider-country-coverage");
const upstream_log_repository_1 = require("../upstream-log.repository");
const COUNTRY_NAME_BY_CODE = new Map(Object.values(provider_country_coverage_1.PROVIDER_COUNTRY_COVERAGE).flatMap((countries) => countries.map((country) => [country.code, country.name])));
const KNOWN_COUNTRY_CODES = new Set(COUNTRY_NAME_BY_CODE.keys());
const COUNTRY_NAME_TO_ALPHA2 = new Map([
    ...Object.values(provider_country_coverage_1.PROVIDER_COUNTRY_COVERAGE).flatMap((countries) => countries.map((country) => [normalizeCountryLookupKey(country.name), country.code])),
    ['UNITED STATES', 'US'],
    ['USA', 'US'],
    ['AMERICA', 'US'],
    ['UNITED KINGDOM', 'GB'],
    ['UK', 'GB'],
    ['ENGLAND', 'GB'],
    ['HONG KONG', 'HK'],
    ['MACAU', 'MO'],
    ['SOUTH KOREA', 'KR'],
    ['KOREA', 'KR'],
    ['TAIWAN', 'TW'],
    ['SINGAPORE', 'SG'],
    ['JAPAN', 'JP'],
    ['CANADA', 'CA'],
    ['AUSTRALIA', 'AU'],
    ['GERMANY', 'DE'],
    ['FRANCE', 'FR'],
    ['NETHERLANDS', 'NL'],
    ['INDIA', 'IN'],
    ['THAILAND', 'TH'],
    ['POLAND', 'PL'],
    ['BRAZIL', 'BR'],
    ['TURKEY', 'TR'],
    ['ISRAEL', 'IL'],
    ['ROMANIA', 'RO'],
    ['LATVIA', 'LV'],
    ['UKRAINE', 'UA'],
]);
let UpstreamApiAdapter = class UpstreamApiAdapter {
    upstreamLogRepo;
    code = 'UPSTREAM_API';
    constructor(upstreamLogRepo) {
        this.upstreamLogRepo = upstreamLogRepo;
    }
    headers(config) {
        return {
            apikey: config.credential['apiKey'] ?? '',
            'Content-Type': 'application/json',
        };
    }
    async postEnvelope(path, body, config, operation) {
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation,
            requestSummary: { method: 'POST', path, body },
            run: async () => {
                let data;
                try {
                    const res = await (0, provider_http_1.fetchWithTimeout)((0, provider_http_1.upstreamUrl)(config.baseUrl, path), { method: 'POST', headers: this.headers(config), body: JSON.stringify(body) }, config.timeoutMs);
                    data = await res.json();
                    if (!res.ok && !isResStaticEnvelope(data)) {
                        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_error', 502, `HTTP ${res.status}`);
                    }
                }
                catch (err) {
                    if (err instanceof app_error_1.AppError)
                        throw err;
                    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'upstream_error', 502, String(err));
                }
                return { value: parseResStaticEnvelope(data, operation), responseSummary: responseSummary(data) };
            },
        });
    }
    async healthCheck(config) {
        (0, provider_http_1.assertProviderActive)(config);
        (0, ssrf_1.assertSafeUrl)(config.baseUrl);
        const start = Date.now();
        const path = '/res_static/ip_list';
        const body = { status: 1, page: 1, page_size: 1 };
        return (0, provider_http_1.recordUpstreamRequest)({
            logRepo: this.upstreamLogRepo,
            config,
            operation: 'healthCheck',
            requestSummary: { method: 'POST', path, body },
            run: async () => {
                try {
                    const res = await (0, provider_http_1.fetchWithTimeout)((0, provider_http_1.upstreamUrl)(config.baseUrl, path), { method: 'POST', headers: this.headers(config), body: JSON.stringify(body) }, config.timeoutMs);
                    const latencyMs = Date.now() - start;
                    let raw;
                    try {
                        raw = await res.json();
                    }
                    catch {
                        return {
                            value: { healthy: false, latencyMs, error: 'unexpected_response' },
                            status: 'ERROR',
                            errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                            responseSummary: { httpStatus: res.status },
                        };
                    }
                    if (!res.ok) {
                        try {
                            parseResStaticEnvelope(raw, 'healthCheck');
                        }
                        catch (err) {
                            if (err instanceof app_error_1.AppError) {
                                return {
                                    value: { healthy: false, latencyMs, error: healthCheckReasonKey(err) },
                                    status: 'ERROR',
                                    errorCode: err.code,
                                    responseSummary: responseSummary(raw),
                                };
                            }
                        }
                        return {
                            value: { healthy: false, latencyMs, error: `HTTP ${res.status}` },
                            status: 'ERROR',
                            errorCode: error_codes_1.ErrorCode.UPSTREAM_ERROR,
                            responseSummary: responseSummary(raw),
                        };
                    }
                    try {
                        parseResStaticEnvelope(raw, 'healthCheck');
                        return { value: { healthy: true, latencyMs }, responseSummary: responseSummary(raw) };
                    }
                    catch (err) {
                        if (err instanceof app_error_1.AppError) {
                            return {
                                value: { healthy: false, latencyMs, error: healthCheckReasonKey(err) },
                                status: 'ERROR',
                                errorCode: err.code,
                                responseSummary: responseSummary(raw),
                            };
                        }
                        throw err;
                    }
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
        const rawList = await this.postEnvelope('/res_static/inventory', {}, config, 'syncInventory');
        const rows = extractInventoryRows(rawList);
        const items = rows
            .map((row) => normalizeInventoryItem(row))
            .filter((item) => Boolean(item));
        return { providerCode: this.code, items, syncedAt: new Date() };
    }
    async buyStaticProxy(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const req = this.buildBuyRequest(input);
        const body = await this.postEnvelope(req.path, req.body, config, 'buyStaticProxy');
        if (!body['order_no'])
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'unexpected_response', 502);
        const proxies = Array.isArray(body['proxy_list'])
            ? body['proxy_list'].map((proxy) => mapProxy(proxy, input.countryCode))
            : [];
        return {
            upstreamOrderId: String(body['order_no']),
            status: body['status'] ?? 'PENDING',
            proxies,
            failReason: body['failReason'],
        };
    }
    buildBuyRequest(input) {
        const body = {
            resource_id: input.providerResourceId,
            quantity: input.quantity,
            duration_days: input.durationDays,
            currency: input.currency ?? 'CNY',
            idempotency_key: input.idempotencyKey,
        };
        if (!body.resource_id) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.RESOURCE_MAPPING_MISSING, 'upstream_resource_mapping_missing', 422);
        }
        return { method: 'POST', path: '/res_static/buy', body };
    }
    async queryOrder(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const body = await this.postEnvelope('/res_static/order_result', { order_no: input.upstreamOrderId }, config, 'queryOrder');
        if (!body)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'unexpected_response', 502);
        const proxies = Array.isArray(body['proxy_list'])
            ? body['proxy_list'].map((proxy) => mapProxy(proxy, String(proxy['country_code'] ?? '')))
            : [];
        return {
            upstreamOrderId: input.upstreamOrderId,
            status: body['status'] ?? 'PENDING',
            proxies,
        };
    }
    async renewStaticProxy(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const body = await this.postEnvelope('/res_static/renew', {
            proxy_id: input.upstreamProxyId,
            duration_days: input.durationDays,
            idempotency_key: input.idempotencyKey,
        }, config, 'renewStaticProxy');
        return mapLifecycleResult(body);
    }
    async changeProxyPassword(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const body = await this.postEnvelope('/res_static/change_auth', { proxy_id: input.upstreamProxyId }, config, 'changeProxyPassword');
        return mapLifecycleResult(body);
    }
    async switchProxyIp(input, config) {
        (0, provider_http_1.assertProviderActive)(config);
        const body = await this.postEnvelope('/res_static/switch_ip', { proxy_id: input.upstreamProxyId }, config, 'switchProxyIp');
        return mapLifecycleResult(body);
    }
};
exports.UpstreamApiAdapter = UpstreamApiAdapter;
exports.UpstreamApiAdapter = UpstreamApiAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [upstream_log_repository_1.UpstreamLogRepository])
], UpstreamApiAdapter);
function parseResStaticEnvelope(value, operation) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'unexpected_response', 502);
    }
    const envelope = value;
    if (envelope.code === 0 || envelope.code === '0') {
        return envelope.data;
    }
    const msg = envelope.msg ?? `${operation}_failed`;
    if (envelope.code === error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK, msg, 422);
    }
    if (envelope.code === error_codes_1.ErrorCode.PRICE_MISSING) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PRICE_MISSING, msg, 422);
    }
    if (envelope.code === error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, msg, 422);
    }
    if (envelope.code === error_codes_1.ErrorCode.UPSTREAM_DISABLED) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, msg, 503);
    }
    if (envelope.code === error_codes_1.ErrorCode.UNSUPPORTED_CAPABILITY) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UNSUPPORTED_CAPABILITY, msg, 501);
    }
    throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, msg, 502);
}
function isResStaticEnvelope(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && 'code' in value;
}
function mapProxy(proxy, defaultCountryCode) {
    return {
        upstreamProxyId: optionalString(proxy['proxy_id'] ?? proxy['id']),
        ip: String(proxy['ip']),
        port: Number(proxy['port']),
        username: String(proxy['username']),
        password: String(proxy['password']),
        protocol: proxy['protocol'] ?? 'HTTP',
        expiresAt: new Date(String(proxy['expire_time'])),
        countryCode: String(proxy['country_code'] ?? defaultCountryCode),
    };
}
function mapLifecycleResult(body) {
    const proxy = body ? firstProxyPayload(body) : null;
    return proxy ? { proxy: mapProxy(proxy, String(proxy['country_code'] ?? '')) } : {};
}
function firstProxyPayload(body) {
    if (isRecord(body['proxy']))
        return body['proxy'];
    if (isRecord(body['proxy_info']))
        return body['proxy_info'];
    if (isRecord(body['ip']))
        return body;
    const list = body['proxy_list'];
    if (Array.isArray(list) && isRecord(list[0]))
        return list[0];
    return null;
}
function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function optionalString(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    return String(value);
}
function normalizeIpType(value) {
    const normalized = firstText(value)?.toUpperCase();
    return normalized === 'BROADCAST' ? 'BROADCAST' : 'NATIVE';
}
function normalizeProtocol(value) {
    const normalized = firstText(value)?.toUpperCase();
    if (normalized === 'SOCKS5' || normalized === 'BOTH')
        return normalized;
    return 'HTTP';
}
function extractUpstreamCost(row) {
    const cost = firstNumeric(row['price'], row['cost'], row['amount'], row['unit_price'], row['upstream_cost']);
    if (cost === null) {
        return { upstreamCost: null, upstreamCostCurrency: null };
    }
    const currency = firstString(row['currency'], row['cost_currency'], row['price_currency'], row['amount_currency'], row['upstream_cost_currency']);
    return {
        upstreamCost: cost,
        upstreamCostCurrency: currency ?? null,
    };
}
function firstNumeric(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
            return Number(value);
    }
    return null;
}
function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim().toUpperCase();
    }
    return null;
}
function responseSummary(raw) {
    if (!raw || typeof raw !== 'object')
        return { type: typeof raw };
    const body = raw;
    const summary = {};
    if (Array.isArray(body['data']))
        summary['dataCount'] = body['data'].length;
    if (Array.isArray(body['items']))
        summary['itemsCount'] = body['items'].length;
    if (Array.isArray(body['list']))
        summary['listCount'] = body['list'].length;
    if (Array.isArray(body['records']))
        summary['recordsCount'] = body['records'].length;
    const data = body['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const payload = data;
        if (Array.isArray(payload['proxy_list']))
            summary['proxiesCount'] = payload['proxy_list'].length;
        if (Array.isArray(payload['items']))
            summary['itemsCount'] = payload['items'].length;
        if (Array.isArray(payload['list']))
            summary['listCount'] = payload['list'].length;
        if (Array.isArray(payload['records']))
            summary['recordsCount'] = payload['records'].length;
        if (payload['order_no'])
            summary['orderNo'] = payload['order_no'];
        if (payload['status'])
            summary['status'] = payload['status'];
    }
    return summary;
}
const HEALTH_CHECK_REASON_KEYS = new Set([
    'unexpected_response',
    'inventory_empty',
    'price_missing',
    'currency_not_supported',
    'provider_disabled',
    'unsupported_capability',
    'upstream_error',
    'upstream_timeout',
    'network_error',
]);
function healthCheckReasonKey(error) {
    if (HEALTH_CHECK_REASON_KEYS.has(error.reasonKey))
        return error.reasonKey;
    if (error.code === error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK)
        return 'inventory_empty';
    if (error.code === error_codes_1.ErrorCode.PRICE_MISSING)
        return 'price_missing';
    if (error.code === error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED)
        return 'currency_not_supported';
    if (error.code === error_codes_1.ErrorCode.UPSTREAM_DISABLED)
        return 'provider_disabled';
    if (error.code === error_codes_1.ErrorCode.UNSUPPORTED_CAPABILITY)
        return 'unsupported_capability';
    if (error.code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT)
        return 'upstream_timeout';
    return 'upstream_error';
}
function normalizeInventoryItem(row) {
    const countryCode = resolveCountryCode(row);
    if (!countryCode)
        return null;
    const providerResourceId = resolveProviderResourceId(row, countryCode);
    if (!providerResourceId)
        return null;
    const countryName = resolveCountryName(row, countryCode);
    return {
        countryCode,
        countryName,
        regionCode: resolveRegionCode(row, countryName, countryCode),
        stock: resolveStock(row),
        ipType: normalizeIpType(firstText(row['ip_type'], row['ipType'], row['proxy_type'], row['type'])),
        protocol: normalizeProtocol(firstText(row['protocol'], row['protocol_type'], row['protocolType'])),
        providerResourceId,
        ...extractUpstreamCost(row),
    };
}
function extractInventoryRows(value) {
    if (Array.isArray(value))
        return value.filter(isRecord);
    if (!isRecord(value))
        return [];
    for (const key of ['data', 'items', 'list', 'records']) {
        const nestedRows = extractInventoryRows(value[key]);
        if (nestedRows.length > 0)
            return nestedRows;
    }
    if (isEnvelopeLike(value))
        return [];
    return rowsFromObjectMap(value);
}
function resolveCountryCode(row) {
    for (const raw of [
        row['country_code'],
        row['countryCode'],
        row['country_iso'],
        row['countryIso'],
        row['alpha2'],
        row['country'],
    ]) {
        const countryCode = parseCountryCodeLike(raw, false);
        if (countryCode)
            return countryCode;
    }
    const countryName = firstText(row['country_name'], row['countryName'], row['name'], row['area_name']);
    if (countryName) {
        const countryCode = COUNTRY_NAME_TO_ALPHA2.get(normalizeCountryLookupKey(countryName));
        if (countryCode)
            return countryCode;
    }
    for (const raw of [row['area_code'], row['areaCode'], row['code']]) {
        const countryCode = parseCountryCodeLike(raw, true);
        if (countryCode)
            return countryCode;
    }
    return null;
}
function resolveCountryName(row, countryCode) {
    const country = COUNTRY_NAME_BY_CODE.get(countryCode);
    if (country)
        return country;
    return firstText(row['country_name'], row['countryName'], row['name'], row['area_name'], row['country']) ?? countryCode;
}
function resolveProviderResourceId(row, countryCode) {
    return firstIdentifier(row['resource_id'], row['resourceId'], row['line_id'], row['lineId'], row['proxy_id'], row['proxyId'], row['id'], row['area_code'], row['areaCode'], row['code']) ?? countryCode;
}
function resolveRegionCode(row, countryName, countryCode) {
    const region = firstText(row['region_code'], row['regionCode'], row['region_name'], row['regionName'], row['city_code'], row['cityCode'], row['city_name'], row['cityName'], row['district_code'], row['districtCode'], row['district_name'], row['districtName'], row['area_name']);
    if (!region)
        return undefined;
    if (region.toUpperCase() === countryCode.toUpperCase())
        return undefined;
    if (normalizeCountryLookupKey(region) === normalizeCountryLookupKey(countryName))
        return undefined;
    return region;
}
function resolveStock(row) {
    const stock = firstNumeric(row['stock'], row['available'], row['quantity'], row['count'], row['quantity_available']);
    return stock === null ? 0 : Math.max(0, Math.floor(stock));
}
function firstText(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim();
    }
    return null;
}
function firstIdentifier(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim();
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return null;
}
function parseCountryCodeLike(value, allowCompound) {
    const raw = firstText(value);
    if (!raw)
        return null;
    const normalized = raw.toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized) && KNOWN_COUNTRY_CODES.has(normalized))
        return normalized;
    if (/^[A-Z]{3}$/.test(normalized))
        return provider_country_coverage_1.IPIPD_ALPHA3_TO_ALPHA2[normalized] ?? null;
    const byName = COUNTRY_NAME_TO_ALPHA2.get(normalizeCountryLookupKey(raw));
    if (byName)
        return byName;
    if (!allowCompound)
        return null;
    const head = raw.split(/[:/|_\-\s]+/).map((part) => part.trim()).find(Boolean);
    if (!head)
        return null;
    const headNormalized = head.toUpperCase();
    if (/^[A-Z]{2}$/.test(headNormalized) && KNOWN_COUNTRY_CODES.has(headNormalized))
        return headNormalized;
    if (/^[A-Z]{3}$/.test(headNormalized))
        return provider_country_coverage_1.IPIPD_ALPHA3_TO_ALPHA2[headNormalized] ?? null;
    return null;
}
function rowsFromObjectMap(value) {
    const rows = [];
    for (const [key, item] of Object.entries(value)) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            continue;
        rows.push({ code: key, ...item });
    }
    return rows;
}
function isEnvelopeLike(value) {
    return ['code', 'msg', 'message', 'success', 'timestamp', 'traceId'].some((key) => key in value);
}
function normalizeCountryLookupKey(value) {
    return value.trim().toUpperCase().replace(/[\s._-]+/g, ' ');
}
//# sourceMappingURL=upstream-api.adapter.js.map