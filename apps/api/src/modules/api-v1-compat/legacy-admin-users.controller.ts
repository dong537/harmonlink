import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ConfigService } from '../../common/config/config.service';
import { CreateUserUseCase } from '../users/use-cases/create-user.use-case';
import { LegacyAdminUserProjection, UsersRepository } from '../users/users.repository';
import { assertLegacyApiAccess } from './legacy-site-access';

type LegacyAdminUsersQuery = {
  page?: unknown;
  limit?: unknown;
  pageSize?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  tenantId?: unknown;
};

type LegacyCreateUserBody = {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  initialBalance?: unknown;
  tenantId?: unknown;
  name?: unknown;
  nickname?: unknown;
};

@Controller('v1')
export class LegacyAdminUsersController {
  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
    private readonly createUserUseCase: CreateUserUseCase,
  ) {}

  @Get('admin/users')
  @RequireAuth()
  async listUsers(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: LegacyAdminUsersQuery = {},
  ) {
    this.assertAdminAccess(ctx);
    const role = readOptionalString(query?.role);
    if (role && role !== 'user') {
      throw unsupported('legacy_admin_user_role_filter_unavailable');
    }
    const status = mapStatusFilter(query?.status);
    const page = readPositiveInteger(query?.page, 1, 'page');
    const pageSize = readPageSize(query?.limit ?? query?.pageSize);
    const email = readOptionalString(query?.email);
    const tenantId = resolveTenantFilter(ctx, query?.tenantId);
    const result = await this.users.listLegacyAdminUsers(ctx.siteId, tenantId, {
      page,
      pageSize,
      email: email ?? undefined,
      status,
    });
    const items = result.items.map(toLegacyAdminUser);
    return {
      data: items,
      list: items,
      items,
      page: result.page,
      pageSize: result.pageSize,
      limit: result.pageSize,
      total: result.total,
    };
  }

  @Post('admin/users')
  @RequireAuth()
  async createUser(
    @CurrentContext() ctx: AuthenticatedContext,
    @Body() body: LegacyCreateUserBody,
  ) {
    this.assertAdminAccess(ctx);
    const role = readOptionalString(body?.role) ?? 'user';
    if (role !== 'user') throw unsupported('legacy_admin_user_creation_role_unavailable');

    const initialBalance = readOptionalNumber(body?.initialBalance);
    if (initialBalance !== undefined && initialBalance !== 0) {
      throw unsupported('legacy_admin_user_initial_balance_unavailable');
    }
    if (body?.name !== undefined || body?.nickname !== undefined) {
      throw unsupported('legacy_admin_user_name_write_unavailable');
    }

    const requestedTenantId = readOptionalString(body?.tenantId);
    if (ctx.ownerType === 'TENANT_ADMIN' && requestedTenantId && requestedTenantId !== ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_access_denied', 403);
    }
    const created = await this.createUserUseCase.execute(ctx, {
      email: readRequiredString(body?.email, 'email'),
      password: readRequiredString(body?.password, 'password'),
      ...(ctx.ownerType === 'PLATFORM_ADMIN' && requestedTenantId
        ? { tenantId: requestedTenantId }
        : {}),
    });
    const projection = await this.users.findLegacyAdminUserById(created.id, {
      siteId: ctx.siteId,
      tenantId: created.tenantId,
    });
    return toLegacyAdminUser(projection);
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

function toLegacyAdminUser(user: LegacyAdminUserProjection) {
  const nickname = user.name?.trim() || user.email;
  return {
    id: user.legacyId,
    email: user.email,
    nickname,
    role: 'user',
    balance: user.balance,
    status: user.status === 'ACTIVE' ? 'active' : 'disabled',
    createdAt: user.createdAt,
  };
}

function mapStatusFilter(value: unknown): 'ACTIVE' | 'DISABLED' | undefined {
  const status = readOptionalString(value);
  if (!status) return undefined;
  if (status === 'active') return 'ACTIVE';
  if (status === 'disabled') return 'DISABLED';
  if (status === 'deleted') throw unsupported('legacy_admin_deleted_users_unavailable');
  throw new AppError(ErrorCode.VALIDATION_ERROR, 'legacy_admin_user_status_invalid', 400);
}

function resolveTenantFilter(ctx: AuthenticatedContext, value: unknown): string | null {
  const requested = readOptionalString(value);
  if (ctx.ownerType === 'TENANT_ADMIN') {
    if (requested && requested !== ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_access_denied', 403);
    }
    return ctx.tenantId;
  }
  return requested;
}

function readPageSize(value: unknown): number {
  if (value === undefined || value === null || value === '') return 20;
  return readPositiveInteger(value, 20, 'limit', 100);
}

function readPositiveInteger(value: unknown, fallback: number, field: string, max?: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, `${field}_invalid`, 400);
  }
  return parsed;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRequiredString(value: unknown, field: string): string {
  const result = readOptionalString(value);
  if (!result) throw new AppError(ErrorCode.VALIDATION_ERROR, `${field}_required`, 400);
  return result;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'initial_balance_invalid', 400);
  }
  return value;
}

function unsupported(reasonKey: string): AppError {
  return new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, reasonKey, 501);
}
