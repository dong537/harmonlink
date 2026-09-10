import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@ipeasy/db/generated/client';

const zonesDb = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

const dependenciesDb = vi.hoisted(() => ({
  count: vi.fn(),
}));

vi.mock('@ipeasy/db', () => ({
  prisma: {
    user_zones: zonesDb,
    dedicated_line_orders: dependenciesDb,
    dedicated_lines: dependenciesDb,
  },
  Prisma: {},
}));

import { lockActiveZone, ZonesRepository } from './zones.repository';

const scope = { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' };

beforeEach(() => {
  zonesDb.findFirst.mockReset();
  zonesDb.findMany.mockReset();
  zonesDb.create.mockReset();
  zonesDb.updateMany.mockReset();
  zonesDb.deleteMany.mockReset();
  dependenciesDb.count.mockReset();
});

describe('ZonesRepository scope boundaries', () => {
  it('locks and validates the complete owner-scoped row before persisting a Zone reference', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'zone-1', status: 'ACTIVE' }]);

    await lockActiveZone({ $queryRaw: queryRaw } as never, scope, 'zone-1');

    expect(queryRaw).toHaveBeenCalledOnce();
    const query = queryRaw.mock.calls[0]![0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join('?')).toContain('FOR UPDATE');
    expect(query.values).toEqual(['site-1', 'tenant-1', 'user-1', 'zone-1']);
  });

  it('rejects an archived Zone after acquiring its transaction row lock', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'zone-1', status: 'ARCHIVED' }]);

    await expect(
      lockActiveZone({ $queryRaw: queryRaw } as never, scope, 'zone-1'),
    ).rejects.toMatchObject({ httpStatus: 409, reasonKey: 'zone_archived' });
  });

  it('looks up a code only inside site, tenant and user scope', async () => {
    zonesDb.findFirst.mockResolvedValue({ id: 'zone-1' });

    await new ZonesRepository().findByCode(scope, 'short-video');

    expect(zonesDb.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, code: 'short-video' },
    }));
  });

  it('filters archived rows in the scoped database query by default', async () => {
    zonesDb.findMany.mockResolvedValue([]);

    await new ZonesRepository().listForOwner(scope, { includeArchived: false });

    expect(zonesDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }));
  });

  it('persists a zone in the complete owner scope and maps a concurrent code conflict', async () => {
    const repo = new ZonesRepository();
    const input = { code: 'short-video', name: 'Short video', description: null, sortOrder: 4 };
    zonesDb.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['user_zones_scope_code_key'] },
    }));

    await expect(repo.create(scope, input)).rejects.toMatchObject({
      httpStatus: 409,
      reasonKey: 'zone_code_taken',
    });
    expect(zonesDb.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { ...scope, ...input },
    }));
  });

  it('maps a foreign-key delete race to the dependency conflict', async () => {
    zonesDb.deleteMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('foreign key violation', {
      code: 'P2003',
      clientVersion: 'test',
    }));

    await expect(new ZonesRepository().delete(scope, 'zone-1')).rejects.toMatchObject({
      httpStatus: 409,
      reasonKey: 'zone_has_dependencies',
    });
    expect(zonesDb.deleteMany).toHaveBeenCalledWith({ where: { ...scope, id: 'zone-1' } });
  });

  it('counts orders and lines only inside the complete owner scope', async () => {
    dependenciesDb.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    await expect(new ZonesRepository().countDependencies(scope, 'zone-1')).resolves.toEqual({ orders: 2, lines: 3 });
    expect(dependenciesDb.count).toHaveBeenNthCalledWith(1, { where: { ...scope, zoneId: 'zone-1' } });
    expect(dependenciesDb.count).toHaveBeenNthCalledWith(2, { where: { ...scope, zoneId: 'zone-1' } });
  });

  it('returns a scoped not-found error when an update affects no row', async () => {
    zonesDb.updateMany.mockResolvedValue({ count: 0 });
    zonesDb.findFirst.mockResolvedValue(null);

    await expect(new ZonesRepository().update(scope, 'zone-1', { name: 'Updated' })).rejects.toMatchObject({
      httpStatus: 404,
      reasonKey: 'zone_not_found',
    });
    expect(zonesDb.updateMany).toHaveBeenCalledWith({
      where: { ...scope, id: 'zone-1', status: 'ACTIVE' },
      data: { name: 'Updated' },
    });
  });

  it('does not turn an archive/update race into an update of an archived zone', async () => {
    zonesDb.updateMany.mockResolvedValue({ count: 0 });
    zonesDb.findFirst.mockResolvedValue({ id: 'zone-1', status: 'ARCHIVED' });

    await expect(new ZonesRepository().update(scope, 'zone-1', { name: 'Updated' })).rejects.toMatchObject({
      httpStatus: 409,
      reasonKey: 'zone_archived',
    });
    expect(zonesDb.updateMany).toHaveBeenCalledWith({
      where: { ...scope, id: 'zone-1', status: 'ACTIVE' },
      data: { name: 'Updated' },
    });
  });
});
