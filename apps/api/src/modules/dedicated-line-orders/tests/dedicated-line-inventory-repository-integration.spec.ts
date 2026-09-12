import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@ipeasy/db';
import {
  cleanDatabase,
  seedSite,
  seedTenant,
  seedUser,
} from '../../../test-utils/integration-setup';
import { DedicatedLineInventoryRepository } from '../dedicated-line-inventory.repository';
import { ReserveDedicatedLineStockUseCase } from '../domain';
import { WalletRepository } from '../../wallet/wallet.repository';

let repository: DedicatedLineInventoryRepository;
let useCase: ReserveDedicatedLineStockUseCase;

beforeAll(() => {
  repository = new DedicatedLineInventoryRepository(new WalletRepository());
  useCase = new ReserveDedicatedLineStockUseCase(repository);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('dedicated-line inventory reservation', () => {
  it('atomically allows only one of two concurrent reservations and creates one provider job', async () => {
    const siteId = await seedSite();
    const tenantId = await seedTenant(siteId);
    const { userId } = await seedUser(siteId, tenantId, {
      email: 'line-reservation@example.com',
      password: 'unused',
    });
    await prisma.wallets.update({ where: { userId }, data: { available: '1' } });
    const account = await prisma.provider_accounts.create({
      data: {
        siteId,
        providerCode: 'NINE_EIGHT_FIVE',
        status: 'ACTIVE',
        credentialEncrypted: 'test-only',
        baseUrl: 'https://provider.invalid',
        inventorySyncEnabled: true,
      },
    });
    const sku = await prisma.service_skus.create({
      data: {
        siteId,
        code: 'SV',
        name: 'Short Video',
        capabilities: { delivery: 'dedicated-line' },
      },
    });
    const snapshot = await prisma.dedicated_line_inventory_snapshots.create({
      data: {
        siteId,
        providerAccountId: account.id,
        skuId: sku.id,
        providerCode: account.providerCode,
        countryCode: 'HK',
        providerResourceId: 'HK:premium',
        quantity: 1,
        sourceVersion: 'sync-1',
        capturedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const results = await Promise.allSettled([
      useCase.execute(request(siteId, tenantId, userId, account.id, sku.id, 'key-a')),
      useCase.execute(request(siteId, tenantId, userId, account.id, sku.id, 'key-b')),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.stock_reservations.count()).toBe(1);
    expect(await prisma.external_jobs.count({ where: { kind: 'PROVIDER_DEDICATED_LINE_ORDER' } })).toBe(1);
    expect(await prisma.outbox_events.count({ where: { topic: 'alerts.bark.inventory_low' } })).toBe(1);
    expect(await prisma.dedicated_line_inventory_snapshots.findUniqueOrThrow({ where: { id: snapshot.id } }))
      .toMatchObject({ quantity: 1, reservedQuantity: 1 });
  });

  it('replays the same reservation without creating a second provider job', async () => {
    const siteId = await seedSite();
    const tenantId = await seedTenant(siteId);
    const { userId } = await seedUser(siteId, tenantId, {
      email: 'line-replay@example.com',
      password: 'unused',
    });
    await prisma.wallets.update({ where: { userId }, data: { available: '1' } });
    const account = await prisma.provider_accounts.create({
      data: {
        siteId,
        providerCode: 'NINE_EIGHT_FIVE',
        status: 'ACTIVE',
        credentialEncrypted: 'test-only',
        baseUrl: 'https://provider.invalid',
        inventorySyncEnabled: true,
      },
    });
    const sku = await prisma.service_skus.create({
      data: { siteId, code: 'ZB', name: 'Live', capabilities: { delivery: 'dedicated-line' } },
    });
    await prisma.dedicated_line_inventory_snapshots.create({
      data: {
        siteId,
        providerAccountId: account.id,
        skuId: sku.id,
        providerCode: account.providerCode,
        countryCode: 'HK',
        providerResourceId: 'HK:premium',
        quantity: 2,
        sourceVersion: 'sync-2',
        capturedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const first = await useCase.execute(request(siteId, tenantId, userId, account.id, sku.id, 'same-key'));
    const second = await useCase.execute(request(siteId, tenantId, userId, account.id, sku.id, 'same-key'));

    expect(second).toMatchObject({
      reservationId: first.reservationId,
      jobId: first.jobId,
      replayed: true,
    });
    expect(await prisma.stock_reservations.count()).toBe(1);
    expect(await prisma.external_jobs.count()).toBe(1);
  });

  it('returns one fresh result and one replay when the same scoped key races', async () => {
    const fixture = await seedReservationFixture('line-concurrent-replay@example.com', 2);
    const input = request(
      fixture.siteId,
      fixture.tenantId,
      fixture.userId,
      fixture.accountId,
      fixture.skuId,
      'concurrent-key',
    );

    const results = await Promise.all([useCase.execute(input), useCase.execute(input)]);

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(results.map((result) => result.orderId)).size).toBe(1);
    expect(await prisma.dedicated_line_orders.count()).toBe(1);
    expect(await prisma.stock_reservations.count()).toBe(1);
    expect(await prisma.external_jobs.count()).toBe(1);
    expect(await prisma.ledger_entries.count({ where: { type: 'DEBIT' } })).toBe(1);
  });

  it('allows different users to reuse the same client idempotency key', async () => {
    const siteId = await seedSite();
    const tenantId = await seedTenant(siteId);
    const first = await seedUser(siteId, tenantId, { email: 'line-scope-a@example.com', password: 'unused' });
    const second = await seedUser(siteId, tenantId, { email: 'line-scope-b@example.com', password: 'unused' });
    await prisma.wallets.updateMany({ where: { userId: { in: [first.userId, second.userId] } }, data: { available: '1' } });
    const account = await prisma.provider_accounts.create({
      data: {
        siteId,
        providerCode: 'NINE_EIGHT_FIVE',
        status: 'ACTIVE',
        credentialEncrypted: 'test-only',
        baseUrl: 'https://provider.invalid',
        inventorySyncEnabled: true,
      },
    });
    const sku = await prisma.service_skus.create({
      data: { siteId, code: 'SV', name: 'Short Video', capabilities: { delivery: 'dedicated-line' } },
    });
    await prisma.dedicated_line_inventory_snapshots.create({
      data: {
        siteId,
        providerAccountId: account.id,
        skuId: sku.id,
        providerCode: account.providerCode,
        countryCode: 'HK',
        providerResourceId: 'HK:premium',
        quantity: 2,
        sourceVersion: 'scope-sync',
        capturedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const results = await Promise.all([
      useCase.execute(request(siteId, tenantId, first.userId, account.id, sku.id, 'shared-key')),
      useCase.execute(request(siteId, tenantId, second.userId, account.id, sku.id, 'shared-key')),
    ]);

    expect(results.every((result) => !result.replayed)).toBe(true);
    expect(await prisma.dedicated_line_orders.count()).toBe(2);
    expect(await prisma.stock_reservations.count()).toBe(2);
    expect(await prisma.ledger_entries.count({ where: { type: 'DEBIT' } })).toBe(2);
  });

  it('rejects a replay whose charge amount or debit identity changed', async () => {
    const fixture = await seedReservationFixture('line-charge-conflict@example.com', 2);
    const input = request(
      fixture.siteId,
      fixture.tenantId,
      fixture.userId,
      fixture.accountId,
      fixture.skuId,
      'charge-key',
    );
    await useCase.execute(input);

    await expect(useCase.execute({
      ...input,
      charge: { amount: '2', currency: 'CNY', idempotencyKey: 'different-debit-key' },
    })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      reasonKey: 'dedicated_line_order_idempotency_conflict',
    });
    expect(await prisma.ledger_entries.count({ where: { type: 'DEBIT' } })).toBe(1);
  });

  it('finds a committed replay when the debit key differs from the order key', async () => {
    const fixture = await seedReservationFixture('line-replay-independent-debit@example.com', 1);
    const input = request(
      fixture.siteId,
      fixture.tenantId,
      fixture.userId,
      fixture.accountId,
      fixture.skuId,
      'independent-debit-order-key',
    );
    await useCase.execute(input);

    await expect(repository.findOrderReplay({
      siteId: fixture.siteId,
      tenantId: fixture.tenantId,
      userId: fixture.userId,
      idempotencyKey: input.idempotencyKey,
      request: {
        skuCode: input.orderSnapshot.skuCode,
        countryCode: input.countryCode,
        quantity: input.quantity,
        durationDays: input.orderSnapshot.durationDays,
        currency: input.orderSnapshot.currency,
        regionCode: null,
        businessType: null,
        zoneCode: null,
      },
    })).resolves.toMatchObject({
      status: 'QUEUED',
      orderId: expect.any(String),
      reservationId: expect.any(String),
      jobId: expect.any(String),
      replayed: true,
    });
  });

  it('rejects a purchase when archiving the selected Zone wins the row-lock race', async () => {
    const fixture = await seedReservationFixture('line-zone-race@example.com', 1);
    const zone = await prisma.user_zones.create({
      data: {
        siteId: fixture.siteId,
        tenantId: fixture.tenantId,
        userId: fixture.userId,
        code: 'race-zone',
        name: 'Race Zone',
      },
    });

    let markArchiveStarted!: () => void;
    let releaseArchive!: () => void;
    const archiveStarted = new Promise<void>((resolve) => { markArchiveStarted = resolve; });
    const archiveMayCommit = new Promise<void>((resolve) => { releaseArchive = resolve; });
    const archive = prisma.$transaction(async (tx) => {
      await tx.user_zones.update({ where: { id: zone.id }, data: { status: 'ARCHIVED' } });
      markArchiveStarted();
      await archiveMayCommit;
    });
    await archiveStarted;

    const purchase = useCase.execute({
      ...request(
        fixture.siteId,
        fixture.tenantId,
        fixture.userId,
        fixture.accountId,
        fixture.skuId,
        'zone-race-key',
      ),
      zoneId: zone.id,
    }).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseArchive();
    await archive;

    const outcome = await purchase;
    expect(outcome.value).toBeNull();
    expect(outcome.error).toMatchObject({ httpStatus: 409, reasonKey: 'zone_archived' });
    expect(await prisma.dedicated_line_orders.count()).toBe(0);
  });

  it('projects only explicitly mapped provider resources into the dedicated snapshot and route selector', async () => {
    const siteId = await seedSite();
    const tenantId = await seedTenant(siteId);
    const account = await prisma.provider_accounts.create({
      data: {
        siteId,
        providerCode: 'NINE_EIGHT_FIVE',
        tenantId,
        status: 'ACTIVE',
        credentialEncrypted: 'test-only',
        baseUrl: 'https://provider.invalid',
        inventorySyncEnabled: true,
      },
    });
    const sku = await prisma.service_skus.create({
      data: {
        siteId,
        code: 'SV',
        name: 'Short Video',
        capabilities: {
          delivery: 'dedicated-line',
          inventorySource: {
            providerCode: 'NINE_EIGHT_FIVE',
            providerResourceIds: ['HK:premium'],
          },
        },
      },
    });
    const capturedAt = new Date();

    const summary = await repository.syncProviderSnapshot({
      siteId,
      providerAccountId: account.id,
      providerCode: 'NINE_EIGHT_FIVE',
      capturedAt,
      items: [
        {
          countryCode: 'HK',
          countryName: 'Hong Kong',
          stock: 3,
          ipType: 'NATIVE',
          protocol: 'BOTH',
          providerResourceId: 'HK:premium',
        },
        {
          countryCode: 'US',
          countryName: 'United States',
          stock: 99,
          ipType: 'NATIVE',
          protocol: 'BOTH',
          providerResourceId: 'US:premium',
        },
      ],
    });

    expect(summary).toEqual({ snapshots: 1, mappedSkus: 1 });
    expect(await prisma.dedicated_line_inventory_snapshots.count()).toBe(1);
    await expect(repository.findFreshRoute({
      siteId,
      tenantId,
      skuId: sku.id,
      countryCode: 'HK',
    })).resolves.toEqual({
      providerCode: 'NINE_EIGHT_FIVE',
      providerAccountId: account.id,
      providerResourceId: 'HK:premium',
    });
  });
});

function request(
  siteId: string,
  tenantId: string,
  userId: string,
  providerAccountId: string,
  skuId: string,
  idempotencyKey: string,
) {
  return {
    siteId,
    tenantId,
    userId,
    providerCode: 'NINE_EIGHT_FIVE',
    providerAccountId,
    skuId,
    countryCode: 'HK',
    quantity: 1,
    idempotencyKey,
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
    charge: {
      amount: '1',
      currency: 'CNY',
      idempotencyKey: `debit-${siteId}-${tenantId}-${userId}-${idempotencyKey}`,
    },
    jobPayload: {
      durationDays: 30,
      currency: 'CNY',
      protocol: 'SOCKS5',
      placementPolicyId: `policy-${idempotencyKey}`,
      inboundProfileId: `inbound-${idempotencyKey}`,
      inboundTag: 'it-inbound',
      lineProtocol: 'VLESS',
      maxReplicaFanout: 1,
    },
  } as const;
}

async function seedReservationFixture(email: string, quantity: number) {
  const siteId = await seedSite();
  const tenantId = await seedTenant(siteId);
  const { userId } = await seedUser(siteId, tenantId, { email, password: 'unused' });
  await prisma.wallets.update({ where: { userId }, data: { available: String(quantity) } });
  const account = await prisma.provider_accounts.create({
    data: {
      siteId,
      providerCode: 'NINE_EIGHT_FIVE',
      status: 'ACTIVE',
      credentialEncrypted: 'test-only',
      baseUrl: 'https://provider.invalid',
      inventorySyncEnabled: true,
    },
  });
  const sku = await prisma.service_skus.create({
    data: { siteId, code: 'SV', name: 'Short Video', capabilities: { delivery: 'dedicated-line' } },
  });
  await prisma.dedicated_line_inventory_snapshots.create({
    data: {
      siteId,
      providerAccountId: account.id,
      skuId: sku.id,
      providerCode: account.providerCode,
      countryCode: 'HK',
      providerResourceId: 'HK:premium',
      quantity,
      sourceVersion: `sync-${email}`,
      capturedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return { siteId, tenantId, userId, accountId: account.id, skuId: sku.id };
}
