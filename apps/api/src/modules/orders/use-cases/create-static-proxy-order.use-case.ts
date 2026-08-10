import { Injectable } from '@nestjs/common';
import { prisma } from '@ipeasy/db';
import { randomUUID } from 'crypto';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { assertTenantAccess } from '../../../common/auth/tenant-guard';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { QuoteUseCase } from '../../pricing/use-cases/quote.use-case';
import { WalletRepository } from '../../wallet/wallet.repository';
import { Order, OrdersRepository } from '../orders.repository';
import { FulfillmentRepository } from '../../fulfillment/fulfillment.repository';
import { isUniqueConstraintError } from '../../../common/errors/prisma-errors';
import { UsersRepository } from '../../users/users.repository';
import { requiredAdminReason } from '../admin-reason';

export interface CreateStaticProxyOrderInput {
  resourceId: string;
  quantity: number;
  durationDays: number;
  currency: string;
  idempotencyKey: string;
  businessType?: string;
}

export interface AdminCreateStaticProxyOrderInput extends CreateStaticProxyOrderInput {
  reason?: string;
}

type StaticProxyOrderResult = {
  orderId: string;
  status: Order['status'];
};

type BuyerContext = {
  siteId: string;
  tenantId: string;
  userId: string;
};

type OrderAuditContext = {
  actorType: 'USER' | 'ADMIN_USER';
  actorId: string;
  action: 'order.create' | 'order.admin_create';
  reason?: string;
  meta?: Record<string, unknown>;
};

@Injectable()
export class CreateStaticProxyOrderUseCase {
  constructor(
    private readonly quoteUseCase: QuoteUseCase,
    private readonly walletRepo: WalletRepository,
    private readonly ordersRepo: OrdersRepository,
    private readonly fulfillmentRepo: FulfillmentRepository,
    private readonly usersRepo: UsersRepository,
  ) {}

  async execute(ctx: AuthenticatedContext, input: CreateStaticProxyOrderInput) {
    if (ctx.ownerType !== 'USER') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'USER_ONLY', 403);
    }
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    }
    return this.createForBuyer(
      ctx,
      input,
      { siteId: ctx.siteId, tenantId, userId: ctx.ownerId },
      {
        actorType: 'USER',
        actorId: ctx.ownerId,
        action: 'order.create',
      },
    );
  }

  async executeForAdmin(
    ctx: AuthenticatedContext,
    targetUserId: string,
    input: AdminCreateStaticProxyOrderInput,
  ) {
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'admin_only', 403);
    }

    const reason = requiredAdminReason(input);
    const targetUser = await this.usersRepo.findOrderContextByIdInSite(targetUserId, ctx.siteId);
    if (!targetUser) {
      throw new AppError(ErrorCode.NOT_FOUND, 'user_not_found', 404);
    }
    assertTenantAccess(ctx, targetUser.tenantId);

    return this.createForBuyer(
      ctx,
      input,
      { siteId: targetUser.siteId, tenantId: targetUser.tenantId, userId: targetUser.id },
      {
        actorType: 'ADMIN_USER',
        actorId: ctx.ownerId,
        action: 'order.admin_create',
        reason,
        meta: { targetUserId: targetUser.id },
      },
    );
  }

  private async createForBuyer(
    ctx: AuthenticatedContext,
    input: CreateStaticProxyOrderInput,
    buyer: BuyerContext,
    audit: OrderAuditContext,
  ): Promise<StaticProxyOrderResult> {
    if (!input.idempotencyKey) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'idempotency_key_required', 400);
    }
    assertTenantAccess(ctx, buyer.tenantId);

    const existing = await this.ordersRepo.findByIdempotencyKeyForUser(
      input.idempotencyKey,
      buyer.siteId,
      buyer.tenantId,
      buyer.userId,
    );
    if (existing) {
      if (['PENDING', 'FULFILLING', 'COMPLETED'].includes(existing.status)) {
        return { orderId: existing.id, status: existing.status };
      }
      throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'order_idempotency_conflict', 409);
    }

    // 1. Get quote
    const quote = await this.quoteUseCase.execute({
      siteId: buyer.siteId,
      tenantId: buyer.tenantId,
      userId: buyer.userId,
      resourceId: input.resourceId,
      durationDays: input.durationDays,
      quantity: input.quantity,
      currency: input.currency,
    });

    if (!quote.isSaleable) {
      throw new AppError(ErrorCode.UPSTREAM_OUT_OF_STOCK, quote.unsaleableReason ?? 'not_saleable', 422);
    }

    // 2. Get resource to extract providerCode
    const resource = await prisma.platform_resources.findFirst({ where: { id: input.resourceId, siteId: buyer.siteId } });
    if (!resource) throw new AppError(ErrorCode.NOT_FOUND, 'resource_not_found', 404);

    // 3. Atomic transaction: wallet lookup/debit + create order + create fulfillment_job
    let result: Order;
    try {
      result = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallets.findFirst({
          where: { userId: buyer.userId, siteId: buyer.siteId, tenantId: buyer.tenantId },
        });
        if (!wallet) throw new AppError(ErrorCode.NOT_FOUND, 'wallet_not_found', 404);

        await this.walletRepo.debitWalletTx(
          tx,
          wallet.id,
          quote.totalPrice,
          quote.currency,
          'DEBIT',
          input.idempotencyKey,
          'static_proxy_order',
          orderDebitLedgerKey(buyer, input.idempotencyKey),
        );

        const quoteSnapshot = {
          ...quote,
          businessType: input.businessType,
        } as unknown as import('@ipeasy/db').Prisma.InputJsonValue;

        const order = await this.ordersRepo.create(tx, {
          id: randomUUID(),
          siteId: buyer.siteId,
          tenantId: buyer.tenantId,
          user: { connect: { id: buyer.userId } },
          resource: { connect: { id: input.resourceId } },
          type: 'STATIC_PROXY_BUY',
          status: 'PENDING',
          quantity: input.quantity,
          durationDays: input.durationDays,
          unitPrice: quote.unitPrice,
          totalPrice: quote.totalPrice,
          currency: quote.currency,
          quoteSnapshot,
          idempotencyKey: input.idempotencyKey,
        });

        await this.fulfillmentRepo.createJob(tx, {
          id: randomUUID(),
          siteId: buyer.siteId,
          order: { connect: { id: order.id } },
          providerCode: resource.providerCode,
          upstreamAccountId: resource.upstreamAccountId,
          status: 'QUEUED',
          attempts: 0,
          maxAttempts: 3,
          scheduledAt: new Date(),
        });

        await tx.audit_logs.create({
          data: {
            siteId: buyer.siteId,
            tenantId: buyer.tenantId,
            actorType: audit.actorType,
            actorId: audit.actorId,
            targetType: 'orders',
            targetId: order.id,
            action: audit.action,
            reason: audit.reason,
            requestId: ctx.requestId,
            meta: {
              ...audit.meta,
              idempotencyKey: input.idempotencyKey,
              totalPrice: quote.totalPrice,
              currency: quote.currency,
            },
          },
        });

        return order;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error, 'idempotencyKey') || isUniqueConstraintError(error, 'siteId_tenantId_userId_idempotencyKey')) {
        const duplicate = await this.ordersRepo.findByIdempotencyKeyForUser(
          input.idempotencyKey,
          buyer.siteId,
          buyer.tenantId,
          buyer.userId,
        );
        if (duplicate && ['PENDING', 'FULFILLING', 'COMPLETED'].includes(duplicate.status)) {
          return { orderId: duplicate.id, status: duplicate.status };
        }
        throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'order_idempotency_conflict', 409);
      }
      throw error;
    }

    return { orderId: result.id, status: result.status };
  }
}

function orderDebitLedgerKey(buyer: BuyerContext, idempotencyKey: string): string {
  return `order-debit-${buyer.siteId}-${buyer.tenantId}-${buyer.userId}-${idempotencyKey}`;
}
