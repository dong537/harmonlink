"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletModule = void 0;
const common_1 = require("@nestjs/common");
const wallet_controller_1 = require("./wallet.controller");
const wallet_repository_1 = require("./wallet.repository");
const get_wallet_use_case_1 = require("./use-cases/get-wallet.use-case");
const list_ledger_use_case_1 = require("./use-cases/list-ledger.use-case");
const adjust_wallet_use_case_1 = require("./use-cases/adjust-wallet.use-case");
let WalletModule = class WalletModule {
};
exports.WalletModule = WalletModule;
exports.WalletModule = WalletModule = __decorate([
    (0, common_1.Module)({
        controllers: [wallet_controller_1.WalletController],
        providers: [wallet_repository_1.WalletRepository, get_wallet_use_case_1.GetWalletUseCase, list_ledger_use_case_1.ListLedgerUseCase, adjust_wallet_use_case_1.AdjustWalletUseCase],
        exports: [wallet_repository_1.WalletRepository],
    })
], WalletModule);
//# sourceMappingURL=wallet.module.js.map