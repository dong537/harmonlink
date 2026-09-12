import { Injectable } from '@nestjs/common';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { PageResult } from '../../common/pagination/pagination.dto';
import {
  DedicatedLineOrderAdminItem,
  DedicatedLineOrderAdminListQuery,
  DedicatedLineOrderAdminRepository,
  DedicatedLineOrderAdminScope,
} from './dedicated-line-order-admin.repository';

/**
 * Resolves the management boundary once per request. A null tenant is scoped
 * to the current site, never to the whole database.
 */
export function requireDedicatedLineOrderAdminScope(
  ctx: AuthenticatedContext,
): DedicatedLineOrderAdminScope {
  if (ctx.ownerType === 'PLATFORM_ADMIN') {
    return { siteId: ctx.siteId, tenantId: null };
  }
  if (ctx.ownerType === 'TENANT_ADMIN') {
    if (!ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    return { siteId: ctx.siteId, tenantId: ctx.tenantId };
  }
  throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
}

@Injectable()
export class DedicatedLineOrderAdminUseCase {
  constructor(private readonly repository: DedicatedLineOrderAdminRepository) {}

  async list(
    ctx: AuthenticatedContext,
    query: DedicatedLineOrderAdminListQuery = {},
  ): Promise<PageResult<DedicatedLineOrderAdminItem>> {
    const scope = requireDedicatedLineOrderAdminScope(ctx);
    return this.repository.listForAdmin(scope, query);
  }

  async get(ctx: AuthenticatedContext, orderId: string): Promise<DedicatedLineOrderAdminItem> {
    const scope = requireDedicatedLineOrderAdminScope(ctx);
    return this.repository.getForAdmin(orderId, scope);
  }

  async retry(ctx: AuthenticatedContext, orderId: string): Promise<never> {
    return this.unsupported(ctx, orderId, 'retry');
  }

  async retryFulfillment(ctx: AuthenticatedContext, orderId: string): Promise<never> {
    return this.unsupported(ctx, orderId, 'retry-fulfillment');
  }

  async cancel(ctx: AuthenticatedContext, orderId: string): Promise<never> {
    return this.unsupported(ctx, orderId, 'cancel');
  }

  async refund(ctx: AuthenticatedContext, orderId: string): Promise<never> {
    return this.unsupported(ctx, orderId, 'refund');
  }

  async manualComplete(ctx: AuthenticatedContext, orderId: string): Promise<never> {
    return this.unsupported(ctx, orderId, 'manual-complete');
  }

  private async unsupported(
    ctx: AuthenticatedContext,
    orderId: string,
    operation: string,
  ): Promise<never> {
    const scope = requireDedicatedLineOrderAdminScope(ctx);
    // Existence and scope are checked before advertising capability. This
    // keeps an out-of-scope id indistinguishable from a missing order.
    await this.repository.getForAdmin(orderId, scope);
    throw new AppError(
      ErrorCode.UNSUPPORTED_CAPABILITY,
      'dedicated_line_order_admin_operation_unsupported',
      501,
      undefined,
      { operation },
    );
  }
}
