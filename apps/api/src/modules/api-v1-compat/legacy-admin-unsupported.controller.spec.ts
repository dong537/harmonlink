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

function controller() {
  const config = {
    get: vi.fn((key: string): unknown => ({
      LEGACY_API_V1_ENABLED: 'true',
      LEGACY_API_SITE_ID: 'site-1',
    })[key]),
  };
  return new LegacyAdminUnsupportedController(config as never);
}

describe('LegacyAdminUnsupportedController', () => {
  it('registers the explicit historical admin route guard', () => {
    const controllers = Reflect.getMetadata('controllers', ApiV1CompatModule) as unknown[];
    expect(controllers.map((entry) => (entry as { name: string }).name)).toContain(
      'LegacyAdminUnsupportedController',
    );
  });

  it('returns typed unsupported capability after checking admin/site scope', async () => {
    await expect(Promise.resolve().then(() => controller().readHistoricalDashboard(admin, {}))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_admin_dashboard_contract_unavailable',
    });
  });

  it('rejects non-admin and cross-site callers before the capability result', async () => {
    await expect(Promise.resolve().then(() => controller().readHistoricalDashboard({ ...admin, ownerType: 'USER' }, {}))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
    await expect(Promise.resolve().then(() => controller().readHistoricalDashboard({ ...admin, siteId: 'site-2' }, {}))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
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
      ]),
    );
  });
});
