"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeProviderBaseUrl = normalizeProviderBaseUrl;
const ssrf_1 = require("../../common/utils/ssrf");
const IPIPD_API_PREFIX = '/openapi/v2';
const NINE_EIGHT_FIVE_RESOURCE_PREFIX = '/res_static';
const PROXY_SELLER_API_PREFIX = '/personal/api/v1';
function normalizeProviderBaseUrl(providerCode, value) {
    const trimmed = value.trim();
    (0, ssrf_1.assertSafeUrl)(trimmed);
    const url = new URL(trimmed);
    if (providerCode === 'IPIPD' && url.hostname.toLowerCase() === 'sandbox.ipipd.cn') {
        url.hostname = 'api.sandbox.ipipd.cn';
    }
    url.hash = '';
    url.search = '';
    url.pathname = normalizeProviderBasePath(providerCode, url.hostname, url.pathname);
    return trimTrailingSlash(url.toString());
}
function normalizeProviderBasePath(providerCode, hostname, pathname) {
    const path = normalizePathname(pathname);
    if (providerCode === 'IPIPD') {
        return normalizeIpipdBasePath(hostname, path);
    }
    if (providerCode === 'NINE_EIGHT_FIVE') {
        return stripTrailingPath(path, NINE_EIGHT_FIVE_RESOURCE_PREFIX);
    }
    if (providerCode === 'PR') {
        const lower = path.toLowerCase();
        if (lower === PROXY_SELLER_API_PREFIX)
            return PROXY_SELLER_API_PREFIX;
        if (lower.startsWith(`${PROXY_SELLER_API_PREFIX}/`))
            return PROXY_SELLER_API_PREFIX;
    }
    return path;
}
function normalizeIpipdBasePath(hostname, pathname) {
    const lowerHost = hostname.toLowerCase();
    const lowerPath = pathname.toLowerCase();
    const canonicalHost = lowerHost === 'api.ipipd.cn' || lowerHost === 'api.sandbox.ipipd.cn';
    if (canonicalHost && (lowerPath === '/api' || lowerPath === `/api${IPIPD_API_PREFIX}`)) {
        return '';
    }
    return stripTrailingPath(pathname, IPIPD_API_PREFIX);
}
function stripTrailingPath(pathname, suffix) {
    const lowerPath = pathname.toLowerCase();
    const lowerSuffix = suffix.toLowerCase();
    if (lowerPath === lowerSuffix)
        return '';
    if (!lowerPath.endsWith(lowerSuffix))
        return pathname;
    return pathname.slice(0, -suffix.length).replace(/\/+$/, '');
}
function normalizePathname(pathname) {
    const path = pathname.replace(/\/+$/, '');
    return path === '/' ? '' : path;
}
function trimTrailingSlash(value) {
    return value.replace(/\/$/, '');
}
//# sourceMappingURL=provider-base-url.js.map