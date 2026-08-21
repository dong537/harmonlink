import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SkuQuoteUseCase, type SkuQuoteSource, type ServiceSku } from '../catalog/domain';
import { CreateDedicatedLineOrderUseCase } from './create-dedicated-line-order.use-case';
import type { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import {
  ReserveDedicatedLineStockUseCase,
  type InventoryReservationSource,
  type ReserveDedicatedLineStockInput,
} from './domain';

const ctx: AuthenticatedContext = {
  siteId: 'site-1',
  tenantId: 'tenant-1',
  ownerType: 'USER',
  ownerId: 'user-1',
  requestId: 'req-1',
} as AuthenticatedContext;

const input = {
  skuCode: 'SV',
  quantity: 2,
  durationDays: 30,
  countryCode: 'hk',
  currency: 'CNY',
  idempotencyKey: 'order-key-1',
};

const dedicatedLineSku: ServiceSku = {
  id: 'sku-1',
  siteId: 'site-1',
  code: 'SV',
  name: 'Shared VLESS',
  description: null,
  isActive: true,
  isVisible: true,
  contractVersion: 3,
  capabilities: { delivery: 'dedicated-line' },
};

function quoteSource(candidateSets: Awaited<ReturnType<SkuQuoteSource['getPriceCandidates']>>): SkuQuoteSource {
  return {
    assertBuyerScope: vi.fn().mockResolvedValue(undefined),
    findSku: vi.fn().mockResolvedValue(dedicatedLineSku),
    getPriceCandidates: vi.fn().mockResolvedValue(candidateSets),
  };
}

function reservationSource(): InventoryReservationSource & {
  reserveAndEnqueue: ReturnType<typeof vi.fn>;
  enqueueInventoryLowAlert: ReturnType<typeof vi.fn>;
} {
  return {
    reserveAndEnqueue: vi.fn().mockResolvedValue({
      kind: 'RESERVED',
      reservationId: 'res-1',
      orderId: 'order-1',
      jobId: 'job-1',
      snapshotId: 'snap-1',
      sourceVersion: 'v1',
      replayed: false,
    }),
    enqueueInventoryLowAlert: vi.fn().mockResolvedValue(undefined),
  };
}

function inventoryRepo(route: unknown): DedicatedLineInventoryRepository {
  return { findFreshRoute: vi.fn().mockResolvedValue(route) } as unknown as DedicatedLineInventoryRepository;
}

const freshRoute = {
  providerCode: 'OPENUI',
  providerAccountId: 'acct-1',
  providerResourceId: 'upstream-sv-hk',
};

describe('CreateDedicatedLineOrderUseCase', () => {
  it('prices the order from the catalog SKU price rule and charges the quoted total', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'USER_OVERRIDE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'USER_OVERRIDE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    const result = await useCase.execute(ctx, input);

    expect(result.unitPrice).toBe('13.5');
    expect(result.totalPrice).toBe('27');
    expect(result.priceSource).toBe('USER_OVERRIDE');
    expect(result.orderId).toBe('order-1');
    expect(result.jobId).toBe('job-1');
    expect(result.countryCode).toBe('HK');

    const reserved = source.reserveAndEnqueue.mock.calls[0]![0] as ReserveDedicatedLineStockInput;
    expect(reserved.charge.amount).toBe('27');
    expect(reserved.orderSnapshot.unitPrice).toBe('13.5');
    expect(reserved.orderSnapshot.priceSource).toBe('USER_OVERRIDE');
    expect(reserved.orderSnapshot.contractVersion).toBe(3);
    expect(reserved.skuId).toBe('sku-1');
  });

  it('keeps decimal precision instead of using JS number arithmetic', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '0.07', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    const result = await useCase.execute(ctx, { ...input, quantity: 3 });

    expect(result.totalPrice).toBe('0.21');
  });

  it('throws PRICE_MISSING when no price rule matches and never charges a default rate', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([])),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
      code: ErrorCode.PRICE_MISSING,
    });
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it('fails visibly when no fresh upstream inventory route exists', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(null),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_OUT_OF_STOCK,
      reasonKey: 'dedicated_line_inventory_unavailable',
    });
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it('passes the caller idempotency key so a replay cannot create a second order or job', async () => {
    const source = reservationSource();
    source.reserveAndEnqueue.mockResolvedValue({
      kind: 'RESERVED',
      reservationId: 'res-1',
      orderId: 'order-1',
      jobId: 'job-1',
      snapshotId: 'snap-1',
      sourceVersion: 'v1',
      replayed: true,
    });
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    const result = await useCase.execute(ctx, input);

    expect(result.replayed).toBe(true);
    expect(result.orderId).toBe('order-1');
    const reserved = source.reserveAndEnqueue.mock.calls[0]![0] as ReserveDedicatedLineStockInput;
    expect(reserved.idempotencyKey).toBe('order-key-1');
    expect(reserved.charge.idempotencyKey).toBe('dedicated_line_order:order-key-1');
  });

  it('rejects a non-user caller before any pricing or reservation work', async () => {
    const source = reservationSource();
    const quote = quoteSource([]);
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quote),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(
      useCase.execute({ ...ctx, ownerType: 'PLATFORM_ADMIN' } as AuthenticatedContext, input),
    ).rejects.toBeInstanceOf(AppError);
    expect(quote.findSku).not.toHaveBeenCalled();
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid country code before pricing', async () => {
    const source = reservationSource();
    const quote = quoteSource([]);
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quote),
      inventoryRepo(freshRoute),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, { ...input, countryCode: 'HKG' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'country_code_invalid',
    });
    expect(quote.findSku).not.toHaveBeenCalled();
  });
});
