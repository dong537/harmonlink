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
exports.MigrationSmokeAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const ssrf_1 = require("../../common/utils/ssrf");
const provider_http_1 = require("../providers/provider-http");
let MigrationSmokeAdapter = class MigrationSmokeAdapter {
    config;
    fetchImpl;
    constructor(config, fetchImpl) {
        this.config = config;
        this.fetchImpl = fetchImpl;
    }
    async verify(hostname, port) {
        const targetUrl = this.config.get('DEDICATED_LINE_MIGRATION_SMOKE_TARGET_URL');
        (0, ssrf_1.assertSafeUrl)(targetUrl);
        const started = Date.now();
        let response;
        try {
            response = await (0, provider_http_1.fetchWithTimeout)(`${targetUrl}?hostname=${encodeURIComponent(hostname)}&port=${port}`, { headers: { accept: 'application/json' } }, this.config.get('DEDICATED_LINE_MIGRATION_SMOKE_TIMEOUT_MS'), this.fetchImpl);
        }
        catch (error) {
            if (error instanceof app_error_1.AppError && error.code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT) {
                throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_TIMEOUT, 'dedicated_line_migration_smoke_timeout', 504);
            }
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'dedicated_line_migration_smoke_network_error', 502);
        }
        const latencyMs = Date.now() - started;
        if (!response.ok)
            return { verified: false, observedIp: null, observedCountry: null, latencyMs, stabilitySamples: 1, failureCode: `HTTP_${response.status}`, detail: { stage: 'protocol' } };
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            return { verified: false, observedIp: null, observedCountry: null, latencyMs, stabilitySamples: 1, failureCode: 'TARGET_RESPONSE_INVALID', detail: { stage: 'protocol' } };
        }
        const observedIp = typeof payload.ip === 'string' ? payload.ip : null;
        const observedCountry = typeof payload.country === 'string' ? payload.country : null;
        if (!observedIp || !observedCountry)
            return { verified: false, observedIp, observedCountry, latencyMs, stabilitySamples: 1, failureCode: 'TARGET_RESPONSE_INVALID', detail: { stage: 'protocol' } };
        return { verified: true, observedIp, observedCountry, latencyMs, stabilitySamples: 1, failureCode: null, detail: { stage: 'protocol' } };
    }
};
exports.MigrationSmokeAdapter = MigrationSmokeAdapter;
exports.MigrationSmokeAdapter = MigrationSmokeAdapter = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)('MIGRATION_SMOKE_FETCH')),
    __metadata("design:paramtypes", [config_service_1.ConfigService, Object])
], MigrationSmokeAdapter);
//# sourceMappingURL=migration-smoke.adapter.js.map