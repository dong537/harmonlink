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
exports.AdjustWalletUseCase = void 0;
const common_1 = require("@nestjs/common");
const db_1 = require("@ipeasy/db");
const wallet_repository_1 = require("../wallet.repository");
const tenant_guard_1 = require("../../../common/auth/tenant-guard");
const app_error_1 = require("../../../common/errors/app-error");
const error_codes_1 = require("../../../common/errors/error-codes");
const domain_1 = require("../domain");
const request_id_context_1 = require("../../../common/logging/request-id.context");
let AdjustWalletUseCase = class AdjustWalletUseCase {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(ctx, userId, dto) {
        if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'admin_only', 403);
        }
        (0, domain_1.assertPositiveAmount)(dto.amount);
        if (!dto.reason)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'reason_required', 400);
        if (!dto.idempotencyKey)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'idempotency_key_required', 400);
        const wallet = await this.repo.getWalletByUserId(userId, ctx.siteId);
        if (ctx.ownerType === 'TENANT_ADMIN') {
            (0, tenant_guard_1.assertTenantAccess)(ctx, wallet.tenantId);
        }
        (0, domain_1.assertSameCurrency)(wallet.currency, dto.currency);
        const idempotencyKey = dto.idempotencyKey;
        const reason = dto.reason;
        const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
        const updatedWallet = await db_1.prisma.$transaction(async (tx) => {
            const txClient = tx;
            if (dto.direction === 'credit') {
                await this.repo.creditWalletTx(txClient, wallet.id, dto.amount, dto.currency, 'ADJUSTMENT', ctx.ownerId, reason, idempotencyKey);
            }
            else {
                await this.repo.debitWalletTx(txClient, wallet.id, dto.amount, dto.currency, 'ADJUSTMENT', ctx.ownerId, reason, idempotencyKey);
            }
            await tx.audit_logs.create({
                data: {
                    siteId: ctx.siteId,
                    tenantId: wallet.tenantId,
                    actorType: 'ADMIN_USER',
                    actorId: ctx.ownerId,
                    targetType: 'wallet',
                    targetId: wallet.id,
                    action: 'wallet.adjust',
                    reason,
                    requestId,
                    meta: { targetUserId: userId, amount: dto.amount, direction: dto.direction, idempotencyKey },
                },
            });
            return tx.wallets.findUniqueOrThrow({ where: { id: wallet.id } });
        });
        return {
            id: updatedWallet.id,
            userId: updatedWallet.userId,
            available: updatedWallet.available.toString(),
            frozen: updatedWallet.frozen.toString(),
            currency: updatedWallet.currency,
            updatedAt: updatedWallet.updatedAt,
        };
    }
};
exports.AdjustWalletUseCase = AdjustWalletUseCase;
exports.AdjustWalletUseCase = AdjustWalletUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], AdjustWalletUseCase);
//# sourceMappingURL=adjust-wallet.use-case.js.map