import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyAdminSkusController } from './legacy-admin-skus.controller';
import { ApiV1CompatModule } from './api-v1-compat.module';

const adminContext: AuthenticatedContext = {
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
  const catalog = {
    listSkus: vi.fn().mockResolvedValue([{
      id: 'sku-sv',
      code: 'SV',
      name: 'Short Video',
      description: 'Dedicated short video line',
      isActive: true,
      isVisible: true,
      contractVersion: 1,
      capabilities: { delivery: 'dedicated-line', supportedProtocols: ['VMESS'] },
    }]),
  };
  return { controller: new LegacyAdminSkusController(config as never, catalog as never), config, catalog };
}

describe('LegacyAdminSkusController', () => {
  it('registers the frozen admin SKU routes', () => {
    const controllers = Reflect.getMetadata('controllers', ApiV1CompatModule) as unknown[];
    expect(controllers.map((controller) => (controller as { name: string }).name)).toContain(
      'LegacyAdminSkusController',
    );
  });

  it.each([
    ['POST', () => createController().controller.createSku(adminContext, {})],
    ['PATCH', () => createController().controller.updateSku(adminContext, 'sku-1', {})],
  ])('returns typed 501 for frozen admin SKU %s', async (_method, request) => {
    await expect(Promise.resolve().then(request)).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_admin_dedicated_sku_contract_unavailable',
    });
  });

  it('projects the real canonical dedicated SKU catalog for the legacy list', async () => {
    const { controller, catalog } = createController();
    const result = await controller.listSkus(adminContext);
    expect(catalog.listSkus).toHaveBeenCalledWith('site-1', true);
    expect(result).toEqual([expect.objectContaining({
      id: 'sku-sv',
      code: 'SV',
      status: 'active',
      protocols: ['VMESS'],
    })]);
  });

  it('checks gate, site and admin scope before reporting unsupported capability', async () => {
    const disabled = new LegacyAdminSkusController({ get: () => 'false' } as never, {} as never);
    await expect(Promise.resolve().then(() => disabled.listSkus(adminContext))).rejects.toMatchObject({
      code: 'NOT_FOUND',
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    });

    const { controller } = createController();
    await expect(Promise.resolve().then(() => controller.listSkus({ ...adminContext, siteId: 'site-2' }))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
    await expect(Promise.resolve().then(() => controller.listSkus({ ...adminContext, ownerType: 'USER' }))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
  });
});
