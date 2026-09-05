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
exports.GetWalletUseCase = void 0;
const common_1 = require("@nestjs/common");
const wallet_repository_1 = require("../wallet.repository");
const db_1 = require("@ipeasy/db");
const request_id_context_1 = require("../../../common/logging/request-id.context");
const access_1 = require("../access");
let GetWalletUseCase = class GetWalletUseCase {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(ctx, userId) {
        const wallet = await (0, access_1.getWalletForContext)(this.repo, ctx, userId);
        if (ctx.ownerType === 'PLATFORM_ADMIN') {
            const requestId = request_id_context_1.requestIdStorage.getStore() ?? '';
            await db_1.prisma.audit_logs.create({
                data: {
                    siteId: ctx.siteId,
                    tenantId: wallet.tenantId,
                    actorType: 'ADMIN_USER',
                    actorId: ctx.ownerId,
                    targetType: 'wallet',
                    targetId: wallet.id,
                    action: 'wallet.read',
                    requestId,
                },
            });
        }
        return {
            id: wallet.id,
            userId: wallet.userId,
            available: wallet.available.toString(),
            frozen: wallet.frozen.toString(),
            currency: wallet.currency,
            updatedAt: wallet.updatedAt,
        };
    }
};
exports.GetWalletUseCase = GetWalletUseCase;
exports.GetWalletUseCase = GetWalletUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], GetWalletUseCase);
//# sourceMappingURL=get-wallet.use-case.js.map