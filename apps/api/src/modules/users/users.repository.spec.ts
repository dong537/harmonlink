import { beforeEach, describe, expect, it, vi } from 'vitest';

const usersDb = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@ipeasy/db', () => ({
  prisma: { users: usersDb },
  Prisma: {},
}));

import { UsersRepository } from './users.repository';

beforeEach(() => usersDb.findFirst.mockReset());

describe('UsersRepository legacy ID resolution', () => {
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
