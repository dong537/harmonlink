import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { LegacyAdminUsersController } from './legacy-admin-users.controller';
import { ApiV1CompatModule } from './api-v1-compat.module';

const platformAdmin: AuthenticatedContext = {
  ownerId: 'admin-1',
  ownerType: 'PLATFORM_ADMIN',
  siteId: 'site-1',
  tenantId: null,
  scopes: [],
  requestId: 'request-1',
};

const tenantAdmin: AuthenticatedContext = {
  ...platformAdmin,
  ownerType: 'TENANT_ADMIN',
  tenantId: 'tenant-1',
};

function createController() {
  const config = {
    get: vi.fn((key: string): unknown => ({
      LEGACY_API_V1_ENABLED: 'true',
      LEGACY_API_SITE_ID: 'site-1',
    })[key]),
  };
  const users = {
    listLegacyAdminUsers: vi.fn().mockResolvedValue({
      page: 2,
      pageSize: 50,
      total: 1,
      items: [{
        id: 'user-uuid',
        legacyId: 42,
        email: 'person@example.com',
        name: '  Ada Lovelace  ',
        tenantId: 'tenant-1',
        status: 'ACTIVE',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        balance: '12.50',
      }],
    }),
    findLegacyAdminUserById: vi.fn().mockResolvedValue({
      id: 'user-uuid',
      legacyId: 42,
      email: 'person@example.com',
      name: null,
      tenantId: 'tenant-1',
      status: 'ACTIVE',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      balance: '0',
    }),
  };
  const createUser = { execute: vi.fn().mockResolvedValue({ id: 'user-uuid', tenantId: 'tenant-1' }) };
  return {
    controller: new LegacyAdminUsersController(config as never, users as never, createUser as never),
    config,
    users,
    createUser,
  };
}

describe('LegacyAdminUsersController', () => {
  it('registers the frozen admin users controller', () => {
    const controllers = Reflect.getMetadata('controllers', ApiV1CompatModule) as unknown[];
    expect(controllers.map((controller) => (controller as { name: string }).name)).toContain(
      'LegacyAdminUsersController',
    );
  });

  it('maps canonical users to the frozen numeric admin projection', async () => {
    const { controller, users } = createController();

    const result = await controller.listUsers(platformAdmin, {
      page: '2',
      limit: '50',
      email: 'person@example.com',
    });

    expect(users.listLegacyAdminUsers).toHaveBeenCalledWith('site-1', null, {
      page: 2,
      pageSize: 50,
      email: 'person@example.com',
      status: undefined,
    });
    expect(result).toEqual({
      data: [{
        id: 42,
        email: 'person@example.com',
        nickname: 'Ada Lovelace',
        role: 'user',
        balance: '12.50',
        status: 'active',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
      list: [{
        id: 42,
        email: 'person@example.com',
        nickname: 'Ada Lovelace',
        role: 'user',
        balance: '12.50',
        status: 'active',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
      items: [{
        id: 42,
        email: 'person@example.com',
        nickname: 'Ada Lovelace',
        role: 'user',
        balance: '12.50',
        status: 'active',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      }],
      page: 2,
      pageSize: 50,
      limit: 50,
      total: 1,
    });
  });

  it('uses email as nickname when canonical name is empty', async () => {
    const { controller, users } = createController();
    users.listLegacyAdminUsers.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        id: 'user-uuid',
        legacyId: 42,
        email: 'person@example.com',
        name: '   ',
        tenantId: 'tenant-1',
        status: 'SUSPENDED',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        balance: null,
      }],
    });

    const result = await controller.listUsers(tenantAdmin, { status: 'disabled' });

    expect(users.listLegacyAdminUsers).toHaveBeenCalledWith('site-1', 'tenant-1', {
      page: 1,
      pageSize: 20,
      email: undefined,
      status: 'DISABLED',
    });
    expect(result.data[0]).toMatchObject({ id: 42, nickname: 'person@example.com', status: 'disabled', balance: null });
  });

  it('delegates supported user creation to the canonical use case and returns numeric ID', async () => {
    const { controller, createUser, users } = createController();

    const result = await controller.createUser(platformAdmin, {
      email: 'new@example.com',
      password: 'password-123',
      role: 'user',
      initialBalance: 0,
      tenantId: 'tenant-1',
    });

    expect(createUser.execute).toHaveBeenCalledWith(platformAdmin, {
      email: 'new@example.com',
      password: 'password-123',
      tenantId: 'tenant-1',
    });
    expect(users.findLegacyAdminUserById).toHaveBeenCalledWith('user-uuid', {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    });
    expect(result).toMatchObject({ id: 42, email: 'person@example.com', nickname: 'person@example.com', role: 'user' });
  });

  it.each([
    ['admin role', { role: 'admin' }],
    ['non-zero initial balance', { role: 'user', initialBalance: 1 }],
  ])('rejects %s as unsupported without creating a user', async (_label, body) => {
    const { controller, createUser } = createController();

    await expect(controller.createUser(platformAdmin, {
      email: 'new@example.com',
      password: 'password-123',
      tenantId: 'tenant-1',
      ...body,
    })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
    });
    expect(createUser.execute).not.toHaveBeenCalled();
  });

  it('rejects role=admin and deleted filtering explicitly instead of returning an empty list', async () => {
    const { controller, users } = createController();

    await expect(controller.listUsers(platformAdmin, { role: 'admin' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
    });
    await expect(controller.listUsers(platformAdmin, { status: 'deleted' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      httpStatus: 501,
    });
    expect(users.listLegacyAdminUsers).not.toHaveBeenCalled();
  });

  it('enforces the legacy gate, site and tenant-admin scope', async () => {
    const { controller, users } = createController();

    await expect(controller.listUsers({ ...platformAdmin, siteId: 'site-2' }, {})).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      reasonKey: 'legacy_api_site_mismatch',
    });
    await expect(controller.listUsers({ ...tenantAdmin, tenantId: null }, {})).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      reasonKey: 'tenant_context_required',
    });
    expect(users.listLegacyAdminUsers).not.toHaveBeenCalled();
  });
});
