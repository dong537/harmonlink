import { beforeEach, describe, expect, it, vi } from 'vitest';

const ordersDb = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@ipeasy/db', () => ({
  prisma: { orders: ordersDb },
  Prisma: {},
}));

import { OrdersRepository } from './orders.repository';

beforeEach(() => {
  ordersDb.count.mockReset().mockResolvedValue(0);
  ordersDb.findMany.mockReset().mockResolvedValue([]);
});

describe('OrdersRepository customer list scope', () => {
  it('applies site, tenant and user scope to the count and page queries', async () => {
    await new OrdersRepository().list('site-1', 'user-1', 'tenant-1', {
      page: 2,
      pageSize: 10,
      status: 'PENDING',
    });

    const where = {
      siteId: 'site-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      status: 'PENDING',
    };
    expect(ordersDb.count).toHaveBeenCalledWith({ where });
    expect(ordersDb.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
  });
});
