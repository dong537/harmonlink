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
exports.ManagedLineProjectionAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const aes_gcm_1 = require("../../common/crypto/aes-gcm");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const ssrf_1 = require("../../common/utils/ssrf");
const provider_http_1 = require("../providers/provider-http");
let ManagedLineProjectionAdapter = class ManagedLineProjectionAdapter {
    config;
    fetchImpl;
    constructor(config, fetchImpl = fetch) {
        this.config = config;
        this.fetchImpl = fetchImpl;
    }
    async upsert(node, projectionKey, request) {
        const response = await this.request(node, 'PUT', projectionKey, request);
        if (!response)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_response_invalid', 502);
        return response;
    }
    async get(node, projectionKey) {
        const response = await this.request(node, 'GET', projectionKey);
        if (!response)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_response_invalid', 502);
        return response;
    }
    async delete(node, projectionKey, desiredVersion) {
        if (!Number.isInteger(desiredVersion) || desiredVersion < 1) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'managed_line_desired_version_invalid', 400);
        }
        let deleteConflict = null;
        try {
            await this.request(node, 'DELETE', projectionKey, undefined, { desiredVersion: String(desiredVersion) });
        }
        catch (error) {
            if (isProjectionNotFound(error))
                return;
            if (!isProjectionConflict(error))
                throw error;
            deleteConflict = error;
        }
        try {
            const observed = await this.get(node, projectionKey);
            if (observed.status === 'DELETED'
                && observed.desiredVersion === desiredVersion
                && observed.observedVersion === desiredVersion)
                return;
        }
        catch (error) {
            if (isProjectionNotFound(error)) {
                if (deleteConflict)
                    throw deleteConflict;
                return;
            }
            throw error;
        }
        if (deleteConflict)
            throw deleteConflict;
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_projection_delete_not_confirmed', 502);
    }
    async request(node, method, projectionKey, body, query) {
        validateProjectionKey(projectionKey);
        const baseUrl = normalizeBaseUrl(node.baseUrl);
        (0, ssrf_1.assertSafeUrl)(baseUrl);
        const token = this.decryptToken(node.apiCredentialCiphertext);
        const suffix = query ? `?${new URLSearchParams(query).toString()}` : '';
        const url = `${baseUrl}/panel/api/managed-line-projections/${encodeURIComponent(projectionKey)}${suffix}`;
        const timeoutMs = this.config.get('CONTROL_NODE_REQUEST_TIMEOUT_MS');
        let response;
        try {
            response = await (0, provider_http_1.fetchWithTimeout)(url, {
                method,
                headers: {
                    authorization: `Bearer ${token}`,
                    ...(body ? { 'content-type': 'application/json' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            }, timeoutMs, this.fetchImpl);
        }
        catch (error) {
            if (error instanceof app_error_1.AppError)
                throw error;
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_request_failed', 502);
        }
        if (!response.ok)
            throw mapRemoteError(response);
        if (method === 'DELETE' && response.status === 204)
            return undefined;
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_response_invalid', 502);
        }
        if (!isProjectionResponse(payload)) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_response_invalid', 502);
        }
        return payload;
    }
    decryptToken(ciphertext) {
        if (!ciphertext.trim()) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CONFIG_INVALID, 'control_node_credential_missing', 500);
        }
        try {
            const token = (0, aes_gcm_1.decryptAesGcm)(ciphertext, this.config.get('APP_ENCRYPTION_KEY')).trim();
            if (!token)
                throw new Error('empty_token');
            return token;
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CONFIG_INVALID, 'control_node_credential_invalid', 500);
        }
    }
};
exports.ManagedLineProjectionAdapter = ManagedLineProjectionAdapter;
exports.ManagedLineProjectionAdapter = ManagedLineProjectionAdapter = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService, Function])
], ManagedLineProjectionAdapter);
function isProjectionNotFound(error) {
    return error instanceof app_error_1.AppError && error.code === error_codes_1.ErrorCode.NOT_FOUND && error.reasonKey === 'managed_line_projection_not_found';
}
function isProjectionConflict(error) {
    return error instanceof app_error_1.AppError && error.code === error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT && error.reasonKey === 'managed_line_projection_conflict';
}
function normalizeBaseUrl(value) {
    const trimmed = value.trim().replace(/\/+$/, '');
    if (!trimmed)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.CONTROL_NODE_CONFIG_INVALID, 'control_node_base_url_missing', 500);
    return trimmed;
}
function validateProjectionKey(value) {
    if (value.length < 1 || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'managed_line_projection_key_invalid', 400);
    }
}
function mapRemoteError(response) {
    switch (response.status) {
        case 404:
            return new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'managed_line_projection_not_found', 404);
        case 409:
            return new app_error_1.AppError(error_codes_1.ErrorCode.IDEMPOTENCY_CONFLICT, 'managed_line_projection_conflict', 409);
        case 401:
        case 403:
            return new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'managed_line_control_node_unauthorized', 502);
        case 408:
        case 429:
            return new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_TIMEOUT, 'managed_line_control_node_busy', 504);
        case 400:
        case 422:
            return new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'managed_line_projection_request_invalid', 422);
        default:
            return new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'managed_line_control_node_error', 502);
    }
}
function isProjectionResponse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const record = value;
    return typeof record['projectionKey'] === 'string'
        && Number.isInteger(record['desiredVersion'])
        && typeof record['status'] === 'string';
}
//# sourceMappingURL=managed-line-projection.adapter.js.map