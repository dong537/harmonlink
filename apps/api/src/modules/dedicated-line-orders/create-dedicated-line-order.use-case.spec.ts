import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { SkuQuoteUseCase, type SkuQuoteSource, type ServiceSku } from '../catalog/domain';
import { CreateDedicatedLineOrderUseCase } from './create-dedicated-line-order.use-case';
import type { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import type { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import type { DedicatedLineOrderJob } from './dedicated-line-order.repository';
import { parseRequest } from './process-dedicated-line-order.use-case';
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

type InventoryRepoDouble = DedicatedLineInventoryRepository & {
  enqueueInventoryLowAlert: ReturnType<typeof vi.fn>;
};

function inventoryRepo(
  route: unknown,
  enqueueInventoryLowAlert = vi.fn().mockResolvedValue(undefined),
): InventoryRepoDouble {
  return {
    findFreshRoute: vi.fn().mockResolvedValue(route),
    enqueueInventoryLowAlert,
  } as unknown as InventoryRepoDouble;
}

const placementPlan = {
  policyId: 'policy-1',
  inboundProfileId: 'profile-1',
  inboundTag: 'in-hk-1',
  protocol: 'VLESS' as const,
  targetReplicaCount: 2,
  minReadyReplicaCount: 1,
  maxUnitsPerNode: 10,
  allowedNodeIds: ['node-1', 'node-2'],
};

function placementRepo(plan: unknown = placementPlan): DedicatedLinePlacementRepository {
  return { resolveForOrder: vi.fn().mockResolvedValue(plan) } as unknown as DedicatedLinePlacementRepository;
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
      placementRepo(),
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
      placementRepo(),
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
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
      code: ErrorCode.PRICE_MISSING,
    });
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it('alerts admins once and fails visibly when no fresh upstream inventory route exists', async () => {
    const source = reservationSource();
    const inventory = inventoryRepo(null);
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventory,
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_OUT_OF_STOCK,
      reasonKey: 'dedicated_line_inventory_unavailable',
    });
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
    expect(inventory.enqueueInventoryLowAlert).toHaveBeenCalledTimes(1);
    expect(inventory.enqueueInventoryLowAlert).toHaveBeenCalledWith({
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      providerCode: null,
      providerAccountId: null,
      skuId: 'sku-1',
      countryCode: 'HK',
      requestedQuantity: 2,
      availableQuantity: 0,
      sourceVersion: null,
    });
  });

  it('keeps the out-of-stock answer when the admin alert enqueue itself fails', async () => {
    const source = reservationSource();
    const inventory = inventoryRepo(null, vi.fn().mockRejectedValue(new Error('outbox insert failed')));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventory,
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    try {
      // A broken alerting side channel must not turn a truthful 422 into a 500, but it
      // must not vanish either: the enqueue failure is logged at error level.
      await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
        code: ErrorCode.UPSTREAM_OUT_OF_STOCK,
        reasonKey: 'dedicated_line_inventory_unavailable',
      });
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]![0])).toContain('inventory_low_alert_enqueue_failed');
    } finally {
      logged.mockRestore();
    }
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
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    const result = await useCase.execute(ctx, input);

    expect(result.replayed).toBe(true);
    expect(result.orderId).toBe('order-1');
    const reserved = source.reserveAndEnqueue.mock.calls[0]![0] as ReserveDedicatedLineStockInput;
    expect(reserved.idempotencyKey).toBe('order-key-1');
    expect(reserved.charge.idempotencyKey).toBe('dedicated_line_order:order-key-1');
  });

  it('emits a job request the worker can parse, so a paid order never strands on payload validation', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(freshRoute),
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await useCase.execute(ctx, input);

    const reserved = source.reserveAndEnqueue.mock.calls[0]![0] as ReserveDedicatedLineStockInput;
    // Mirrors dedicated-line-inventory.repository.ts: jobPayload is nested under
    // `request` with providerResourceId injected from the inventory snapshot.
    const job = {
      payload: {
        request: { ...reserved.jobPayload, providerResourceId: freshRoute.providerResourceId },
      },
    } as unknown as DedicatedLineOrderJob;

    const parsed = parseRequest(job);

    expect(parsed.durationDays).toBe(30);
    expect(parsed.currency).toBe('CNY');
    expect(parsed.protocol).toBe('SOCKS5');
    expect(parsed.placementPolicyId).toBe('policy-1');
    expect(parsed.inboundProfileId).toBe('profile-1');
    expect(parsed.inboundTag).toBe('in-hk-1');
    expect(parsed.lineProtocol).toBe('VLESS');
    expect(parsed.maxReplicaFanout).toBe(2);
  });

  it('resolves placement before charging, so an unsatisfiable policy cannot strand a reservation', async () => {
    const source = reservationSource();
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quoteSource([
        { source: 'SITE_DEFAULT_TEMPLATE', candidates: [{ unitPrice: '13.50', currency: 'CNY', source: 'SITE_DEFAULT_TEMPLATE' }], hasCurrencyMismatch: false },
      ])),
      inventoryRepo(freshRoute),
      { resolveForOrder: vi.fn().mockRejectedValue(new AppError(ErrorCode.VALIDATION_ERROR, 'placement_policy_missing', 422)) } as unknown as DedicatedLinePlacementRepository,
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, input)).rejects.toMatchObject({
      reasonKey: 'placement_policy_missing',
    });
    expect(source.reserveAndEnqueue).not.toHaveBeenCalled();
  });

  it('rejects a non-user caller before any pricing or reservation work', async () => {
    const source = reservationSource();
    const quote = quoteSource([]);
    const useCase = new CreateDedicatedLineOrderUseCase(
      new SkuQuoteUseCase(quote),
      inventoryRepo(freshRoute),
      placementRepo(),
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
      placementRepo(),
      new ReserveDedicatedLineStockUseCase(source),
    );

    await expect(useCase.execute(ctx, { ...input, countryCode: 'HKG' })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'country_code_invalid',
    });
    expect(quote.findSku).not.toHaveBeenCalled();
  });
});
