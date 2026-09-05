"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isManagedStaticProxyProviderCode = isManagedStaticProxyProviderCode;
exports.getBaseStaticProxyPrice = getBaseStaticProxyPrice;
exports.resourceCountryCode = resourceCountryCode;
const decimal_js_1 = __importDefault(require("decimal.js"));
const CURRENCY = 'CNY';
const BASE_30D_BY_COUNTRY = {
    GB: '39',
    FR: '39',
    DE: '39',
    IT: '39',
    ES: '39',
    JP: '39',
    KR: '39',
    VN: '39',
    AE: '39',
    ZA: '39',
    HK: '39',
    TW: '39',
    PH: '39',
    MY: '39',
    AU: '39',
    SG: '39',
    TH: '39',
    PL: '39',
    BR: '39',
    TR: '39',
    IL: '39',
    NL: '39',
    IN: '39',
    CA: '39',
    AT: '39',
    RO: '39',
    LV: '39',
    UA: '39',
};
const BASE_30D_BY_PROVIDER = {
    IPIPD: '39',
    NINE_EIGHT_FIVE: '39',
    PR: '39',
};
const DEFAULT_30D = '28';
const DURATION_MULTIPLIER = {
    30: 1,
    60: 1.9,
    90: 2.7,
};
function isManagedStaticProxyProviderCode(value) {
    return Object.prototype.hasOwnProperty.call(BASE_30D_BY_PROVIDER, value);
}
function getBaseStaticProxyPrice(input) {
    if (input.currency !== CURRENCY)
        return null;
    const countryCode = resourceCountryCode(input.code);
    const base = BASE_30D_BY_COUNTRY[countryCode] ?? BASE_30D_BY_PROVIDER[input.providerCode] ?? DEFAULT_30D;
    const multiplier = DURATION_MULTIPLIER[input.durationDays] ?? input.durationDays / 30;
    const unitPrice = new decimal_js_1.default(base).mul(multiplier).toDecimalPlaces(2).toString();
    return { unitPrice, currency: CURRENCY, source: 'DEFAULT_TEMPLATE' };
}
function resourceCountryCode(code) {
    const trimmed = code.trim().toUpperCase();
    const [country] = trimmed.split(/[:\-_]/);
    if (country && /^[A-Z]{2}$/.test(country))
        return country;
    return trimmed;
}
//# sourceMappingURL=base-price.js.map