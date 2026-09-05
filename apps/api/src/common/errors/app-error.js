"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
class AppError extends Error {
    code;
    reasonKey;
    httpStatus;
    details;
    constructor(code, reasonKey, httpStatus, message, details) {
        super(message ?? reasonKey);
        this.code = code;
        this.reasonKey = reasonKey;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}
exports.AppError = AppError;
//# sourceMappingURL=app-error.js.map