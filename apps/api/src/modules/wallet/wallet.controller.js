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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletController = void 0;
const common_1 = require("@nestjs/common");
const get_wallet_use_case_1 = require("./use-cases/get-wallet.use-case");
const list_ledger_use_case_1 = require("./use-cases/list-ledger.use-case");
const adjust_wallet_use_case_1 = require("./use-cases/adjust-wallet.use-case");
const guards_1 = require("../../common/auth/guards");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
let WalletController = class WalletController {
    getWallet;
    listLedger;
    adjustWallet;
    constructor(getWallet, listLedger, adjustWallet) {
        this.getWallet = getWallet;
        this.listLedger = listLedger;
        this.adjustWallet = adjustWallet;
    }
    async get(ctx, userId) {
        return this.getWallet.execute(ctx, userId);
    }
    async ledger(ctx, userId, query) {
        return this.listLedger.execute(ctx, userId, query);
    }
    async adjust(ctx, userId, body) {
        return this.adjustWallet.execute(ctx, userId, body);
    }
};
exports.WalletController = WalletController;
__decorate([
    (0, common_1.Get)(':userId'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':userId/ledger'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "ledger", null);
__decorate([
    (0, common_1.Post)(':userId/adjust'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], WalletController.prototype, "adjust", null);
exports.WalletController = WalletController = __decorate([
    (0, common_1.Controller)('wallet'),
    __metadata("design:paramtypes", [get_wallet_use_case_1.GetWalletUseCase,
        list_ledger_use_case_1.ListLedgerUseCase,
        adjust_wallet_use_case_1.AdjustWalletUseCase])
], WalletController);
//# sourceMappingURL=wallet.controller.js.map