import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import { Prisma } from '@ipeasy/db/generated/client';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { PersistZoneInput, Zone, ZoneScope } from './domain';

const zoneSelect = {
  id: true,
  siteId: true,
  tenantId: true,
  userId: true,
  code: true,
  name: true,
  description: true,
  status: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ZonesRepository {
  async listForOwner(scope: ZoneScope, options: { includeArchived: boolean }): Promise<Zone[]> {
    return prisma.user_zones.findMany({
      where: { ...scope, ...(options.includeArchived ? {} : { status: 'ACTIVE' }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: zoneSelect,
    }) as Promise<Zone[]>;
  }

  async findByCode(scope: ZoneScope, code: string): Promise<Zone | null> {
    return prisma.user_zones.findFirst({ where: { ...scope, code }, select: zoneSelect }) as Promise<Zone | null>;
  }

  async getForOwner(scope: ZoneScope, id: string): Promise<Zone> {
    const row = await prisma.user_zones.findFirst({ where: { ...scope, id }, select: zoneSelect });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
    return row as Zone;
  }

  async create(scope: ZoneScope, input: PersistZoneInput): Promise<Zone> {
    try {
      return await prisma.user_zones.create({
        data: { ...scope, ...input },
        select: zoneSelect,
      }) as Zone;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_code_taken', 409);
      }
      throw error;
    }
  }

  async update(scope: ZoneScope, id: string, data: Partial<Omit<PersistZoneInput, 'code'>>): Promise<Zone> {
    // Keep the lifecycle check in the write predicate. The use case performs a
    // read for a better error, but that read can race with archive.
    const result = await prisma.user_zones.updateMany({ where: { ...scope, id, status: 'ACTIVE' }, data });
    if (result.count !== 1) {
      const existing = await prisma.user_zones.findFirst({ where: { ...scope, id }, select: zoneSelect });
      if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
      if (existing.status === 'ARCHIVED') {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_archived', 409);
      }
      throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
    }
    return this.getForOwner(scope, id);
  }

  async archive(scope: ZoneScope, id: string): Promise<Zone> {
    const result = await prisma.user_zones.updateMany({
      where: { ...scope, id, status: 'ACTIVE' },
      data: { status: 'ARCHIVED' },
    });
    if (result.count !== 1) {
      const existing = await prisma.user_zones.findFirst({ where: { ...scope, id }, select: zoneSelect });
      if (!existing) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
      return existing as Zone;
    }
    return this.getForOwner(scope, id);
  }

  async countDependencies(scope: ZoneScope, id: string): Promise<{ orders: number; lines: number }> {
    const [orders, lines] = await Promise.all([
      prisma.dedicated_line_orders.count({ where: { ...scope, zoneId: id } }),
      prisma.dedicated_lines.count({ where: { ...scope, zoneId: id } }),
    ]);
    return { orders, lines };
  }

  async delete(scope: ZoneScope, id: string): Promise<void> {
    try {
      const result = await prisma.user_zones.deleteMany({ where: { ...scope, id } });
      if (result.count !== 1) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_has_dependencies', 409);
      }
      throw error;
    }
  }
}

/**
 * Lock the scoped Zone row before a purchase or renewal persists its ID.
 * Lifecycle writes use the same row lock, so an archive that wins the race
 * is observed as ARCHIVED instead of allowing a stale ACTIVE read through.
 */
export async function lockActiveZone(
  tx: Prisma.TransactionClient,
  scope: ZoneScope,
  id: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
    SELECT "id", "status"
    FROM "user_zones"
    WHERE "siteId" = ${scope.siteId}
      AND "tenantId" = ${scope.tenantId}
      AND "userId" = ${scope.userId}
      AND "id" = ${id}
    FOR UPDATE
  `);
  const zone = rows[0];
  if (!zone) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
  if (zone.status !== 'ACTIVE') {
    throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_archived', 409);
  }
}
