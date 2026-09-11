import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ConfigService } from '../../common/config/config.service';
import { CatalogRepository } from '../catalog/catalog.repository';
import { assertLegacyApiAccess } from './legacy-site-access';

@Controller('v1')
export class LegacyAdminSkusController {
  constructor(
    private readonly config: ConfigService,
    private readonly catalog: CatalogRepository,
  ) {}

  @Get('admin/dedicated-skus')
  @RequireAuth()
  async listSkus(@CurrentContext() ctx: AuthenticatedContext) {
    this.assertAdminAccess(ctx);
    const skus = await this.catalog.listSkus(ctx.siteId, true);
    return skus
      .filter((sku) => sku.capabilities['delivery'] === 'dedicated-line')
      .map((sku) => ({
        id: sku.id,
        code: sku.code,
        name: sku.name,
        description: sku.description,
        status: sku.isActive ? 'active' : 'disabled',
        isActive: sku.isActive,
        isVisible: sku.isVisible,
        contractVersion: sku.contractVersion,
        protocols: Array.isArray(sku.capabilities['supportedProtocols'])
          ? sku.capabilities['supportedProtocols']
          : [],
        capabilities: sku.capabilities,
      }));
  }

  @Post('admin/dedicated-skus')
  @RequireAuth()
  createSku(@CurrentContext() ctx: AuthenticatedContext, @Body() _body: unknown): never {
    this.assertAdminAccess(ctx);
    throw this.unsupported();
  }

  @Patch('admin/dedicated-skus/:id')
  @RequireAuth()
  updateSku(@CurrentContext() ctx: AuthenticatedContext, @Param('id') _id: string, @Body() _body: unknown): never {
    this.assertAdminAccess(ctx);
    throw this.unsupported();
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

  private unsupported(): AppError {
    return new AppError(
      ErrorCode.UNSUPPORTED_CAPABILITY,
      'legacy_admin_dedicated_sku_contract_unavailable',
      501,
    );
  }
}
