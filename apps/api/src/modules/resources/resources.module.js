"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourcesModule = void 0;
const common_1 = require("@nestjs/common");
const resources_repository_1 = require("./resources.repository");
const resources_controller_1 = require("./resources.controller");
const sync_inventory_use_case_1 = require("./use-cases/sync-inventory.use-case");
const providers_module_1 = require("../providers/providers.module");
const dedicated_line_orders_module_1 = require("../dedicated-line-orders/dedicated-line-orders.module");
let ResourcesModule = class ResourcesModule {
};
exports.ResourcesModule = ResourcesModule;
exports.ResourcesModule = ResourcesModule = __decorate([
    (0, common_1.Module)({
        imports: [providers_module_1.ProvidersModule, dedicated_line_orders_module_1.DedicatedLineOrdersModule],
        providers: [resources_repository_1.ResourcesRepository, sync_inventory_use_case_1.SyncInventoryUseCase],
        controllers: [resources_controller_1.ResourcesController],
        exports: [resources_repository_1.ResourcesRepository, sync_inventory_use_case_1.SyncInventoryUseCase],
    })
], ResourcesModule);
//# sourceMappingURL=resources.module.js.map