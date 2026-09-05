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
exports.ListProvidersUseCase = void 0;
const common_1 = require("@nestjs/common");
const providers_repository_1 = require("../providers.repository");
const provider_registry_service_1 = require("../provider-registry.service");
const admin_access_1 = require("../admin-access");
/**
 * Lists provider accounts for the caller's site (PLATFORM_ADMIN only). The
 * response is a read model that excludes the encrypted credential; the secret
 * never leaves the backend. Capabilities are derived from the matching adapter.
 */
let ListProvidersUseCase = class ListProvidersUseCase {
    repo;
    registry;
    constructor(repo, registry) {
        this.repo = repo;
        this.registry = registry;
    }
    async execute(ctx) {
        (0, admin_access_1.requireProviderAdmin)(ctx);
        const records = await this.repo.listForSite(ctx.siteId);
        return records.map((record) => this.toListItem(record));
    }
    toListItem(record) {
        const adapter = this.registry.getAdapter(record.providerCode);
        return {
            id: record.id,
            providerCode: record.providerCode,
            tenantId: record.tenantId,
            status: record.status,
            baseUrl: record.baseUrl,
            timeoutMs: record.timeoutMs,
            inventorySyncEnabled: record.inventorySyncEnabled,
            enabledCountryCodes: record.enabledCountryCodes,
            availableCountries: [],
            capabilities: (0, admin_access_1.deriveCapabilities)(adapter, record.inventorySyncEnabled),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        };
    }
};
exports.ListProvidersUseCase = ListProvidersUseCase;
exports.ListProvidersUseCase = ListProvidersUseCase = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [providers_repository_1.ProvidersRepository,
        provider_registry_service_1.ProviderRegistryService])
], ListProvidersUseCase);
//# sourceMappingURL=list-providers.use-case.js.map