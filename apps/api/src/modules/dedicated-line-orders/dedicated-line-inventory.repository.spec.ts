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
