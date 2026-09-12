import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Decimal from 'decimal.js';
import { prisma, Prisma } from '@ipeasy/db';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { requireTenantId } from '../../wallet/access';

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface AdminUserOperationResult {
  id: string;
  status?: UserStatus;
}

@Injectable()
export class AdminUserOperationsUseCase {
  async updateStatus(
    ctx: AuthenticatedContext,
    userId: string,
    body: { status?: unknown },
  ): Promise<AdminUserOperationResult> {
    this.assertAdmin(ctx);
    const status = readStatus(body?.status);

    return prisma.$transaction(async (tx) => {
      const user = await this.findTarget(tx, ctx, userId);
      const updated = await tx.users.updateMany({
        where: this.targetWhere(ctx, userId),
        data: { status },
      });
      if (updated.count === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
      }

      if (status !== 'ACTIVE') {
        await tx.sessions.updateMany({
          where: {
            ownerType: 'USER',
            ownerId: user.id,
            siteId: ctx.siteId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
      }

      await tx.audit_logs.create({
        data: {
          siteId: ctx.siteId,
          tenantId: user.tenantId,
          actorType: 'ADMIN_USER',
          actorId: ctx.ownerId,
          targetType: 'user',
          targetId: user.id,
          action: 'users.update_status',
          requestId: ctx.requestId,
          meta: { from: user.status, to: status },
        },
      });

      return { id: user.id, status };
    });
  }

  async resetPassword(
    ctx: AuthenticatedContext,
    userId: string,
    body: { password?: unknown },
  ): Promise<AdminUserOperationResult> {
    this.assertAdmin(ctx);
    const password = readPassword(body?.password);
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    return prisma.$transaction(async (tx) => {
      const user = await this.findTarget(tx, ctx, userId);
      const updated = await tx.users.updateMany({
        where: this.targetWhere(ctx, userId),
        data: { passwordHash },
      });
      if (updated.count === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
      }

      await tx.sessions.updateMany({
        where: {
          ownerType: 'USER',
          ownerId: user.id,
          siteId: ctx.siteId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      await tx.audit_logs.create({
        data: {
          siteId: ctx.siteId,
          tenantId: user.tenantId,
          actorType: 'ADMIN_USER',
          actorId: ctx.ownerId,
          targetType: 'user',
          targetId: user.id,
          action: 'users.reset_password',
          requestId: ctx.requestId,
        },
      });

      return { id: user.id };
    });
  }

  async delete(ctx: AuthenticatedContext, userId: string): Promise<AdminUserOperationResult> {
    this.assertAdmin(ctx);

    return prisma.$transaction(async (tx) => {
      const user = await this.findTarget(tx, ctx, userId);
      const [orders, proxies, paymentOrders, tickets, ledgerEntries, dedicatedRecords, ownedTenants, wallet] = await Promise.all([
        tx.orders.count({ where: { userId: user.id } }),
        tx.proxy_instances.count({ where: { userId: user.id } }),
        tx.payment_orders.count({ where: { userId: user.id } }),
        tx.tickets.count({ where: { userId: user.id } }),
        tx.ledger_entries.count({ where: { wallet: { userId: user.id } } }),
        this.countDedicatedBusinessRecords(tx, user.id),
        tx.tenants.count({ where: { ownerUserId: user.id } }),
        tx.wallets.findUnique({
          where: { userId: user.id },
          select: { id: true, available: true, frozen: true },
        }),
      ]);

      if (orders || proxies || paymentOrders || tickets || ledgerEntries || dedicatedRecords || ownedTenants) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'user_has_business_records', 422);
      }
      if (wallet && (!isZero(wallet.available) || !isZero(wallet.frozen))) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'user_has_business_records', 422);
      }

      // These rows are account-local state, not business history. Remove them
      // in the same transaction so the user row cannot become an orphan.
      await tx.sessions.deleteMany({
        where: { ownerType: 'USER', ownerId: user.id, siteId: ctx.siteId },
      });
      await tx.api_keys.deleteMany({
        where: { ownerType: 'USER', ownerId: user.id, siteId: ctx.siteId },
      });
      await tx.user_sku_price_overrides.deleteMany({ where: { userId: user.id } });
      await tx.user_resource_price_overrides.deleteMany({ where: { userId: user.id } });
      await tx.user_price_bindings.deleteMany({ where: { userId: user.id } });
      await tx.notifications.deleteMany({ where: { userId: user.id } });

      if (wallet) {
        await tx.ledger_entries.deleteMany({ where: { walletId: wallet.id } });
        await tx.wallets.delete({ where: { id: wallet.id } });
      }

      await tx.audit_logs.create({
        data: {
          siteId: ctx.siteId,
          tenantId: user.tenantId,
          actorType: 'ADMIN_USER',
          actorId: ctx.ownerId,
          targetType: 'user',
          targetId: user.id,
          action: 'users.delete',
          requestId: ctx.requestId,
        },
      });
      await tx.users.delete({ where: { id: user.id } });

      return { id: user.id };
    });
  }

  private assertAdmin(ctx: AuthenticatedContext): void {
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'admin_only', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN') {
      requireTenantId(ctx);
    }
  }

  private targetWhere(ctx: AuthenticatedContext, userId: string): { id: string; siteId: string; tenantId?: string } {
    const tenantId = ctx.ownerType === 'TENANT_ADMIN' ? requireTenantId(ctx) : undefined;
    return {
      id: userId,
      siteId: ctx.siteId,
      ...(tenantId ? { tenantId } : {}),
    };
  }

  private async findTarget(
    tx: Prisma.TransactionClient,
    ctx: AuthenticatedContext,
    userId: string,
  ): Promise<{ id: string; tenantId: string; status: UserStatus }> {
    const user = await tx.users.findFirst({
      where: this.targetWhere(ctx, userId),
      select: { id: true, tenantId: true, status: true },
    });
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    }
    return user as { id: string; tenantId: string; status: UserStatus };
  }

  /**
   * A user may own a dedicated line without an entry in the legacy `orders`
   * table. Keep every dedicated-line record behind the same deletion guard so
   * a user delete can never orphan a line, reservation, placement, or worker
   * job. Child rows are intentionally covered by their direct user columns as
   * well: this also protects against partially-cleaned historical data.
   */
  private async countDedicatedBusinessRecords(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const counts = await Promise.all([
      tx.dedicated_line_orders.count({ where: { userId } }),
      tx.dedicated_lines.count({ where: { userId } }),
      tx.stock_reservations.count({ where: { userId } }),
      tx.user_zones.count({ where: { userId } }),
      tx.external_jobs.count({ where: { userId } }),
      tx.line_placement_policies.count({ where: { userId } }),
      tx.dedicated_line_placements.count({ where: { userId } }),
      tx.dedicated_line_placement_nodes.count({ where: { userId } }),
      tx.dedicated_line_projections.count({ where: { userId } }),
      tx.dedicated_line_exit_assignments.count({ where: { userId } }),
      tx.delivery_routes.count({ where: { userId } }),
      tx.dedicated_line_domain_binding_operations.count({ where: { userId } }),
      tx.dedicated_line_migrations.count({ where: { userId } }),
      tx.dedicated_line_smoke_observations.count({ where: { userId } }),
      tx.dedicated_line_migration_recommendations.count({ where: { userId } }),
      tx.exit_health_observations.count({ where: { userId } }),
      tx.outbox_events.count({ where: { userId } }),
    ]);
    return counts.reduce((total, count) => total + count, 0);
  }
}

function readStatus(value: unknown): UserStatus {
  if (value === 'ACTIVE' || value === 'SUSPENDED' || value === 'BANNED') return value;
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'user_status_invalid', 400);
}

function readPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'password_too_weak', 400);
  }
  return value;
}

function isZero(value: Decimal): boolean {
  return new Decimal(value.toString()).isZero();
}
