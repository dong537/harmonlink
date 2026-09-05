"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFutureDeliveryExpiry = requireFutureDeliveryExpiry;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
function requireFutureDeliveryExpiry(value, options = {}) {
    const text = typeof value === 'string' ? value.trim() : '';
    const timestamp = parseTimestamp(text, options);
    const expiresAt = new Date(timestamp);
    if (!Number.isFinite(timestamp) || !Number.isFinite(expiresAt.getTime()) || timestamp <= Date.now()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'provider_delivery_expiry_invalid', 502);
    }
    return expiresAt;
}
function parseTimestamp(text, options) {
    if (/^\d{10}$/.test(text))
        return Number(text) * 1_000;
    if (/^\d{13}$/.test(text))
        return Number(text);
    if (options.timezoneLessUtc && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(text)) {
        return Date.parse(`${text.replace(' ', 'T')}Z`);
    }
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text))
        return Date.parse(text);
    return Number.NaN;
}
//# sourceMappingURL=provider-delivery-expiry.js.map