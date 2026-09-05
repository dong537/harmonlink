"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authBody = authBody;
exports.authToken = authToken;
exports.authEmail = authEmail;
exports.authSecret = authSecret;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
// Bounds exist so a hostile body cannot push unbounded strings into bcrypt or a
// Prisma lookup. 254 is the RFC 5321 address limit; bcrypt only consumes the
// first 72 bytes of a password, so 512 is generous while still bounded.
const MAX_EMAIL_LENGTH = 254;
const MAX_SECRET_LENGTH = 512;
const MAX_TOKEN_LENGTH = 256;
/**
 * Narrows an untrusted request body to a plain object. `@Body()` is only a
 * compile-time annotation in this codebase: there is no global ValidationPipe,
 * so an absent body arrives as `undefined` and reaches use-case code unchecked.
 */
function authBody(value, reasonKey) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    return value;
}
/**
 * Reads a required identifier-like field. Trimmed, because these are normalized
 * on write and surrounding whitespace is never significant.
 */
function authToken(value, reasonKey, maxLength = MAX_TOKEN_LENGTH) {
    if (typeof value !== 'string') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    return trimmed;
}
function authEmail(value, reasonKey) {
    return authToken(value, reasonKey, MAX_EMAIL_LENGTH);
}
/**
 * Reads a required secret. Deliberately NOT trimmed: whitespace is part of a
 * password, and normalizing it here would silently change the credential a user
 * actually registered with.
 */
function authSecret(value, reasonKey) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SECRET_LENGTH) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    }
    return value;
}
//# sourceMappingURL=auth-input.js.map