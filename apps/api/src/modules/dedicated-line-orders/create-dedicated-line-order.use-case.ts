import { Injectable, Logger } from '@nestjs/common';
import { AuthenticatedContext, requireUserContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SkuQuoteUseCase } from '../catalog/domain';
import { requireTenantId } from '../wallet/access';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import { ReserveDedicatedLineStockUseCase } from './domain';

export interface CreateDedicatedLineOrderInput {
  skuCode: string;
  quantity: number;
  durationDays: number;
  countryCode: string;
  currency: string;
  idempotencyKey: string;
  regionCode?: string;
  businessType?: string;
}

export interface CreateDedicatedLineOrderResult {
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

  constructor(
    private readonly quote: SkuQuoteUseCase,
    private readonly inventory: DedicatedLineInventoryRepository,
    private readonly placement: DedicatedLinePlacementRepository,
    private readonly reserveStock: ReserveDedicatedLineStockUseCase,
  ) {}

  async execute(
    ctx: AuthenticatedContext,
    input: CreateDedicatedLineOrderInput,
  ): Promise<CreateDedicatedLineOrderResult> {
    requireUserContext(ctx);
    const tenantId = requireTenantId(ctx);

    const countryCode = normalizedCountryCode(input.countryCode);
    const idempotencyKey = requiredToken(input.idempotencyKey, 'idempotency_key_required');

    // Price authority: catalog SKU price rules. Throws PRICE_MISSING when no
    // rule matches, so an unpriced dedicated-line SKU can never be sold.
    const quote = await this.quote.execute({
      siteId: ctx.siteId,
      tenantId,
      userId: ctx.ownerId,
      skuCode: input.skuCode,
      durationDays: input.durationDays,
      quantity: input.quantity,
      currency: input.currency,
    });

    const route = await this.inventory.findFreshRoute({
      siteId: ctx.siteId,
      tenantId,
      skuId: quote.skuId,
      countryCode,
    });
    if (!route) {
      await this.alertNoUsableRoute({
        siteId: ctx.siteId,
        tenantId,
        userId: ctx.ownerId,
        skuId: quote.skuId,
        countryCode,
        requestedQuantity: quote.quantity,
      });
      throw new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_unavailable', 422, undefined, {
        skuCode: quote.skuCode,
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
      skuId: quote.skuId,
      quantity: quote.quantity,
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

function requiredToken(value: string, reasonKey: string): string {
  const token = (value ?? '').trim();
  if (!token) throw new AppError(ErrorCode.VALIDATION_ERROR, reasonKey, 400);
  return token;
}
