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
exports.ListLedgerUseCase = void 0;
const common_1 = require("@nestjs/common");
const wallet_repository_1 = require("../wallet.repository");
const access_1 = require("../access");
let ListLedgerUseCase = class ListLedgerUseCase {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(ctx, userId, query) {
        const wallet = await (0, access_1.getWalletForContext)(this.repo, ctx, userId);
        const result = await this.repo.listLedgerEntries(wallet.id, wallet.tenantId, query);
        return {
            ...result,
            items: result.items.map(toDto),
        };
    }
};
exports.ListLedgerUseCase = ListLedgerUseCase;
exports.ListLedgerUseCase = ListLedgerUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wallet_repository_1.WalletRepository])
], ListLedgerUseCase);
function toDto(e) {
    return {
        id: e.id,
        type: e.type,
        amount: e.amount.toString(),
        balanceAfter: e.balanceAfter.toString(),
        currency: e.currency,
        relatedId: e.relatedId,
        reason: e.reason,
        createdAt: e.createdAt,
    };
}
//# sourceMappingURL=list-ledger.use-case.js.map