import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth, RequireUser } from '../../common/auth/guards';
import { ConfigService } from '../../common/config/config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { UsersRepository } from '../users/users.repository';
import type { CreateZoneInput, UpdateZoneInput, Zone, ZoneScope } from '../zones/domain';
import {
  ArchiveZoneUseCase,
  CreateZoneUseCase,
  DeleteZoneUseCase,
  ListZonesUseCase,
  UpdateZoneUseCase,
} from '../zones/use-cases';
import { assertLegacyApiAccess } from './legacy-site-access';

@Controller('v1')
export class LegacyZonesController {
  constructor(
    private readonly config: ConfigService,
    private readonly listZones: ListZonesUseCase,
    private readonly createZone: CreateZoneUseCase,
    private readonly updateZone: UpdateZoneUseCase,
    private readonly archiveZone: ArchiveZoneUseCase,
    private readonly deleteZone: DeleteZoneUseCase,
    private readonly users: UsersRepository,
  ) {}

  @Get('zones')
  @RequireUser()
  async list(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: { includeArchived?: unknown },
  ) {
    this.assertEnabled(ctx);
    const zones = await this.listZones.execute(ownerScope(ctx), readBoolean(query?.includeArchived));
    return zones.map(toLegacyZone);
  }

  @Post('zones')
  @RequireUser()
  async create(@CurrentContext() ctx: AuthenticatedContext, @Body() body: CreateZoneInput) {
    this.assertEnabled(ctx);
    return toLegacyZone(await this.createZone.execute(ownerScope(ctx), body));
  }

  @Patch('zones/:id')
  @RequireUser()
  async update(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') id: string,
    @Body() body: UpdateZoneInput,
  ) {
    this.assertEnabled(ctx);
    return toLegacyZone(await this.updateZone.execute(ownerScope(ctx), id, body));
  }

  @Post('zones/:id/archive')
  @RequireUser()
  async archive(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    return toLegacyZone(await this.archiveZone.execute(ownerScope(ctx), id));
  }

  @Delete('zones/:id')
  @RequireUser()
  async remove(@CurrentContext() ctx: AuthenticatedContext, @Param('id') id: string) {
    this.assertEnabled(ctx);
    await this.deleteZone.execute(ownerScope(ctx), id);
    return { ok: true };
  }

  @Get('admin/users/:legacyUserId/zones')
  @RequireAuth()
  async listForAdmin(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('legacyUserId') legacyUserId: string,
  ) {
    this.assertEnabled(ctx);
    if (ctx.ownerType !== 'PLATFORM_ADMIN' && ctx.ownerType !== 'TENANT_ADMIN') {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
    }
    if (ctx.ownerType === 'TENANT_ADMIN' && !ctx.tenantId) {
      throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
    }
    const target = await this.users.resolveLegacyIdForScope(readLegacyUserId(legacyUserId), {
      siteId: ctx.siteId,
      tenantId: ctx.ownerType === 'TENANT_ADMIN' ? ctx.tenantId : null,
    });
    const zones = await this.listZones.execute(target, true);
    return zones.map(toLegacyZone);
  }

  private assertEnabled(context: Pick<AuthenticatedContext, 'siteId'>): string {
    return assertLegacyApiAccess(this.config, context);
  }
}

function ownerScope(ctx: AuthenticatedContext): ZoneScope {
  if (ctx.ownerType !== 'USER') {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'insufficient_permissions', 403);
  }
  if (!ctx.tenantId) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'tenant_context_required', 403);
  }
  return { siteId: ctx.siteId, tenantId: ctx.tenantId, userId: ctx.ownerId };
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function readLegacyUserId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'user_id_invalid', 400);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'user_id_invalid', 400);
  }
  return id;
}

function toLegacyZone(zone: Zone) {
  return {
    id: zone.id,
    code: zone.code,
    name: zone.name,
    description: zone.description,
    status: zone.status === 'ACTIVE' ? 'active' as const : 'archived' as const,
    sortOrder: zone.sortOrder,
    createdAt: zone.createdAt,
  };
}
