import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  ArchiveZoneUseCase,
  CreateZoneUseCase,
  DeleteZoneUseCase,
  ListZonesUseCase,
  ResolveActiveZoneUseCase,
  UpdateZoneUseCase,
} from './use-cases';

const scope = { siteId: 'site-1', tenantId: 'tenant-1', userId: 'user-1' };

function zone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    ...scope,
    code: 'short-video',
    name: 'Short video',
    description: null,
    sortOrder: 0,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('user zones use cases', () => {
  it('creates a normalized code in the authenticated owner scope', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(zone()),
    };
    const result = await new CreateZoneUseCase(repo as never).execute(scope, {
      code: ' Short-Video ',
      name: 'Short video',
      description: '  notes  ',
      sortOrder: 4,
    });

    expect(repo.findByCode).toHaveBeenCalledWith(scope, 'short-video');
    expect(repo.create).toHaveBeenCalledWith(scope, {
      code: 'short-video',
      name: 'Short video',
      description: 'notes',
      sortOrder: 4,
    });
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects duplicate codes in the same owner scope but allows another user scope', async () => {
    const repo = {
      findByCode: vi.fn().mockResolvedValue(zone()),
      create: vi.fn(),
    };
    await expect(new CreateZoneUseCase(repo as never).execute(scope, {
      code: 'short-video',
      name: 'Another',
      sortOrder: 0,
    })).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_CONFLICT, reasonKey: 'zone_code_taken' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not allow updating the immutable code or an archived zone', async () => {
    const repo = {
      getForOwner: vi.fn().mockResolvedValue(zone({ status: 'ARCHIVED' })),
      update: vi.fn(),
    };
    await expect(new UpdateZoneUseCase(repo as never).execute(scope, 'zone-1', {
      code: 'new-code',
      name: 'Updated',
      sortOrder: 1,
    } as never)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR, reasonKey: 'zone_code_immutable' });

    const activeRepo = {
      getForOwner: vi.fn().mockResolvedValue(zone({ status: 'ARCHIVED' })),
      update: vi.fn(),
    };
    await expect(new UpdateZoneUseCase(activeRepo as never).execute(scope, 'zone-1', {
      name: 'Updated',
      sortOrder: 1,
    })).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_CONFLICT, reasonKey: 'zone_archived' });
  });

  it('archives an active zone and protects deletion when orders or lines depend on it', async () => {
    const repo = {
      getForOwner: vi.fn().mockResolvedValue(zone()),
      archive: vi.fn().mockResolvedValue(zone({ status: 'ARCHIVED' })),
      countDependencies: vi.fn().mockResolvedValue({ orders: 1, lines: 0 }),
      delete: vi.fn(),
    };
    const archived = await new ArchiveZoneUseCase(repo as never).execute(scope, 'zone-1');
    expect(archived.status).toBe('ARCHIVED');
    await expect(new DeleteZoneUseCase(repo as never).execute(scope, 'zone-1'))
      .rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_CONFLICT, reasonKey: 'zone_has_dependencies' });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('filters archived zones at the repository query boundary by default', async () => {
    const repo = { listForOwner: vi.fn().mockResolvedValue([zone()]) };
    await new ListZonesUseCase(repo as never).execute(scope, false);
    expect(repo.listForOwner).toHaveBeenCalledWith(scope, { includeArchived: false });
  });

  it('resolves an active selection by normalized code in the complete owner scope', async () => {
    const repo = { findByCode: vi.fn().mockResolvedValue(zone()) };

    const result = await new ResolveActiveZoneUseCase(repo as never).execute(scope, ' SHORT-VIDEO ');

    expect(repo.findByCode).toHaveBeenCalledWith(scope, 'short-video');
    expect(result?.id).toBe('zone-1');
  });

  it('allows an omitted selection but rejects an archived selection', async () => {
    const repo = { findByCode: vi.fn().mockResolvedValue(zone({ status: 'ARCHIVED' })) };
    const useCase = new ResolveActiveZoneUseCase(repo as never);

    await expect(useCase.execute(scope, undefined)).resolves.toBeNull();
    expect(repo.findByCode).not.toHaveBeenCalled();
    await expect(useCase.execute(scope, 'short-video')).rejects.toMatchObject({
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
      reasonKey: 'zone_archived',
    });
  });

  it('rejects a selection outside the owner scope as not found', async () => {
    const repo = { findByCode: vi.fn().mockResolvedValue(null) };

    await expect(new ResolveActiveZoneUseCase(repo as never).execute(scope, 'short-video'))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND, reasonKey: 'zone_not_found' });
  });

  it('rejects a blank selection instead of treating it as an omitted zone', async () => {
    const repo = { findByCode: vi.fn() };

    await expect(new ResolveActiveZoneUseCase(repo as never).execute(scope, '   '))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR, reasonKey: 'zone_code_invalid' });
    expect(repo.findByCode).not.toHaveBeenCalled();
  });
});
