import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/error-codes';
import { DedicatedLineOrderAdminRepository } from './dedicated-line-order-admin.repository';

const ordersDb = vi.hoisted(() => ({
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@ipeasy/db', () => ({
  prisma: { dedicated_line_orders: ordersDb },
}));

beforeEach(() => {
  vi.resetAllMocks();
  ordersDb.count.mockResolvedValue(1);
  ordersDb.findMany.mockResolvedValue([orderRow()]);
  ordersDb.findFirst.mockResolvedValue(orderRow());
});

describe('DedicatedLineOrderAdminRepository', () => {
  it('uses the same site and tenant scope for count, rows, and nested projections', async () => {
    const repository = new DedicatedLineOrderAdminRepository();

    await repository.listForAdmin(
      { siteId: 'site-1', tenantId: 'tenant-1' },
      { page: 2, pageSize: 7 },
    );

    const countWhere = ordersDb.count.mock.calls[0]?.[0]?.where;
    const findManyArgs = ordersDb.findMany.mock.calls[0]?.[0];
    expect(countWhere).toEqual({ siteId: 'site-1', tenantId: 'tenant-1' });
    expect(findManyArgs).toMatchObject({
      where: countWhere,
      skip: 7,
      take: 7,
      orderBy: { createdAt: 'desc' },
    });
    expect(findManyArgs.select).toMatchObject({
      reservation: { where: { siteId: 'site-1', tenantId: 'tenant-1' } },
      executionJob: {
        where: {
          siteId: 'site-1',
          tenantId: 'tenant-1',
          kind: 'PROVIDER_DEDICATED_LINE_ORDER',
        },
      },
      lines: {
        where: { siteId: 'site-1', tenantId: 'tenant-1' },
        select: {
          projections: {
            where: { siteId: 'site-1', tenantId: 'tenant-1' },
          },
        },
      },
    });
  });

  it('cannot widen a tenant scope with a caller-supplied tenant filter', async () => {
    const repository = new DedicatedLineOrderAdminRepository();

    await repository.listForAdmin(
      { siteId: 'site-1', tenantId: 'tenant-1' },
      { tenantId: 'tenant-2' },
    );

    expect(ordersDb.count).toHaveBeenCalledWith({
      where: { siteId: 'site-1', tenantId: 'tenant-1' },
    });
    expect(ordersDb.findMany.mock.calls[0]?.[0]?.where).toEqual({
      siteId: 'site-1',
      tenantId: 'tenant-1',
    });
  });

  it('projects operational state without leaking provider secrets or raw job payload', async () => {
    const repository = new DedicatedLineOrderAdminRepository();

    const result = await repository.getForAdmin('order-1', {
      siteId: 'site-1',
      tenantId: null,
    });
    const item = result;

    expect(item).toMatchObject({
      id: 'order-1',
      siteId: 'site-1',
      tenantId: 'tenant-1',
      unitPrice: '10.12500000',
      totalPrice: '20.25000000',
      status: 'FAILED',
      job: {
        id: 'job-1',
        upstreamOrderId: 'upstream-1',
        lastErrorCode: 'UPSTREAM_FAILED',
      },
      lines: [{
        limits: {
          trafficLimitBytes: '1024',
          uplinkLimitBps: '2000',
          downlinkLimitBps: '3000',
          maxConnections: 10,
          ipLimit: 2,
        },
        projections: [{ id: 'projection-1', status: 'READY' }],
      }],
    });

    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain('provider-secret');
    expect(serialized).not.toContain('credentialCiphertext');
    expect(serialized).not.toContain('lastErrorDetail');
    expect(serialized).not.toContain('leaseOwner');
    expect(serialized).not.toContain('leaseExpiresAt');
    expect(serialized).not.toContain('payload');
    expect(item.job).not.toHaveProperty('payload');
    expect(item.job).not.toHaveProperty('lastErrorDetail');
  });

  it('returns a typed not-found error for an order outside the requested site/tenant scope', async () => {
    ordersDb.findFirst.mockResolvedValue(null);
    const repository = new DedicatedLineOrderAdminRepository();

    await expect(repository.getForAdmin('order-1', {
      siteId: 'site-2',
      tenantId: 'tenant-2',
    })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      reasonKey: 'order_not_found',
      httpStatus: 404,
    });
    expect(ordersDb.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1', siteId: 'site-2', tenantId: 'tenant-2' },
    }));
  });
});

function orderRow() {
  const now = new Date('2026-09-12T00:00:00.000Z');
  return {
    id: 'order-1',
    siteId: 'site-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    zoneId: null,
    skuId: 'sku-1',
    skuCode: 'DED-1',
    skuName: 'Dedicated line',
    countryCode: 'US',
    regionCode: 'NA',
    businessType: 'native',
    durationDays: 30,
    quantity: 2,
    unitPrice: decimal('10.12500000'),
    totalPrice: decimal('20.25000000'),
    currency: 'CNY',
    priceSource: 'TEST',
    contractVersion: 1,
    createdAt: now,
    updatedAt: now,
    reservation: {
      id: 'reservation-1',
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      inventorySnapshotId: 'snapshot-1',
      providerAccountId: 'provider-account-1',
      skuId: 'sku-1',
      dedicatedLineOrderId: 'order-1',
      providerCode: 'IPIPD',
      countryCode: 'US',
      quantity: 2,
      snapshotVersion: 'snapshot-v1',
      status: 'ACTIVE',
      expiresAt: now,
      consumedAt: null,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    executionJob: {
      id: 'job-1',
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      dedicatedLineId: null,
      dedicatedLineOrderId: 'order-1',
      kind: 'PROVIDER_DEDICATED_LINE_ORDER',
      aggregateType: 'stock_reservation',
      aggregateId: 'reservation-1',
      desiredVersion: 1,
      status: 'FAILED',
      attempt: 2,
      maxAttempts: 5,
      nextRunAt: now,
      lastErrorCode: 'UPSTREAM_FAILED',
      payload: {
        upstreamOrderId: 'upstream-1',
        credentialCiphertext: 'provider-secret',
      },
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      leaseOwner: 'worker-secret',
      leaseExpiresAt: now,
      lastErrorDetail: { provider: 'secret-detail' },
    },
    lines: [{
      id: 'line-1',
      siteId: 'site-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      zoneId: null,
      skuId: 'sku-1',
      dedicatedLineOrderId: 'order-1',
      inboundProfileId: 'inbound-1',
      status: 'ACTIVE',
      countryCode: 'US',
      protocol: 'VLESS',
      clientEmail: 'user@example.com',
      desiredVersion: 1,
      quotaBytes: 1024n,
      uplinkLimitBps: 2000n,
      downlinkLimitBps: 3000n,
      maxConnections: 10,
      ipLimit: 2,
      startsAt: now,
      expiresAt: null,
      suspendedAt: null,
      createdAt: now,
      updatedAt: now,
      projections: [{
        id: 'projection-1',
        siteId: 'site-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        dedicatedLineId: 'line-1',
        migrationId: null,
        nodeId: 'node-1',
        projectionKey: 'line-1:node-1',
        status: 'READY',
        desiredVersion: 1,
        observedVersion: 1,
        nodeExternalId: 'external-1',
        lastErrorCode: null,
        lastErrorDetail: { hidden: true },
        retryCount: 0,
        lastAppliedAt: now,
        lastObservedAt: now,
        createdAt: now,
        updatedAt: now,
      }],
    }],
  };
}

function decimal(value: string) {
  return { toString: () => value };
}
