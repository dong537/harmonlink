"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkuQuoteUseCase = exports.SKU_PRICE_PRIORITY = void 0;
exports.selectSkuPrice = selectSkuPrice;
const decimal_js_1 = __importDefault(require("decimal.js"));
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
exports.SKU_PRICE_PRIORITY = [
    'USER_OVERRIDE',
    'USER_TEMPLATE',
    'TENANT_DEFAULT_TEMPLATE',
    'SITE_OVERRIDE',
    'SITE_DEFAULT_TEMPLATE',
];
function selectSkuPrice(candidateSets, currency) {
    for (const source of exports.SKU_PRICE_PRIORITY) {
        const set = candidateSets.find((candidateSet) => candidateSet.source === source);
        if (!set || set.candidates.length === 0)
            continue;
        const candidate = set.candidates.find((item) => item.currency === currency);
        if (candidate)
            return candidate;
        if (set.hasCurrencyMismatch) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'sku_currency_not_supported', 422);
        }
    }
    return null;
}
class SkuQuoteUseCase {
    source;
    constructor(source) {
        this.source = source;
    }
    async execute(input) {
        assertSkuQuoteInput(input);
        await this.source.assertBuyerScope(input.siteId, input.tenantId, input.userId);
        const sku = await this.source.findSku(input.siteId, input.skuCode);
        if (!sku) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'sku_not_found', 404);
        }
        if (!sku.isActive || !sku.isVisible) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PRODUCT_DISABLED, 'sku_not_saleable', 410);
        }
        if (sku.capabilities['delivery'] !== 'dedicated-line') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UNSUPPORTED_CAPABILITY, 'sku_not_dedicated_line', 422);
        }
        const candidateSets = await this.source.getPriceCandidates({
            siteId: input.siteId,
            tenantId: input.tenantId,
            userId: input.userId,
            skuId: sku.id,
            durationDays: input.durationDays,
            quantity: input.quantity,
        });
        const price = selectSkuPrice(candidateSets, input.currency);
        if (!price) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PRICE_MISSING, 'no_sku_price_rule', 422);
        }
        const unitPrice = new decimal_js_1.default(price.unitPrice);
        if (!unitPrice.isFinite() || unitPrice.isNegative()) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.INTERNAL_ERROR, 'sku_price_invalid', 500);
        }
        const capabilities = cloneAndFreezeJson(sku.capabilities);
        const contract = Object.freeze({
            skuId: sku.id,
            skuCode: sku.code,
            name: sku.name,
            description: sku.description,
            version: sku.contractVersion,
            capabilities,
        });
        return Object.freeze({
            skuId: sku.id,
            skuCode: sku.code,
            durationDays: input.durationDays,
            quantity: input.quantity,
            unitPrice: unitPrice.toFixed(),
            totalPrice: unitPrice.mul(input.quantity).toFixed(),
            currency: price.currency,
            priceSource: price.source,
            contractVersion: sku.contractVersion,
            contract,
        });
    }
}
exports.SkuQuoteUseCase = SkuQuoteUseCase;
function assertSkuQuoteInput(input) {
    if (!input.siteId || !input.tenantId || !input.userId || !input.skuCode?.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'sku_quote_required_fields_missing', 400);
    }
    if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'duration_days_invalid', 400);
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'quantity_invalid', 400);
    }
    if (!input.currency?.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'currency_required', 400);
    }
}
function cloneAndFreezeJson(value) {
    if (Array.isArray(value)) {
        return Object.freeze(value.map(cloneAndFreezeJson));
    }
    if (value !== null && typeof value === 'object') {
        return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAndFreezeJson(item)])));
    }
    return value;
}
//# sourceMappingURL=domain.js.map