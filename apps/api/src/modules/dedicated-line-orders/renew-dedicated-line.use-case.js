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
exports.RenewDedicatedLineUseCase = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
let RenewDedicatedLineUseCase = class RenewDedicatedLineUseCase {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async execute(input) {
        const { lineId, durationDays, idempotencyKey } = input;
        // 查找专线和 SKU
        const line = await this.prisma.dedicated_lines.findUnique({
            where: { id: lineId },
            include: { sku: true },
        });
        if (!line) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
        }
        // 计算续费金额（简化版）
        const dailyRate = 10;
        const unitPrice = dailyRate * durationDays;
        const totalPrice = unitPrice;
        // 创建续费订单
        const order = await this.prisma.dedicated_line_orders.create({
            data: {
                siteId: line.siteId,
                tenantId: line.tenantId,
                userId: line.userId,
                skuId: line.skuId,
                skuCode: line.sku.code,
                skuName: line.sku.name,
                countryCode: line.countryCode,
                regionCode: null,
                businessType: line.protocol,
                durationDays,
                quantity: 1,
                unitPrice,
                totalPrice,
                currency: 'CNY',
                priceSource: 'renewal',
                contractVersion: 1,
                idempotencyKey,
            },
        });
        return {
            orderId: order.id,
            totalPrice: order.totalPrice.toString(),
            currency: order.currency,
        };
    }
};
exports.RenewDedicatedLineUseCase = RenewDedicatedLineUseCase;
exports.RenewDedicatedLineUseCase = RenewDedicatedLineUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RenewDedicatedLineUseCase);
//# sourceMappingURL=renew-dedicated-line.use-case.js.map