import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedContext } from '../../common/auth/auth-context';

const db = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));

vi.mock('@ipeasy/db', () => ({
  prisma: { dedicated_lines: { findMany: db.findMany, count: db.count } },
}));

import { DedicatedLineDeliveryUseCase } from './dedicated-line-delivery.use-case';

const ctx: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  db.count.mockResolvedValue(2);
  db.findMany.mockResolvedValue([{
    id: 'line-1',
    status: 'PROVISIONING',
    countryCode: 'HK',
    protocol: 'VLESS',
    expiresAt: null,
    clientIdentityCiphertext: 'unused',
    clientEmail: 'line@example.com',
    quotaBytes: 9_007_199_254_740_993n,
    uplinkLimitBps: 131_072n,
    downlinkLimitBps: 524_288n,
    maxConnections: 32,
    ipLimit: 2,
    inboundProfile: { inboundTag: 'sv-hk-1' },
    deliveryRoutes: [],
    projections: [{ status: 'PENDING' }],
  }]);
});

describe('DedicatedLineDeliveryUseCase', () => {
  it('counts only the authenticated user scope without loading client credentials', async () => {
    const result = await new DedicatedLineDeliveryUseCase({ get: vi.fn() } as never).count(ctx);

    expect(result).toBe(2);
    expect(db.count).toHaveBeenCalledWith({
      where: {
        siteId: 'site-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: { in: ['ACTIVE', 'DEGRADED'] },
      },
    });
    expect(db.findMany).not.toHaveBeenCalled();
  });

  it('rejects a user context without a tenant before touching the database', async () => {
    await expect(new DedicatedLineDeliveryUseCase({ get: vi.fn() } as never).count({ ...ctx, tenantId: null })).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'tenant_required',
    });
    expect(db.count).not.toHaveBeenCalled();
  });

  it('returns BigInt limits as lossless decimal strings', async () => {
    const result = await new DedicatedLineDeliveryUseCase({ get: vi.fn() } as never).list(ctx);

    expect(result[0]?.limits).toEqual({
      trafficLimitBytes: '9007199254740993',
      uplinkLimitBps: '131072',
      downlinkLimitBps: '524288',
      maxConnections: 32,
      ipLimit: 2,
    });
  });
});
