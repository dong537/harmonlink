import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ListDedicatedLineLimitsUseCase } from '../dedicated-lines/list-dedicated-line-limits.use-case';
import { assertLegacyApiAccess } from './legacy-site-access';

type LegacyAdminDedicatedQuery = Record<string, unknown>;
type CanonicalLinePage = Awaited<ReturnType<ListDedicatedLineLimitsUseCase['execute']>>;
type CanonicalLine = CanonicalLinePage['items'][number];

const UNSUPPORTED_LIST_FILTERS = [
  'skuCode',
  'status',
  'country',
  'source',
  'protocol',
  'nodeId',
  'userId',
  'email',
  'search',
  'dateFrom',
  'dateTo',
] as const;

const DEFAULT_ADMIN_PAGE_SIZE = 20;
const MAX_ADMIN_PAGE_SIZE = 100;

/**
 * Projects the frozen administrator dedicated-line transport contract onto
 * canonical control-plane queries. Unsupported upstream operations fail
 * explicitly instead of reporting fabricated success or empty resources.
 */
@Controller('v1')
export class LegacyAdminDedicatedController {
  constructor(
    private readonly config: ConfigService,
    private readonly listLines: ListDedicatedLineLimitsUseCase,
  ) {}

  @Get('admin/dedicated-orders')
  @RequireAuth()
  async listDedicatedOrders(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: LegacyAdminDedicatedQuery,
  ) {
    this.assertAdminAccess(ctx);
    if (UNSUPPORTED_LIST_FILTERS.some((field) => hasValue(query[field]))) {
      throw new AppError(
        ErrorCode.UNSUPPORTED_CAPABILITY,
        'legacy_dedicated_order_filters_unavailable',
        501,
      );
    }

    const requestedPage = positiveInt(query.page, 1);
    const requestedPageSize = readAdminPageSize(query.limit ?? query.pageSize);
    const result = await this.listLines.execute(ctx, {
      page: requestedPage,
      pageSize: requestedPageSize,
    }, { maxPageSize: MAX_ADMIN_PAGE_SIZE });

    return {
      page: result.page,
      pageSize: result.pageSize,
      limit: result.pageSize,
      total: result.total,
      items: result.items.map(toLegacyDedicatedOrder),
    };
  }

  @Post('admin/dedicated-orders/:id/lock')
  @RequireAuth()
  lockDedicatedOrder(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: { locked?: unknown },
  ): never {
    this.assertAdminAccess(ctx);
    throw new AppError(
      ErrorCode.UNSUPPORTED_CAPABILITY,
      'legacy_dedicated_order_lock_unavailable',
      409,
    );
  }

  private assertAdminAccess(ctx: AuthenticatedContext): void {
    assertLegacyApiAccess(this.config, ctx);
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN' && !ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
  }
}

function toLegacyDedicatedOrder(line: CanonicalLine) {
  return {
    proxyId: line.id,
    tenantId: line.tenantId,
    userId: line.userId,
    userEmail: line.customer.email,
    userName: line.customer.name,
    skuCode: line.sku.code,
    skuName: line.sku.name,
    country: line.countryCode,
    protocol: line.protocol.toLowerCase(),
    status: line.status.toLowerCase(),
    desiredVersion: line.desiredVersion,
    inboundTag: line.inboundTag,
    limits: line.limits,
    projections: line.projections,
  };
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readAdminPageSize(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_ADMIN_PAGE_SIZE;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ADMIN_PAGE_SIZE) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'legacy_dedicated_order_page_size_invalid',
      400,
    );
  }
  return parsed;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}
