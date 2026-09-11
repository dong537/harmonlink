import { beforeEach, describe, expect, it, vi } from 'vitest';

const usersDb = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@ipeasy/db', () => ({
  prisma: { users: usersDb },
  Prisma: {},
}));

import { UsersRepository } from './users.repository';

beforeEach(() => usersDb.findFirst.mockReset());

describe('UsersRepository legacy ID resolution', () => {
  beforeEach(() => {
    usersDb.findFirst.mockReset();
    usersDb.findMany.mockReset();
    usersDb.count.mockReset();
  });

  it('resolves a customer only inside the admin site and tenant scope', async () => {
    usersDb.findFirst.mockResolvedValue({ id: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' });

    const result = await new UsersRepository().resolveLegacyIdForScope(17, {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual({ userId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' });
    expect(usersDb.findFirst).toHaveBeenCalledWith({
      where: { legacyId: 17, siteId: 'site-1', tenantId: 'tenant-1' },
      select: { id: true, siteId: true, tenantId: true },
    });
  });

  it('returns typed not-found instead of leaking an out-of-scope legacy ID', async () => {
    usersDb.findFirst.mockResolvedValue(null);

    await expect(new UsersRepository().resolveLegacyIdForScope(17, {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    })).rejects.toMatchObject({ httpStatus: 404, reasonKey: 'user_not_found' });
  });
});

describe('UsersRepository legacy admin projection', () => {
  it('applies email/status filters to both count and rows and maps wallet balance', async () => {
    usersDb.count.mockResolvedValue(1);
    usersDb.findMany.mockResolvedValue([{
      id: 'user-1',
      legacyId: 17,
      email: 'person@example.com',
      name: null,
      tenantId: 'tenant-1',
      status: 'SUSPENDED',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      wallets: [{ available: { toString: () => '4.25' } }],
    }]);

    const result = await new UsersRepository().listLegacyAdminUsers('site-1', 'tenant-1', {
      page: 2,
      pageSize: 50,
      email: 'person@example.com',
      status: 'DISABLED',
    });

    const expectedWhere = {
      siteId: 'site-1',
      tenantId: 'tenant-1',
      email: { contains: 'person@example.com', mode: 'insensitive' },
      status: { in: ['SUSPENDED', 'BANNED'] },
    };
    expect(usersDb.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(usersDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedWhere,
      skip: 50,
      take: 50,
    }));
    expect(result).toEqual({
      page: 2,
      pageSize: 50,
      total: 1,
      items: [{
        id: 'user-1',
        legacyId: 17,
        email: 'person@example.com',
        name: null,
        tenantId: 'tenant-1',
        status: 'SUSPENDED',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        balance: '4.25',
      }],
    });
  });

  it('enforces site and optional tenant scope when resolving a created user projection', async () => {
    usersDb.findFirst.mockResolvedValue({
      id: 'user-1',
      legacyId: 17,
      email: 'person@example.com',
      name: 'Person',
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      wallets: [],
    });

    await expect(new UsersRepository().findLegacyAdminUserById('user-1', {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    })).resolves.toMatchObject({ legacyId: 17, balance: null });
    expect(usersDb.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' },
    }));
  });
});
