import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '@ipeasy/db';
import { FastifyRequest } from 'fastify';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth, RequireUser } from '../../common/auth/guards';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ConfigService } from '../../common/config/config.service';
import { AuthRepository } from '../auth/auth.repository';
import { LoginUseCase } from '../auth/use-cases/login.use-case';
import { LogoutUseCase } from '../auth/use-cases/logout.use-case';
import { CatalogRepository } from '../catalog/catalog.repository';
import { SkuQuoteUseCase } from '../catalog/domain';
import { DedicatedLineInventoryRepository } from '../dedicated-line-orders/dedicated-line-inventory.repository';
import { CreateDedicatedLineOrderUseCase } from '../dedicated-line-orders/create-dedicated-line-order.use-case';
import { DedicatedLineDeliveryUseCase } from '../dedicated-lines/dedicated-line-delivery.use-case';
import { RenewDedicatedLineUseCase } from '../dedicated-lines/renew-dedicated-line.use-case';
import { GetMeUseCase } from '../users/use-cases/get-me.use-case';
import { WalletRepository } from '../wallet/wallet.repository';
import { ResolveActiveZoneUseCase } from '../zones/use-cases';
import { authBody } from '../auth/auth-input';
import {
  toCapabilitiesResponse,
  toLegacyLineDto,
  toLegacySkuDto,
  type CompatLine,
} from './api-v1-compat.mapper';
import { assertLegacyApiAccess } from './legacy-site-access';

type LegacyLoginBody = { email?: unknown; password?: unknown };
type LegacyDedicatedBody = {
  skuCode?: unknown;
  durationDays?: unknown;
  country?: unknown;
  protocol?: unknown;
  idempotencyKey?: unknown;
  zoneCode?: unknown;
};

@Controller('v1')
export class ApiV1CompatController {
  constructor(
    private readonly config: ConfigService,
    private readonly login: LoginUseCase,
    private readonly logout: LogoutUseCase,
    private readonly authRepo: AuthRepository,
    private readonly catalog: CatalogRepository,
    private readonly quote: SkuQuoteUseCase,
    private readonly inventory: DedicatedLineInventoryRepository,
    private readonly createOrder: CreateDedicatedLineOrderUseCase,
    private readonly delivery: DedicatedLineDeliveryUseCase,
    private readonly renew: RenewDedicatedLineUseCase,
    private readonly getMe: GetMeUseCase,
    private readonly wallet: WalletRepository,
    private readonly resolveZone: ResolveActiveZoneUseCase,
  ) {}

  @Get('health')
  health() {
    this.assertEnabled();
    return { status: 'ok' };
  }

  @Get('settings/capabilities')
  capabilities() {
    this.assertEnabled();
    return toCapabilitiesResponse(this.config.get('LEGACY_STATIC_PROXY_ENABLED') === 'true');
  }

  @Post('auth/login')
  async loginUser(@Body() body: LegacyLoginBody) {
    return this.loginLegacy(body);
  }

  @Post('auth/admin-login')
  async loginAdmin(@Body() body: LegacyLoginBody) {
    return this.loginLegacy(body, 'ADMIN_USER');
  }

  @Post('auth/refresh')
  async refresh(@Body() body: { refresh_token?: unknown }) {
    const siteId = this.assertEnabled();
    const refreshToken = readString(body?.refresh_token, 'refresh_token');
    if (!refreshToken.startsWith('rt_')) {
      throw new AppError(ErrorCode.AUTH_REQUIRED, 'refresh_token_invalid', 401);
    }
    const session = await this.authRepo.findSessionByTokenHash(hashToken(refreshToken));
    if (session.revokedAt !== null || session.expiresAt < new Date() || session.siteId !== siteId) {
      throw new AppError(ErrorCode.AUTH_REQUIRED, 'refresh_token_expired', 401);
    }
    const owner = {
      ownerType: session.ownerType,
      ownerId: session.ownerId,
      siteId: session.siteId,
      tenantId: session.tenantId,
    } as const;
    const access = await this.authRepo.issueSession(owner);
    const nextRefresh = await this.authRepo.issueRefreshSession(owner);
    await this.authRepo.revokeSession(session.id);
    const user = await this.legacyUserForOwner(owner);
    return { access_token: access.token, refresh_token: nextRefresh.token, user };
  }

  @Get('auth/me')
  @RequireAuth()
  me(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    return {
      ownerId: ctx.ownerId,
      ownerType: ctx.ownerType,
      siteId: ctx.siteId,
      tenantId: ctx.tenantId,
      scopes: ctx.scopes,
    };
  }

  @Post('auth/logout')
  @RequireAuth()
  async logoutUser(@CurrentContext() ctx: AuthenticatedContext, @Req() req: FastifyRequest) {
    this.assertEnabled(ctx);
    await this.logout.execute(ctx, req.sessionId ?? '');
    return { ok: true };
  }

  @Get('users/profile')
  @RequireAuth()
  async profile(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    if (ctx.ownerType !== 'USER') {
      return this.legacyAdminProfile(ctx);
    }
    const [profile, wallet] = await Promise.all([
      this.getMe.execute(ctx),
      this.wallet.getWalletByUserId(ctx.ownerId, ctx.siteId, ctx.tenantId),
    ]);
    return {
      ...profile,
      role: 'user',
      balance: wallet.available.toString(),
      currency: wallet.currency,
    };
  }

  @Get('dedicated-skus')
  @RequireUser()
  async dedicatedSkus(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    if (!ctx.tenantId) throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    const skus = await this.catalog.listSaleableSkusForBuyer(ctx.siteId, ctx.tenantId, ctx.ownerId);
    return skus.map(toLegacySkuDto);
  }

  @Get('dedicated/locations')
  @RequireUser()
  async dedicatedLocations(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    if (!ctx.tenantId) throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    const locations = await this.inventory.listFreshLocations({ siteId: ctx.siteId, tenantId: ctx.tenantId });
    return locations.map((location) => ({
      country: location.countryCode,
      available: location.availableQuantity,
      stock: location.availableQuantity,
    }));
  }

  @Post('dedicated/preview')
  @RequireUser()
  async dedicatedPreview(@CurrentContext() ctx: AuthenticatedContext, @Body() body: LegacyDedicatedBody) {
    this.assertEnabled(ctx);
    const input = await this.parseDedicatedInput(ctx, body, false);
    await this.resolveZone.execute({
      siteId: ctx.siteId,
      tenantId: ctx.tenantId!,
      userId: ctx.ownerId,
    }, readOptionalZoneCode(body?.zoneCode));
    const result = await this.quote.execute({
      siteId: ctx.siteId,
      tenantId: ctx.tenantId!,
      userId: ctx.ownerId,
      skuCode: input.skuCode,
      durationDays: input.durationDays,
      quantity: 1,
      currency: input.currency,
    });
    const sku = await this.catalog.findSku(ctx.siteId, input.skuCode);
    return {
      sku: sku ? toLegacySkuDto(sku) : { code: result.skuCode, name: result.skuCode, protocols: [] },
      country: body.country,
      protocol: body.protocol,
      durationDays: result.durationDays,
      unitPrice: result.unitPrice,
      chargeAmount: result.totalPrice,
      finalPrice: result.totalPrice,
      currency: result.currency,
    };
  }

  @Post('dedicated/purchase-v2')
  @RequireUser()
  async dedicatedPurchase(
    @CurrentContext() ctx: AuthenticatedContext,
    @Body() body: LegacyDedicatedBody,
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    this.assertEnabled(ctx);
    const input = await this.parseDedicatedInput(ctx, body, true);
    const result = await this.createOrder.execute(ctx, {
      skuCode: input.skuCode,
      countryCode: input.countryCode,
      quantity: 1,
      durationDays: input.durationDays,
      currency: input.currency,
      idempotencyKey: readOptionalString(body.idempotencyKey) ?? idempotencyHeader?.trim() ?? randomUUID(),
      zoneCode: readOptionalZoneCode(body.zoneCode),
    });
    return {
      ...result,
      status: 'reserved',
      localStatus: 'reserved',
      pending: true,
      proxyId: result.orderId,
      country: result.countryCode,
      protocol: readOptionalString(body.protocol) ?? 'vmess',
      durationDays: input.durationDays,
      orderNo: result.orderId,
    };
  }

  @Get('dedicated/my')
  @RequireUser()
  async dedicatedMine(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    const lines = await this.delivery.list(ctx);
    return lines.map((line) => toLegacyLineDto(line as unknown as CompatLine));
  }

  @Post('dedicated/:id/renew')
  @RequireUser()
  async dedicatedRenew(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') legacyId: string,
    @Body() body: { durationDays?: unknown; idempotencyKey?: unknown; zoneCode?: unknown },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    this.assertEnabled(ctx);
    const lineId = await this.resolveLineId(ctx, legacyId);
    const durationDays = readPositiveInteger(body?.durationDays, 'durationDays');
    const result = await this.renew.execute(ctx, lineId, {
      durationDays,
      idempotencyKey: readOptionalString(body?.idempotencyKey) ?? idempotencyHeader?.trim() ?? randomUUID(),
      zoneCode: readOptionalZoneCode(body?.zoneCode),
    });
    return { ...result, id: Number(legacyId), proxyId: Number(legacyId) };
  }

  @Post('dedicated/:id/lock')
  @RequireUser()
  lock(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertEnabled(ctx);
    throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, 'dedicated_line_upstream_lock_unavailable', 409);
  }

  @Get('dedicated/:id/qrcode')
  @RequireUser()
  async dedicatedQr(@CurrentContext() ctx: AuthenticatedContext, @Param('id') legacyId: string) {
    this.assertEnabled(ctx);
    const lineId = await this.resolveLineId(ctx, legacyId);
    const line = await this.delivery.get(ctx, lineId);
    const mapped = toLegacyLineDto(line as unknown as CompatLine);
    if (!mapped.connectionUri) throw new AppError(ErrorCode.DEDICATED_LINE_CONFIG_INVALID, 'dedicated_line_connection_not_ready', 422);
    return { qrcodeData: mapped.connectionUri, connectionUri: mapped.connectionUri };
  }

  @Patch('dedicated/:id/remark')
  @RequireUser()
  async dedicatedRemark(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') legacyId: string,
    @Body() body: { remark?: unknown },
  ) {
    this.assertEnabled(ctx);
    const lineId = await this.resolveLineId(ctx, legacyId);
    const remark = readNullableRemark(body?.remark);
    const updated = await prisma.dedicated_lines.updateMany({
      where: { id: lineId, siteId: ctx.siteId, tenantId: ctx.tenantId ?? '', userId: ctx.ownerId },
      data: { legacyRemark: remark },
    });
    if (updated.count !== 1) throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
    return { id: Number(legacyId), remark };
  }

  private async loginLegacy(body: LegacyLoginBody, expectedOwnerType?: 'USER' | 'ADMIN_USER') {
    const siteId = this.assertEnabled();
    const input = authBody(body, 'login_body_invalid');
    const email = readString(input.email, 'email');
    const password = readString(input.password, 'password');
    const credentials = { email, password, siteId };
    const result = expectedOwnerType
      ? await this.login.executeLegacy(credentials, expectedOwnerType)
      : await this.login.executeLegacy(credentials);
    return {
      access_token: result.token,
      refresh_token: result.refreshToken,
      user: await this.legacyUserForIdentity(result.identity),
    };
  }

  private async legacyUserForIdentity(identity: { ownerType: 'USER' | 'ADMIN_USER'; ownerId: string; siteId: string; tenantId: string | null; email: string; name: string | null; role: string }) {
    if (identity.ownerType !== 'USER') {
      // The frozen client recognizes the legacy sentinel `admin`; keep the
      // canonical database role as the session owner's authorization source.
      return { id: identity.ownerId, email: identity.email, role: 'admin' };
    }
    const wallet = await this.wallet.getWalletByUserId(identity.ownerId, identity.siteId, identity.tenantId);
    return {
      id: identity.ownerId,
      email: identity.email,
      name: identity.name,
      role: 'user',
      balance: wallet.available.toString(),
      currency: wallet.currency,
    };
  }

  private async legacyUserForOwner(owner: { ownerType: 'USER' | 'ADMIN_USER'; ownerId: string; siteId: string; tenantId: string | null }) {
    if (owner.ownerType === 'USER') {
      const profile = await prisma.users.findFirst({ where: { id: owner.ownerId, siteId: owner.siteId }, select: { email: true, name: true } });
      if (!profile) throw new AppError(ErrorCode.AUTH_REQUIRED, 'session_expired', 401);
      const wallet = await this.wallet.getWalletByUserId(owner.ownerId, owner.siteId, owner.tenantId);
      return { id: owner.ownerId, email: profile.email, name: profile.name, role: 'user', balance: wallet.available.toString(), currency: wallet.currency };
    }
    const admin = await prisma.admin_users.findFirst({ where: { id: owner.ownerId, siteId: owner.siteId }, select: { email: true } });
    if (!admin) throw new AppError(ErrorCode.AUTH_REQUIRED, 'session_expired', 401);
    return { id: owner.ownerId, email: admin.email, role: 'admin' };
  }

  private async legacyAdminProfile(ctx: AuthenticatedContext) {
    if (!['PLATFORM_ADMIN', 'TENANT_ADMIN', 'OPERATOR'].includes(ctx.ownerType)) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN' && !ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    const admin = await prisma.admin_users.findFirst({
      where: {
        id: ctx.ownerId,
        siteId: ctx.siteId,
        ...(ctx.ownerType === 'TENANT_ADMIN' ? { tenantId: ctx.tenantId! } : {}),
      },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!admin) throw new AppError(ErrorCode.AUTH_REQUIRED, 'session_expired', 401);
    return {
      id: admin.id,
      email: admin.email,
      name: admin.email,
      phone: null,
      status: admin.status,
      kycStatus: 'NOT_APPLICABLE',
      riskStatus: 'NOT_APPLICABLE',
      role: 'admin',
      balance: '0',
      currency: this.config.get('APP_PLATFORM_CURRENCY'),
    };
  }

  private async parseDedicatedInput(ctx: AuthenticatedContext, body: LegacyDedicatedBody, requireCountry: boolean) {
    if (!ctx.tenantId) throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_required', 403);
    const skuCode = readString(body?.skuCode, 'skuCode').toUpperCase();
    const durationDays = readPositiveInteger(body?.durationDays, 'durationDays');
    const countryCode = readString(body?.country, 'country').toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode) && requireCountry) throw new AppError(ErrorCode.VALIDATION_ERROR, 'country_invalid', 400);
    const protocol = readOptionalString(body?.protocol)?.toLowerCase();
    if (protocol && !['vmess', 'vless', 'shadowsocks', 'socks5', 'http'].includes(protocol)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'protocol_invalid', 400);
    }
    const wallet = await this.wallet.getWalletByUserId(ctx.ownerId, ctx.siteId, ctx.tenantId);
    return { skuCode, durationDays, countryCode, protocol: protocol ?? 'vmess', currency: wallet.currency };
  }

  private async resolveLineId(ctx: AuthenticatedContext, legacyId: string): Promise<string> {
    if (!/^[1-9]\d*$/.test(legacyId)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_id_invalid', 400);
    }
    const numericId = Number(legacyId);
    if (!Number.isSafeInteger(numericId) || numericId < 1) throw new AppError(ErrorCode.VALIDATION_ERROR, 'dedicated_line_id_invalid', 400);
    const line = await prisma.dedicated_lines.findFirst({
      where: { legacyId: numericId, siteId: ctx.siteId, tenantId: ctx.tenantId ?? '', userId: ctx.ownerId },
      select: { id: true },
    });
    if (!line) throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
    return line.id;
  }

  private assertEnabled(context?: Pick<AuthenticatedContext, 'siteId'>): string {
    return assertLegacyApiAccess(this.config, context);
  }
}

function readString(value: unknown, field: string): string {
  const result = readOptionalString(value);
  if (!result) throw new AppError(ErrorCode.VALIDATION_ERROR, `${field}_required`, 400);
  return result;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readOptionalZoneCode(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400);
  }
  return value;
}

function readPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3650) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field}_invalid`, 400);
  }
  return value as number;
}

function readNullableRemark(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) throw new AppError(ErrorCode.VALIDATION_ERROR, 'remark_invalid', 400);
  return value.trim() || null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
