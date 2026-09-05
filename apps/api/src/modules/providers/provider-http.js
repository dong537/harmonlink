"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
exports.assertProviderActive = assertProviderActive;
exports.upstreamUrl = upstreamUrl;
exports.recordUpstreamRequest = recordUpstreamRequest;
const node_crypto_1 = require("node:crypto");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const request_id_context_1 = require("../../common/logging/request-id.context");
async function fetchWithTimeout(url, opts, timeoutMs, fetchImpl = fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...opts, signal: controller.signal });
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_TIMEOUT, 'upstream_timeout', 504);
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
function assertProviderActive(config) {
    if (config.status === 'DISABLED') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_DISABLED, 'provider_disabled', 503);
    }
}
function upstreamUrl(baseUrl, path) {
    const base = baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}
async function recordUpstreamRequest(input) {
    const startedAt = Date.now();
    try {
        const result = await input.run();
        await writeLog(input.logRepo, input.config, {
            operation: input.operation,
            durationMs: Date.now() - startedAt,
            status: result.status ?? 'SUCCESS',
            errorCode: result.errorCode,
            requestSummary: input.requestSummary,
            responseSummary: result.responseSummary,
        });
        return result.value;
    }
    catch (err) {
        await writeLog(input.logRepo, input.config, {
            operation: input.operation,
            durationMs: Date.now() - startedAt,
            status: statusFromError(err),
            errorCode: errorCodeFromError(err),
            requestSummary: input.requestSummary,
        });
        throw err;
    }
}
function statusFromError(err) {
    if (err instanceof app_error_1.AppError && err.code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT)
        return 'TIMEOUT';
    return 'ERROR';
}
function errorCodeFromError(err) {
    if (err instanceof app_error_1.AppError)
        return err.code;
    return 'UPSTREAM_ERROR';
}
async function writeLog(logRepo, config, data) {
    if (!logRepo || !config.siteId)
        return;
    try {
        await logRepo.create({
            siteId: config.siteId,
            providerCode: config.code,
            upstreamAccountId: config.upstreamAccountId,
            operation: data.operation,
            requestId: request_id_context_1.requestIdStorage.getStore() ?? (0, node_crypto_1.randomUUID)(),
            durationMs: data.durationMs,
            status: data.status,
            errorCode: data.errorCode,
            requestSummary: data.requestSummary,
            responseSummary: data.responseSummary,
        });
    }
    catch (err) {
        // Observability failures must be visible, but should not mask the upstream result.
        console.error('upstream_request_log_failed', err instanceof Error ? err.message : String(err));
    }
}
//# sourceMappingURL=provider-http.js.map