import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ConfigService } from '../../common/config/config.service';
import { assertLegacyApiAccess } from './legacy-site-access';

/**
 * Explicitly closes historical administrator routes which have no canonical
 * owner in the dedicated-line platform. The frozen client used to receive a
 * misleading 404 for these paths; a typed capability error lets it render a
 * real unavailable state and keeps unsupported residential/legacy mutations
 * away from the database.
 */
@Controller('v1')
@RequireAuth()
export class LegacyAdminUnsupportedController {
  constructor(private readonly config: ConfigService) {}

  @Get([
    'admin/statistics',
    'admin/pending-items',
    'admin/recent-orders',
    'admin/revenue-trend',
    'admin/provider-routing',
    'admin/settings',
    'admin/payment-config',
    'admin/referral/withdrawals',
  ])
  readHistoricalDashboard(@CurrentContext() ctx: AuthenticatedContext, @Query() _query: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_dashboard_contract_unavailable');
  }

  @Put(['admin/provider-routing', 'admin/payment-config', 'admin/settings/:id'])
  updateHistoricalSettings(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: unknown,
  ): never {
    return this.unsupported(ctx, 'legacy_admin_settings_contract_unavailable');
  }

  @Get('admin/dedicated-plans')
  readHistoricalPlans(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx, 'legacy_admin_dedicated_plan_contract_unavailable');
  }

  @Post('admin/dedicated-plans')
  mutateHistoricalPlans(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_dedicated_plan_contract_unavailable');
  }

  @Patch('admin/dedicated-plans/:id')
  updateHistoricalPlan(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_dedicated_plan_contract_unavailable');
  }

  @Delete('admin/dedicated-plans/:id')
  deleteHistoricalPlan(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx, 'legacy_admin_dedicated_plan_contract_unavailable');
  }

  @Get([
    'admin/dedicated-orders/:id',
    'admin/dedicated-orders/:id/deployments',
    'admin/dedicated-orders/:id/rebind-candidates',
  ])
  readHistoricalDedicatedOrder(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Query() _query: unknown,
  ): never {
    return this.unsupported(ctx, 'legacy_dedicated_order_detail_contract_unavailable');
  }

  @Post([
    'admin/dedicated-orders/:id/probe',
    'admin/dedicated-orders/:id/rebind',
    'admin/dedicated-orders/:id/rebind-manual',
    'admin/dedicated-orders/:id/refund',
    'admin/dedicated-orders/:id/switch-route',
    'admin/dedicated-orders/deployments/:id/retry',
    'admin/dedicated-orders/batch-probe',
    'admin/dedicated-orders/batch-rebind',
    'admin/dedicated-orders/batch-refund',
    'admin/dedicated-orders/batch-switch-route',
    'admin/dedicated-orders/import-upstreams',
    'admin/dedicated-orders/sync-upstreams',
  ])
  mutateHistoricalDedicatedOrder(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: unknown,
  ): never {
    return this.unsupported(ctx, 'legacy_dedicated_order_mutation_unavailable');
  }

  @Post(['admin/notifications/broadcast/preview', 'admin/notifications/broadcast'])
  broadcastHistoricalNotifications(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_broadcast_unavailable');
  }

  @Get([
    'admin/users/:id/api-key',
    'admin/users/:id/dedicated-prefs',
    'admin/users/:id/ips',
    'admin/users/:id/referral',
  ])
  readHistoricalUserResources(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx, 'legacy_admin_user_resource_unavailable');
  }

  @Put(['admin/users/:id/status', 'admin/users/:id/role', 'admin/users/:id/dedicated-prefs'])
  updateHistoricalUserPut(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: unknown,
  ): never {
    return this.unsupported(ctx, 'legacy_admin_user_mutation_unavailable');
  }

  @Patch(['admin/users/:id/credentials', 'admin/users/:id/commission-rate'])
  updateHistoricalUserPatch(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: unknown,
  ): never {
    return this.unsupported(ctx, 'legacy_admin_user_mutation_unavailable');
  }

  @Delete(['admin/users/:id', 'admin/users/:id/api-key'])
  deleteHistoricalUser(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx, 'legacy_admin_user_mutation_unavailable');
  }

  @Post([
    'admin/users/:id/add-balance',
    'admin/users/:id/deduct-balance',
    'admin/users/:id/gift-balance',
    'admin/users/:id/set-balance',
    'admin/users/:id/api-key/regenerate',
    'admin/users/:id/impersonate',
  ])
  mutateHistoricalUser(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_user_mutation_unavailable');
  }

  @Patch(['admin/proxies/:id/limit', 'admin/referral/withdrawals/:id'])
  mutateHistoricalProxy(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_residential_capability_unavailable');
  }

  @Post(['admin/dedicated-customer-profiles', 'admin/recharge-approval', 'admin/recharges'])
  mutateHistoricalAdminResource(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_resource_unavailable');
  }

  @Get(['admin/recharges', 'admin/recharge-approval'])
  readHistoricalAdminResource(@CurrentContext() ctx: AuthenticatedContext, @Query() _query: unknown): never {
    return this.unsupported(ctx, 'legacy_admin_resource_unavailable');
  }

  private unsupported(ctx: AuthenticatedContext, reasonKey: string): never {
    assertLegacyApiAccess(this.config, ctx);
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN' && !ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    throw new AppError(ErrorCode.UNSUPPORTED_CAPABILITY, reasonKey, 501);
  }
}
