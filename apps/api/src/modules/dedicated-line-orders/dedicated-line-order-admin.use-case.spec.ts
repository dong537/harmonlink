import { describe, it, expect, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/error-codes';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { DedicatedLineOrderAdminRepository } from './dedicated-line-order-admin.repository';
import { DedicatedLineOrderAdminUseCase } from './dedicated-line-order-admin.use-case';

const platformContext: AuthenticatedContext = {
  ownerId: 'platform-admin',
  ownerType: 'PLATFORM_ADMIN',
  siteId: 'site-1',
  tenantId: null,
  scopes: [],
  requestId: 'request-1',
};

const tenantContext: AuthenticatedContext = {
  ...platformContext,
  ownerId: 'tenant-admin',
  ownerType: 'TENANT_ADMIN',
  tenantId: 'tenant-1',
};

describe('DedicatedLineOrderAdminUseCase', () => {
  it('passes platform and tenant scopes to the canonical repository', async () => {
    const repository = {
      listForAdmin: vi.fn().mockResolvedValue({ page: 1, pageSize: 20, total: 0, items: [] }),
      getForAdmin: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as DedicatedLineOrderAdminRepository;
    const useCase = new DedicatedLineOrderAdminUseCase(repository);

    await useCase.list(platformContext, { page: 1 });
    await useCase.get(tenantContext, 'order-1');

    expect(repository.listForAdmin).toHaveBeenCalledWith(
      { siteId: 'site-1', tenantId: null },
      { page: 1 },
    );
    expect(repository.getForAdmin).toHaveBeenCalledWith('order-1', {
      siteId: 'site-1',
      tenantId: 'tenant-1',
    });
  });

  it('rejects non-admin contexts before touching the repository', async () => {
    const repository = {
      listForAdmin: vi.fn(),
      getForAdmin: vi.fn(),
    } as unknown as DedicatedLineOrderAdminRepository;
    const useCase = new DedicatedLineOrderAdminUseCase(repository);
    const userContext = { ...platformContext, ownerType: 'USER' as const, ownerId: 'user-1' };

    await expect(useCase.list(userContext, {})).rejects.toMatchObject({
      code: ErrorCode.PERMISSION_DENIED,
      reasonKey: 'insufficient_permissions',
      httpStatus: 403,
    });
    expect(repository.listForAdmin).not.toHaveBeenCalled();
  });

  it('checks order scope before returning an unsupported operation error', async () => {
    const repository = {
      getForAdmin: vi.fn().mockResolvedValue({ id: 'order-1' }),
    } as unknown as DedicatedLineOrderAdminRepository;
    const useCase = new DedicatedLineOrderAdminUseCase(repository);

    await expect(useCase.retry(platformContext, 'order-1')).rejects.toEqual(
      expect.objectContaining({
        code: ErrorCode.UNSUPPORTED_CAPABILITY,
        reasonKey: 'dedicated_line_order_admin_operation_unsupported',
        httpStatus: 501,
        details: { operation: 'retry' },
      }),
    );
    expect(repository.getForAdmin).toHaveBeenCalledWith('order-1', {
      siteId: 'site-1',
      tenantId: null,
    });
  });
});
