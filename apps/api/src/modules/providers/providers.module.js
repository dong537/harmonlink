"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProvidersModule = void 0;
const common_1 = require("@nestjs/common");
const provider_registry_service_1 = require("./provider-registry.service");
const upstream_log_repository_1 = require("./upstream-log.repository");
const providers_repository_1 = require("./providers.repository");
const providers_controller_1 = require("./providers.controller");
const list_providers_use_case_1 = require("./use-cases/list-providers.use-case");
const health_check_provider_use_case_1 = require("./use-cases/health-check-provider.use-case");
const ipipd_adapter_1 = require("./adapters/ipipd.adapter");
const nine_eight_five_adapter_1 = require("./adapters/nine-eight-five.adapter");
const pr_adapter_1 = require("./adapters/pr.adapter");
const upstream_api_adapter_1 = require("./adapters/upstream-api.adapter");
const config_service_1 = require("../../common/config/config.service");
const auth_module_1 = require("../auth/auth.module");
const ADAPTERS = [ipipd_adapter_1.IpipdAdapter, nine_eight_five_adapter_1.NineEightFiveAdapter, pr_adapter_1.PrAdapter, upstream_api_adapter_1.UpstreamApiAdapter];
let ProvidersModule = class ProvidersModule {
};
exports.ProvidersModule = ProvidersModule;
exports.ProvidersModule = ProvidersModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [providers_controller_1.ProvidersController],
        providers: [
            ...ADAPTERS,
            upstream_log_repository_1.UpstreamLogRepository,
            providers_repository_1.ProvidersRepository,
            config_service_1.ConfigService,
            list_providers_use_case_1.ListProvidersUseCase,
            health_check_provider_use_case_1.HealthCheckProviderUseCase,
            {
                provide: provider_registry_service_1.ProviderRegistryService,
                useFactory: (config, logRepo, ipipd, nef, pr, upstreamApi) => new provider_registry_service_1.ProviderRegistryService(config, logRepo, [ipipd, nef, pr, upstreamApi]),
                inject: [config_service_1.ConfigService, upstream_log_repository_1.UpstreamLogRepository, ipipd_adapter_1.IpipdAdapter, nine_eight_five_adapter_1.NineEightFiveAdapter, pr_adapter_1.PrAdapter, upstream_api_adapter_1.UpstreamApiAdapter],
            },
        ],
        exports: [provider_registry_service_1.ProviderRegistryService, providers_repository_1.ProvidersRepository, upstream_log_repository_1.UpstreamLogRepository, upstream_api_adapter_1.UpstreamApiAdapter],
    })
], ProvidersModule);
//# sourceMappingURL=providers.module.js.map