"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReclaimExpiredReservationsUseCase = exports.ReserveDedicatedLineStockUseCase = void 0;
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
class ReserveDedicatedLineStockUseCase {
    source;
    constructor(source) {
        this.source = source;
    }
    async execute(input) {
        assertInput(input);
        const normalizedInput = {
            ...input,
            providerCode: input.providerCode.trim(),
            countryCode: input.countryCode.trim().toUpperCase(),
            idempotencyKey: input.idempotencyKey.trim(),
        };
        const result = await this.source.reserveAndEnqueue(normalizedInput);
        if (result.kind === 'INSUFFICIENT') {
            await this.source.enqueueInventoryLowAlert({
                siteId: normalizedInput.siteId,
                tenantId: normalizedInput.tenantId,
                userId: normalizedInput.userId,
                ...result,
            });
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_insufficient', 422, undefined, {
                providerCode: result.providerCode,
                skuId: result.skuId,
                countryCode: result.countryCode,
                requestedQuantity: result.requestedQuantity,
                availableQuantity: result.availableQuantity,
                sourceVersion: result.sourceVersion,
            });
        }
        return result;
    }
}
exports.ReserveDedicatedLineStockUseCase = ReserveDedicatedLineStockUseCase;
function assertInput(input) {
    if (!input.siteId || !input.tenantId || !input.userId || !input.providerCode || !input.providerAccountId || !input.skuId) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_scope_required', 400);
    }
    if (!/^[A-Z]{2}$/.test(input.countryCode.trim().toUpperCase())) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'quantity_invalid', 400);
    }
    if (!input.idempotencyKey.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'idempotency_key_required', 400);
    }
    if (!input.charge || typeof input.charge.amount !== 'string' || !input.charge.amount.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_charge_required', 400);
    }
    if (!input.charge.currency?.trim() || !input.charge.idempotencyKey?.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_charge_required', 400);
    }
    if (!input.jobPayload || typeof input.jobPayload !== 'object' || Array.isArray(input.jobPayload)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'job_payload_invalid', 400);
    }
    const snapshot = input.orderSnapshot;
    if (!snapshot
        || !snapshot.skuCode?.trim()
        || !snapshot.skuName?.trim()
        || snapshot.durationDays !== input.jobPayload['durationDays']
        || !snapshot.unitPrice?.trim()
        || !snapshot.totalPrice?.trim()
        || !snapshot.currency?.trim()
        || !snapshot.priceSource?.trim()
        || !Number.isInteger(snapshot.contractVersion)
        || snapshot.contractVersion < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'dedicated_line_order_snapshot_invalid', 400);
    }
}
// Returns stock and money for reservations that expired before their purchase was
// ever issued. A reservation whose purchase already reached the provider is left
// untouched on purpose: the upstream resource may be paid for, so releasing it
// here would refund a delivered order and oversell the inventory.
class ReclaimExpiredReservationsUseCase {
    source;
    constructor(source) {
        this.source = source;
    }
    async execute(now, limit = 100) {
        const candidates = await this.source.findExpiredCandidates(now, limit);
        let reclaimed = 0;
        let skippedIssued = 0;
        for (const candidate of candidates) {
            if (!candidate.neverIssued) {
                skippedIssued += 1;
                continue;
            }
            if (await this.source.reclaim(candidate, now))
                reclaimed += 1;
        }
        return { scanned: candidates.length, reclaimed, skippedIssued };
    }
}
exports.ReclaimExpiredReservationsUseCase = ReclaimExpiredReservationsUseCase;
//# sourceMappingURL=domain.js.map