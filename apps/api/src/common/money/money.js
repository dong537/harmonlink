"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDecimalString = toDecimalString;
exports.addMoney = addMoney;
exports.subtractMoney = subtractMoney;
exports.isPositive = isPositive;
exports.isNonNegative = isNonNegative;
exports.assertCurrency = assertCurrency;
const decimal_js_1 = __importDefault(require("decimal.js"));
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
function toDecimalString(value) {
    return new decimal_js_1.default(value).toFixed();
}
function addMoney(a, b) {
    return new decimal_js_1.default(a).plus(new decimal_js_1.default(b)).toFixed();
}
function subtractMoney(a, b) {
    return new decimal_js_1.default(a).minus(new decimal_js_1.default(b)).toFixed();
}
function isPositive(value) {
    return new decimal_js_1.default(value).greaterThan(0);
}
function isNonNegative(value) {
    return new decimal_js_1.default(value).greaterThanOrEqualTo(0);
}
function assertCurrency(actual, expected) {
    if (actual !== expected) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.CURRENCY_NOT_SUPPORTED, 'CURRENCY_NOT_SUPPORTED', 422, `Expected ${expected}, got ${actual}`);
    }
}
//# sourceMappingURL=money.js.map