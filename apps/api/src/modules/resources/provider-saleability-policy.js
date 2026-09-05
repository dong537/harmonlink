"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGED_RESOURCE_SALEABLE_COUNTRIES = exports.MANAGED_RESOURCE_PRICE_CURRENCY = exports.MANAGED_RESOURCE_PRICE_30D = exports.MANAGED_NATIVE_PROVIDER_CODES = void 0;
exports.getProviderResourceSaleability = getProviderResourceSaleability;
exports.isManagedNativeProviderCode = isManagedNativeProviderCode;
const base_price_1 = require("../pricing/base-price");
exports.MANAGED_NATIVE_PROVIDER_CODES = [
    'PR',
    'IPIPD',
    'NINE_EIGHT_FIVE',
];
exports.MANAGED_RESOURCE_PRICE_30D = '39';
exports.MANAGED_RESOURCE_PRICE_CURRENCY = 'CNY';
// Initial operator recommendations only; live upstream resources are not hard-limited by this list.
exports.MANAGED_RESOURCE_SALEABLE_COUNTRIES = {
    PR: ['SG', 'TH', 'PL', 'BR', 'TR', 'IL', 'NL', 'IN', 'CA', 'AT', 'RO', 'LV', 'UA'],
    IPIPD: ['GB', 'FR', 'DE', 'IT', 'ES', 'JP', 'VN', 'KR', 'AE', 'ZA'],
    NINE_EIGHT_FIVE: ['TW', 'PH', 'MY', 'AU', 'HK'],
};
function getProviderResourceSaleability(input) {
    if (!isManagedNativeProviderCode(input.providerCode)) {
        return {
            managed: false,
            countryCode: (0, base_price_1.resourceCountryCode)(input.code),
            saleable: true,
            reason: null,
        };
    }
    return {
        managed: true,
        countryCode: (0, base_price_1.resourceCountryCode)(input.code),
        saleable: true,
        reason: null,
    };
}
function isManagedNativeProviderCode(value) {
    return exports.MANAGED_NATIVE_PROVIDER_CODES.includes(value);
}
//# sourceMappingURL=provider-saleability-policy.js.map