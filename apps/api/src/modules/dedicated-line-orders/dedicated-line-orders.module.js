"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineOrdersModule = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const providers_module_1 = require("../providers/providers.module");
const catalog_module_1 = require("../catalog/catalog.module");
const dedicated_line_orders_controller_1 = require("./dedicated-line-orders.controller");
const create_dedicated_line_order_use_case_1 = require("./create-dedicated-line-order.use-case");
const renew_dedicated_line_use_case_1 = require("./renew-dedicated-line.use-case");
const domain_1 = require("./domain");
const reclaim_expired_reservations_repository_1 = require("./reclaim-expired-reservations.repository");
const dedicated_line_inventory_repository_1 = require("./dedicated-line-inventory.repository");
const dedicated_line_order_repository_1 = require("./dedicated-line-order.repository");
const process_dedicated_line_order_use_case_1 = require("./process-dedicated-line-order.use-case");
const dedicated_line_placement_repository_1 = require("./dedicated-line-placement.repository");
const wallet_module_1 = require("../wallet/wallet.module");
let DedicatedLineOrdersModule = class DedicatedLineOrdersModule {
};
exports.DedicatedLineOrdersModule = DedicatedLineOrdersModule;
exports.DedicatedLineOrdersModule = DedicatedLineOrdersModule = __decorate([
    (0, common_1.Module)({
        imports: [providers_module_1.ProvidersModule, catalog_module_1.CatalogModule, wallet_module_1.WalletModule],
        controllers: [dedicated_line_orders_controller_1.DedicatedLineOrdersController],
        providers: [
            config_service_1.ConfigService,
            dedicated_line_inventory_repository_1.DedicatedLineInventoryRepository,
            dedicated_line_order_repository_1.DedicatedLineOrderRepository,
            dedicated_line_placement_repository_1.DedicatedLinePlacementRepository,
            reclaim_expired_reservations_repository_1.ReclaimExpiredReservationsRepository,
            process_dedicated_line_order_use_case_1.ProcessDedicatedLineOrderUseCase,
            create_dedicated_line_order_use_case_1.CreateDedicatedLineOrderUseCase,
            renew_dedicated_line_use_case_1.RenewDedicatedLineUseCase,
            {
                provide: domain_1.ReserveDedicatedLineStockUseCase,
                inject: [dedicated_line_inventory_repository_1.DedicatedLineInventoryRepository],
                useFactory: (inventory) => new domain_1.ReserveDedicatedLineStockUseCase(inventory),
            },
            {
                provide: domain_1.ReclaimExpiredReservationsUseCase,
                inject: [reclaim_expired_reservations_repository_1.ReclaimExpiredReservationsRepository],
                useFactory: (source) => new domain_1.ReclaimExpiredReservationsUseCase(source),
            },
        ],
        exports: [
            dedicated_line_inventory_repository_1.DedicatedLineInventoryRepository,
            dedicated_line_order_repository_1.DedicatedLineOrderRepository,
            process_dedicated_line_order_use_case_1.ProcessDedicatedLineOrderUseCase,
            create_dedicated_line_order_use_case_1.CreateDedicatedLineOrderUseCase,
            renew_dedicated_line_use_case_1.RenewDedicatedLineUseCase,
            domain_1.ReclaimExpiredReservationsUseCase,
        ],
    })
], DedicatedLineOrdersModule);
//# sourceMappingURL=dedicated-line-orders.module.js.map