import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { assertLegacyApiAccess } from './legacy-site-access';

/**
 * Compatibility boundary for the frozen administrator control-plane client.
 * Route handlers are added only when their canonical owner is proven equivalent.
 */
@Controller('v1')
@RequireAuth()
export class LegacyAdminControlPlaneController {
  constructor(private readonly config: ConfigService) {}

  @Get('admin/xui-nodes')
  listXuiNodes(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx, 'legacy_xui_nodes_unavailable');
  }

  @Post('admin/xui-nodes')
  createXuiNode(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Post('admin/xui-nodes/bulk-import')
  bulkImportXuiNodes(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Patch('admin/xui-nodes/:id')
  updateXuiNode(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Delete('admin/xui-nodes/:id')
  deleteXuiNode(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Get('admin/xui-nodes/:id/mappings')
  listXuiNodeMappings(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Get('admin/xui-nodes/:id/inbounds')
  listXuiNodeInbounds(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Get('admin/xui-nodes/:id/stats')
  getXuiNodeStats(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Post('admin/xui-nodes/:id/test-connection')
  testXuiNodeConnection(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Get('admin/xui-nodes/dedicated-proxies/:id/rebind-candidates')
  listXuiNodeRebindCandidates(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Query() _query: unknown,
  ): never {
    return this.unsupported(ctx);
  }

  @Post('admin/xui-nodes/dedicated-proxies/:id/rebind')
  rebindXuiNodeProxy(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') _id: string,
    @Body() _body: unknown,
  ): never {
    return this.unsupported(ctx);
  }

  @Get('admin/entry-profiles')
  listEntryProfiles(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/entry-profiles')
  createEntryProfile(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Post('admin/entry-profiles/:id/check')
  checkEntryProfile(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string): never {
    return this.unsupported(ctx);
  }

  @Get('admin/entry-device-groups')
  listEntryDeviceGroups(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/entry-device-groups')
  createEntryDeviceGroup(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Get('admin/external-forward-rules')
  listExternalForwardRules(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/external-forward-rules')
  createExternalForwardRule(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Get('admin/relay-deployment-sets')
  listRelayDeploymentSets(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/relay-deployment-sets')
  createRelayDeploymentSet(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Get('admin/delivery-profiles')
  listDeliveryProfiles(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/delivery-profiles')
  createDeliveryProfile(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  @Get('admin/delivery-policy-bindings')
  listDeliveryPolicyBindings(@CurrentContext() ctx: AuthenticatedContext): never {
    return this.unsupported(ctx);
  }

  @Post('admin/delivery-policy-bindings')
  createDeliveryPolicyBinding(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    return this.unsupported(ctx);
  }

  private unsupported(ctx: AuthenticatedContext, reasonKey = 'legacy_control_plane_unavailable'): never {
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
