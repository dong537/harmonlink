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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarkNotificationAdapter = exports.BARK_NOTIFICATION_FETCH = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const ssrf_1 = require("../../common/utils/ssrf");
const provider_http_1 = require("../providers/provider-http");
exports.BARK_NOTIFICATION_FETCH = 'BARK_NOTIFICATION_FETCH';
let BarkNotificationAdapter = class BarkNotificationAdapter {
    config;
    fetchImpl;
    constructor(config, fetchImpl) {
        this.config = config;
        this.fetchImpl = fetchImpl ?? fetch;
    }
    deviceKeyCount() {
        return this.deviceKeys().length;
    }
    async send(notification) {
        const deviceKeys = this.deviceKeys();
        if (deviceKeys.length === 0) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'bark_device_keys_missing', 422);
        }
        const serverUrl = this.config.get('BARK_SERVER_URL').replace(/\/$/, '');
        (0, ssrf_1.assertSafeUrl)(serverUrl);
        const timeoutMs = this.config.get('BARK_REQUEST_TIMEOUT_MS');
        let delivered = 0;
        let lastFailure = null;
        for (const deviceKey of deviceKeys) {
            try {
                await this.push(serverUrl, deviceKey, notification, timeoutMs);
                delivered += 1;
            }
            catch (error) {
                lastFailure = error instanceof app_error_1.AppError
                    ? error
                    : new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'bark_network_error', 502, redactDeviceKeys(error instanceof Error ? error.message : String(error), deviceKeys).slice(0, 300));
            }
        }
        if (delivered === 0 && lastFailure)
            throw lastFailure;
        return { attempted: deviceKeys.length, delivered };
    }
    async push(serverUrl, deviceKey, notification, timeoutMs) {
        const response = await (0, provider_http_1.fetchWithTimeout)(`${serverUrl}/push`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                device_key: deviceKey,
                title: notification.title,
                body: notification.body,
                group: notification.group,
            }),
        }, timeoutMs, this.fetchImpl);
        if (!response.ok) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'bark_http_error', 502, undefined, {
                upstreamHttpStatus: response.status,
            });
        }
        const raw = await response.text();
        let envelope;
        try {
            envelope = JSON.parse(raw);
        }
        catch {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'bark_response_invalid', 502);
        }
        const code = readCode(envelope);
        if (code !== 200) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'bark_envelope_error', 502, undefined, {
                upstreamCode: code,
            });
        }
    }
    deviceKeys() {
        return this.config
            .get('BARK_DEVICE_KEYS')
            .split(',')
            .map((key) => key.trim())
            .filter((key) => key.length > 0);
    }
};
exports.BarkNotificationAdapter = BarkNotificationAdapter;
exports.BarkNotificationAdapter = BarkNotificationAdapter = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(exports.BARK_NOTIFICATION_FETCH)),
    __metadata("design:paramtypes", [config_service_1.ConfigService, Function])
], BarkNotificationAdapter);
function redactDeviceKeys(text, deviceKeys) {
    return deviceKeys.reduce((acc, deviceKey) => (deviceKey.length > 0 ? acc.split(deviceKey).join('[redacted]') : acc), text);
}
function readCode(envelope) {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
        return null;
    const code = envelope['code'];
    return typeof code === 'number' ? code : null;
}
//# sourceMappingURL=bark-notification.adapter.js.map