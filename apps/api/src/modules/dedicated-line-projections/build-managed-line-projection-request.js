"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildManagedLineProjectionRequest = buildManagedLineProjectionRequest;
const aes_gcm_1 = require("../../common/crypto/aes-gcm");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
function buildManagedLineProjectionRequest(source, encryptionKey) {
    const identity = decryptObject(source.clientIdentityCiphertext, encryptionKey, 'dedicated_line_client_identity_invalid');
    const endpoint = decryptObject(source.endpointCiphertext, encryptionKey, 'dedicated_line_exit_endpoint_invalid');
    const credential = decryptObject(source.credentialCiphertext, encryptionKey, 'dedicated_line_exit_credential_invalid');
    const client = source.protocol === 'MIXED'
        ? { email: source.clientEmail, user: requiredString(identity, 'user'), password: requiredString(identity, 'password') }
        : { email: source.clientEmail, id: requiredString(identity, 'id'), ...optionalFlow(identity) };
    return {
        desiredVersion: source.desiredVersion,
        inboundTag: source.inboundTag,
        protocol: source.protocol,
        client,
        egress: {
            host: requiredString(endpoint, 'host'),
            port: requiredPort(endpoint, 'port'),
            username: requiredString(credential, 'username'),
            password: requiredString(credential, 'password'),
        },
        lifecycle: {
            enabled: source.lineStatus === 'PROVISIONING' || source.lineStatus === 'ACTIVE' || source.lineStatus === 'DEGRADED' || source.lineStatus === 'MIGRATING_AWAITING_ROUTE_IMPORT',
            expiresAtMs: source.expiresAt?.getTime() ?? 0,
            trafficLimitBytes: safeBigIntNumber(source.quotaBytes, 'dedicated_line_quota_invalid'),
            ipLimit: source.ipLimit ?? 0,
            uplinkLimitBps: safeBigIntNumber(source.uplinkLimitBps, 'dedicated_line_uplink_limit_invalid'),
            downlinkLimitBps: safeBigIntNumber(source.downlinkLimitBps, 'dedicated_line_downlink_limit_invalid'),
            maxConnections: safeNonNegativeInt(source.maxConnections),
        },
    };
}
function decryptObject(ciphertext, key, reasonKey) {
    try {
        const value = JSON.parse((0, aes_gcm_1.decryptAesGcm)(ciphertext, key));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('not_object');
        return value;
    }
    catch {
        invalid(reasonKey);
    }
}
function requiredString(record, key) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim())
        invalid(`dedicated_line_${key}_invalid`);
    return value.trim();
}
function requiredPort(record, key) {
    const value = record[key];
    if (!Number.isInteger(value) || value < 1 || value > 65_535)
        invalid('dedicated_line_exit_port_invalid');
    return value;
}
function optionalFlow(record) {
    const flow = record['flow'];
    return typeof flow === 'string' && flow.trim() ? { flow: flow.trim() } : {};
}
function safeBigIntNumber(value, reasonKey) {
    if (value === null)
        return 0;
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
        invalid(reasonKey);
    return Number(value);
}
function safeNonNegativeInt(value) {
    if (value === null)
        return 0;
    if (!Number.isSafeInteger(value) || value < 0)
        invalid('dedicated_line_connection_limit_invalid');
    return value;
}
function invalid(reasonKey) {
    throw new app_error_1.AppError(error_codes_1.ErrorCode.DEDICATED_LINE_CONFIG_INVALID, reasonKey, 500);
}
//# sourceMappingURL=build-managed-line-projection-request.js.map