"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSafeUrl = assertSafeUrl;
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
const PRIVATE_IP_PATTERNS = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
];
function assertSafeUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'unsafe_upstream_url', 400, `Invalid URL: ${url}`);
    }
    if (parsed.protocol !== 'https:') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'unsafe_upstream_url', 400, 'Only https URLs are allowed');
    }
    const hostname = parsed.hostname;
    for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'unsafe_upstream_url', 400, 'Private/loopback addresses are not allowed');
        }
    }
}
//# sourceMappingURL=ssrf.js.map