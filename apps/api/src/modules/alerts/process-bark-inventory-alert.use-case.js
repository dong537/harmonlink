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
exports.ProcessBarkInventoryAlertUseCase = void 0;
const common_1 = require("@nestjs/common");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const bark_alert_outbox_repository_1 = require("./bark-alert-outbox.repository");
const bark_notification_adapter_1 = require("./bark-notification.adapter");
let ProcessBarkInventoryAlertUseCase = class ProcessBarkInventoryAlertUseCase {
    outbox;
    notifier;
    constructor(outbox, notifier) {
        this.outbox = outbox;
        this.notifier = notifier;
    }
    async execute(eventId, workerId) {
        const event = await this.outbox.claimRunnableEvent(eventId, workerId);
        if (!event)
            return { eventId, outcome: 'NOOP', reasonKey: 'bark_alert_event_not_claimable' };
        if (event.topic !== bark_alert_outbox_repository_1.BARK_INVENTORY_LOW_TOPIC) {
            const status = await this.outbox.markFailed(event, workerId, 'BARK_ALERT_TOPIC_UNSUPPORTED', { reasonKey: 'bark_alert_topic_unsupported', topic: event.topic }, { retry: false });
            return { eventId, outcome: status, reasonKey: 'bark_alert_topic_unsupported' };
        }
        let payload;
        try {
            payload = parseInventoryLowPayload(event.payload);
        }
        catch (error) {
            const reasonKey = error instanceof app_error_1.AppError ? error.reasonKey : 'bark_alert_payload_invalid';
            const status = await this.outbox.markFailed(event, workerId, 'BARK_ALERT_PAYLOAD_INVALID', { reasonKey }, { retry: false });
            return { eventId, outcome: status, reasonKey };
        }
        try {
            const result = await this.notifier.send({
                title: 'Dedicated line inventory low',
                body: buildAlertBody(payload),
                group: 'dedicated-line-inventory',
                dedupeKey: event.dedupeKey,
            });
            await this.outbox.markPublished(event, workerId);
            return { eventId, outcome: 'PUBLISHED', delivered: result.delivered };
        }
        catch (error) {
            return this.recordFailure(event, workerId, error);
        }
    }
    async recordFailure(event, workerId, error) {
        const appError = error instanceof app_error_1.AppError ? error : null;
        const reasonKey = appError?.reasonKey ?? 'bark_alert_internal_error';
        const retry = isRetryable(appError);
        const status = await this.outbox.markFailed(event, workerId, appError?.code ?? error_codes_1.ErrorCode.INTERNAL_ERROR, {
            reasonKey,
            httpStatus: appError?.httpStatus ?? 500,
            ...(appError?.details ? { details: appError.details } : {}),
            ...(appError ? {} : { message: error instanceof Error ? error.message.slice(0, 300) : String(error) }),
        }, { retry });
        return { eventId: event.id, outcome: status, reasonKey };
    }
};
exports.ProcessBarkInventoryAlertUseCase = ProcessBarkInventoryAlertUseCase;
exports.ProcessBarkInventoryAlertUseCase = ProcessBarkInventoryAlertUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [bark_alert_outbox_repository_1.BarkAlertOutboxRepository,
        bark_notification_adapter_1.BarkNotificationAdapter])
], ProcessBarkInventoryAlertUseCase);
function isRetryable(error) {
    if (!error)
        return true;
    return error.code === error_codes_1.ErrorCode.UPSTREAM_ERROR || error.code === error_codes_1.ErrorCode.UPSTREAM_TIMEOUT;
}
function parseInventoryLowPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'bark_alert_payload_invalid', 422);
    }
    const record = raw;
    const providerCode = readString(record['providerCode']);
    const providerAccountId = readString(record['providerAccountId']);
    const skuId = readString(record['skuId']);
    const countryCode = readString(record['countryCode']);
    // Only the inventory scope is mandatory. A total outage is reported with no provider
    // at all, so requiring one here would bounce the most severe alert to the operator
    // queue and never notify anyone.
    if (!skuId || !countryCode) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'bark_alert_payload_invalid', 422);
    }
    return {
        providerCode,
        providerAccountId,
        skuId,
        countryCode,
        requestedQuantity: readNumber(record['requestedQuantity']),
        availableQuantity: readNumber(record['availableQuantity']),
        sourceVersion: readNumber(record['sourceVersion']),
    };
}
function readString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function buildAlertBody(payload) {
    const requested = payload.requestedQuantity ?? 'unknown';
    const available = payload.availableQuantity ?? 'unknown';
    // `none` marks a total outage with no route to blame; provider codes are uppercase,
    // so the token cannot be mistaken for one.
    const provider = payload.providerCode ?? 'none';
    return [
        `provider=${provider}`,
        `country=${payload.countryCode}`,
        `sku=${payload.skuId}`,
        `requested=${requested}`,
        `available=${available}`,
    ].join(' ');
}
//# sourceMappingURL=process-bark-inventory-alert.use-case.js.map