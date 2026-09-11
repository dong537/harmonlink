import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyAdminDedicatedController } from './legacy-admin-dedicated.controller';

const platformAdminContext: AuthenticatedContext = {
  ownerId: 'admin-1',
  ownerType: 'PLATFORM_ADMIN',
  siteId: 'site-1',
  tenantId: null,
  scopes: [],
  requestId: 'request-1',
};

const canonicalPage = {
  page: 2,
  pageSize: 10,
  total: 1,
  items: [{
    id: 'line-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    status: 'ACTIVE',
    countryCode: 'HK',
    protocol: 'VLESS',
    desiredVersion: 3,
    customer: { email: 'customer@example.com', name: 'Customer' },
    sku: { code: 'SV', name: 'Short video' },
    inboundTag: 'sv-hk-1',
    limits: {
      trafficLimitBytes: '10737418240',
      uplinkLimitBps: '131072',
      downlinkLimitBps: '524288',
      maxConnections: 32,
      ipLimit: 2,
    },
    projections: { ready: 1, total: 2 },
  }],
};

function createController() {
  const config = {
    get: vi.fn((key: string): unknown => {
      if (key === 'LEGACY_API_V1_ENABLED') return 'true';
      if (key === 'LEGACY_API_SITE_ID') return 'site-1';
      return undefined;
    }),
  };
  const listLines = { execute: vi.fn().mockResolvedValue(canonicalPage) };
  const controller = new LegacyAdminDedicatedController(config as never, listLines as never);
  return { controller, config, listLines };
}

describe('LegacyAdminDedicatedController', () => {
  it('maps the frozen dedicated-order page to the canonical scoped line-list use case', async () => {
    const { controller, listLines } = createController();

    const result = await controller.listDedicatedOrders(platformAdminContext, {
      page: '2',
      limit: '10',
    });

    expect(listLines.execute).toHaveBeenCalledWith(platformAdminContext, {
      page: 2,
      pageSize: 10,
    }, { maxPageSize: 100 });
    expect(result).toEqual({
      page: 2,
      pageSize: 10,
      limit: 10,
      total: 1,
      items: [{
        proxyId: 'line-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        userEmail: 'customer@example.com',
        userName: 'Customer',
        skuCode: 'SV',
        skuName: 'Short video',
        country: 'HK',
        protocol: 'vless',
        status: 'active',
        desiredVersion: 3,
        inboundTag: 'sv-hk-1',
        limits: canonicalPage.items[0]!.limits,
        projections: canonicalPage.items[0]!.projections,
      }],
    });
  });

  it('passes tenant-admin context through so the canonical use case owns tenant scoping', async () => {
    const { controller, listLines } = createController();
    const tenantAdmin = {
      ...platformAdminContext,
      ownerType: 'TENANT_ADMIN' as const,
      tenantId: 'tenant-1',
    };

    await controller.listDedicatedOrders(tenantAdmin, {});

    expect(listLines.execute).toHaveBeenCalledWith(tenantAdmin, { page: 1, pageSize: 20 }, { maxPageSize: 100 });
  });

  it.each([50, 100])('preserves the frozen administrator page-size choice %d', async (pageSize) => {
    const { controller, listLines } = createController();

    await controller.listDedicatedOrders(platformAdminContext, { page: '2', limit: String(pageSize) });

    expect(listLines.execute).toHaveBeenCalledWith(platformAdminContext, {
      page: 2,
      pageSize,
    }, { maxPageSize: 100 });
  });

  it('rejects a page size above the canonical management limit instead of truncating it', async () => {
    const { controller, listLines } = createController();

    await expect(controller.listDedicatedOrders(platformAdminContext, { limit: '101' }))
      .rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
        reasonKey: 'legacy_dedicated_order_page_size_invalid',
      });
    expect(listLines.execute).not.toHaveBeenCalled();
  });

  it('rejects a tenant administrator without tenant context before the canonical query', async () => {
    const { controller, listLines } = createController();

    await expect(controller.listDedicatedOrders({
      ...platformAdminContext,
      ownerType: 'TENANT_ADMIN',
    }, {})).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'tenant_context_required',
    });
    expect(listLines.execute).not.toHaveBeenCalled();
  });

  it('rejects a different-site admin before the canonical query', async () => {
    const { controller, listLines } = createController();

    await expect(controller.listDedicatedOrders({
      ...platformAdminContext,
      siteId: 'site-2',
    }, {})).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'legacy_api_site_mismatch',
    });
    expect(listLines.execute).not.toHaveBeenCalled();
  });

  it('rejects a non-admin caller before the canonical query', async () => {
    const { controller, listLines } = createController();

    await expect(controller.listDedicatedOrders({
      ...platformAdminContext,
      ownerType: 'USER',
      tenantId: 'tenant-1',
    }, {})).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
    expect(listLines.execute).not.toHaveBeenCalled();
  });

  it('fails explicitly when frozen filters cannot be honored by the canonical list contract', async () => {
    const { controller, listLines } = createController();

    await expect(controller.listDedicatedOrders(platformAdminContext, {
      source: 'pool',
    })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
      reasonKey: 'legacy_dedicated_order_filters_unavailable',
    });
    expect(listLines.execute).not.toHaveBeenCalled();
  });

  it('returns a typed unsupported capability for the legacy upstream lock command', async () => {
    const { controller } = createController();

    await expect(Promise.resolve().then(() => controller.lockDedicatedOrder(
      platformAdminContext,
      'line-1',
      { locked: true },
    ))).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 409,
      reasonKey: 'legacy_dedicated_order_lock_unavailable',
    });
  });
});
