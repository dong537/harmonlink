import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedContext, requireUserContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CatalogRepository } from '../catalog/catalog.repository';
import { SkuQuoteUseCase } from '../catalog/domain';
import { requireTenantId } from '../wallet/access';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import { ReserveDedicatedLineStockUseCase, type DedicatedLineOrderReplayRequest } from './domain';
import { ResolveActiveZoneUseCase } from '../zones/use-cases';
import { normalizeZoneCode } from '../zones/domain';

export interface CreateDedicatedLineOrderInput {
  skuCode: string;
  quantity: number;
  durationDays: number;
  countryCode: string;
  currency: string;
  idempotencyKey: string;
  regionCode?: string;
  businessType?: string;
  zoneCode?: string;
}

export interface CreateDedicatedLineOrderResult {
  status: 'QUEUED';
  orderId: string;
  reservationId: string;
  jobId: string;
  skuCode: string;
  countryCode: string;
  quantity: number;
  durationDays: number;
  unitPrice: string;
  totalPrice: string;
  currency: string;
  priceSource: string;
  contractVersion: number;
  replayed: boolean;
}

@Injectable()
export class CreateDedicatedLineOrderUseCase {
  private readonly logger = new Logger(CreateDedicatedLineOrderUseCase.name);
  private readonly resolveZone: ResolveActiveZoneUseCase | undefined;

  constructor(
    private readonly catalog: CatalogRepository,
    private readonly quote: SkuQuoteUseCase,
    private readonly inventory: DedicatedLineInventoryRepository,
    private readonly placement: DedicatedLinePlacementRepository,
    private readonly reserveStock: ReserveDedicatedLineStockUseCase,
    resolveZone?: ResolveActiveZoneUseCase,
  ) {
    this.resolveZone = resolveZone;
  }

  async execute(
    ctx: AuthenticatedContext,
    input: CreateDedicatedLineOrderInput,
  ): Promise<CreateDedicatedLineOrderResult> {
    requireUserContext(ctx);
    const tenantId = requireTenantId(ctx);

    const skuCode = normalizedSkuCode(input.skuCode);
    const countryCode = normalizedCountryCode(input.countryCode);
    const idempotencyKey = requiredToken(input.idempotencyKey, 'idempotency_key_required');
    const replayRequest: DedicatedLineOrderReplayRequest = {
      skuCode,
      countryCode,
      quantity: input.quantity,
      durationDays: input.durationDays,
      currency: normalizedCurrency(input.currency),
      regionCode: normalizedOptionalText(input.regionCode),
      businessType: normalizedOptionalText(input.businessType),
      zoneCode: normalizedOptionalZoneCode(input.zoneCode),
    };

    // A committed reservation is the source of truth for a retry. Read it
    // before Zone/catalog/inventory/placement/quote checks because each of
    // those resources can legitimately change after the original purchase.
    const replay = await this.inventory.findOrderReplay({
      siteId: ctx.siteId,
      tenantId,
      userId: ctx.ownerId,
      idempotencyKey,
      request: replayRequest,
    });
    if (replay) return replay;

    const zone = await this.resolveSelectedZone(ctx.siteId, tenantId, ctx.ownerId, input.zoneCode);

    // Resolve the SKU only to obtain its id for the inventory lookup. Identity,
    // saleability and delivery-capability are asserted by SkuQuoteUseCase below,
    // which stays the single authority for those rejections.
    const sku = await this.catalog.findSku(ctx.siteId, skuCode);
    if (!sku) {
      throw new AppError(ErrorCode.NOT_FOUND, 'sku_not_found', 404);
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
      throw new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_unavailable', 422, undefined, {
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
      currency: replayRequest.currency,
    });

    const reservation = await this.reserveStock.execute({
      siteId: ctx.siteId,
      tenantId,
      userId: ctx.ownerId,
      zoneId: zone?.id ?? null,
      zoneCode: replayRequest.zoneCode,
      providerCode: route.providerCode,
      providerAccountId: route.providerAccountId,
      skuId: quote.skuId,
      countryCode,
      quantity: quote.quantity,
      idempotencyKey,
      orderSnapshot: {
        skuCode: quote.skuCode,
        skuName: quote.contract.name,
        regionCode: replayRequest.regionCode ?? undefined,
        businessType: replayRequest.businessType ?? undefined,
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
        // Ledger keys are globally unique even though order idempotency is
        // scoped. Include the complete buyer scope so two users can choose the
        // same client-provided key without colliding in ledger_entries.
        idempotencyKey: orderDebitLedgerKey(ctx.siteId, tenantId, ctx.ownerId, idempotencyKey),
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
        ...(replayRequest.regionCode ? { regionCode: replayRequest.regionCode } : {}),
        ...(replayRequest.businessType ? { businessType: replayRequest.businessType } : {}),
      },
    });

    // A concurrent request can discover the committed reservation inside
    // reserveAndEnqueue after this request's initial replay probe missed it.
    // Read the persisted response so a changed quote/provider route cannot leak
    // into the replay result.
    if (reservation.replayed) {
      const replay = await this.inventory.findOrderReplay({
        siteId: ctx.siteId,
        tenantId,
        userId: ctx.ownerId,
        idempotencyKey,
        request: replayRequest,
      });
      if (replay) return replay;
      // The reservation layer reported a committed replay, so returning the
      // current quote would expose mutable pricing as the original contract.
      // Treat a missing persisted snapshot as an integrity failure instead.
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'dedicated_line_order_replay_missing', 500);
    }

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

  private async resolveSelectedZone(
    siteId: string,
    tenantId: string,
    userId: string,
    zoneCode: string | undefined,
  ) {
    if (zoneCode === undefined || zoneCode === '') return null;
    if (!this.resolveZone) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'zone_resolver_not_configured', 500);
    }
    return this.resolveZone.execute({ siteId, tenantId, userId }, zoneCode);
  }

  // Admin-facing alert for a total inventory outage, enqueued through the outbox so no
  // HTTP call happens on the request path. A failing enqueue is logged at error level
  // and deliberately not rethrown: the caller must still receive the truthful 422
  // out-of-stock answer rather than a 500 caused by the alerting side channel.
  private async alertNoUsableRoute(scope: {
    siteId: string;
    tenantId: string;
    userId: string;
    skuId: string;
    countryCode: string;
    requestedQuantity: number;
  }): Promise<void> {
    try {
      await this.inventory.enqueueInventoryLowAlert({
        ...scope,
        providerCode: null,
        providerAccountId: null,
        availableQuantity: 0,
        sourceVersion: null,
      });
    } catch (error: unknown) {
      this.logger.error(
        `inventory_low_alert_enqueue_failed site=${scope.siteId} sku=${scope.skuId} country=${scope.countryCode}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function normalizedCountryCode(value: string): string {
  const country = (value ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'country_code_invalid', 400);
  }
  return country;
}

function normalizedSkuCode(value: string): string {
  const skuCode = (value ?? '').trim().toUpperCase();
  if (!skuCode) throw new AppError(ErrorCode.VALIDATION_ERROR, 'sku_code_required', 400);
  return skuCode;
}

function normalizedCurrency(value: string): string {
  const currency = (value ?? '').trim().toUpperCase();
  if (!currency) throw new AppError(ErrorCode.VALIDATION_ERROR, 'currency_required', 400);
  return currency;
}

function normalizedOptionalText(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const text = value.trim();
  return text || null;
}

function normalizedOptionalZoneCode(value: string | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizeZoneCode(value);
}

function requiredToken(value: string, reasonKey: string): string {
  const token = (value ?? '').trim();
  if (!token) throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  return token;
}

function orderDebitLedgerKey(siteId: string, tenantId: string, userId: string, idempotencyKey: string): string {
  return `dedicated-line-order:${siteId}:${tenantId}:${userId}:${idempotencyKey}`;
}
