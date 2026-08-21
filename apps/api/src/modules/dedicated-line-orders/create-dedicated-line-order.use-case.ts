import { Injectable } from '@nestjs/common';
import { AuthenticatedContext, requireUserContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SkuQuoteUseCase } from '../catalog/domain';
import { requireTenantId } from '../wallet/access';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
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
  constructor(
    private readonly quote: SkuQuoteUseCase,
    private readonly inventory: DedicatedLineInventoryRepository,
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
      throw new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, 'dedicated_line_inventory_unavailable', 422, undefined, {
        skuCode: quote.skuCode,
        countryCode,
      });
    }

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
        skuCode: quote.skuCode,
        countryCode,
        durationDays: quote.durationDays,
        quantity: quote.quantity,
        contractVersion: quote.contractVersion,
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
