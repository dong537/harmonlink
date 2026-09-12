import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyAdminUnsupportedController } from './legacy-admin-unsupported.controller';
import { ApiV1CompatModule } from './api-v1-compat.module';

const admin: AuthenticatedContext = {
  ownerId: 'admin-1',
  ownerType: 'PLATFORM_ADMIN',
  siteId: 'site-1',
  tenantId: null,
  scopes: [],
  requestId: 'request-1',
};

function createController() {
  const config = {
    get: vi.fn((key: string): unknown => ({
      LEGACY_API_V1_ENABLED: 'true',
      LEGACY_API_SITE_ID: 'site-1',
    })[key]),
  };
  const users = {
    resolveLegacyIdForScope: vi.fn().mockResolvedValue({
      userId: 'user-uuid',
      siteId: 'site-1',
      tenantId: 'tenant-1',
    }),
  };
  const adminUserOperations = {
    updateStatus: vi.fn(async (_ctx: unknown, _id: string, body: { status: string }) => ({
      id: 'user-uuid',
      status: body.status,
    })),
    delete: vi.fn().mockResolvedValue({ id: 'user-uuid' }),
  };
  return {
    controller: new LegacyAdminUnsupportedController(config as never, users as never, adminUserOperations as never),
    config,
    users,
    adminUserOperations,
  };
}

describe('LegacyAdminUnsupportedController', () => {
  it('registers the explicit historical admin route guard', () => {
    const controllers = Reflect.getMetadata('controllers', ApiV1CompatModule) as unknown[];
    expect(controllers.map((entry) => (entry as { name: string }).name)).toContain(
      'LegacyAdminUnsupportedController',
    );
  });

  it('returns typed unsupported capability after checking admin/site scope', async () => {
    await expect(Promise.resolve().then(() => createController().controller.readHistoricalDashboard(admin, {}))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_admin_dashboard_contract_unavailable',
    });
  });

  it('rejects non-admin and cross-site callers before the capability result', async () => {
    await expect(Promise.resolve().then(() => createController().controller.readHistoricalDashboard({ ...admin, ownerType: 'USER' }, {}))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
    await expect(Promise.resolve().then(() => createController().controller.readHistoricalDashboard({ ...admin, siteId: 'site-2' }, {}))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
  });

  it('resolves a numeric legacy id in platform site scope and maps active status', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(controller.updateLegacyUserStatus(admin, '42', { status: 'active' })).resolves.toEqual({
      id: 42,
      status: 'active',
    });
    expect(users.resolveLegacyIdForScope).toHaveBeenCalledWith(42, {
      siteId: 'site-1',
      tenantId: null,
    });
    expect(adminUserOperations.updateStatus).toHaveBeenCalledWith(admin, 'user-uuid', { status: 'ACTIVE' });
  });

  it('maps disabled status and tenant-admin scope without exposing the numeric id to the use case', async () => {
    const { controller, users, adminUserOperations } = createController();
    const tenantAdmin = { ...admin, ownerType: 'TENANT_ADMIN' as const, tenantId: 'tenant-1' };

    await expect(controller.updateLegacyUserStatus(tenantAdmin, '7', { status: 'disabled' })).resolves.toEqual({
      id: 7,
      status: 'disabled',
    });

    expect(users.resolveLegacyIdForScope).toHaveBeenCalledWith(7, {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    });
    expect(adminUserOperations.updateStatus).toHaveBeenCalledWith(tenantAdmin, 'user-uuid', {
      status: 'SUSPENDED',
    });
  });

  it.each(['0', '-1', '1.5', '1e3', '9007199254740992', 'not-a-number', ''])(
    'rejects malformed legacy user id %s before repository lookup',
    async (id) => {
      const { controller, users, adminUserOperations } = createController();

      await expect(controller.updateLegacyUserStatus(admin, id, { status: 'active' })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
        reasonKey: 'user_id_invalid',
      });
      expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
      expect(adminUserOperations.updateStatus).not.toHaveBeenCalled();
    },
  );

  it('rejects an unsupported legacy status before resolving the target user', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(controller.updateLegacyUserStatus(admin, '42', { status: 'banned' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      reasonKey: 'legacy_admin_user_status_invalid',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(adminUserOperations.updateStatus).not.toHaveBeenCalled();
  });

  it('keeps the historical deleted status as an explicit unsupported capability', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(controller.updateLegacyUserStatus(admin, '42', { status: 'deleted' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_admin_deleted_users_unavailable',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(adminUserOperations.updateStatus).not.toHaveBeenCalled();
  });

  it('deletes a user resolved from a numeric legacy id in the caller scope', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(controller.deleteLegacyUser(admin, '42')).resolves.toEqual({ id: 42 });
    expect(users.resolveLegacyIdForScope).toHaveBeenCalledWith(42, {
      siteId: 'site-1',
      tenantId: null,
    });
    expect(adminUserOperations.delete).toHaveBeenCalledWith(admin, 'user-uuid');
  });

  it('checks legacy access before resolving or mutating a target user', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(controller.deleteLegacyUser({ ...admin, siteId: 'site-2' }, '42')).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      reasonKey: 'legacy_api_site_mismatch',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(adminUserOperations.delete).not.toHaveBeenCalled();
  });

  it('requires a tenant context for tenant-admin mutations', async () => {
    const { controller, users, adminUserOperations } = createController();

    await expect(
      controller.deleteLegacyUser({ ...admin, ownerType: 'TENANT_ADMIN' as const, tenantId: null }, '42'),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'tenant_context_required',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(adminUserOperations.delete).not.toHaveBeenCalled();
  });

  it('registers every grouped historical admin method instead of overwriting route metadata', () => {
    const prototype = LegacyAdminUnsupportedController.prototype;
    const routes = new Set<string>();

    for (const property of Object.getOwnPropertyNames(prototype)) {
      if (property === 'constructor') continue;
      const handler = prototype[property as keyof typeof prototype];
      if (typeof handler !== 'function') continue;
      const paths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (paths === undefined || method === undefined) continue;
      for (const path of Array.isArray(paths) ? paths : [paths]) {
        routes.add(`${method}:${path}`);
      }
    }

    expect([...routes]).toEqual(
      expect.arrayContaining([
        `${RequestMethod.GET}:admin/pending-items`,
        `${RequestMethod.GET}:admin/recent-orders`,
        `${RequestMethod.GET}:admin/revenue-trend`,
        `${RequestMethod.GET}:admin/payment-config`,
        `${RequestMethod.PUT}:admin/payment-config`,
        `${RequestMethod.PATCH}:admin/users/:id/credentials`,
        `${RequestMethod.PATCH}:admin/users/:id/commission-rate`,
        `${RequestMethod.DELETE}:admin/dedicated-plans/:id`,
        `${RequestMethod.POST}:admin/dedicated-orders/:id/rebind`,
        `${RequestMethod.POST}:admin/dedicated-orders/batch-rebind`,
        `${RequestMethod.POST}:admin/notifications/broadcast`,
        `${RequestMethod.GET}:admin/users/:id/referral`,
        `${RequestMethod.POST}:admin/users/:id/impersonate`,
        `${RequestMethod.PUT}:admin/users/:id/status`,
        `${RequestMethod.DELETE}:admin/users/:id`,
      ]),
    );
  });
});
