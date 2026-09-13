import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedContext } from '../../common/auth/auth-context';
import { ErrorCode } from '../../common/errors/error-codes';
import { RenewDedicatedLineUseCase } from './renew-dedicated-line.use-case';

const ctx: AuthenticatedContext = {
  siteId: 'site-1',
  tenantId: 'tenant-1',
  ownerType: 'USER',
  ownerId: 'user-1',
  scopes: [],
  requestId: 'request-1',
};

describe('RenewDedicatedLineUseCase', () => {
  it.each(['', '   '])('rejects blank zoneCode %j before reading renewal state', async (zoneCode) => {
    const resolveZone = { execute: vi.fn() };
    const useCase = new RenewDedicatedLineUseCase(
      {} as never,
      {} as never,
      {} as never,
      resolveZone as never,
    );

    await expect(useCase.execute(ctx, 'line-1', {
      durationDays: 30,
      idempotencyKey: 'renewal-1',
      zoneCode,
    })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      reasonKey: 'zone_code_invalid',
    });
    expect(resolveZone.execute).not.toHaveBeenCalled();
  });
});
