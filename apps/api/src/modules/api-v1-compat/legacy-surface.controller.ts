import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { LedgerEntryType, PaymentChannel, PaymentOrderStatus } from '@ipeasy/db';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { RequireAuth, RequireUser } from '../../common/auth/guards';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageResult } from '../../common/pagination/pagination.dto';
import { ListApiKeysUseCase } from '../api-keys/use-cases/list-api-keys.use-case';
import { CreatePaymentOrderUseCase } from '../payments/use-cases/create-payment-order.use-case';
import { ConfirmPaymentOrderUseCase } from '../payments/use-cases/confirm-payment-order.use-case';
import { PaymentsRepository } from '../payments/payments.repository';
import { WalletRepository, LedgerEntry } from '../wallet/wallet.repository';
import { DedicatedLineDeliveryUseCase } from '../dedicated-lines/dedicated-line-delivery.use-case';
import { assertLegacyApiAccess } from './legacy-site-access';

type LegacyQuery = Record<string, unknown>;

type LegacyPage<T> = {
  data: T[];
  list: T[];
  items: T[];
  page: number;
  pageSize: number;
  limit: number;
  total: number;
};

type LegacyPaymentBody = {
  amount?: unknown;
  currency?: unknown;
  gateway?: unknown;
  mode?: unknown;
  type?: unknown;
  method?: unknown;
  remark?: unknown;
  idempotencyKey?: unknown;
};

type LegacyApprovalBody = {
  approved?: unknown;
  remark?: unknown;
  reason?: unknown;
};

type PaymentOrderLike = {
  id: string;
  userId: string;
  amount: { toString(): string } | string | number;
  currency: string;
  channel: string;
  status: string;
  idempotencyKey?: string;
  confirmedBy?: string | null;
  confirmedAt?: Date | null;
  failReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; email: string; name: string | null; phone: string | null; status: string } | null;
};

/**
 * Adapts the remaining frozen billing/account calls to canonical modules.
 * Historical resources without a canonical owner deliberately fail closed
 * with a typed capability error instead of returning fabricated data.
 */
@Controller('v1')
export class LegacySurfaceController {
  constructor(
    private readonly config: ConfigService,
    private readonly createPayment: CreatePaymentOrderUseCase,
    private readonly confirmPayment: ConfirmPaymentOrderUseCase,
    private readonly payments: PaymentsRepository,
    private readonly listApiKeys: ListApiKeysUseCase,
    private readonly wallet: WalletRepository,
    private readonly delivery: DedicatedLineDeliveryUseCase,
  ) {}

  @Get('settings')
  settings() {
    this.assertEnabled();
    // No ConfigService-owned, audited Crisp settings exist yet; do not expose
    // site/system settings with an unverified legacy schema.
    throw unsupportedCapability();
  }

  @Get('dashboard/overview')
  @RequireAuth()
  async dashboardOverview(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertUser(ctx);
    const dc = await this.delivery.count(ctx);
    return { proxies: { dc, residential: 0, mobile: 0, total: dc } };
  }

  @Get('dashboard/admin-pending-tasks')
  @RequireAuth()
  dashboardAdminPendingTasks(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw unsupportedCapability();
  }

  @Get('users/me/api-key')
  @RequireUser()
  async getApiKey(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertUser(ctx);
    const result = await this.listApiKeys.execute(ctx, { page: 1, pageSize: 20 });
    const active = result.items.find((item) => item.status === 'ACTIVE');
    return {
      hasKey: active !== undefined,
      prefix: active?.keyPrefix ?? null,
      // The legacy UI labels this value "updatedAt".  A key has no mutable
      // public timestamp, so its persisted creation time is the authoritative
      // value shown there.
      updatedAt: active?.createdAt ?? null,
    };
  }

  @Post('users/me/api-key/regenerate')
  @RequireUser()
  regenerateApiKey(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw unsupportedCapability();
  }

  @Delete('users/me/api-key')
  @RequireUser()
  revokeApiKey(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw unsupportedCapability();
  }

  @Get('users/me/api-apps')
  @RequireUser()
  listApiApps(@CurrentContext() ctx: AuthenticatedContext) {
    return this.unsupportedForUser(ctx);
  }

  @Post('users/me/api-apps')
  @RequireUser()
  createApiApp(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: Record<string, unknown>) {
    return this.unsupportedForUser(ctx);
  }

  @Post('users/me/api-apps/:id/regenerate')
  @RequireUser()
  regenerateApiApp(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string) {
    return this.unsupportedForUser(ctx);
  }

  @Delete('users/me/api-apps/:id')
  @RequireUser()
  revokeApiApp(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string) {
    return this.unsupportedForUser(ctx);
  }

  @Get('referral/my')
  @RequireUser()
  referralMine(@CurrentContext() ctx: AuthenticatedContext) {
    return this.unsupportedForUser(ctx);
  }

  @Get('referral/history')
  @RequireUser()
  referralHistory(@CurrentContext() ctx: AuthenticatedContext) {
    return this.unsupportedForUser(ctx);
  }

  @Get('referral/withdrawals')
  @RequireUser()
  referralWithdrawals(@CurrentContext() ctx: AuthenticatedContext) {
    return this.unsupportedForUser(ctx);
  }

  @Post('referral/withdraw')
  @RequireUser()
  withdrawReferral(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: Record<string, unknown>) {
    return this.unsupportedForUser(ctx);
  }

  @Post('payment/initiate')
  @RequireUser()
  async initiatePayment(
    @CurrentContext() ctx: AuthenticatedContext,
    @Body() body: LegacyPaymentBody,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    this.assertUser(ctx);
    const gateway = readOptionalString(body?.gateway)?.toLowerCase();
    const mode = readOptionalString(body?.mode)?.toLowerCase();
    if (gateway !== 'manual' && mode !== 'manual') {
      this.assertEnabled(ctx);
      throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'legacy_online_payment_unavailable', 501);
    }
    return this.createLegacyPayment(ctx, body, idempotencyHeader);
  }

  @Get('payment/status/:id')
  @RequireUser()
  async paymentStatus(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertUser(ctx);
    this.assertPaymentId(id);
    const order = await this.payments.getPaymentOrderById(id, ctx.siteId, ctx.tenantId);
    if (order.userId !== ctx.ownerId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'cannot_read_other_order', 403);
    }
    return toLegacyPayment(order, 'gateway');
  }

  @Post('billing/recharge')
  @RequireUser()
  async createRecharge(
    @CurrentContext() ctx: AuthenticatedContext,
    @Body() body: LegacyPaymentBody,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    this.assertUser(ctx);
    return this.createLegacyPayment(ctx, body, idempotencyHeader);
  }

  @Get('billing/recharges')
  @RequireUser()
  async listRecharges(@CurrentContext() ctx: AuthenticatedContext, @Query() query: LegacyQuery) {
    this.assertUser(ctx);
    const page = readPage(query);
    const result = await this.payments.listPaymentOrders(ctx.siteId, ctx.tenantId, {
      page: page.page,
      pageSize: page.pageSize,
      userId: ctx.ownerId,
      status: readPaymentStatus(query.status),
      channel: readPaymentChannel(query.method ?? query.paymentMethod ?? query.channel),
    });
    return makePage(result, (item) => toLegacyPayment(item, 'approval'));
  }

  @Get('billing/admin/recharges')
  @RequireAuth()
  async listAdminRecharges(@CurrentContext() ctx: AuthenticatedContext, @Query() query: LegacyQuery) {
    this.assertEnabled(ctx);
    const tenantId = this.requireAdmin(ctx);
    const page = readPage(query);
    const result = await this.payments.listPaymentOrders(ctx.siteId, tenantId, {
      page: page.page,
      pageSize: page.pageSize,
      userId: ctx.ownerType === 'PLATFORM_ADMIN' ? readOptionalString(query.userId) : undefined,
      email: readOptionalString(query.email),
      status: readPaymentStatus(query.status),
      channel: readPaymentChannel(query.method ?? query.paymentMethod ?? query.channel),
    });
    return makePage(result, (item) => toLegacyPayment(item, 'approval'));
  }

  @Get('billing/transactions')
  @RequireUser()
  async listTransactions(@CurrentContext() ctx: AuthenticatedContext, @Query() query: LegacyQuery) {
    this.assertUser(ctx);
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    }
    const wallet = await this.wallet.getWalletByUserId(ctx.ownerId, ctx.siteId, tenantId);
    const page = readPage(query);
    const result = await this.wallet.listLedgerEntries(wallet.id, tenantId, {
      page: page.page,
      pageSize: page.pageSize,
      type: readLedgerType(query.type),
      from: readOptionalString(query.from ?? query.startDate),
      to: readOptionalString(query.to ?? query.endDate),
    });
    return makePage(result, toLegacyTransaction);
  }

  @Put('billing/recharge/:id/approve')
  @RequireAuth()
  async approveRecharge(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') id: string,
    @Body() body: LegacyApprovalBody,
  ) {
    this.assertEnabled(ctx);
    this.requireAdmin(ctx);
    this.assertPaymentId(id);
    if (body?.approved !== true) {
      // There is no canonical rejection use case.  In particular, do not
      // mark an order rejected by writing around the payment module.
      throw unsupportedCapability();
    }
    const reason = readOptionalString(body?.remark) ?? readOptionalString(body?.reason);
    const result = await this.confirmPayment.execute(ctx, id, { reason: reason ?? undefined });
    return {
      ...toLegacyPayment(result.order as unknown as PaymentOrderLike, 'approval'),
      wallet: result.wallet,
    };
  }

  private async createLegacyPayment(
    ctx: AuthenticatedContext,
    body: LegacyPaymentBody,
    idempotencyHeader?: string,
  ) {
    this.assertEnabled(ctx);
    const amount = readAmount(body?.amount);
    const currency = this.platformCurrency();
    const idempotencyKey = readOptionalString(body?.idempotencyKey)
      ?? readOptionalString(idempotencyHeader)
      ?? randomUUID();
    const order = await this.createPayment.execute(ctx, {
      amount,
      currency,
      channel: 'MANUAL',
      idempotencyKey,
    });
    return toLegacyPayment(order as unknown as PaymentOrderLike, 'approval');
  }

  private unsupportedForUser(ctx: AuthenticatedContext): never {
    this.assertUser(ctx);
    throw unsupportedCapability();
  }

  private assertUser(ctx: AuthenticatedContext): void {
    this.assertEnabled(ctx);
    if (ctx.ownerType !== 'USER') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'user_only', 403);
    }
    if (!ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    }
  }

  private requireAdmin(ctx: AuthenticatedContext): string | null {
    if (ctx.ownerType === 'PLATFORM_ADMIN') return null;
    if (ctx.ownerType === 'TENANT_ADMIN' && ctx.tenantId) return ctx.tenantId;
    if (ctx.ownerType === 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
  }

  private assertEnabled(context?: Pick<AuthenticatedContext, 'siteId'>): string {
    return assertLegacyApiAccess(this.config, context);
  }

  private platformCurrency(): string {
    const value = this.config.get('APP_PLATFORM_CURRENCY');
    if (typeof value !== 'string' || !value.trim()) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'platform_currency_not_configured', 500);
    }
    return value.trim();
  }

  private assertPaymentId(id: string): void {
    if (!readOptionalString(id)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'payment_id_invalid', 400);
    }
  }
}

function unsupportedCapability(): AppError {
  return new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'legacy_capability_unavailable', 501);
}

function readPage(query: LegacyQuery): { page: number; pageSize: number } {
  const page = positiveInteger(query.page, 1);
  const pageSize = Math.min(100, positiveInteger(query.limit ?? query.pageSize, 20));
  return { page, pageSize };
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readAmount(value: unknown): string {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : readOptionalString(value);
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) <= 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'amount_invalid', 400);
  }
  return raw;
}

function readPaymentStatus(value: unknown): PaymentOrderStatus | undefined {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) return undefined;
  const map: Record<string, PaymentOrderStatus> = {
    pending: 'PENDING',
    processing: 'CONFIRMING',
    confirming: 'CONFIRMING',
    approved: 'COMPLETED',
    paid: 'COMPLETED',
    completed: 'COMPLETED',
    rejected: 'FAILED',
    failed: 'FAILED',
    refunded: 'REFUNDED',
  };
  const result = map[normalized];
  if (!result) throw new AppError(ErrorCode.VALIDATION_ERROR, 'payment_status_invalid', 400);
  return result;
}

function readPaymentChannel(value: unknown): PaymentChannel | undefined {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'wechat' || normalized === 'usdt' || normalized === 'usd') {
    throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'legacy_payment_method_unavailable', 501);
  }
  const map: Record<string, PaymentChannel> = {
    manual: 'MANUAL',
    yipay: 'YIPAY',
    alipay: 'ALIPAY',
  };
  const result = map[normalized];
  if (!result) throw new AppError(ErrorCode.VALIDATION_ERROR, 'payment_method_invalid', 400);
  return result;
}

function readLedgerType(value: unknown): LedgerEntryType | undefined {
  const normalized = readOptionalString(value)?.toLowerCase();
  if (!normalized) return undefined;
  const map: Record<string, LedgerEntryType> = {
    recharge: 'DEPOSIT',
    deposit: 'DEPOSIT',
    purchase: 'DEBIT',
    debit: 'DEBIT',
    renewal: 'RENEWAL',
    refund: 'REFUND',
    adjustment: 'ADJUSTMENT',
    commission: 'COMMISSION',
  };
  const result = map[normalized];
  if (!result) throw new AppError(ErrorCode.VALIDATION_ERROR, 'transaction_type_invalid', 400);
  return result;
}

function makePage<T, U>(result: PageResult<T>, mapper: (item: T) => U): LegacyPage<U> {
  const data = result.items.map(mapper);
  return {
    data,
    list: data,
    items: data,
    page: result.page,
    pageSize: result.pageSize,
    limit: result.pageSize,
    total: result.total,
  };
}

function toLegacyPayment(order: PaymentOrderLike, mode: 'approval' | 'gateway') {
  const status = mode === 'gateway' ? toGatewayStatus(order.status) : toApprovalStatus(order.status);
  const channel = String(order.channel).toLowerCase();
  const amount = Number(order.amount.toString());
  return {
    id: order.id,
    orderNo: order.id,
    amount,
    currency: order.currency,
    method: channel,
    paymentMethod: channel,
    channel,
    status,
    paymentStatus: status,
    userId: order.userId,
    ...(order.user ? { user: order.user } : {}),
    remark: null,
    idempotencyKey: order.idempotencyKey,
    confirmedBy: order.confirmedBy ?? null,
    confirmedAt: order.confirmedAt ?? null,
    failReason: order.failReason ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function toApprovalStatus(value: string): string {
  return ({ PENDING: 'pending', CONFIRMING: 'pending', COMPLETED: 'approved', FAILED: 'rejected', REFUNDED: 'refunded' } as Record<string, string>)[value] ?? value.toLowerCase();
}

function toGatewayStatus(value: string): string {
  return ({ PENDING: 'pending', CONFIRMING: 'processing', COMPLETED: 'paid', FAILED: 'failed', REFUNDED: 'refunded' } as Record<string, string>)[value] ?? value.toLowerCase();
}

function toLegacyTransaction(entry: LedgerEntry) {
  const amount = Number(entry.amount.toString());
  const balanceAfter = Number(entry.balanceAfter.toString());
  const type = ({ DEPOSIT: 'recharge', DEBIT: 'purchase', RENEWAL: 'renewal', REFUND: 'refund' } as Record<string, string>)[entry.type] ?? entry.type.toLowerCase();
  return {
    id: entry.id,
    transactionNo: entry.relatedId ?? entry.id,
    type,
    amount: Math.abs(amount),
    balanceBefore: balanceAfter - amount,
    balanceAfter,
    currency: entry.currency,
    remark: entry.reason ?? '',
    relatedId: entry.relatedId,
    createdAt: entry.createdAt,
  };
}
