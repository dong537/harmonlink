import { beforeEach, describe, expect, it, vi } from 'vitest';

const ticketsDb = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@ipeasy/db', () => ({
  prisma: { tickets: ticketsDb },
  Prisma: {},
}));

import { TicketsRepository } from './tickets.repository';

const owner = { ownerId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' };

beforeEach(() => {
  ticketsDb.findFirst.mockReset();
  ticketsDb.findMany.mockReset();
});

describe('TicketsRepository legacy ID resolution', () => {
  it('resolves a numeric legacy ID only inside the customer owner scope', async () => {
    ticketsDb.findFirst.mockResolvedValue({ id: 'ticket-uuid' });
    const repo = new TicketsRepository();

    const id = await repo.resolveOwnedLegacyId(17, owner);

    expect(id).toBe('ticket-uuid');
    expect(ticketsDb.findFirst).toHaveBeenCalledWith({
      where: {
        legacyId: 17,
        userId: 'user-1',
        siteId: 'site-1',
        tenantId: 'tenant-1',
      },
      select: { id: true },
    });
  });

  it('resolves a numeric legacy ID inside the admin site and tenant scope', async () => {
    ticketsDb.findFirst.mockResolvedValue({ id: 'ticket-uuid' });
    const repo = new TicketsRepository();

    await repo.resolveLegacyIdForScope(17, { siteId: 'site-1', tenantId: 'tenant-1' });

    expect(ticketsDb.findFirst).toHaveBeenCalledWith({
      where: { legacyId: 17, siteId: 'site-1', tenantId: 'tenant-1' },
      select: { id: true },
    });
  });

  it('returns typed NOT_FOUND when a numeric ID is outside scope', async () => {
    ticketsDb.findFirst.mockResolvedValue(null);
    const repo = new TicketsRepository();

    await expect(repo.resolveOwnedLegacyId(17, owner)).rejects.toMatchObject({
      httpStatus: 404,
      reasonKey: 'ticket_not_found',
    });
  });

  it('bulk-projects notification ticket UUIDs to numeric IDs inside owner scope', async () => {
    ticketsDb.findMany.mockResolvedValue([
      { id: 'ticket-a', legacyId: 17 },
      { id: 'ticket-b', legacyId: 18 },
    ]);
    const repo = new TicketsRepository();

    const result = await repo.mapLegacyIdsForOwner(owner, ['ticket-a', 'ticket-b']);

    expect(ticketsDb.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['ticket-a', 'ticket-b'] },
        userId: 'user-1',
        siteId: 'site-1',
        tenantId: 'tenant-1',
      },
      select: { id: true, legacyId: true },
    });
    expect(result).toEqual(new Map([['ticket-a', 17], ['ticket-b', 18]]));
  });
});
