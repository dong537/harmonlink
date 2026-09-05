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
var CreateDedicatedLineOrderUseCase_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateDedicatedLineOrderUseCase = void 0;
const common_1 = require("@nestjs/common");
const auth_context_1 = require("../../common/auth/auth-context");
const app_error_1 = require("../../common/errors/app-error");
const error_codes_1 = require("../../common/errors/error-codes");
const catalog_repository_1 = require("../catalog/catalog.repository");
const domain_1 = require("../catalog/domain");
const access_1 = require("../wallet/access");
const dedicated_line_inventory_repository_1 = require("./dedicated-line-inventory.repository");
const dedicated_line_placement_repository_1 = require("./dedicated-line-placement.repository");
const domain_2 = require("./domain");
let CreateDedicatedLineOrderUseCase = CreateDedicatedLineOrderUseCase_1 = class CreateDedicatedLineOrderUseCase {
    catalog;
    quote;
    inventory;
    placement;
    reserveStock;
    logger = new common_1.Logger(CreateDedicatedLineOrderUseCase_1.name);
    constructor(catalog, quote, inventory, placement, reserveStock) {
        this.catalog = catalog;
        this.quote = quote;
        this.inventory = inventory;
        this.placement = placement;
        this.reserveStock = reserveStock;
    }
    async execute(ctx, input) {
        (0, auth_context_1.requireUserContext)(ctx);
        const tenantId = (0, access_1.requireTenantId)(ctx);
        const countryCode = normalizedCountryCode(input.countryCode);
        const idempotencyKey = requiredToken(input.idempotencyKey, 'idempotency_key_required');
        // Resolve the SKU only to obtain its id for the inventory lookup. Identity,
        // saleability and delivery-capability are asserted by SkuQuoteUseCase below,
        // which stays the single authority for those rejections.
        const sku = await this.catalog.findSku(ctx.siteId, input.skuCode);
        if (!sku) {
            throw new app_error_1.AppError(error_codes_1.ErrorCode.NOT_FOUND, 'sku_not_found', 404);
        }
        // Inventory gate precedes pricing so an out-of-stock SKU is reported as such and
        // can never reach provider ordering, and a missing price rule cannot mask a real
        // stock outage behind PRICE_MISSING.
        const route = await this.inventory.findFreshRoute({
            siteId: ctx.siteId,
            tenantId,
            skuId: sku.id,
            countryCode,
        });
        if (!route) {
            await this.alertNoUsableRoute({
                siteId: ctx.siteId,
                tenantId,
                userId: ctx.ownerId,
                skuId: sku.id,
                countryCode,
                requestedQuantity: input.quantity,
            });
            throw new app_error_1.AppError(error_codes_1.ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_unavailable', 422, undefined, {
                skuCode: sku.code,
                countryCode,
            });
        }
        // Placement authority: line_placement_policies. Resolved here, before any
        // money moves, so a missing or unsatisfiable policy fails the request with a
        // 422 instead of stranding a paid reservation in the worker.
        const plan = await this.placement.resolveForOrder({
            siteId: ctx.siteId,
            tenantId,
            userId: ctx.ownerId,
            skuId: sku.id,
            quantity: input.quantity,
        });
        // Price authority: catalog SKU price rules. Throws PRICE_MISSING when no
        // rule matches, so an unpriced dedicated-line SKU can never be sold.
        const quote = await this.quote.execute({
            siteId: ctx.siteId,
            tenantId,
            userId: ctx.ownerId,
            skuCode: sku.code,
            durationDays: input.durationDays,
            quantity: input.quantity,
            currency: input.currency,
        });
        const reservation = await this.reserveStock.execute({
            siteId: ctx.siteId,
            tenantId,
            userId: ctx.ownerId,
            providerCode: route.providerCode,
            providerAccountId: route.providerAccountId,
            skuId: quote.skuId,
            countryCode,
            quantity: quote.quantity,
            idempotencyKey,
            orderSnapshot: {
                skuCode: quote.skuCode,
                skuName: quote.contract.name,
                regionCode: input.regionCode?.trim() || undefined,
                businessType: input.businessType?.trim() || undefined,
                durationDays: quote.durationDays,
                unitPrice: quote.unitPrice,
                totalPrice: quote.totalPrice,
                currency: quote.currency,
                priceSource: quote.priceSource,
                contractVersion: quote.contractVersion,
            },
            charge: {
                amount: quote.totalPrice,
                currency: quote.currency,
                idempotencyKey: `dedicated_line_order:${idempotencyKey}`,
            },
            jobPayload: {
                durationDays: quote.durationDays,
                currency: quote.currency,
                protocol: 'SOCKS5',
                placementPolicyId: plan.policyId,
                inboundProfileId: plan.inboundProfileId,
                inboundTag: plan.inboundTag,
                lineProtocol: plan.protocol,
                maxReplicaFanout: plan.targetReplicaCount,
                ...(input.regionCode?.trim() ? { regionCode: input.regionCode.trim() } : {}),
                ...(input.businessType?.trim() ? { businessType: input.businessType.trim() } : {}),
            },
        });
        return {
            status: 'QUEUED',
            orderId: reservation.orderId,
            reservationId: reservation.reservationId,
            jobId: reservation.jobId,
            skuCode: quote.skuCode,
            countryCode,
            quantity: quote.quantity,
            durationDays: quote.durationDays,
            unitPrice: quote.unitPrice,
            totalPrice: quote.totalPrice,
            currency: quote.currency,
            priceSource: quote.priceSource,
            contractVersion: quote.contractVersion,
            replayed: reservation.replayed,
        };
    }
    // Admin-facing alert for a total inventory outage, enqueued through the outbox so no
    // HTTP call happens on the request path. A failing enqueue is logged at error level
    // and deliberately not rethrown: the caller must still receive the truthful 422
    // out-of-stock answer rather than a 500 caused by the alerting side channel.
    async alertNoUsableRoute(scope) {
        try {
            await this.inventory.enqueueInventoryLowAlert({
                ...scope,
                providerCode: null,
                providerAccountId: null,
                availableQuantity: 0,
                sourceVersion: null,
            });
        }
        catch (error) {
            this.logger.error(`inventory_low_alert_enqueue_failed site=${scope.siteId} sku=${scope.skuId} country=${scope.countryCode}`, error instanceof Error ? error.stack : String(error));
        }
    }
};
exports.CreateDedicatedLineOrderUseCase = CreateDedicatedLineOrderUseCase;
exports.CreateDedicatedLineOrderUseCase = CreateDedicatedLineOrderUseCase = CreateDedicatedLineOrderUseCase_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [catalog_repository_1.CatalogRepository,
        domain_1.SkuQuoteUseCase,
        dedicated_line_inventory_repository_1.DedicatedLineInventoryRepository,
        dedicated_line_placement_repository_1.DedicatedLinePlacementRepository,
        domain_2.ReserveDedicatedLineStockUseCase])
], CreateDedicatedLineOrderUseCase);
function normalizedCountryCode(value) {
    const country = (value ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
    }
    return country;
}
function requiredToken(value, reasonKey) {
    const token = (value ?? '').trim();
    if (!token)
        throw new app_error_1.AppError(error_codes_1.ErrorCode.VALIDATION_ERROR, reasonKey, 400);
    return token;
}
//# sourceMappingURL=create-dedicated-line-order.use-case.js.map