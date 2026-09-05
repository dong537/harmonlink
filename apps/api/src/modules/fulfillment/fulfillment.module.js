"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FulfillmentModule = void 0;
const common_1 = require("@nestjs/common");
const fulfillment_repository_1 = require("./fulfillment.repository");
const fulfill_static_proxy_use_case_1 = require("./use-cases/fulfill-static-proxy.use-case");
const providers_module_1 = require("../providers/providers.module");
const config_service_1 = require("../../common/config/config.service");
const wallet_repository_1 = require("../wallet/wallet.repository");
const proxies_repository_1 = require("../proxies/proxies.repository");
let FulfillmentModule = class FulfillmentModule {
};
exports.FulfillmentModule = FulfillmentModule;
exports.FulfillmentModule = FulfillmentModule = __decorate([
    (0, common_1.Module)({
        imports: [providers_module_1.ProvidersModule],
        providers: [fulfillment_repository_1.FulfillmentRepository, fulfill_static_proxy_use_case_1.FulfillStaticProxyUseCase, wallet_repository_1.WalletRepository, proxies_repository_1.ProxiesRepository, config_service_1.ConfigService],
        exports: [fulfillment_repository_1.FulfillmentRepository, fulfill_static_proxy_use_case_1.FulfillStaticProxyUseCase],
    })
], FulfillmentModule);
//# sourceMappingURL=fulfillment.module.js.map