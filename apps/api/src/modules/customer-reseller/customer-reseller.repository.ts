import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { prisma, Prisma } from '@ipeasy/db';
import Decimal from 'decimal.js';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageQueryDto, PageResult, normalizePageQuery } from '../../common/pagination/pagination.dto';
import { requestIdStorage } from '../../common/logging/request-id.context';
import { WalletRepository } from '../wallet/wallet.repository';
import { AdjustWalletDto, WalletDto } from '../wallet/dto';
import { assertPositiveAmount, assertSameCurrency } from '../wallet/domain';
import { isInventorySnapshotStale } from '../resources/domain';

const BCRYPT_COST = 10;
type PrismaTransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export type OwnedTenant = {
  id: string;
  siteId: string;
  ownerUserId: string | null;
  code: string;
  name: string;
  status: string;
  customerCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ResellerCustomer = {
  id: string;
  email: string;
  tenantId: string;
  status: string;
  available: string;
  frozen: string;
  currency: string;
  orderCount: number;
  createdAt: Date;
};

export type ResellerProduct = {
  resourceId: string;
  code: string;
  name: string;
  displayName: string | null;
  ipType: string;
  protocol: string;
  status: string;
  stock: number | null;
  inventoryCapturedAt: Date | null;
  inventoryIsStale: boolean | null;
  enabled: boolean;
  unitPrice: string | null;
  currency: string | null;
};

@Injectable()
export class CustomerResellerRepository {
  constructor(private readonly walletRepo: WalletRepository) {}

  async findOwnedTenant(siteId: string, ownerUserId: string): Promise<OwnedTenant | null> {
    const tenant = await prisma.tenants.findFirst({
      where: { siteId, ownerUserId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    if (!tenant) return null;
    return {
      id: tenant.id,
      siteId: tenant.siteId,
      ownerUserId: tenant.ownerUserId,
      code: tenant.code,
      name: tenant.name,
      status: tenant.status,
      customerCount: tenant._count.users,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async requireOwnedTenant(siteId: string, ownerUserId: string): Promise<OwnedTenant> {
    const tenant = await this.findOwnedTenant(siteId, ownerUserId);
    if (!tenant) throw new AppError(ErrorCode.NOT_FOUND, 'reseller_not_created', 404);
    return tenant;
  }

  async getOverview(siteId: string, ownerUserId: string) {
    const tenant = await this.requireOwnedTenant(siteId, ownerUserId);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [customerCount, orderCount, monthlyOrders, templateCount, productCount, saleableProductCount, wallets] = await Promise.all([
      prisma.users.count({ where: { siteId, tenantId: tenant.id } }),
      prisma.orders.count({ where: { siteId, tenantId: tenant.id } }),
      prisma.orders.count({ where: { siteId, tenantId: tenant.id, createdAt: { gte: monthStart } } }),
      prisma.price_templates.count({ where: { siteId, tenantId: tenant.id } }),
      prisma.platform_resources.count({ where: mainSiteSaleableResourceWhere(siteId) }),
      this.countTenantProducts(siteId, tenant.id),
      prisma.wallets.findMany({ where: { siteId, tenantId: tenant.id }, select: { available: true, currency: true } }),
    ]);
    const balanceByCurrency: Record<string, string> = {};
    for (const wallet of wallets) {
      const current = new Decimal(balanceByCurrency[wallet.currency] ?? '0');
      balanceByCurrency[wallet.currency] = current.plus(wallet.available.toString()).toFixed();
    }
    return { tenant, stats: { customerCount, orderCount, monthlyOrders, templateCount, productCount, saleableProductCount, balanceByCurrency } };
  }

  async listProducts(siteId: string, tenantId: string, query: PageQueryDto & { search?: string; status?: string } = {}): Promise<PageResult<ResellerProduct>> {
    const { page, pageSize } = normalizePageQuery(query);
    const where = mainSiteSaleableResourceWhere(siteId);
    const template = await this.findDefaultTemplate(siteId, tenantId);
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'ENABLED') {
      if (!template) return { page, pageSize, total: 0, items: [] };
      const enabledRules = await prisma.price_rules.findMany({
        where: { siteId, templateId: template.id, durationDays: 30 },
        select: { resourceId: true },
      });
      where.id = { in: enabledRules.map((rule) => rule.resourceId) };
    }
    if (query.status === 'DISABLED' && template) {
      const enabledRules = await prisma.price_rules.findMany({
        where: { siteId, templateId: template.id, durationDays: 30 },
        select: { resourceId: true },
      });
      where.id = { notIn: enabledRules.map((rule) => rule.resourceId) };
    }

    const [total, rows] = await Promise.all([
      prisma.platform_resources.count({ where }),
      prisma.platform_resources.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          inventory_snapshots: {
            orderBy: { capturedAt: 'desc' },
            take: 1,
          },
          price_rules: {
            where: { siteId, templateId: template?.id ?? '', durationDays: 30, minQty: { lte: 1 } },
            orderBy: { minQty: 'desc' },
            take: 1,
          },
        },
      }),
    ]);
    return { page, pageSize, total, items: rows.map(toResellerProduct) };
  }

  async upsertProductRules(siteId: string, tenantId: string, products: Array<{
    resourceId: string;
    enabled: boolean;
    unitPrice?: string;
    currency?: string;
  }>) {
    const template = await this.ensureDefaultTemplate(siteId, tenantId);
    const resourceIds = [...new Set(products.map((product) => product.resourceId))];
    const resourceCount = await prisma.platform_resources.count({
      where: { ...mainSiteSaleableResourceWhere(siteId), id: { in: resourceIds } },
    });
    if (resourceCount !== resourceIds.length) {
      throw new AppError(ErrorCode.NOT_FOUND, 'resource_not_found', 404);
    }
    return prisma.$transaction(products.map((product) => {
      if (!product.enabled) {
        return prisma.price_rules.deleteMany({
          where: { siteId, templateId: template.id, resourceId: product.resourceId, durationDays: 30 },
        });
      }
      return prisma.price_rules.upsert({
        where: {
          siteId_templateId_resourceId_durationDays: {
            siteId,
            templateId: template.id,
            resourceId: product.resourceId,
            durationDays: 30,
          },
        },
        create: {
          siteId,
          templateId: template.id,
          resourceId: product.resourceId,
          durationDays: 30,
          unitPrice: product.unitPrice!,
          currency: product.currency!,
          minQty: 1,
        },
        update: {
          unitPrice: product.unitPrice!,
          currency: product.currency!,
          minQty: 1,
        },
      });
    }));
  }

  async listCustomers(siteId: string, tenantId: string, query: PageQueryDto = {}): Promise<PageResult<ResellerCustomer>> {
    const { page, pageSize } = normalizePageQuery(query);
    const where: Prisma.usersWhereInput = { siteId, tenantId };
    if (query.search) where.email = { contains: query.search, mode: 'insensitive' };
    const [total, rows] = await Promise.all([
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
          createdAt: true,
          wallets: { take: 1, select: { available: true, frozen: true, currency: true } },
          _count: { select: { orders: true } },
        },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((row) => {
        const wallet = row.wallets[0];
        return {
          id: row.id,
          email: row.email,
          tenantId: row.tenantId,
          status: row.status,
          available: wallet?.available.toString() ?? '0',
          frozen: wallet?.frozen.toString() ?? '0',
          currency: wallet?.currency ?? '',
          orderCount: row._count.orders,
          createdAt: row.createdAt,
        };
      }),
    };
  }

  async createCustomer(input: {
    siteId: string;
    tenantId: string;
    email: string;
    password: string;
    currency: string;
    actorUserId: string;
    requestId: string;
  }): Promise<{ id: string; email: string; tenantId: string }> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    return prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          siteId: input.siteId,
          tenantId: input.tenantId,
          email: input.email,
          passwordHash,
          status: 'ACTIVE',
          kycStatus: 'NONE',
          riskStatus: 'NORMAL',
        },
        select: { id: true, email: true, tenantId: true },
      });
      await tx.wallets.create({
        data: {
          siteId: input.siteId,
          tenantId: input.tenantId,
          userId: user.id,
          available: '0',
          frozen: '0',
          currency: input.currency,
        },
      });
      await tx.audit_logs.create({
        data: {
          siteId: input.siteId,
          tenantId: input.tenantId,
          actorType: 'USER',
          actorId: input.actorUserId,
          targetType: 'user',
          targetId: user.id,
          action: 'reseller.user.create',
          requestId: input.requestId,
        },
      });
      return user;
    });
  }

  async adjustCustomerWallet(input: {
    siteId: string;
    tenantId: string;
    actorUserId: string;
    targetUserId: string;
    dto: AdjustWalletDto;
    requestId?: string;
  }): Promise<WalletDto> {
    const direction = input.dto.direction;
    if (direction !== 'credit' && direction !== 'debit') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'wallet_adjust_direction_invalid', 400);
    }
    assertPositiveAmount(input.dto.amount);
    const reason = typeof input.dto.reason === 'string' ? input.dto.reason.trim() : '';
    if (!reason) throw new AppError(ErrorCode.VALIDATION_ERROR, 'reason_required', 400);
    if (!input.dto.idempotencyKey) throw new AppError(ErrorCode.VALIDATION_ERROR, 'idempotency_key_required', 400);

    const wallet = await this.walletRepo.getWalletByUserId(input.targetUserId, input.siteId, input.tenantId);
    assertSameCurrency(wallet.currency, input.dto.currency);

    const updatedWallet = await prisma.$transaction(async (tx) => {
      const txClient = tx as PrismaTransactionClient;
      if (direction === 'credit') {
        await this.walletRepo.creditWalletTx(
          txClient,
          wallet.id,
          input.dto.amount,
          input.dto.currency,
          'ADJUSTMENT',
          input.actorUserId,
          reason,
          input.dto.idempotencyKey,
        );
      } else {
        await this.walletRepo.debitWalletTx(
          txClient,
          wallet.id,
          input.dto.amount,
          input.dto.currency,
          'ADJUSTMENT',
          input.actorUserId,
          reason,
          input.dto.idempotencyKey,
        );
      }

      await tx.audit_logs.create({
        data: {
          siteId: input.siteId,
          tenantId: input.tenantId,
          actorType: 'USER',
          actorId: input.actorUserId,
          targetType: 'wallet',
          targetId: wallet.id,
          action: 'reseller.wallet.adjust',
          reason,
          requestId: input.requestId ?? requestIdStorage.getStore() ?? '',
          meta: {
            targetUserId: input.targetUserId,
            amount: input.dto.amount,
            direction,
            idempotencyKey: input.dto.idempotencyKey,
          },
        },
      });

      return tx.wallets.findUniqueOrThrow({ where: { id: wallet.id } });
    });

    return {
      id: updatedWallet.id,
      userId: updatedWallet.userId,
      available: updatedWallet.available.toString(),
      frozen: updatedWallet.frozen.toString(),
      currency: updatedWallet.currency,
      updatedAt: updatedWallet.updatedAt,
    };
  }

  async listOrders(siteId: string, tenantId: string, query: PageQueryDto & { userId?: string; status?: string } = {}) {
    const { page, pageSize } = normalizePageQuery(query);
    const where: Prisma.ordersWhereInput = { siteId, tenantId };
    if (query.userId) where.userId = query.userId;
    if (query.status) where.status = query.status as Prisma.ordersWhereInput['status'];
    const [total, items] = await Promise.all([
      prisma.orders.count({ where }),
      prisma.orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { email: true } }, resource: { select: { code: true, name: true, displayName: true } } },
      }),
    ]);
    return { page, pageSize, total, items };
  }

  async listTemplates(siteId: string, tenantId: string, query: PageQueryDto = {}) {
    const { page, pageSize } = normalizePageQuery(query);
    const where: Prisma.price_templatesWhereInput = { siteId, tenantId };
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
    const [total, items] = await Promise.all([
      prisma.price_templates.count({ where }),
      prisma.price_templates.findMany({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          price_rules: {
            orderBy: [{ durationDays: 'asc' }, { createdAt: 'asc' }],
            include: { resource: { select: { id: true, code: true, name: true, displayName: true } } },
          },
        },
      }),
    ]);
    return { page, pageSize, total, items };
  }

  async createTemplate(siteId: string, tenantId: string, body: { name: string; description?: string | null; isDefault?: boolean }) {
    if (body.isDefault) {
      return prisma.$transaction(async (tx) => {
        await tx.price_templates.updateMany({ where: { siteId, tenantId, isDefault: true }, data: { isDefault: false } });
        return tx.price_templates.create({ data: { siteId, tenantId, name: body.name, description: body.description ?? null, isDefault: true } });
      });
    }
    return prisma.price_templates.create({ data: { siteId, tenantId, name: body.name, description: body.description ?? null, isDefault: false } });
  }

  private async countTenantProducts(siteId: string, tenantId: string): Promise<number> {
    const template = await this.findDefaultTemplate(siteId, tenantId);
    if (!template) return 0;
    return prisma.price_rules.count({ where: { siteId, templateId: template.id, durationDays: 30 } });
  }

  private async findDefaultTemplate(siteId: string, tenantId: string): Promise<{ id: string } | null> {
    return prisma.price_templates.findFirst({ where: { siteId, tenantId, isDefault: true }, select: { id: true } });
  }

  private async ensureDefaultTemplate(siteId: string, tenantId: string): Promise<{ id: string }> {
    const existing = await this.findDefaultTemplate(siteId, tenantId);
    if (existing) return existing;
    return prisma.price_templates.create({
      data: {
        siteId,
        tenantId,
        name: '分站默认商品价格',
        description: '分站商品资源管理自动维护的默认售价表',
        isDefault: true,
      },
      select: { id: true },
    });
  }

  async upsertRules(siteId: string, tenantId: string, templateId: string, rules: Array<{
    resourceId: string;
    durationDays: number;
    unitPrice: string;
    currency: string;
    minQty?: number;
  }>) {
    const template = await prisma.price_templates.findFirst({ where: { id: templateId, siteId, tenantId } });
    if (!template) throw new AppError(ErrorCode.NOT_FOUND, 'price_template_not_found', 404);
    return prisma.$transaction(rules.map((rule) =>
      prisma.price_rules.upsert({
        where: { siteId_templateId_resourceId_durationDays: { siteId, templateId, resourceId: rule.resourceId, durationDays: rule.durationDays } },
        create: { siteId, templateId, resourceId: rule.resourceId, durationDays: rule.durationDays, unitPrice: rule.unitPrice, currency: rule.currency, minQty: rule.minQty ?? 1 },
        update: { unitPrice: rule.unitPrice, currency: rule.currency, minQty: rule.minQty ?? 1 },
      }),
    ));
  }
}

type ResellerProductRow = Prisma.platform_resourcesGetPayload<{
  include: {
    inventory_snapshots: true;
    price_rules: true;
  };
}>;

function mainSiteSaleableResourceWhere(siteId: string): Prisma.platform_resourcesWhereInput {
  return {
    siteId,
    status: 'ACTIVE',
    isVisible: true,
    isSaleable: true,
  };
}

function toResellerProduct(row: ResellerProductRow): ResellerProduct {
  const latest = row.inventory_snapshots[0];
  const rule = row.price_rules[0] ?? null;
  const inventoryIsStale = latest ? isInventorySnapshotStale({ ...latest, providerCode: row.providerCode }) : null;
  return {
    resourceId: row.id,
    code: row.code,
    name: row.name,
    displayName: row.displayName,
    ipType: row.ipType,
    protocol: row.protocol,
    status: row.status,
    stock: latest?.stock ?? null,
    inventoryCapturedAt: latest?.capturedAt ?? null,
    inventoryIsStale,
    enabled: Boolean(rule),
    unitPrice: rule?.unitPrice.toString() ?? null,
    currency: rule?.currency ?? null,
  };
}
