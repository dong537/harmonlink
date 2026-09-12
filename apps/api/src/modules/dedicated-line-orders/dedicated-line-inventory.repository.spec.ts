import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@ipeasy/db/generated/client';

const transaction = vi.hoisted(() => vi.fn());

vi.mock('@ipeasy/db', () => ({
  prisma: { $transaction: transaction },
}));

import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import type { ReserveDedicatedLineStockInput } from './domain';

beforeEach(() => {
  transaction.mockReset();
});

describe('DedicatedLineInventoryRepository idempotency recovery', () => {
  it('does not convert an unrelated unique violation into a reservation replay', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['unrelated_unique_field'] },
    });
    transaction.mockRejectedValue(error);
    const repository = new DedicatedLineInventoryRepository({} as never);

    await expect(repository.reserveAndEnqueue(request())).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it('resolves a replay charge by reservation scope when its debit key is independent', async () => {
    const tx = {
      stock_reservations: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'reservation-1',
          inventorySnapshotId: 'snapshot-1',
          snapshotVersion: 'snapshot-v1',
          dedicatedLineOrderId: 'order-1',
          providerAccountId: 'provider-1',
          providerCode: 'NINE_EIGHT_FIVE',
          skuId: 'sku-1',
          countryCode: 'HK',
          quantity: 1,
        }),
      },
      dedicated_line_orders: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'order-1',
          siteId: 'site-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          skuId: 'sku-1',
          skuCode: 'SV',
          countryCode: 'HK',
          quantity: 1,
          durationDays: 30,
          currency: 'CNY',
          regionCode: null,
          businessType: null,
          totalPrice: decimal('1'),
          unitPrice: decimal('1'),
          priceSource: 'TEST',
          contractVersion: 1,
          zone: null,
        }),
      },
      external_jobs: {
        findFirst: vi.fn().mockResolvedValue({ id: 'job-1', dedicatedLineOrderId: 'order-1' }),
      },
      ledger_entries: {
        findFirst: vi.fn().mockResolvedValue({
          idempotencyKey: 'independent-debit-key',
          amount: decimal('-1'),
          currency: 'CNY',
          siteId: 'site-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          relatedId: 'reservation-1',
          type: 'DEBIT',
          reason: 'dedicated_line_order',
        }),
      },
    };
    transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const repository = new DedicatedLineInventoryRepository({} as never);

    await expect(repository.findOrderReplay({
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      idempotencyKey: 'order-1',
      request: {
        skuCode: 'SV',
        countryCode: 'HK',
        quantity: 1,
        durationDays: 30,
        currency: 'CNY',
        regionCode: null,
        businessType: null,
        zoneCode: null,
      },
    })).resolves.toMatchObject({
      status: 'QUEUED',
      orderId: 'order-1',
      reservationId: 'reservation-1',
      jobId: 'job-1',
      replayed: true,
    });
    expect(tx.ledger_entries.findFirst).toHaveBeenCalledWith({
      where: {
        siteId: 'site-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        relatedId: 'reservation-1',
        type: 'DEBIT',
        reason: 'dedicated_line_order',
      },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object),
    });
    expect(JSON.stringify(tx.ledger_entries.findFirst.mock.calls[0]?.[0])).not.toContain('dedicated-line-order:site-1');
  });
});

function request(): ReserveDedicatedLineStockInput {
  return {
    siteId: 'site-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    zoneId: null,
    providerCode: 'NINE_EIGHT_FIVE',
    providerAccountId: 'provider-1',
    skuId: 'sku-1',
    countryCode: 'HK',
    quantity: 1,
    idempotencyKey: 'order-1',
    orderSnapshot: {
      skuCode: 'SV',
      skuName: 'Dedicated Line',
      durationDays: 30,
      unitPrice: '1',
      totalPrice: '1',
      currency: 'CNY',
      priceSource: 'SITE_DEFAULT_TEMPLATE',
      contractVersion: 1,
    },
    charge: { amount: '1', currency: 'CNY', idempotencyKey: 'debit-1' },
    jobPayload: {
      durationDays: 30,
      currency: 'CNY',
      protocol: 'SOCKS5',
      placementPolicyId: 'policy-1',
      inboundProfileId: 'inbound-1',
      inboundTag: 'inbound',
      lineProtocol: 'VLESS',
      maxReplicaFanout: 1,
    },
  };
}

function decimal(value: string) {
  return { toString: () => value };
}
