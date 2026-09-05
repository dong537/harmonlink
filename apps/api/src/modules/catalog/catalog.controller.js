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
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
const guards_1 = require("../../common/auth/guards");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const catalog_repository_1 = require("./catalog.repository");
const domain_1 = require("./domain");
let CatalogController = class CatalogController {
    repository;
    quoteUseCase;
    constructor(repository, quoteUseCase) {
        this.repository = repository;
        this.quoteUseCase = quoteUseCase;
    }
    async listCustomerSkus(ctx) {
        if (!ctx.tenantId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
        }
        const skus = await this.repository.listSaleableSkusForBuyer(ctx.siteId, ctx.tenantId, ctx.ownerId);
        return skus.map(toCatalogSkuDto);
    }
    async listAdminSkus(ctx) {
        assertCatalogAdmin(ctx);
        const skus = await this.repository.listSkus(ctx.siteId, true);
        return skus.map(toCatalogSkuDto);
    }
    quoteCustomer(ctx, query) {
        if (!ctx.tenantId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
        }
        return this.quoteUseCase.execute(toQuoteInput(ctx.siteId, ctx.tenantId, ctx.ownerId, query));
    }
    quoteAdmin(ctx, query) {
        assertCatalogAdmin(ctx);
        if (ctx.ownerType === 'TENANT_ADMIN' && ctx.tenantId !== query.tenantId) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.TENANT_SCOPE_VIOLATION, 'tenant_access_denied', 403);
        }
        return this.quoteUseCase.execute(toQuoteInput(ctx.siteId, query.tenantId, query.userId, query));
    }
};
exports.CatalogController = CatalogController;
__decorate([
    (0, common_1.Get)('skus'),
    (0, guards_1.RequireUser)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listCustomerSkus", null);
__decorate([
    (0, common_1.Get)('admin/skus'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CatalogController.prototype, "listAdminSkus", null);
__decorate([
    (0, common_1.Get)('quote'),
    (0, guards_1.RequireUser)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "quoteCustomer", null);
__decorate([
    (0, common_1.Get)('admin/quote'),
    (0, guards_1.RequireAuth)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CatalogController.prototype, "quoteAdmin", null);
exports.CatalogController = CatalogController = __decorate([
    (0, common_1.Controller)('catalog'),
    __metadata("design:paramtypes", [catalog_repository_1.CatalogRepository,
        domain_1.SkuQuoteUseCase])
], CatalogController);
function assertCatalogAdmin(ctx) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
}
function toQuoteInput(siteId, tenantId, userId, query) {
    return {
        siteId,
        tenantId,
        userId,
        skuCode: query.skuCode,
        durationDays: Number(query.durationDays),
        quantity: query.quantity ? Number(query.quantity) : 1,
        currency: query.currency,
    };
}
function toCatalogSkuDto(sku) {
    return {
        id: sku.id,
        code: sku.code,
        name: sku.name,
        description: sku.description,
        capabilities: sku.capabilities,
        contractVersion: sku.contractVersion,
        isActive: sku.isActive,
        isVisible: sku.isVisible,
    };
}
//# sourceMappingURL=catalog.controller.js.map