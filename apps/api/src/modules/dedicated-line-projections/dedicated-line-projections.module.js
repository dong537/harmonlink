"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineProjectionsModule = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const dedicated_line_projection_repository_1 = require("./dedicated-line-projection.repository");
const managed_line_projection_adapter_1 = require("./managed-line-projection.adapter");
const process_dedicated_line_projection_use_case_1 = require("./process-dedicated-line-projection.use-case");
let DedicatedLineProjectionsModule = class DedicatedLineProjectionsModule {
};
exports.DedicatedLineProjectionsModule = DedicatedLineProjectionsModule;
exports.DedicatedLineProjectionsModule = DedicatedLineProjectionsModule = __decorate([
    (0, common_1.Module)({
        providers: [
            config_service_1.ConfigService,
            dedicated_line_projection_repository_1.DedicatedLineProjectionRepository,
            {
                provide: managed_line_projection_adapter_1.ManagedLineProjectionAdapter,
                inject: [config_service_1.ConfigService],
                useFactory: (config) => new managed_line_projection_adapter_1.ManagedLineProjectionAdapter(config),
            },
            process_dedicated_line_projection_use_case_1.ProcessDedicatedLineProjectionUseCase,
        ],
        exports: [dedicated_line_projection_repository_1.DedicatedLineProjectionRepository, process_dedicated_line_projection_use_case_1.ProcessDedicatedLineProjectionUseCase, managed_line_projection_adapter_1.ManagedLineProjectionAdapter],
    })
], DedicatedLineProjectionsModule);
//# sourceMappingURL=dedicated-line-projections.module.js.map