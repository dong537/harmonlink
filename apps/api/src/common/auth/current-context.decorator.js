"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentContext = void 0;
const common_1 = require("@nestjs/common");
const app_error_1 = require("../errors/app-error");
const error_codes_1 = require("../errors/error-codes");
exports.CurrentContext = (0, common_1.createParamDecorator)((_data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.authContext) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.AUTH_REQUIRED, 'AUTH_REQUIRED', 401);
    }
    return req.authContext;
});
//# sourceMappingURL=current-context.decorator.js.map