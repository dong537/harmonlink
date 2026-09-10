import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyZonesController } from './legacy-zones.controller';

const userContext: AuthenticatedContext = {
  ownerId: 'user-1',
  ownerType: 'USER',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  scopes: [],
  requestId: 'request-1',
};

const activeZone = {
  id: 'zone-1',
  siteId: 'site-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  code: 'short-video',
  name: 'Short video',
  description: null,
  status: 'ACTIVE' as const,
  sortOrder: 2,
  createdAt: new Date('2026-09-09T00:00:00.000Z'),
  updatedAt: new Date('2026-09-09T00:00:00.000Z'),
};

function createController() {
  const config = {
    get: vi.fn((key: string) => key === 'LEGACY_API_V1_ENABLED' ? 'true' : 'site-1'),
  };
  const list = { execute: vi.fn().mockResolvedValue([activeZone]) };
  const create = { execute: vi.fn().mockResolvedValue(activeZone) };
  const update = { execute: vi.fn().mockResolvedValue(activeZone) };
  const archive = { execute: vi.fn().mockResolvedValue({ ...activeZone, status: 'ARCHIVED' }) };
  const remove = { execute: vi.fn().mockResolvedValue(undefined) };
  const users = {
    resolveLegacyIdForScope: vi.fn().mockResolvedValue({
      userId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1',
    }),
  };
  const controller = new LegacyZonesController(
    config as never,
    list as never,
    create as never,
    update as never,
    archive as never,
    remove as never,
    users as never,
  );
  return { controller, config, list, create, update, archive, remove, users };
}

describe('LegacyZonesController', () => {
  it('returns a raw array with lowercase compatibility status', async () => {
    const { controller, list } = createController();

    const result = await controller.list(userContext, { includeArchived: 'true' });

    expect(list.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      true,
    );
    expect(result).toEqual([expect.objectContaining({ id: 'zone-1', status: 'active' })]);
    expect(Array.isArray(result)).toBe(true);
  });

  it.each([
    [undefined, false],
    ['false', false],
    ['0', false],
    [false, false],
    ['1', true],
  ])('maps includeArchived=%s to the canonical boolean contract', async (value, expected) => {
    const { controller, list } = createController();

    await controller.list(userContext, { includeArchived: value });

    expect(list.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      expected,
    );
  });

  it('maps create input through the canonical use case', async () => {
    const { controller, create } = createController();

    const result = await controller.create(userContext, {
      code: ' Short-Video ', name: 'Short video', description: null, sortOrder: 2,
    });

    expect(create.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      { code: ' Short-Video ', name: 'Short video', description: null, sortOrder: 2 },
    );
    expect(result.status).toBe('active');
  });

  it('resolves an admin numeric user ID inside the caller tenant before listing zones', async () => {
    const { controller, users, list } = createController();
    const admin = { ...userContext, ownerType: 'TENANT_ADMIN' as const, ownerId: 'admin-1' };

    await controller.listForAdmin(admin, '17');

    expect(users.resolveLegacyIdForScope).toHaveBeenCalledWith(17, {
      siteId: 'site-1', tenantId: 'tenant-1',
    });
    expect(list.execute).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' },
      true,
    );
  });

  it('rejects a tenant admin without tenant context before resolving a target user', async () => {
    const { controller, users, list } = createController();
    const admin = { ...userContext, ownerType: 'TENANT_ADMIN' as const, tenantId: null };

    await expect(controller.listForAdmin(admin, '17')).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'tenant_context_required',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(list.execute).not.toHaveBeenCalled();
  });

  it('rejects malformed admin user IDs before querying users or zones', async () => {
    const { controller, users, list } = createController();
    const admin = { ...userContext, ownerType: 'PLATFORM_ADMIN' as const, tenantId: null };

    await expect(controller.listForAdmin(admin, 'user-uuid')).rejects.toMatchObject({
      httpStatus: 400,
      reasonKey: 'user_id_invalid',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(list.execute).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers before resolving a target user', async () => {
    const { controller, users } = createController();

    await expect(controller.listForAdmin(userContext, '17')).rejects.toMatchObject({
      httpStatus: 403,
      reasonKey: 'insufficient_permissions',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
  });

  it('short-circuits every customer Zone route when the fixed site does not match', async () => {
    const { controller, list, create, update, archive, remove } = createController();
    const foreign = { ...userContext, siteId: 'site-2' };

    await expect(controller.list(foreign, {})).rejects.toMatchObject({ reasonKey: 'legacy_api_site_mismatch' });
    await expect(controller.create(foreign, { code: 'zone', name: 'Zone' })).rejects.toMatchObject({ reasonKey: 'legacy_api_site_mismatch' });
    await expect(controller.update(foreign, 'zone-1', { name: 'Updated' })).rejects.toMatchObject({ reasonKey: 'legacy_api_site_mismatch' });
    await expect(controller.archive(foreign, 'zone-1')).rejects.toMatchObject({ reasonKey: 'legacy_api_site_mismatch' });
    await expect(controller.remove(foreign, 'zone-1')).rejects.toMatchObject({ reasonKey: 'legacy_api_site_mismatch' });

    expect(list.execute).not.toHaveBeenCalled();
    expect(create.execute).not.toHaveBeenCalled();
    expect(update.execute).not.toHaveBeenCalled();
    expect(archive.execute).not.toHaveBeenCalled();
    expect(remove.execute).not.toHaveBeenCalled();
  });

  it('short-circuits the admin Zone route when the compatibility API is disabled', async () => {
    const { controller, config, users, list } = createController();
    config.get.mockImplementation(((key: string) => key === 'LEGACY_API_V1_ENABLED' ? 'false' : 'site-1') as never);
    const admin = { ...userContext, ownerType: 'PLATFORM_ADMIN' as const, tenantId: null };

    await expect(controller.listForAdmin(admin, '17')).rejects.toMatchObject({
      httpStatus: 404,
      reasonKey: 'legacy_api_disabled',
    });
    expect(users.resolveLegacyIdForScope).not.toHaveBeenCalled();
    expect(list.execute).not.toHaveBeenCalled();
  });
});
