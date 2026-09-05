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
exports.ResourcesController = void 0;
const common_1 = require("@nestjs/common");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
const guards_1 = require("../../common/auth/guards");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const resources_repository_1 = require("./resources.repository");
const sync_inventory_use_case_1 = require("./use-cases/sync-inventory.use-case");
let ResourcesController = class ResourcesController {
    repo;
    syncInventory;
    constructor(repo, syncInventory) {
        this.repo = repo;
        this.syncInventory = syncInventory;
    }
    list(ctx, query) {
        if (ctx.ownerType === 'USER') {
            return this.repo.list(ctx.siteId, {
                ...query,
                publicOnly: true,
                userId: ctx.ownerId,
                tenantId: ctx.tenantId ?? null,
            });
        }
        if (ctx.ownerType === 'PLATFORM_ADMIN' || ctx.ownerType === 'TENANT_ADMIN') {
            return this.repo.list(ctx.siteId, { ...query, tenantId: ctx.tenantId ?? null });
        }
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    priceableCatalogSummary(ctx, query) {
        assertAdmin(ctx);
        return this.repo.listPriceableCatalogSummary(ctx.siteId, { ...query, tenantId: ctx.tenantId ?? null });
    }
    priceableCatalogGroups(ctx, query) {
        assertAdmin(ctx);
        return this.repo.listPriceableCatalogGroups(ctx.siteId, { ...query, tenantId: ctx.tenantId ?? null });
    }
    updatePriceableCatalogGroupSaleability(ctx, body) {
        assertAdmin(ctx);
        assertPriceableCatalogGroupSaleabilityBody(body);
        return this.repo.updatePriceableCatalogGroupSaleability(ctx.siteId, {
            countryCode: body.countryCode,
            regionKey: body.regionKey,
            costGroupKey: body.costGroupKey,
            autoSelect: body.autoSelect,
            providerCode: body.providerCode,
            tenantId: ctx.tenantId ?? null,
        }, body.saleable === true);
    }
    priceableCatalog(ctx, query) {
        assertAdmin(ctx);
        return this.repo.listPriceableCatalog(ctx.siteId, { ...query, tenantId: ctx.tenantId ?? null });
    }
    countries(ctx, query) {
        if (ctx.ownerType === 'USER') {
            return this.repo.listPublicCountries(ctx.siteId, {
                ...query,
                publicOnly: true,
                userId: ctx.ownerId,
                tenantId: ctx.tenantId ?? null,
            });
        }
        if (ctx.ownerType === 'PLATFORM_ADMIN' || ctx.ownerType === 'TENANT_ADMIN') {
            return this.repo.listPublicCountries(ctx.siteId, { ...query, tenantId: ctx.tenantId ?? null });
        }
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    create(ctx, body) {
        assertAdmin(ctx);
        assertCreateResourceBody(body);
        const data = {
            siteId: ctx.siteId,
            parentId: body.parentId ?? undefined,
            type: body.type,
            code: body.code,
            name: body.name,
            displayName: body.displayName ?? undefined,
            providerCode: body.providerCode,
            ipType: body.ipType,
            protocol: body.protocol,
            status: body.status ?? 'ACTIVE',
            sortOrder: body.sortOrder === undefined ? 0 : Number(body.sortOrder),
            isVisible: body.isVisible ?? true,
            isSaleable: body.isSaleable ?? true,
            unsaleableReason: body.unsaleableReason ?? undefined,
        };
        return this.repo.create(data);
    }
    async update(ctx, id, body) {
        assertAdmin(ctx);
        const existing = await this.repo.findByIdInSite(id, ctx.siteId);
        if (!existing)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        assertUpdateResourceBody(body);
        return this.repo.update(id, ctx.siteId, toResourceUpdateData(body));
    }
    async getInventory(ctx, id) {
        const existing = await this.repo.findByIdInSite(id, ctx.siteId);
        if (!existing)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        const latest = await this.repo.getLatestInventory(id, ctx.siteId, existing.upstreamAccountId);
        if (!latest)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'inventory_stale', 422);
        return latest;
    }
    async updateInventory(ctx, id, body) {
        assertAdmin(ctx);
        const resource = await this.repo.findByIdInSite(id, ctx.siteId);
        if (!resource)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        const stock = parseInventoryStock(body.stock);
        const freshnessTtlSeconds = parseFreshnessTtlSeconds(body.freshnessTtlSeconds);
        await this.repo.upsertInventorySnapshot({
            siteId: ctx.siteId,
            resourceId: resource.id,
            providerCode: resource.providerCode,
            upstreamAccountId: resource.upstreamAccountId,
            stock,
            capturedAt: new Date(),
            freshnessTtlSeconds,
        });
        const latest = await this.repo.getLatestInventory(resource.id, ctx.siteId, resource.upstreamAccountId);
        if (!latest)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_ERROR, 'inventory_stale', 422);
        return latest;
    }
    async syncInventoryHandler(ctx, body) {
        assertAdmin(ctx);
        if (!body.providerCode) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_code_required', 400);
        }
        if (ctx.ownerType === 'TENANT_ADMIN' && body.accountId) {
            await this.assertTenantCanUseProviderAccount(ctx, body.providerCode, body.accountId);
        }
        return this.syncInventory.execute(ctx.siteId, body.providerCode, ctx.tenantId ?? null, body.accountId ?? null);
    }
    async syncResourceInventory(ctx, id) {
        assertAdmin(ctx);
        const resource = await this.repo.findByIdInSite(id, ctx.siteId);
        if (!resource)
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'resource_not_found', 404);
        return this.syncInventory.execute(ctx.siteId, resource.providerCode, ctx.tenantId ?? null, resource.upstreamAccountId);
    }
    async assertTenantCanUseProviderAccount(ctx, providerCode, accountId) {
        const tenantId = await this.repo.findProviderAccountTenant(ctx.siteId, providerCode, accountId);
        if (tenantId === undefined) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'provider_account_not_found', 404);
        }
        if (tenantId !== null && tenantId !== ctx.tenantId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.TENANT_SCOPE_VIOLATION, 'tenant_access_denied', 403);
        }
    }
};
exports.ResourcesController = ResourcesController;
__decorate([
    (0, common_1.Get)(),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('priceable-catalog/summary'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "priceableCatalogSummary", null);
__decorate([
    (0, common_1.Get)('priceable-catalog/groups'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "priceableCatalogGroups", null);
__decorate([
    (0, common_1.Post)('priceable-catalog/group-saleability'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "updatePriceableCatalogGroupSaleability", null);
__decorate([
    (0, common_1.Get)('priceable-catalog'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "priceableCatalog", null);
__decorate([
    (0, common_1.Get)('countries'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "countries", null);
__decorate([
    (0, common_1.Post)(),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ResourcesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':id/inventory'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getInventory", null);
__decorate([
    (0, common_1.Put)(':id/inventory'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "updateInventory", null);
__decorate([
    (0, common_1.Post)('sync-inventory'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "syncInventoryHandler", null);
__decorate([
    (0, common_1.Post)(':id/sync-inventory'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "syncResourceInventory", null);
exports.ResourcesController = ResourcesController = __decorate([
    (0, common_1.Controller)('resources'),
    __metadata("design:paramtypes", [resources_repository_1.ResourcesRepository,
        sync_inventory_use_case_1.SyncInventoryUseCase])
], ResourcesController);
function assertAdmin(ctx) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
}
function assertCreateResourceBody(body) {
    if (!body.code || !body.name || !body.type || !body.providerCode || !body.ipType || !body.protocol) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_required_fields_missing', 400);
    }
    if (!isResourceType(body.type) || !isProviderCode(body.providerCode) || !isIpType(body.ipType) || !isProtocol(body.protocol)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_enum_invalid', 400);
    }
    if (body.status !== undefined && !isResourceStatus(body.status)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_status_invalid', 400);
    }
    if (body.sortOrder !== undefined && !Number.isInteger(Number(body.sortOrder))) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'sort_order_invalid', 400);
    }
}
function assertUpdateResourceBody(body) {
    if (body.type !== undefined && !isResourceType(body.type)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_type_invalid', 400);
    }
    if (body.providerCode !== undefined && !isProviderCode(body.providerCode)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_code_invalid', 400);
    }
    if (body.ipType !== undefined && !isIpType(body.ipType)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'ip_type_invalid', 400);
    }
    if (body.protocol !== undefined && !isProtocol(body.protocol)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'protocol_invalid', 400);
    }
    if (body.status !== undefined && !isResourceStatus(body.status)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_status_invalid', 400);
    }
    if (body.sortOrder !== undefined && !Number.isInteger(Number(body.sortOrder))) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'sort_order_invalid', 400);
    }
}
function assertPriceableCatalogGroupSaleabilityBody(body) {
    if (!body.countryCode?.trim()) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'country_code_required', 400);
    }
    if (!/^[A-Za-z]{2}$/.test(body.countryCode.trim())) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
    }
    if (body.providerCode !== undefined && !isProviderCode(body.providerCode)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'provider_code_invalid', 400);
    }
    if (typeof body.saleable !== 'boolean') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_saleability_invalid', 400);
    }
    if (!body.autoSelect && (!body.regionKey?.trim() || !body.costGroupKey?.trim())) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'resource_group_required', 400);
    }
}
function parseInventoryStock(value) {
    const stock = Number(value);
    if (!Number.isInteger(stock) || stock < 0) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'inventory_stock_invalid', 400);
    }
    return stock;
}
function parseFreshnessTtlSeconds(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const ttl = Number(value);
    if (!Number.isInteger(ttl) || ttl < 60) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'inventory_ttl_invalid', 400);
    }
    return ttl;
}
function toResourceUpdateData(body) {
    const data = {};
    if ('parentId' in body)
        data.parentId = body.parentId;
    if (body.type)
        data.type = body.type;
    if (body.code)
        data.code = body.code;
    if (body.name)
        data.name = body.name;
    if ('displayName' in body)
        data.displayName = body.displayName;
    if (body.providerCode)
        data.providerCode = body.providerCode;
    if (body.ipType)
        data.ipType = body.ipType;
    if (body.protocol)
        data.protocol = body.protocol;
    if (body.status)
        data.status = body.status;
    if (body.sortOrder !== undefined)
        data.sortOrder = Number(body.sortOrder);
    if (body.isVisible !== undefined)
        data.isVisible = body.isVisible;
    if (body.isSaleable !== undefined)
        data.isSaleable = body.isSaleable;
    if ('unsaleableReason' in body)
        data.unsaleableReason = body.unsaleableReason;
    return data;
}
function isResourceType(value) {
    return ['COUNTRY', 'REGION', 'ZONE'].includes(value);
}
function isIpType(value) {
    return ['NATIVE', 'BROADCAST', 'BOTH'].includes(value);
}
function isProtocol(value) {
    return ['HTTP', 'SOCKS5', 'BOTH'].includes(value);
}
function isResourceStatus(value) {
    return ['ACTIVE', 'HIDDEN', 'DISABLED'].includes(value);
}
function isProviderCode(value) {
    return ['IPIPD', 'NINE_EIGHT_FIVE', 'PR', 'UPSTREAM_API'].includes(value);
}
//# sourceMappingURL=resources.controller.js.map