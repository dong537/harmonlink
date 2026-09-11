import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@ipeasy/db';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageQueryDto, PageResult, normalizePageQuery } from '../../common/pagination/pagination.dto';
import { SelfUserScope } from './access';

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export type AdminUserListItem = {
  id: string;
  email: string;
  tenantId: string;
  status: UserStatus;
  kycStatus: string;
  createdAt: Date;
};

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  kycStatus: string;
  riskStatus: string;
};

export type UserOrderContext = {
  id: string;
  siteId: string;
  tenantId: string;
};

export type LegacyUserAdminScope = {
  siteId: string;
  tenantId: string | null;
};

export type LegacyAdminUserStatus = 'ACTIVE' | 'DISABLED';

export type LegacyAdminUserQuery = {
  page?: number;
  pageSize?: number;
  email?: string;
  status?: LegacyAdminUserStatus;
};

export type LegacyAdminUserProjection = {
  id: string;
  legacyId: number;
  email: string;
  name: string | null;
  tenantId: string;
  status: UserStatus;
  createdAt: Date;
  balance: string | null;
};

export type LegacyAdminUserPage = {
  page: number;
  pageSize: number;
  total: number;
  items: LegacyAdminUserProjection[];
};

export type ResolvedLegacyUser = {
  userId: string;
  siteId: string;
  tenantId: string;
};

@Injectable()
export class UsersRepository {
  async resolveLegacyIdForScope(legacyId: number, scope: LegacyUserAdminScope): Promise<ResolvedLegacyUser> {
    const user = await prisma.users.findFirst({
      where: {
        legacyId,
        siteId: scope.siteId,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      },
      select: { id: true, siteId: true, tenantId: true },
    });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    return { userId: user.id, siteId: user.siteId, tenantId: user.tenantId };
  }

  async findOrderContextByIdInSite(userId: string, siteId: string): Promise<UserOrderContext | null> {
    return prisma.users.findFirst({
      where: { id: userId, siteId },
      select: {
        id: true,
        siteId: true,
        tenantId: true,
      },
    });
  }

  /**
   * Reads the caller's own profile. Scoped by id + site + tenant so a session
   * whose tenant context drifted cannot read another tenant's row; a missing row
   * is reported as NOT_FOUND. Never selects passwordHash.
   */
  async getSelfProfile(owner: SelfUserScope): Promise<UserProfile> {
    const user = await prisma.users.findFirst({
      where: { id: owner.userId, siteId: owner.siteId, tenantId: owner.tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        kycStatus: true,
        riskStatus: true,
      },
    });
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    return user;
  }

  /**
   * Updates the caller's editable profile fields (name/phone only). email stays
   * read-only at this layer to avoid @unique churn. Scoped by id + site + tenant.
   */
  async updateSelfProfile(
    owner: SelfUserScope,
    data: { name: string | null; phone: string | null },
  ): Promise<UserProfile> {
    const result = await prisma.users.updateMany({
      where: { id: owner.userId, siteId: owner.siteId, tenantId: owner.tenantId },
      data: { name: data.name, phone: data.phone },
    });
    if (result.count === 0) throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    return this.getSelfProfile(owner);
  }

  async listUsers(
    siteId: string,
    tenantId: string | null,
    query: PageQueryDto & { status?: UserStatus },
  ): Promise<PageResult<AdminUserListItem>> {
    const { page, pageSize } = normalizePageQuery(query);
    const where: Prisma.usersWhereInput = { siteId };
    if (tenantId) where.tenantId = tenantId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.email = { contains: query.search, mode: 'insensitive' };
    }

    const [total, items] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          tenantId: true,
          status: true,
          kycStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  /**
   * Reads the narrow projection required by the frozen admin users page.
   * This deliberately lives beside, rather than inside, the canonical users
   * list contract because the legacy client needs a numeric identity and a
   * wallet projection.
   */
  async listLegacyAdminUsers(
    siteId: string,
    tenantId: string | null,
    query: LegacyAdminUserQuery = {},
  ): Promise<LegacyAdminUserPage> {
    const { page, pageSize } = normalizePageQuery(query, { maxPageSize: 100 });
    const where: Prisma.usersWhereInput = {
      siteId,
      ...(tenantId ? { tenantId } : {}),
    };
    if (query.email?.trim()) {
      where.email = { contains: query.email.trim(), mode: 'insensitive' };
    }
    if (query.status === 'ACTIVE') {
      where.status = 'ACTIVE';
    } else if (query.status === 'DISABLED') {
      where.status = { in: ['SUSPENDED', 'BANNED'] };
    }

    const [total, rows] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          legacyId: true,
          email: true,
          name: true,
          tenantId: true,
          status: true,
          createdAt: true,
          wallets: {
            take: 1,
            select: { available: true },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => ({
        id: row.id,
        legacyId: row.legacyId,
        email: row.email,
        name: row.name,
        tenantId: row.tenantId,
        status: row.status,
        createdAt: row.createdAt,
        balance: row.wallets?.[0]?.available.toString() ?? null,
      })),
    };
  }

  async findLegacyAdminUserById(
    userId: string,
    scope: LegacyUserAdminScope,
  ): Promise<LegacyAdminUserProjection> {
    const row = await prisma.users.findFirst({
      where: {
        id: userId,
        siteId: scope.siteId,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        id: true,
        legacyId: true,
        email: true,
        name: true,
        tenantId: true,
        status: true,
        createdAt: true,
        wallets: {
          take: 1,
          select: { available: true },
        },
      },
    });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    return {
      id: row.id,
      legacyId: row.legacyId,
      email: row.email,
      name: row.name,
      tenantId: row.tenantId,
      status: row.status,
      createdAt: row.createdAt,
      balance: row.wallets?.[0]?.available.toString() ?? null,
    };
  }
}
