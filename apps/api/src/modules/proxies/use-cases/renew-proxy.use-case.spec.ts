import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuthenticatedContext } from '../../../common/auth/auth-context';
import { ConfigService } from '../../../common/config/config.service';
import { ProxyLifecycleService } from '../proxy-lifecycle.service';
import { ProxyInstance } from '../proxies.repository';
import { RenewProxyUseCase } from './renew-proxy.use-case';

const ctx = { ownerId: 'user-1', siteId: 'site-1', tenantId: 'tenant-1' } as AuthenticatedContext;

function build(flag: 'true' | 'false') {
  const lifecycle = { execute: vi.fn().mockResolvedValue({ id: 'proxy-1' } as ProxyInstance) };
  const config = { get: vi.fn().mockReturnValue(flag) };
  return {
    lifecycle,
    useCase: new RenewProxyUseCase(
      lifecycle as unknown as ProxyLifecycleService,
      config as unknown as ConfigService,
    ),
  };
}

describe('RenewProxyUseCase legacy static proxy gate', () => {
  it('rejects renewal with PRODUCT_DISABLED before touching the lifecycle service when disabled', async () => {
    const { lifecycle, useCase } = build('false');

    await expect(useCase.execute(ctx, 'proxy-1', 30, 'key-1')).rejects.toThrowError(
      new AppError(ErrorCode.PRODUCT_DISABLED, 'static_proxy_purchase_disabled', 410),
    );
    expect(lifecycle.execute).not.toHaveBeenCalled();
  });

  it('renews normally once the legacy switch is turned back on', async () => {
    const { lifecycle, useCase } = build('true');

    await expect(useCase.execute(ctx, 'proxy-1', 30, 'key-1')).resolves.toEqual({ id: 'proxy-1' });
    expect(lifecycle.execute).toHaveBeenCalledWith({
      proxyId: 'proxy-1',
      ctx,
      action: 'renew',
      durationDays: 30,
      idempotencyKey: 'key-1',
    });
  });
});
