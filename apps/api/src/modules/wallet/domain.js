"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSameCurrency = assertSameCurrency;
exports.assertSufficientBalance = assertSufficientBalance;
exports.assertPositiveAmount = assertPositiveAmount;
const decimal_js_1 = __importDefault(require("decimal.js"));
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
function assertSameCurrency(a, b) {
    if (a !== b) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'currency_mismatch', 422, `Expected ${a}, got ${b}`);
    }
}
function assertSufficientBalance(available, amount) {
    if (new decimal_js_1.default(available).lessThan(new decimal_js_1.default(amount))) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.WALLET_INSUFFICIENT_BALANCE, 'wallet_insufficient_balance', 422);
    }
}
function assertPositiveAmount(amount) {
    if (!new decimal_js_1.default(amount).greaterThan(0)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'amount_must_be_positive', 400);
    }
}
//# sourceMappingURL=domain.js.map